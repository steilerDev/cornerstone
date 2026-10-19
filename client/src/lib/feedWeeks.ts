/**
 * Pure ISO-week helpers for feeds (the Site diary groups its rows by week). Dates are
 * `YYYY-MM-DD` strings computed in UTC, so no time zone can shift a day.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcMs(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day);
}

function toKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The Monday of the ISO week that contains the date. */
export function weekStart(dateKey: string): string {
  const ms = toUtcMs(dateKey);
  const weekday = new Date(ms).getUTCDay(); // 0 = Sunday
  const sinceMonday = (weekday + 6) % 7;
  return toKey(ms - sinceMonday * DAY_MS);
}

/** The Sunday that ends the week starting on the given Monday. */
export function weekEnd(mondayKey: string): string {
  return toKey(toUtcMs(mondayKey) + 6 * DAY_MS);
}

export type WeekKind = 'thisWeek' | 'lastWeek' | 'other';

/** Whether the week starting on `mondayKey` is today's week, the one before, or neither. */
export function weekKind(mondayKey: string, todayKey: string): WeekKind {
  const thisMonday = weekStart(todayKey);
  if (mondayKey === thisMonday) return 'thisWeek';
  if (mondayKey === toKey(toUtcMs(thisMonday) - 7 * DAY_MS)) return 'lastWeek';
  return 'other';
}

/** Groups items by the week of their `entryDate`; keeps order and merges by Monday key. */
export function groupByWeek<T extends { entryDate: string }>(items: readonly T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = weekStart(item.entryDate);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.entries()];
}
