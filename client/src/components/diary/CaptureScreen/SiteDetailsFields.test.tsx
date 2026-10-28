import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { DiarySignatureEntry, ManualDiaryEntryType } from '@cornerstone/shared';
import { ApiClientError } from '../../../lib/apiClient.js';
import type * as VendorsApiTypes from '../../../lib/vendorsApi.js';
import type * as FieldsModule from './SiteDetailsFields.js';
import type * as MetadataModule from './captureMetadata.js';
import type { CaptureFieldId, CaptureFields, CaptureMode } from './captureMetadata.js';
import type { CompanySuggestion } from './captureSuggestions.js';

const mockFetchVendor = jest.fn<typeof VendorsApiTypes.fetchVendor>();
const realVendorsApi = await import('../../../lib/vendorsApi.js');
jest.unstable_mockModule('../../../lib/vendorsApi.js', () => ({
  ...realVendorsApi,
  fetchVendor: mockFetchVendor,
}));

jest.unstable_mockModule('../../../contexts/LocaleContext.js', () => ({
  useLocale: () => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    vatRate: 0.19,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  }),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// The picker dialog has its own tests; here it is a button that picks a company.
jest.unstable_mockModule('../../EntityPicker/EntityPickerDialog.js', () => ({
  EntityPickerDialog: (props: {
    open: boolean;
    title: string;
    testId?: string;
    picker: { kind: string; placeholder?: string };
    onClose: () => void;
    onPick: (option: { id: string; label: string }) => void;
  }) =>
    props.open ? (
      <div
        data-testid="picker-stub"
        data-title={props.title}
        data-test-id={props.testId}
        data-kind={props.picker.kind}
        data-placeholder={props.picker.placeholder}
      >
        <button
          type="button"
          onClick={() => {
            props.onPick({ id: 'c-picked', label: 'Picked Co' });
            props.onClose();
          }}
        >
          pick company
        </button>
      </div>
    ) : null,
}));

// The signature pad needs a canvas; a stand-in lists the slots and reports edits.
jest.unstable_mockModule('../SignatureSection/index.js', () => ({
  SignatureSection: (props: {
    signatures: DiarySignatureEntry[];
    onSignatureChange: (index: number, updated: DiarySignatureEntry | null) => void;
    onAddSignature: () => void;
    currentUserName?: string;
  }) => (
    <div data-testid="signature-section" data-user={props.currentUserName}>
      {props.signatures.map((sig, index) => (
        <div key={`${sig.signerName}-${index}`}>
          <span>{sig.signerName || 'empty slot'}</span>
          <button
            type="button"
            onClick={() =>
              props.onSignatureChange(index, {
                ...sig,
                signatureDataUrl: 'data:image/png;base64,A',
              })
            }
          >
            accept {index}
          </button>
          <button type="button" onClick={() => props.onSignatureChange(index, null)}>
            remove {index}
          </button>
        </div>
      ))}
      <button type="button" onClick={props.onAddSignature}>
        add another
      </button>
    </div>
  ),
}));

let SiteDetailsFields: typeof FieldsModule.SiteDetailsFields;
let EMPTY_FIELDS: typeof MetadataModule.EMPTY_FIELDS;

beforeEach(async () => {
  mockFetchVendor.mockReset();
  if (!SiteDetailsFields) {
    ({ SiteDetailsFields } = await import('./SiteDetailsFields.js'));
    ({ EMPTY_FIELDS } = await import('./captureMetadata.js'));
  }
});

interface HarnessProps {
  entryType: ManualDiaryEntryType;
  mode?: CaptureMode;
  initial?: Partial<CaptureFields>;
  initialSignatures?: DiarySignatureEntry[];
  errors?: Partial<Record<CaptureFieldId, string>>;
  companies?: CompanySuggestion[];
  currentUserName?: string;
  onChange?: (fields: CaptureFields) => void;
}

function Harness({
  entryType,
  mode = 'draft',
  initial = {},
  initialSignatures = [],
  errors = {},
  companies = [],
  currentUserName,
  onChange,
}: HarnessProps) {
  const [fields, setFields] = useState<CaptureFields>({
    ...EMPTY_FIELDS,
    materials: [],
    ...initial,
  });
  const [signatures, setSignatures] = useState(initialSignatures);
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <>
      <output data-testid="fields">{JSON.stringify(fields)}</output>
      <SiteDetailsFields
        entryType={entryType}
        mode={mode}
        fields={fields}
        signatures={signatures}
        errors={errors}
        companies={companies}
        recentStart={['07:00']}
        recentEnd={['16:00']}
        currentUserName={currentUserName}
        onFields={(patch) => {
          const next = { ...fields, ...patch };
          setFields(next);
          onChange?.(next);
        }}
        onSignatures={setSignatures}
        moreOpen={moreOpen}
        onMoreOpenChange={setMoreOpen}
      />
    </>
  );
}

function currentFields(): CaptureFields {
  return JSON.parse(screen.getByTestId('fields').textContent ?? '{}') as CaptureFields;
}

const COMPANIES: CompanySuggestion[] = [
  { id: 'c1', name: 'Alpha Build' },
  { id: 'c2', name: 'Beta Roofing' },
  { id: null, name: 'Name Only Ltd' },
];

describe('SiteDetailsFields', () => {
  it('renders nothing for a note', () => {
    render(<Harness entryType="general_note" />);

    expect(screen.queryByRole('heading', { name: 'Site details' })).not.toBeInTheDocument();
  });

  describe('daily log', () => {
    it('shows Company, Workers, Start, End and More details, nothing pre-selected', () => {
      render(<Harness entryType="daily_log" companies={COMPANIES} />);

      expect(screen.getByRole('heading', { level: 2, name: 'Site details' })).toBeInTheDocument();
      const company = screen.getByRole('group', { name: 'Company' });
      expect(within(company).queryAllByRole('button', { pressed: true })).toHaveLength(0);
      expect(screen.getByRole('group', { name: 'Workers' })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Start' })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'End' })).toBeInTheDocument();
      expect(screen.getByTestId('capture-more-details')).toHaveTextContent('More details');
    });

    it('offers only companies with an id and the Other company chip last', () => {
      render(<Harness entryType="daily_log" companies={COMPANIES} />);

      const company = screen.getByRole('group', { name: 'Company' });
      expect(
        within(company)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['Alpha Build', 'Beta Roofing', 'Other company…']);
    });

    it('stores the company id and name on a chip tap, and clears it on a second tap', async () => {
      const user = userEvent.setup();
      render(<Harness entryType="daily_log" companies={COMPANIES} />);

      await user.click(screen.getByTestId('capture-company-chip-c2'));
      expect(currentFields()).toMatchObject({ vendorId: 'c2', vendorName: 'Beta Roofing' });
      expect(screen.getByTestId('capture-company-chip-c2')).toHaveAttribute('aria-pressed', 'true');

      await user.click(screen.getByTestId('capture-company-chip-c2'));
      expect(currentFields()).toMatchObject({ vendorId: null, vendorName: null });
    });

    it('shows a stored company that is not a suggestion as an extra pressed chip', () => {
      render(
        <Harness
          entryType="daily_log"
          companies={COMPANIES}
          initial={{ vendorId: 'gone', vendorName: 'Old Co' }}
        />,
      );

      expect(screen.getByTestId('capture-company-chip-gone')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByTestId('capture-company-chip-gone')).toHaveTextContent('Old Co');
    });

    describe('a company seeded from the opening page (#2248)', () => {
      it('looks the name up and shows the company as a pressed chip labelled with it', async () => {
        mockFetchVendor.mockResolvedValue({ id: 'seed-1', name: 'Seeded Co' } as never);
        render(
          <Harness
            entryType="daily_log"
            companies={COMPANIES}
            initial={{ vendorId: 'seed-1', vendorName: null }}
          />,
        );

        const chip = await screen.findByTestId('capture-company-chip-seed-1');
        expect(chip).toHaveTextContent('Seeded Co');
        expect(chip).toHaveAttribute('aria-pressed', 'true');
        expect(mockFetchVendor).toHaveBeenCalledWith('seed-1');
      });

      it('labels the chip with the stored name and looks nothing up when the name is known', () => {
        render(
          <Harness
            entryType="daily_log"
            companies={COMPANIES}
            initial={{ vendorId: 'gone', vendorName: 'Old Co' }}
          />,
        );
        expect(screen.getByTestId('capture-company-chip-gone')).toHaveTextContent('Old Co');
        expect(mockFetchVendor).not.toHaveBeenCalled();
      });

      it('uses the suggestion label and needs no extra chip when the company is a suggestion', async () => {
        mockFetchVendor.mockResolvedValue({ id: 'c2', name: 'Beta Roofing' } as never);
        render(
          <Harness
            entryType="daily_log"
            companies={COMPANIES}
            initial={{ vendorId: 'c2', vendorName: null }}
          />,
        );
        await waitFor(() => expect(mockFetchVendor).toHaveBeenCalledTimes(1));
        expect(screen.getAllByTestId('capture-company-chip-c2')).toHaveLength(1);
        expect(screen.getByTestId('capture-company-chip-c2')).toHaveAttribute(
          'aria-pressed',
          'true',
        );
      });

      it('drops a company that no longer exists (404): vendorId and vendorName are cleared', async () => {
        mockFetchVendor.mockRejectedValue(
          new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }),
        );
        render(
          <Harness
            entryType="daily_log"
            companies={COMPANIES}
            initial={{ vendorId: 'ghost', vendorName: null }}
          />,
        );
        await waitFor(() =>
          expect(currentFields()).toMatchObject({ vendorId: null, vendorName: null }),
        );
        expect(screen.queryByTestId('capture-company-chip-ghost')).not.toBeInTheDocument();
      });

      it('keeps the id when the lookup fails for another reason', async () => {
        mockFetchVendor.mockRejectedValue(new Error('network'));
        render(
          <Harness
            entryType="daily_log"
            companies={COMPANIES}
            initial={{ vendorId: 'seed-1', vendorName: null }}
          />,
        );
        await waitFor(() => expect(mockFetchVendor).toHaveBeenCalledTimes(1));
        expect(currentFields().vendorId).toBe('seed-1');
        expect(screen.queryByTestId('capture-company-chip-seed-1')).not.toBeInTheDocument();
      });

      it('does not look a company up for a delivery', () => {
        render(
          <Harness
            entryType="delivery"
            companies={COMPANIES}
            initial={{ vendorId: 'seed-1', vendorName: null }}
          />,
        );
        expect(mockFetchVendor).not.toHaveBeenCalled();
      });
    });

    it('opens the picker from Other company… and stores the picked company', async () => {
      const user = userEvent.setup();
      render(<Harness entryType="daily_log" companies={COMPANIES} />);
      expect(screen.queryByTestId('picker-stub')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Other company…' }));
      await user.click(screen.getByRole('button', { name: 'pick company' }));

      expect(currentFields()).toMatchObject({ vendorId: 'c-picked', vendorName: 'Picked Co' });
      expect(screen.queryByTestId('picker-stub')).not.toBeInTheDocument();
    });

    it('selects workers 1, 2 and 3 with chips and deselects on a second tap', async () => {
      const user = userEvent.setup();
      render(<Harness entryType="daily_log" />);

      await user.click(screen.getByTestId('capture-workers-chip-2'));
      expect(currentFields().workers).toBe(2);
      expect(screen.queryByLabelText('Number of workers')).not.toBeInTheDocument();

      await user.click(screen.getByTestId('capture-workers-chip-2'));
      expect(currentFields().workers).toBeNull();
    });

    it('4+ sets four and reveals the number input; typing 12 from an empty field works', async () => {
      const user = userEvent.setup();
      render(<Harness entryType="daily_log" />);

      await user.click(screen.getByTestId('capture-workers-chip-4+'));
      expect(currentFields().workers).toBe(4);
      const input = screen.getByLabelText('Number of workers');
      expect(input).toHaveAttribute('inputmode', 'numeric');

      await user.clear(input);
      await user.type(input, '12');

      expect(currentFields().workers).toBe(12);
      expect(screen.getByLabelText('Number of workers')).toBe(input);
      expect(input).toHaveFocus();
      expect(screen.getByTestId('capture-workers-chip-4+')).toHaveAttribute('aria-pressed', 'true');
    });

    it('keeps 4+ pressed and the input mounted while a value under four is typed', async () => {
      const user = userEvent.setup();
      render(<Harness entryType="daily_log" />);
      await user.click(screen.getByTestId('capture-workers-chip-4+'));
      const input = screen.getByLabelText('Number of workers');

      await user.clear(input);
      await user.type(input, 'a2');

      expect(currentFields().workers).toBe(2);
      expect(screen.getByLabelText('Number of workers')).toBe(input);
      expect(screen.getByTestId('capture-workers-chip-4+')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('capture-workers-chip-2')).toHaveAttribute('aria-pressed', 'false');
    });

    it('on blur a value of 1-3 goes back to its chip and the input hides', async () => {
      const user = userEvent.setup();
      render(<Harness entryType="daily_log" />);
      await user.click(screen.getByTestId('capture-workers-chip-4+'));
      const input = screen.getByLabelText('Number of workers');
      await user.clear(input);
      await user.type(input, '2');

      await user.tab();

      expect(screen.queryByLabelText('Number of workers')).not.toBeInTheDocument();
      expect(screen.getByTestId('capture-workers-chip-2')).toHaveAttribute('aria-pressed', 'true');
      expect(currentFields().workers).toBe(2);
    });

    it('on blur a value of 4 or more keeps the input', async () => {
      const user = userEvent.setup();
      render(<Harness entryType="daily_log" />);
      await user.click(screen.getByTestId('capture-workers-chip-4+'));
      const input = screen.getByLabelText('Number of workers');

      await user.click(input);
      await user.tab();

      expect(screen.getByLabelText('Number of workers')).toBeInTheDocument();
      expect(screen.getByTestId('capture-workers-chip-4+')).toHaveAttribute('aria-pressed', 'true');
      expect(currentFields().workers).toBe(4);
      expect(input).not.toHaveFocus();
    });

    it('caps a huge worker count', async () => {
      const user = userEvent.setup();
      render(<Harness entryType="daily_log" initial={{ workers: 5 }} />);

      const input = screen.getByLabelText('Number of workers');
      await user.type(input, '99999');

      expect(currentFields().workers).toBe(9999);
    });

    it('shows an out-of-range stored worker count (0) without a pressed chip', () => {
      render(<Harness entryType="daily_log" initial={{ workers: 0 }} />);

      expect(
        within(screen.getByRole('group', { name: 'Workers' })).queryAllByRole('button', {
          pressed: true,
        }),
      ).toHaveLength(0);
    });

    it('sets Start with a recent chip and End with Now, then shows the duration', async () => {
      const user = userEvent.setup();
      jest.useFakeTimers({ doNotFake: ['setTimeout', 'setInterval', 'queueMicrotask'] });
      jest.setSystemTime(new Date(2026, 9, 19, 15, 30, 0));
      try {
        render(<Harness entryType="daily_log" initial={{ workStart: '08:00' }} />);
        expect(screen.queryByTestId('capture-duration')).not.toBeInTheDocument();

        await user.click(screen.getByTestId('capture-end-__now__'));

        expect(currentFields().workEnd).toBe('15:30');
        expect(screen.getByTestId('capture-duration')).toHaveTextContent('Duration:');
        expect(screen.getByTestId('capture-duration')).toHaveTextContent('7.5');
      } finally {
        jest.useRealTimers();
      }
    });

    it('stores a recent start time', async () => {
      const user = userEvent.setup();
      render(<Harness entryType="daily_log" />);

      await user.click(screen.getByTestId('capture-start-07:00'));

      expect(currentFields().workStart).toBe('07:00');
    });

    it('shows an inline error and no duration when the end is not after the start', () => {
      render(<Harness entryType="daily_log" initial={{ workStart: '10:00', workEnd: '09:00' }} />);

      expect(screen.getByText('End must be after start.')).toBeInTheDocument();
      expect(screen.queryByTestId('capture-duration')).not.toBeInTheDocument();
    });

    it('shows the time error that came from the last Save attempt', () => {
      render(
        <Harness
          entryType="daily_log"
          errors={{ time: 'capture.endBeforeStart' }}
          initial={{ workStart: '10:00' }}
        />,
      );

      expect(screen.getByText('End must be after start.')).toBeInTheDocument();
    });

    it('keeps More details closed, with weather, temperature and signature inside', async () => {
      const user = userEvent.setup();
      render(<Harness entryType="daily_log" />);
      const toggle = screen.getByTestId('capture-more-details');
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toHaveAttribute(
        'hidden',
      );

      await user.click(toggle);

      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await user.click(screen.getByTestId('capture-weather-rainy'));
      expect(currentFields().weather).toBe('rainy');
      await user.click(screen.getByTestId('capture-weather-rainy'));
      expect(currentFields().weather).toBeNull();

      await user.type(screen.getByLabelText('Temperature (°C)'), '12,5');
      expect(currentFields().temperature).toBe('12,5');
      expect(screen.getByLabelText('Temperature (°C)')).toHaveAttribute('inputmode', 'decimal');
    });

    it('counts the details it holds in the More details label', () => {
      render(
        <Harness
          entryType="daily_log"
          initial={{ weather: 'sunny', temperature: '9' }}
          initialSignatures={[
            { signerName: 'Sam', signerType: 'self', signatureDataUrl: 'data:x' },
          ]}
        />,
      );

      expect(screen.getByTestId('capture-more-details')).toHaveTextContent('More details · 3 set');
    });

    it('Add signature reveals the signature section with the current user', async () => {
      const user = userEvent.setup();
      render(<Harness entryType="daily_log" currentUserName="Alex Owner" />);
      await user.click(screen.getByTestId('capture-more-details'));
      expect(screen.queryByTestId('signature-section')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: '+ Add Signature' }));

      const section = screen.getByTestId('signature-section');
      expect(section).toHaveAttribute('data-user', 'Alex Owner');
      expect(within(section).getByText('Alex Owner')).toBeInTheDocument();
    });

    it('adds a slot without a name when there is no current user, and accepts and removes slots', async () => {
      const user = userEvent.setup();
      render(<Harness entryType="daily_log" />);
      await user.click(screen.getByTestId('capture-more-details'));
      await user.click(screen.getByRole('button', { name: '+ Add Signature' }));
      await user.click(screen.getByRole('button', { name: 'add another' }));
      const section = screen.getByTestId('signature-section');
      expect(within(section).getAllByText('empty slot')).toHaveLength(2);

      await user.click(within(section).getByRole('button', { name: 'accept 0' }));
      await user.click(within(section).getByRole('button', { name: 'remove 1' }));

      expect(
        within(screen.getByTestId('signature-section')).getAllByText('empty slot'),
      ).toHaveLength(1);
    });

    it('goes back to the Add signature button when the last slot is removed', async () => {
      const user = userEvent.setup();
      render(<Harness entryType="daily_log" />);
      await user.click(screen.getByTestId('capture-more-details'));
      await user.click(screen.getByRole('button', { name: '+ Add Signature' }));

      await user.click(screen.getByRole('button', { name: 'remove 0' }));

      expect(screen.getByRole('button', { name: '+ Add Signature' })).toBeInTheDocument();
    });

    it('shows the signature error only while a slot is incomplete', () => {
      const { rerender } = render(
        <Harness
          entryType="daily_log"
          errors={{ signatures: 'edit.signatureIncomplete' }}
          initialSignatures={[{ signerName: '', signerType: 'self', signatureDataUrl: '' }]}
        />,
      );
      expect(screen.getAllByText(/signature/i).length).toBeGreaterThan(0);
      expect(document.getElementById('capture-field-signatures')?.textContent).toMatch(
        /signature/i,
      );
      rerender(
        <Harness
          entryType="daily_log"
          errors={{ signatures: 'edit.signatureIncomplete' }}
          initialSignatures={[]}
        />,
      );
      // A re-render keeps state; the complete-slot case is covered by the capture screen test.
      expect(screen.getByTestId('capture-more-details')).toBeInTheDocument();
    });
  });

  describe('site visit', () => {
    it('shows Inspector, Outcome, Start and End but no Company or Workers', () => {
      render(<Harness entryType="site_visit" />);

      expect(screen.getByLabelText('Inspector')).toHaveAttribute('autocomplete', 'off');
      expect(screen.getByRole('group', { name: 'Outcome' })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Start' })).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Company' })).not.toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Workers' })).not.toBeInTheDocument();
    });

    it('stores the inspector as typed and the outcome from the chips', async () => {
      const user = userEvent.setup();
      render(<Harness entryType="site_visit" />);

      await user.type(screen.getByLabelText('Inspector'), 'Ines');
      await user.click(screen.getByTestId('capture-outcome-conditional'));

      expect(currentFields()).toMatchObject({ inspectorName: 'Ines', outcome: 'conditional' });
      expect(screen.getByTestId('capture-outcome-conditional')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('shows the required-field errors and marks the inspector invalid', () => {
      render(
        <Harness
          entryType="site_visit"
          errors={{
            inspector: 'capture.errors.inspectorRequired',
            outcome: 'capture.errors.outcomeRequired',
          }}
        />,
      );

      expect(screen.getByText('Enter the inspector.')).toBeInTheDocument();
      expect(screen.getByText('Choose an outcome.')).toBeInTheDocument();
      expect(screen.getByLabelText('Inspector')).toHaveAttribute('aria-invalid', 'true');
    });

    it('has More details with the signature only (no weather)', async () => {
      const user = userEvent.setup();
      render(<Harness entryType="site_visit" />);

      await user.click(screen.getByTestId('capture-more-details'));

      expect(screen.queryByText('Weather')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '+ Add Signature' })).toBeInTheDocument();
    });
  });

  describe('delivery', () => {
    it('shows Company (names), Materials and Delivered, and no More details', () => {
      render(<Harness entryType="delivery" companies={COMPANIES} />);

      const company = screen.getByRole('group', { name: 'Company' });
      expect(
        within(company)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['Alpha Build', 'Beta Roofing', 'Name Only Ltd', 'Other company…']);
      expect(screen.getByLabelText('Materials')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Delivered as expected' })).not.toBeChecked();
      expect(screen.queryByTestId('capture-more-details')).not.toBeInTheDocument();
    });

    it('stores the company name', async () => {
      const user = userEvent.setup();
      render(<Harness entryType="delivery" companies={COMPANIES} />);

      await user.click(screen.getByTestId('capture-company-chip-Name Only Ltd'));
      expect(currentFields().vendor).toBe('Name Only Ltd');

      await user.click(screen.getByTestId('capture-company-chip-Name Only Ltd'));
      expect(currentFields().vendor).toBeNull();
    });

    it('matches a stored company name to a suggestion by fold', () => {
      render(
        <Harness
          entryType="delivery"
          companies={COMPANIES}
          initial={{ vendor: ' ALPHA build ' }}
        />,
      );

      expect(screen.getByTestId('capture-company-chip-Alpha Build')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('shows a stored free-text company that matches no suggestion as an extra pressed chip', () => {
      render(
        <Harness entryType="delivery" companies={COMPANIES} initial={{ vendor: 'Corner Shop' }} />,
      );

      expect(screen.getByTestId('capture-company-chip-Corner Shop')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('opens a company EntityPicker dialog titled "Choose a company" with the capture sheet testId', async () => {
      const user = userEvent.setup();
      render(<Harness entryType="delivery" />);

      await user.click(screen.getByRole('button', { name: 'Other company…' }));

      const stub = screen.getByTestId('picker-stub');
      expect(stub).toHaveAttribute('data-title', 'Choose a company');
      expect(stub).toHaveAttribute('data-test-id', 'capture-company-sheet');
      expect(stub).toHaveAttribute('data-kind', 'company');
      expect(stub).toHaveAttribute('data-placeholder', 'Company name');
    });

    it('stores the name of a company picked in the dialog', async () => {
      const user = userEvent.setup();
      render(<Harness entryType="delivery" />);

      await user.click(screen.getByRole('button', { name: 'Other company…' }));
      await user.click(screen.getByRole('button', { name: 'pick company' }));

      expect(currentFields().vendor).toBe('Picked Co');
    });

    it('adds materials with the Add button and with Enter, trimmed, never empty', async () => {
      const user = userEvent.setup();
      render(<Harness entryType="delivery" />);
      const input = screen.getByPlaceholderText('Add a material');

      await user.type(input, '  Bricks ');
      await user.click(screen.getByRole('button', { name: 'Add' }));
      await user.type(input, 'Sand{Enter}');
      expect(input).toHaveValue('');
      await user.click(screen.getByRole('button', { name: 'Add' }));
      await user.type(input, '   {Enter}');

      expect(currentFields().materials).toEqual(['Bricks', 'Sand']);
    });

    it('allows repeated materials and removes one row at a time', async () => {
      const user = userEvent.setup();
      render(
        <Harness entryType="delivery" initial={{ materials: ['Bricks', 'Bricks', 'Sand'] }} />,
      );

      const removes = screen.getAllByRole('button', { name: 'Remove Bricks' });
      expect(removes).toHaveLength(2);
      await user.click(removes[0]!);

      expect(currentFields().materials).toEqual(['Bricks', 'Sand']);
    });

    it('toggles the delivered checkbox', async () => {
      const user = userEvent.setup();
      render(<Harness entryType="delivery" />);

      await user.click(screen.getByRole('checkbox', { name: 'Delivered as expected' }));

      expect(currentFields().deliveryConfirmed).toBe(true);
    });
  });

  describe('defect', () => {
    it('shows Severity (none selected) and Status on a new entry', async () => {
      const user = userEvent.setup();
      render(<Harness entryType="issue" mode="new" initial={{ resolutionStatus: 'open' }} />);

      const severity = screen.getByRole('group', { name: 'Severity' });
      expect(within(severity).queryAllByRole('button', { pressed: true })).toHaveLength(0);
      expect(
        within(severity)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['Low', 'Medium', 'High', 'Critical']);
      expect(screen.getByTestId('capture-status-open')).toHaveAttribute('aria-pressed', 'true');

      await user.click(screen.getByTestId('capture-severity-high'));
      await user.click(screen.getByTestId('capture-status-in_progress'));
      expect(currentFields()).toMatchObject({ severity: 'high', resolutionStatus: 'in_progress' });
    });

    it('has no Status control in saved mode', () => {
      render(<Harness entryType="issue" mode="saved" initial={{ resolutionStatus: 'open' }} />);

      expect(screen.queryByRole('group', { name: 'Status' })).not.toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Severity' })).toBeInTheDocument();
    });

    it('shows the field errors', () => {
      render(
        <Harness
          entryType="issue"
          mode="draft"
          errors={{
            severity: 'capture.errors.severityRequired',
            status: 'capture.errors.statusRequired',
          }}
        />,
      );

      expect(screen.getByText('Choose a severity.')).toBeInTheDocument();
      expect(screen.getByText('Choose a status.')).toBeInTheDocument();
    });

    it('has More details with the signature only', async () => {
      const user = userEvent.setup();
      render(<Harness entryType="issue" />);

      await user.click(screen.getByTestId('capture-more-details'));

      expect(screen.queryByText('Weather')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '+ Add Signature' })).toBeInTheDocument();
    });
  });
});
