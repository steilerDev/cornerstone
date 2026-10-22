import type { AttentionRow, HomeAgendaItem } from '@cornerstone/shared';
import { HOME_WEEK_DAYS } from '@cornerstone/shared';

export interface AgendaDay {
  date: string;
  items: HomeAgendaItem[];
}

function subjectKey(type: string, id: string): string {
  return `${type}:${id}`;
}

/**
 * Drops items whose subject is the subject of an attention row (rows only, not Tidy up). The
 * members of an N2 group count as `work_item` subjects. Without rows (still loading or failed)
 * nothing is dropped.
 */
export function dropAttentionRepeats(
  items: readonly HomeAgendaItem[],
  rows: readonly AttentionRow[] | null,
): HomeAgendaItem[] {
  if (rows === null) return [...items];
  const taken = new Set<string>();
  for (const row of rows) {
    taken.add(subjectKey(row.subject.type, row.subject.id));
    if (row.params.rule === 'N2' && row.params.kind === 'group') {
      for (const member of row.params.items) taken.add(subjectKey('work_item', member.id));
    }
  }
  return items.filter((item) => !taken.has(subjectKey(item.subject.type, item.subject.id)));
}

/** Groups by date within [from, to] (inclusive); days without items are omitted; ascending. */
export function groupAgendaByDay(
  items: readonly HomeAgendaItem[],
  from: string,
  to: string,
): AgendaDay[] {
  const byDate = new Map<string, HomeAgendaItem[]>();
  for (const item of items) {
    if (item.date < from || item.date > to) continue;
    const list = byDate.get(item.date);
    if (list) list.push(item);
    else byDate.set(item.date, [item]);
  }
  return [...byDate.keys()]
    .sort()
    .map((date) => ({ date, items: byDate.get(date) as HomeAgendaItem[] }));
}

/** `YYYY-MM-DD` plus whole days, computed in UTC so a DST change never shifts the date. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** The first 7 days (today .. today + 6) and the days after them. */
export function splitWeek(
  days: readonly AgendaDay[],
  today: string,
): { week: AgendaDay[]; next: AgendaDay[] } {
  const lastWeekDay = addDays(today, HOME_WEEK_DAYS - 1);
  return {
    week: days.filter((day) => day.date <= lastWeekDay),
    next: days.filter((day) => day.date > lastWeekDay),
  };
}
