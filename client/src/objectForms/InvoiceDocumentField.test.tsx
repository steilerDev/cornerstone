/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { ObjectFormRenderContext, ObjectFormValues } from '../components/ObjectForm/types.js';
import type { DocumentIntegration } from '../hooks/useDocumentIntegration.js';
import type * as VendorsApiTypes from '../lib/vendorsApi.js';
import type * as PaperlessApiTypes from '../lib/paperlessApi.js';
import type * as FieldTypes from './InvoiceDocumentField.js';

jest.unstable_mockModule('../contexts/LocaleContext.js', () => {
  const localeValue = {
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  };
  return {
    LocaleProvider: ({ children }: { children: unknown }) => children,
    useLocale: () => localeValue,
  };
});

const mockSearchCompanies = jest.fn<typeof VendorsApiTypes.searchCompanies>();
jest.unstable_mockModule('../lib/vendorsApi.js', () => ({
  searchCompanies: mockSearchCompanies,
  fetchVendor: jest.fn(),
}));
const mockListPaperlessDocuments = jest.fn<typeof PaperlessApiTypes.listPaperlessDocuments>();
const mockGetPaperlessDocument = jest.fn<typeof PaperlessApiTypes.getPaperlessDocument>();
jest.unstable_mockModule('../lib/paperlessApi.js', () => ({
  listPaperlessDocuments: mockListPaperlessDocuments,
  getPaperlessDocument: mockGetPaperlessDocument,
}));
jest.unstable_mockModule('../lib/documentLinksApi.js', () => ({
  listAllLinkedDocumentIds: jest.fn(() => Promise.resolve([])),
}));

const ON: DocumentIntegration = { loaded: true, status: null, available: true, llmEnabled: false };
const AI: DocumentIntegration = { ...ON, llmEnabled: true };

const TODAY = '2026-06-15';

interface Doc {
  id: number;
  title: string;
  correspondent: string | null;
  created: string | null;
}
const ROOF: Doc = {
  id: 7,
  title: 'Roof quote',
  correspondent: 'Acme Roofing',
  created: '2026-04-02',
};

describe('InvoiceDocumentField', () => {
  let Field: typeof FieldTypes.InvoiceDocumentField;
  const onPicked = jest.fn<(title: string) => void>();
  const onPendingConsumed = jest.fn<() => void>();
  const setValueSpy = jest.fn<(value: unknown) => void>();
  const announcements: Array<{ patch: ObjectFormValues; text?: string }> = [];

  beforeEach(async () => {
    mockSearchCompanies.mockReset();
    mockListPaperlessDocuments.mockReset();
    mockGetPaperlessDocument.mockReset();
    onPicked.mockReset();
    onPendingConsumed.mockReset();
    announcements.length = 0;
    setValueSpy.mockReset();
    mockSearchCompanies.mockResolvedValue([{ id: 'v-1', name: 'Acme Roofing' }] as never);
    mockListPaperlessDocuments.mockResolvedValue({ documents: [ROOF] } as never);
    if (!Field) ({ InvoiceDocumentField: Field } = await import('./InvoiceDocumentField.js'));
  });

  function Host({
    integration = ON,
    initial = {},
    pendingDocumentId,
    label = '',
  }: {
    integration?: DocumentIntegration;
    initial?: ObjectFormValues;
    pendingDocumentId?: number;
    label?: string;
  }) {
    const [values, setValuesState] = useState<ObjectFormValues>({
      paperlessDocumentId: '',
      vendorId: '',
      date: TODAY,
      notes: '',
      ...initial,
    });
    const ctx: ObjectFormRenderContext = {
      id: 'paperlessDocumentId',
      value: values.paperlessDocumentId,
      setValue: (value) => {
        setValueSpy(value);
        setValuesState((prev) => ({ ...prev, paperlessDocumentId: value }));
      },
      setValues: (patch, text) => {
        announcements.push({ patch, text });
        setValuesState((prev) => ({ ...prev, ...patch }));
      },
      busy: false,
      invalid: false,
      describedBy: undefined,
      createChild: () => {},
      values,
    };
    return (
      <MemoryRouter>
        <Field
          ctx={ctx}
          integration={integration}
          pendingDocumentId={pendingDocumentId}
          onPendingConsumed={onPendingConsumed}
          defaultDate={TODAY}
          label={label}
          onPicked={onPicked}
        />
        <output data-testid="values">{JSON.stringify(values)}</output>
      </MemoryRouter>
    );
  }

  const values = () => JSON.parse(screen.getByTestId('values').textContent!) as ObjectFormValues;
  const input = () => screen.getByRole('textbox');

  async function pick(user: ReturnType<typeof userEvent.setup>, name = /Roof quote/) {
    await user.click(input());
    await user.click(await screen.findByRole('option', { name }));
  }

  describe('picking a document', () => {
    it('stores the id, tells the host the title and fills company, date and notes', async () => {
      const user = userEvent.setup();
      render(<Host />);

      await pick(user);

      await waitFor(() =>
        expect(values()).toMatchObject({
          paperlessDocumentId: '7',
          vendorId: 'v-1',
          date: '2026-04-02',
          notes: 'Roof quote',
        }),
      );
      expect(onPicked).toHaveBeenCalledWith('Roof quote');
      expect(announcements).toEqual([
        {
          patch: { vendorId: 'v-1', date: '2026-04-02', notes: 'Roof quote' },
          text: 'Filled from Roof quote.',
        },
      ]);
    });

    it('never overwrites a company or notes the user already filled in', async () => {
      const user = userEvent.setup();
      render(<Host initial={{ vendorId: 'v-9', notes: 'My own note' }} />);

      await pick(user);

      await waitFor(() => expect(announcements).toHaveLength(1));
      expect(values()).toMatchObject({ vendorId: 'v-9', notes: 'My own note' });
      expect(announcements[0]!.patch).toEqual({ date: '2026-04-02' });
    });

    it('replaces the date only while it is empty or still the generated default', async () => {
      const user = userEvent.setup();
      render(<Host initial={{ date: '2026-01-01' }} />);

      await pick(user);

      await waitFor(() => expect(announcements).toHaveLength(1));
      expect(values().date).toBe('2026-01-01');
      expect(announcements[0]!.patch).not.toHaveProperty('date');
    });

    it('fills an empty date', async () => {
      const user = userEvent.setup();
      render(<Host initial={{ date: '' }} />);

      await pick(user);

      await waitFor(() => expect(values().date).toBe('2026-04-02'));
    });

    it.each([
      ['has no creation date', { ...ROOF, created: null }],
      ['has a malformed creation date', { ...ROOF, created: '02.04.2026' }],
    ])('keeps the date when the document %s', async (_name, doc) => {
      const user = userEvent.setup();
      mockListPaperlessDocuments.mockResolvedValue({ documents: [doc] } as never);
      render(<Host />);

      await pick(user);

      await waitFor(() => expect(announcements).toHaveLength(1));
      expect(values().date).toBe(TODAY);
    });

    it('fills no company when the document has no correspondent (and does not look one up)', async () => {
      const user = userEvent.setup();
      mockListPaperlessDocuments.mockResolvedValue({
        documents: [{ ...ROOF, correspondent: null }],
      } as never);
      render(<Host />);

      await pick(user);

      await waitFor(() => expect(announcements).toHaveLength(1));
      expect(mockSearchCompanies).not.toHaveBeenCalled();
      expect(values().vendorId).toBe('');
    });

    it('fills no company when two companies match the correspondent', async () => {
      const user = userEvent.setup();
      mockSearchCompanies.mockResolvedValue([
        { id: 'v-1', name: 'Acme Roofing' },
        { id: 'v-2', name: 'ACME ROOFING' },
      ] as never);
      render(<Host />);

      await pick(user);

      await waitFor(() => expect(announcements).toHaveLength(1));
      expect(values().vendorId).toBe('');
    });

    it('fills no company when none matches exactly', async () => {
      const user = userEvent.setup();
      mockSearchCompanies.mockResolvedValue([
        { id: 'v-1', name: 'Acme Roofing Supplies' },
      ] as never);
      render(<Host />);

      await pick(user);

      await waitFor(() => expect(announcements).toHaveLength(1));
      expect(values().vendorId).toBe('');
    });
  });

  describe('removing the document', () => {
    it('clears the id and the title but keeps the values it filled', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<Host />);
      await pick(user);
      await waitFor(() => expect(values().notes).toBe('Roof quote'));

      rerender(<Host label="Roof quote" initial={{ ...values() }} />);
      await user.click(await screen.findByRole('button', { name: 'Clear selection' }));

      await waitFor(() => expect(values().paperlessDocumentId).toBe(''));
      expect(onPicked).toHaveBeenLastCalledWith('');
      expect(values()).toMatchObject({ notes: 'Roof quote', vendorId: 'v-1', date: '2026-04-02' });
    });

    it('writes nothing when a slow company match settles after the document was removed', async () => {
      const user = userEvent.setup();
      let resolveCompanies!: (v: never) => void;
      mockSearchCompanies.mockReturnValue(new Promise((r) => (resolveCompanies = r as never)));
      render(<Host label="Roof quote" />);
      await pick(user);
      await waitFor(() => expect(values().paperlessDocumentId).toBe('7'));

      await user.click(await screen.findByRole('button', { name: 'Clear selection' }));
      await waitFor(() => expect(values().paperlessDocumentId).toBe(''));
      await act(async () => {
        resolveCompanies([{ id: 'v-1', name: 'Acme Roofing' }] as never);
      });

      expect(announcements).toEqual([]);
      expect(values()).toMatchObject({ vendorId: '', notes: '' });
    });

    it('writes only the latest document when a re-pick overtakes a slow company match', async () => {
      const user = userEvent.setup();
      const first: { resolve?: (v: never) => void } = {};
      mockListPaperlessDocuments.mockResolvedValue({
        documents: [ROOF, { ...ROOF, id: 8, title: 'Second doc', correspondent: 'Birch Tiling' }],
      } as never);
      mockSearchCompanies
        .mockReturnValueOnce(new Promise((r) => (first.resolve = r as never)))
        .mockResolvedValueOnce([{ id: 'v-2', name: 'Birch Tiling' }] as never);
      render(<Host label="Roof quote" />);
      await pick(user, /Roof quote/);
      await waitFor(() => expect(mockSearchCompanies).toHaveBeenCalledTimes(1));

      await user.click(await screen.findByRole('button', { name: 'Clear selection' }));
      await pick(user, /Second doc/);
      await waitFor(() => expect(announcements).toHaveLength(1));
      await act(async () => {
        first.resolve!([{ id: 'v-1', name: 'Acme Roofing' }] as never);
      });

      expect(announcements).toHaveLength(1);
      expect(values().vendorId).toBe('v-2');
    });
  });

  describe('a document from the URL', () => {
    it('applies the pending document once, when Paperless is available', async () => {
      mockGetPaperlessDocument.mockResolvedValue({ document: ROOF } as never);
      const { rerender } = render(<Host pendingDocumentId={7} />);

      await waitFor(() => expect(values().notes).toBe('Roof quote'));
      expect(onPendingConsumed).toHaveBeenCalledTimes(1);
      expect(mockGetPaperlessDocument).toHaveBeenCalledWith(7);

      rerender(<Host pendingDocumentId={7} initial={{ ...values() }} />);
      await act(async () => {});
      expect(mockGetPaperlessDocument).toHaveBeenCalledTimes(1);
    });

    it('waits while Paperless is not available', async () => {
      render(<Host integration={{ ...ON, available: false }} pendingDocumentId={7} />);
      await act(async () => {});
      expect(mockGetPaperlessDocument).not.toHaveBeenCalled();
      expect(onPendingConsumed).not.toHaveBeenCalled();
    });

    it('does nothing without a pending document', async () => {
      render(<Host />);
      await act(async () => {});
      expect(mockGetPaperlessDocument).not.toHaveBeenCalled();
    });

    it('shows the load error when the pending document cannot be opened, and fills nothing', async () => {
      mockGetPaperlessDocument.mockRejectedValue(new Error('gone'));
      render(<Host pendingDocumentId={7} />);

      expect(await screen.findByText("Couldn't open that document.")).toBeInTheDocument();
      expect(values().notes).toBe('');
    });

    it('clears the load error when a document is picked afterwards', async () => {
      const user = userEvent.setup();
      mockGetPaperlessDocument.mockRejectedValue(new Error('gone'));
      render(<Host pendingDocumentId={7} />);
      await screen.findByText("Couldn't open that document.");

      await pick(user);

      await waitFor(() => expect(screen.queryByText("Couldn't open that document.")).toBeNull());
    });
  });

  describe('the AI link', () => {
    it('shows only with the AI reader on and a document chosen, pointing at the review with the id', () => {
      render(<Host integration={AI} initial={{ paperlessDocumentId: '7' }} label="Roof quote" />);

      const link = screen.getByTestId('invoice-form-read-ai');
      expect(link).toHaveTextContent('Read amounts and lines with AI');
      expect(link).toHaveAttribute('href', '/budget/invoices/new/paperless?documentId=7');
      expect(
        screen.getByText('Opens the document review; this dialog closes.'),
      ).toBeInTheDocument();
    });

    it('is absent with the AI reader off', () => {
      render(<Host integration={ON} initial={{ paperlessDocumentId: '7' }} label="Roof quote" />);
      expect(screen.queryByTestId('invoice-form-read-ai')).toBeNull();
    });

    it('is absent before a document is chosen', () => {
      render(<Host integration={AI} />);
      expect(screen.queryByTestId('invoice-form-read-ai')).toBeNull();
    });
  });

  describe('a late answer for the pending document', () => {
    it('is ignored when the field was unmounted first', async () => {
      let resolveDoc!: (v: never) => void;
      mockGetPaperlessDocument.mockReturnValue(new Promise((r) => (resolveDoc = r as never)));
      const { unmount } = render(<Host pendingDocumentId={7} />);
      await waitFor(() => expect(mockGetPaperlessDocument).toHaveBeenCalledTimes(1));

      unmount();
      await act(async () => {
        resolveDoc({ document: ROOF } as never);
      });

      expect(setValueSpy).not.toHaveBeenCalled();
      expect(announcements).toEqual([]);
      expect(onPicked).not.toHaveBeenCalled();
    });

    it('is ignored when the user picked another document in the meantime', async () => {
      const user = userEvent.setup();
      let resolveDoc!: (v: never) => void;
      mockGetPaperlessDocument.mockReturnValue(new Promise((r) => (resolveDoc = r as never)));
      mockListPaperlessDocuments.mockResolvedValue({
        documents: [{ ...ROOF, id: 8, title: 'Second doc', correspondent: null }],
      } as never);
      render(<Host pendingDocumentId={7} />);
      await waitFor(() => expect(mockGetPaperlessDocument).toHaveBeenCalledTimes(1));

      await pick(user, /Second doc/);
      await waitFor(() => expect(values().paperlessDocumentId).toBe('8'));
      await act(async () => {
        resolveDoc({ document: ROOF } as never);
      });

      expect(values().paperlessDocumentId).toBe('8');
      expect(values().notes).toBe('Second doc');
      expect(onPicked).not.toHaveBeenCalledWith('Roof quote');
    });

    it('sets no load error when the fetch rejects after the field was unmounted', async () => {
      let rejectDoc!: (e: Error) => void;
      mockGetPaperlessDocument.mockReturnValue(new Promise((_r, rj) => (rejectDoc = rj)));
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const { unmount } = render(<Host pendingDocumentId={7} />);
      await waitFor(() => expect(mockGetPaperlessDocument).toHaveBeenCalledTimes(1));

      unmount();
      await act(async () => {
        rejectDoc(new Error('late'));
      });

      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('sets no load error when the fetch rejects after another document was picked', async () => {
      const user = userEvent.setup();
      let rejectDoc!: (e: Error) => void;
      mockGetPaperlessDocument.mockReturnValue(new Promise((_r, rj) => (rejectDoc = rj)));
      render(<Host pendingDocumentId={7} />);
      await waitFor(() => expect(mockGetPaperlessDocument).toHaveBeenCalledTimes(1));
      await pick(user);
      await waitFor(() => expect(values().paperlessDocumentId).toBe('7'));

      await act(async () => {
        rejectDoc(new Error('late'));
      });

      expect(screen.queryByText("Couldn't open that document.")).toBeNull();
    });
  });

  describe('unmounting', () => {
    it('drops a company match that settles after the field is gone', async () => {
      const user = userEvent.setup();
      let resolveCompanies!: (v: never) => void;
      mockSearchCompanies.mockReturnValue(new Promise((r) => (resolveCompanies = r as never)));
      const { unmount } = render(<Host />);
      await pick(user);
      await waitFor(() => expect(mockSearchCompanies).toHaveBeenCalled());

      unmount();
      await act(async () => {
        resolveCompanies([{ id: 'v-1', name: 'Acme Roofing' }] as never);
      });

      expect(announcements).toEqual([]);
    });
  });
});
