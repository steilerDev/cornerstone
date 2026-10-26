/**
 * Attention rules (#2229, EPIC-21 contract 1): pure evaluation of every rule from an
 * `AttentionInput`. No database, no clock (`today` and `now` come in), no UI words.
 *
 * Flow: build the schedule index once -> evaluate each rule into candidate rows -> fold N2 ->
 * apply snoozes -> group N2 -> order -> count / snoozedCount / catchUp -> critical line ->
 * standing figures. "Late" for tasks is contract 4's `isLate` (the one Late definition); holds
 * up has one definition (`holdsUp.ts`); money figures arrive already computed by the money
 * service.
 */

import type {
  AreaSummary,
  AttentionAction,
  AttentionCriticalLine,
  AttentionGroupItem,
  AttentionHoldsUp,
  AttentionLink,
  AttentionParams,
  AttentionResponse,
  AttentionRow,
  AttentionRule,
  AttentionSeverity,
  AttentionStandingRow,
  AttentionSubject,
  AttentionTier,
  CriticalLineLevel,
  DiaryIssueSeverity,
  ManualDiaryEntryType,
  MoneySourceFigures,
} from '@cornerstone/shared';
import { ATTENTION_RULES, attentionRowKey } from '@cornerstone/shared';
import type { OpenPaymentItem } from './depositAggregateUtils.js';
import type { ScheduleGraph, ScheduleProjection } from '../schedulingEngine.js';
import { attentionLinkOf } from './attentionLinks.js';
import { isPurchaseLate, purchaseDeliveryDate } from './purchaseLate.js';
import {
  addDaysUtc,
  buildScheduleIndex,
  computeHoldsUp,
  diffDaysUtc,
  isFoldedLateStart,
  summarizeHoldsUp,
  type HoldsUpContext,
  type ScheduleIndex,
} from './holdsUp.js';

// ─── Input ───────────────────────────────────────────────────────────────────

export interface AttentionWorkItemInfo {
  title: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  actualEndDate: string | null;
  area: AreaSummary | null;
  /** The assigned company's name (an attribute of the task, never a person). */
  companyName: string | null;
}

/** Any invoice or offer (status `quotation` = offer). */
export interface AttentionInvoiceInfo {
  status: string;
  invoiceNumber: string | null;
  companyName: string;
  amount: number;
  date: string;
  dueDate: string | null;
}

export interface AttentionPurchase {
  id: string;
  name: string;
  status: string;
  targetDeliveryDate: string | null;
  earliestDeliveryDate: string | null;
  latestDeliveryDate: string | null;
  actualDeliveryDate: string | null;
  companyName: string | null;
  area: AreaSummary | null;
}

export interface AttentionGrant {
  id: string;
  name: string;
  status: string;
  deadline: string | null;
}

export interface AttentionDefect {
  id: string;
  title: string | null;
  entryDate: string;
  /** Raw `resolutionStatus` from the metadata; null/missing counts as open. */
  resolutionStatus: string | null;
  severity: DiaryIssueSeverity | null;
}

export interface AttentionDraft {
  id: string;
  title: string | null;
  entryType: ManualDiaryEntryType;
  entryDate: string;
  updatedAt: string;
}

export interface AttentionInput {
  /** `YYYY-MM-DD` (UTC). */
  today: string;
  /** ISO instant `today` was derived from (the 24 h draft rule). */
  now: string;
  graph: ScheduleGraph;
  projection: ScheduleProjection;
  workItems: Map<string, AttentionWorkItemInfo>;
  openPayments: OpenPaymentItem[];
  /** Every invoice and offer by id (offers N9, H2 labels). */
  invoices: Map<string, AttentionInvoiceInfo>;
  /** invoiceId -> unsplit remainder in cents (>= 100), from the money service. */
  notYetSplitByInvoice: Map<string, number>;
  sources: MoneySourceFigures[];
  purchases: AttentionPurchase[];
  grants: AttentionGrant[];
  defects: AttentionDefect[];
  drafts: AttentionDraft[];
  /** row key -> snoozed-until date (exclusive). */
  snoozes: Map<string, string>;
  includeSnoozed: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const OFFER_DUE_WINDOW_DAYS = 7;
export const PAYMENT_DUE_WINDOW_DAYS = 7;
const LONG_UNPAID_DAYS = 30;
const DELIVERY_WINDOW_DAYS = 7;
const GRANT_WINDOW_DAYS = 14;
const DRAFT_STALE_MS = 24 * 60 * 60 * 1000;
const GROUP_MIN_SIZE = 4;
const CATCH_UP_MIN_TASKS = 3;

const ACTIONS: Record<AttentionRule, AttentionAction[]> = {
  N1: ['mark_done', 'reschedule'],
  N2: ['start', 'reschedule'],
  N3: ['change_target', 'open'],
  N4: ['mark_paid'],
  N5: ['mark_paid'],
  N6: ['mark_paid'],
  N8: ['prepare_bank_report'],
  N9: ['open', 'convert'],
  N10: ['mark_delivered'],
  N11: ['open'],
  N12: ['open'],
  H1: ['continue', 'discard'],
  H2: ['split'],
  H4: ['mark_done'],
};

// ─── Row building ────────────────────────────────────────────────────────────

type AttentionParamsOf<R extends AttentionParams['rule']> = Extract<AttentionParams, { rule: R }>;

interface Candidate {
  row: AttentionRow;
  /** N1/N2: ids of the work this row holds up (for the group union). */
  holdsIds?: Set<string>;
}

interface RowSpec {
  rule: AttentionRule;
  tier: AttentionTier;
  severity: AttentionSeverity;
  subject: AttentionSubject;
  date: string | null;
  amount?: number | null;
  holdsUp?: AttentionHoldsUp | null;
  params: AttentionParams;
  link?: AttentionLink;
  /** Overrides the rule's fixed actions (a grouped N2 row has none). */
  actions?: AttentionAction[];
  linkExtras?: { invoiceId?: string; depositId?: string };
}

function buildRow(spec: RowSpec): AttentionRow {
  return {
    key: attentionRowKey(spec.rule, spec.subject.type, spec.subject.id),
    rule: spec.rule,
    tier: spec.tier,
    severity: spec.severity,
    subject: spec.subject,
    date: spec.date,
    amount: spec.amount ?? null,
    holdsUp: spec.holdsUp ?? null,
    params: spec.params,
    actions: spec.actions ?? [...ACTIONS[spec.rule]],
    link:
      spec.link ??
      attentionLinkOf({ rule: spec.rule, subjectId: spec.subject.id, ...spec.linkExtras }),
    snoozedUntil: null,
  };
}

function subjectOf(
  type: AttentionSubject['type'],
  id: string,
  label: string | null,
  area: AreaSummary | null = null,
): AttentionSubject {
  return { type, id, label, area };
}

function holdsUpOf(
  index: ScheduleIndex,
  nodeId: string,
  ctx: HoldsUpContext,
): { holdsUp: AttentionHoldsUp; ids: Set<string> } {
  const { ids, ...holdsUp } = computeHoldsUp(index, nodeId, ctx);
  return { holdsUp, ids };
}

// ─── Rules ───────────────────────────────────────────────────────────────────

function taskCandidates(input: AttentionInput, index: ScheduleIndex): Candidate[] {
  const { projection } = input;
  const ctx: HoldsUpContext = { today: input.today, projection };
  const out: Candidate[] = [];

  for (const [id, wi] of input.workItems) {
    const fields = projection.workItems.get(id);

    if (wi.status === 'in_progress' && fields?.isLate === true) {
      const { holdsUp, ids } = holdsUpOf(index, id, ctx);
      out.push({
        holdsIds: ids,
        row: buildRow({
          rule: 'N1',
          tier: 'late',
          severity: 'red',
          subject: subjectOf('work_item', id, wi.title, wi.area),
          date: wi.endDate,
          holdsUp,
          params: {
            rule: 'N1',
            plannedEndDate: wi.endDate,
            projectedEndDate: fields.projectedEndDate,
            daysLate: fields.lateDays ?? 0,
            companyName: wi.companyName,
          },
        }),
      });
    } else if (
      wi.status === 'not_started' &&
      fields?.isLate === true &&
      !isFoldedLateStart(index, id, projection)
    ) {
      const { holdsUp, ids } = holdsUpOf(index, id, ctx);
      out.push({
        holdsIds: ids,
        row: buildRow({
          rule: 'N2',
          tier: 'late',
          severity: 'red',
          subject: subjectOf('work_item', id, wi.title, wi.area),
          date: wi.startDate,
          holdsUp,
          params: {
            rule: 'N2',
            kind: 'task',
            plannedStartDate: wi.startDate,
            projectedStartDate: fields.projectedStartDate,
            daysLate: fields.lateDays ?? 0,
            companyName: wi.companyName,
          },
        }),
      });
    }
  }
  return out;
}

function milestoneCandidates(input: AttentionInput, index: ScheduleIndex): Candidate[] {
  const ctx: HoldsUpContext = { today: input.today, projection: input.projection };
  const out: Candidate[] = [];
  for (const m of input.graph.milestones) {
    const reached = m.isCompleted || m.completedAt !== null;
    if (reached) continue;
    const fields = input.projection.milestones.get(m.id);
    if (!(m.targetDate < input.today || fields?.isLate === true)) continue;

    const projectedDate = fields?.projectedDate ?? null;
    const { holdsUp } = holdsUpOf(index, `milestone:${m.id}`, ctx);
    out.push({
      row: buildRow({
        rule: 'N3',
        tier: 'late',
        severity: 'red',
        subject: subjectOf('milestone', String(m.id), m.title),
        date: m.targetDate,
        holdsUp,
        params: {
          rule: 'N3',
          targetDate: m.targetDate,
          projectedDate,
          daysAfterTarget:
            projectedDate !== null && projectedDate > m.targetDate
              ? diffDaysUtc(m.targetDate, projectedDate)
              : null,
          daysSinceTarget:
            m.targetDate < input.today ? diffDaysUtc(m.targetDate, input.today) : null,
        },
      }),
    });
  }
  return out;
}

function paymentCandidates(input: AttentionInput): Candidate[] {
  const { today } = input;
  const soon = addDaysUtc(today, PAYMENT_DUE_WINDOW_DAYS);
  const longUnpaidBefore = addDaysUtc(today, -LONG_UNPAID_DAYS);
  const out: Candidate[] = [];

  for (const item of input.openPayments) {
    let rule: 'N4' | 'N5' | 'N6' | null = null;
    if (item.dueDate !== null) {
      if (item.dueDate < today) rule = 'N4';
      else if (item.dueDate <= soon) rule = 'N5';
    } else if (item.kind === 'final' && item.invoiceStatus === 'pending') {
      if (item.invoiceDate <= longUnpaidBefore) rule = 'N6';
    }
    if (rule === null) continue;

    const isProgress = item.kind === 'progress' && item.depositId !== null;
    out.push({
      row: buildRow({
        rule,
        tier: rule === 'N4' ? 'overdue' : 'due',
        severity: rule === 'N4' ? 'red' : 'amber',
        subject: isProgress
          ? subjectOf('progress_payment', item.depositId!, item.invoiceNumber)
          : subjectOf('invoice', item.invoiceId, item.invoiceNumber),
        date: rule === 'N6' ? item.invoiceDate : item.dueDate,
        amount: item.amount,
        params: {
          rule,
          recordKind: item.invoiceStatus === 'quotation' ? 'offer' : 'invoice',
          paymentKind: item.kind,
          invoiceId: item.invoiceId,
          companyId: item.vendorId,
          invoiceNumber: item.invoiceNumber,
          companyName: item.vendorName,
          invoiceDate: item.invoiceDate,
          dueDate: item.dueDate,
          dueInDays: item.dueDate === null ? null : diffDaysUtc(today, item.dueDate),
          daysOpen: diffDaysUtc(item.invoiceDate, today),
        },
        linkExtras: isProgress
          ? { invoiceId: item.invoiceId, depositId: item.depositId! }
          : { invoiceId: item.invoiceId },
      }),
    });
  }
  return out;
}

function sourceCandidates(input: AttentionInput): Candidate[] {
  const out: Candidate[] = [];
  for (const source of input.sources) {
    if (source.sourceType !== 'bank_loan' && source.sourceType !== 'credit_line') continue;
    if (!(source.readyToSubmit.count > 0 && source.readyToSubmit.amount > 0)) continue;
    out.push({
      row: buildRow({
        rule: 'N8',
        tier: 'ready',
        severity: 'amber',
        subject: subjectOf('budget_source', source.id, source.name),
        date: null,
        amount: source.readyToSubmit.amount,
        params: { rule: 'N8', sourceType: source.sourceType, count: source.readyToSubmit.count },
      }),
    });
  }
  return out;
}

function offerCandidates(input: AttentionInput): Candidate[] {
  const limit = addDaysUtc(input.today, OFFER_DUE_WINDOW_DAYS);
  const out: Candidate[] = [];
  for (const [id, invoice] of input.invoices) {
    if (invoice.status !== 'quotation') continue;
    if (invoice.dueDate === null || invoice.dueDate > limit) continue;
    out.push({
      row: buildRow({
        rule: 'N9',
        tier: 'follow_up',
        severity: 'amber',
        subject: subjectOf('invoice', id, invoice.invoiceNumber),
        date: invoice.dueDate,
        amount: invoice.amount,
        params: {
          rule: 'N9',
          invoiceNumber: invoice.invoiceNumber,
          companyName: invoice.companyName,
          dueDate: invoice.dueDate,
          dueInDays: diffDaysUtc(input.today, invoice.dueDate),
        },
      }),
    });
  }
  return out;
}

/**
 * N10: red/late is the one purchase Late definition (`isPurchaseLate`: past the planned
 * delivery date, latest ?? earliest); amber/due is any of target, earliest or latest within
 * today..today + 7. The row date is latest ?? earliest ?? target.
 */
function purchaseCandidates(input: AttentionInput): Candidate[] {
  const { today } = input;
  const limit = addDaysUtc(today, DELIVERY_WINDOW_DAYS);
  const inWindow = (d: string | null): boolean => d !== null && d >= today && d <= limit;
  const out: Candidate[] = [];
  for (const p of input.purchases) {
    if (p.status === 'arrived' || p.actualDeliveryDate !== null) continue;
    const late = isPurchaseLate(p, today);
    if (
      !late &&
      !inWindow(p.targetDeliveryDate) &&
      !inWindow(p.earliestDeliveryDate) &&
      !inWindow(p.latestDeliveryDate)
    ) {
      continue;
    }
    // One of the three dates is set here (late needs a planned date; the window needs a date)
    const date = purchaseDeliveryDate(p)!;
    out.push({
      row: buildRow({
        rule: 'N10',
        tier: late ? 'late' : 'due',
        severity: late ? 'red' : 'amber',
        subject: subjectOf('household_item', p.id, p.name, p.area),
        date,
        params: {
          rule: 'N10',
          status: p.status as AttentionParamsOf<'N10'>['status'],
          isLate: late,
          dueInDays: diffDaysUtc(today, date),
          targetDeliveryDate: p.targetDeliveryDate,
          earliestDeliveryDate: p.earliestDeliveryDate,
          latestDeliveryDate: p.latestDeliveryDate,
          companyName: p.companyName,
        },
      }),
    });
  }
  return out;
}

function grantCandidates(input: AttentionInput): Candidate[] {
  const limit = addDaysUtc(input.today, GRANT_WINDOW_DAYS);
  const out: Candidate[] = [];
  for (const g of input.grants) {
    if (g.status !== 'eligible' && g.status !== 'applied') continue;
    if (g.deadline === null || g.deadline < input.today || g.deadline > limit) continue;
    out.push({
      row: buildRow({
        rule: 'N11',
        tier: 'follow_up',
        severity: 'amber',
        subject: subjectOf('subsidy_program', g.id, g.name),
        date: g.deadline,
        params: {
          rule: 'N11',
          status: g.status,
          deadline: g.deadline,
          dueInDays: diffDaysUtc(input.today, g.deadline),
        },
      }),
    });
  }
  return out;
}

function defectCandidates(input: AttentionInput): Candidate[] {
  const out: Candidate[] = [];
  for (const d of input.defects) {
    const status = d.resolutionStatus ?? 'open';
    if (status !== 'open' && status !== 'in_progress') continue;
    out.push({
      row: buildRow({
        rule: 'N12',
        tier: 'follow_up',
        severity: 'amber',
        subject: subjectOf('diary_entry', d.id, d.title),
        date: d.entryDate,
        params: {
          rule: 'N12',
          resolutionStatus: status,
          severity: d.severity,
          entryDate: d.entryDate,
        },
      }),
    });
  }
  return out;
}

function tidyCandidates(input: AttentionInput): Candidate[] {
  const out: Candidate[] = [];

  // H1: unfinished logs untouched for more than 24 h
  const cutoff = new Date(Date.parse(input.now) - DRAFT_STALE_MS).toISOString();
  for (const d of input.drafts) {
    if (!(d.updatedAt < cutoff)) continue;
    out.push({
      row: buildRow({
        rule: 'H1',
        tier: 'tidy',
        severity: 'none',
        subject: subjectOf('diary_entry', d.id, d.title),
        date: d.entryDate,
        params: {
          rule: 'H1',
          entryType: d.entryType,
          entryDate: d.entryDate,
          updatedAt: d.updatedAt,
        },
      }),
    });
  }

  // H2: invoices and offers not fully split into budget lines
  for (const [invoiceId, cents] of input.notYetSplitByInvoice) {
    const invoice = input.invoices.get(invoiceId);
    if (!invoice) continue;
    out.push({
      row: buildRow({
        rule: 'H2',
        tier: 'tidy',
        severity: 'none',
        subject: subjectOf('invoice', invoiceId, invoice.invoiceNumber),
        date: invoice.date,
        amount: cents / 100,
        params: {
          rule: 'H2',
          recordKind: invoice.status === 'quotation' ? 'offer' : 'invoice',
          invoiceNumber: invoice.invoiceNumber,
          companyName: invoice.companyName,
          invoiceAmount: invoice.amount,
        },
      }),
    });
  }

  // H4: ended but not marked done
  for (const [id, wi] of input.workItems) {
    if (wi.status !== 'in_progress' || wi.actualEndDate === null) continue;
    if (!(wi.actualEndDate < input.today)) continue;
    out.push({
      row: buildRow({
        rule: 'H4',
        tier: 'tidy',
        severity: 'none',
        subject: subjectOf('work_item', id, wi.title, wi.area),
        date: wi.actualEndDate,
        params: { rule: 'H4', actualEndDate: wi.actualEndDate },
      }),
    });
  }
  return out;
}

// ─── Ordering ────────────────────────────────────────────────────────────────

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function cmpDateNullLast(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return cmp(a, b);
}

function ruleRank(rule: AttentionRule): number {
  return ATTENTION_RULES.indexOf(rule);
}

/** Needs-attention order: red first, then holds up most, soonest date, rule order, key. */
function compareRows(a: AttentionRow, b: AttentionRow): number {
  const sev = (a.severity === 'red' ? 0 : 1) - (b.severity === 'red' ? 0 : 1);
  if (sev !== 0) return sev;
  const holds = (b.holdsUp?.count ?? 0) - (a.holdsUp?.count ?? 0);
  if (holds !== 0) return holds;
  const date = cmpDateNullLast(a.date, b.date);
  if (date !== 0) return date;
  const rule = ruleRank(a.rule) - ruleRank(b.rule);
  if (rule !== 0) return rule;
  return cmp(a.key, b.key);
}

function compareTidy(a: AttentionRow, b: AttentionRow): number {
  const date = cmpDateNullLast(a.date, b.date);
  if (date !== 0) return date;
  const rule = ruleRank(a.rule) - ruleRank(b.rule);
  if (rule !== 0) return rule;
  return cmp(a.key, b.key);
}

// ─── Critical line ───────────────────────────────────────────────────────────

function criticalLevel(daysLeft: number): CriticalLineLevel {
  if (daysLeft < 0) return 'overdue';
  if (daysLeft < 7) return 'critical';
  if (daysLeft <= 14) return 'warning';
  return 'on_track';
}

/** The earliest unfinished task on the critical path (the former Critical Path card's rule). */
function criticalLine(input: AttentionInput): AttentionCriticalLine | null {
  // Same tie-break as the card: work items in stored order, the first with the earliest end wins
  const onPath = new Set(input.projection.criticalPath);
  let best: { id: string; end: string } | null = null;
  for (const [id, wi] of input.workItems) {
    if (!onPath.has(id) || wi.status === 'completed') continue;
    const end = wi.actualEndDate ?? input.projection.workItems.get(id)?.projectedEndDate ?? null;
    if (end === null) continue;
    if (best === null || end < best.end) best = { id, end };
  }
  if (best === null) return null;
  const wi = input.workItems.get(best.id)!;
  const daysLeft = diffDaysUtc(input.today, best.end);
  return {
    workItemId: best.id,
    label: wi.title,
    area: wi.area,
    mustEndBy: best.end,
    daysLeft,
    level: criticalLevel(daysLeft),
    criticalCount: input.projection.criticalPath.length,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

function groupItem(c: Candidate): AttentionGroupItem {
  const params = c.row.params as AttentionParamsOf<'N2'> & { kind: 'task' };
  return {
    id: c.row.subject.id,
    label: c.row.subject.label ?? '',
    area: c.row.subject.area,
    daysLate: params.daysLate,
    holdsUp: c.row.holdsUp!,
  };
}

function buildGroup(
  date: string,
  members: Candidate[],
  index: ScheduleIndex,
  ctx: HoldsUpContext,
): Candidate {
  const items = members.map(groupItem).sort((a, b) => {
    const holds = b.holdsUp.count - a.holdsUp.count;
    if (holds !== 0) return holds;
    const label = cmp(a.label, b.label);
    return label !== 0 ? label : cmp(a.id, b.id);
  });
  const union = new Set<string>();
  for (const m of members) for (const id of m.holdsIds!) union.add(id);
  return {
    holdsIds: union,
    row: buildRow({
      rule: 'N2',
      tier: 'late',
      severity: 'red',
      subject: subjectOf('group', date, null),
      date,
      holdsUp: summarizeHoldsUp(index, union, ctx),
      params: { rule: 'N2', kind: 'group', plannedStartDate: date, items },
      link: attentionLinkOf({ rule: 'N2', subjectId: date, isGroup: true }),
      actions: [],
    }),
  };
}

function liveSnooze(snoozes: Map<string, string>, key: string, today: string): string | null {
  const until = snoozes.get(key);
  return until !== undefined && today < until ? until : null;
}

export function computeAttention(input: AttentionInput): AttentionResponse {
  const { today } = input;
  const index = buildScheduleIndex(input.graph);
  const ctx: HoldsUpContext = { today, projection: input.projection };

  const needs: Candidate[] = [
    ...taskCandidates(input, index),
    ...milestoneCandidates(input, index),
    ...paymentCandidates(input),
    ...sourceCandidates(input),
    ...offerCandidates(input),
    ...purchaseCandidates(input),
    ...grantCandidates(input),
    ...defectCandidates(input),
  ];
  const tidy = tidyCandidates(input);

  let snoozedCount = 0;
  const kept: Candidate[] = [];
  const keptTidy: Candidate[] = [];
  const apply = (list: Candidate[], target: Candidate[]): void => {
    for (const c of list) {
      const until = liveSnooze(input.snoozes, c.row.key, today);
      if (until !== null) {
        snoozedCount += 1;
        if (!input.includeSnoozed) continue;
        c.row.snoozedUntil = until;
      }
      target.push(c);
    }
  };
  apply(needs, kept);
  apply(tidy, keptTidy);

  // N2 grouping: 4 or more not-individually-snoozed rows with the same planned start
  const byStart = new Map<string, Candidate[]>();
  for (const c of kept) {
    if (c.row.rule !== 'N2' || c.row.snoozedUntil !== null || c.row.date === null) continue;
    const list = byStart.get(c.row.date) ?? [];
    list.push(c);
    byStart.set(c.row.date, list);
  }
  const grouped = new Set<Candidate>();
  const groups: Candidate[] = [];
  let snoozedGroupMembers = 0;
  for (const [date, members] of byStart) {
    if (members.length < GROUP_MIN_SIZE) continue;
    const group = buildGroup(date, members, index, ctx);
    for (const m of members) grouped.add(m);
    const until = liveSnooze(input.snoozes, group.row.key, today);
    if (until !== null) {
      snoozedCount += 1;
      snoozedGroupMembers += members.length;
      if (!input.includeSnoozed) continue;
      group.row.snoozedUntil = until;
    }
    groups.push(group);
  }
  // Members of a grouped (and so also of a snoozed-group) row never appear individually
  const finalNeeds = [...kept.filter((c) => !grouped.has(c)), ...groups];

  // Late tasks that count towards the catch-up plan: individual rows plus members of live groups
  let lateTaskCount = 0;
  for (const c of kept) {
    if (c.row.rule !== 'N1' && c.row.rule !== 'N2') continue;
    if (c.row.snoozedUntil !== null) continue;
    lateTaskCount += 1;
  }
  lateTaskCount -= snoozedGroupMembers;

  const rows = finalNeeds.map((c) => c.row).sort(compareRows);
  const tidyUp = keptTidy.map((c) => c.row).sort(compareTidy);

  const standing: AttentionStandingRow[] = input.sources
    .filter((s) => s.overAllocated > 0)
    .map((s): AttentionStandingRow => ({
      key: `S1:budget_source:${s.id}`,
      rule: 'S1',
      subject: subjectOf('budget_source', s.id, s.name),
      amount: s.overAllocated,
      params: { rule: 'S1', allocated: s.allocated, sourceAmount: s.amount },
      link: attentionLinkOf({ rule: 'S1', subjectId: s.id }),
    }))
    .sort((a, b) => b.amount - a.amount || cmp(a.key, b.key));

  return {
    today,
    count: rows.filter((r) => r.snoozedUntil === null).length,
    snoozedCount,
    rows,
    tidyUp,
    standing,
    criticalLine: criticalLine(input),
    catchUp: lateTaskCount >= CATCH_UP_MIN_TASKS ? { lateTaskCount } : null,
  };
}
