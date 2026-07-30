/**
 * Unit tests for client/src/pages/ReportWizardPage/Step4Options.tsx
 *
 * Covers: toggle defaults/wiring, disabled-with-title cover letter checkbox, action wiring per
 * use case (download always; claim-only mark-claimed/finish-without-marking; Paperless-gated
 * upload), claim-error banner, and the claim-success banner + "view invoices" link.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, jest } from '@jest/globals';
import { MemoryRouter } from 'react-router-dom';
import type { TFunction } from 'i18next';
import type { PaperlessStatusResponse, SourceReportType } from '@cornerstone/shared';
import { Step4Options } from './Step4Options.js';

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}::${JSON.stringify(opts)}` : key) as unknown as TFunction;

function baseProps() {
  return {
    attachDocuments: true,
    onAttachDocumentsChange: jest.fn(),
    includeCoverLetter: false,
    onIncludeCoverLetterChange: jest.fn(),
    coverLetterDisabled: false,
    useCase: 'claim' as SourceReportType,
    paperlessStatus: null as PaperlessStatusResponse | null,
    isMarkingClaimed: false,
    claimError: null as string | null,
    claimSuccess: false,
    claimedCount: 0,
    finishedWithoutMarking: false,
    selectedInvoiceCount: 3,
    onDownload: jest.fn(),
    onMarkClaimed: jest.fn(),
    onFinishWithoutMarking: jest.fn(),
    onUploadPaperless: jest.fn(),
    isSaving: false,
    t,
  };
}

function renderStep4(props: ReturnType<typeof baseProps> & Record<string, unknown>) {
  return render(
    <MemoryRouter>
      <Step4Options {...props} />
    </MemoryRouter>,
  );
}

const markClaimedName = (count: number) => `sourceReports.markClaimed::{"count":${count}}`;

describe('Step4Options', () => {
  it('renders both option checkboxes with the given checked state', () => {
    renderStep4({ ...baseProps(), attachDocuments: true, includeCoverLetter: false });
    const attach = screen.getByLabelText('sourceReports.attachDocuments') as HTMLInputElement;
    const cover = screen.getByLabelText('sourceReports.includeCoverLetter') as HTMLInputElement;
    expect(attach.checked).toBe(true);
    expect(cover.checked).toBe(false);
  });

  it('calls onAttachDocumentsChange with the new checked value when toggled', () => {
    const onAttachDocumentsChange = jest.fn();
    renderStep4({
      ...baseProps(),
      attachDocuments: true,
      onAttachDocumentsChange,
    });
    fireEvent.click(screen.getByLabelText('sourceReports.attachDocuments'));
    expect(onAttachDocumentsChange).toHaveBeenCalledWith(false);
  });

  it('calls onIncludeCoverLetterChange with the new checked value when toggled', () => {
    const onIncludeCoverLetterChange = jest.fn();
    renderStep4({
      ...baseProps(),
      includeCoverLetter: false,
      coverLetterDisabled: false,
      onIncludeCoverLetterChange,
    });
    fireEvent.click(screen.getByLabelText('sourceReports.includeCoverLetter'));
    expect(onIncludeCoverLetterChange).toHaveBeenCalledWith(true);
  });

  it('disables the cover-letter checkbox and shows a title hint when coverLetterDisabled is true', () => {
    renderStep4({ ...baseProps(), coverLetterDisabled: true });
    const cover = screen.getByLabelText('sourceReports.includeCoverLetter') as HTMLInputElement;
    expect(cover.disabled).toBe(true);
    expect(cover).toHaveAttribute('title', 'sourceReports.coverLetterDisabledReason');
  });

  it('leaves the cover-letter checkbox enabled with no title hint when coverLetterDisabled is false', () => {
    renderStep4({ ...baseProps(), coverLetterDisabled: false });
    const cover = screen.getByLabelText('sourceReports.includeCoverLetter') as HTMLInputElement;
    expect(cover.disabled).toBe(false);
    expect(cover).not.toHaveAttribute('title');
  });

  it('always renders the Download button and calls onDownload when clicked', () => {
    const onDownload = jest.fn();
    renderStep4({ ...baseProps(), onDownload, useCase: 'budget-overview' });
    const btn = screen.getByRole('button', { name: 'sourceReports.download' });
    fireEvent.click(btn);
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it('does NOT render claim-only actions for the budget-overview use case', () => {
    renderStep4({ ...baseProps(), useCase: 'budget-overview' });
    expect(screen.queryByRole('button', { name: markClaimedName(3) })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'sourceReports.finishWithoutMarking' }),
    ).not.toBeInTheDocument();
  });

  it('does NOT render claim-only actions for the proof-of-funds use case', () => {
    renderStep4({ ...baseProps(), useCase: 'proof-of-funds' });
    expect(screen.queryByRole('button', { name: markClaimedName(3) })).not.toBeInTheDocument();
  });

  it('renders "Mark claimed" and "Finish without marking" only for the claim use case', () => {
    renderStep4({ ...baseProps(), useCase: 'claim' });
    expect(screen.getByRole('button', { name: markClaimedName(3) })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'sourceReports.finishWithoutMarking' }),
    ).toBeInTheDocument();
  });

  it('interpolates selectedInvoiceCount into the "Mark claimed" button label', () => {
    renderStep4({ ...baseProps(), useCase: 'claim', selectedInvoiceCount: 7 });
    expect(screen.getByRole('button', { name: markClaimedName(7) })).toBeInTheDocument();
  });

  it('calls onMarkClaimed when "Mark claimed" is clicked', () => {
    const onMarkClaimed = jest.fn();
    renderStep4({ ...baseProps(), useCase: 'claim', onMarkClaimed });
    fireEvent.click(screen.getByRole('button', { name: markClaimedName(3) }));
    expect(onMarkClaimed).toHaveBeenCalledTimes(1);
  });

  it('calls onFinishWithoutMarking when "Finish without marking" is clicked', () => {
    const onFinishWithoutMarking = jest.fn();
    renderStep4({ ...baseProps(), useCase: 'claim', onFinishWithoutMarking });
    fireEvent.click(screen.getByRole('button', { name: 'sourceReports.finishWithoutMarking' }));
    expect(onFinishWithoutMarking).toHaveBeenCalledTimes(1);
  });

  it('disables "Mark claimed" while isMarkingClaimed is true', () => {
    renderStep4({ ...baseProps(), useCase: 'claim', isMarkingClaimed: true });
    expect(screen.getByRole('button', { name: markClaimedName(3) })).toBeDisabled();
  });

  it('disables Download/Mark-claimed/Finish while isSaving is true', () => {
    renderStep4({ ...baseProps(), useCase: 'claim', isSaving: true });
    expect(screen.getByRole('button', { name: 'sourceReports.download' })).toBeDisabled();
    expect(screen.getByRole('button', { name: markClaimedName(3) })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'sourceReports.finishWithoutMarking' }),
    ).toBeDisabled();
  });

  describe('Paperless upload gating', () => {
    it('hides the Upload button when paperlessStatus is null', () => {
      renderStep4({ ...baseProps(), paperlessStatus: null });
      expect(
        screen.queryByRole('button', { name: 'sourceReports.uploadPaperless' }),
      ).not.toBeInTheDocument();
    });

    it('hides the Upload button when configured is false', () => {
      renderStep4({
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
        screen.queryByRole('button', { name: 'sourceReports.uploadPaperless' }),
      ).not.toBeInTheDocument();
    });

    it('hides the Upload button when configured but not reachable', () => {
      renderStep4({
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
        screen.queryByRole('button', { name: 'sourceReports.uploadPaperless' }),
      ).not.toBeInTheDocument();
    });

    it('shows the Upload button when configured and reachable', () => {
      renderStep4({
        ...baseProps(),
        paperlessStatus: {
          configured: true,
          reachable: true,
          error: null,
          paperlessUrl: null,
          filterTag: null,
        },
      });
      expect(
        screen.getByRole('button', { name: 'sourceReports.uploadPaperless' }),
      ).toBeInTheDocument();
    });

    it('calls onUploadPaperless when the Upload button is clicked', () => {
      const onUploadPaperless = jest.fn();
      renderStep4({
        ...baseProps(),
        paperlessStatus: {
          configured: true,
          reachable: true,
          error: null,
          paperlessUrl: null,
          filterTag: null,
        },
        onUploadPaperless,
      });
      fireEvent.click(screen.getByRole('button', { name: 'sourceReports.uploadPaperless' }));
      expect(onUploadPaperless).toHaveBeenCalledTimes(1);
    });
  });

  it('renders the claim error banner when claimError is set', () => {
    renderStep4({ ...baseProps(), claimError: 'Something went wrong' });
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders no error banner when claimError is null', () => {
    const { container } = renderStep4({ ...baseProps(), claimError: null });
    expect(container.querySelector('.formErrorBanner')).not.toBeInTheDocument();
  });

  describe('claimSuccess', () => {
    it('replaces the action buttons with a success banner when claimSuccess is true', () => {
      renderStep4({ ...baseProps(), useCase: 'claim', claimSuccess: true });
      expect(
        screen.queryByRole('button', { name: 'sourceReports.download' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: markClaimedName(3) })).not.toBeInTheDocument();
    });

    it('interpolates the real claimedCount into the success banner text', () => {
      renderStep4({ ...baseProps(), useCase: 'claim', claimSuccess: true, claimedCount: 5 });
      expect(screen.getByText('sourceReports.claimSuccess::{"count":5}')).toBeInTheDocument();
    });

    it('renders a link to /budget/invoices in the success banner', () => {
      renderStep4({ ...baseProps(), useCase: 'claim', claimSuccess: true, claimedCount: 5 });
      const link = screen.getByRole('link', { name: 'sourceReports.viewInvoices' });
      expect(link).toHaveAttribute('href', '/budget/invoices');
    });
  });
});
