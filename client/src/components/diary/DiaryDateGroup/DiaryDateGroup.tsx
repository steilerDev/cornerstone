import type { DiaryEntrySummary } from '@cornerstone/shared';
import { DiaryEntryCard } from '../DiaryEntryCard/DiaryEntryCard.js';
import styles from './DiaryDateGroup.module.css';

interface DiaryDateGroupProps {
  date: string;
  entries: DiaryEntrySummary[];
}

function formatDateHeader(dateString: string): string {
  const date = new Date(dateString);
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  return date.toLocaleDateString('en-US', options);
}

export function DiaryDateGroup({ date, entries }: DiaryDateGroupProps) {
  const manualEntries = entries.filter((e) => !e.isAutomatic);
  const automaticEntries = entries.filter((e) => e.isAutomatic);

  return (
    <section className={styles.group} data-testid={`date-group-${date}`}>
      <h2 className={styles.dateHeader}>{formatDateHeader(date)}</h2>
      <div className={styles.entriesList}>
        {manualEntries.map((entry) => (
          <DiaryEntryCard key={entry.id} entry={entry} />
        ))}
      </div>

      {automaticEntries.length > 0 && (
        <div className={styles.automaticSection}>
          <h3 className={styles.automaticHeader}>Automatic events</h3>
          <div className={styles.entriesList}>
            {automaticEntries.map((entry) => (
              <DiaryEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
