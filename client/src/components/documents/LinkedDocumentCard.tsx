import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DocumentLinkWithMetadata } from '@cornerstone/shared';
import { getDocumentThumbnailUrl } from '../../lib/paperlessApi.js';
import styles from './LinkedDocumentCard.module.css';

interface LinkedDocumentCardProps {
  link: DocumentLinkWithMetadata;
  paperlessBaseUrl: string | null;
  onView: (link: DocumentLinkWithMetadata) => void;
  onUnlink: (link: DocumentLinkWithMetadata) => void;
}

export function LinkedDocumentCard({
  link,
  paperlessBaseUrl,
  onView,
  onUnlink,
}: LinkedDocumentCardProps) {
  const { t } = useTranslation('documents');
  const [thumbError, setThumbError] = useState(false);

  const thumbUrl = getDocumentThumbnailUrl(link.paperlessDocumentId);
  const hasDocument = link.document !== null;
  const title = link.document?.title ?? `Document #${link.paperlessDocumentId}`;
  const created = link.document?.created ?? null;
  const tags = link.document?.tags ?? [];

  return (
    <div className={styles.card}>
      <div className={styles.thumbContainer}>
        {!thumbError && hasDocument && (
          <img
            src={thumbUrl}
            alt={title}
            className={styles.thumb}
            loading="lazy"
            onError={() => setThumbError(true)}
          />
        )}
        {(thumbError || !hasDocument) && (
          <div className={styles.thumbFallback} aria-hidden="true">
            📄
          </div>
        )}
      </div>

      <div className={styles.body}>
        <h3 className={styles.title}>{title}</h3>

        {created && (
          <p className={styles.meta}>
            {new Date(created).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </p>
        )}

        {tags.length > 0 && (
          <div className={styles.tags}>
            {tags.slice(0, 2).map((tag) => (
              <span key={tag.id} className={styles.tagChip}>
                {tag.name}
              </span>
            ))}
            {tags.length > 2 && <span className={styles.tagChip}>+{tags.length - 2}</span>}
          </div>
        )}
      </div>

      <div className={styles.actions}>
        {hasDocument && (
          <button
            type="button"
            className={styles.viewButton}
            onClick={() => onView(link)}
            aria-label={`${t('documentCard.view')}: ${title}`}
          >
            {t('documentCard.view')}
          </button>
        )}

        {hasDocument && paperlessBaseUrl && (
          <a
            href={`${paperlessBaseUrl}/documents/${link.paperlessDocumentId}/details`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.openLink}
            aria-label={`Open document in Paperless: ${title}`}
            title={t('documentCard.openInPaperless')}
          >
            ↗
          </a>
        )}

        <button
          type="button"
          className={styles.unlinkButton}
          onClick={() => onUnlink(link)}
          aria-label={`Unlink document: ${title}`}
          title={t('documentCard.removeLink')}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
