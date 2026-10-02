/**
 * Unit tests for Step4SizingPhase.tsx (story #2161): the progress card and the failure card shown
 * in place of the step 4 settings while attachment sizes are acquired. Real English strings.
 */
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, jest } from '@jest/globals';
import i18n from 'i18next';
import type { TFunction } from 'i18next';
import { Step4SizingPhase } from './Step4SizingPhase.js';
import type { SizingState } from './useReportParts.js';

const t = i18n.getFixedT('en', 'budget') as unknown as TFunction;

function renderPhase(sizing: SizingState, retryRef = createRef<HTMLButtonElement>()) {
  const handlers = {
    onCancel: jest.fn(),
    onRetry: jest.fn(),
    onContinue: jest.fn(),
    onBack: jest.fn(),
  };
  const view = render(<Step4SizingPhase sizing={sizing} retryRef={retryRef} t={t} {...handlers} />);
  return { ...handlers, retryRef, ...view };
}

describe('Step4SizingPhase', () => {
  it('renders nothing while idle', () => {
    const { container } = renderPhase({ phase: 'idle' });

    expect(container).toBeEmptyDOMElement();
  });

  describe('running', () => {
    it('shows the progress text in a live status region', () => {
      renderPhase({ phase: 'running', done: 2, total: 5 });

      const status = screen.getByRole('status');
      expect(status).toHaveTextContent('Checking attachment sizes… 2 of 5');
      expect(status).toHaveAttribute('aria-atomic', 'true');
    });

    it('hides the decorative spinner from assistive technology', () => {
      renderPhase({ phase: 'running', done: 1, total: 3 });

      expect(screen.queryByRole('img', { name: 'Loading' })).toBeNull();
    });

    it('renders a progress element with max, value and an accessible name', () => {
      renderPhase({ phase: 'running', done: 2, total: 5 });

      const progress = screen.getByRole('progressbar', {
        name: 'Checking attachment sizes… 2 of 5',
      });
      expect(progress).toHaveAttribute('max', '5');
      expect(progress).toHaveAttribute('value', '2');
    });

    it('calls onCancel from the Cancel button and offers no other actions', () => {
      const { onCancel } = renderPhase({ phase: 'running', done: 0, total: 3 });

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(screen.getAllByRole('button')).toHaveLength(1);
    });
  });

  describe('failed', () => {
    const failures = [
      {
        invoiceId: 'inv-1',
        documentId: 11,
        title: 'Scan.pdf',
        vendorName: 'ACME',
        invoiceNumber: 'INV-001',
      },
      {
        invoiceId: 'inv-2',
        documentId: 12,
        title: null,
        vendorName: 'Globex',
        invoiceNumber: null,
      },
    ];

    it('shows the plural failure banner and one line per failed document', () => {
      renderPhase({ phase: 'failed', failures });

      expect(screen.getByRole('alert')).toHaveTextContent(
        '2 attachments could not be loaded. Check the Paperless connection and try again, or continue without them.',
      );
      expect(screen.getByText('Scan.pdf (ACME, INV-001)')).toBeInTheDocument();
    });

    it('falls back to "Document {id}" for a missing title and an em dash for a missing invoice number', () => {
      renderPhase({ phase: 'failed', failures });

      expect(screen.getByText('Document 12 (Globex, —)')).toBeInTheDocument();
    });

    it('uses the singular banner for a single failure', () => {
      renderPhase({ phase: 'failed', failures: [failures[0]!] });

      expect(screen.getByRole('alert')).toHaveTextContent(
        '1 attachment could not be loaded. Check the Paperless connection and try again, or continue without it.',
      );
    });

    it('attaches retryRef to the Retry button', () => {
      const { retryRef } = renderPhase({ phase: 'failed', failures });

      expect(retryRef.current).toBe(screen.getByRole('button', { name: 'Retry' }));
    });

    it('wires Retry, "Continue without them" and Back to their callbacks', () => {
      const { onRetry, onContinue, onBack, onCancel } = renderPhase({ phase: 'failed', failures });

      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      fireEvent.click(screen.getByRole('button', { name: 'Continue without them' }));
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onContinue).toHaveBeenCalledTimes(1);
      expect(onBack).toHaveBeenCalledTimes(1);
      expect(onCancel).not.toHaveBeenCalled();
    });
  });
});
