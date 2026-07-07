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
import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { DiarySignatureEntry } from '@cornerstone/shared';
import type * as SignatureCaptureModule from './SignatureCapture.js';
import { LocaleProvider } from '../../../contexts/LocaleContext.js';

/**
 * Custom render function that wraps the component with LocaleProvider —
 * SignatureCapture uses useFormatters() (via useLocale()), which throws
 * outside a LocaleProvider. See DateRangePicker.test.tsx for the reference pattern.
 */
function render(ui: ReactElement, options?: Parameters<typeof rtlRender>[1]) {
  return rtlRender(<LocaleProvider>{ui}</LocaleProvider>, options);
}

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

    it('does not call onSignatureChange when Accept is clicked with no strokes', () => {
      const onSignatureChange = jest.fn();
      render(<SignatureCapture {...makeProps({ onSignatureChange })} />);
      // Accept button is disabled, but exercise handleAccept's own guard too via a direct click attempt
      const acceptButton = screen.getByRole('button', { name: 'Accept Signature' });
      fireEvent.click(acceptButton);
      expect(onSignatureChange).not.toHaveBeenCalled();
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

    it('vendor signer type composes displayName as "vendorName (signatoryName)"', () => {
      const onSignatureChange = jest.fn();
      render(
        <SignatureCapture
          {...makeProps({
            onSignatureChange,
            signerType: 'vendor',
            vendors: [],
          })}
        />,
      );
      // No vendors provided → freeform vendor name input renders
      const vendorInput = screen.getByPlaceholderText('Enter vendor name');
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
      render(<SignatureCapture {...makeProps({ signerType: 'vendor', vendors: [] })} />);
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

    it('resets vendor selection state when switching signer type', () => {
      render(<SignatureCapture {...makeProps({ signerType: 'vendor', vendors: [] })} />);
      const vendorInput = screen.getByPlaceholderText('Enter vendor name');
      fireEvent.change(vendorInput, { target: { value: 'ACME' } });
      expect((vendorInput as HTMLInputElement).value).toBe('ACME');

      fireEvent.click(screen.getByRole('radio', { name: 'Self' }));
      // Switching away and back clears the local vendorName state
      fireEvent.click(screen.getByRole('radio', { name: 'Vendor' }));
      const vendorInputAfter = screen.getByPlaceholderText('Enter vendor name') as HTMLInputElement;
      expect(vendorInputAfter.value).toBe('');
    });
  });

  // ── vendor select dropdown (existing vendors list) ────────────────────────

  describe('vendor select dropdown', () => {
    const vendors = [
      { id: 'v-1', name: 'ACME Roofing' },
      { id: 'v-2', name: 'BuildCo' },
    ];

    it('renders a select with vendor options plus "Other..." when vendors are provided', () => {
      render(<SignatureCapture {...makeProps({ signerType: 'vendor', vendors })} />);
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'ACME Roofing' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'BuildCo' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Other...' })).toBeInTheDocument();
    });

    it('selecting a vendor from the list populates vendorName (no freeform input shown)', () => {
      render(<SignatureCapture {...makeProps({ signerType: 'vendor', vendors })} />);
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'v-1' } });
      // No freeform "Enter vendor name" input appears for a selected known vendor
      expect(screen.queryByPlaceholderText('Enter vendor name')).not.toBeInTheDocument();
    });

    it('selecting "Other..." reveals the freeform vendor name input and accepts typed text', () => {
      render(<SignatureCapture {...makeProps({ signerType: 'vendor', vendors })} />);
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: '__other__' } });
      const freeform = screen.getByPlaceholderText('Enter vendor name') as HTMLInputElement;
      expect(freeform).toBeInTheDocument();
      fireEvent.change(freeform, { target: { value: 'Custom Vendor Co' } });
      expect(freeform.value).toBe('Custom Vendor Co');
    });

    it('resetting the select to empty clears vendorName and hides the freeform input', () => {
      render(<SignatureCapture {...makeProps({ signerType: 'vendor', vendors })} />);
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: '__other__' } });
      expect(screen.getByPlaceholderText('Enter vendor name')).toBeInTheDocument();

      fireEvent.change(select, { target: { value: '' } });
      expect(screen.queryByPlaceholderText('Enter vendor name')).not.toBeInTheDocument();
    });

    it('completing a full vendor-from-list + signatory flow enables Accept and submits correctly', () => {
      const onSignatureChange = jest.fn();
      render(
        <SignatureCapture {...makeProps({ signerType: 'vendor', vendors, onSignatureChange })} />,
      );
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'v-2' } });
      fireEvent.change(screen.getByPlaceholderText('Name of person signing on behalf of vendor'), {
        target: { value: 'Pat Signer' },
      });

      const canvas = screen.getByLabelText('Signature canvas');
      drawStroke(canvas);
      expect(screen.getByRole('button', { name: 'Accept Signature' })).not.toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: 'Accept Signature' }));
      expect(onSignatureChange).toHaveBeenCalledTimes(1);
      const [entry] = onSignatureChange.mock.calls[0] as [DiarySignatureEntry];
      expect(entry.signerName).toBe('BuildCo (Pat Signer)');
    });

    it('shows a validation hint when vendor info is missing after drawing a stroke', () => {
      render(<SignatureCapture {...makeProps({ signerType: 'vendor', vendors })} />);
      const canvas = screen.getByLabelText('Signature canvas');
      drawStroke(canvas);
      expect(screen.getByText('Both vendor and signatory name are required')).toBeInTheDocument();
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
});
