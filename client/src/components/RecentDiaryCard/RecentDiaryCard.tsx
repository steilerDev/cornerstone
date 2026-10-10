import { routeUrl } from '@cornerstone/shared';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import { useFormatters } from '../../lib/formatters.js';
import { useOriginState } from '../../navigation/useOriginState.js';
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
  const {
    formatCurrency: _formatCurrency,
    formatDate,
    formatTime,
    formatDateTime: _formatDateTime,
  } = useFormatters();
  const { t } = useTranslation('dashboard');
  const originState = useOriginState();

  if (isLoading) {
    return <div className={shared.loading}>{t('cards.recentDiary.loadingEntries')}</div>;
  }

  if (error) {
    return <div className={shared.bannerError}>{error}</div>;
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        message={t('cards.recentDiary.emptyMessage')}
        action={{
          label: t('cards.recentDiary.emptyAction')!,
          href: routeUrl('diaryEntryNew'),
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
            to={routeUrl('diaryEntry', { id: entry.id })}
            state={originState}
            className={styles.entryItem}
            data-testid={`recent-diary-${entry.id}`}
          >
            <div className={styles.entryHeader}>
              <DiaryEntryTypeBadge entryType={entry.entryType} size="sm" />
              <div
                className={styles.entryTitle}
                title={entry.title || t('cards.recentDiary.untitled') || undefined}
              >
                {entry.title || t('cards.recentDiary.untitled')}
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
        <Link to={routeUrl('diaryEntryNew')} state={originState} className={styles.addLink}>
          {t('cards.recentDiary.newEntry')}
        </Link>
        <Link to={routeUrl('diary')} className={styles.viewAllLink}>
          {t('cards.recentDiary.viewAll')}
        </Link>
      </div>
    </div>
  );
}
