import type { PaperlessDocumentSearchResult, PaperlessTag } from '@cornerstone/shared';
import { getDocumentThumbnailUrl } from '../../lib/paperlessApi.js';
import styles from './DocumentCard.module.css';

interface DocumentCardProps {
  document: PaperlessDocumentSearchResult;
  isSelected: boolean;
  onSelect: (doc: PaperlessDocumentSearchResult) => void;
}

export function DocumentCard({ document, isSelected, onSelect }: DocumentCardProps) {
  const thumbUrl = getDocumentThumbnailUrl(document.id);

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
      aria-pressed={isSelected}
      aria-label={`Document: ${document.title}`}
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
      </div>
      <div className={styles.body}>
        <h3 className={styles.title}>{document.title}</h3>
        {document.created && (
          <p className={styles.meta}>
            {new Date(document.created).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </p>
        )}
        {document.correspondent && (
          <p className={styles.correspondent}>{document.correspondent}</p>
        )}
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
