import { Link } from 'react-router-dom';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import { formatDate, formatTime } from '../../lib/formatters.js';
import { DiaryEntryTypeBadge } from '../diary/DiaryEntryTypeBadge/DiaryEntryTypeBadge.js';
import { EmptyState } from '../EmptyState/index.js';
import shared from '../../styles/shared.module.css';
import styles from './RecentDiaryCard.module.css';

interface RecentDiaryCardProps {
  entries: DiaryEntrySummary[];
  isLoading: boolean;
  error: string | null;
}

export function RecentDiaryCard({ entries, isLoading, error }: RecentDiaryCardProps) {
  if (isLoading) {
    return <div className={shared.loading}>Loading entries...</div>;
  }

  if (error) {
    return <div className={shared.bannerError}>{error}</div>;
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        message="No diary entries yet."
        action={{
          label: 'Create first entry',
          href: '/diary/new',
        }}
        className={styles.emptyState}
      />
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.entriesList}>
        {entries.map((entry) => (
          <Link
            key={entry.id}
            to={`/diary/${entry.id}`}
            className={styles.entryItem}
            data-testid={`recent-diary-${entry.id}`}
          >
            <div className={styles.entryHeader}>
              <DiaryEntryTypeBadge entryType={entry.entryType} size="sm" />
              <div className={styles.entryTitle}>{entry.title || 'Untitled'}</div>
            </div>
            <div className={styles.entryPreview}>{entry.body.substring(0, 100)}</div>
            <div className={styles.entryMeta}>
              <span className={styles.date}>{formatDate(entry.entryDate)}</span>
              <span className={styles.time}>{formatTime(entry.createdAt)}</span>
            </div>
          </Link>
        ))}
      </div>

      <div className={styles.footer}>
        <Link to="/diary/new" className={styles.addLink}>
          + New Entry
        </Link>
        <Link to="/diary" className={styles.viewAllLink}>
          View All
        </Link>
      </div>
    </div>
  );
}
