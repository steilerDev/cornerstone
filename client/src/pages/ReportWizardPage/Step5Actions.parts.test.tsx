/**
 * Unit tests for the multi-PDF additions to Step5Actions.tsx (story #2161): partCount,
 * retryFailedCount and statusMessage. Real English strings.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, jest } from '@jest/globals';
import { MemoryRouter } from 'react-router-dom';
import i18n from 'i18next';
import type { TFunction } from 'i18next';
import type { PaperlessStatusResponse } from '@cornerstone/shared';
import { Step5Actions } from './Step5Actions.js';

const t = i18n.getFixedT('en', 'budget') as unknown as TFunction;

const paperlessReady: PaperlessStatusResponse = {
  configured: true,
  reachable: true,
  error: null,
  paperlessUrl: 'https://paperless.example.com',
  filterTag: null,
};

interface Overrides {
  partCount?: number;
  retryFailedCount?: number;
  statusMessage?: string | null;
  paperlessStatus?: PaperlessStatusResponse | null;
  claimSuccess?: boolean;
  disabled?: boolean;
}

function renderActions(overrides: Overrides = {}) {
  const { claimSuccess = false, paperlessStatus = paperlessReady, ...rest } = overrides;
  return render(
    <MemoryRouter>
      <Step5Actions
        useCase="claim"
        paperlessStatus={paperlessStatus}
        isMarkingClaimed={false}
        claimError={null}
        claimSuccess={claimSuccess}
        claimedInvoiceCount={0}
        claimedDepositCount={0}
        finishedWithoutMarking={false}
        selectedInvoiceCount={3}
        onPreviewPdf={jest.fn()}
        onDownload={jest.fn()}
        onMarkClaimed={jest.fn()}
        onFinishWithoutMarking={jest.fn()}
        onUploadPaperless={jest.fn()}
        activeAction={null}
        t={t}
        {...rest}
      />
    </MemoryRouter>,
  );
}

describe('Step5Actions — multi-PDF labels and status', () => {
  it('keeps the single-file labels when partCount is not passed', () => {
    renderActions();

    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload to Paperless' })).toBeInTheDocument();
  });

  it('keeps the single-file labels for partCount = 1, even with a stale retry count', () => {
    renderActions({ partCount: 1, retryFailedCount: 2 });

    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload to Paperless' })).toBeInTheDocument();
  });

  it('labels the buttons "Download all (N PDFs)" and "Upload all (N) to Paperless" for N > 1', () => {
    renderActions({ partCount: 3 });

    expect(screen.getByRole('button', { name: 'Download all (3 PDFs)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload all (3) to Paperless' })).toBeInTheDocument();
  });

  it('labels the download button "Download all (2 PDFs)" for N = 2', () => {
    renderActions({ partCount: 2 });

    expect(screen.getByRole('button', { name: 'Download all (2 PDFs)' })).toBeInTheDocument();
  });

  it('turns the upload button into "Retry failed (k)" and makes it primary when parts failed', () => {
    renderActions({ partCount: 3, retryFailedCount: 1 });

    const retry = screen.getByRole('button', { name: 'Retry failed (1)' });
    expect(retry.className).toContain('btnPrimary');
    expect(screen.queryByRole('button', { name: 'Upload all (3) to Paperless' })).toBeNull();
  });

  it('keeps the upload button secondary when nothing failed', () => {
    renderActions({ partCount: 3, retryFailedCount: 0 });

    const upload = screen.getByRole('button', { name: 'Upload all (3) to Paperless' });
    expect(upload.className).toContain('btnSecondary');
    expect(upload.className).not.toContain('btnPrimary');
  });

  it('renders the transfer status message in a live region', () => {
    renderActions({ partCount: 3, statusMessage: 'Uploading 2 of 3…' });

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Uploading 2 of 3…');
    expect(status).toHaveAttribute('aria-atomic', 'true');
  });

  it('keeps an empty persistent status node mounted when statusMessage is null or omitted', () => {
    renderActions({ partCount: 3, statusMessage: null });

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('updates the same status node in place when the message is set', () => {
    const view = renderActions({ partCount: 3 });
    const node = screen.getByRole('status');
    expect(node).toBeEmptyDOMElement();

    view.rerender(
      <MemoryRouter>
        <Step5Actions
          useCase="claim"
          paperlessStatus={paperlessReady}
          isMarkingClaimed={false}
          claimError={null}
          claimSuccess={false}
          claimedInvoiceCount={0}
          claimedDepositCount={0}
          finishedWithoutMarking={false}
          selectedInvoiceCount={3}
          onPreviewPdf={jest.fn()}
          onDownload={jest.fn()}
          onMarkClaimed={jest.fn()}
          onFinishWithoutMarking={jest.fn()}
          onUploadPaperless={jest.fn()}
          activeAction={null}
          t={t}
          partCount={3}
          statusMessage="Downloading 1 of 3…"
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toBe(node);
    expect(node).toHaveTextContent('Downloading 1 of 3…');
  });

  it('disables Preview, Download all, Upload all and the claim buttons when disabled', () => {
    renderActions({ partCount: 3, disabled: true });

    expect(screen.getByRole('button', { name: 'Preview PDF' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download all (3 PDFs)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Upload all (3) to Paperless' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Mark/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /without marking/i })).toBeDisabled();
  });

  it('keeps the actions enabled when not disabled', () => {
    renderActions({ partCount: 3, disabled: false });

    expect(screen.getByRole('button', { name: 'Download all (3 PDFs)' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Preview PDF' })).toBeEnabled();
  });

  it('does not render the multi-part controls once the claim is marked (success view)', () => {
    renderActions({ partCount: 3, claimSuccess: true });

    expect(screen.queryByRole('button', { name: 'Download all (3 PDFs)' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('omits the upload button entirely when Paperless is not reachable', () => {
    renderActions({
      partCount: 3,
      paperlessStatus: { ...paperlessReady, reachable: false },
    });

    expect(screen.getByRole('button', { name: 'Download all (3 PDFs)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Paperless/ })).not.toBeInTheDocument();
  });
});
