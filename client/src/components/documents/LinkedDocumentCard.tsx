import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DocumentLinkWithMetadata, AttachmentType } from '@cornerstone/shared';
import type { BadgeVariantMap } from '../../components/Badge/Badge.js';
import { Badge } from '../../components/Badge/Badge.js';
import { getDocumentThumbnailUrl } from '../../lib/paperlessApi.js';
import { formatDate } from '../../lib/formatters.js';
import styles from './LinkedDocumentCard.module.css';
import badgeStyles from '../Badge/Badge.module.css';

interface LinkedDocumentCardProps {
  link: DocumentLinkWithMetadata;
  paperlessBaseUrl: string | null;
  onView: (link: DocumentLinkWithMetadata) => void;
  onUnlink: (link: DocumentLinkWithMetadata) => void;
  onItemize?: (link: DocumentLinkWithMetadata) => void;
  onAttachmentTypeChange?: (link: DocumentLinkWithMetadata, type: AttachmentType | null) => void;
  isUpdatingAttachmentType?: boolean;
}

export function LinkedDocumentCard({
  link,
  paperlessBaseUrl,
  onView,
  onUnlink,
  onItemize,
  onAttachmentTypeChange,
  isUpdatingAttachmentType,
}: LinkedDocumentCardProps) {
  const { t } = useTranslation('documents');
  const [thumbError, setThumbError] = useState(false);

  const thumbUrl = getDocumentThumbnailUrl(link.paperlessDocumentId);
  const hasDocument = link.document !== null;
  const title = link.document?.title ?? `Document #${link.paperlessDocumentId}`;
  const created = link.document?.created ?? null;
  const tags = link.document?.tags ?? [];

  const ATTACHMENT_TYPE_VARIANTS: BadgeVariantMap = {
    quotation: {
      label: t('documentCard.attachmentType.quotation'),
      className: badgeStyles.attachmentQuotation,
    },
    deposit: {
      label: t('documentCard.attachmentType.deposit'),
      className: badgeStyles.attachmentDeposit,
    },
    invoice: {
      label: t('documentCard.attachmentType.invoice'),
      className: badgeStyles.attachmentInvoice,
    },
  };

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
        {/* Overlay unlink button — always rendered (visible on hover/focus/touch) */}
        <button
          type="button"
          className={styles.unlinkOverlayButton}
          onClick={() => onUnlink(link)}
          aria-label={`Unlink document: ${title}`}
          title={t('documentCard.removeLink')}
        >
          ✕
        </button>
      </div>

      <div className={styles.body}>
        <h3 className={styles.title}>{title}</h3>

        {created && <p className={styles.meta}>{formatDate(created)}</p>}

        {onAttachmentTypeChange && (
          <div className={styles.attachmentTypeRow}>
            {link.attachmentType && (
              <Badge
                variants={ATTACHMENT_TYPE_VARIANTS}
                value={link.attachmentType}
                testId={`attachment-type-badge-${link.id}`}
              />
            )}
            <label htmlFor={`attachment-type-${link.id}`} className={styles.srOnly}>
              {t('documentCard.attachmentType.selectLabel', { title })}
            </label>
            <select
              id={`attachment-type-${link.id}`}
              className={styles.attachmentTypeSelect}
              value={link.attachmentType ?? ''}
              onChange={(e) =>
                onAttachmentTypeChange(link, (e.target.value || null) as AttachmentType | null)
              }
              disabled={isUpdatingAttachmentType}
            >
              <option value="">{t('documentCard.attachmentType.none')}</option>
              <option value="quotation">{t('documentCard.attachmentType.quotation')}</option>
              <option value="deposit">{t('documentCard.attachmentType.deposit')}</option>
              <option value="invoice">{t('documentCard.attachmentType.invoice')}</option>
            </select>
          </div>
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
            aria-label={t('documentCard.detailsAriaLabel', { title })}
          >
            {t('documentCard.details')}
          </button>
        )}

        {hasDocument && onItemize && (
          <button
            type="button"
            className={styles.itemizeButton}
            onClick={() => onItemize(link)}
            aria-label={`${t('documentCard.itemize')}: ${title}`}
          >
            <span aria-hidden="true">⚡</span> {t('documentCard.itemize')}
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
      </div>
    </div>
  );
}
