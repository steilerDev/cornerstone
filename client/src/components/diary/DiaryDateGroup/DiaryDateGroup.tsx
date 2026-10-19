import { useFormatters } from '../../../lib/formatters.js';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import { DiaryEntryCard } from '../DiaryEntryCard/DiaryEntryCard.js';
import { SystemEventFeedRow } from '../../FeedRow/SystemEventFeedRow.js';
import styles from './DiaryDateGroup.module.css';

interface DiaryDateGroupProps {
  date: string;
  entries: DiaryEntrySummary[];
}

export function DiaryDateGroup({ date, entries }: DiaryDateGroupProps) {
  const { formatDate } = useFormatters();
  // Sort all entries by createdAt descending (newest first)
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <section className={styles.group} data-testid={`date-group-${date}`}>
      <h2 className={styles.dateHeader}>{formatDate(date)}</h2>

      <ul className={styles.entriesList}>
        {sortedEntries.map((entry) =>
          entry.isAutomatic ? (
            <SystemEventFeedRow key={entry.id} entry={entry} />
          ) : (
            <li key={entry.id}>
              <DiaryEntryCard entry={entry} />
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
