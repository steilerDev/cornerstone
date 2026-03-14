import type { DiaryEntryType } from '@cornerstone/shared';
import styles from './DiaryEntryTypeBadge.module.css';

interface DiaryEntryTypeBadgeProps {
  entryType: DiaryEntryType;
  size?: 'sm' | 'lg';
}

const ENTRY_TYPE_LABELS: Record<DiaryEntryType, string> = {
  daily_log: 'Daily Log',
  site_visit: 'Site Visit',
  delivery: 'Delivery',
  issue: 'Issue',
  general_note: 'Note',
  work_item_status: 'Work Item',
  invoice_status: 'Invoice',
  milestone_delay: 'Milestone',
  budget_breach: 'Budget',
  auto_reschedule: 'Schedule',
  subsidy_status: 'Subsidy',
};

const EMOJI_MAP: Record<DiaryEntryType, string> = {
  daily_log: '📋',
  site_visit: '🔍',
  delivery: '📦',
  issue: '⚠️',
  general_note: '📝',
  work_item_status: '⚙️',
  invoice_status: '⚙️',
  milestone_delay: '⚙️',
  budget_breach: '⚙️',
  auto_reschedule: '⚙️',
  subsidy_status: '⚙️',
};

const BADGE_CLASS_MAP: Record<DiaryEntryType, string> = {
  daily_log: styles.dailyLog,
  site_visit: styles.siteVisit,
  delivery: styles.delivery,
  issue: styles.issue,
  general_note: styles.generalNote,
  work_item_status: styles.automatic,
  invoice_status: styles.automatic,
  milestone_delay: styles.automatic,
  budget_breach: styles.automatic,
  auto_reschedule: styles.automatic,
  subsidy_status: styles.automatic,
};

export function DiaryEntryTypeBadge({ entryType, size = 'sm' }: DiaryEntryTypeBadgeProps) {
  const emoji = EMOJI_MAP[entryType];
  const sizeClass = size === 'lg' ? styles.sizeLg : styles.sizeSm;

  return (
    <span
      className={`${styles.badge} ${sizeClass} ${BADGE_CLASS_MAP[entryType]}`}
      title={ENTRY_TYPE_LABELS[entryType]}
      aria-label={`Entry type: ${ENTRY_TYPE_LABELS[entryType]}`}
      data-testid={`diary-type-badge-${entryType}`}
    >
      {emoji}
    </span>
  );
}
