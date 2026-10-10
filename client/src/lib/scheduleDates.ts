import type { WorkItemScheduleFields } from '@cornerstone/shared';

export type ScheduleSignalState = { signal: 'late'; days: number } | { signal: 'held_up' };

/** Dates a chart/calendar draws: actual dates win, else the forecast (contract 4). */
export function barDates(item: {
  actualStartDate: string | null;
  actualEndDate: string | null;
  projectedStartDate: string | null;
  projectedEndDate: string | null;
}): { start: string | null; end: string | null } {
  return {
    start: item.actualStartDate ?? item.projectedStartDate,
    end: item.actualEndDate ?? item.projectedEndDate,
  };
}

/** Late (with days) wins over Held up; null when neither (or isLate without lateDays). */
export function scheduleSignalOf(
  item: Pick<WorkItemScheduleFields, 'isLate' | 'lateDays' | 'isHeldUp'>,
): ScheduleSignalState | null {
  if (item.isLate && item.lateDays != null && item.lateDays > 0) {
    return { signal: 'late', days: item.lateDays };
  }
  if (item.isHeldUp) return { signal: 'held_up' };
  return null;
}
