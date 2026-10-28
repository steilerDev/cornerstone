import type { AreaSummary, TimelineResponse, TimelineWorkItem } from '@cornerstone/shared';
import type { ZoomLevel } from '../components/GanttChart/ganttUtils.js';
import { scheduleSignalOf } from './scheduleDates.js';

import {
  SCHEDULE_SHOW_KEYS,
  SCHEDULE_KIND_KEYS,
  SCHEDULE_GROUPS,
  SCHEDULE_PHONE_VIEWS,
  SCHEDULE_ZOOMS,
  type ScheduleShowKey,
  type ScheduleGroup,
  type SchedulePhoneView,
  type ScheduleSubjectKind,
} from './scheduleViewKeys.js';

/** Everything on except Done. */
export const DEFAULT_SCHEDULE_SHOW: ReadonlySet<ScheduleShowKey> = new Set<ScheduleShowKey>([
  'tasks',
  'milestones',
  'purchases',
  'arrows',
  'critical',
]);

export {
  SCHEDULE_SHOW_KEYS,
  SCHEDULE_KIND_KEYS,
  SCHEDULE_GROUPS,
  SCHEDULE_PHONE_VIEWS,
  SCHEDULE_SUBJECT_KINDS,
  SCHEDULE_ZOOMS,
  type ScheduleShowKey,
  type ScheduleGroup,
  type SchedulePhoneView,
  type ScheduleSubjectKind,
} from './scheduleViewKeys.js';

/** Preference key the view state is stored under (JSON). */
export const SCHEDULE_PREFERENCE_KEY = 'schedule.view';

export type ScheduleRowKey = `task:${string}` | `milestone:${number}` | `purchase:${string}`;

export function rowKey(kind: 'task' | 'purchase', id: string): ScheduleRowKey;
export function rowKey(kind: 'milestone', id: number): ScheduleRowKey;
export function rowKey(kind: ScheduleSubjectKind, id: string | number): ScheduleRowKey {
  if (kind === 'milestone') return `milestone:${Number(id)}`;
  return kind === 'task' ? `task:${id}` : `purchase:${id}`;
}

/** Splits at the first colon; the id is always the string form. */
export function parseRowKey(key: ScheduleRowKey): { kind: ScheduleSubjectKind; id: string } {
  const colon = key.indexOf(':');
  const prefix = key.slice(0, colon);
  const id = key.slice(colon + 1);
  if (prefix === 'milestone') return { kind: 'milestone', id };
  return { kind: prefix === 'purchase' ? 'purchase' : 'task', id };
}

export interface SchedulePreference {
  show?: ScheduleShowKey[];
  zoom?: ZoomLevel;
  group?: ScheduleGroup;
  areaId?: string | null;
  legendOpen?: boolean;
  phoneView?: SchedulePhoneView;
}

/** The list member equal to `value`, else undefined (a sound narrowing, unlike a type guard). */
function pick<T extends string>(list: readonly T[], value: unknown): T | undefined {
  return list.find((member) => member === value);
}

/** Tolerant: bad JSON, a non-object, or an unknown member of a field drops that field only. */
export function parseSchedulePreference(raw: string | undefined): SchedulePreference {
  if (raw === undefined) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const source = parsed as Record<string, unknown>;
  const result: SchedulePreference = {};

  if (Array.isArray(source.show)) {
    const keys = SCHEDULE_SHOW_KEYS.filter((key) => (source.show as unknown[]).includes(key));
    if (keys.length > 0) result.show = keys;
  }
  const zoom = pick(SCHEDULE_ZOOMS, source.zoom);
  if (zoom) result.zoom = zoom;
  const group = pick(SCHEDULE_GROUPS, source.group);
  if (group) result.group = group;
  if (typeof source.areaId === 'string' || source.areaId === null) result.areaId = source.areaId;
  if (typeof source.legendOpen === 'boolean') result.legendOpen = source.legendOpen;
  const phoneView = pick(SCHEDULE_PHONE_VIEWS, source.phoneView);
  if (phoneView) result.phoneView = phoneView;
  return result;
}

function hasKind(show: ReadonlySet<ScheduleShowKey>): boolean {
  return SCHEDULE_KIND_KEYS.some((key) => show.has(key));
}

/** `show=` param: the keys that are on. null = absent, empty or without a kind turned on. */
export function parseShowParam(raw: string | null): ReadonlySet<ScheduleShowKey> | null {
  if (!raw) return null;
  const parts = raw.split(',');
  const show = new Set(SCHEDULE_SHOW_KEYS.filter((key) => parts.includes(key)));
  return hasKind(show) ? show : null;
}

/** Comma list in the fixed key order; null when the set equals the default (param absent). */
export function serializeShowParam(show: ReadonlySet<ScheduleShowKey>): string | null {
  if (changedShowCount(show) === 0) return null;
  return SCHEDULE_SHOW_KEYS.filter((key) => show.has(key)).join(',');
}

const LEGACY_FILTER_KEYS: readonly (readonly [string, ScheduleShowKey])[] = [
  ['work-items', 'tasks'],
  ['milestones', 'milestones'],
  ['household-items', 'purchases'],
];

/** Legacy `?filter=`: the named kinds, plus the default non-kind toggles. null when none is known. */
export function showFromLegacyFilter(raw: string): ReadonlySet<ScheduleShowKey> | null {
  const parts = raw.split(',');
  const kinds = LEGACY_FILTER_KEYS.filter(([name]) => parts.includes(name)).map(([, key]) => key);
  if (kinds.length === 0) return null;
  const show = new Set<ScheduleShowKey>(kinds);
  for (const key of DEFAULT_SCHEDULE_SHOW) {
    if (!SCHEDULE_KIND_KEYS.some((kind) => kind === key)) show.add(key);
  }
  return show;
}

/** Number of toggles that differ from the default (the "Show · n changed" trigger). */
export function changedShowCount(show: ReadonlySet<ScheduleShowKey>): number {
  return SCHEDULE_SHOW_KEYS.filter((key) => show.has(key) !== DEFAULT_SCHEDULE_SHOW.has(key))
    .length;
}

/** True when `key` is a kind toggle that is on and the only kind left on. */
export function isLastVisibleKind(
  show: ReadonlySet<ScheduleShowKey>,
  key: ScheduleShowKey,
): boolean {
  const kindsOn = SCHEDULE_KIND_KEYS.filter((kind) => show.has(kind));
  return kindsOn.length === 1 && kindsOn[0] === key;
}

/** The area is `areaId` or sits below it. */
export function matchesArea(area: AreaSummary | null | undefined, areaId: string): boolean {
  if (!area) return false;
  return area.id === areaId || area.ancestors.some((ancestor) => ancestor.id === areaId);
}

/** Not completed and Late · n d or Held up (D7). */
export function isLateTask(item: TimelineWorkItem): boolean {
  return item.status !== 'completed' && scheduleSignalOf(item) !== null;
}

/** In progress or late: the rows the first positioning brings into view. */
export function isCurrentTask(item: TimelineWorkItem): boolean {
  return item.status === 'in_progress' || isLateTask(item);
}

export interface ScheduleFilterView {
  show: ReadonlySet<ScheduleShowKey>;
  areaId: string | null;
  /** false: Done is not applied (the Calendar). */
  applyDone: boolean;
}

/**
 * Applies the kind toggles, the area chip and Done (D12, D16). `doneHidden` counts the rows the
 * Done toggle alone removed. Dependencies, critical path, holds-up and the date range are kept
 * unchanged (the range must not shift when toggles change).
 *
 * With an area set a milestone stays when one of its tasks matches the area; the Tasks and Done
 * toggles do not influence that (a milestone is relevant to an area whatever is drawn).
 */
export function filterTimeline(
  data: TimelineResponse,
  view: ScheduleFilterView,
): { data: TimelineResponse; doneHidden: number } {
  const { show, areaId, applyDone } = view;
  const hideDone = applyDone && !show.has('done');
  let doneHidden = 0;

  function keep<T>(rows: readonly T[], isDone: (row: T) => boolean): T[] {
    if (!hideDone) return [...rows];
    const kept = rows.filter((row) => !isDone(row));
    doneHidden += rows.length - kept.length;
    return kept;
  }

  const areaTasks = areaId
    ? data.workItems.filter((item) => matchesArea(item.area, areaId))
    : data.workItems;
  const workItems = show.has('tasks') ? keep(areaTasks, (item) => item.status === 'completed') : [];

  const areaTaskIds = new Set(areaTasks.map((item) => item.id));
  const areaMilestones = areaId
    ? data.milestones.filter((m) => m.workItemIds.some((id) => areaTaskIds.has(id)))
    : data.milestones;
  const milestones = show.has('milestones') ? keep(areaMilestones, (m) => m.isCompleted) : [];

  const areaPurchases = areaId
    ? data.householdItems.filter((item) => matchesArea(item.area, areaId))
    : data.householdItems;
  const householdItems = show.has('purchases')
    ? keep(areaPurchases, (item) => item.status === 'arrived')
    : [];

  return { data: { ...data, workItems, milestones, householdItems }, doneHidden };
}
