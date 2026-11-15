import { useTranslation } from 'react-i18next';
import type { PaperlessDocumentSearchResult } from '@cornerstone/shared';
import { getDocumentThumbnailUrl } from '../../lib/paperlessApi.js';
import { useFormatters } from '../../lib/formatters.js';
import { useUserText } from '../../hooks/useUserText.js';
import shared from '../../styles/shared.module.css';
import styles from './DocumentDetailPanel.module.css';

interface DocumentDetailPanelProps {
  document: PaperlessDocumentSearchResult;
  onClose?: () => void;
  /** Optional Paperless-ngx base URL to generate "View in Paperless" link. */
  paperlessBaseUrl?: string;
  /**
   * Layout variant: 'standalone' (default), 'sidebyside' for auto-itemize page, or 'sheet' for
   * the Documents page side panel (no title row or Close, the panel is the labelled container;
   * adds Added and Last modified, an h3 content preview and an Open in Paperless button).
   */
  variant?: 'standalone' | 'sidebyside' | 'sheet';
  /**
   * Rendered under a card in the Documents panel: no title row or Close (the card shows the
   * title and owns the Details toggle), no fixed element id, flat surface.
   */
  inline?: boolean;
}

export function DocumentDetailPanel({
  document,
  onClose,
  paperlessBaseUrl,
  variant = 'standalone',
  inline = false,
}: DocumentDetailPanelProps) {
  const { t } = useTranslation('documents');
  const userText = useUserText();
  const { formatDate } = useFormatters();
  const thumbUrl = getDocumentThumbnailUrl(document.id);
  const paperlessDocUrl = paperlessBaseUrl
    ? `${paperlessBaseUrl}/documents/${document.id}/details`
    : null;

  const isSheet = variant === 'sheet';

  const panelClassName = [
    styles.panel,
    variant === 'sidebyside' ? styles.sidebyside : undefined,
    isSheet ? styles.sheet : undefined,
    inline ? styles.inline : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      id={inline || isSheet ? undefined : 'detail-panel'}
      className={panelClassName}
      role={isSheet ? undefined : 'region'}
      aria-label={isSheet ? undefined : t('documentDetail.detailsLabel', { title: document.title })}
    >
      {!inline && !isSheet && (
        <div className={styles.header}>
          <h3 {...userText(styles.panelTitle)}>{document.title}</h3>
          {variant !== 'sidebyside' && onClose && (
            <button
              type="button"
              className={styles.closeButton}
              onClick={onClose}
              aria-label={t('documentDetail.closeDetails')}
            >
              &#x2715;
            </button>
          )}
        </div>
      )}
      <div className={styles.content}>
        {!inline && (
          <div className={styles.thumbSection}>
            <img src={thumbUrl} alt={document.title} className={styles.thumb} loading="lazy" />
          </div>
        )}
        <div className={styles.metaSection}>
          <dl className={styles.metaList}>
            {document.created && (
              <>
                <dt className={styles.metaLabel}>{t('documentDetail.created')}</dt>
                <dd className={styles.metaValue}>
                  {formatDate(document.created, undefined, 'long')}
                </dd>
              </>
            )}
            {document.correspondent && (
              <>
                <dt className={styles.metaLabel}>{t('documentDetail.correspondent')}</dt>
                <dd className={styles.metaValue}>{document.correspondent}</dd>
              </>
            )}
            {document.documentType && (
              <>
                <dt className={styles.metaLabel}>{t('documentDetail.documentType')}</dt>
                <dd className={styles.metaValue}>{document.documentType}</dd>
              </>
            )}
            {document.archiveSerialNumber !== null &&
              document.archiveSerialNumber !== undefined && (
                <>
                  <dt className={styles.metaLabel}>{t('documentDetail.archiveNumber')}</dt>
                  <dd className={styles.metaValue}>{document.archiveSerialNumber}</dd>
                </>
              )}
            {document.pageCount !== null && document.pageCount !== undefined && (
              <>
                <dt className={styles.metaLabel}>{t('documentDetail.pages')}</dt>
                <dd className={styles.metaValue}>{document.pageCount}</dd>
              </>
            )}
            {isSheet && document.added && (
              <>
                <dt className={styles.metaLabel}>{t('documentDetail.added')}</dt>
                <dd className={styles.metaValue}>{formatDate(document.added)}</dd>
              </>
            )}
            {isSheet && document.modified && (
              <>
                <dt className={styles.metaLabel}>{t('documentDetail.modified')}</dt>
                <dd className={styles.metaValue}>{formatDate(document.modified)}</dd>
              </>
            )}
            {document.tags.length > 0 && (
              <>
                <dt className={styles.metaLabel}>{t('documentDetail.tags')}</dt>
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
              {isSheet ? (
                <h3 className={styles.snippetLabel}>{t('documentDetail.contentPreview')}</h3>
              ) : (
                <h4 className={styles.snippetLabel}>{t('documentDetail.contentPreview')}</h4>
              )}
              <p {...userText(styles.snippetText)}>
                {document.content.slice(0, 300)}
                {document.content.length > 300 ? '...' : ''}
              </p>
            </div>
          )}
          {paperlessDocUrl && isSheet && (
            <a
              href={paperlessDocUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.openButton}
            >
              {t('panel.openInPaperless')}{' '}
              <span className={shared.srOnly}>{t('panel.opensInNewTab')}</span>
            </a>
          )}
          {paperlessDocUrl && !isSheet && (
            <a
              href={paperlessDocUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.externalLink}
            >
              {t('documentDetail.viewInPaperless')}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
