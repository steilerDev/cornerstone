import { routeUrl } from '@cornerstone/shared';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { DiaryEntrySummary, DiarySourceEntityType } from '@cornerstone/shared';
import type { TFunction } from 'i18next';
import { I18N_UNION_KEYS } from '../../../i18n/unionKeys.js';
import { useFormatters } from '../../../lib/formatters.js';
import { Badge } from '../../Badge/Badge.js';
import badgeStyles from '../../Badge/Badge.module.css';
import { DiaryEntryTypeBadge } from '../DiaryEntryTypeBadge/DiaryEntryTypeBadge.js';
import { DiaryMetadataSummary } from '../DiaryMetadataSummary/DiaryMetadataSummary.js';
import { useOriginState } from '../../../navigation/useOriginState.js';
import styles from './DiaryEntryCard.module.css';

interface DiaryEntryCardProps {
  entry: DiaryEntrySummary;
}

function getSourceEntityRoute(entry: DiaryEntrySummary): string | null {
  if (!entry.sourceEntityType || !entry.sourceEntityId) {
    return null;
  }

  switch (entry.sourceEntityType) {
    case 'work_item':
      return routeUrl('workItem', { id: entry.sourceEntityId });
    case 'invoice':
      return routeUrl('invoice', { id: entry.sourceEntityId });
    case 'milestone':
      return routeUrl('milestone', { id: entry.sourceEntityId });
    case 'budget_source':
      return routeUrl('budgetSources');
    case 'subsidy_program':
      return routeUrl('budgetSubsidies');
    default:
      return null;
  }
}

function getSourceEntityLabel(sourceType: DiarySourceEntityType, t: TFunction): string {
  return t(I18N_UNION_KEYS.diarySourceType.key(sourceType));
}

export function DiaryEntryCard({ entry }: DiaryEntryCardProps) {
  const { formatDate, formatTime } = useFormatters();
  const { t } = useTranslation('diary');
  const originState = useOriginState();
  const route = getSourceEntityRoute(entry);
  const sourceLabel = entry.sourceEntityType
    ? getSourceEntityLabel(entry.sourceEntityType, t)
    : null;
  const cardClassName = [styles.card, entry.isAutomatic && styles.automatic]
    .filter(Boolean)
    .join(' ');

  const cardLink =
    entry.status === 'draft'
      ? routeUrl('diaryEntryEdit', { id: entry.id })
      : routeUrl('diaryEntry', { id: entry.id });

  return (
    <Link
      to={cardLink}
      className={cardClassName}
      aria-label={`${entry.title || 'Diary entry'} on ${formatDate(entry.entryDate)}`}
      data-testid={`diary-card-${entry.id}`}
    >
      <div className={styles.header}>
        <DiaryEntryTypeBadge entryType={entry.entryType} />
        {entry.status === 'draft' && (
          <Badge
            variants={{ draft: { label: t('draft.badgeLabel'), className: badgeStyles.draft } }}
            value="draft"
            testId={`draft-badge-${entry.id}`}
          />
        )}
        <div className={styles.headerText}>
          {entry.title && <div className={styles.title}>{entry.title}</div>}
          {!entry.isAutomatic && (
            <div className={styles.timestamp}>
              {formatTime(entry.createdAt)}
              {entry.createdBy && (
                <span className={styles.author}>
                  {' '}
                  {t('entryCard.by')} {entry.createdBy.displayName}
                </span>
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
                state={originState}
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
            state={originState}
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
