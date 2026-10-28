/**
 * Pure week bucketing for the phone agenda (Schedule, #2247 D22): every task, milestone and
 * purchase appears once in each ISO week it covers. Dates are `YYYY-MM-DD` keys computed in UTC.
 */

import type {
  TimelineHouseholdItem,
  TimelineMilestone,
  TimelineResponse,
  TimelineWorkItem,
} from '@cornerstone/shared';
import { weekEnd, weekStart } from '../../lib/feedWeeks.js';
import { addDays } from '../../lib/home/agenda.js';
import { barDates, daysBetweenKeys } from '../../lib/scheduleDates.js';
import { rowKey } from '../../lib/scheduleView.js';
import type { ScheduleRowKey } from '../../lib/scheduleView.js';

interface AgendaItemBase {
  readonly key: ScheduleRowKey;
  /** First and last day the item occupies (equal for a milestone or a one-day delivery). */
  readonly start: string;
  readonly end: string;
}

export type AgendaItem =
  | (AgendaItemBase & { readonly kind: 'task'; readonly item: TimelineWorkItem })
  | (AgendaItemBase & { readonly kind: 'milestone'; readonly item: TimelineMilestone })
  | (AgendaItemBase & { readonly kind: 'purchase'; readonly item: TimelineHouseholdItem });

export interface AgendaWeek {
  /** Monday of the week. */
  readonly monday: string;
  /** Sunday of the week. */
  readonly sunday: string;
  /** ISO week number. */
  readonly number: number;
  /** The week that contains today. */
  readonly isCurrent: boolean;
  /** The week the agenda scrolls to: the first from this week on, else the last. */
  readonly isTarget: boolean;
  readonly items: readonly AgendaItem[];
}

/** ISO 8601 week number of the date's week. */
export function isoWeekNumber(dateKey: string): number {
  const thursday = addDays(weekStart(dateKey), 3);
  const yearStart = `${thursday.slice(0, 4)}-01-01`;
  return Math.floor(daysBetweenKeys(yearStart, thursday) / 7) + 1;
}

function orderedRange(
  first: string | null,
  second: string | null,
): { start: string; end: string } | null {
  const start = first ?? second;
  const end = second ?? first;
  if (start === null || end === null) return null;
  return start <= end ? { start, end } : { start: end, end: start };
}

function taskItem(item: TimelineWorkItem): AgendaItem | null {
  const { start, end } = barDates(item);
  const range = orderedRange(start, end);
  return range && { kind: 'task', key: rowKey('task', item.id), item, ...range };
}

function milestoneItem(item: TimelineMilestone): AgendaItem {
  const day = item.completedAt?.slice(0, 10) ?? item.projectedDate ?? item.targetDate;
  return { kind: 'milestone', key: rowKey('milestone', item.id), item, start: day, end: day };
}

function purchaseItem(item: TimelineHouseholdItem): AgendaItem | null {
  const start = item.actualDeliveryDate ?? item.targetDeliveryDate ?? item.earliestDeliveryDate;
  if (start === null) return null;
  const end = item.actualDeliveryDate ?? item.latestDeliveryDate ?? start;
  return {
    kind: 'purchase',
    key: rowKey('purchase', item.id),
    item,
    start,
    end: end < start ? start : end,
  };
}

const KIND_ORDER: Record<AgendaItem['kind'], number> = { task: 0, milestone: 1, purchase: 2 };

function itemTitle(entry: AgendaItem): string {
  return entry.kind === 'purchase' ? entry.item.name : entry.item.title;
}

function compareItems(a: AgendaItem, b: AgendaItem): number {
  if (a.start !== b.start) return a.start < b.start ? -1 : 1;
  if (a.end !== b.end) return a.end < b.end ? -1 : 1;
  if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  return itemTitle(a).localeCompare(itemTitle(b));
}

/**
 * Weeks that hold at least one active item, oldest first. An item is active in a week when its
 * days overlap it; items without any date are left out.
 */
export function buildAgendaWeeks(data: TimelineResponse, todayKey: string): AgendaWeek[] {
  const entries = [
    ...data.workItems.map(taskItem),
    ...data.milestones.map(milestoneItem),
    ...data.householdItems.map(purchaseItem),
  ].filter((entry): entry is AgendaItem => entry !== null);

  const byMonday = new Map<string, AgendaItem[]>();
  for (const entry of entries) {
    const last = weekStart(entry.end);
    for (let monday = weekStart(entry.start); monday <= last; monday = addDays(monday, 7)) {
      const bucket = byMonday.get(monday);
      if (bucket) bucket.push(entry);
      else byMonday.set(monday, [entry]);
    }
  }

  const weeks = [...byMonday.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  const thisMonday = weekStart(todayKey);
  const mondays = weeks.map(([monday]) => monday);
  const targetMonday = mondays.find((monday) => monday >= thisMonday) ?? mondays.at(-1);
  return weeks.map(([monday, items]) => ({
    monday,
    sunday: weekEnd(monday),
    number: isoWeekNumber(monday),
    isCurrent: monday === thisMonday,
    isTarget: monday === targetMonday,
    items: items.slice().sort(compareItems),
  }));
}

/**
 * The part of the week a bar covers, in percent of the week's width. A milestone (and any one-day
 * item) gets `widthPct` of one day; `centrePct` is the middle of the first covered day.
 */
export function weekBar(
  entry: Pick<AgendaItem, 'start' | 'end'>,
  monday: string,
): { leftPct: number; widthPct: number; centrePct: number } {
  const sunday = weekEnd(monday);
  const from = entry.start > monday ? entry.start : monday;
  const to = entry.end < sunday ? entry.end : sunday;
  const leftDays = daysBetweenKeys(monday, from);
  const spanDays = daysBetweenKeys(from, to) + 1;
  return {
    leftPct: (leftDays / 7) * 100,
    widthPct: (spanDays / 7) * 100,
    centrePct: ((leftDays + 0.5) / 7) * 100,
  };
}
