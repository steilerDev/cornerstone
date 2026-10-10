import type { MilestoneDisplayStatus } from '@cornerstone/shared';
import { I18N_UNION_KEYS } from '../i18n/unionKeys.js';

/** Minimal t() shape bound to (or accepting) the common namespace. */
export type MilestoneLabelT = (key: string, options: Record<string, unknown>) => string;

interface MilestoneLabelInput {
  isCompleted: boolean;
  targetDate: string;
  projectedDate?: string | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function utcDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

/** Derived display status of a milestone (glossary v1): reached / late / early / upcoming. */
export function milestoneDisplayStatus(milestone: MilestoneLabelInput): {
  status: MilestoneDisplayStatus;
  days: number;
} {
  if (milestone.isCompleted) return { status: 'reached', days: 0 };
  if (milestone.projectedDate != null && milestone.projectedDate !== milestone.targetDate) {
    const diff = Math.round(
      (utcDay(milestone.projectedDate) - utcDay(milestone.targetDate)) / MS_PER_DAY,
    );
    return diff > 0 ? { status: 'late', days: diff } : { status: 'early', days: -diff };
  }
  return { status: 'upcoming', days: 0 };
}

/** Translated canonical milestone status word (common:statusVocabulary.milestone). */
export function milestoneStatusLabel(tCommon: MilestoneLabelT, milestone: MilestoneLabelInput) {
  const { status, days } = milestoneDisplayStatus(milestone);
  const set = I18N_UNION_KEYS.statusVocabularyMilestone;
  return tCommon(set.key(status), { ns: set.ns, days });
}
