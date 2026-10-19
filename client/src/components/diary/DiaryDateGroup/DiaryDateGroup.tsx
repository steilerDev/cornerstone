import { useId } from 'react';
import { useFormatters } from '../../../lib/formatters.js';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import { DiaryEntryCard } from '../DiaryEntryCard/DiaryEntryCard.js';
import { SystemEventFeedRow } from '../../FeedRow/SystemEventFeedRow.js';
import styles from './DiaryDateGroup.module.css';

interface DiaryDateGroupProps {
  date: string;
  entries: DiaryEntrySummary[];
  /** Visible heading text; default `formatDate(date)`. */
  heading?: string;
  /** Muted visible text after the heading (e.g. the date beside "Today"). */
  headingDetail?: string;
}

export function DiaryDateGroup({ date, entries, heading, headingDetail }: DiaryDateGroupProps) {
  const { formatDate } = useFormatters();
  const headingId = useId();
  // Sort all entries by createdAt descending (newest first)
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <section
      className={styles.group}
      aria-labelledby={headingId}
      data-testid={`date-group-${date}`}
    >
      <h2 id={headingId} className={styles.dateHeader}>
        {heading ?? formatDate(date)}
        {headingDetail ? <span className={styles.headingDetail}>{headingDetail}</span> : null}
      </h2>

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
