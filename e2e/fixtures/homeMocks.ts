/**
 * Mock builders and the route installer for the Home page (#2230).
 *
 * Home reads aggregates that depend on the whole (shared) E2E database: `GET /api/attention`,
 * `GET /api/home/week|pulse|setup` and the diary list. Every Home assertion therefore runs against
 * invented data served through `page.route`. The installer keeps one mutable `HomeMockState`, so a
 * test changes the data between requests, and it answers the write side of the rows (Not now with
 * Undo, a task status change with Undo) the way the server does: the row leaves the next
 * `GET /api/attention` and comes back after the matching Undo.
 *
 * Synthetic data only.
 */

import type { Page, Route } from '@playwright/test';
import type {
  AreaSummary,
  AttentionAction,
  AttentionCriticalLine,
  AttentionGroupItem,
  AttentionLink,
  AttentionParams,
  AttentionResponse,
  AttentionRow,
  AttentionRule,
  AttentionSeverity,
  AttentionTier,
  HomeAgendaItem,
  HomePulseResponse,
  HomeSetupResponse,
  HomeWeekResponse,
} from '@cornerstone/shared';
import { mockDiaryList } from './systemEventMocks.js';

// ─────────────────────────────────────────────────────────────────────────────
// Dates (local, like the page itself)
// ─────────────────────────────────────────────────────────────────────────────

export function isoDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Today (local) plus `days` (negative = past), as `YYYY-MM-DD`. */
export function dayOffset(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

// ─────────────────────────────────────────────────────────────────────────────
// Builders
// ─────────────────────────────────────────────────────────────────────────────

export function mockArea(
  id: string,
  name: string,
  ancestors: Array<{ id: string; name: string }> = [],
): AreaSummary {
  return {
    id,
    name,
    color: null,
    ancestors: ancestors.map((ancestor) => ({ ...ancestor, color: null })),
  };
}

interface RowBase {
  id: string;
  title: string;
  area?: AreaSummary | null;
  holdsUp?: AttentionRow['holdsUp'];
  amount?: number | null;
}

function subject(type: AttentionRow['subject']['type'], base: RowBase): AttentionRow['subject'] {
  return { type, id: base.id, label: base.title, area: base.area ?? null };
}

function row(spec: {
  rule: AttentionRule;
  tier: AttentionTier;
  severity: AttentionSeverity;
  subjectType: AttentionRow['subject']['type'];
  base: RowBase;
  date: string | null;
  params: AttentionParams;
  actions: AttentionAction[];
  link: AttentionLink;
}): AttentionRow {
  return {
    key: `${spec.rule}:${spec.subjectType}:${spec.base.id}`,
    rule: spec.rule,
    tier: spec.tier,
    severity: spec.severity,
    subject: subject(spec.subjectType, spec.base),
    date: spec.date,
    amount: spec.base.amount ?? null,
    holdsUp: spec.base.holdsUp ?? null,
    params: spec.params,
    actions: spec.actions,
    link: spec.link,
    snoozedUntil: null,
  };
}

/** N1: an in-progress task past its planned end (actions Mark done, Reschedule). */
export function lateTaskRow(base: RowBase & { daysLate?: number }): AttentionRow {
  const daysLate = base.daysLate ?? 3;
  const plannedEndDate = dayOffset(-daysLate);
  return row({
    rule: 'N1',
    tier: 'late',
    severity: 'red',
    subjectType: 'work_item',
    base,
    date: plannedEndDate,
    params: {
      rule: 'N1',
      plannedEndDate,
      projectedEndDate: dayOffset(0),
      daysLate,
      companyName: null,
    },
    actions: ['mark_done', 'reschedule'],
    link: { route: 'workItem', params: { id: base.id }, query: {} },
  });
}

/** N2 (single task): a not-started task past its planned start (actions Start, Reschedule). */
export function lateStartRow(base: RowBase & { daysLate?: number }): AttentionRow {
  const daysLate = base.daysLate ?? 2;
  const plannedStartDate = dayOffset(-daysLate);
  return row({
    rule: 'N2',
    tier: 'late',
    severity: 'red',
    subjectType: 'work_item',
    base,
    date: plannedStartDate,
    params: {
      rule: 'N2',
      kind: 'task',
      plannedStartDate,
      projectedStartDate: null,
      daysLate,
      companyName: null,
    },
    actions: ['start', 'reschedule'],
    link: { route: 'workItem', params: { id: base.id }, query: {} },
  });
}

/** N2 (group): several not-started tasks that were due on the same day. */
export function lateStartGroupRow(
  date: string,
  items: Array<{ id: string; label: string; daysLate?: number }>,
): AttentionRow {
  const groupItems: AttentionGroupItem[] = items.map((item) => ({
    id: item.id,
    label: item.label,
    area: null,
    daysLate: item.daysLate ?? 2,
    holdsUp: { count: 0, startingWithin14Days: 0 },
  }));
  return {
    key: `N2:group:${date}`,
    rule: 'N2',
    tier: 'late',
    severity: 'red',
    subject: { type: 'group', id: date, label: null, area: null },
    date,
    amount: null,
    holdsUp: null,
    params: { rule: 'N2', kind: 'group', plannedStartDate: date, items: groupItems },
    actions: [],
    link: { route: 'workItems', params: {}, query: {} },
    snoozedUntil: null,
  };
}

/** N3: a milestone whose target has passed (actions Change target, Open). */
export function milestoneRow(base: RowBase): AttentionRow {
  const targetDate = dayOffset(-4);
  return row({
    rule: 'N3',
    tier: 'overdue',
    severity: 'amber',
    subjectType: 'milestone',
    base,
    date: targetDate,
    params: {
      rule: 'N3',
      targetDate,
      projectedDate: null,
      daysAfterTarget: null,
      daysSinceTarget: 4,
    },
    actions: ['change_target', 'open'],
    link: { route: 'milestone', params: { id: base.id }, query: {} },
  });
}

/** N4: an invoice past its due date (action Mark paid). */
export function overdueInvoiceRow(
  base: RowBase & { companyId?: string; companyName?: string; invoiceNumber?: string },
): AttentionRow {
  const dueDate = dayOffset(-5);
  return row({
    rule: 'N4',
    tier: 'overdue',
    severity: 'red',
    subjectType: 'invoice',
    base: { ...base, amount: base.amount ?? 1250 },
    date: dueDate,
    params: {
      rule: 'N4',
      recordKind: 'invoice',
      paymentKind: 'final',
      invoiceId: base.id,
      companyId: base.companyId ?? 'company-mock-01',
      invoiceNumber: base.invoiceNumber ?? base.title,
      companyName: base.companyName ?? 'Mock Plumbing Ltd',
      invoiceDate: dayOffset(-35),
      dueDate,
      dueInDays: -5,
      daysOpen: 35,
    },
    actions: ['mark_paid'],
    link: { route: 'invoice', params: { id: base.id }, query: {} },
  });
}

/** H1: an unfinished log, a Tidy up chore (actions Continue, Discard). */
export function unfinishedLogRow(base: RowBase): AttentionRow {
  const entryDate = dayOffset(-2);
  return row({
    rule: 'H1',
    tier: 'tidy',
    severity: 'none',
    subjectType: 'diary_entry',
    base,
    date: entryDate,
    params: { rule: 'H1', entryType: 'daily_log', entryDate, updatedAt: `${entryDate}T10:00:00Z` },
    actions: ['continue', 'discard'],
    link: { route: 'diaryEntryEdit', params: { id: base.id }, query: {} },
  });
}

/** H4: a finished task that is still In progress, a Tidy up chore (action Mark done). */
export function endedTaskRow(base: RowBase): AttentionRow {
  const actualEndDate = dayOffset(-6);
  return row({
    rule: 'H4',
    tier: 'tidy',
    severity: 'none',
    subjectType: 'work_item',
    base,
    date: actualEndDate,
    params: { rule: 'H4', actualEndDate },
    actions: ['mark_done'],
    link: { route: 'workItem', params: { id: base.id }, query: {} },
  });
}

export function criticalLine(partial: Partial<AttentionCriticalLine> = {}): AttentionCriticalLine {
  return {
    workItemId: 'critical-task-01',
    label: 'Roof Trusses',
    area: null,
    mustEndBy: dayOffset(5),
    daysLeft: 5,
    level: 'warning',
    criticalCount: 3,
    ...partial,
  };
}

export function attentionResponse(
  partial: Partial<AttentionResponse> & { rows?: AttentionRow[] } = {},
): AttentionResponse {
  const rows = partial.rows ?? [];
  const tidyUp = partial.tidyUp ?? [];
  const lateTasks = rows.filter((r) => r.rule === 'N1' || r.rule === 'N2');
  const lateCount = lateTasks.reduce(
    (sum, r) =>
      sum + (r.params.rule === 'N2' && r.params.kind === 'group' ? r.params.items.length : 1),
    0,
  );
  return {
    today: dayOffset(0),
    count: rows.length,
    snoozedCount: 0,
    rows,
    tidyUp,
    standing: [],
    criticalLine: null,
    catchUp: lateCount >= 3 ? { lateTaskCount: lateCount } : null,
    ...partial,
  };
}

export function agendaItem(
  spec: Partial<HomeAgendaItem> & Pick<HomeAgendaItem, 'kind' | 'date'> & { id: string },
): HomeAgendaItem {
  const { id, ...rest } = spec;
  const subjectType: HomeAgendaItem['subject']['type'] =
    spec.kind === 'milestone'
      ? 'milestone'
      : spec.kind === 'delivery'
        ? 'household_item'
        : spec.kind === 'payment'
          ? 'invoice'
          : 'work_item';
  const route: AttentionLink['route'] =
    subjectType === 'milestone'
      ? 'milestone'
      : subjectType === 'household_item'
        ? 'householdItem'
        : subjectType === 'invoice'
          ? 'invoice'
          : 'workItem';
  return {
    key: `${spec.kind}:${subjectType}:${id}`,
    subject: { type: subjectType, id, label: `Mock ${spec.kind} ${id}`, area: null },
    link: { route, params: { id }, query: {} },
    companyName: null,
    amount: null,
    recordKind: null,
    schedule: null,
    heldUpBy: null,
    ...rest,
  };
}

export function weekResponse(items: HomeAgendaItem[] = []): HomeWeekResponse {
  return { today: dayOffset(0), from: dayOffset(0), to: dayOffset(20), items };
}

export function pulseResponse(partial: Partial<HomePulseResponse> = {}): HomePulseResponse {
  return {
    leftToSpend: { expected: 12500, worst: 4000, best: 18000, verdict: 'on_budget' },
    stillToPay: 3400.5,
    stillToPayCount: 4,
    progress: { total: 20, done: 8, inProgress: 3 },
    ...partial,
  } as HomePulseResponse;
}

export const SETUP_STEPS_ADMIN = [
  'house',
  'areas',
  'funding',
  'companies',
  'tasks',
  'household',
  'backups',
  'firstLog',
] as const;

/** A setup response: `done` lists the finished step ids; `omit` drops steps (member session). */
export function setupResponse(
  done: readonly string[],
  omit: readonly string[] = [],
): HomeSetupResponse {
  const steps = SETUP_STEPS_ADMIN.filter((id) => !omit.includes(id)).map((id) => ({
    id,
    done: done.includes(id),
  }));
  const core = ['house', 'areas', 'funding', 'companies', 'tasks'];
  return {
    coreComplete: core.every((id) => done.includes(id)),
    steps,
  } as HomeSetupResponse;
}

export interface MockDiaryEntry {
  id: string;
  title: string;
  status?: 'saved' | 'draft';
  entryDate?: string;
  photoCount?: number;
  photoAreas?: AreaSummary[];
}

export function mockHomeDiaryEntry(entry: MockDiaryEntry): Record<string, unknown> {
  const entryDate = entry.entryDate ?? dayOffset(-1);
  const photoCount = entry.photoCount ?? 0;
  return {
    id: entry.id,
    entryType: 'daily_log',
    status: entry.status ?? 'saved',
    entryDate,
    title: entry.title,
    body: 'Synthetic note body.',
    metadata: null,
    isAutomatic: false,
    isSigned: false,
    sourceEntityType: null,
    sourceEntityId: null,
    sourceEntityArea: null,
    sourceEntityTitle: null,
    photoCount,
    thumbnails: [],
    photoAreas: entry.photoAreas ?? [],
    createdBy: null,
    createdAt: `${entryDate}T09:00:00.000Z`,
    updatedAt: `${entryDate}T09:00:00.000Z`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The installer
// ─────────────────────────────────────────────────────────────────────────────

export interface HomeMockState {
  attention: AttentionResponse;
  week: HomeWeekResponse;
  pulse: HomePulseResponse;
  setup: HomeSetupResponse;
  /** Diary entries behind the list endpoint, newest first (drafts included). */
  diary: Array<Record<string, unknown>>;
  houseName: string | null;
  /** The endpoint answers 500 while its flag is set. */
  fail: { attention: boolean; week: boolean; pulse: boolean; setup: boolean };
  /** Requests the mocks saw, for assertions. */
  calls: {
    notNow: string[];
    /** The raw (still encoded) path segment of each Undo of "Not now". */
    undoNotNowPaths: string[];
    workItemPatches: Array<{ id: string; body: Record<string, unknown> }>;
    undone: string[];
    diaryQueries: string[];
    attention: string[];
    pulse: number;
    week: number;
    setup: number;
  };
}

export function newHomeMockState(partial: Partial<HomeMockState> = {}): HomeMockState {
  return {
    attention: attentionResponse(),
    week: weekResponse(),
    pulse: pulseResponse(),
    setup: setupResponse(['house', 'areas', 'funding', 'companies', 'tasks']),
    diary: [],
    houseName: 'Mock House',
    fail: { attention: false, week: false, pulse: false, setup: false },
    calls: {
      notNow: [],
      undoNotNowPaths: [],
      workItemPatches: [],
      undone: [],
      diaryQueries: [],
      attention: [],
      pulse: 0,
      week: 0,
      setup: 0,
    },
    ...partial,
  };
}

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function serverError(route: Route): Promise<void> {
  return json(route, { error: { code: 'INTERNAL_ERROR', message: 'Mock failure' } }, 500);
}

/** Late tasks the catch-up line counts: N1, single N2 tasks and the members of N2 groups. */
function lateTaskCount(attention: AttentionResponse): number {
  return attention.rows.reduce((sum, r) => {
    if (r.rule === 'N1') return sum + 1;
    if (r.rule !== 'N2') return sum;
    return sum + (r.params.rule === 'N2' && r.params.kind === 'group' ? r.params.items.length : 1);
  }, 0);
}

function syncCatchUp(attention: AttentionResponse): void {
  const count = lateTaskCount(attention);
  attention.catchUp = count >= 3 ? { lateTaskCount: count } : null;
}

/**
 * Serve Home's data from `state`. Register before the first navigation. "Not now" takes the row
 * out of the next `GET /api/attention` (and counts it as hidden) until its Undo; a task status
 * change (`PATCH /api/work-items/:id`) takes the task out of every row and group until the Undo
 * token is used. The catch-up count follows.
 */
export async function installHomeMocks(page: Page, state: HomeMockState): Promise<void> {
  const hiddenRows = new Map<string, { row: AttentionRow; from: 'rows' | 'tidyUp' }>();
  const snapshots = new Map<string, AttentionResponse>();

  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const path = url.pathname;

      if (method === 'GET' && path === '/api/attention') {
        state.calls.attention.push(url.search);
        if (state.fail.attention) return serverError(route);
        return json(route, state.attention);
      }
      if (method === 'POST' && path === '/api/attention/not-now') {
        const { key } = request.postDataJSON() as { key: string };
        state.calls.notNow.push(key);
        const attention = state.attention;
        for (const from of ['rows', 'tidyUp'] as const) {
          const index = attention[from].findIndex((r) => r.key === key);
          if (index < 0) continue;
          const [gone] = attention[from].splice(index, 1);
          if (gone) hiddenRows.set(key, { row: gone, from });
          if (from === 'rows') attention.count -= 1;
          attention.snoozedCount += 1;
          syncCatchUp(attention);
          break;
        }
        return json(route, { key, snoozedUntil: dayOffset(7) });
      }
      if (method === 'DELETE' && path.startsWith('/api/attention/not-now/')) {
        const encoded = path.slice('/api/attention/not-now/'.length);
        state.calls.undoNotNowPaths.push(encoded);
        const key = decodeURIComponent(encoded);
        const entry = hiddenRows.get(key);
        if (entry) {
          hiddenRows.delete(key);
          const attention = state.attention;
          attention[entry.from].unshift(entry.row);
          if (entry.from === 'rows') attention.count += 1;
          attention.snoozedCount = Math.max(0, attention.snoozedCount - 1);
          syncCatchUp(attention);
        }
        return route.fulfill({ status: 204 });
      }
      if (method === 'GET' && path === '/api/home/week') {
        state.calls.week += 1;
        if (state.fail.week) return serverError(route);
        return json(route, state.week);
      }
      if (method === 'GET' && path === '/api/home/pulse') {
        state.calls.pulse += 1;
        if (state.fail.pulse) return serverError(route);
        return json(route, state.pulse);
      }
      if (method === 'GET' && path === '/api/home/setup') {
        state.calls.setup += 1;
        if (state.fail.setup) return serverError(route);
        return json(route, state.setup);
      }
      if (method === 'GET' && path === '/api/diary-entries') {
        state.calls.diaryQueries.push(url.search);
        const status = url.searchParams.get('status');
        const pageSize = Number(url.searchParams.get('pageSize') ?? '25');
        const automatic = url.searchParams.get('automatic');
        const items = state.diary
          .filter((entry) => (status ? entry.status === status : true))
          .filter((entry) => (automatic === 'false' ? entry.isAutomatic === false : true))
          .slice(0, pageSize);
        return json(route, mockDiaryList(items));
      }
      if (method === 'GET' && path === '/api/settings' && state.houseName !== null) {
        return json(route, {
          settings: {
            householdName: state.houseName,
            householdAddress: null,
            entriesLanguage: 'en',
          },
        });
      }
      const workItemMatch = /^\/api\/work-items\/([^/]+)$/.exec(path);
      if (method === 'PATCH' && workItemMatch?.[1]) {
        const id = decodeURIComponent(workItemMatch[1]);
        const body = request.postDataJSON() as Record<string, unknown>;
        state.calls.workItemPatches.push({ id, body });
        const token = `mock-undo-${state.calls.workItemPatches.length}`;
        snapshots.set(token, structuredClone(state.attention));
        const attention = state.attention;
        attention.rows = attention.rows.filter((r) => r.subject.id !== id);
        attention.tidyUp = attention.tidyUp.filter((r) => r.subject.id !== id);
        for (const r of attention.rows) {
          if (r.params.rule === 'N2' && r.params.kind === 'group') {
            r.params.items = r.params.items.filter((item) => item.id !== id);
          }
        }
        attention.rows = attention.rows.filter(
          (r) =>
            !(r.params.rule === 'N2' && r.params.kind === 'group' && r.params.items.length === 0),
        );
        attention.count = attention.rows.length;
        syncCatchUp(attention);
        return json(route, {
          id,
          title: 'Mock task',
          status: body.status ?? 'completed',
          undo: { token, expiresAt: new Date(Date.now() + 60_000).toISOString() },
        });
      }
      const undoMatch = /^\/api\/undo\/([^/]+)$/.exec(path);
      if (method === 'POST' && undoMatch?.[1]) {
        const token = decodeURIComponent(undoMatch[1]);
        state.calls.undone.push(token);
        const snapshot = snapshots.get(token);
        if (snapshot) state.attention = snapshot;
        return json(route, { restored: [], retractedEventIds: [] });
      }
      return route.fallback();
    },
  );
}
