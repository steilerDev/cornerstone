import { Link } from 'react-router-dom';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import { formatDate, formatTime } from '../../../lib/formatters.js';
import { DiaryEntryTypeBadge } from '../DiaryEntryTypeBadge/DiaryEntryTypeBadge.js';
import { DiaryMetadataSummary } from '../DiaryMetadataSummary/DiaryMetadataSummary.js';
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

function getSourceEntityLabel(sourceType: string): string {
  switch (sourceType) {
    case 'work_item':
      return 'Work Item';
    case 'invoice':
      return 'Invoice';
    case 'milestone':
      return 'Milestone';
    case 'budget_source':
      return 'Budget Source';
    case 'subsidy_program':
      return 'Subsidy Program';
    default:
      return sourceType;
  }
}

export function DiaryEntryCard({ entry }: DiaryEntryCardProps) {
  const route = getSourceEntityRoute(entry);
  const sourceLabel = entry.sourceEntityType ? getSourceEntityLabel(entry.sourceEntityType) : null;
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
          <div className={styles.timestamp}>
            {formatTime(entry.createdAt)}
            {entry.createdBy && (
              <span className={styles.author}> by {entry.createdBy.displayName}</span>
            )}
          </div>
        </div>
      </div>

      <div className={styles.body}>{entry.body}</div>

      {entry.metadata && (
        <DiaryMetadataSummary entryType={entry.entryType} metadata={entry.metadata} />
      )}

      <div className={styles.footer}>
        {entry.photoCount > 0 && (
          <span className={styles.photoCount} data-testid={`photo-count-${entry.id}`}>
            📷 {entry.photoCount}
          </span>
        )}

        {route && sourceLabel && (
          <Link
            to={route}
            className={styles.sourceLink}
            onClick={(e) => e.stopPropagation()}
            title={sourceLabel}
            data-testid={`source-link-${entry.sourceEntityId}`}
          >
            {sourceLabel}
          </Link>
        )}
      </div>
    </Link>
  );
}
