import { Link } from 'react-router-dom';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import { formatDate, formatTime } from '../../lib/formatters.js';
import { DiaryEntryTypeBadge } from '../diary/DiaryEntryTypeBadge/DiaryEntryTypeBadge.js';
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
      <div className={styles.emptyState}>
        <p>No diary entries yet.</p>
        <Link to="/diary/new" className={shared.btnPrimary}>
          Create first entry
        </Link>
      </div>
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
              <div className={styles.entryTitle}>
                {entry.title || 'Untitled'}
              </div>
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
