/**
 * Unit tests for client/src/pages/ReportWizardPage/Step5Actions.tsx
 *
 * Story #1900 REWRITE. The on-demand generation model (preview/download/paperless each generate
 * their own PDF at click time, rather than a continuously-regenerated background blob) replaced
 * the old `isSaving`/`hasError`/`hasBlob` props entirely with a single `activeAction: 'preview' |
 * 'download' | 'paperless' | null` prop plus a new `onPreviewPdf` handler. Per the spec: "Preview
 * PDF" (btnSecondary) renders FIRST/leftmost, before Download; every action button disables
 * whenever ANY action is in flight (`activeAction !== null`), not just its own; each of
 * preview/download/paperless shows its own spinner only while IT is the active action.
 *
 * QA re-verification round (story #1900 fix batch): the spinner is now the shared `Spinner`
 * component (an `<svg role="img" aria-label="Loading">`), not a text glyph — spinner-presence
 * assertions below query `within(button).queryByRole('img')` instead of checking `textContent`
 * for a literal '⟳' character.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, jest } from '@jest/globals';
import { MemoryRouter } from 'react-router-dom';
import type { TFunction } from 'i18next';
import type { PaperlessStatusResponse, SourceReportType } from '@cornerstone/shared';
import { Step5Actions } from './Step5Actions.js';

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}::${JSON.stringify(opts)}` : key) as unknown as TFunction;

function baseProps() {
  return {
    useCase: 'claim' as SourceReportType,
    paperlessStatus: null as PaperlessStatusResponse | null,
    isMarkingClaimed: false,
    claimError: null as string | null,
    claimSuccess: false,
    claimedInvoiceCount: 0,
    claimedDepositCount: 0,
    finishedWithoutMarking: false,
    selectedInvoiceCount: 3,
    onPreviewPdf: jest.fn(),
    onDownload: jest.fn(),
    onMarkClaimed: jest.fn(),
    onFinishWithoutMarking: jest.fn(),
    onUploadPaperless: jest.fn(),
    activeAction: null as 'preview' | 'download' | 'paperless' | null,
    t,
  };
}

function renderStep5(props: ReturnType<typeof baseProps> & Record<string, unknown>) {
  return render(
    <MemoryRouter>
      <Step5Actions {...props} />
    </MemoryRouter>,
  );
}

const markClaimedName = (count: number) => `sourceReports.markClaimed::{"count":${count}}`;

const paperlessConfigured: PaperlessStatusResponse = {
  configured: true,
  reachable: true,
  error: null,
  paperlessUrl: null,
  filterTag: null,
};

describe('Step5Actions — Preview PDF button (first/leftmost, always rendered)', () => {
  it('renders the Preview PDF button and calls onPreviewPdf when clicked', () => {
    const onPreviewPdf = jest.fn();
    renderStep5({ ...baseProps(), onPreviewPdf });
    const btn = screen.getByRole('button', { name: 'sourceReports.editable.previewPdf' });
    fireEvent.click(btn);
    expect(onPreviewPdf).toHaveBeenCalledTimes(1);
  });

  it('renders Preview PDF as the FIRST button, before Download', () => {
    renderStep5(baseProps());
    const buttons = screen.getAllByRole('button');
    const previewIndex = buttons.findIndex((b) =>
      b.textContent?.includes('sourceReports.editable.previewPdf'),
    );
    const downloadIndex = buttons.findIndex((b) =>
      b.textContent?.includes('sourceReports.download'),
    );
    expect(previewIndex).toBeGreaterThanOrEqual(0);
    expect(downloadIndex).toBeGreaterThan(previewIndex);
  });

  it('is present for every use case (not claim-gated, unlike Mark Claimed)', () => {
    renderStep5({ ...baseProps(), useCase: 'budget-overview' });
    expect(
      screen.getByRole('button', { name: 'sourceReports.editable.previewPdf' }),
    ).toBeInTheDocument();
  });

  it('shows a spinner only while activeAction === "preview"', () => {
    const { rerender } = renderStep5({ ...baseProps(), activeAction: null });
    expect(
      within(screen.getByRole('button', { name: 'sourceReports.editable.previewPdf' })).queryByRole(
        'img',
        { hidden: true },
      ),
    ).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <Step5Actions {...baseProps()} activeAction="preview" />
      </MemoryRouter>,
    );
    expect(
      within(screen.getByRole('button', { name: /sourceReports.editable.previewPdf/ })).getByRole(
        'img',
        { hidden: true },
      ),
    ).toBeInTheDocument();
  });
});

describe('Step5Actions — Download button', () => {
  it('always renders the Download button and calls onDownload when clicked', () => {
    const onDownload = jest.fn();
    renderStep5({ ...baseProps(), onDownload, useCase: 'budget-overview' });
    const btn = screen.getByRole('button', { name: 'sourceReports.download' });
    fireEvent.click(btn);
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner only while activeAction === "download"', () => {
    renderStep5({ ...baseProps(), activeAction: 'download' });
    expect(
      within(screen.getByRole('button', { name: /sourceReports.download/ })).getByRole('img', {
        hidden: true,
      }),
    ).toBeInTheDocument();
  });

  it('does not show a spinner on Download while a different action is active', () => {
    renderStep5({ ...baseProps(), activeAction: 'preview' });
    expect(
      within(screen.getByRole('button', { name: 'sourceReports.download' })).queryByRole('img', {
        hidden: true,
      }),
    ).not.toBeInTheDocument();
  });
});

describe('Step5Actions — claim-only actions (Mark Claimed / Finish without marking)', () => {
  it('does NOT render claim-only actions for the budget-overview use case', () => {
    renderStep5({ ...baseProps(), useCase: 'budget-overview' });
    expect(screen.queryByRole('button', { name: markClaimedName(3) })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'sourceReports.finishWithoutMarking' }),
    ).not.toBeInTheDocument();
  });

  it('does NOT render claim-only actions for the proof-of-funds use case', () => {
    renderStep5({ ...baseProps(), useCase: 'proof-of-funds' });
    expect(screen.queryByRole('button', { name: markClaimedName(3) })).not.toBeInTheDocument();
  });

  it('renders "Mark claimed" and "Finish without marking" only for the claim use case', () => {
    renderStep5({ ...baseProps(), useCase: 'claim' });
    expect(screen.getByRole('button', { name: markClaimedName(3) })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'sourceReports.finishWithoutMarking' }),
    ).toBeInTheDocument();
  });

  it('interpolates selectedInvoiceCount into the "Mark claimed" button label', () => {
    renderStep5({ ...baseProps(), useCase: 'claim', selectedInvoiceCount: 7 });
    expect(screen.getByRole('button', { name: markClaimedName(7) })).toBeInTheDocument();
  });

  it('calls onMarkClaimed when "Mark claimed" is clicked', () => {
    const onMarkClaimed = jest.fn();
    renderStep5({ ...baseProps(), useCase: 'claim', onMarkClaimed });
    fireEvent.click(screen.getByRole('button', { name: markClaimedName(3) }));
    expect(onMarkClaimed).toHaveBeenCalledTimes(1);
  });

  it('calls onFinishWithoutMarking when "Finish without marking" is clicked', () => {
    const onFinishWithoutMarking = jest.fn();
    renderStep5({ ...baseProps(), useCase: 'claim', onFinishWithoutMarking });
    fireEvent.click(screen.getByRole('button', { name: 'sourceReports.finishWithoutMarking' }));
    expect(onFinishWithoutMarking).toHaveBeenCalledTimes(1);
  });

  it('disables "Mark claimed" while isMarkingClaimed is true', () => {
    renderStep5({ ...baseProps(), useCase: 'claim', isMarkingClaimed: true });
    expect(screen.getByRole('button', { name: markClaimedName(3) })).toBeDisabled();
  });
});

describe('Step5Actions — activeAction disables every action uniformly (per-action spinners)', () => {
  it('all actions are enabled by default (activeAction: null)', () => {
    renderStep5({ ...baseProps(), useCase: 'claim', paperlessStatus: paperlessConfigured });
    expect(screen.getByRole('button', { name: 'sourceReports.editable.previewPdf' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'sourceReports.download' })).toBeEnabled();
    expect(screen.getByRole('button', { name: markClaimedName(3) })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'sourceReports.finishWithoutMarking' }),
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: /sourceReports.uploadPaperless/ })).toBeEnabled();
  });

  it.each(['preview', 'download', 'paperless'] as const)(
    'disables every action button when activeAction is "%s" (not just the active one)',
    (active) => {
      renderStep5({
        ...baseProps(),
        useCase: 'claim',
        activeAction: active,
        paperlessStatus: paperlessConfigured,
      });
      expect(
        screen.getByRole('button', { name: /sourceReports.editable.previewPdf/ }),
      ).toBeDisabled();
      expect(screen.getByRole('button', { name: /sourceReports.download/ })).toBeDisabled();
      expect(screen.getByRole('button', { name: markClaimedName(3) })).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'sourceReports.finishWithoutMarking' }),
      ).toBeDisabled();
      expect(screen.getByRole('button', { name: /sourceReports.uploadPaperless/ })).toBeDisabled();
    },
  );

  it('a click on a disabled action (activeAction set) does not invoke its handler', () => {
    const onDownload = jest.fn();
    renderStep5({ ...baseProps(), useCase: 'claim', activeAction: 'preview', onDownload });
    fireEvent.click(screen.getByRole('button', { name: /sourceReports.download/ }));
    expect(onDownload).not.toHaveBeenCalled();
  });
});

describe('Step5Actions — Paperless upload gating', () => {
  it('hides the Upload button when paperlessStatus is null', () => {
    renderStep5({ ...baseProps(), paperlessStatus: null });
    expect(
      screen.queryByRole('button', { name: /sourceReports.uploadPaperless/ }),
    ).not.toBeInTheDocument();
  });

  it('hides the Upload button when configured is false', () => {
    renderStep5({
      ...baseProps(),
      paperlessStatus: {
        configured: false,
        reachable: false,
        error: null,
        paperlessUrl: null,
        filterTag: null,
      },
    });
    expect(
      screen.queryByRole('button', { name: /sourceReports.uploadPaperless/ }),
    ).not.toBeInTheDocument();
  });

  it('hides the Upload button when configured but not reachable', () => {
    renderStep5({
      ...baseProps(),
      paperlessStatus: {
        configured: true,
        reachable: false,
        error: 'timeout',
        paperlessUrl: null,
        filterTag: null,
      },
    });
    expect(
      screen.queryByRole('button', { name: /sourceReports.uploadPaperless/ }),
    ).not.toBeInTheDocument();
  });

  it('shows the Upload button when configured and reachable', () => {
    renderStep5({ ...baseProps(), paperlessStatus: paperlessConfigured });
    expect(
      screen.getByRole('button', { name: /sourceReports.uploadPaperless/ }),
    ).toBeInTheDocument();
  });

  it('calls onUploadPaperless when the Upload button is clicked', () => {
    const onUploadPaperless = jest.fn();
    renderStep5({ ...baseProps(), paperlessStatus: paperlessConfigured, onUploadPaperless });
    fireEvent.click(screen.getByRole('button', { name: /sourceReports.uploadPaperless/ }));
    expect(onUploadPaperless).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner only while activeAction === "paperless"', () => {
    renderStep5({
      ...baseProps(),
      paperlessStatus: paperlessConfigured,
      activeAction: 'paperless',
    });
    expect(
      within(screen.getByRole('button', { name: /sourceReports.uploadPaperless/ })).getByRole(
        'img',
        { hidden: true },
      ),
    ).toBeInTheDocument();
  });
});

describe('Step5Actions — claim error banner', () => {
  it('renders the claim error banner when claimError is set', () => {
    renderStep5({ ...baseProps(), claimError: 'Something went wrong' });
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders no error banner when claimError is null', () => {
    const { container } = renderStep5({ ...baseProps(), claimError: null });
    expect(container.querySelector('.formErrorBanner')).not.toBeInTheDocument();
  });
});

describe('Step5Actions — claimSuccess', () => {
  it('replaces the action buttons (including Preview PDF) with a success banner when claimSuccess is true', () => {
    renderStep5({ ...baseProps(), useCase: 'claim', claimSuccess: true });
    expect(
      screen.queryByRole('button', { name: /sourceReports.editable.previewPdf/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'sourceReports.download' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: markClaimedName(3) })).not.toBeInTheDocument();
  });

  it('interpolates the real claimedInvoiceCount/claimedDepositCount into the success banner text', () => {
    renderStep5({
      ...baseProps(),
      useCase: 'claim',
      claimSuccess: true,
      claimedInvoiceCount: 5,
      claimedDepositCount: 2,
    });
    expect(
      screen.getByText('sourceReports.claimSuccess::{"invoices":5,"deposits":2}'),
    ).toBeInTheDocument();
  });

  it('renders a link to /budget/invoices in the success banner', () => {
    renderStep5({
      ...baseProps(),
      useCase: 'claim',
      claimSuccess: true,
      claimedInvoiceCount: 5,
      claimedDepositCount: 2,
    });
    const link = screen.getByRole('link', { name: 'sourceReports.viewInvoices' });
    expect(link).toHaveAttribute('href', '/budget/invoices');
  });

  it('shows the distinct "finished without marking" success text instead of claimSuccess when finishedWithoutMarking is true', () => {
    renderStep5({
      ...baseProps(),
      useCase: 'claim',
      claimSuccess: true,
      finishedWithoutMarking: true,
      claimedInvoiceCount: 5,
      claimedDepositCount: 2,
    });
    expect(screen.getByText('sourceReports.finishedWithoutMarkingSuccess')).toBeInTheDocument();
    expect(
      screen.queryByText('sourceReports.claimSuccess::{"invoices":5,"deposits":2}'),
    ).not.toBeInTheDocument();
  });
});
