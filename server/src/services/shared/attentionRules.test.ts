/**
 * Pure attention rules (#2229): `computeAttention` on hand-built inputs. The projection is
 * built by hand (the engine's own outputs are tied to these rules in attentionService.test.ts),
 * so every predicate can sit exactly on its boundary. T = 2026-03-10, now = 09:00 UTC that day.
 *
 * Mutations these tests catch:
 *  - N1 on a not-started task / N2 on an in-progress task, or on an on-time task (T itself);
 *  - N2 folding dropped (a late predecessor, a held-up predecessor, one behind a milestone), or
 *    folding on a completed / on-time predecessor;
 *  - the N2 group threshold moved (3 grouping, 4 not grouping), snoozed members grouped, a
 *    snoozed group's members left in catchUp;
 *  - N3 on a reached milestone, or missing the "projected after target" path;
 *  - N4/N5/N6 windows off by one (T-1, T, T+7, T+8, T-30, T-29), N6 on an offer or a progress item;
 *  - N8 on own-funds/discretionary sources, or with count 0 / amount 0;
 *  - N9 window (T+7 / T+8), N10 (isLate wins, T+7 / T+8, arrived, delivered), N11 (T..T+14, status),
 *    N12 (resolved, missing = open);
 *  - H1 24 h boundary (strictly older), H2 amount, H4 (actual end strictly before T);
 *  - snooze boundary (until == T shows), count including grouped/snoozed/tidy/standing rows;
 *  - ordering: severity, holds-up desc, date asc / null last, rule order, key;
 *  - critical line levels at 15/14/7/6/0/-1 days and its null cases;
 *  - any user field leaking into params (AC10).
 */

import { describe, it, expect } from '@jest/globals';
import type {
  AreaSummary,
  AttentionResponse,
  AttentionRow,
  MoneySourceFigures,
  WorkItemScheduleFields,
} from '@cornerstone/shared';
import type { OpenPaymentItem } from './depositAggregateUtils.js';
import type {
  MilestoneScheduleFields,
  ScheduleGraph,
  ScheduleProjection,
  SchedulingWorkItem,
} from '../schedulingEngine.js';
import {
  computeAttention,
  type AttentionDefect,
  type AttentionDraft,
  type AttentionGrant,
  type AttentionInput,
  type AttentionInvoiceInfo,
  type AttentionPurchase,
} from './attentionRules.js';

const TODAY = '2026-03-10';
const NOW = '2026-03-10T09:00:00.000Z';

// ─── Builders ────────────────────────────────────────────────────────────────

interface TaskSpec {
  status?: string;
  start?: string | null;
  end?: string | null;
  actualEnd?: string | null;
  title?: string;
  company?: string | null;
  area?: AreaSummary | null;
  fields?: Partial<WorkItemScheduleFields>;
}

interface MilestoneSpec {
  id: number;
  target: string;
  title?: string;
  isCompleted?: boolean;
  completedAt?: string | null;
  contributors?: string[];
  dependents?: string[];
  projectedDate?: string | null;
  isLate?: boolean;
}

interface ScenarioSpec {
  tasks?: Record<string, TaskSpec>;
  deps?: Array<[string, string]>;
  milestones?: MilestoneSpec[];
  critical?: string[];
  hasCycle?: boolean;
  openPayments?: OpenPaymentItem[];
  invoices?: Record<string, Partial<AttentionInvoiceInfo>>;
  notYetSplitByInvoice?: Record<string, number>;
  sources?: MoneySourceFigures[];
  purchases?: AttentionPurchase[];
  grants?: AttentionGrant[];
  defects?: AttentionDefect[];
  drafts?: AttentionDraft[];
  snoozes?: Record<string, string>;
  includeSnoozed?: boolean;
}

function late(days: number, extra: Partial<WorkItemScheduleFields> = {}) {
  return { isLate: true, lateDays: days, ...extra } satisfies Partial<WorkItemScheduleFields>;
}

function build(spec: ScenarioSpec = {}): AttentionInput {
  const nodes: SchedulingWorkItem[] = [];
  const infos: AttentionInput['workItems'] = new Map();
  const workItemFields = new Map<string, WorkItemScheduleFields>();

  for (const [id, t] of Object.entries(spec.tasks ?? {})) {
    const status = t.status ?? 'not_started';
    const start = t.start === undefined ? null : t.start;
    const end = t.end === undefined ? null : t.end;
    nodes.push({
      id,
      status,
      startDate: start,
      endDate: end,
      actualStartDate: null,
      actualEndDate: t.actualEnd ?? null,
      durationDays: null,
      startAfter: null,
      startBefore: null,
    });
    infos.set(id, {
      title: t.title ?? `Task ${id}`,
      status,
      startDate: start,
      endDate: end,
      actualEndDate: t.actualEnd ?? null,
      area: t.area ?? null,
      companyName: t.company === undefined ? null : t.company,
    });
    workItemFields.set(id, {
      projectedStartDate: start,
      projectedEndDate: end,
      isLate: false,
      lateDays: null,
      isHeldUp: false,
      ...t.fields,
    });
  }

  const deps = (spec.deps ?? []).map(([predecessorId, successorId]) => ({
    predecessorId,
    successorId,
    dependencyType: 'finish_to_start' as const,
    leadLagDays: 0,
  }));

  const milestoneRows: ScheduleGraph['milestones'] = [];
  const milestoneFields = new Map<number, MilestoneScheduleFields>();
  const contributors = new Map<number, string[]>();
  for (const m of spec.milestones ?? []) {
    const reached = (m.isCompleted ?? false) || (m.completedAt ?? null) !== null;
    milestoneRows.push({
      id: m.id,
      title: m.title ?? `Milestone ${m.id}`,
      description: null,
      targetDate: m.target,
      isCompleted: m.isCompleted ?? false,
      completedAt: m.completedAt ?? null,
      color: null,
      createdBy: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    milestoneFields.set(m.id, {
      projectedDate: m.projectedDate ?? null,
      isLate: m.isLate ?? false,
      lateDays: null,
      isEarly: false,
      earlyDays: null,
    });
    contributors.set(m.id, m.contributors ?? []);
    const nodeId = `milestone:${m.id}`;
    nodes.push({
      id: nodeId,
      status: reached ? 'completed' : 'not_started',
      startDate: m.target,
      endDate: m.target,
      actualStartDate: null,
      actualEndDate: null,
      durationDays: 0,
      startAfter: null,
      startBefore: null,
    });
    for (const c of m.contributors ?? []) {
      deps.push({
        predecessorId: c,
        successorId: nodeId,
        dependencyType: 'finish_to_start',
        leadLagDays: 0,
      });
    }
    for (const d of m.dependents ?? []) {
      deps.push({
        predecessorId: nodeId,
        successorId: d,
        dependencyType: 'finish_to_start',
        leadLagDays: 0,
      });
    }
  }

  const graph: ScheduleGraph = {
    workItems: nodes,
    dependencies: deps,
    milestones: milestoneRows,
    milestoneContributors: contributors,
  };
  const emptyResult = { scheduledItems: [], criticalPath: [], warnings: [] };
  const projection: ScheduleProjection = {
    hasCycle: spec.hasCycle ?? false,
    planned: emptyResult,
    projected: emptyResult,
    workItems: workItemFields,
    milestones: milestoneFields,
    criticalPath: spec.critical ?? [],
    criticalMilestoneIds: new Set(),
  };

  const invoices = new Map<string, AttentionInvoiceInfo>();
  for (const [id, inv] of Object.entries(spec.invoices ?? {})) {
    invoices.set(id, {
      status: 'pending',
      invoiceNumber: `NR-${id}`,
      companyName: 'Company A',
      amount: 1000,
      date: '2026-02-01',
      dueDate: null,
      ...inv,
    });
  }

  return {
    today: TODAY,
    now: NOW,
    graph,
    projection,
    workItems: infos,
    openPayments: spec.openPayments ?? [],
    invoices,
    notYetSplitByInvoice: new Map(Object.entries(spec.notYetSplitByInvoice ?? {})),
    sources: spec.sources ?? [],
    purchases: spec.purchases ?? [],
    grants: spec.grants ?? [],
    defects: spec.defects ?? [],
    drafts: spec.drafts ?? [],
    snoozes: new Map(Object.entries(spec.snoozes ?? {})),
    includeSnoozed: spec.includeSnoozed ?? false,
  };
}

function run(spec: ScenarioSpec = {}): AttentionResponse {
  return computeAttention(build(spec));
}

function keys(rows: AttentionRow[]): string[] {
  return rows.map((r) => r.key);
}

function rowOf(res: AttentionResponse, key: string): AttentionRow {
  const found = [...res.rows, ...res.tidyUp].find((r) => r.key === key);
  if (!found)
    throw new Error(`no row ${key} in ${JSON.stringify(keys([...res.rows, ...res.tidyUp]))}`);
  return found;
}

function payment(o: Partial<OpenPaymentItem> = {}): OpenPaymentItem {
  return {
    kind: 'final',
    invoiceId: 'inv-1',
    depositId: null,
    invoiceStatus: 'pending',
    invoiceNumber: 'NR-1',
    vendorName: 'Company A',
    invoiceDate: '2026-02-20',
    dueDate: '2026-03-01',
    amount: 1000,
    ...o,
  };
}

function source(o: Partial<MoneySourceFigures> = {}): MoneySourceFigures {
  return {
    id: 'src-1',
    name: 'Loan A',
    sourceType: 'bank_loan',
    status: 'active',
    isDiscretionary: false,
    amount: 10000,
    allocated: 1000,
    unallocated: 9000,
    overAllocated: 0,
    paid: 0,
    submitted: 0,
    readyToSubmit: { count: 0, amount: 0 },
    ...o,
  };
}

function purchase(o: Partial<AttentionPurchase> = {}): AttentionPurchase {
  return {
    id: 'hi-1',
    name: 'Purchase A',
    status: 'purchased',
    targetDeliveryDate: null,
    earliestDeliveryDate: null,
    latestDeliveryDate: null,
    actualDeliveryDate: null,
    companyName: null,
    area: null,
    ...o,
  };
}

function grant(o: Partial<AttentionGrant> = {}): AttentionGrant {
  return { id: 'gr-1', name: 'Grant A', status: 'eligible', deadline: '2026-03-20', ...o };
}

function defect(o: Partial<AttentionDefect> = {}): AttentionDefect {
  return {
    id: 'd-1',
    title: 'Crack A',
    entryDate: '2026-03-01',
    resolutionStatus: 'open',
    severity: 'high',
    ...o,
  };
}

function draft(o: Partial<AttentionDraft> = {}): AttentionDraft {
  return {
    id: 'dr-1',
    title: null,
    entryType: 'daily_log',
    entryDate: '2026-03-08',
    updatedAt: '2026-03-08T10:00:00.000Z',
    ...o,
  };
}

const AREA: AreaSummary = {
  id: 'a-2',
  name: 'Ground floor',
  color: null,
  ancestors: [{ id: 'a-1', name: 'Building', color: null }],
};

// ─── N1 ──────────────────────────────────────────────────────────────────────

describe('N1 task late to finish', () => {
  it('produces the full row for an in-progress task that is late, with holds-up from the graph', () => {
    const res = run({
      tasks: {
        'wi-1': {
          status: 'in_progress',
          start: '2026-02-20',
          end: '2026-03-05',
          title: 'Task A',
          company: 'Company A',
          area: AREA,
          fields: late(5, { projectedEndDate: '2026-03-10' }),
        },
        'wi-2': { start: '2026-03-06' },
        'wi-3': { start: '2026-04-30' },
        'wi-4': { start: '2026-03-20' },
        'wi-9': { status: 'completed', start: '2026-03-06' },
      },
      deps: [
        ['wi-1', 'wi-2'],
        ['wi-2', 'wi-3'],
        ['wi-1', 'wi-9'],
      ],
      milestones: [{ id: 1, target: '2026-03-25', contributors: ['wi-1'], dependents: ['wi-4'] }],
    });
    expect(rowOf(res, 'N1:work_item:wi-1')).toEqual({
      key: 'N1:work_item:wi-1',
      rule: 'N1',
      tier: 'late',
      severity: 'red',
      subject: { type: 'work_item', id: 'wi-1', label: 'Task A', area: AREA },
      date: '2026-03-05',
      amount: null,
      holdsUp: { count: 3, startingWithin14Days: 2 },
      params: {
        rule: 'N1',
        plannedEndDate: '2026-03-05',
        projectedEndDate: '2026-03-10',
        daysLate: 5,
        companyName: 'Company A',
      },
      actions: ['mark_done', 'reschedule'],
      link: { route: 'workItem', params: { id: 'wi-1' }, query: {} },
      snoozedUntil: null,
    });
  });

  it('no row when the task is not flagged late (end on T itself is on time)', () => {
    const res = run({
      tasks: { 'wi-5': { status: 'in_progress', start: '2026-03-01', end: TODAY } },
    });
    expect(res.rows).toEqual([]);
  });

  it('one day late is a row with daysLate 1', () => {
    const res = run({
      tasks: {
        'wi-1': {
          status: 'in_progress',
          end: '2026-03-09',
          fields: late(1, { projectedEndDate: TODAY }),
        },
      },
    });
    const row = rowOf(res, 'N1:work_item:wi-1');
    expect(row.params).toMatchObject({ rule: 'N1', daysLate: 1 });
  });

  it('falls back to 0 days when the projection carries no lateDays', () => {
    const res = run({ tasks: { 'wi-1': { status: 'in_progress', fields: { isLate: true } } } });
    expect(rowOf(res, 'N1:work_item:wi-1').params).toMatchObject({ daysLate: 0 });
  });

  it.each(['not_started', 'completed'])('no N1 for a %s task even when flagged late', (status) => {
    const res = run({ tasks: { 'wi-1': { status, start: '2026-03-01', fields: late(3) } } });
    expect(res.rows.some((r) => r.rule === 'N1')).toBe(false);
  });

  it('no N1 for a task that has no projection entry', () => {
    const input = build({ tasks: { 'wi-1': { status: 'in_progress', end: '2026-03-01' } } });
    input.projection.workItems.delete('wi-1');
    expect(computeAttention(input).rows).toEqual([]);
  });
});

// ─── N2 ──────────────────────────────────────────────────────────────────────

describe('N2 task late to start', () => {
  it('produces the full row for a not-started task whose planned start passed', () => {
    const res = run({
      tasks: {
        'wi-7': {
          start: '2026-03-07',
          title: 'Task B',
          company: 'Company B',
          fields: late(3, { projectedStartDate: TODAY }),
        },
      },
    });
    expect(rowOf(res, 'N2:work_item:wi-7')).toEqual({
      key: 'N2:work_item:wi-7',
      rule: 'N2',
      tier: 'late',
      severity: 'red',
      subject: { type: 'work_item', id: 'wi-7', label: 'Task B', area: null },
      date: '2026-03-07',
      amount: null,
      holdsUp: { count: 0, startingWithin14Days: 0 },
      params: {
        rule: 'N2',
        kind: 'task',
        plannedStartDate: '2026-03-07',
        projectedStartDate: TODAY,
        daysLate: 3,
        companyName: 'Company B',
      },
      actions: ['start', 'reschedule'],
      link: { route: 'workItem', params: { id: 'wi-7' }, query: {} },
      snoozedUntil: null,
    });
  });

  it('no row for a task starting today, in the future, or with no start at all', () => {
    const res = run({
      tasks: {
        'wi-8': { start: '2026-03-12' },
        'wi-today': { start: TODAY },
        'wi-undated': {},
      },
    });
    expect(res.rows).toEqual([]);
  });

  it('falls back to 0 days when the projection carries no lateDays', () => {
    const res = run({ tasks: { 'wi-1': { start: '2026-03-01', fields: { isLate: true } } } });
    expect(rowOf(res, 'N2:work_item:wi-1').params).toMatchObject({ daysLate: 0 });
  });

  it('no N2 for an in-progress task even when flagged late (that is N1)', () => {
    const res = run({
      tasks: { 'wi-1': { status: 'in_progress', start: '2026-03-01', fields: late(3) } },
    });
    expect(res.rows.map((r) => r.rule)).toEqual(['N1']);
  });

  describe('folding', () => {
    const TASKS = (pred: TaskSpec, succ: TaskSpec = {}) => ({
      p: { start: '2026-03-01', ...pred },
      t: { start: '2026-03-07', fields: late(3), ...succ },
    });

    it('folds a task whose unfinished predecessor is late', () => {
      const res = run({ tasks: TASKS({ fields: late(9) }), deps: [['p', 't']] });
      expect(keys(res.rows)).toEqual(['N2:work_item:p']);
    });

    it('folds a task whose unfinished predecessor is held up', () => {
      const res = run({
        tasks: TASKS({ start: '2026-03-12', fields: { isHeldUp: true } }),
        deps: [['p', 't']],
      });
      expect(res.rows).toEqual([]);
    });

    it('folds a task whose milestone contributor is late (via the milestone)', () => {
      const res = run({
        tasks: {
          c: { status: 'in_progress', end: '2026-03-01', fields: late(4) },
          t: { start: '2026-03-07', fields: late(3) },
        },
        milestones: [{ id: 1, target: '2026-04-01', contributors: ['c'], dependents: ['t'] }],
      });
      expect(keys(res.rows)).toEqual(['N1:work_item:c']);
    });

    it('does not fold through a reached milestone: the late task gets its own N2 row', () => {
      const res = run({
        tasks: {
          c: { status: 'in_progress', end: '2026-03-01', fields: late(4) },
          t: { start: '2026-03-07', fields: late(3) },
        },
        milestones: [
          {
            id: 1,
            target: '2026-04-01',
            completedAt: '2026-03-02T00:00:00.000Z',
            contributors: ['c'],
            dependents: ['t'],
          },
        ],
      });
      expect(keys(res.rows).sort()).toEqual(['N1:work_item:c', 'N2:work_item:t']);
    });

    it('does not fold when the predecessor is completed, even if flagged late', () => {
      const res = run({
        tasks: TASKS({ status: 'completed', fields: late(9) }),
        deps: [['p', 't']],
      });
      expect(keys(res.rows)).toEqual(['N2:work_item:t']);
    });

    it('does not fold when the predecessor is on time', () => {
      const res = run({ tasks: TASKS({ start: '2026-03-12' }), deps: [['p', 't']] });
      expect(keys(res.rows)).toEqual(['N2:work_item:t']);
    });
  });

  describe('grouping', () => {
    const SAME_DATE = (n: number, date = '2026-03-02') =>
      Object.fromEntries(
        Array.from({ length: n }, (_, i) => [
          `g${i + 1}`,
          { start: date, title: `Task G${i + 1}`, fields: late(8) },
        ]),
      );

    it('4 tasks with the same planned start become ONE group row', () => {
      const res = run({ tasks: SAME_DATE(4) });
      expect(keys(res.rows)).toEqual(['N2:group:2026-03-02']);
      expect(res.count).toBe(1);
      expect(res.rows[0]).toEqual({
        key: 'N2:group:2026-03-02',
        rule: 'N2',
        tier: 'late',
        severity: 'red',
        subject: { type: 'group', id: '2026-03-02', label: null, area: null },
        date: '2026-03-02',
        amount: null,
        holdsUp: { count: 0, startingWithin14Days: 0 },
        params: {
          rule: 'N2',
          kind: 'group',
          plannedStartDate: '2026-03-02',
          items: [1, 2, 3, 4].map((n) => ({
            id: `g${n}`,
            label: `Task G${n}`,
            area: null,
            daysLate: 8,
            holdsUp: { count: 0, startingWithin14Days: 0 },
          })),
        },
        actions: [],
        link: { route: 'workItems', params: {}, query: {} },
        snoozedUntil: null,
      });
    });

    it('3 tasks with the same planned start stay separate rows', () => {
      const res = run({ tasks: SAME_DATE(3) });
      expect(keys(res.rows)).toEqual(['N2:work_item:g1', 'N2:work_item:g2', 'N2:work_item:g3']);
      expect(res.count).toBe(3);
    });

    it('4 tasks on different dates are not grouped; 4 + 3 on two dates group only the 4', () => {
      const res = run({
        tasks: {
          ...SAME_DATE(4, '2026-03-02'),
          h1: { start: '2026-03-03', fields: late(7) },
          h2: { start: '2026-03-03', fields: late(7) },
          h3: { start: '2026-03-03', fields: late(7) },
        },
      });
      expect(keys(res.rows)).toEqual([
        'N2:group:2026-03-02',
        'N2:work_item:h1',
        'N2:work_item:h2',
        'N2:work_item:h3',
      ]);
    });

    it('orders group items by holds-up desc, then label, then id and unions the holds-up sets', () => {
      const res = run({
        tasks: {
          ...SAME_DATE(4),
          s1: { start: '2026-04-20' },
          s2: { start: '2026-03-15' },
        },
        // g3 holds up s1 and s2, g4 holds up s2 (shared) -> union {s1, s2}
        deps: [
          ['g3', 's1'],
          ['g3', 's2'],
          ['g4', 's2'],
        ],
      });
      const group = res.rows[0]!;
      if (group.params.rule !== 'N2' || group.params.kind !== 'group')
        throw new Error('not a group');
      expect(group.params.items.map((i) => i.id)).toEqual(['g3', 'g4', 'g1', 'g2']);
      expect(group.params.items.map((i) => i.holdsUp.count)).toEqual([2, 1, 0, 0]);
      expect(group.holdsUp).toEqual({ count: 2, startingWithin14Days: 1 });
    });

    it('breaks equal holds-up and label ties by id', () => {
      const res = run({
        tasks: {
          z9: { start: '2026-03-02', title: 'Same', fields: late(8) },
          a1: { start: '2026-03-02', title: 'Same', fields: late(8) },
          m5: { start: '2026-03-02', title: 'Same', fields: late(8) },
          b2: { start: '2026-03-02', title: 'Alpha', fields: late(8) },
        },
      });
      const group = res.rows[0]!;
      if (group.params.rule !== 'N2' || group.params.kind !== 'group')
        throw new Error('not a group');
      expect(group.params.items.map((i) => i.id)).toEqual(['b2', 'a1', 'm5', 'z9']);
    });

    it('uses an empty label for an item without a title', () => {
      const input = build({ tasks: SAME_DATE(4) });
      input.workItems.get('g1')!.title = null as unknown as string;
      const group = computeAttention(input).rows[0]!;
      if (group.params.rule !== 'N2' || group.params.kind !== 'group')
        throw new Error('not a group');
      expect(group.params.items.find((i) => i.id === 'g1')?.label).toBe('');
    });

    it('does not group N2 rows that have no planned start date', () => {
      const res = run({
        tasks: Object.fromEntries(
          [1, 2, 3, 4].map((n) => [`u${n}`, { start: null, fields: late(2) }]),
        ),
      });
      expect(res.rows).toHaveLength(4);
      expect(res.rows.every((r) => r.subject.type === 'work_item')).toBe(true);
    });

    it('removes individually snoozed members before grouping: 5 with 1 snoozed -> a group of 4', () => {
      const res = run({
        tasks: SAME_DATE(5),
        snoozes: { 'N2:work_item:g5': '2026-03-17' },
      });
      expect(keys(res.rows)).toEqual(['N2:group:2026-03-02']);
      expect(res.snoozedCount).toBe(1);
      const group = res.rows[0]!;
      if (group.params.rule !== 'N2' || group.params.kind !== 'group')
        throw new Error('not a group');
      expect(group.params.items.map((i) => i.id)).toEqual(['g1', 'g2', 'g3', 'g4']);
    });

    it('4 with 1 snoozed -> 3 individual rows (no group) and snoozedCount 1', () => {
      const res = run({ tasks: SAME_DATE(4), snoozes: { 'N2:work_item:g4': '2026-03-17' } });
      expect(keys(res.rows)).toEqual(['N2:work_item:g1', 'N2:work_item:g2', 'N2:work_item:g3']);
      expect(res.snoozedCount).toBe(1);
      expect(res.count).toBe(3);
    });

    it('includeSnoozed keeps the snoozed member individual (flagged) and does not group the rest', () => {
      const res = run({
        tasks: SAME_DATE(4),
        snoozes: { 'N2:work_item:g4': '2026-03-17' },
        includeSnoozed: true,
      });
      expect(res.rows).toHaveLength(4);
      expect(res.rows.every((r) => r.subject.type === 'work_item')).toBe(true);
      expect(rowOf(res, 'N2:work_item:g4').snoozedUntil).toBe('2026-03-17');
      expect(res.count).toBe(3);
      expect(res.snoozedCount).toBe(1);
    });
  });
});

// ─── N3 ──────────────────────────────────────────────────────────────────────

describe('N3 late milestone', () => {
  it('produces the full row for a not-reached milestone whose target passed', () => {
    const res = run({
      tasks: { w: { start: '2026-03-15' } },
      milestones: [{ id: 3, target: '2026-03-01', title: 'Ms Past', dependents: ['w'] }],
    });
    expect(rowOf(res, 'N3:milestone:3')).toEqual({
      key: 'N3:milestone:3',
      rule: 'N3',
      tier: 'late',
      severity: 'red',
      subject: { type: 'milestone', id: '3', label: 'Ms Past', area: null },
      date: '2026-03-01',
      amount: null,
      holdsUp: { count: 1, startingWithin14Days: 1 },
      params: {
        rule: 'N3',
        targetDate: '2026-03-01',
        projectedDate: null,
        daysAfterTarget: null,
        daysSinceTarget: 9,
      },
      actions: ['change_target', 'open'],
      link: { route: 'milestone', params: { id: '3' }, query: {} },
      snoozedUntil: null,
    });
  });

  it('a milestone projected after its (future) target is a row with daysAfterTarget', () => {
    const res = run({
      milestones: [{ id: 4, target: '2026-03-20', projectedDate: '2026-03-25', isLate: true }],
    });
    expect(rowOf(res, 'N3:milestone:4').params).toEqual({
      rule: 'N3',
      targetDate: '2026-03-20',
      projectedDate: '2026-03-25',
      daysAfterTarget: 5,
      daysSinceTarget: null,
    });
  });

  it('a past target with a projected date at or before it has no daysAfterTarget', () => {
    const res = run({
      milestones: [{ id: 5, target: '2026-03-08', projectedDate: '2026-03-08', isLate: false }],
    });
    expect(rowOf(res, 'N3:milestone:5').params).toMatchObject({
      daysAfterTarget: null,
      daysSinceTarget: 2,
    });
  });

  it('no row when the target is today and nothing is projected late', () => {
    expect(run({ milestones: [{ id: 6, target: TODAY }] }).rows).toEqual([]);
  });

  it('a target of yesterday is a row (boundary)', () => {
    expect(keys(run({ milestones: [{ id: 6, target: '2026-03-09' }] }).rows)).toEqual([
      'N3:milestone:6',
    ]);
  });

  it('no row for a future milestone whose contributor ends before the target', () => {
    const res = run({
      milestones: [{ id: 7, target: '2026-04-01', projectedDate: '2026-03-20', isLate: false }],
    });
    expect(res.rows).toEqual([]);
  });

  it('no row for a reached milestone (completedAt set, or is_completed set)', () => {
    const res = run({
      milestones: [
        { id: 8, target: '2026-02-01', completedAt: '2026-02-02T00:00:00.000Z' },
        { id: 9, target: '2026-02-01', isCompleted: true },
        { id: 10, target: '2026-02-01', isCompleted: true, isLate: true },
      ],
    });
    expect(res.rows).toEqual([]);
  });

  it('works when the projection has no entry for the milestone', () => {
    const input = build({ milestones: [{ id: 11, target: '2026-03-01' }] });
    input.projection.milestones.delete(11);
    expect(keys(computeAttention(input).rows)).toEqual(['N3:milestone:11']);
  });

  it('is one row per milestone, never per event', () => {
    const res = run({
      milestones: [
        { id: 12, target: '2026-03-01' },
        { id: 13, target: '2026-03-02' },
      ],
    });
    expect(keys(res.rows)).toEqual(['N3:milestone:12', 'N3:milestone:13']);
  });
});

// ─── N4 / N5 / N6 ────────────────────────────────────────────────────────────

describe('N4 payment overdue, N5 due soon, N6 long unpaid', () => {
  it('N4: final payment due before today is the full overdue row', () => {
    const res = run({ openPayments: [payment({ dueDate: '2026-03-01', amount: 1000 })] });
    expect(rowOf(res, 'N4:invoice:inv-1')).toEqual({
      key: 'N4:invoice:inv-1',
      rule: 'N4',
      tier: 'overdue',
      severity: 'red',
      subject: { type: 'invoice', id: 'inv-1', label: 'NR-1', area: null },
      date: '2026-03-01',
      amount: 1000,
      holdsUp: null,
      params: {
        rule: 'N4',
        recordKind: 'invoice',
        paymentKind: 'final',
        invoiceId: 'inv-1',
        invoiceNumber: 'NR-1',
        companyName: 'Company A',
        invoiceDate: '2026-02-20',
        dueDate: '2026-03-01',
        dueInDays: -9,
        daysOpen: 18,
      },
      actions: ['mark_paid'],
      link: { route: 'invoice', params: { id: 'inv-1' }, query: {} },
      snoozedUntil: null,
    });
  });

  it('N4: a progress payment keys on the deposit and links to its invoice with ?payment', () => {
    const res = run({
      openPayments: [
        payment({
          kind: 'progress',
          invoiceId: 'inv-4',
          depositId: 'dep-1',
          dueDate: '2026-03-05',
          amount: 400,
        }),
      ],
    });
    const row = rowOf(res, 'N4:progress_payment:dep-1');
    expect(row.subject).toEqual({
      type: 'progress_payment',
      id: 'dep-1',
      label: 'NR-1',
      area: null,
    });
    expect(row.amount).toBe(400);
    expect(row.link).toEqual({
      route: 'invoice',
      params: { id: 'inv-4' },
      query: { payment: 'dep-1' },
    });
    expect(row.params).toMatchObject({ paymentKind: 'progress', invoiceId: 'inv-4' });
  });

  it('a progress item without a deposit id is keyed on the invoice (defensive)', () => {
    const res = run({
      openPayments: [payment({ kind: 'progress', depositId: null, dueDate: '2026-03-05' })],
    });
    expect(keys(res.rows)).toEqual(['N4:invoice:inv-1']);
  });

  it('N4/N5 boundaries: T-1 overdue, T due soon, T+7 due soon, T+8 nothing', () => {
    const res = run({
      openPayments: [
        payment({ invoiceId: 'a', dueDate: '2026-03-09' }),
        payment({ invoiceId: 'b', dueDate: '2026-03-10' }),
        payment({ invoiceId: 'c', dueDate: '2026-03-17' }),
        payment({ invoiceId: 'd', dueDate: '2026-03-18' }),
      ],
    });
    expect(keys(res.rows)).toEqual(['N4:invoice:a', 'N5:invoice:b', 'N5:invoice:c']);
    const b = rowOf(res, 'N5:invoice:b');
    expect(b).toMatchObject({ tier: 'due', severity: 'amber', actions: ['mark_paid'] });
    expect(b.params).toMatchObject({ dueInDays: 0 });
    expect(rowOf(res, 'N5:invoice:c').params).toMatchObject({ dueInDays: 7 });
  });

  it('an offer progress payment is a row with recordKind offer', () => {
    const res = run({
      openPayments: [
        payment({
          kind: 'progress',
          invoiceId: 'off-1',
          depositId: 'dep-2',
          invoiceStatus: 'quotation',
          dueDate: '2026-03-14',
          amount: 300,
        }),
      ],
    });
    const row = rowOf(res, 'N5:progress_payment:dep-2');
    expect(row.params).toMatchObject({ rule: 'N5', recordKind: 'offer', paymentKind: 'progress' });
    expect(row.amount).toBe(300);
  });

  it('N6: a pending final payment with no due date and an invoice date of T-30 is a row', () => {
    const res = run({
      openPayments: [payment({ invoiceId: 'inv-5', dueDate: null, invoiceDate: '2026-02-08' })],
    });
    expect(rowOf(res, 'N6:invoice:inv-5')).toEqual({
      key: 'N6:invoice:inv-5',
      rule: 'N6',
      tier: 'due',
      severity: 'amber',
      subject: { type: 'invoice', id: 'inv-5', label: 'NR-1', area: null },
      date: '2026-02-08',
      amount: 1000,
      holdsUp: null,
      params: {
        rule: 'N6',
        recordKind: 'invoice',
        paymentKind: 'final',
        invoiceId: 'inv-5',
        invoiceNumber: 'NR-1',
        companyName: 'Company A',
        invoiceDate: '2026-02-08',
        dueDate: null,
        dueInDays: null,
        daysOpen: 30,
      },
      actions: ['mark_paid'],
      link: { route: 'invoice', params: { id: 'inv-5' }, query: {} },
      snoozedUntil: null,
    });
  });

  it('N6 negatives: T-29, a non-pending invoice, a progress item, an offer', () => {
    const res = run({
      openPayments: [
        payment({ invoiceId: 'a', dueDate: null, invoiceDate: '2026-02-09' }),
        payment({
          invoiceId: 'b',
          dueDate: null,
          invoiceDate: '2026-01-01',
          invoiceStatus: 'paid',
        }),
        payment({
          kind: 'progress',
          invoiceId: 'c',
          depositId: 'dep-c',
          dueDate: null,
          invoiceDate: '2026-01-01',
        }),
        payment({
          invoiceId: 'd',
          dueDate: null,
          invoiceDate: '2026-01-01',
          invoiceStatus: 'quotation',
        }),
      ],
    });
    expect(res.rows).toEqual([]);
  });

  it('a final payment with a due date never becomes N6 (an old invoice due in the future)', () => {
    const res = run({
      openPayments: [payment({ dueDate: '2026-04-01', invoiceDate: '2025-12-01' })],
    });
    expect(res.rows).toEqual([]);
  });

  it('a payment carries no holds-up and no tidy-up row', () => {
    const res = run({ openPayments: [payment()] });
    expect(res.rows[0]!.holdsUp).toBeNull();
    expect(res.tidyUp).toEqual([]);
  });
});

// ─── N8 ──────────────────────────────────────────────────────────────────────

describe('N8 ready to submit', () => {
  it('produces the full row for a bank loan with a draw-down set', () => {
    const res = run({
      sources: [
        source({ id: 'src-loan', name: 'Loan A', readyToSubmit: { count: 2, amount: 5000 } }),
      ],
    });
    expect(rowOf(res, 'N8:budget_source:src-loan')).toEqual({
      key: 'N8:budget_source:src-loan',
      rule: 'N8',
      tier: 'ready',
      severity: 'amber',
      subject: { type: 'budget_source', id: 'src-loan', label: 'Loan A', area: null },
      date: null,
      amount: 5000,
      holdsUp: null,
      params: { rule: 'N8', sourceType: 'bank_loan', count: 2 },
      actions: ['prepare_bank_report'],
      link: { route: 'bankReport', params: {}, query: { sourceId: 'src-loan' } },
      snoozedUntil: null,
    });
  });

  it('a credit line qualifies too', () => {
    const res = run({
      sources: [
        source({ id: 'cl', sourceType: 'credit_line', readyToSubmit: { count: 1, amount: 10 } }),
      ],
    });
    expect(rowOf(res, 'N8:budget_source:cl').params).toMatchObject({ sourceType: 'credit_line' });
  });

  it.each(['savings', 'other', 'discretionary'] as const)(
    'no row for a %s source even with ready lines',
    (sourceType) => {
      const res = run({
        sources: [source({ sourceType, readyToSubmit: { count: 3, amount: 900 } })],
      });
      expect(res.rows).toEqual([]);
    },
  );

  it('no row when count is 0 or amount is 0', () => {
    const res = run({
      sources: [
        source({ id: 'a', readyToSubmit: { count: 0, amount: 100 } }),
        source({ id: 'b', readyToSubmit: { count: 2, amount: 0 } }),
        source({ id: 'c', readyToSubmit: { count: 0, amount: 0 } }),
      ],
    });
    expect(res.rows).toEqual([]);
  });

  it('is one row per source', () => {
    const res = run({
      sources: [
        source({ id: 'a', readyToSubmit: { count: 1, amount: 100 } }),
        source({ id: 'b', readyToSubmit: { count: 1, amount: 200 } }),
      ],
    });
    expect(keys(res.rows)).toEqual(['N8:budget_source:a', 'N8:budget_source:b']);
  });
});

// ─── N9 ──────────────────────────────────────────────────────────────────────

describe('N9 offer due', () => {
  it('produces the full row for an offer due within 7 days', () => {
    const res = run({
      invoices: {
        'off-1': {
          status: 'quotation',
          amount: 2000,
          dueDate: '2026-03-12',
          invoiceNumber: 'AN-1',
        },
      },
    });
    expect(rowOf(res, 'N9:invoice:off-1')).toEqual({
      key: 'N9:invoice:off-1',
      rule: 'N9',
      tier: 'follow_up',
      severity: 'amber',
      subject: { type: 'invoice', id: 'off-1', label: 'AN-1', area: null },
      date: '2026-03-12',
      amount: 2000,
      holdsUp: null,
      params: {
        rule: 'N9',
        invoiceNumber: 'AN-1',
        companyName: 'Company A',
        dueDate: '2026-03-12',
        dueInDays: 2,
      },
      actions: ['open', 'convert'],
      link: { route: 'invoice', params: { id: 'off-1' }, query: {} },
      snoozedUntil: null,
    });
  });

  it('boundaries: T+7 is a row, T+8 is not; past dates are rows; no due date is not', () => {
    const res = run({
      invoices: {
        a: { status: 'quotation', dueDate: '2026-03-17' },
        b: { status: 'quotation', dueDate: '2026-03-18' },
        c: { status: 'quotation', dueDate: '2026-03-01' },
        d: { status: 'quotation', dueDate: null },
      },
    });
    expect(keys(res.rows).sort()).toEqual(['N9:invoice:a', 'N9:invoice:c']);
    expect(rowOf(res, 'N9:invoice:c').params).toMatchObject({ dueInDays: -9 });
  });

  it('a converted offer (any status but quotation) is not an N9 row', () => {
    const res = run({
      invoices: {
        a: { status: 'pending', dueDate: '2026-03-01' },
        b: { status: 'paid', dueDate: '2026-03-01' },
      },
    });
    expect(res.rows).toEqual([]);
  });
});

// ─── N10 ─────────────────────────────────────────────────────────────────────

describe('N10 delivery due or late', () => {
  it('red: not delivered and the planned date (latest ?? earliest) is before today, full row', () => {
    const res = run({
      purchases: [
        purchase({
          id: 'hi-1',
          name: 'Purchase A',
          targetDeliveryDate: '2026-03-20',
          earliestDeliveryDate: '2026-03-01',
          latestDeliveryDate: '2026-03-05',
          companyName: 'Company C',
          area: AREA,
        }),
      ],
    });
    expect(rowOf(res, 'N10:household_item:hi-1')).toEqual({
      key: 'N10:household_item:hi-1',
      rule: 'N10',
      tier: 'late',
      severity: 'red',
      subject: { type: 'household_item', id: 'hi-1', label: 'Purchase A', area: AREA },
      date: '2026-03-05',
      amount: null,
      holdsUp: null,
      params: {
        rule: 'N10',
        status: 'purchased',
        isLate: true,
        dueInDays: -5,
        targetDeliveryDate: '2026-03-20',
        earliestDeliveryDate: '2026-03-01',
        latestDeliveryDate: '2026-03-05',
        companyName: 'Company C',
      },
      actions: ['mark_delivered'],
      link: { route: 'householdItem', params: { id: 'hi-1' }, query: {} },
      snoozedUntil: null,
    });
  });

  it.each(['earliestDeliveryDate', 'latestDeliveryDate'] as const)(
    'boundaries on %s: T-1 red, T amber, T+7 amber, T+8 no row',
    (field) => {
      const res = run({
        purchases: [
          purchase({ id: 'a', [field]: '2026-03-09' }),
          purchase({ id: 'b', [field]: '2026-03-10' }),
          purchase({ id: 'c', [field]: '2026-03-17' }),
          purchase({ id: 'd', [field]: '2026-03-18' }),
        ],
      });
      expect(keys(res.rows).sort()).toEqual([
        'N10:household_item:a',
        'N10:household_item:b',
        'N10:household_item:c',
      ]);
      expect(rowOf(res, 'N10:household_item:a')).toMatchObject({ tier: 'late', severity: 'red' });
      expect(rowOf(res, 'N10:household_item:b')).toMatchObject({ tier: 'due', severity: 'amber' });
      expect(rowOf(res, 'N10:household_item:b').params).toMatchObject({
        isLate: false,
        dueInDays: 0,
      });
      expect(rowOf(res, 'N10:household_item:c').params).toMatchObject({ dueInDays: 7 });
    },
  );

  it('the latest date wins over the earliest: late only when the latest is past', () => {
    const res = run({
      purchases: [
        purchase({
          id: 'p',
          earliestDeliveryDate: '2026-03-01',
          latestDeliveryDate: '2026-03-12',
        }),
        purchase({
          id: 'q',
          earliestDeliveryDate: '2026-03-12',
          latestDeliveryDate: '2026-03-05',
        }),
        purchase({
          id: 'r',
          earliestDeliveryDate: '2026-03-01',
          latestDeliveryDate: '2026-05-01',
        }),
      ],
    });
    expect(rowOf(res, 'N10:household_item:p')).toMatchObject({ tier: 'due', date: '2026-03-12' });
    expect(rowOf(res, 'N10:household_item:q')).toMatchObject({ tier: 'late', date: '2026-03-05' });
    expect(res.rows.some((r) => r.key === 'N10:household_item:r')).toBe(false);
  });

  it('amber when any of target, earliest or latest is within T..T+7; the row date is latest ?? earliest ?? target', () => {
    const res = run({
      purchases: [
        purchase({ id: 'a', targetDeliveryDate: '2026-03-12' }),
        purchase({
          id: 'b',
          targetDeliveryDate: '2026-03-12',
          earliestDeliveryDate: '2026-05-01',
          latestDeliveryDate: '2026-06-01',
        }),
        purchase({ id: 'c', targetDeliveryDate: '2026-05-01', earliestDeliveryDate: '2026-03-13' }),
      ],
    });
    expect(rowOf(res, 'N10:household_item:a')).toMatchObject({ tier: 'due', date: '2026-03-12' });
    expect(rowOf(res, 'N10:household_item:b')).toMatchObject({ tier: 'due', date: '2026-06-01' });
    expect(rowOf(res, 'N10:household_item:b').params).toMatchObject({ dueInDays: 83 });
    expect(rowOf(res, 'N10:household_item:c')).toMatchObject({ tier: 'due', date: '2026-03-13' });
  });

  it('a past target alone is no row (only the entered earliest/latest dates define Late)', () => {
    const res = run({ purchases: [purchase({ id: 'x', targetDeliveryDate: '2026-03-01' })] });
    expect(res.rows).toEqual([]);
  });

  it('dueInDays is always a number', () => {
    const res = run({
      purchases: [
        purchase({ id: 'a', latestDeliveryDate: '2026-03-09' }),
        purchase({ id: 'b', targetDeliveryDate: '2026-03-11' }),
      ],
    });
    for (const r of res.rows) {
      expect(typeof (r.params as { dueInDays: unknown }).dueInDays).toBe('number');
    }
  });

  it('a purchase without any date is no row', () => {
    expect(run({ purchases: [purchase({ id: 'z' })] }).rows).toEqual([]);
  });

  it('arrived or already delivered purchases are never rows, even with a past date', () => {
    const res = run({
      purchases: [
        purchase({ id: 'a', status: 'arrived', latestDeliveryDate: '2026-03-01' }),
        purchase({ id: 'b', latestDeliveryDate: '2026-03-01', actualDeliveryDate: '2026-03-09' }),
      ],
    });
    expect(res.rows).toEqual([]);
  });
});

// ─── N11 ─────────────────────────────────────────────────────────────────────

describe('N11 grant deadline', () => {
  it('produces the full row for an eligible grant with a deadline in the window', () => {
    const res = run({ grants: [grant({ id: 'gr-1', name: 'Grant A', deadline: '2026-03-24' })] });
    expect(rowOf(res, 'N11:subsidy_program:gr-1')).toEqual({
      key: 'N11:subsidy_program:gr-1',
      rule: 'N11',
      tier: 'follow_up',
      severity: 'amber',
      subject: { type: 'subsidy_program', id: 'gr-1', label: 'Grant A', area: null },
      date: '2026-03-24',
      amount: null,
      holdsUp: null,
      params: { rule: 'N11', status: 'eligible', deadline: '2026-03-24', dueInDays: 14 },
      actions: ['open'],
      link: { route: 'budgetSubsidies', params: {}, query: {} },
      snoozedUntil: null,
    });
  });

  it('boundaries: T and T+14 are rows; T-1 and T+15 are not; applied counts', () => {
    const res = run({
      grants: [
        grant({ id: 'a', status: 'applied', deadline: TODAY }),
        grant({ id: 'b', deadline: '2026-03-24' }),
        grant({ id: 'c', deadline: '2026-03-09' }),
        grant({ id: 'd', deadline: '2026-03-25' }),
      ],
    });
    expect(keys(res.rows).sort()).toEqual(['N11:subsidy_program:a', 'N11:subsidy_program:b']);
    expect(rowOf(res, 'N11:subsidy_program:a').params).toMatchObject({
      status: 'applied',
      dueInDays: 0,
    });
  });

  it.each(['approved', 'received', 'rejected', 'ineligible'])('no row for a %s grant', (status) => {
    expect(run({ grants: [grant({ status, deadline: '2026-03-12' })] }).rows).toEqual([]);
  });

  it('no row without a deadline', () => {
    expect(run({ grants: [grant({ deadline: null })] }).rows).toEqual([]);
  });
});

// ─── N12 ─────────────────────────────────────────────────────────────────────

describe('N12 open defect', () => {
  it('produces the full row for an open issue', () => {
    const res = run({ defects: [defect({ id: 'd-1', title: 'Crack A', severity: 'high' })] });
    expect(rowOf(res, 'N12:diary_entry:d-1')).toEqual({
      key: 'N12:diary_entry:d-1',
      rule: 'N12',
      tier: 'follow_up',
      severity: 'amber',
      subject: { type: 'diary_entry', id: 'd-1', label: 'Crack A', area: null },
      date: '2026-03-01',
      amount: null,
      holdsUp: null,
      params: { rule: 'N12', resolutionStatus: 'open', severity: 'high', entryDate: '2026-03-01' },
      actions: ['open'],
      link: { route: 'diaryEntry', params: { id: 'd-1' }, query: {} },
      snoozedUntil: null,
    });
  });

  it('in_progress is a row; a missing resolutionStatus is reported as open', () => {
    const res = run({
      defects: [
        defect({ id: 'a', resolutionStatus: 'in_progress', severity: null }),
        defect({ id: 'b', resolutionStatus: null }),
      ],
    });
    expect(rowOf(res, 'N12:diary_entry:a').params).toMatchObject({
      resolutionStatus: 'in_progress',
      severity: null,
    });
    expect(rowOf(res, 'N12:diary_entry:b').params).toMatchObject({ resolutionStatus: 'open' });
  });

  it('a resolved defect (or an unknown status) is not a row', () => {
    const res = run({
      defects: [
        defect({ id: 'a', resolutionStatus: 'resolved' }),
        defect({ id: 'b', resolutionStatus: 'archived' }),
      ],
    });
    expect(res.rows).toEqual([]);
  });
});

// ─── Tidy up: H1, H2, H4 ─────────────────────────────────────────────────────

describe('H1 unfinished log', () => {
  it('produces the full tidy row for a draft older than 24 hours', () => {
    const res = run({ drafts: [draft({ id: 'dr-1', title: 'Log A' })] });
    expect(res.rows).toEqual([]);
    expect(res.count).toBe(0);
    expect(res.tidyUp).toEqual([
      {
        key: 'H1:diary_entry:dr-1',
        rule: 'H1',
        tier: 'tidy',
        severity: 'none',
        subject: { type: 'diary_entry', id: 'dr-1', label: 'Log A', area: null },
        date: '2026-03-08',
        amount: null,
        holdsUp: null,
        params: {
          rule: 'H1',
          entryType: 'daily_log',
          entryDate: '2026-03-08',
          updatedAt: '2026-03-08T10:00:00.000Z',
        },
        actions: ['continue', 'discard'],
        link: { route: 'diaryEntryEdit', params: { id: 'dr-1' }, query: {} },
        snoozedUntil: null,
      },
    ]);
  });

  it('24 h boundary: 23 h and exactly 24 h are not rows, 24 h + 1 ms is', () => {
    const res = run({
      drafts: [
        draft({ id: 'a', updatedAt: '2026-03-09T10:00:00.000Z' }),
        draft({ id: 'b', updatedAt: '2026-03-09T09:00:00.000Z' }),
        draft({ id: 'c', updatedAt: '2026-03-09T08:59:59.999Z' }),
      ],
    });
    expect(keys(res.tidyUp)).toEqual(['H1:diary_entry:c']);
  });
});

describe('H2 not fully split', () => {
  it('produces the full tidy row from the money service remainder', () => {
    const res = run({
      invoices: { 'inv-9': { amount: 500, date: '2026-03-02', invoiceNumber: 'NR-9' } },
      notYetSplitByInvoice: { 'inv-9': 50000 },
    });
    expect(res.tidyUp).toEqual([
      {
        key: 'H2:invoice:inv-9',
        rule: 'H2',
        tier: 'tidy',
        severity: 'none',
        subject: { type: 'invoice', id: 'inv-9', label: 'NR-9', area: null },
        date: '2026-03-02',
        amount: 500,
        holdsUp: null,
        params: {
          rule: 'H2',
          recordKind: 'invoice',
          invoiceNumber: 'NR-9',
          companyName: 'Company A',
          invoiceAmount: 500,
        },
        actions: ['split'],
        link: { route: 'invoice', params: { id: 'inv-9' }, query: {} },
        snoozedUntil: null,
      },
    ]);
  });

  it('an offer is recordKind offer; the amount is the cents remainder in major units', () => {
    const res = run({
      invoices: { 'off-1': { status: 'quotation', amount: 100.99 } },
      notYetSplitByInvoice: { 'off-1': 10099 },
    });
    expect(res.tidyUp[0]!.amount).toBe(100.99);
    expect(res.tidyUp[0]!.params).toMatchObject({ recordKind: 'offer' });
  });

  it('skips a remainder whose invoice is unknown', () => {
    expect(run({ notYetSplitByInvoice: { ghost: 5000 } }).tidyUp).toEqual([]);
  });

  it('nothing in notYetSplitByInvoice means no H2 (an invoice below 1.00 never arrives)', () => {
    expect(run({ invoices: { 'inv-10': { amount: 100.99 } } }).tidyUp).toEqual([]);
  });
});

describe('H4 ended but not marked done', () => {
  it('produces the full tidy row when the actual end is before today', () => {
    const res = run({
      tasks: {
        'wi-6': { status: 'in_progress', actualEnd: '2026-03-08', title: 'Task F', area: AREA },
      },
    });
    expect(res.tidyUp).toEqual([
      {
        key: 'H4:work_item:wi-6',
        rule: 'H4',
        tier: 'tidy',
        severity: 'none',
        subject: { type: 'work_item', id: 'wi-6', label: 'Task F', area: AREA },
        date: '2026-03-08',
        amount: null,
        holdsUp: null,
        params: { rule: 'H4', actualEndDate: '2026-03-08' },
        actions: ['mark_done'],
        link: { route: 'workItem', params: { id: 'wi-6' }, query: {} },
        snoozedUntil: null,
      },
    ]);
    expect(res.rows).toEqual([]);
  });

  it('negatives: actual end today, no actual end, completed, not started', () => {
    const res = run({
      tasks: {
        a: { status: 'in_progress', actualEnd: TODAY },
        b: { status: 'in_progress' },
        c: { status: 'completed', actualEnd: '2026-03-01' },
        d: { status: 'not_started', actualEnd: '2026-03-01' },
      },
    });
    expect(res.tidyUp).toEqual([]);
  });
});

// ─── No photo rows, no H3, no N7 ─────────────────────────────────────────────

describe('rules that do not exist', () => {
  it('a fully loaded scenario only ever yields rules from the documented set', () => {
    const res = run(fullScenario());
    const rules = new Set([...res.rows, ...res.tidyUp].map((r) => r.rule));
    for (const rule of rules) expect(['H3', 'N7']).not.toContain(rule);
    for (const r of [...res.rows, ...res.tidyUp]) {
      expect(r.subject.type).not.toMatch(/photo/);
      expect(r.key).not.toMatch(/photo|^H3|^N7/);
    }
  });
});

// ─── Snoozes, count, snoozedCount, catchUp ───────────────────────────────────

describe('snoozes', () => {
  const ONE_PAYMENT = { openPayments: [payment({ dueDate: '2026-03-01' })] };

  it('hides a row while today < until and counts it in snoozedCount', () => {
    const res = run({ ...ONE_PAYMENT, snoozes: { 'N4:invoice:inv-1': '2026-03-11' } });
    expect(res.rows).toEqual([]);
    expect(res.count).toBe(0);
    expect(res.snoozedCount).toBe(1);
  });

  it('shows a row again when until == today', () => {
    const res = run({ ...ONE_PAYMENT, snoozes: { 'N4:invoice:inv-1': TODAY } });
    expect(keys(res.rows)).toEqual(['N4:invoice:inv-1']);
    expect(res.snoozedCount).toBe(0);
    expect(res.rows[0]!.snoozedUntil).toBeNull();
  });

  it('a snooze in the past has no effect', () => {
    const res = run({ ...ONE_PAYMENT, snoozes: { 'N4:invoice:inv-1': '2026-03-01' } });
    expect(res.snoozedCount).toBe(0);
    expect(res.count).toBe(1);
  });

  it('includeSnoozed returns the row with snoozedUntil and keeps it out of count', () => {
    const res = run({
      ...ONE_PAYMENT,
      snoozes: { 'N4:invoice:inv-1': '2026-03-17' },
      includeSnoozed: true,
    });
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]!.snoozedUntil).toBe('2026-03-17');
    expect(res.count).toBe(0);
    expect(res.snoozedCount).toBe(1);
  });

  it('snoozes apply to tidy-up rows too and count in snoozedCount', () => {
    const res = run({ drafts: [draft()], snoozes: { 'H1:diary_entry:dr-1': '2026-03-17' } });
    expect(res.tidyUp).toEqual([]);
    expect(res.snoozedCount).toBe(1);
    const shown = run({
      drafts: [draft()],
      snoozes: { 'H1:diary_entry:dr-1': '2026-03-17' },
      includeSnoozed: true,
    });
    expect(shown.tidyUp[0]!.snoozedUntil).toBe('2026-03-17');
  });

  it('a snooze on the N5 key does not hide the same payment once it is N4 (new key)', () => {
    const res = run({ ...ONE_PAYMENT, snoozes: { 'N5:invoice:inv-1': '2026-03-17' } });
    expect(keys(res.rows)).toEqual(['N4:invoice:inv-1']);
    expect(res.snoozedCount).toBe(0);
  });

  it('a snoozed group counts 1, hides its members and leaves them out of catchUp', () => {
    const tasks = Object.fromEntries(
      [1, 2, 3, 4].map((n) => [`g${n}`, { start: '2026-03-02', fields: late(8) }]),
    );
    const hidden = run({ tasks, snoozes: { 'N2:group:2026-03-02': '2026-03-17' } });
    expect(hidden.rows).toEqual([]);
    expect(hidden.snoozedCount).toBe(1);
    expect(hidden.catchUp).toBeNull();

    const shown = run({
      tasks,
      snoozes: { 'N2:group:2026-03-02': '2026-03-17' },
      includeSnoozed: true,
    });
    expect(keys(shown.rows)).toEqual(['N2:group:2026-03-02']);
    expect(shown.rows[0]!.snoozedUntil).toBe('2026-03-17');
    expect(shown.count).toBe(0);
    expect(shown.snoozedCount).toBe(1);
    expect(shown.catchUp).toBeNull();
  });
});

describe('count', () => {
  it('counts needs-attention rows only: tidyUp and standing are excluded, a group counts 1', () => {
    const tasks = Object.fromEntries(
      [1, 2, 3, 4].map((n) => [`g${n}`, { start: '2026-03-02', fields: late(8) }]),
    );
    const res = run({
      tasks: {
        ...tasks,
        'wi-6': { status: 'in_progress', actualEnd: '2026-03-08' },
      },
      openPayments: [payment()],
      drafts: [draft()],
      sources: [source({ overAllocated: 400 })],
    });
    expect(res.rows).toHaveLength(2);
    expect(res.count).toBe(2);
    expect(res.tidyUp).toHaveLength(2);
    expect(res.standing).toHaveLength(1);
  });

  it('is zero for an empty project and returns the shape with empty lists', () => {
    expect(run()).toEqual({
      today: TODAY,
      count: 0,
      snoozedCount: 0,
      rows: [],
      tidyUp: [],
      standing: [],
      criticalLine: null,
      catchUp: null,
    });
  });
});

describe('catchUp', () => {
  const lateTasks = (n: number) =>
    Object.fromEntries(
      Array.from({ length: n }, (_, i) => [
        `t${i + 1}`,
        { start: `2026-03-0${i + 1}`, fields: late(9 - i) },
      ]),
    );

  it('is null for 2 late tasks and present for 3', () => {
    expect(run({ tasks: lateTasks(2) }).catchUp).toBeNull();
    expect(run({ tasks: lateTasks(3) }).catchUp).toEqual({ lateTaskCount: 3 });
  });

  it('counts N1 and N2 together and ignores other rules', () => {
    const res = run({
      tasks: {
        a: { status: 'in_progress', end: '2026-03-01', fields: late(9) },
        b: { start: '2026-03-02', fields: late(8) },
        c: { start: '2026-03-03', fields: late(7) },
      },
      openPayments: [payment(), payment({ invoiceId: 'inv-2' })],
    });
    expect(res.catchUp).toEqual({ lateTaskCount: 3 });
  });

  it('counts the members of a live group', () => {
    const tasks = Object.fromEntries(
      [1, 2, 3, 4].map((n) => [`g${n}`, { start: '2026-03-02', fields: late(8) }]),
    );
    expect(run({ tasks }).catchUp).toEqual({ lateTaskCount: 4 });
  });

  it('does not count individually snoozed tasks', () => {
    const res = run({
      tasks: lateTasks(3),
      snoozes: { 'N2:work_item:t1': '2026-03-17' },
    });
    expect(res.catchUp).toBeNull();
    const withSnoozed = run({
      tasks: lateTasks(3),
      snoozes: { 'N2:work_item:t1': '2026-03-17' },
      includeSnoozed: true,
    });
    expect(withSnoozed.catchUp).toBeNull();
  });
});

// ─── Ordering ────────────────────────────────────────────────────────────────

describe('ordering', () => {
  it('red rows come before amber rows regardless of holds-up or date', () => {
    const res = run({
      tasks: { a: { status: 'in_progress', end: '2026-03-09', fields: late(1) } },
      defects: [defect({ id: 'old', entryDate: '2020-01-01' })],
    });
    expect(keys(res.rows)).toEqual(['N1:work_item:a', 'N12:diary_entry:old']);
  });

  it('within a severity, the row that holds up the most work comes first (null counts as 0)', () => {
    const res = run({
      tasks: {
        a: { status: 'in_progress', end: '2026-03-09', fields: late(1) },
        b: { status: 'in_progress', end: '2026-03-01', fields: late(9) },
        s1: {},
        s2: {},
      },
      deps: [
        ['a', 's1'],
        ['a', 's2'],
      ],
      openPayments: [payment({ dueDate: '2026-02-01' })],
    });
    // a holds up 2 (later date), then the two with 0: the payment (null holds-up, 02-01) before b (03-01)
    expect(keys(res.rows)).toEqual(['N1:work_item:a', 'N4:invoice:inv-1', 'N1:work_item:b']);
  });

  it('then by date ascending, null dates last', () => {
    const res = run({
      sources: [source({ id: 'nodate', readyToSubmit: { count: 1, amount: 10 } })],
      defects: [
        defect({ id: 'late', entryDate: '2026-03-05' }),
        defect({ id: 'early', entryDate: '2026-02-01' }),
      ],
    });
    expect(keys(res.rows)).toEqual([
      'N12:diary_entry:early',
      'N12:diary_entry:late',
      'N8:budget_source:nodate',
    ]);
  });

  it('then by rule order, then by key', () => {
    const res = run({
      // N1 and N3 on the same date, same severity, no holds-up
      tasks: { w: { status: 'in_progress', end: '2026-03-02', fields: late(8) } },
      milestones: [{ id: 5, target: '2026-03-02' }],
      // two N4 on one date: key ascending
      openPayments: [
        payment({ invoiceId: 'b', dueDate: '2026-03-02' }),
        payment({ invoiceId: 'a', dueDate: '2026-03-02' }),
      ],
    });
    expect(keys(res.rows)).toEqual([
      'N1:work_item:w',
      'N3:milestone:5',
      'N4:invoice:a',
      'N4:invoice:b',
    ]);
  });

  it('tidyUp: date ascending, null last, rule order, key', () => {
    const res = run({
      drafts: [
        draft({ id: 'z', entryDate: '2026-03-01' }),
        draft({ id: 'a', entryDate: '2026-03-01' }),
      ],
      invoices: { i1: { date: '2026-03-01' }, i2: { date: '2026-02-01' } },
      notYetSplitByInvoice: { i1: 10000, i2: 10000 },
      tasks: { w: { status: 'in_progress', actualEnd: '2026-03-01' } },
    });
    expect(keys(res.tidyUp)).toEqual([
      'H2:invoice:i2',
      'H1:diary_entry:a',
      'H1:diary_entry:z',
      'H2:invoice:i1',
      'H4:work_item:w',
    ]);
  });

  it('standing: amount descending, then key', () => {
    const res = run({
      sources: [
        source({ id: 'b', name: 'Loan B', overAllocated: 100, allocated: 200, amount: 100 }),
        source({ id: 'a', name: 'Loan C', overAllocated: 100, allocated: 200, amount: 100 }),
        source({ id: 'c', name: 'Loan D', overAllocated: 900, allocated: 1000, amount: 100 }),
        source({ id: 'd', name: 'Loan E', overAllocated: 0 }),
      ],
    });
    expect(res.standing.map((s) => s.key)).toEqual([
      'S1:budget_source:c',
      'S1:budget_source:a',
      'S1:budget_source:b',
    ]);
  });
});

// ─── Standing (S1) ───────────────────────────────────────────────────────────

describe('S1 over-allocated (standing)', () => {
  it('is returned as a standing row, never as a needs-attention row, and is never counted', () => {
    const res = run({
      sources: [
        source({
          id: 'src-small',
          name: 'Loan B',
          amount: 100,
          allocated: 5000,
          overAllocated: 4900,
        }),
      ],
    });
    expect(res.rows).toEqual([]);
    expect(res.count).toBe(0);
    expect(res.standing).toEqual([
      {
        key: 'S1:budget_source:src-small',
        rule: 'S1',
        subject: { type: 'budget_source', id: 'src-small', label: 'Loan B', area: null },
        amount: 4900,
        params: { rule: 'S1', allocated: 5000, sourceAmount: 100 },
        link: { route: 'budgetSources', params: {}, query: {} },
      },
    ]);
  });

  it('a source that is not over-allocated has no standing row', () => {
    expect(run({ sources: [source({ overAllocated: 0 })] }).standing).toEqual([]);
  });

  it('standing rows cannot be snoozed', () => {
    const res = run({
      sources: [source({ id: 's', overAllocated: 5 })],
      snoozes: { 'S1:budget_source:s': '2026-03-17' },
    });
    expect(res.standing).toHaveLength(1);
    expect(res.snoozedCount).toBe(0);
  });
});

// ─── Critical line ───────────────────────────────────────────────────────────

describe('critical line', () => {
  const withEnd = (daysFromToday: number) => {
    const d = new Date(`${TODAY}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + daysFromToday);
    return d.toISOString().slice(0, 10);
  };
  const line = (days: number) =>
    run({
      tasks: {
        c1: {
          status: 'in_progress',
          title: 'Task B',
          area: AREA,
          fields: { projectedEndDate: withEnd(days) },
        },
      },
      critical: ['c1'],
    }).criticalLine;

  it.each([
    [15, 'on_track'],
    [14, 'warning'],
    [7, 'warning'],
    [6, 'critical'],
    [0, 'critical'],
    [-1, 'overdue'],
  ] as const)('daysLeft %i is level %s', (days, level) => {
    const l = line(days);
    expect(l?.daysLeft).toBe(days);
    expect(l?.level).toBe(level);
    expect(l?.mustEndBy).toBe(withEnd(days));
  });

  it('carries the task, its label, its area and the critical count', () => {
    expect(line(10)).toEqual({
      workItemId: 'c1',
      label: 'Task B',
      area: AREA,
      mustEndBy: '2026-03-20',
      daysLeft: 10,
      level: 'warning',
      criticalCount: 1,
    });
  });

  it('picks the earliest end among unfinished critical tasks, ties keep the first in stored order (as the card)', () => {
    const res = run({
      tasks: {
        z: { status: 'in_progress', fields: { projectedEndDate: '2026-03-20' } },
        m: { status: 'in_progress', fields: { projectedEndDate: '2026-03-20' } },
        late: { status: 'not_started', fields: { projectedEndDate: '2026-04-20' } },
        done: { status: 'completed', fields: { projectedEndDate: '2026-03-01' } },
      },
      critical: ['z', 'late', 'done', 'm'],
    });
    expect(res.criticalLine).toMatchObject({ workItemId: 'z', criticalCount: 4 });
  });

  it('the actual end date wins over the projected end date', () => {
    const res = run({
      tasks: {
        a: {
          status: 'in_progress',
          actualEnd: '2026-03-12',
          fields: { projectedEndDate: '2026-03-30' },
        },
        b: { status: 'in_progress', fields: { projectedEndDate: '2026-03-15' } },
      },
      critical: ['a', 'b'],
    });
    expect(res.criticalLine).toMatchObject({ workItemId: 'a', mustEndBy: '2026-03-12' });
  });

  it('is null with an empty critical path (a cycle), only completed tasks, or no end dates', () => {
    expect(
      run({ hasCycle: true, critical: [], tasks: { a: { status: 'in_progress' } } }).criticalLine,
    ).toBeNull();
    expect(
      run({ tasks: { a: { status: 'completed', end: '2026-03-20' } }, critical: ['a'] })
        .criticalLine,
    ).toBeNull();
    expect(
      run({ tasks: { a: { status: 'in_progress' } }, critical: ['a'] }).criticalLine,
    ).toBeNull();
  });

  it('skips critical ids that are not tasks and tasks without projection fields', () => {
    const input = build({
      tasks: { a: { status: 'in_progress', end: '2026-03-20' } },
      critical: ['ghost', 'a'],
    });
    input.projection.workItems.delete('a');
    expect(computeAttention(input).criticalLine).toBeNull();
  });
});

// ─── Facts, not blame (AC10) ─────────────────────────────────────────────────

function fullScenario(): ScenarioSpec {
  return {
    tasks: {
      a: { status: 'in_progress', end: '2026-03-01', company: 'Company A', fields: late(9) },
      b: { start: '2026-03-02', company: 'Company B', fields: late(8) },
      w: { status: 'in_progress', actualEnd: '2026-03-08' },
    },
    milestones: [{ id: 1, target: '2026-03-01' }],
    openPayments: [
      payment({ invoiceId: 'p4', dueDate: '2026-03-01' }),
      payment({ invoiceId: 'p5', dueDate: '2026-03-12' }),
      payment({ invoiceId: 'p6', dueDate: null, invoiceDate: '2026-01-01' }),
    ],
    invoices: {
      off: { status: 'quotation', dueDate: '2026-03-11' },
      p4: { amount: 100 },
    },
    notYetSplitByInvoice: { p4: 10000 },
    sources: [source({ readyToSubmit: { count: 1, amount: 50 }, overAllocated: 7 })],
    purchases: [purchase({ latestDeliveryDate: '2026-03-05', companyName: 'Company C' })],
    grants: [grant()],
    defects: [defect()],
    drafts: [draft()],
  };
}

describe('facts, not blame (AC10)', () => {
  const EXPECTED_KEYS: Record<string, string[]> = {
    N1: ['rule', 'plannedEndDate', 'projectedEndDate', 'daysLate', 'companyName'],
    N2: ['rule', 'kind', 'plannedStartDate', 'projectedStartDate', 'daysLate', 'companyName'],
    N3: ['rule', 'targetDate', 'projectedDate', 'daysAfterTarget', 'daysSinceTarget'],
    N4: [
      'rule',
      'recordKind',
      'paymentKind',
      'invoiceId',
      'invoiceNumber',
      'companyName',
      'invoiceDate',
      'dueDate',
      'dueInDays',
      'daysOpen',
    ],
    N8: ['rule', 'sourceType', 'count'],
    N9: ['rule', 'invoiceNumber', 'companyName', 'dueDate', 'dueInDays'],
    N10: [
      'rule',
      'status',
      'isLate',
      'dueInDays',
      'targetDeliveryDate',
      'earliestDeliveryDate',
      'latestDeliveryDate',
      'companyName',
    ],
    N11: ['rule', 'status', 'deadline', 'dueInDays'],
    N12: ['rule', 'resolutionStatus', 'severity', 'entryDate'],
    H1: ['rule', 'entryType', 'entryDate', 'updatedAt'],
    H2: ['rule', 'recordKind', 'invoiceNumber', 'companyName', 'invoiceAmount'],
    H4: ['rule', 'actualEndDate'],
  };

  it('every rule carries exactly its documented params keys', () => {
    const res = run(fullScenario());
    const seen = new Set<string>();
    for (const r of [...res.rows, ...res.tidyUp]) {
      const rule = r.rule === 'N5' || r.rule === 'N6' ? 'N4' : r.rule;
      seen.add(rule);
      expect(Object.keys(r.params).sort()).toEqual([...EXPECTED_KEYS[rule]!].sort());
    }
    expect([...seen].sort()).toEqual(Object.keys(EXPECTED_KEYS).sort());
  });

  it('the group params carry only the documented keys', () => {
    const tasks = Object.fromEntries(
      [1, 2, 3, 4].map((n) => [`g${n}`, { start: '2026-03-02', fields: late(8) }]),
    );
    const group = run({ tasks }).rows[0]!;
    expect(Object.keys(group.params).sort()).toEqual(['items', 'kind', 'plannedStartDate', 'rule']);
    if (group.params.rule === 'N2' && group.params.kind === 'group') {
      expect(Object.keys(group.params.items[0]!).sort()).toEqual([
        'area',
        'daysLate',
        'holdsUp',
        'id',
        'label',
      ]);
    }
  });

  it('no response field names a user or says who should act', () => {
    const json = JSON.stringify(run(fullScenario()));
    for (const forbidden of [
      'assignedUser',
      'assignedTo',
      'createdBy',
      'userId',
      'email',
      'owner',
      'responsible',
      'displayName',
      'role',
    ]) {
      expect(json).not.toContain(`"${forbidden}"`);
    }
  });

  it('the company appears only as the companyName attribute of the record', () => {
    const res = run(fullScenario());
    const n1 = rowOf(res, 'N1:work_item:a');
    expect(n1.params).toMatchObject({ companyName: 'Company A' });
    expect(Object.keys(n1.subject).sort()).toEqual(['area', 'id', 'label', 'type']);
  });
});
