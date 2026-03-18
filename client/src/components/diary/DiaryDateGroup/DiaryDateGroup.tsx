import { useFormatters } from '../../../lib/formatters.js';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import { DiaryEntryCard } from '../DiaryEntryCard/DiaryEntryCard.js';
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

      <div className={styles.entriesList}>
        {sortedEntries.map((entry) => (
          <DiaryEntryCard key={entry.id} entry={entry} />
        ))}
      </div>
    </section>
  );
}
