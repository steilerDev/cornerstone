import { MILESTONE_DISPLAY_STATUSES, foldSearchText } from '@cornerstone/shared';
import type { MilestoneListRow } from '@cornerstone/shared';
import { parseDateRange, parseNumberRange } from '../../components/ObjectList/rangeParams.js';
import type { ObjectListQuery } from '../../components/ObjectList/types.js';
import { milestoneDisplayStatus } from '../../lib/milestoneStatusLabel.js';

/** The status chips of the Milestones list; Late and Early are only the badge word. */
export const MILESTONE_LIST_CHIPS = ['upcoming', 'reached'] as const;
export type MilestoneListChip = (typeof MILESTONE_LIST_CHIPS)[number];

/** The sorts of the Milestones list (applied on the client: the endpoint returns every milestone). */
export const MILESTONE_SORTS = [
  'target_date',
  'title',
  'projected_date',
  'status',
  'waits_for',
] as const;
export type MilestoneSort = (typeof MILESTONE_SORTS)[number];

export const MILESTONE_DEFAULT_SORT: MilestoneSort = 'target_date';

/** The Filters panel params of the Milestones list, in panel order. */
export const MILESTONE_FILTER_PARAMS = ['targetDate', 'waitsFor'] as const;

/**
 * Stored column keys of the DataTable this list replaced → the new key (null drops it). Title and
 * Status are always shown now.
 */
export const MILESTONE_LEGACY_COLUMN_KEYS: Readonly<Record<string, string | null>> = {
  title: null,
  status: null,
  targetDate: 'target',
  workItemCount: 'waitsFor',
};

function isMilestoneSort(value: string): value is MilestoneSort {
  return (MILESTONE_SORTS as readonly string[]).includes(value);
}

function compareTitles(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Target date, then title, then id: the order of rows the chosen sort ties on. */
function compareTies(a: MilestoneListRow, b: MilestoneListRow): number {
  return compareText(a.targetDate, b.targetDate) || compareTitles(a.title, b.title) || a.id - b.id;
}

function primaryCompare(sort: MilestoneSort, a: MilestoneListRow, b: MilestoneListRow): number {
  switch (sort) {
    case 'title':
      return compareTitles(a.title, b.title);
    case 'status':
      return (
        MILESTONE_DISPLAY_STATUSES.indexOf(milestoneDisplayStatus(a).status) -
        MILESTONE_DISPLAY_STATUSES.indexOf(milestoneDisplayStatus(b).status)
      );
    case 'waits_for':
      return a.workItemCount - b.workItemCount;
    case 'projected_date':
      return compareText(a.projectedDate ?? '', b.projectedDate ?? '');
    case 'target_date':
      return compareText(a.targetDate, b.targetDate);
  }
}

/**
 * The rows the list shows for a query: chip, search (title and description), the two range
 * filters, then the sort. `scopeTotal` counts the rows matching only the chip. A row without a
 * projected date sorts last in either direction.
 */
export function selectMilestoneRows(
  rows: readonly MilestoneListRow[],
  query: ObjectListQuery,
): { items: MilestoneListRow[]; scopeTotal: number } {
  const inScope = rows.filter((row) => {
    if (query.chip === 'upcoming') return !row.isCompleted;
    if (query.chip === 'reached') return row.isCompleted;
    return true;
  });

  const needle = foldSearchText(query.q);
  const target = parseDateRange(query.filters.targetDate ?? null);
  const waits = parseNumberRange(query.filters.waitsFor ?? null);
  const items = inScope.filter((row) => {
    if (needle && !foldSearchText(`${row.title} ${row.description ?? ''}`).includes(needle)) {
      return false;
    }
    if (target?.from && row.targetDate < target.from) return false;
    if (target?.to && row.targetDate > target.to) return false;
    if (waits && waits.min !== null && row.workItemCount < waits.min) return false;
    if (waits && waits.max !== null && row.workItemCount > waits.max) return false;
    return true;
  });

  const sort = isMilestoneSort(query.sortBy) ? query.sortBy : MILESTONE_DEFAULT_SORT;
  const direction = query.sortOrder === 'desc' ? -1 : 1;
  items.sort((a, b) => {
    if (sort === 'projected_date' && (a.projectedDate === null) !== (b.projectedDate === null)) {
      return a.projectedDate === null ? 1 : -1;
    }
    return primaryCompare(sort, a, b) * direction || compareTies(a, b);
  });

  return { items, scopeTotal: inScope.length };
}
