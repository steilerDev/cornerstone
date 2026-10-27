/**
 * Synthetic attention / Home fixtures (#2230). Invented names only. T = 2026-03-10.
 *
 * `makeRow(rule, overrides)` builds one valid `AttentionRow` per rule with the params the
 * server would send; `makeAttention` wraps rows into an `AttentionResponse`.
 */
import type {
  AreaSummary,
  AttentionParams,
  AttentionResponse,
  AttentionRow,
  AttentionRule,
  DiaryEntrySummary,
  HomeAgendaItem,
  HomePulseResponse,
  HomeSetupResponse,
  HomeWeekResponse,
} from '@cornerstone/shared';
import { attentionRowKey } from '@cornerstone/shared';

export const TODAY = '2026-03-10';

export const AREA_KITCHEN: AreaSummary = {
  id: 'area-kitchen',
  name: 'Kitchen',
  color: null,
  ancestors: [{ id: 'area-ground', name: 'Ground floor', color: null }],
};

type RowOverrides = Partial<Omit<AttentionRow, 'params'>> & { params?: Partial<AttentionParams> };

interface RowBase {
  tier: AttentionRow['tier'];
  severity: AttentionRow['severity'];
  subjectType: AttentionRow['subject']['type'];
  subjectId: string;
  label: string | null;
  date: string | null;
  amount: number | null;
  actions: AttentionRow['actions'];
  link: AttentionRow['link'];
  params: AttentionParams;
}

const BASES: Record<AttentionRule, RowBase> = {
  N1: {
    tier: 'late',
    severity: 'red',
    subjectType: 'work_item',
    subjectId: 'wi-1',
    label: 'Task A',
    date: '2026-03-05',
    amount: null,
    actions: ['mark_done', 'reschedule'],
    link: { route: 'workItem', params: { id: 'wi-1' }, query: {} },
    params: {
      rule: 'N1',
      plannedEndDate: '2026-03-05',
      projectedEndDate: null,
      daysLate: 5,
      companyName: 'Company A',
    },
  },
  N2: {
    tier: 'late',
    severity: 'red',
    subjectType: 'work_item',
    subjectId: 'wi-2',
    label: 'Task B',
    date: '2026-03-06',
    amount: null,
    actions: ['start', 'reschedule'],
    link: { route: 'workItem', params: { id: 'wi-2' }, query: {} },
    params: {
      rule: 'N2',
      kind: 'task',
      plannedStartDate: '2026-03-06',
      projectedStartDate: null,
      daysLate: 4,
      companyName: null,
    },
  },
  N3: {
    tier: 'overdue',
    severity: 'red',
    subjectType: 'milestone',
    subjectId: '7',
    label: 'Milestone A',
    date: '2026-03-01',
    amount: null,
    actions: ['open'],
    link: { route: 'milestone', params: { id: '7' }, query: {} },
    params: {
      rule: 'N3',
      targetDate: '2026-03-01',
      projectedDate: null,
      daysAfterTarget: null,
      daysSinceTarget: 9,
    },
  },
  N4: {
    tier: 'overdue',
    severity: 'red',
    subjectType: 'invoice',
    subjectId: 'inv-1',
    label: 'INV-A',
    date: '2026-03-02',
    amount: 1234.5,
    actions: ['mark_paid', 'open'],
    link: { route: 'invoice', params: { id: 'inv-1' }, query: {} },
    params: {
      rule: 'N4',
      recordKind: 'invoice',
      paymentKind: 'final',
      invoiceId: 'inv-1',
      companyId: 'co-1',
      invoiceNumber: 'INV-A',
      companyName: 'Company A',
      invoiceDate: '2026-02-20',
      dueDate: '2026-03-02',
      dueInDays: -8,
      daysOpen: 18,
    },
  },
  N5: {
    tier: 'due',
    severity: 'amber',
    subjectType: 'invoice',
    subjectId: 'inv-2',
    label: 'INV-B',
    date: '2026-03-12',
    amount: 500,
    actions: ['mark_paid', 'open'],
    link: { route: 'invoice', params: { id: 'inv-2' }, query: {} },
    params: {
      rule: 'N5',
      recordKind: 'invoice',
      paymentKind: 'final',
      invoiceId: 'inv-2',
      companyId: 'co-1',
      invoiceNumber: 'INV-B',
      companyName: 'Company A',
      invoiceDate: '2026-03-01',
      dueDate: '2026-03-12',
      dueInDays: 2,
      daysOpen: 9,
    },
  },
  N6: {
    tier: 'follow_up',
    severity: 'amber',
    subjectType: 'invoice',
    subjectId: 'inv-3',
    label: 'INV-C',
    date: '2026-02-01',
    amount: 80,
    actions: ['mark_paid', 'open'],
    link: { route: 'invoice', params: { id: 'inv-3' }, query: {} },
    params: {
      rule: 'N6',
      recordKind: 'invoice',
      paymentKind: 'final',
      invoiceId: 'inv-3',
      companyId: 'co-1',
      invoiceNumber: 'INV-C',
      companyName: 'Company A',
      invoiceDate: '2026-02-01',
      dueDate: null,
      dueInDays: null,
      daysOpen: 37,
    },
  },
  N8: {
    tier: 'ready',
    severity: 'none',
    subjectType: 'budget_source',
    subjectId: 'bs-1',
    label: 'Loan A',
    date: null,
    amount: 9000,
    actions: ['prepare_bank_report'],
    link: { route: 'bankReport', params: { id: 'bs-1' }, query: {} },
    params: { rule: 'N8', sourceType: 'bank_loan', count: 3 },
  },
  N9: {
    tier: 'due',
    severity: 'amber',
    subjectType: 'invoice',
    subjectId: 'off-1',
    label: 'OFF-A',
    date: '2026-03-14',
    amount: 7000,
    actions: ['convert', 'open'],
    link: { route: 'invoice', params: { id: 'off-1' }, query: {} },
    params: {
      rule: 'N9',
      invoiceNumber: 'OFF-A',
      companyName: 'Company A',
      dueDate: '2026-03-14',
      dueInDays: 4,
    },
  },
  N10: {
    tier: 'late',
    severity: 'red',
    subjectType: 'household_item',
    subjectId: 'hi-1',
    label: 'Purchase A',
    date: '2026-03-07',
    amount: null,
    actions: ['mark_delivered', 'change_target'],
    link: { route: 'householdItem', params: { id: 'hi-1' }, query: {} },
    params: {
      rule: 'N10',
      status: 'purchased',
      isLate: true,
      dueInDays: -3,
      targetDeliveryDate: '2026-03-07',
      earliestDeliveryDate: null,
      latestDeliveryDate: null,
      companyName: 'Company A',
    },
  },
  N11: {
    tier: 'due',
    severity: 'amber',
    subjectType: 'subsidy_program',
    subjectId: 'sp-1',
    label: 'Grant A',
    date: '2026-03-20',
    amount: null,
    actions: ['open'],
    link: { route: 'grant', params: { id: 'sp-1' }, query: {} },
    params: { rule: 'N11', status: 'eligible', deadline: '2026-03-20', dueInDays: 10 },
  },
  N12: {
    tier: 'follow_up',
    severity: 'amber',
    subjectType: 'diary_entry',
    subjectId: 'de-1',
    label: 'Cracked tile',
    date: '2026-03-03',
    amount: null,
    actions: ['open'],
    link: { route: 'diaryEntry', params: { id: 'de-1' }, query: {} },
    params: { rule: 'N12', resolutionStatus: 'open', severity: 'high', entryDate: '2026-03-03' },
  },
  H1: {
    tier: 'tidy',
    severity: 'none',
    subjectType: 'diary_entry',
    subjectId: 'de-2',
    label: null,
    date: '2026-03-08',
    amount: null,
    actions: ['continue', 'discard'],
    link: { route: 'diaryEntryEdit', params: { id: 'de-2' }, query: {} },
    params: {
      rule: 'H1',
      entryType: 'daily_log',
      entryDate: '2026-03-08',
      updatedAt: '2026-03-08T10:00:00.000Z',
    },
  },
  H2: {
    tier: 'tidy',
    severity: 'none',
    subjectType: 'invoice',
    subjectId: 'inv-4',
    label: 'INV-D',
    date: null,
    amount: 300,
    actions: ['split'],
    link: { route: 'invoice', params: { id: 'inv-4' }, query: {} },
    params: {
      rule: 'H2',
      recordKind: 'invoice',
      invoiceNumber: 'INV-D',
      companyName: 'Company A',
      invoiceAmount: 1000,
    },
  },
  H4: {
    tier: 'tidy',
    severity: 'none',
    subjectType: 'work_item',
    subjectId: 'wi-3',
    label: 'Task C',
    date: '2026-03-04',
    amount: null,
    actions: ['mark_done'],
    link: { route: 'workItem', params: { id: 'wi-3' }, query: {} },
    params: { rule: 'H4', actualEndDate: '2026-03-04' },
  },
};

export function makeRow(rule: AttentionRule, overrides: RowOverrides = {}): AttentionRow {
  const base = BASES[rule];
  const { params, subject, ...rest } = overrides;
  const subjectId = subject?.id ?? base.subjectId;
  const subjectType = subject?.type ?? base.subjectType;
  return {
    key: attentionRowKey(rule, subjectType, subjectId),
    rule,
    tier: base.tier,
    severity: base.severity,
    subject: {
      type: subjectType,
      id: subjectId,
      label: base.label,
      area: null,
      ...(subject ?? {}),
    },
    date: base.date,
    amount: base.amount,
    holdsUp: null,
    params: { ...base.params, ...(params ?? {}) } as AttentionParams,
    actions: base.actions,
    link: base.link,
    snoozedUntil: null,
    ...rest,
  };
}

/** Wraps rows (needs-attention) and tidy-up rows into a full response. */
export function makeAttention(
  rows: AttentionRow[] = [],
  tidyUp: AttentionRow[] = [],
  overrides: Partial<AttentionResponse> = {},
): AttentionResponse {
  return {
    today: TODAY,
    count: rows.filter((r) => r.snoozedUntil === null).length,
    snoozedCount: 0,
    rows,
    tidyUp,
    standing: [],
    criticalLine: null,
    catchUp: null,
    ...overrides,
  };
}

export function makeAgendaItem(
  kind: HomeAgendaItem['kind'],
  date: string,
  id: string,
  overrides: Partial<HomeAgendaItem> = {},
): HomeAgendaItem {
  const subjectType: HomeAgendaItem['subject']['type'] =
    kind === 'payment'
      ? 'invoice'
      : kind === 'delivery'
        ? 'household_item'
        : kind === 'milestone'
          ? 'milestone'
          : 'work_item';
  const route: HomeAgendaItem['link']['route'] =
    kind === 'payment'
      ? 'invoice'
      : kind === 'delivery'
        ? 'householdItem'
        : kind === 'milestone'
          ? 'milestone'
          : 'workItem';
  return {
    key: `${kind}:${subjectType}:${id}`,
    kind,
    date,
    subject: { type: subjectType, id, label: `Item ${id}`, area: null },
    link: { route, params: { id }, query: {} },
    companyName: null,
    amount: null,
    recordKind: null,
    schedule:
      kind === 'starts' || kind === 'ends'
        ? { isLate: false, lateDays: null, isHeldUp: false, isCritical: false }
        : null,
    heldUpBy: null,
    ...overrides,
  };
}

export function makeWeek(items: HomeAgendaItem[] = [], today = TODAY): HomeWeekResponse {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const to = new Date(Date.UTC(y, m - 1, d + 20)).toISOString().slice(0, 10);
  return { today, from: today, to, items };
}

export function makePulse(overrides: Partial<HomePulseResponse> = {}): HomePulseResponse {
  return {
    leftToSpend: { expected: 12000, best: 15000, worst: 9000, verdict: 'on_budget' },
    stillToPay: 4200,
    stillToPayCount: 3,
    progress: { total: 10, done: 4, inProgress: 2 },
    ...overrides,
  };
}

export function makeSetup(overrides: Partial<HomeSetupResponse> = {}): HomeSetupResponse {
  return { coreComplete: true, steps: [], ...overrides };
}

export function makeDiaryEntry(
  id: string,
  overrides: Partial<DiaryEntrySummary> = {},
): DiaryEntrySummary {
  return {
    id,
    entryType: 'daily_log',
    status: 'saved',
    entryDate: '2026-03-09',
    title: `Entry ${id}`,
    body: '',
    metadata: null,
    isAutomatic: false,
    isSigned: false,
    sourceEntityType: null,
    sourceEntityId: null,
    sourceEntityArea: null,
    sourceEntityTitle: null,
    photoCount: 0,
    thumbnails: [],
    photoAreas: [],
    createdBy: null,
    createdAt: '2026-03-09T08:00:00.000Z',
    updatedAt: '2026-03-09T08:00:00.000Z',
    ...overrides,
  };
}
