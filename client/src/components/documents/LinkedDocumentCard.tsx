import { useId, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { DocumentLinkWithMetadata, AttachmentType } from '@cornerstone/shared';
import { ATTACHMENT_TYPES } from '@cornerstone/shared';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import type { BadgeVariantMap } from '../../components/Badge/Badge.js';
import { Badge } from '../../components/Badge/Badge.js';
import { OverflowMenu } from '../OverflowMenu/index.js';
import type { OverflowMenuEntry } from '../OverflowMenu/index.js';
import { getDocumentThumbnailUrl } from '../../lib/paperlessApi.js';
import { formatDate } from '../../lib/formatters.js';
import { useUserText } from '../../hooks/useUserText.js';
import { DocumentDetailPanel } from './DocumentDetailPanel.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './LinkedDocumentCard.module.css';
import badgeStyles from '../Badge/Badge.module.css';

interface LinkedDocumentCardProps {
  link: DocumentLinkWithMetadata;
  paperlessBaseUrl: string | null;
  onUnlink?: (link: DocumentLinkWithMetadata) => void;
  /** Offered only for a link whose Paperless document exists; receives that document's id. */
  onItemize?: (documentId: number) => void;
  onAttachmentTypeChange?: (link: DocumentLinkWithMetadata, type: AttachmentType | null) => void;
  isUpdatingAttachmentType?: boolean;
  /** Paperless is off: the title and meta only, with no menu, Details or type control. */
  readOnly?: boolean;
  /** The ⋯ trigger, so the host can move focus to it after an unlink or a link. */
  menuTriggerRef?: RefObject<HTMLButtonElement | null>;
}

/** Badge class per attachment type; a Record so a new member is a type error, not a missing badge. */
const ATTACHMENT_TYPE_CLASSNAMES: Record<AttachmentType, string | undefined> = {
  quotation: badgeStyles.attachmentQuotation,
  deposit: badgeStyles.attachmentDeposit,
  invoice: badgeStyles.attachmentInvoice,
};

/**
 * One linked document as a row of the Documents panel: thumbnail, title, meta, the invoice
 * document type, a Details disclosure (inline metadata and text preview) and a ⋯ menu
 * (Open in Paperless, Itemize, Unlink). Unlink is immediate; the host shows the Undo toast.
 */
export function LinkedDocumentCard({
  link,
  paperlessBaseUrl,
  onUnlink,
  onItemize,
  onAttachmentTypeChange,
  isUpdatingAttachmentType,
  readOnly = false,
  menuTriggerRef,
}: LinkedDocumentCardProps) {
  const { t } = useTranslation('documents');
  const userText = useUserText();
  const detailsId = useId();
  const [thumbError, setThumbError] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const thumbUrl = getDocumentThumbnailUrl(link.paperlessDocumentId);
  const hasDocument = link.document !== null;
  const title =
    link.document?.title ?? t('documentCard.fallbackTitle', { id: link.paperlessDocumentId });
  const created = link.document?.created ?? null;
  const correspondent = link.document?.correspondent ?? null;

  const ATTACHMENT_TYPE_VARIANTS: BadgeVariantMap = {};
  for (const type of ATTACHMENT_TYPES) {
    ATTACHMENT_TYPE_VARIANTS[type] = {
      label: t(I18N_UNION_KEYS.documentAttachmentType.key(type)),
      className: ATTACHMENT_TYPE_CLASSNAMES[type],
    };
  }

  const menuItems: OverflowMenuEntry[] = [];
  if (hasDocument && paperlessBaseUrl) {
    menuItems.push({
      kind: 'link',
      id: 'open',
      label: t('panel.openInPaperless'),
      href: `${paperlessBaseUrl}/documents/${link.paperlessDocumentId}/details`,
      newTab: true,
      srSuffix: t('panel.opensInNewTab'),
      testId: `document-open-${link.id}`,
    });
  }
  if (link.document && onItemize) {
    const documentId = link.document.id;
    menuItems.push({
      id: 'itemize',
      label: t('panel.itemize'),
      onClick: () => onItemize(documentId),
      testId: `document-itemize-${link.id}`,
    });
  }
  if (onUnlink) {
    if (menuItems.length > 0) menuItems.push({ kind: 'separator', id: 'separator' });
    menuItems.push({
      id: 'unlink',
      label: t('panel.unlink'),
      variant: 'destructive',
      onClick: () => onUnlink(link),
      testId: `document-unlink-${link.id}`,
    });
  }

  return (
    <div className={styles.card} data-testid={`linked-document-${link.id}`}>
      <div className={styles.row}>
        <div className={styles.thumbContainer}>
          {!thumbError && hasDocument && (
            <img
              src={thumbUrl}
              alt=""
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
          {hasDocument ? (
            <h3 {...userText(styles.title)}>{title}</h3>
          ) : (
            <h3 className={styles.title}>{title}</h3>
          )}

          {(created || correspondent) && (
            <p className={styles.meta}>
              {created && formatDate(created)}
              {created && correspondent && ' · '}
              {correspondent && <span {...userText()}>{correspondent}</span>}
            </p>
          )}

          {onAttachmentTypeChange && !readOnly && (
            <div className={styles.attachmentTypeRow}>
              {link.attachmentType && (
                <Badge
                  variants={ATTACHMENT_TYPE_VARIANTS}
                  value={link.attachmentType}
                  testId={`attachment-type-badge-${link.id}`}
                />
              )}
              <label htmlFor={`attachment-type-${link.id}`} className={sharedStyles.srOnly}>
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
                {ATTACHMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(I18N_UNION_KEYS.documentAttachmentType.key(type))}
                  </option>
                ))}
              </select>
            </div>
          )}

          {hasDocument && !readOnly && (
            <button
              type="button"
              className={styles.detailsToggle}
              aria-expanded={detailsOpen}
              aria-controls={detailsOpen ? detailsId : undefined}
              onClick={() => setDetailsOpen((open) => !open)}
              data-testid={`document-details-${link.id}`}
            >
              {t('panel.details')}
            </button>
          )}
        </div>

        {!readOnly && menuItems.length > 0 && (
          <OverflowMenu
            items={menuItems}
            triggerAriaLabel={t('panel.cardActions', { title })}
            triggerRef={menuTriggerRef}
            usePortal
            wrapperClassName={styles.menu}
            data-testid={`document-menu-${link.id}`}
          />
        )}
      </div>

      {detailsOpen && link.document && !readOnly && (
        <div id={detailsId}>
          <DocumentDetailPanel
            inline
            document={{ ...link.document, searchHit: null }}
            paperlessBaseUrl={paperlessBaseUrl ?? undefined}
          />
        </div>
      )}
    </div>
  );
}
