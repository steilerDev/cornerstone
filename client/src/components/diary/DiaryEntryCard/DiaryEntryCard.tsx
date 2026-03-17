import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import { useFormatters } from '../../../lib/formatters.js';
import { DiaryEntryTypeBadge } from '../DiaryEntryTypeBadge/DiaryEntryTypeBadge.js';
import { DiaryMetadataSummary } from '../DiaryMetadataSummary/DiaryMetadataSummary.js';
import styles from './DiaryEntryCard.module.css';

interface DiaryEntryCardProps {
  entry: DiaryEntrySummary;
}

function getSourceEntityRoute(entry: DiaryEntrySummary): string | null {
  const { formatCurrency, formatDate, formatTime, formatDateTime } = useFormatters();
  if (!entry.sourceEntityType || !entry.sourceEntityId) {
    return null;
  }

  switch (entry.sourceEntityType) {
    case 'work_item':
      return `/project/work-items/${entry.sourceEntityId}`;
    case 'invoice':
      return `/budget/invoices/${entry.sourceEntityId}`;
    case 'milestone':
      return `/project/milestones/${entry.sourceEntityId}`;
    case 'budget_source':
      return `/budget/sources`;
    case 'subsidy_program':
      return `/budget/subsidies`;
    default:
      return null;
  }
}

function getSourceEntityLabel(sourceType: string, t: any): string {
  const key = `detailPage.sourceType.${sourceType}`;
  try {
    const label = t(key as any);
    // If translation key not found, it returns the key itself
    return label === key ? sourceType : label;
  } catch {
    return sourceType;
  }
}

export function DiaryEntryCard({ entry }: DiaryEntryCardProps) {
  const { formatDate, formatTime } = useFormatters();
  const { t } = useTranslation('diary');
  const route = getSourceEntityRoute(entry);
  const sourceLabel = entry.sourceEntityType ? getSourceEntityLabel(entry.sourceEntityType, t) : null;
  const cardClassName = [styles.card, entry.isAutomatic && styles.automatic]
    .filter(Boolean)
    .join(' ');

  return (
    <Link
      to={`/diary/${entry.id}`}
      className={cardClassName}
      aria-label={`${entry.title || 'Diary entry'} on ${formatDate(entry.entryDate)}`}
      data-testid={`diary-card-${entry.id}`}
    >
      <div className={styles.header}>
        <DiaryEntryTypeBadge entryType={entry.entryType} />
        <div className={styles.headerText}>
          {entry.title && <div className={styles.title}>{entry.title}</div>}
          {!entry.isAutomatic && (
            <div className={styles.timestamp}>
              {formatTime(entry.createdAt)}
              {entry.createdBy && (
                <span className={styles.author}> {t('entryCard.by')} {entry.createdBy.displayName}</span>
              )}
              {entry.isSigned && (
                <span className={styles.signedBadgeInline} data-testid={`signed-badge-${entry.id}`}>
                  {t('entryCard.signed')}
                </span>
              )}
            </div>
          )}
          {entry.isAutomatic && route && (
            <div className={styles.autoEntityLink}>
              <Link
                to={route}
                className={styles.sourceLink}
                onClick={(e) => e.stopPropagation()}
                title={entry.sourceEntityTitle ?? sourceLabel ?? undefined}
                data-testid={`source-link-${entry.sourceEntityId}`}
              >
                {t('entryCard.goToRelatedItem')}
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className={styles.body}>{entry.body}</div>

      {!entry.isAutomatic && entry.metadata && (
        <DiaryMetadataSummary entryType={entry.entryType} metadata={entry.metadata} />
      )}

      <div className={styles.footer}>
        {entry.photoCount > 0 && (
          <span className={styles.photoCount} data-testid={`photo-count-${entry.id}`}>
            📷 {entry.photoCount}
          </span>
        )}

        {!entry.isAutomatic && route && (
          <Link
            to={route}
            className={styles.sourceLink}
            onClick={(e) => e.stopPropagation()}
            title={entry.sourceEntityTitle ?? sourceLabel ?? undefined}
            data-testid={`source-link-${entry.sourceEntityId}`}
          >
            {entry.sourceEntityTitle ?? sourceLabel}
          </Link>
        )}
      </div>
    </Link>
  );
}
