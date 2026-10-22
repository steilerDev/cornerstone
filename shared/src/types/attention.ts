/**
 * Attention service types (#2229, EPIC-21 contract 1).
 *
 * `GET /api/attention` returns rows made of ids, stored values, dates, amounts and counts only.
 * The client renders the sentence and the tier label in the UI language: the server sends no
 * UI words. Rule ids follow plan §4.7 (N = needs attention, H = tidy up, S = standing).
 */

import type { AreaSummary } from './area.js';
import type { BudgetSourceType } from './budgetSource.js';
import type { DiaryIssueResolution, DiaryIssueSeverity, ManualDiaryEntryType } from './diary.js';
import type { HouseholdItemStatus } from './householdItem.js';
import type { SubsidyApplicationStatus } from './subsidyProgram.js';
import type { ServedRouteId } from '../routes/index.js';

/** Needs-attention rules (counted). N7 does not exist. */
export const ATTENTION_NEEDS_RULES = [
  'N1',
  'N2',
  'N3',
  'N4',
  'N5',
  'N6',
  'N8',
  'N9',
  'N10',
  'N11',
  'N12',
] as const;
export type AttentionNeedsRule = (typeof ATTENTION_NEEDS_RULES)[number];

/** Tidy-up chores (never counted). H3 does not exist. */
export const ATTENTION_TIDY_RULES = ['H1', 'H2', 'H4'] as const;
export type AttentionTidyRule = (typeof ATTENTION_TIDY_RULES)[number];

/** Every rule that produces a snoozable row; also the ordering of rules. */
export const ATTENTION_RULES = [...ATTENTION_NEEDS_RULES, ...ATTENTION_TIDY_RULES] as const;
export type AttentionRule = (typeof ATTENTION_RULES)[number];

/** Standing figures (not rows, never counted, never snoozable). */
export const ATTENTION_STANDING_RULES = ['S1'] as const;
export type AttentionStandingRule = (typeof ATTENTION_STANDING_RULES)[number];

export const ATTENTION_TIERS = ['late', 'overdue', 'due', 'ready', 'follow_up', 'tidy'] as const;
export type AttentionTier = (typeof ATTENTION_TIERS)[number];

export const ATTENTION_SEVERITIES = ['red', 'amber', 'none'] as const;
export type AttentionSeverity = (typeof ATTENTION_SEVERITIES)[number];

export const ATTENTION_ACTIONS = [
  'mark_done',
  'start',
  'reschedule',
  'change_target',
  'open',
  'mark_paid',
  'prepare_bank_report',
  'convert',
  'mark_delivered',
  'continue',
  'discard',
  'split',
] as const;
export type AttentionAction = (typeof ATTENTION_ACTIONS)[number];

export const ATTENTION_SUBJECT_TYPES = [
  'work_item',
  'milestone',
  'invoice',
  'progress_payment',
  'household_item',
  'budget_source',
  'subsidy_program',
  'diary_entry',
  'group',
] as const;
export type AttentionSubjectType = (typeof ATTENTION_SUBJECT_TYPES)[number];

export const CRITICAL_LINE_LEVELS = ['on_track', 'warning', 'critical', 'overdue'] as const;
export type CriticalLineLevel = (typeof CRITICAL_LINE_LEVELS)[number];

/** Days a "Not now" hides a row (the row shows again on day + 7). */
export const ATTENTION_NOT_NOW_DAYS = 7;
export const ATTENTION_SNOOZE_MAX_KEYS = 500;
export const ATTENTION_SNOOZE_MAX_BYTES = 16384;
/** Contract 18 preference key holding `{ "<row key>": "YYYY-MM-DD" }` (snoozed until, exclusive). */
export const ATTENTION_SNOOZED_PREFERENCE_KEY = 'attention.snoozed';

/** `<rule>:<subjectType>:<subjectId>`. */
export const ATTENTION_ROW_KEY_PATTERN =
  '^(?:N(?:[1-6]|8|9|1[0-2])|H[124]):(?:work_item|milestone|invoice|progress_payment|household_item|budget_source|subsidy_program|diary_entry|group):[A-Za-z0-9._-]{1,64}$';

const ROW_KEY_REGEX = new RegExp(ATTENTION_ROW_KEY_PATTERN);

export function attentionRowKey(
  rule: AttentionRule,
  type: AttentionSubjectType,
  id: string,
): string {
  return `${rule}:${type}:${id}`;
}

export function isAttentionRowKey(value: string): boolean {
  return ROW_KEY_REGEX.test(value);
}

/** Route ids a row may link to; all served today (`routeUrl` accepts them). */
export const ATTENTION_LINK_ROUTES = [
  'workItem',
  'workItems',
  'milestone',
  'invoice',
  'householdItem',
  'diaryEntry',
  'diaryEntryEdit',
  'bankReport',
  'budgetSubsidies',
  'budgetSources',
] as const satisfies readonly ServedRouteId[];
export type AttentionLinkRoute = (typeof ATTENTION_LINK_ROUTES)[number];

/** The client builds the URL with `routeUrl(link.route, link.params, link.query)`. */
export interface AttentionLink {
  route: AttentionLinkRoute;
  params: Record<string, string>;
  query: Record<string, string>;
}

export interface AttentionSubject {
  type: AttentionSubjectType;
  id: string;
  /** The record's own name, title or number; null when it has none. */
  label: string | null;
  area: AreaSummary | null;
}

export interface AttentionHoldsUp {
  /** Unfinished tasks that wait, directly or through chains and milestone gates. */
  count: number;
  /** Of those, not-started tasks whose planned start is within 14 days (or already past). */
  startingWithin14Days: number;
}

export interface AttentionGroupItem {
  id: string;
  label: string;
  area: AreaSummary | null;
  daysLate: number;
  holdsUp: AttentionHoldsUp;
}

/** Record facts only: no user names or ids, nothing that says who should act. */
export type AttentionParams =
  | {
      rule: 'N1';
      plannedEndDate: string | null;
      projectedEndDate: string | null;
      daysLate: number;
      companyName: string | null;
    }
  | {
      rule: 'N2';
      kind: 'task';
      plannedStartDate: string | null;
      projectedStartDate: string | null;
      daysLate: number;
      companyName: string | null;
    }
  | { rule: 'N2'; kind: 'group'; plannedStartDate: string; items: AttentionGroupItem[] }
  | {
      rule: 'N3';
      targetDate: string;
      projectedDate: string | null;
      /** projected - target when > 0 */
      daysAfterTarget: number | null;
      /** today - target when target < today */
      daysSinceTarget: number | null;
    }
  | {
      rule: 'N4' | 'N5' | 'N6';
      recordKind: 'invoice' | 'offer';
      paymentKind: 'final' | 'progress';
      invoiceId: string;
      invoiceNumber: string | null;
      companyName: string;
      invoiceDate: string;
      dueDate: string | null;
      /** dueDate - today (negative = past); null without a due date */
      dueInDays: number | null;
      /** today - invoiceDate */
      daysOpen: number;
    }
  | {
      rule: 'N8';
      sourceType: Extract<BudgetSourceType, 'bank_loan' | 'credit_line'>;
      count: number;
    }
  | {
      rule: 'N9';
      invoiceNumber: string | null;
      companyName: string;
      dueDate: string;
      dueInDays: number;
    }
  | {
      rule: 'N10';
      status: Exclude<HouseholdItemStatus, 'arrived'>;
      /** Past its planned delivery date (the one purchase Late definition). */
      isLate: boolean;
      /** Row date (latest, else earliest, else target delivery) - today; negative = past. */
      dueInDays: number;
      targetDeliveryDate: string | null;
      earliestDeliveryDate: string | null;
      latestDeliveryDate: string | null;
      companyName: string | null;
    }
  | {
      rule: 'N11';
      status: Extract<SubsidyApplicationStatus, 'eligible' | 'applied'>;
      deadline: string;
      dueInDays: number;
    }
  | {
      rule: 'N12';
      resolutionStatus: Exclude<DiaryIssueResolution, 'resolved'>;
      severity: DiaryIssueSeverity | null;
      entryDate: string;
    }
  | { rule: 'H1'; entryType: ManualDiaryEntryType; entryDate: string; updatedAt: string }
  | {
      rule: 'H2';
      recordKind: 'invoice' | 'offer';
      invoiceNumber: string | null;
      companyName: string;
      invoiceAmount: number;
    }
  | { rule: 'H4'; actualEndDate: string };

export interface AttentionRow {
  /** `<rule>:<subjectType>:<subjectId>`, the Not-now key. */
  key: string;
  rule: AttentionRule;
  tier: AttentionTier;
  severity: AttentionSeverity;
  subject: AttentionSubject;
  date: string | null;
  /** Major units, rounded to cents. */
  amount: number | null;
  holdsUp: AttentionHoldsUp | null;
  params: AttentionParams;
  actions: AttentionAction[];
  link: AttentionLink;
  /** Set only for rows returned with `includeSnoozed=true` that are snoozed. */
  snoozedUntil: string | null;
}

export interface AttentionStandingRow {
  key: string;
  rule: AttentionStandingRule;
  subject: AttentionSubject;
  amount: number;
  params: { rule: 'S1'; allocated: number; sourceAmount: number };
  link: AttentionLink;
}

export interface AttentionCriticalLine {
  workItemId: string;
  label: string;
  area: AreaSummary | null;
  mustEndBy: string;
  daysLeft: number;
  level: CriticalLineLevel;
  criticalCount: number;
}

export interface AttentionResponse {
  /** The server's UTC date for this computation. */
  today: string;
  /** Needs-attention rows that are not snoozed (a grouped N2 row counts 1). */
  count: number;
  /** Rows (N and H) hidden by the caller's live snoozes. */
  snoozedCount: number;
  rows: AttentionRow[];
  tidyUp: AttentionRow[];
  standing: AttentionStandingRow[];
  criticalLine: AttentionCriticalLine | null;
  /** Present when 3 or more late tasks (N1 + N2, not snoozed) are open. */
  catchUp: { lateTaskCount: number } | null;
}

export interface AttentionQuery {
  includeSnoozed?: boolean;
}

export interface AttentionNotNowRequest {
  key: string;
}

export interface AttentionNotNowResponse {
  key: string;
  snoozedUntil: string;
}
