import type { ZoomLevel } from '../components/GanttChart/ganttUtils.js';

/** The Show menu's toggles, in their fixed order. */
export const SCHEDULE_SHOW_KEYS = [
  'tasks',
  'milestones',
  'purchases',
  'arrows',
  'critical',
  'done',
] as const;
export type ScheduleShowKey = (typeof SCHEDULE_SHOW_KEYS)[number];

/** The toggles that decide which kinds of rows exist; at least one stays on. */
export const SCHEDULE_KIND_KEYS = [
  'tasks',
  'milestones',
  'purchases',
] as const satisfies readonly ScheduleShowKey[];

export const SCHEDULE_GROUPS = ['time', 'area'] as const;
export type ScheduleGroup = (typeof SCHEDULE_GROUPS)[number];

export const SCHEDULE_PHONE_VIEWS = ['agenda', 'chart'] as const;
export type SchedulePhoneView = (typeof SCHEDULE_PHONE_VIEWS)[number];

export const SCHEDULE_SUBJECT_KINDS = ['task', 'milestone', 'purchase'] as const;
export type ScheduleSubjectKind = (typeof SCHEDULE_SUBJECT_KINDS)[number];

export const SCHEDULE_ZOOMS = ['day', 'week', 'month'] as const satisfies readonly ZoomLevel[];
