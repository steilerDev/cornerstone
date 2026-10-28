import { WORK_ITEM_STATUSES } from '@cornerstone/shared';
import type { AreaSummary, WorkItemListQuery, WorkItemStatus } from '@cornerstone/shared';
import { parseDateRange, parseNumberRange } from '../../components/ObjectList/rangeParams.js';
import type { ObjectListQuery } from '../../components/ObjectList/types.js';
import type { WorkItemRowsParams } from '../../lib/workItemsApi.js';

/** The status chips of the Tasks list; the URL value is the stored status ('all' is the template's). */
export const TASK_CHIPS = WORK_ITEM_STATUSES;

/** The server sorts the Tasks list accepts from the sort control. */
const TASK_SORTS = [
  'start_date',
  'end_date',
  'title',
  'status',
  'expected_cost',
  'created_at',
] as const satisfies readonly NonNullable<WorkItemListQuery['sortBy']>[];
type TaskSort = (typeof TASK_SORTS)[number];

export const TASK_DEFAULT_SORT: TaskSort = 'start_date';

/** The Filters panel params of the Tasks list, in panel order. */
export const TASK_FILTER_PARAMS = [
  'areaId',
  'assignedVendorId',
  'assignedUserId',
  'milestoneId',
  'startDate',
  'endDate',
  'budgetLines',
] as const;

/** The area group key and the area/company filter sentinel for "no area" / "no company". */
export const NONE_KEY = '__none__';

/**
 * Stored column keys of the DataTable this list replaced → the new key (null drops it). The old
 * Title, Status and Area columns are always shown now (area is the chip under the title).
 */
export const TASK_LEGACY_COLUMN_KEYS: Readonly<Record<string, string | null>> = {
  title: null,
  status: null,
  area: null,
  assignedTo: 'who',
  vendor: 'who',
  startDate: 'dates',
  endDate: 'dates',
  budgetLines: 'expectedCost',
};

const AREA_PATH_SEPARATOR = ' \u203a ';

/** "Ground floor › Kitchen": the area's full path as one string (group label, link text). */
export function areaPathLabel(area: AreaSummary): string {
  return [...area.ancestors, area].map((segment) => segment.name).join(AREA_PATH_SEPARATOR);
}

function isTaskSort(value: string): value is TaskSort {
  return (TASK_SORTS as readonly string[]).includes(value);
}

function isTaskStatus(value: string): value is WorkItemStatus {
  return (WORK_ITEM_STATUSES as readonly string[]).includes(value);
}

/** A whole number from a URL value, or null (non-numeric, fractional, or below 1 for ids). */
function wholeNumber(raw: string | undefined, min: number): number | null {
  if (raw === undefined || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= min ? value : null;
}

/** A whole number of at least 0 (the cost-lines bounds are counts). */
function isCount(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value >= 0;
}

/**
 * The list query as API params: chip, search, sort, the time grouping and the filters. Never
 * includes page, pageSize or ids. A non-integer `milestoneId` or cost-lines bound is omitted.
 */
export function tasksListApiParams(query: ObjectListQuery): WorkItemRowsParams {
  const params: {
    -readonly [K in keyof WorkItemRowsParams]: WorkItemRowsParams[K];
  } = {};
  if (query.q) params.q = query.q;
  if (isTaskStatus(query.chip)) params.status = query.chip;
  if (query.serverGroup === 'time') params.group = 'time';
  params.sortBy = isTaskSort(query.sortBy) ? query.sortBy : TASK_DEFAULT_SORT;
  params.sortOrder = query.sortOrder;

  const { filters } = query;
  if (filters.areaId) params.areaId = filters.areaId;
  if (filters.assignedVendorId) params.assignedVendorId = filters.assignedVendorId;
  if (filters.assignedUserId) params.assignedUserId = filters.assignedUserId;
  const milestoneId = wholeNumber(filters.milestoneId, 1);
  if (milestoneId !== null) params.milestoneId = milestoneId;

  const start = parseDateRange(filters.startDate ?? null);
  if (start?.from) params.startDateFrom = start.from;
  if (start?.to) params.startDateTo = start.to;
  const end = parseDateRange(filters.endDate ?? null);
  if (end?.from) params.endDateFrom = end.from;
  if (end?.to) params.endDateTo = end.to;

  const lines = parseNumberRange(filters.budgetLines ?? null);
  if (lines && isCount(lines.min)) params.budgetLinesMin = lines.min;
  if (lines && isCount(lines.max)) params.budgetLinesMax = lines.max;
  return params;
}
