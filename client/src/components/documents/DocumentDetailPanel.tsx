import type { PaperlessDocumentSearchResult } from '@cornerstone/shared';
import { getDocumentThumbnailUrl } from '../../lib/paperlessApi.js';
import styles from './DocumentDetailPanel.module.css';

interface DocumentDetailPanelProps {
  document: PaperlessDocumentSearchResult;
  onClose: () => void;
  /** Optional Paperless-ngx base URL to generate "View in Paperless" link. */
  paperlessBaseUrl?: string;
}

export function DocumentDetailPanel({
  document,
  onClose,
  paperlessBaseUrl,
}: DocumentDetailPanelProps) {
  const thumbUrl = getDocumentThumbnailUrl(document.id);
  const paperlessDocUrl = paperlessBaseUrl
    ? `${paperlessBaseUrl}/documents/${document.id}/details`
    : null;

  return (
    <div id="detail-panel" className={styles.panel} role="region" aria-label={`Details for ${document.title}`}>
      <div className={styles.header}>
        <h3 className={styles.panelTitle}>{document.title}</h3>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close document details"
        >
          &#x2715;
        </button>
      </div>
      <div className={styles.content}>
        <div className={styles.thumbSection}>
          <img src={thumbUrl} alt={document.title} className={styles.thumb} loading="lazy" />
        </div>
        <div className={styles.metaSection}>
          <dl className={styles.metaList}>
            {document.created && (
              <>
                <dt className={styles.metaLabel}>Created</dt>
                <dd className={styles.metaValue}>
                  {new Date(document.created).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </dd>
              </>
            )}
            {document.correspondent && (
              <>
                <dt className={styles.metaLabel}>Correspondent</dt>
                <dd className={styles.metaValue}>{document.correspondent}</dd>
              </>
            )}
            {document.documentType && (
              <>
                <dt className={styles.metaLabel}>Document Type</dt>
                <dd className={styles.metaValue}>{document.documentType}</dd>
              </>
            )}
            {document.archiveSerialNumber !== null &&
              document.archiveSerialNumber !== undefined && (
                <>
                  <dt className={styles.metaLabel}>Archive #</dt>
                  <dd className={styles.metaValue}>{document.archiveSerialNumber}</dd>
                </>
              )}
            {document.pageCount !== null && document.pageCount !== undefined && (
              <>
                <dt className={styles.metaLabel}>Pages</dt>
                <dd className={styles.metaValue}>{document.pageCount}</dd>
              </>
            )}
            {document.tags.length > 0 && (
              <>
                <dt className={styles.metaLabel}>Tags</dt>
                <dd className={styles.metaValue}>
                  <div className={styles.tags}>
                    {document.tags.map((tag) => (
                      <span key={tag.id} className={styles.tagChip}>
                        {tag.name}
                      </span>
                    ))}
                  </div>
                </dd>
              </>
            )}
          </dl>
          {document.content && (
            <div className={styles.contentSnippet}>
              <h4 className={styles.snippetLabel}>Content Preview</h4>
              <p className={styles.snippetText}>
                {document.content.slice(0, 300)}
                {document.content.length > 300 ? '...' : ''}
              </p>
            </div>
          )}
          {paperlessDocUrl && (
            <a
              href={paperlessDocUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.externalLink}
            >
              View in Paperless-ngx &#x2197;
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
