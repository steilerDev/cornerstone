import { useTranslation } from 'react-i18next';
import type { DiaryEntryType } from '@cornerstone/shared';
import { diaryEntryTypeLabelKey } from '../../../lib/diaryEntryTypeLabel.js';
import styles from './DiaryEntryTypeBadge.module.css';

interface DiaryEntryTypeBadgeProps {
  entryType: DiaryEntryType;
  size?: 'sm' | 'lg';
}

const EMOJI_MAP: Record<DiaryEntryType, string> = {
  daily_log: '📋',
  site_visit: '🔍',
  delivery: '📦',
  issue: '⚠️',
  general_note: '📝',
  work_item_status: '⚙️',
  invoice_status: '⚙️',
  invoice_created: '⚙️',
  milestone_delay: '⚙️',
  budget_breach: '⚙️',
  auto_reschedule: '⚙️',
  subsidy_status: '⚙️',
};

const BADGE_CLASS_MAP: Record<DiaryEntryType, string> = {
  daily_log: styles.dailyLog!,
  site_visit: styles.siteVisit!,
  delivery: styles.delivery!,
  issue: styles.issue!,
  general_note: styles.generalNote!,
  work_item_status: styles.automatic!,
  invoice_status: styles.automatic!,
  invoice_created: styles.automatic!,
  milestone_delay: styles.automatic!,
  budget_breach: styles.automatic!,
  auto_reschedule: styles.automatic!,
  subsidy_status: styles.automatic!,
};

export function DiaryEntryTypeBadge({ entryType, size = 'sm' }: DiaryEntryTypeBadgeProps) {
  const { t } = useTranslation('diary');
  const typeKey = diaryEntryTypeLabelKey(entryType);
  const label = t(typeKey.key, { ns: typeKey.ns });
  const emoji = EMOJI_MAP[entryType];
  const sizeClass = size === 'lg' ? styles.sizeLg : styles.sizeSm;

  return (
    <span
      className={`${styles.badge} ${sizeClass} ${BADGE_CLASS_MAP[entryType]}`}
      title={label}
      aria-label={t('entryTypeBadge.ariaLabel', { type: label })}
      data-testid={`diary-type-badge-${entryType}`}
    >
      {emoji}
    </span>
  );
}
