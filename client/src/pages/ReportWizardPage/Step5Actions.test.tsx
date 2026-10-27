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
import i18n from '../../i18n/index.js';

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}::${JSON.stringify(opts)}` : key) as unknown as TFunction;

function baseProps() {
  return {
    useCase: 'claim' as SourceReportType,
    paperlessStatus: null as PaperlessStatusResponse | null,
    isMarkingClaimed: false,
    sourceId: 'src-1',
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

// The success banner nests two plural t() calls; the echo t() renders them as below.
const claimSuccessEcho = `sourceReports.claimSuccess::${JSON.stringify({
  invoices: 'sourceReports.invoiceCount::{"count":5}',
  progressPayments: 'sourceReports.progressPaymentCount::{"count":2}',
})}`;

const markClaimedName = (count: number) => `sourceReports.markSubmitted::{"count":${count}}`;

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

describe('Step5Actions — claimSuccess', () => {
  it('replaces only the "After you send it" block with the success banner; the report actions stay', () => {
    const { container } = renderStep5({ ...baseProps(), useCase: 'claim', claimSuccess: true });
    expect(
      screen.getByRole('button', { name: /sourceReports.editable.previewPdf/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'sourceReports.download' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: markClaimedName(3) })).not.toBeInTheDocument();
    expect(container.querySelector('section.afterSend')).toBeNull();
  });

  it('interpolates the real claimedInvoiceCount/claimedDepositCount into the success banner text', () => {
    renderStep5({
      ...baseProps(),
      useCase: 'claim',
      claimSuccess: true,
      claimedInvoiceCount: 5,
      claimedDepositCount: 2,
    });
    expect(screen.getByText(claimSuccessEcho)).toBeInTheDocument();
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
    expect(screen.queryByText(claimSuccessEcho)).not.toBeInTheDocument();
  });
});

// AC6 (D-36): real en/de resources, so the plural forms and the zero-state are exercised end to end.
describe('Step5Actions — Mark as submitted wording (AC6, real resources)', () => {
  const realT = i18n.getFixedT('en', 'budget') as unknown as TFunction;

  function renderReal(overrides: Record<string, unknown>, t_: TFunction = realT) {
    return renderStep5({ ...baseProps(), useCase: 'claim', t: t_, ...overrides });
  }

  it('reads "Mark 1 invoice as submitted" for one invoice', () => {
    renderReal({ selectedInvoiceCount: 1 });
    expect(screen.getByRole('button', { name: 'Mark 1 invoice as submitted' })).toBeEnabled();
  });

  it('reads "Mark 3 invoices as submitted" for several invoices', () => {
    renderReal({ selectedInvoiceCount: 3 });
    expect(screen.getByRole('button', { name: 'Mark 3 invoices as submitted' })).toBeEnabled();
  });

  it('states its reason and is disabled when no invoice is selected (never "0 invoices")', () => {
    renderReal({ selectedInvoiceCount: 0 });
    const button = screen.getByRole('button', { name: 'Mark as submitted' });
    // aria-disabled (not disabled) so the reason stays reachable by keyboard and screen reader
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription('Select at least one invoice in step 3.');
    expect(screen.queryByRole('button', { name: /Mark 0/ })).not.toBeInTheDocument();
  });

  it('does not call onMarkClaimed when the zero-state button is clicked', () => {
    const onMarkClaimed = jest.fn();
    renderReal({ selectedInvoiceCount: 0, onMarkClaimed });
    fireEvent.click(screen.getByRole('button', { name: 'Mark as submitted' }));
    expect(onMarkClaimed).not.toHaveBeenCalled();
  });

  it('success banner: "1 invoice and 2 progress payments marked as submitted"', () => {
    renderReal({ claimSuccess: true, claimedInvoiceCount: 1, claimedDepositCount: 2 });
    expect(
      screen.getByText('1 invoice and 2 progress payments marked as submitted'),
    ).toBeInTheDocument();
  });

  it('success banner pluralises both counts: "2 invoices and 1 progress payment ..."', () => {
    renderReal({ claimSuccess: true, claimedInvoiceCount: 2, claimedDepositCount: 1 });
    expect(
      screen.getByText('2 invoices and 1 progress payment marked as submitted'),
    ).toBeInTheDocument();
  });

  it('German button says "eingereicht"', () => {
    const deT = i18n.getFixedT('de', 'budget') as unknown as TFunction;
    renderReal({ selectedInvoiceCount: 2 }, deT);
    const button = screen.getByRole('button', { name: /eingereicht/ });
    expect(button).toHaveTextContent('2 Rechnungen als eingereicht markieren');
  });
});

// #2243 AC5: block structure, Mark styling and the success banner links.
describe('Step5Actions — two blocks, Mark as submitted and the success banner (#2243)', () => {
  it('renders the report actions and the after-send section as separate containers', () => {
    const { container } = renderStep5({ ...baseProps(), useCase: 'claim' });
    const getReport = container.querySelector('.getReport')!;
    const afterSend = container.querySelector('section.afterSend')!;
    expect(getReport).not.toBeNull();
    expect(afterSend).not.toBeNull();
    expect(getReport.contains(afterSend)).toBe(false);
    expect(afterSend.contains(getReport)).toBe(false);
    expect(
      within(getReport as HTMLElement).getByRole('button', { name: 'sourceReports.download' }),
    ).toBeInTheDocument();
    expect(within(afterSend as HTMLElement).getByRole('heading', { level: 3 })).toHaveTextContent(
      'sourceReports.afterSend.heading',
    );
    expect(afterSend).toHaveTextContent('sourceReports.afterSend.text::{"count":3}');
  });

  it('shows no after-send section for the other report types', () => {
    const { container } = renderStep5({ ...baseProps(), useCase: 'budget-overview' });
    expect(container.querySelector('section.afterSend')).toBeNull();
  });

  it('Download is the only primary of the step; Mark is secondary', () => {
    renderStep5({ ...baseProps(), useCase: 'claim' });
    const primaries = screen
      .getAllByRole('button')
      .filter((b) => b.className.includes('btnPrimary'));
    expect(primaries.map((b) => b.textContent)).toEqual(['sourceReports.download']);
    const mark = screen.getByRole('button', { name: markClaimedName(3) });
    expect(mark.className).toContain('btnSecondary');
  });

  it('Mark carries the inert style while aria-disabled at zero, and calls nothing', () => {
    const onMarkClaimed = jest.fn();
    renderStep5({ ...baseProps(), selectedInvoiceCount: 0, onMarkClaimed });
    const mark = screen.getByRole('button', { name: 'sourceReports.markSubmittedNone' });
    expect(mark).toHaveAttribute('aria-disabled', 'true');
    expect(mark.className).toContain('inertSecondary');
    expect(mark).toHaveAttribute('aria-describedby');
    expect(document.getElementById(mark.getAttribute('aria-describedby')!)).toHaveTextContent(
      'sourceReports.mark.zeroReason',
    );
    fireEvent.click(mark);
    expect(onMarkClaimed).not.toHaveBeenCalled();
  });

  it('an enabled Mark has no aria-disabled or description and calls onMarkClaimed', () => {
    const onMarkClaimed = jest.fn();
    renderStep5({ ...baseProps(), onMarkClaimed });
    const mark = screen.getByRole('button', { name: markClaimedName(3) });
    expect(mark).not.toHaveAttribute('aria-disabled');
    expect(mark).not.toHaveAttribute('aria-describedby');
    fireEvent.click(mark);
    expect(onMarkClaimed).toHaveBeenCalledTimes(1);
  });

  it('the success banner is a status with View invoices and Open History links', () => {
    renderStep5({
      ...baseProps(),
      sourceId: 'src-42',
      claimSuccess: true,
      claimedInvoiceCount: 2,
    });
    const banner = screen
      .getAllByRole('status')
      .find((el) => el.className.includes('bannerSuccess'))!;
    expect(
      within(banner).getByRole('link', { name: 'sourceReports.viewInvoices' }),
    ).toHaveAttribute('href', '/budget/invoices');
    expect(within(banner).getByRole('link', { name: 'sourceReports.openHistory' })).toHaveAttribute(
      'href',
      '/budget/financing/sources/src-42?tab=history',
    );
  });

  it('finishing without marking shows View invoices but no Open History', () => {
    renderStep5({ ...baseProps(), claimSuccess: true, finishedWithoutMarking: true });
    expect(screen.getByText('sourceReports.finishedWithoutMarkingSuccess')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'sourceReports.viewInvoices' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'sourceReports.openHistory' })).toBeNull();
  });
});
