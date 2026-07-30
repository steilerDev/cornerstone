import type { TFunction } from 'i18next';
import { Spinner } from '../Spinner/Spinner.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './ReportPdfPreview.module.css';

interface ReportPdfPreviewProps {
  blobUrl: string | null;
  isRegenerating: boolean;
  hasError: boolean;
  onRetry: () => void;
  t: TFunction;
}

export function ReportPdfPreview({
  blobUrl,
  isRegenerating,
  hasError,
  onRetry,
  t,
}: ReportPdfPreviewProps) {
  if (hasError) {
    return (
      <div
        className={styles.pdfFallback}
        role="region"
        aria-label={t('sourceReports.previewGenerationFailed')}
      >
        <svg
          aria-hidden="true"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-text-muted)"
          strokeWidth="1.5"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <span className={styles.pdfFallbackLabel}>
          {t('sourceReports.previewGenerationFailed')}
        </span>
        <button type="button" className={sharedStyles.btnSecondary} onClick={onRetry}>
          {t('common:button.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.pdfPreviewWrapper} aria-busy={isRegenerating}>
      {isRegenerating && (
        <div className={styles.pdfLoadingOverlay} aria-hidden="true">
          <Spinner size="md" color="muted" label={t('sourceReports.previewRegenerating')} />
        </div>
      )}
      {blobUrl && (
        <iframe
          className={styles.pdfIframe}
          src={blobUrl}
          title={t('sourceReports.pdfPreviewTitle')}
        />
      )}
    </div>
  );
}
