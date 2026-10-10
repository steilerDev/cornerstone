/**
 * Pure builders for Gantt/Calendar tooltip data (no React).
 *
 * One construction path for every surface that shows a task or purchase tooltip,
 * so the Schedule chart and the calendar always name the same fields.
 */

import type { AreaSummary, TimelineHouseholdItem, TimelineWorkItem } from '@cornerstone/shared';
import { computeActualDuration } from '../../lib/formatters.js';
import { barDates, scheduleSignalOf } from '../../lib/scheduleDates.js';
import type {
  GanttTooltipDependencyEntry,
  GanttTooltipHouseholdItemData,
  GanttTooltipWorkItemData,
} from './GanttTooltip.js';

export const AREA_PATH_SEPARATOR = ' › ';

/** Base height estimate (px) for the work-item tooltip flip logic. */
export const TOOLTIP_HEIGHT_BASE = 165;
/** Height (px) of one detail row or list line. */
export const ROW_HEIGHT = 18;

/** "Test House › Test Kitchen"; null when there is no area. */
export function formatAreaPath(area: AreaSummary | null | undefined): string | null {
  if (!area) return null;
  return [...area.ancestors.map((a) => a.name), area.name].join(AREA_PATH_SEPARATOR);
}

export function buildWorkItemTooltipData(
  item: TimelineWorkItem,
  dependencies: readonly GanttTooltipDependencyEntry[] | undefined,
  today: Date,
): GanttTooltipWorkItemData {
  const { start, end } = barDates(item);
  return {
    kind: 'work-item',
    title: item.title,
    status: item.status,
    startDate: start,
    endDate: end,
    plannedStartDate: item.startDate,
    plannedEndDate: item.endDate,
    scheduleSignal: scheduleSignalOf(item),
    durationDays: item.durationDays,
    plannedDurationDays: item.durationDays,
    actualDurationDays: computeActualDuration(start, end, today),
    assignedUserName: item.assignedUser?.displayName ?? null,
    assignedVendorName: item.assignedVendor?.name ?? null,
    areaName: formatAreaPath(item.area),
    dependencies: dependencies && dependencies.length > 0 ? [...dependencies] : undefined,
    workItemId: item.id,
  };
}

export function buildHouseholdItemTooltipData(
  hi: TimelineHouseholdItem,
  linkedItems: GanttTooltipHouseholdItemData['linkedItems'],
): GanttTooltipHouseholdItemData {
  return {
    kind: 'household-item',
    name: hi.name,
    status: hi.status,
    earliestDeliveryDate: hi.earliestDeliveryDate,
    latestDeliveryDate: hi.latestDeliveryDate,
    targetDeliveryDate: hi.targetDeliveryDate,
    actualDeliveryDate: hi.actualDeliveryDate,
    isLate: hi.isLate,
    householdItemId: hi.id,
    areaName: formatAreaPath(hi.area),
    linkedItems,
  };
}

/** True when the Planned row adds information: planned dates exist and differ from the shown ones. */
export function showsPlannedRow(
  data: Pick<
    GanttTooltipWorkItemData,
    'startDate' | 'endDate' | 'plannedStartDate' | 'plannedEndDate'
  >,
): boolean {
  return (
    (data.plannedStartDate !== null || data.plannedEndDate !== null) &&
    (data.plannedStartDate !== data.startDate || data.plannedEndDate !== data.endDate)
  );
}

/** Height used by the tooltip's flip logic (px). */
export function estimateWorkItemTooltipHeight(
  data: GanttTooltipWorkItemData,
  maxPerGroup: number,
): number {
  let height = TOOLTIP_HEIGHT_BASE;
  if (data.assignedVendorName) height += ROW_HEIGHT;
  if (data.areaName) height += ROW_HEIGHT;
  if (showsPlannedRow(data)) height += ROW_HEIGHT;
  const deps = data.dependencies ?? [];
  for (const role of ['predecessor', 'successor'] as const) {
    const n = deps.filter((d) => d.role === role).length;
    if (n === 0) continue;
    height +=
      ROW_HEIGHT + Math.min(n, maxPerGroup) * ROW_HEIGHT + (n > maxPerGroup ? ROW_HEIGHT : 0);
  }
  return height;
}
