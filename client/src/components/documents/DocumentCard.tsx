import { useTranslation } from 'react-i18next';
import type { PaperlessDocumentSearchResult, PaperlessTag } from '@cornerstone/shared';
import { getDocumentThumbnailUrl } from '../../lib/paperlessApi.js';
import { useFormatters } from '../../lib/formatters.js';
import styles from './DocumentCard.module.css';

interface DocumentCardProps {
  document: PaperlessDocumentSearchResult;
  isSelected: boolean;
  onSelect: (doc: PaperlessDocumentSearchResult) => void;
  /** Optional id of the associated detail panel for aria-controls pairing. */
  ariaControls?: string;
  /** Paperless-ngx base URL for "Open in Paperless" link; if null or undefined, link is hidden. */
  paperlessUrl?: string | null;
}

export function DocumentCard({
  document,
  isSelected,
  onSelect,
  ariaControls,
  paperlessUrl,
}: DocumentCardProps) {
  const { t } = useTranslation('documents');
  const { formatDate } = useFormatters();
  const thumbUrl = getDocumentThumbnailUrl(document.id);

  // Compute formatted date for aria-label (same format as the visible date)
  const formattedDate = document.created ? formatDate(document.created) : null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(document);
    }
  };

  return (
    <div
      className={`${styles.card} ${isSelected ? styles.cardSelected : ''}`}
      onClick={() => onSelect(document)}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-expanded={isSelected}
      aria-controls={ariaControls}
      aria-label={t('documentCard.documentLabel', {
        title: document.title,
        date: formattedDate ? `, ${formattedDate}` : '',
      })}
    >
      <div className={styles.thumbContainer}>
        <img
          src={thumbUrl}
          alt={document.title}
          className={styles.thumb}
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <div className={styles.thumbFallback} aria-hidden="true">
          <span className={styles.thumbFallbackIcon}>&#128196;</span>
        </div>
        {paperlessUrl && (
          <a
            href={`${paperlessUrl}/documents/${document.id}/details`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.openInPaperlessButton}
            aria-label={t('documentCard.openInPaperlessAriaLabel', { title: document.title })}
            title={t('documentCard.openInPaperless')}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              width="16"
              height="16"
              aria-hidden="true"
            >
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        )}
      </div>
      <div className={styles.body}>
        <h3 className={styles.title}>{document.title}</h3>
        {document.created && <p className={styles.meta}>{formatDate(document.created)}</p>}
        {document.correspondent && <p className={styles.correspondent}>{document.correspondent}</p>}
        {document.tags.length > 0 && (
          <div className={styles.tags}>
            {document.tags.slice(0, 3).map((tag: PaperlessTag) => (
              <span key={tag.id} className={styles.tagChip}>
                {tag.name}
              </span>
            ))}
            {document.tags.length > 3 && (
              <span className={styles.tagChipMore}>+{document.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
