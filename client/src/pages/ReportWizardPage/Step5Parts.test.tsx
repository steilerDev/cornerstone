/**
 * Unit tests for Step5Parts.tsx (story #2161): preparing / error / ready / stale states, the
 * warning banners, the generated-files list and the upload summaries. Real English strings.
 */
import { createRef } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, jest } from '@jest/globals';
import i18n from 'i18next';
import type { TFunction } from 'i18next';
import { formatFileSizeDecimal } from '../../lib/formatters.js';
import type {
  GeneratedReportParts,
  GeneratedReportPart,
  ReportPartWarning,
} from '../../lib/reportPdf/types.js';
import { Step5Parts, type PartUploadStatus, type UploadSummary } from './Step5Parts.js';
import type { PartsStatus } from './useReportParts.js';

const t = i18n.getFixedT('en', 'budget') as unknown as TFunction;
const formatSize = (bytes: number) => formatFileSizeDecimal(bytes, 'en-US');

function makePart(index: number, overrides: Partial<GeneratedReportPart> = {}) {
  return {
    index,
    blob: new Blob(['x']),
    size: 1_000_000,
    attachmentKeys: ['a:1', 'a:2'],
    invoiceIds: ['inv-1'],
    overLimit: false,
    ...overrides,
  } satisfies GeneratedReportPart;
}

function makeResult(
  partCount: number,
  warnings: ReportPartWarning[] = [],
  partOverrides: Record<number, Partial<GeneratedReportPart>> = {},
): GeneratedReportParts {
  return {
    parts: Array.from({ length: partCount }, (_, i) => makePart(i, partOverrides[i])),
    skippedDocuments: [],
    warnings,
    limitBytes: 1_000_000,
  };
}

interface Overrides {
  status?: PartsStatus;
  result?: GeneratedReportParts | null;
  fileNames?: string[];
  uploadStatus?: ReadonlyMap<number, PartUploadStatus>;
  uploadSummary?: UploadSummary | null;
  actionsDisabled?: boolean;
}

function renderParts(overrides: Overrides = {}) {
  const result = overrides.result === undefined ? makeResult(3) : overrides.result;
  const handlers = {
    onDownloadPart: jest.fn(),
    onUpdateFiles: jest.fn(),
    onRetryGenerate: jest.fn(),
  };
  const headingRef = createRef<HTMLHeadingElement>();
  const view = render(
    <Step5Parts
      status={overrides.status ?? 'ready'}
      result={result}
      fileNames={
        overrides.fileNames ?? ['r-part-1-of-3.pdf', 'r-part-2-of-3.pdf', 'r-part-3-of-3.pdf']
      }
      uploadStatus={overrides.uploadStatus ?? new Map()}
      uploadSummary={overrides.uploadSummary ?? null}
      actionsDisabled={overrides.actionsDisabled ?? false}
      formatSize={formatSize}
      headingRef={headingRef}
      t={t}
      {...handlers}
    />,
  );
  return { ...handlers, headingRef, ...view };
}

describe('Step5Parts', () => {
  describe('status gating', () => {
    it('shows only a "Preparing files…" status while preparing', () => {
      renderParts({ status: 'preparing' });

      expect(screen.getByRole('status')).toHaveTextContent('Preparing files…');
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });

    it('shows the generation-failed banner and a Retry button on error', () => {
      const { onRetryGenerate } = renderParts({ status: 'error' });

      expect(screen.getByRole('alert')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(onRetryGenerate).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });

    it('renders only the empty persistent status node when idle', () => {
      renderParts({ status: 'idle' });

      expect(screen.getByRole('status')).toBeEmptyDOMElement();
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('renders only the empty persistent status node when ready but there is no result yet', () => {
      renderParts({ status: 'ready', result: null });

      expect(screen.getByRole('status')).toBeEmptyDOMElement();
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('keeps the same status node mounted across preparing and ready, updating its text', () => {
      const view = renderParts({ status: 'idle' });
      const node = screen.getByRole('status');
      expect(node).toBeEmptyDOMElement();

      view.rerender(
        <Step5Parts
          status="preparing"
          result={null}
          fileNames={[]}
          uploadStatus={new Map()}
          uploadSummary={null}
          actionsDisabled={false}
          formatSize={formatSize}
          headingRef={view.headingRef}
          t={t}
          onDownloadPart={view.onDownloadPart}
          onUpdateFiles={view.onUpdateFiles}
          onRetryGenerate={view.onRetryGenerate}
        />,
      );

      expect(screen.getByRole('status')).toBe(node);
      expect(node).toHaveTextContent('Preparing files…');
    });
  });

  describe('file list', () => {
    it('lists each generated file with its name, size, attachment count and summary', () => {
      renderParts({
        result: makeResult(3, [], { 1: { size: 600_000, attachmentKeys: ['a:3'] } }),
      });

      expect(
        screen.getByRole('heading', { level: 3, name: 'Generated files' }),
      ).toBeInTheDocument();
      expect(screen.getByText('3 files, 2.6 MB in total')).toBeInTheDocument();
      expect(screen.getAllByRole('listitem')).toHaveLength(3);
      expect(screen.getByText('r-part-1-of-3.pdf')).toBeInTheDocument();
      expect(screen.getByText('Part 1 of 3 · 1.0 MB · 2 attachments')).toBeInTheDocument();
      expect(screen.getByText('Part 2 of 3 · 600.0 kB · 1 attachment')).toBeInTheDocument();
    });

    it('attaches headingRef to the list heading', () => {
      const { headingRef } = renderParts();

      expect(headingRef.current).toBe(screen.getByRole('heading', { name: 'Generated files' }));
    });

    it('hides the list when there is a single part (N = 1)', () => {
      renderParts({ result: makeResult(1), fileNames: ['report.pdf'] });

      expect(screen.queryByRole('list')).not.toBeInTheDocument();
      expect(screen.queryByText('Generated files')).not.toBeInTheDocument();
    });

    it('still shows warnings when there is a single part', () => {
      renderParts({
        result: makeResult(1, [
          {
            kind: 'reportExceedsLimit',
            size: 2_000_000,
            limitBytes: 1_000_000,
            hasAttachments: false,
          },
        ]),
        fileNames: ['report.pdf'],
      });

      expect(
        screen.getByText('The report (2.0 MB) is larger than the 1.0 MB limit.'),
      ).toBeInTheDocument();
    });

    it('triggers onDownloadPart with the zero-based index and names the file in the aria-label', () => {
      const { onDownloadPart } = renderParts();

      fireEvent.click(screen.getByRole('button', { name: 'Download r-part-2-of-3.pdf' }));

      expect(onDownloadPart).toHaveBeenCalledTimes(1);
      expect(onDownloadPart).toHaveBeenCalledWith(1);
    });

    it('uses an empty name when fewer file names than parts are provided', () => {
      renderParts({ fileNames: ['only-first.pdf'] });

      expect(screen.getByText('only-first.pdf')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Download' })).toHaveLength(2);
    });

    it('disables every per-row download while another action is running', () => {
      renderParts({ actionsDisabled: true });

      for (const button of screen.getAllByRole('button', { name: /^Download / })) {
        expect(button).toBeDisabled();
      }
    });
  });

  describe('badges', () => {
    it('shows "Over limit" only on over-limit parts', () => {
      renderParts({ result: makeResult(3, [], { 2: { overLimit: true } }) });

      const rows = screen.getAllByRole('listitem');
      expect(within(rows[0]!).queryByText('Over limit')).not.toBeInTheDocument();
      expect(within(rows[2]!).getByText('Over limit')).toBeInTheDocument();
    });

    it('shows Uploaded / Failed badges and the failure reason from the upload status', () => {
      renderParts({
        uploadStatus: new Map<number, PartUploadStatus>([
          [0, { state: 'uploaded' }],
          [1, { state: 'failed', reason: 'Paperless unreachable' }],
        ]),
      });

      const rows = screen.getAllByRole('listitem');
      expect(within(rows[0]!).getByText('Uploaded')).toBeInTheDocument();
      expect(within(rows[1]!).getByText('Failed')).toBeInTheDocument();
      expect(within(rows[1]!).getByText('Failed: Paperless unreachable')).toBeInTheDocument();
      expect(within(rows[2]!).queryByText('Uploaded')).not.toBeInTheDocument();
      expect(within(rows[2]!).queryByText('Failed')).not.toBeInTheDocument();
    });

    it('can show Over limit together with an upload badge on the same row', () => {
      renderParts({
        result: makeResult(3, [], { 0: { overLimit: true } }),
        uploadStatus: new Map<number, PartUploadStatus>([[0, { state: 'uploaded' }]]),
      });

      const first = screen.getAllByRole('listitem')[0]!;
      expect(within(first).getByText('Over limit')).toBeInTheDocument();
      expect(within(first).getByText('Uploaded')).toBeInTheDocument();
    });
  });

  describe('warnings', () => {
    it('renders the oversized-attachment warning naming vendor, invoice, document, size and limit', () => {
      renderParts({
        result: makeResult(3, [
          {
            kind: 'oversizedAttachment',
            invoiceId: 'inv-1',
            vendorName: 'ACME',
            invoiceNumber: 'INV-001',
            documentId: 5,
            documentTitle: 'Big scan.pdf',
            size: 1_500_000,
            limitBytes: 1_000_000,
          },
        ]),
      });

      expect(
        screen.getByText(
          'Invoice ACME INV-001: Big scan.pdf is 1.5 MB, larger than the 1.0 MB limit. It is placed in its own file.',
        ),
      ).toBeInTheDocument();
    });

    it('falls back to "Document {id}" and an em dash when title and invoice number are missing', () => {
      renderParts({
        result: makeResult(3, [
          {
            kind: 'oversizedAttachment',
            invoiceId: 'inv-1',
            vendorName: 'ACME',
            invoiceNumber: null,
            documentId: 5,
            documentTitle: null,
            size: 1_500_000,
            limitBytes: 1_000_000,
          },
        ]),
      });

      expect(
        screen.getByText(
          'Invoice ACME —: Document 5 is 1.5 MB, larger than the 1.0 MB limit. It is placed in its own file.',
        ),
      ).toBeInTheDocument();
    });

    it('renders the report-exceeds-limit warning when there are attachments', () => {
      renderParts({
        result: makeResult(3, [
          {
            kind: 'reportExceedsLimit',
            size: 2_000_000,
            limitBytes: 1_000_000,
            hasAttachments: true,
          },
        ]),
      });

      expect(
        screen.getByText(
          'The report pages alone (2.0 MB) are larger than the 1.0 MB limit. The first file contains only the report; all attachments are in the following files.',
        ),
      ).toBeInTheDocument();
    });

    it('renders the no-attachments variant of the report-exceeds-limit warning', () => {
      renderParts({
        result: makeResult(1, [
          {
            kind: 'reportExceedsLimit',
            size: 2_000_000,
            limitBytes: 1_000_000,
            hasAttachments: false,
          },
        ]),
        fileNames: ['r.pdf'],
      });

      expect(
        screen.getByText('The report (2.0 MB) is larger than the 1.0 MB limit.'),
      ).toBeInTheDocument();
    });

    it('renders the part-over-limit warning with a one-based part number', () => {
      renderParts({
        result: makeResult(3, [
          { kind: 'partOverLimit', partIndex: 1, size: 1_200_000, limitBytes: 1_000_000 },
        ]),
      });

      expect(screen.getByText('File 2 is 1.2 MB, over the 1.0 MB limit.')).toBeInTheDocument();
    });

    it('renders several warnings of different kinds side by side', () => {
      renderParts({
        result: makeResult(3, [
          { kind: 'partOverLimit', partIndex: 0, size: 1_200_000, limitBytes: 1_000_000 },
          { kind: 'partOverLimit', partIndex: 2, size: 1_300_000, limitBytes: 1_000_000 },
        ]),
      });

      expect(screen.getByText('File 1 is 1.2 MB, over the 1.0 MB limit.')).toBeInTheDocument();
      expect(screen.getByText('File 3 is 1.3 MB, over the 1.0 MB limit.')).toBeInTheDocument();
    });
  });

  describe('stale state', () => {
    it('shows the stale notice and "Update files", and disables per-row downloads', () => {
      const { onUpdateFiles } = renderParts({ status: 'stale' });

      expect(
        screen.getByText(
          'The report changed since the files were prepared. They are regenerated on the next preview, download or upload.',
        ),
      ).toBeInTheDocument();
      for (const button of screen.getAllByRole('button', { name: /^Download / })) {
        expect(button).toBeDisabled();
      }
      fireEvent.click(screen.getByRole('button', { name: 'Update files' }));
      expect(onUpdateFiles).toHaveBeenCalledTimes(1);
    });

    it('disables "Update files" while another action runs', () => {
      renderParts({ status: 'stale', actionsDisabled: true });

      expect(screen.getByRole('button', { name: 'Update files' })).toBeDisabled();
    });

    it('does not mark the stale notice as a live region', () => {
      renderParts({ status: 'stale' });

      const notice = screen.getByText(/The report changed since the files were prepared/);
      expect(notice).not.toHaveAttribute('role');
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });

    it('disables per-file downloads and "Update files" while the parts are being prepared (actionsDisabled)', () => {
      renderParts({ status: 'stale', actionsDisabled: true });

      for (const button of screen.getAllByRole('button', { name: /^Download / })) {
        expect(button).toBeDisabled();
      }
      expect(screen.getByRole('button', { name: 'Update files' })).toBeDisabled();
    });

    it('shows no stale notice for a ready result', () => {
      renderParts({ status: 'ready' });

      expect(screen.queryByRole('button', { name: 'Update files' })).not.toBeInTheDocument();
      expect(screen.queryByText(/The report changed since/)).not.toBeInTheDocument();
    });

    it('shows no stale notice or "Update files" when there is a single part (N = 1)', () => {
      renderParts({ status: 'stale', result: makeResult(1), fileNames: ['r.pdf'] });

      expect(screen.queryByRole('button', { name: 'Update files' })).not.toBeInTheDocument();
      expect(screen.queryByText(/The report changed since/)).not.toBeInTheDocument();
    });
  });

  describe('upload summary', () => {
    it('shows the partial-failure summary as an alert', () => {
      renderParts({ uploadSummary: { kind: 'failure', failed: 1, total: 3 } });

      expect(screen.getByRole('alert')).toHaveTextContent('1 of 3 files failed to upload.');
    });

    it('shows the plural success summary', () => {
      renderParts({ uploadSummary: { kind: 'success', count: 3 } });

      expect(screen.getByText('3 files uploaded to Paperless.')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('shows nothing for a null summary', () => {
      renderParts({ uploadSummary: null });

      expect(screen.queryByText(/uploaded to Paperless/)).not.toBeInTheDocument();
      expect(screen.queryByText(/failed to upload/)).not.toBeInTheDocument();
    });
  });
});
