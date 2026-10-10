import type { ScheduleSignal, WorkItemScheduleFields } from '@cornerstone/shared';
import { formatDayRange } from './formatters.js';

/** Signals a task chip can show ('critical' belongs to a later story). */
export type ShownScheduleSignal = Extract<ScheduleSignal, 'late' | 'held_up'>;
export type ScheduleSignalState =
  | { signal: Extract<ShownScheduleSignal, 'late'>; days: number }
  | { signal: Extract<ShownScheduleSignal, 'held_up'> };

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

/** True when the plan adds information: planned dates exist and differ from the shown ones. */
export function showsPlannedRow(data: {
  startDate: string | null;
  endDate: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
}): boolean {
  return (
    (data.plannedStartDate !== null || data.plannedEndDate !== null) &&
    (data.plannedStartDate !== data.startDate || data.plannedEndDate !== data.endDate)
  );
}

/** "March 5 – 8, 2026"-style range, one date when only one is set, null when none. */
export function plannedRangeText(
  plannedStart: string | null,
  plannedEnd: string | null,
  locale: string,
  formatDate: (d: string) => string,
): string | null {
  if (plannedStart && plannedEnd) {
    return formatDayRange(
      new Date(`${plannedStart}T00:00:00Z`),
      new Date(`${plannedEnd}T00:00:00Z`),
      locale,
    );
  }
  const single = plannedStart ?? plannedEnd;
  return single ? formatDate(single) : null;
}
