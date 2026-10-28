import { routeUrl } from '@cornerstone/shared';
import type { ServedRouteId } from '@cornerstone/shared';
import {
  CREATE_KIND_PARAM,
  CREATE_PARAM,
  START_PARAM,
  sanitizePrefill,
  type CreatePrefill,
  type CreatePrefillKey,
  type QuickLogMode,
} from './createQuery.js';

/** Entries of the New menu, in menu order. */
export const CREATE_MENU_ENTRY_IDS = [
  'diaryEntry',
  'task',
  'purchase',
  'invoice',
  'offer',
  'company',
  'milestone',
  'fundingSource',
  'grant',
] as const;
export type CreateEntryId = (typeof CREATE_MENU_ENTRY_IDS)[number];

export interface CreateTarget {
  readonly route: Extract<
    ServedRouteId,
    | 'diaryEntryNew'
    | 'workItemNew'
    | 'householdItemNew'
    | 'invoices'
    | 'companyNew'
    | 'milestoneNew'
    | 'financing'
  >;
  readonly query: Readonly<Record<string, string>>;
  /** Pre-fill keys this target accepts. */
  readonly prefill: readonly CreatePrefillKey[];
  /** Listed only on Money pages. */
  readonly moneyOnly: boolean;
  /** Opens an ObjectForm dialog route (gets a background); false = a page or a ?create=1 surface. */
  readonly dialog: boolean;
}

export const CREATE_TARGETS: Readonly<Record<CreateEntryId, CreateTarget>> = {
  diaryEntry: {
    route: 'diaryEntryNew',
    query: {},
    prefill: ['areaId', 'companyId', 'date'],
    moneyOnly: false,
    dialog: false,
  },
  task: { route: 'workItemNew', query: {}, prefill: ['areaId'], moneyOnly: false, dialog: true },
  purchase: {
    route: 'householdItemNew',
    query: {},
    prefill: ['areaId', 'companyId'],
    moneyOnly: false,
    dialog: true,
  },
  invoice: {
    route: 'invoices',
    query: { [CREATE_PARAM]: '1' },
    prefill: ['companyId'],
    moneyOnly: false,
    dialog: false,
  },
  offer: {
    route: 'invoices',
    query: { [CREATE_PARAM]: '1', [CREATE_KIND_PARAM]: 'offer' },
    prefill: ['companyId'],
    moneyOnly: false,
    dialog: false,
  },
  company: { route: 'companyNew', query: {}, prefill: [], moneyOnly: false, dialog: true },
  milestone: {
    route: 'milestoneNew',
    query: {},
    prefill: ['date'],
    moneyOnly: false,
    dialog: true,
  },
  fundingSource: {
    route: 'financing',
    query: { [CREATE_PARAM]: '1', [CREATE_KIND_PARAM]: 'source' },
    prefill: [],
    moneyOnly: true,
    dialog: false,
  },
  grant: {
    route: 'financing',
    query: { [CREATE_PARAM]: '1', [CREATE_KIND_PARAM]: 'grant' },
    prefill: [],
    moneyOnly: true,
    dialog: false,
  },
};

/** URL of a create target; only the pre-fill keys the target accepts (and that validate) are added. */
export function createHref(id: CreateEntryId, context: CreatePrefill): string {
  const target = CREATE_TARGETS[id];
  const accepted = sanitizePrefill(context);
  const picked: Record<string, string> = {};
  for (const key of target.prefill) {
    const value = accepted[key];
    if (value !== undefined) picked[key] = value;
  }
  return routeUrl(target.route, undefined, { ...target.query, ...picked });
}

/** Entries to list, in menu order; Money-only rows only on Money pages. */
export function visibleCreateEntries(moneyPage: boolean): readonly CreateEntryId[] {
  return CREATE_MENU_ENTRY_IDS.filter((id) => moneyPage || !CREATE_TARGETS[id].moneyOnly);
}

/**
 * URL of a Log now tile: the Diary entry target with the page's area, never its date ("now" is
 * today, so a calendar page's visible date must not back-date a quick log).
 */
export function quickLogHref(mode: QuickLogMode, context: CreatePrefill): string {
  const { areaId } = sanitizePrefill(context);
  return routeUrl('diaryEntryNew', undefined, {
    ...(areaId ? { areaId } : {}),
    [START_PARAM]: mode,
  });
}
