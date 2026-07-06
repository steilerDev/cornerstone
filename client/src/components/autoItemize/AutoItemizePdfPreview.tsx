import { useState } from 'react';
import type { TFunction } from 'i18next';
import { getDocumentPreviewUrl } from '../../lib/paperlessApi.js';
import { Spinner } from '../Spinner/Spinner.js';
import styles from './AutoItemizePdfPreview.module.css';

interface AutoItemizePdfPreviewProps {
  documentId: number;
  paperlessUrl?: string | null;
  t: TFunction;
}

export function AutoItemizePdfPreview({ documentId, paperlessUrl, t }: AutoItemizePdfPreviewProps) {
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);

  if (pdfFailed) {
    return (
      <div
        className={styles.pdfFallback}
        role="region"
        aria-label={t('autoItemize.previewUnavailable')}
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
        <span className={styles.pdfFallbackLabel}>{t('autoItemize.previewUnavailable')}</span>
        {paperlessUrl && (
          <a
            href={`${paperlessUrl}/documents/${documentId}/`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.pdfFallbackLink}
          >
            {t('autoItemize.openInPaperless')}
          </a>
        )}
      </div>
    );
  }

  return (
    <div className={styles.pdfPreviewWrapper}>
      {!pdfLoaded && (
        <div className={styles.pdfLoadingOverlay} aria-hidden="true">
          <Spinner size="md" color="muted" label={t('autoItemize.pdfPreviewTitle')} />
        </div>
      )}
      <iframe
        className={styles.pdfIframe}
        src={getDocumentPreviewUrl(documentId)}
        title={t('autoItemize.pdfPreviewTitle')}
        onLoad={() => setPdfLoaded(true)}
        onErrorCapture={() => setPdfFailed(true)}
      />
    </div>
  );
}
