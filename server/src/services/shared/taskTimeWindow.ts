/**
 * Tasks list time windows (#2245): the ONE "Late" predicate for tasks and the server-side
 * grouping of a task into Late / This week / Next two weeks / Later / Done. Pure: no database
 * and no clock; callers pass `today`.
 */

import { HOME_AGENDA_DAYS, HOME_WEEK_DAYS } from '@cornerstone/shared';
import type { TaskTimeWindow, WorkItemScheduleFields } from '@cornerstone/shared';
import { addDaysUtc } from './holdsUp.js';

/** Contract 4: a task is Late when it is unfinished and its projection says it is late. */
export function isTaskLate(
  status: string,
  fields: Pick<WorkItemScheduleFields, 'isLate'> | undefined,
): boolean {
  return status !== 'completed' && fields?.isLate === true;
}

/**
 * Window of a task, first matching rule wins: completed -> done; late -> late; in progress ->
 * this_week; not started without a stored start date -> later (like Home, undated tasks stay off
 * the agenda); otherwise the forecast start decides (within the week, within the agenda, later).
 */
export function taskTimeWindowOf(
  row: { status: string; startDate: string | null },
  fields: WorkItemScheduleFields,
  today: string,
): TaskTimeWindow {
  if (row.status === 'completed') return 'done';
  if (isTaskLate(row.status, fields)) return 'late';
  if (row.status === 'in_progress') return 'this_week';
  if (row.startDate === null) return 'later';
  // A stored start date always has a forecast start (the forecast only moves it later)
  const start = fields.projectedStartDate!;
  if (start <= addDaysUtc(today, HOME_WEEK_DAYS - 1)) return 'this_week';
  if (start <= addDaysUtc(today, HOME_AGENDA_DAYS - 1)) return 'next_two_weeks';
  return 'later';
}
