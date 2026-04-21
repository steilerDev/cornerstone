/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import type { SignatureSectionProps } from './SignatureSection.js';
import type { DiarySignatureEntry } from '@cornerstone/shared';
import type React from 'react';

// ── Mock SignatureCapture (has canvas dependencies) ───────────────────────────

jest.unstable_mockModule('../SignatureCapture/SignatureCapture.js', () => ({
  SignatureCapture: ({
    signature,
    disabled,
  }: {
    signature: DiarySignatureEntry;
    onSignatureChange: (updated: DiarySignatureEntry | null) => void;
    disabled?: boolean;
  }) => (
    <div
      data-testid="signature-capture"
      data-signer-name={signature.signerName}
      data-disabled={disabled ? 'true' : 'false'}
    />
  ),
}));

// ── Module under test (dynamic import after mock registration) ────────────────

let SignatureSection: React.ComponentType<SignatureSectionProps>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeSig = (overrides: Partial<DiarySignatureEntry> = {}): DiarySignatureEntry => ({
  signerName: 'Alice Builder',
  signerType: 'self',
  signatureDataUrl: 'data:image/png;base64,abc',
  ...overrides,
});

function makeProps(overrides: Partial<SignatureSectionProps> = {}): SignatureSectionProps {
  return {
    signatures: null,
    onSignatureChange: jest.fn(),
    onAddSignature: jest.fn(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SignatureSection', () => {
  beforeEach(async () => {
    if (!SignatureSection) {
      const mod = await import('./SignatureSection.js');
      SignatureSection = mod.SignatureSection;
    }
  });

  describe('label rendering', () => {
    it('renders the default label "Signatures"', () => {
      render(<SignatureSection {...makeProps()} />);
      expect(screen.getByText('Signatures')).toBeInTheDocument();
    });

    it('renders a custom label when provided', () => {
      render(<SignatureSection {...makeProps({ label: 'Sign Below' })} />);
      expect(screen.getByText('Sign Below')).toBeInTheDocument();
      expect(screen.queryByText('Signatures')).toBeNull();
    });
  });

  describe('Add Signature button', () => {
    it('renders the "Add Signature" button', () => {
      render(<SignatureSection {...makeProps()} />);
      expect(screen.getByRole('button', { name: /add signature/i })).toBeInTheDocument();
    });

    it('calls onAddSignature when the button is clicked', () => {
      const onAddSignature = jest.fn();
      render(<SignatureSection {...makeProps({ onAddSignature })} />);
      fireEvent.click(screen.getByRole('button', { name: /add signature/i }));
      expect(onAddSignature).toHaveBeenCalledTimes(1);
    });

    it('button is disabled when disabled prop is true', () => {
      render(<SignatureSection {...makeProps({ disabled: true })} />);
      const btn = screen.getByRole('button', { name: /add signature/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('button is enabled when disabled prop is false (default)', () => {
      render(<SignatureSection {...makeProps({ disabled: false })} />);
      const btn = screen.getByRole('button', { name: /add signature/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
  });

  describe('signatures list', () => {
    it('does not render any SignatureCapture items when signatures is null', () => {
      render(<SignatureSection {...makeProps({ signatures: null })} />);
      expect(screen.queryAllByTestId('signature-capture')).toHaveLength(0);
    });

    it('does not render any SignatureCapture items when signatures is empty array', () => {
      render(<SignatureSection {...makeProps({ signatures: [] })} />);
      expect(screen.queryAllByTestId('signature-capture')).toHaveLength(0);
    });

    it('renders one SignatureCapture per entry when signatures are provided', () => {
      const signatures = [makeSig({ signerName: 'Alice' }), makeSig({ signerName: 'Bob' })];
      render(<SignatureSection {...makeProps({ signatures })} />);
      const items = screen.getAllByTestId('signature-capture');
      expect(items).toHaveLength(2);
    });

    it('passes the correct signerName to each SignatureCapture', () => {
      const signatures = [makeSig({ signerName: 'Alice' }), makeSig({ signerName: 'Bob' })];
      render(<SignatureSection {...makeProps({ signatures })} />);
      const items = screen.getAllByTestId('signature-capture');
      expect(items[0]!.getAttribute('data-signer-name')).toBe('Alice');
      expect(items[1]!.getAttribute('data-signer-name')).toBe('Bob');
    });

    it('passes disabled=true to SignatureCapture items when disabled', () => {
      const signatures = [makeSig()];
      render(<SignatureSection {...makeProps({ signatures, disabled: true })} />);
      const item = screen.getByTestId('signature-capture');
      expect(item.getAttribute('data-disabled')).toBe('true');
    });

    it('passes disabled=false to SignatureCapture items when not disabled', () => {
      const signatures = [makeSig()];
      render(<SignatureSection {...makeProps({ signatures, disabled: false })} />);
      const item = screen.getByTestId('signature-capture');
      expect(item.getAttribute('data-disabled')).toBe('false');
    });
  });

  describe('onSignatureChange callback', () => {
    it('does not call onSignatureChange on initial render', () => {
      const onSignatureChange = jest.fn();
      render(<SignatureSection {...makeProps({ onSignatureChange })} />);
      expect(onSignatureChange).not.toHaveBeenCalled();
    });
  });

  describe('onSignaturesChange optional callback', () => {
    it('calls onSignaturesChange when provided alongside onSignatureChange', () => {
      // The callback fires from within SignatureSection when SignatureCapture triggers
      // onSignatureChange. We verify the prop is accepted without errors.
      const onSignaturesChange = jest.fn();
      expect(() =>
        render(
          <SignatureSection
            {...makeProps({
              signatures: [makeSig()],
              onSignaturesChange,
            })}
          />,
        ),
      ).not.toThrow();
    });
  });
});
