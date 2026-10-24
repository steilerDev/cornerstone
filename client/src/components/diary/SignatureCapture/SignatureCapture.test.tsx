/**
 * @jest-environment jsdom
 *
 * Unit tests for SignatureCapture — the canvas-based signature drawing widget.
 *
 * This file closes a pre-existing test-file-parity gap: SignatureCapture.tsx
 * previously had no direct test file (only indirect coverage via
 * SignatureSection.test.tsx, which mocks SignatureCapture entirely and never
 * exercises its canvas-drawing logic). See Issue #1813 QA Spec.
 *
 * Canvas mocking strategy: jsdom does not implement a real 2D canvas context
 * (no `canvas` npm package — project policy forbids native binary deps for
 * frontend tooling). `HTMLCanvasElement.prototype.getContext` and
 * `.toDataURL` are stubbed so drawing interactions and handleAccept's
 * `ctx.fillText` calls can be exercised and asserted on directly.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { ReactElement } from 'react';
import type { DiarySignatureEntry } from '@cornerstone/shared';
import type * as SignatureCaptureModule from './SignatureCapture.js';
import type * as VendorsApiTypes from '../../../lib/vendorsApi.js';
import { LocaleProvider } from '../../../contexts/LocaleContext.js';

/**
 * Custom render function that wraps the component with LocaleProvider —
 * SignatureCapture uses useFormatters() (via useLocale()), which throws
 * outside a LocaleProvider. See DateRangePicker.test.tsx for the reference pattern.
 */
function render(ui: ReactElement, options?: Parameters<typeof rtlRender>[1]) {
  return rtlRender(<LocaleProvider>{ui}</LocaleProvider>, options);
}

// ─── Company search (server) ────────────────────────────────────────────────

const mockSearchCompanies = jest.fn<typeof VendorsApiTypes.searchCompanies>();
const mockFetchVendor = jest.fn<typeof VendorsApiTypes.fetchVendor>();

jest.unstable_mockModule('../../../lib/vendorsApi.js', () => ({
  searchCompanies: mockSearchCompanies,
  fetchVendor: mockFetchVendor,
}));

const COMPANIES = [
  { id: 'v-1', name: 'ACME Roofing' },
  { id: 'v-2', name: 'BuildCo' },
] as unknown as Awaited<ReturnType<typeof VendorsApiTypes.searchCompanies>>;

// ─── Canvas 2D context stub ─────────────────────────────────────────────────

interface MockCtx {
  scale: jest.Mock;
  fillRect: jest.Mock;
  clearRect: jest.Mock;
  beginPath: jest.Mock;
  moveTo: jest.Mock;
  lineTo: jest.Mock;
  stroke: jest.Mock;
  save: jest.Mock;
  restore: jest.Mock;
  fillText: jest.Mock;
  drawImage: jest.Mock;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  font: string;
  textAlign: string;
}

function makeMockCtx(): MockCtx {
  return {
    scale: jest.fn(),
    fillRect: jest.fn(),
    clearRect: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    fillText: jest.fn(),
    drawImage: jest.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    font: '',
    textAlign: '',
  };
}

let mockCtx: MockCtx;
let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
let originalToDataURL: typeof HTMLCanvasElement.prototype.toDataURL;
let originalGetBoundingClientRect: typeof Element.prototype.getBoundingClientRect;

beforeEach(() => {
  mockCtx = makeMockCtx();
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

  HTMLCanvasElement.prototype.getContext = jest.fn(
    () => mockCtx,
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toDataURL = jest.fn(
    () => 'data:image/png;base64,MOCKDATA',
  ) as unknown as typeof HTMLCanvasElement.prototype.toDataURL;
  Element.prototype.getBoundingClientRect = jest.fn(() => ({
    width: 300,
    height: 150,
    top: 0,
    left: 0,
    right: 300,
    bottom: 150,
    x: 0,
    y: 0,
    toJSON() {
      return {};
    },
  })) as unknown as typeof Element.prototype.getBoundingClientRect;

  localStorage.clear();
  mockSearchCompanies.mockReset();
  mockSearchCompanies.mockResolvedValue(COMPANIES);
  mockFetchVendor.mockReset();
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  localStorage.clear();
  jest.useRealTimers();
});

// ─── Module under test ───────────────────────────────────────────────────────

let SignatureCapture: (typeof SignatureCaptureModule)['SignatureCapture'];

beforeEach(async () => {
  if (!SignatureCapture) {
    ({ SignatureCapture } =
      (await import('./SignatureCapture.js')) as typeof SignatureCaptureModule);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProps(
  overrides: Partial<React.ComponentProps<typeof SignatureCaptureModule.SignatureCapture>> = {},
) {
  return {
    signature: null,
    onSignatureChange: jest.fn(),
    disabled: false,
    signerName: '',
    signerType: 'self' as const,
    ...overrides,
  };
}

/** The company picker's input (labelled "Vendor"; the radio of the same name is not a textbox). */
const companyInput = () => screen.getByRole('textbox', { name: 'Vendor' });

/** Opens the company picker and chooses the "Other..." free-text entry. */
async function chooseOther() {
  await userEvent.click(companyInput());
  await userEvent.click(await screen.findByRole('option', { name: 'Other...' }));
  return screen.findByPlaceholderText('Enter vendor name');
}

/** Opens the company picker and chooses a searched company by name. */
async function chooseCompany(name: string) {
  await userEvent.click(companyInput());
  await userEvent.click(await screen.findByRole('option', { name }));
}

/** Draws a short stroke on the canvas (mouseDown + mouseMove) to set hasStrokes=true. */
function drawStroke(canvas: HTMLElement) {
  fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
  fireEvent.mouseMove(canvas, { clientX: 20, clientY: 20 });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('SignatureCapture', () => {
  // ── Rendering ──────────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders the signature canvas with an accessible label', () => {
      render(<SignatureCapture {...makeProps()} />);
      expect(screen.getByLabelText('Signature canvas')).toBeInTheDocument();
    });

    it('renders the Clear and Accept Signature buttons', () => {
      render(<SignatureCapture {...makeProps()} />);
      expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Accept Signature' })).toBeInTheDocument();
    });

    it('renders a "Remove Signature" button in the unsigned view that clears the pending signature (#2088)', () => {
      const onSignatureChange = jest.fn();
      render(<SignatureCapture {...makeProps({ onSignatureChange })} />);
      const removeBtn = screen.getByRole('button', { name: 'Remove Signature' });
      expect(removeBtn).toBeEnabled();
      fireEvent.click(removeBtn);
      expect(onSignatureChange).toHaveBeenCalledWith(null);
    });

    it('unsigned-view "Remove Signature" button is disabled when disabled=true (#2088)', () => {
      render(<SignatureCapture {...makeProps({ disabled: true })} />);
      expect(screen.getByRole('button', { name: 'Remove Signature' })).toBeDisabled();
    });

    it('Accept button is disabled when there are no strokes yet', () => {
      render(<SignatureCapture {...makeProps()} />);
      expect(screen.getByRole('button', { name: 'Accept Signature' })).toBeDisabled();
    });

    it('Clear button is disabled when there are no strokes yet', () => {
      render(<SignatureCapture {...makeProps()} />);
      expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
    });

    it('renders the self/vendor signer type radio buttons', () => {
      render(<SignatureCapture {...makeProps()} />);
      expect(screen.getByRole('radio', { name: 'Self' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Vendor' })).toBeInTheDocument();
    });

    it('"self" signer type is checked by default', () => {
      render(<SignatureCapture {...makeProps()} />);
      expect(screen.getByRole('radio', { name: 'Self' })).toBeChecked();
    });

    it('renders a read-only display of currentUserName for self signer type', () => {
      render(<SignatureCapture {...makeProps({ currentUserName: 'Jane Doe' })} />);
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });

    it('renders "—" placeholder when self signer type has no name available', () => {
      render(<SignatureCapture {...makeProps({ currentUserName: undefined, signerName: '' })} />);
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  // ── Signed (read-only) view ───────────────────────────────────────────────

  describe('when a signature is already present', () => {
    const existingSig: DiarySignatureEntry = {
      signerName: 'Alice Builder',
      signerType: 'self',
      signatureDataUrl: 'data:image/png;base64,existing',
      signedAt: '2026-02-24T14:45:00.000Z',
    };

    it('renders the signer name and the signature image instead of the canvas', () => {
      render(<SignatureCapture {...makeProps({ signature: existingSig })} />);
      expect(screen.getByText('Alice Builder')).toBeInTheDocument();
      expect(screen.getByAltText('Signature of Alice Builder')).toBeInTheDocument();
      expect(screen.queryByLabelText('Signature canvas')).not.toBeInTheDocument();
    });

    it('renders "(Self)" signer type label for a self signature', () => {
      render(<SignatureCapture {...makeProps({ signature: existingSig })} />);
      expect(screen.getByText(/\(Self\)/)).toBeInTheDocument();
    });

    it('renders "(Vendor)" signer type label for a vendor signature', () => {
      const vendorSig: DiarySignatureEntry = { ...existingSig, signerType: 'vendor' };
      render(<SignatureCapture {...makeProps({ signature: vendorSig })} />);
      expect(screen.getByText(/\(Vendor\)/)).toBeInTheDocument();
    });

    it('renders a "Remove Signature" button', () => {
      render(<SignatureCapture {...makeProps({ signature: existingSig })} />);
      expect(screen.getByRole('button', { name: 'Remove Signature' })).toBeInTheDocument();
    });

    it('calls onSignatureChange(null) when Remove Signature is clicked', () => {
      const onSignatureChange = jest.fn();
      render(<SignatureCapture {...makeProps({ signature: existingSig, onSignatureChange })} />);
      fireEvent.click(screen.getByRole('button', { name: 'Remove Signature' }));
      expect(onSignatureChange).toHaveBeenCalledWith(null);
    });

    it('Remove Signature button is disabled when disabled=true', () => {
      render(<SignatureCapture {...makeProps({ signature: existingSig, disabled: true })} />);
      expect(screen.getByRole('button', { name: 'Remove Signature' })).toBeDisabled();
    });
  });

  // ── Drawing interaction ───────────────────────────────────────────────────

  describe('drawing interaction', () => {
    it('enables the Accept and Clear buttons after a mouse stroke is drawn', () => {
      render(<SignatureCapture {...makeProps()} />);
      const canvas = screen.getByLabelText('Signature canvas');
      drawStroke(canvas);
      expect(screen.getByRole('button', { name: 'Accept Signature' })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: 'Clear' })).not.toBeDisabled();
    });

    it('mouseUp stops drawing without affecting hasStrokes', () => {
      render(<SignatureCapture {...makeProps()} />);
      const canvas = screen.getByLabelText('Signature canvas');
      drawStroke(canvas);
      fireEvent.mouseUp(canvas);
      // hasStrokes remains true after mouseUp — buttons stay enabled
      expect(screen.getByRole('button', { name: 'Accept Signature' })).not.toBeDisabled();
    });

    it('does not draw when disabled=true', () => {
      render(<SignatureCapture {...makeProps({ disabled: true })} />);
      const canvas = screen.getByLabelText('Signature canvas');
      drawStroke(canvas);
      expect(screen.getByRole('button', { name: 'Accept Signature' })).toBeDisabled();
    });

    it('Clear button resets hasStrokes and re-disables Accept', () => {
      render(<SignatureCapture {...makeProps()} />);
      const canvas = screen.getByLabelText('Signature canvas');
      drawStroke(canvas);
      expect(screen.getByRole('button', { name: 'Accept Signature' })).not.toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
      expect(screen.getByRole('button', { name: 'Accept Signature' })).toBeDisabled();
    });

    it('supports touch drawing (touchStart + touchMove) to set hasStrokes', () => {
      render(<SignatureCapture {...makeProps()} />);
      const canvas = screen.getByLabelText('Signature canvas');
      fireEvent.touchStart(canvas, { touches: [{ clientX: 10, clientY: 10 }] });
      fireEvent.touchMove(canvas, { touches: [{ clientX: 20, clientY: 20 }] });
      expect(screen.getByRole('button', { name: 'Accept Signature' })).not.toBeDisabled();
    });

    it('touchEnd stops drawing without clearing hasStrokes', () => {
      render(<SignatureCapture {...makeProps()} />);
      const canvas = screen.getByLabelText('Signature canvas');
      fireEvent.touchStart(canvas, { touches: [{ clientX: 10, clientY: 10 }] });
      fireEvent.touchMove(canvas, { touches: [{ clientX: 20, clientY: 20 }] });
      fireEvent.touchEnd(canvas);
      expect(screen.getByRole('button', { name: 'Accept Signature' })).not.toBeDisabled();
    });

    it('does not draw via touch when disabled=true', () => {
      render(<SignatureCapture {...makeProps({ disabled: true })} />);
      const canvas = screen.getByLabelText('Signature canvas');
      fireEvent.touchStart(canvas, { touches: [{ clientX: 10, clientY: 10 }] });
      fireEvent.touchMove(canvas, { touches: [{ clientX: 20, clientY: 20 }] });
      expect(screen.getByRole('button', { name: 'Accept Signature' })).toBeDisabled();
    });

    it('touchStart with no touches is a no-op', () => {
      render(<SignatureCapture {...makeProps()} />);
      const canvas = screen.getByLabelText('Signature canvas');
      expect(() => fireEvent.touchStart(canvas, { touches: [] })).not.toThrow();
      expect(screen.getByRole('button', { name: 'Accept Signature' })).toBeDisabled();
    });
  });

  // ── handleAccept ───────────────────────────────────────────────────────────

  describe('handleAccept', () => {
    it('calls onSignatureChange with a signatureDataUrl after drawing and accepting', () => {
      const onSignatureChange = jest.fn();
      render(
        <SignatureCapture
          {...makeProps({
            onSignatureChange,
            signerName: 'Bob Smith',
            currentUserName: 'Bob Smith',
          })}
        />,
      );
      const canvas = screen.getByLabelText('Signature canvas');
      drawStroke(canvas);
      fireEvent.click(screen.getByRole('button', { name: 'Accept Signature' }));

      expect(onSignatureChange).toHaveBeenCalledTimes(1);
      const [entry] = onSignatureChange.mock.calls[0] as [DiarySignatureEntry];
      expect(entry.signatureDataUrl).toBe('data:image/png;base64,MOCKDATA');
      expect(entry.signerType).toBe('self');
      expect(entry.signerName).toBe('Bob Smith');
      expect(typeof entry.signedAt).toBe('string');
    });

    it('falls back to a trimmed currentUserName when signerName is empty (#2088)', () => {
      const onSignatureChange = jest.fn();
      render(
        <SignatureCapture
          {...makeProps({ onSignatureChange, signerName: '', currentUserName: '  Bob  ' })}
        />,
      );
      drawStroke(screen.getByLabelText('Signature canvas'));
      fireEvent.click(screen.getByRole('button', { name: 'Accept Signature' }));

      const [entry] = onSignatureChange.mock.calls[0] as [DiarySignatureEntry];
      expect(entry.signerName).toBe('Bob');
    });

    it('prefers signerName over currentUserName when both are present (#2088)', () => {
      const onSignatureChange = jest.fn();
      render(
        <SignatureCapture
          {...makeProps({ onSignatureChange, signerName: 'Carol', currentUserName: 'Bob' })}
        />,
      );
      drawStroke(screen.getByLabelText('Signature canvas'));
      fireEvent.click(screen.getByRole('button', { name: 'Accept Signature' }));

      const [entry] = onSignatureChange.mock.calls[0] as [DiarySignatureEntry];
      expect(entry.signerName).toBe('Carol');
    });

    it('emits an empty signerName when neither signerName nor currentUserName is available', () => {
      const onSignatureChange = jest.fn();
      render(<SignatureCapture {...makeProps({ onSignatureChange, signerName: '' })} />);
      drawStroke(screen.getByLabelText('Signature canvas'));
      fireEvent.click(screen.getByRole('button', { name: 'Accept Signature' }));

      const [entry] = onSignatureChange.mock.calls[0] as [DiarySignatureEntry];
      expect(entry.signerName).toBe('');
    });

    it('burns signer name and formatted date onto the canvas via ctx.fillText', () => {
      render(
        <SignatureCapture
          {...makeProps({ signerName: 'Carla Vendor', currentUserName: 'Carla Vendor' })}
        />,
      );
      const canvas = screen.getByLabelText('Signature canvas');
      drawStroke(canvas);
      fireEvent.click(screen.getByRole('button', { name: 'Accept Signature' }));

      expect(mockCtx.fillText).toHaveBeenCalled();
      const [labelText] = mockCtx.fillText.mock.calls[mockCtx.fillText.mock.calls.length - 1] as [
        string,
      ];
      expect(labelText).toContain('Carla Vendor');
    });

    it('vendor signer type composes displayName as "vendorName (signatoryName)"', async () => {
      const onSignatureChange = jest.fn();
      render(
        <SignatureCapture
          {...makeProps({
            onSignatureChange,
            signerType: 'vendor',
          })}
        />,
      );
      // The "Other..." entry reveals the free-text vendor name input
      const vendorInput = await chooseOther();
      fireEvent.change(vendorInput, { target: { value: 'ACME Roofing' } });
      const signatoryInput = screen.getByPlaceholderText(
        'Name of person signing on behalf of vendor',
      );
      fireEvent.change(signatoryInput, { target: { value: 'Sam Signer' } });

      const canvas = screen.getByLabelText('Signature canvas');
      drawStroke(canvas);
      fireEvent.click(screen.getByRole('button', { name: 'Accept Signature' }));

      expect(onSignatureChange).toHaveBeenCalledTimes(1);
      const [entry] = onSignatureChange.mock.calls[0] as [DiarySignatureEntry];
      expect(entry.signerName).toBe('ACME Roofing (Sam Signer)');
      expect(entry.signerType).toBe('vendor');
    });

    it('Accept button stays disabled for vendor signer type until vendor + signatory names are filled', () => {
      render(<SignatureCapture {...makeProps({ signerType: 'vendor' })} />);
      const canvas = screen.getByLabelText('Signature canvas');
      drawStroke(canvas);
      // hasStrokes=true but vendor info missing → still disabled
      expect(screen.getByRole('button', { name: 'Accept Signature' })).toBeDisabled();
    });

    it('shows a size error and does not call onSignatureChange when the data URL exceeds 500KB', () => {
      HTMLCanvasElement.prototype.toDataURL = jest.fn(
        () => `data:image/png;base64,${'A'.repeat(600 * 1024)}`,
      ) as unknown as typeof HTMLCanvasElement.prototype.toDataURL;

      const onSignatureChange = jest.fn();
      render(
        <SignatureCapture
          {...makeProps({ onSignatureChange, signerName: 'Big Sig', currentUserName: 'Big Sig' })}
        />,
      );
      const canvas = screen.getByLabelText('Signature canvas');
      drawStroke(canvas);
      fireEvent.click(screen.getByRole('button', { name: 'Accept Signature' }));

      expect(onSignatureChange).not.toHaveBeenCalled();
      expect(screen.getByText(/Signature too large/i)).toBeInTheDocument();
    });

    it('clears the size error after Clear is clicked', () => {
      HTMLCanvasElement.prototype.toDataURL = jest.fn(
        () => `data:image/png;base64,${'A'.repeat(600 * 1024)}`,
      ) as unknown as typeof HTMLCanvasElement.prototype.toDataURL;

      render(
        <SignatureCapture {...makeProps({ signerName: 'Big Sig', currentUserName: 'Big Sig' })} />,
      );
      const canvas = screen.getByLabelText('Signature canvas');
      drawStroke(canvas);
      fireEvent.click(screen.getByRole('button', { name: 'Accept Signature' }));
      expect(screen.getByText(/Signature too large/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
      expect(screen.queryByText(/Signature too large/i)).not.toBeInTheDocument();
    });
  });

  // ── signer type switching ─────────────────────────────────────────────────

  describe('signer type switching', () => {
    it('calls onSignerTypeChange when switching from Self to Vendor', () => {
      const onSignerTypeChange = jest.fn();
      render(<SignatureCapture {...makeProps({ onSignerTypeChange })} />);
      fireEvent.click(screen.getByRole('radio', { name: 'Vendor' }));
      expect(onSignerTypeChange).toHaveBeenCalledWith('vendor');
    });

    it('resets vendor selection state when switching signer type', async () => {
      render(<SignatureCapture {...makeProps({ signerType: 'vendor' })} />);
      const vendorInput = await chooseOther();
      fireEvent.change(vendorInput, { target: { value: 'ACME' } });
      expect((vendorInput as HTMLInputElement).value).toBe('ACME');

      fireEvent.click(screen.getByRole('radio', { name: 'Self' }));
      // Switching away and back clears the local vendorName state
      fireEvent.click(screen.getByRole('radio', { name: 'Vendor' }));
      // The picker is empty again and the free-text input is gone until "Other..." is chosen
      expect(screen.queryByPlaceholderText('Enter vendor name')).not.toBeInTheDocument();
      expect(companyInput()).toHaveValue('');
      const vendorInputAfter = (await chooseOther()) as HTMLInputElement;
      expect(vendorInputAfter.value).toBe('');
    });
  });

  // ── company picker (server search) ────────────────────────────────────────

  describe('company picker', () => {
    it('lists companies from the server only once the picker is focused', async () => {
      render(<SignatureCapture {...makeProps({ signerType: 'vendor' })} />);
      expect(mockSearchCompanies).not.toHaveBeenCalled();

      await userEvent.click(companyInput());

      expect(await screen.findByRole('option', { name: 'ACME Roofing' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'BuildCo' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Other...' })).toBeInTheDocument();
      expect(mockSearchCompanies).toHaveBeenCalledWith('', expect.any(AbortSignal));
    });

    it('finds a company by typing (the query reaches the server)', async () => {
      mockSearchCompanies.mockImplementation(async (q) =>
        q === 'zeta'
          ? ([{ id: 'v-250', name: 'Zeta Tiling' }] as unknown as typeof COMPANIES)
          : COMPANIES,
      );
      render(<SignatureCapture {...makeProps({ signerType: 'vendor' })} />);

      await userEvent.type(companyInput(), 'zeta');

      expect(await screen.findByRole('option', { name: 'Zeta Tiling' })).toBeInTheDocument();
      expect(mockSearchCompanies).toHaveBeenCalledWith('zeta', expect.any(AbortSignal));
    });

    it('selecting a company shows no free-text input and keeps focus on a control, not body', async () => {
      render(<SignatureCapture {...makeProps({ signerType: 'vendor' })} />);

      await chooseCompany('ACME Roofing');

      expect(screen.queryByPlaceholderText('Enter vendor name')).not.toBeInTheDocument();
      expect(screen.getByText('ACME Roofing')).toBeInTheDocument();
      await waitFor(() => expect(document.activeElement).not.toBe(document.body));
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Clear selection' }));
    });

    it('"Other..." reveals the free-text input, labelled by its aria-label, and accepts text', async () => {
      render(<SignatureCapture {...makeProps({ signerType: 'vendor' })} />);

      const freeform = (await chooseOther()) as HTMLInputElement;

      expect(screen.getByLabelText('Enter vendor name')).toBe(freeform);
      fireEvent.change(freeform, { target: { value: 'Custom Vendor Co' } });
      expect(freeform.value).toBe('Custom Vendor Co');
    });

    it('clearing the choice hides the free-text input and resets the names', async () => {
      render(<SignatureCapture {...makeProps({ signerType: 'vendor' })} />);
      const freeform = await chooseOther();
      fireEvent.change(freeform, { target: { value: 'Custom Vendor Co' } });
      fireEvent.change(screen.getByPlaceholderText('Name of person signing on behalf of vendor'), {
        target: { value: 'Pat' },
      });

      await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }));

      expect(screen.queryByPlaceholderText('Enter vendor name')).not.toBeInTheDocument();
      expect(
        (
          screen.getByPlaceholderText(
            'Name of person signing on behalf of vendor',
          ) as HTMLInputElement
        ).value,
      ).toBe('');
      expect(companyInput()).toHaveValue('');
    });

    it('choosing another company clears the signatory name', async () => {
      render(<SignatureCapture {...makeProps({ signerType: 'vendor' })} />);
      await chooseCompany('ACME Roofing');
      fireEvent.change(screen.getByPlaceholderText('Name of person signing on behalf of vendor'), {
        target: { value: 'Pat' },
      });

      await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
      await chooseCompany('BuildCo');

      expect(
        (
          screen.getByPlaceholderText(
            'Name of person signing on behalf of vendor',
          ) as HTMLInputElement
        ).value,
      ).toBe('');
    });

    it('a full company-from-search + signatory flow enables Accept and composes "company (signatory)"', async () => {
      const onSignatureChange = jest.fn();
      render(<SignatureCapture {...makeProps({ signerType: 'vendor', onSignatureChange })} />);
      await chooseCompany('BuildCo');
      fireEvent.change(screen.getByPlaceholderText('Name of person signing on behalf of vendor'), {
        target: { value: 'Pat Signer' },
      });

      drawStroke(screen.getByLabelText('Signature canvas'));
      expect(screen.getByRole('button', { name: 'Accept Signature' })).not.toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: 'Accept Signature' }));
      expect(onSignatureChange).toHaveBeenCalledTimes(1);
      const [entry] = onSignatureChange.mock.calls[0] as [DiarySignatureEntry];
      expect(entry.signerName).toBe('BuildCo (Pat Signer)');
    });

    it('Accept stays disabled until both company and signatory are set', async () => {
      render(<SignatureCapture {...makeProps({ signerType: 'vendor' })} />);
      drawStroke(screen.getByLabelText('Signature canvas'));
      expect(screen.getByRole('button', { name: 'Accept Signature' })).toBeDisabled();

      await chooseCompany('BuildCo');
      expect(screen.getByRole('button', { name: 'Accept Signature' })).toBeDisabled();

      fireEvent.change(screen.getByPlaceholderText('Name of person signing on behalf of vendor'), {
        target: { value: 'Pat' },
      });
      expect(screen.getByRole('button', { name: 'Accept Signature' })).not.toBeDisabled();
    });

    it('the picker is disabled when the capture is disabled', () => {
      render(<SignatureCapture {...makeProps({ signerType: 'vendor', disabled: true })} />);
      expect(companyInput()).toBeDisabled();
    });

    it('shows a validation hint when vendor info is missing after drawing a stroke', () => {
      render(<SignatureCapture {...makeProps({ signerType: 'vendor' })} />);
      drawStroke(screen.getByLabelText('Signature canvas'));
      expect(screen.getByText('Both vendor and signatory name are required')).toBeInTheDocument();
    });

    it('does not fetch companies for the "self" signer type', () => {
      render(<SignatureCapture {...makeProps({ currentUserName: 'Dana Owner' })} />);
      expect(screen.queryByRole('textbox', { name: 'Vendor' })).not.toBeInTheDocument();
      expect(mockSearchCompanies).not.toHaveBeenCalled();
    });
  });

  // ── Canvas robustness (whole-file coverage of the drawing code) ─────────────

  describe('canvas robustness', () => {
    const setPixelRatio = (value: number) =>
      Object.defineProperty(window, 'devicePixelRatio', { value, configurable: true });

    it('works with only the required props (all optional props take their defaults)', () => {
      render(<SignatureCapture signature={null} onSignatureChange={jest.fn()} />);

      expect(screen.getByLabelText('Signature canvas')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Accept Signature' })).toBeDisabled();
    });

    it('does not need onSignerNameChange to pre-fill the signer for a self signature', () => {
      render(
        <SignatureCapture
          signature={null}
          onSignatureChange={jest.fn()}
          signerType="self"
          currentUserName="Alice Builder"
        />,
      );

      expect(screen.getByText('Alice Builder')).toBeInTheDocument();
    });

    it('sizes the canvas with a device pixel ratio of 1 when the browser reports none', () => {
      const original = window.devicePixelRatio;
      setPixelRatio(0);
      try {
        render(<SignatureCapture {...makeProps()} />);

        expect(mockCtx.scale).toHaveBeenCalledWith(1, 1);
      } finally {
        setPixelRatio(original);
      }
    });

    it('scales the canvas by the device pixel ratio', () => {
      const original = window.devicePixelRatio;
      setPixelRatio(2);
      try {
        render(<SignatureCapture {...makeProps()} />);

        expect(mockCtx.scale).toHaveBeenCalledWith(2, 2);
      } finally {
        setPixelRatio(original);
      }
    });

    it('draws the signature line and the "sign here" label on a fresh canvas', () => {
      render(<SignatureCapture {...makeProps()} />);

      expect(mockCtx.moveTo).toHaveBeenCalledWith(0, 100);
      expect(mockCtx.fillText).toHaveBeenCalledWith(expect.any(String), 16, 92);
    });

    it('keeps drawing after the first stroke segment (more mouse and touch moves)', () => {
      render(<SignatureCapture {...makeProps()} />);
      const canvas = screen.getByLabelText('Signature canvas');
      drawStroke(canvas);
      const before = mockCtx.lineTo.mock.calls.length;

      fireEvent.mouseMove(canvas, { clientX: 30, clientY: 30 });
      fireEvent.mouseUp(canvas);
      fireEvent.touchStart(canvas, { touches: [{ clientX: 5, clientY: 5 }] });
      fireEvent.touchMove(canvas, { touches: [{ clientX: 6, clientY: 6 }] });
      fireEvent.touchMove(canvas, { touches: [{ clientX: 7, clientY: 7 }] });

      expect(mockCtx.lineTo.mock.calls.length).toBeGreaterThanOrEqual(before + 4);
      expect(screen.getByRole('button', { name: 'Accept Signature' })).not.toBeDisabled();
    });

    it('ignores mouse and touch moves when no stroke was started', () => {
      render(<SignatureCapture {...makeProps()} />);
      const canvas = screen.getByLabelText('Signature canvas');

      fireEvent.mouseMove(canvas, { clientX: 20, clientY: 20 });
      fireEvent.touchMove(canvas, { touches: [{ clientX: 20, clientY: 20 }] });

      expect(screen.getByRole('button', { name: 'Accept Signature' })).toBeDisabled();
    });

    it('ignores a touch move without touches while drawing', () => {
      render(<SignatureCapture {...makeProps()} />);
      const canvas = screen.getByLabelText('Signature canvas');
      fireEvent.touchStart(canvas, { touches: [{ clientX: 10, clientY: 10 }] });

      fireEvent.touchMove(canvas, { touches: [] });

      expect(screen.getByRole('button', { name: 'Accept Signature' })).toBeDisabled();
    });

    describe('without a 2D context', () => {
      const noContext = () =>
        jest.fn(() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;

      it('renders and ignores drawing, clearing and accepting without throwing', () => {
        HTMLCanvasElement.prototype.getContext = noContext();
        const onSignatureChange = jest.fn();
        render(<SignatureCapture {...makeProps({ onSignatureChange })} />);
        const canvas = screen.getByLabelText('Signature canvas');

        expect(() => {
          fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
          fireEvent.mouseMove(canvas, { clientX: 20, clientY: 20 });
          fireEvent.touchStart(canvas, { touches: [{ clientX: 10, clientY: 10 }] });
          fireEvent.touchMove(canvas, { touches: [{ clientX: 20, clientY: 20 }] });
          fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
        }).not.toThrow();

        expect(screen.getByRole('button', { name: 'Accept Signature' })).toBeDisabled();
        expect(onSignatureChange).not.toHaveBeenCalled();
      });

      it('still accepts a drawn signature when the context disappears before Accept', () => {
        const onSignatureChange = jest.fn();
        render(<SignatureCapture {...makeProps({ onSignatureChange })} />);
        drawStroke(screen.getByLabelText('Signature canvas'));
        HTMLCanvasElement.prototype.getContext = noContext();

        fireEvent.click(screen.getByRole('button', { name: 'Accept Signature' }));

        expect(onSignatureChange).toHaveBeenCalledTimes(1);
      });

      it('keeps the stroke when Clear runs after the context disappeared', () => {
        render(<SignatureCapture {...makeProps()} />);
        drawStroke(screen.getByLabelText('Signature canvas'));
        HTMLCanvasElement.prototype.getContext = noContext();

        fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

        expect(screen.getByRole('button', { name: 'Accept Signature' })).toBeEnabled();
      });
    });

    it('draws with the colours of the page CSS custom properties when they are set', () => {
      const spy = jest.spyOn(window, 'getComputedStyle').mockReturnValue({
        getPropertyValue: (name: string) =>
          ({
            '--color-bg-primary': ' #fafafa ',
            '--color-text-primary': ' #101010 ',
            '--color-border': '#cccccc',
            '--color-text-muted': '#777777',
          })[name] ?? '',
      } as unknown as CSSStyleDeclaration);
      try {
        render(<SignatureCapture {...makeProps()} />);

        expect(mockCtx.strokeStyle).toBe('#cccccc');
        expect(mockCtx.fillStyle).toBe('#777777');
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('accept then remove (hasStrokes reset)', () => {
    function Harness() {
      const [signature, setSignature] = useState<DiarySignatureEntry | null>(null);
      return (
        <SignatureCapture
          signature={signature}
          onSignatureChange={setSignature}
          signerType="self"
          currentUserName="Alice Builder"
        />
      );
    }

    it('brings the canvas back with Accept disabled until a new stroke is drawn', () => {
      render(<Harness />);
      drawStroke(screen.getByLabelText('Signature canvas'));
      fireEvent.click(screen.getByRole('button', { name: 'Accept Signature' }));
      expect(screen.queryByLabelText('Signature canvas')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Remove Signature' }));

      const canvas = screen.getByLabelText('Signature canvas');
      expect(screen.getByRole('button', { name: 'Accept Signature' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
      drawStroke(canvas);
      expect(screen.getByRole('button', { name: 'Accept Signature' })).toBeEnabled();
    });
  });

  describe('self signer pre-fill', () => {
    it('reports the current user name to the host for a new self signature', () => {
      const onSignerNameChange = jest.fn();
      render(
        <SignatureCapture
          {...makeProps({ currentUserName: 'Alice Builder', onSignerNameChange })}
        />,
      );

      expect(onSignerNameChange).toHaveBeenCalledWith('Alice Builder');
    });
  });

  // ── Locale-aware formatted timestamp (Issue #1813) ─────────────────────────

  describe('locale-aware accept timestamp (formatDateTimeWithZone)', () => {
    beforeEach(() => {
      // Fix "now" to May 24, 2026 — a month whose short form diverges between
      // en ("May") and de ("Mai"), so the burned label proves locale routing.
      jest.useFakeTimers({ now: new Date(2026, 4, 24, 14, 30) });
    });

    // Note: button/canvas text is locale-translated (e.g. "Accept Signature" →
    // "Unterschrift übernehmen" under de), so these tests query by CSS class
    // (`.canvas` / `.acceptButton`, stable identity-obj-proxy class names)
    // rather than by translated accessible name/label.

    it('en-US: burned label contains the English short month', () => {
      const { container } = render(
        <SignatureCapture
          {...makeProps({ signerName: 'Dana Owner', currentUserName: 'Dana Owner' })}
        />,
      );
      const canvas = container.querySelector('canvas')!;
      drawStroke(canvas);
      fireEvent.click(container.querySelector('.acceptButton')!);

      const [labelText] = mockCtx.fillText.mock.calls[mockCtx.fillText.mock.calls.length - 1] as [
        string,
      ];
      expect(labelText).toContain('May');
      expect(labelText).not.toContain('Mai');
    });

    it('de-DE: burned label contains the German short month instead of English', () => {
      localStorage.setItem('locale', 'de');
      const { container } = render(
        <SignatureCapture
          {...makeProps({ signerName: 'Dana Owner', currentUserName: 'Dana Owner' })}
        />,
      );
      const canvas = container.querySelector('canvas')!;
      drawStroke(canvas);
      fireEvent.click(container.querySelector('.acceptButton')!);

      const [labelText] = mockCtx.fillText.mock.calls[mockCtx.fillText.mock.calls.length - 1] as [
        string,
      ];
      expect(labelText).toContain('Mai');
      expect(labelText).not.toContain('May');
    });

    it('en-US and de-DE produce different burned labels for the same accept action', () => {
      const { container, unmount } = render(
        <SignatureCapture
          {...makeProps({ signerName: 'Dana Owner', currentUserName: 'Dana Owner' })}
        />,
      );
      let canvas = container.querySelector('canvas')!;
      drawStroke(canvas);
      fireEvent.click(container.querySelector('.acceptButton')!);
      const [enLabel] = mockCtx.fillText.mock.calls[mockCtx.fillText.mock.calls.length - 1] as [
        string,
      ];
      unmount();

      mockCtx.fillText.mockClear();
      localStorage.setItem('locale', 'de');
      const { container: container2 } = render(
        <SignatureCapture
          {...makeProps({ signerName: 'Dana Owner', currentUserName: 'Dana Owner' })}
        />,
      );
      canvas = container2.querySelector('canvas')!;
      drawStroke(canvas);
      fireEvent.click(container2.querySelector('.acceptButton')!);
      const [deLabel] = mockCtx.fillText.mock.calls[mockCtx.fillText.mock.calls.length - 1] as [
        string,
      ];

      expect(enLabel).not.toBe(deLabel);
    });
  });

  describe('input length caps (#2152)', () => {
    const signatory = () =>
      screen.getByPlaceholderText('Name of person signing on behalf of vendor') as HTMLInputElement;

    it('the "Other..." vendor name input is capped at 200 characters', async () => {
      render(<SignatureCapture {...makeProps({ signerType: 'vendor' })} />);
      expect(await chooseOther()).toHaveAttribute('maxlength', '200');
    });

    it('the signatory name leaves room for the composed "vendor (signatory)" within 300', async () => {
      render(<SignatureCapture {...makeProps({ signerType: 'vendor' })} />);
      await chooseOther();
      // empty vendor: 300 - 0 - 3 (" (" + ")")
      expect(signatory()).toHaveAttribute('maxlength', '297');
      fireEvent.change(screen.getByPlaceholderText('Enter vendor name'), {
        target: { value: 'ACME Roofing' },
      });
      expect(signatory()).toHaveAttribute('maxlength', String(300 - 12 - 3));
    });

    it('a 200-character vendor name still leaves the signatory a maxLength of 97', async () => {
      render(<SignatureCapture {...makeProps({ signerType: 'vendor' })} />);
      await chooseOther();
      fireEvent.change(screen.getByPlaceholderText('Enter vendor name'), {
        target: { value: 'v'.repeat(200) },
      });
      expect(signatory()).toHaveAttribute('maxlength', '97');
    });

    it('the signatory maxLength never drops below 1', async () => {
      render(<SignatureCapture {...makeProps({ signerType: 'vendor' })} />);
      await chooseOther();
      // fireEvent bypasses the input maxlength, so an over-long vendor name can occur
      fireEvent.change(screen.getByPlaceholderText('Enter vendor name'), {
        target: { value: 'v'.repeat(400) },
      });
      expect(signatory()).toHaveAttribute('maxlength', '1');
    });

    it('the composed name for the longest allowed inputs is exactly 300 characters', async () => {
      const onSignatureChange = jest.fn();
      render(<SignatureCapture {...makeProps({ onSignatureChange, signerType: 'vendor' })} />);
      await chooseOther();
      fireEvent.change(screen.getByPlaceholderText('Enter vendor name'), {
        target: { value: 'v'.repeat(200) },
      });
      fireEvent.change(signatory(), { target: { value: 's'.repeat(97) } });
      drawStroke(screen.getByLabelText('Signature canvas'));
      fireEvent.click(screen.getByRole('button', { name: 'Accept Signature' }));
      const [entry] = onSignatureChange.mock.calls[0] as [DiarySignatureEntry];
      expect(entry.signerName).toHaveLength(300);
    });
  });
});
