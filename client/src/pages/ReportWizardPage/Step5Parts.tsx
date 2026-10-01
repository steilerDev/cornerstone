import type { Ref } from 'react';
import type { TFunction } from 'i18next';
import { Badge, type BadgeVariantMap } from '../../components/Badge/Badge.js';
import { FileList, type FileListItem } from '../../components/FileList/index.js';
import { FormError } from '../../components/FormError/FormError.js';
import { Spinner } from '../../components/Spinner/Spinner.js';
import type { GeneratedReportParts, ReportPartWarning } from '../../lib/reportPdf/types.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './ReportWizardPage.module.css';
import type { PartsStatus } from './useReportParts.js';

export type PartUploadStatus = { state: 'uploaded' } | { state: 'failed'; reason: string };

export type UploadSummary =
  { kind: 'success'; count: number } | { kind: 'failure'; failed: number; total: number };

interface Step5PartsProps {
  status: PartsStatus;
  result: GeneratedReportParts | null;
  fileNames: string[];
  uploadStatus: ReadonlyMap<number, PartUploadStatus>;
  uploadSummary: UploadSummary | null;
  onDownloadPart: (index: number) => void;
  onUpdateFiles: () => void;
  onRetryGenerate: () => void;
  actionsDisabled: boolean;
  formatSize: (bytes: number) => string;
  headingRef: Ref<HTMLHeadingElement>;
  t: TFunction;
}

function warningText(warning: ReportPartWarning, t: TFunction, formatSize: (b: number) => string) {
  const limit = formatSize(warning.limitBytes);
  switch (warning.kind) {
    case 'oversizedAttachment':
      return t('sourceReports.parts.warning.oversizedAttachment', {
        vendor: warning.vendorName,
        invoiceNumber: warning.invoiceNumber ?? '—',
        document:
          warning.documentTitle ??
          t('sourceReports.sizing.documentFallbackTitle', { id: warning.documentId }),
        size: formatSize(warning.size),
        limit,
      });
    case 'reportExceedsLimit':
      return warning.hasAttachments
        ? t('sourceReports.parts.warning.reportExceedsLimit', {
            size: formatSize(warning.size),
            limit,
          })
        : t('sourceReports.parts.warning.reportExceedsLimitNoAttachments', {
            size: formatSize(warning.size),
            limit,
          });
    case 'partOverLimit':
      return t('sourceReports.parts.warning.partOverLimit', {
        part: warning.partIndex + 1,
        size: formatSize(warning.size),
        limit,
      });
  }
}

function warningKey(warning: ReportPartWarning): string {
  switch (warning.kind) {
    case 'oversizedAttachment':
      return `${warning.kind}-${warning.invoiceId}-${warning.documentId}`;
    case 'partOverLimit':
      return `${warning.kind}-${warning.partIndex}`;
    case 'reportExceedsLimit':
      return warning.kind;
  }
}

export function Step5Parts({
  status,
  result,
  fileNames,
  uploadStatus,
  uploadSummary,
  onDownloadPart,
  onUpdateFiles,
  onRetryGenerate,
  actionsDisabled,
  formatSize,
  headingRef,
  t,
}: Step5PartsProps) {
  if (status === 'preparing') {
    return (
      <div className={styles.partsPreparing}>
        <span aria-hidden="true">
          <Spinner size="sm" color="muted" />
        </span>
        <p role="status">{t('sourceReports.parts.preparing')}</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={styles.partsStack}>
        <FormError message={t('sourceReports.previewGenerationFailed')} />
        <div>
          <button type="button" className={sharedStyles.btnSecondary} onClick={onRetryGenerate}>
            {t('common:button.retry')}
          </button>
        </div>
      </div>
    );
  }

  if ((status !== 'ready' && status !== 'stale') || !result) return null;

  const isStale = status === 'stale';
  const total = result.parts.length;

  const badgeVariants: BadgeVariantMap = {
    uploaded: {
      label: t('sourceReports.parts.status.uploaded'),
      className: styles.partBadgeUploaded,
    },
    failed: { label: t('sourceReports.parts.status.failed'), className: styles.partBadgeFailed },
    overLimit: {
      label: t('sourceReports.parts.status.overLimit'),
      className: styles.partBadgeOverLimit,
    },
  };

  const items: FileListItem[] = result.parts.map((part, i) => {
    const upload = uploadStatus.get(i);
    const name = fileNames[i] ?? '';
    const hasBadges = part.overLimit || upload !== undefined;
    return {
      id: String(i + 1),
      name,
      meta: t('sourceReports.parts.fileMeta', {
        part: i + 1,
        total,
        size: formatSize(part.size),
        attachments: t('sourceReports.parts.attachmentCount', {
          count: part.attachmentKeys.length,
        }),
      }),
      badges: hasBadges ? (
        <>
          {part.overLimit && <Badge variants={badgeVariants} value="overLimit" />}
          {upload && <Badge variants={badgeVariants} value={upload.state} />}
        </>
      ) : undefined,
      detail:
        upload?.state === 'failed'
          ? t('sourceReports.parts.failedReason', { reason: upload.reason })
          : null,
      actionLabel: t('sourceReports.parts.downloadFile'),
      actionAriaLabel: t('sourceReports.parts.downloadFileAriaLabel', { filename: name }),
      onAction: () => onDownloadPart(i),
      actionDisabled: actionsDisabled || isStale,
    };
  });

  const totalSize = result.parts.reduce((sum, part) => sum + part.size, 0);

  return (
    <div className={styles.partsStack}>
      {result.warnings.map((warning) => (
        <div key={warningKey(warning)} className={sharedStyles.bannerWarning}>
          {warningText(warning, t, formatSize)}
        </div>
      ))}

      {total > 1 && (
        <FileList
          heading={t('sourceReports.parts.heading')}
          summary={t('sourceReports.parts.summary', { count: total, size: formatSize(totalSize) })}
          items={items}
          headingRef={headingRef}
          testIdPrefix="report-parts"
        >
          {isStale && (
            <div className={styles.partsStale}>
              <p role="status">{t('sourceReports.parts.stale')}</p>
              <button
                type="button"
                className={sharedStyles.btnSecondaryCompact}
                onClick={onUpdateFiles}
                disabled={actionsDisabled}
              >
                {t('sourceReports.parts.updateFiles')}
              </button>
            </div>
          )}
        </FileList>
      )}

      {uploadSummary?.kind === 'failure' && (
        <FormError
          message={t('sourceReports.parts.uploadFailedSummary', {
            failed: uploadSummary.failed,
            total: uploadSummary.total,
          })}
        />
      )}
      {uploadSummary?.kind === 'success' && (
        <div className={sharedStyles.bannerSuccess}>
          {t('sourceReports.parts.uploadAllSuccess', { count: uploadSummary.count })}
        </div>
      )}
    </div>
  );
}
