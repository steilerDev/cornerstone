/**
 * Home service (#2230, contract 24): week agenda, pulse and set-up steps on real in-memory SQLite
 * with migrations, the real scheduling engine and the real money service. T = 2026-03-10, `now`
 * injected. All data is synthetic.
 *
 * Mutations these tests catch:
 *  - a window off by one (T-1 or T+21 shown; T or T+20 missing), for every item kind;
 *  - completed tasks / settled payments / arrived purchases / reached milestones listed;
 *  - a task's start or end shown when it has already started or ended for real;
 *  - the same subject listed twice, or a subject key that differs from the attention row's;
 *  - heldUpBy naming the wrong predecessor, or set on a task that is not held up;
 *  - the delivery date not falling back latest -> earliest -> target;
 *  - the sort order (date, kind, label, id) or label comparison not locale-aware;
 *  - "today" taken from the local clock instead of the UTC instant;
 *  - pulse figures recomputed instead of taken verbatim from the money service, or progress
 *    counted on a different query than the Tasks list;
 *  - admin-only set-up steps shown to members, a backup check failure reported as "not done",
 *    the backup path leaking into the log, a zero-amount source counted as funding.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import {
  HOME_AGENDA_DAYS,
  HOME_AGENDA_KINDS,
  HOME_SETUP_STEPS,
  type AttentionRow,
  type HomeAgendaItem,
} from '@cornerstone/shared';
import {
  FIXTURE_NOW,
  FIXTURE_TODAY,
  FIXTURE_USER,
  seedAttentionFixture,
  type FixtureDb,
} from '../test/attentionFixture.js';
import { getAttention } from './attentionService.js';
import { updateHouseholdSettings } from './appSettingsService.js';
import { computeProjectMoney } from './moneyService.js';
import { loadScheduleGraph, projectSchedule } from './schedulingEngine.js';
import { listWorkItems } from './workItemService.js';
import { addDaysUtc } from './shared/holdsUp.js';
import { getHomePulse, getHomeSetup, getHomeWeek } from './homeService.js';

const T = '2026-03-10';
const NOW = new Date('2026-03-10T09:00:00.000Z');
const VAT = 0.19;
const STAMP = '2026-03-01T00:00:00.000Z';
const ts = { createdAt: STAMP, updatedAt: STAMP };
const at = (offset: number): string => addDaysUtc(T, offset);

describe('homeService', () => {
  let sqlite: Database.Database;
  let db: FixtureDb;
  let tempDir: string;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-home-'));
  });

  afterEach(() => {
    jest.useRealTimers();
    sqlite.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ─── Builders ──────────────────────────────────────────────────────────────

  function task(id: string, o: Partial<typeof schema.workItems.$inferInsert> = {}): void {
    db.insert(schema.workItems)
      .values({ id, title: `Task ${id}`, status: 'not_started', ...ts, ...o })
      .run();
  }

  function dependency(predecessorId: string, successorId: string): void {
    db.insert(schema.workItemDependencies)
      .values({ predecessorId, successorId, dependencyType: 'finish_to_start', leadLagDays: 0 })
      .run();
  }

  function company(id: string, name = `Company ${id}`): void {
    db.insert(schema.vendors)
      .values({ id, name, ...ts })
      .run();
  }

  function invoice(
    id: string,
    status: 'quotation' | 'pending' | 'paid' | 'claimed',
    o: Partial<typeof schema.invoices.$inferInsert> = {},
  ): void {
    db.insert(schema.invoices)
      .values({
        id,
        vendorId: 'v-a',
        invoiceNumber: `NR-${id}`,
        amount: 1000,
        status,
        date: '2026-03-01',
        ...ts,
        ...o,
      })
      .run();
  }

  function deposit(
    id: string,
    invoiceId: string,
    dueDate: string,
    o: Partial<typeof schema.invoiceDeposits.$inferInsert> = {},
  ): void {
    db.insert(schema.invoiceDeposits)
      .values({
        id,
        invoiceId,
        amount: 300,
        status: 'pending',
        entryType: 'deposit',
        dueDate,
        ...ts,
        ...o,
      })
      .run();
  }

  function purchase(id: string, o: Partial<typeof schema.householdItems.$inferInsert> = {}): void {
    db.insert(schema.householdItems)
      .values({
        id,
        name: `Purchase ${id}`,
        categoryId: 'hic-furniture',
        status: 'planned',
        ...ts,
        ...o,
      })
      .run();
  }

  function milestone(
    id: number,
    targetDate: string,
    o: Partial<typeof schema.milestones.$inferInsert> = {},
  ): void {
    db.insert(schema.milestones)
      .values({ id, title: `Milestone ${id}`, targetDate, ...ts, ...o })
      .run();
  }

  const week = (now: Date = NOW) => getHomeWeek(db, { now });
  const keys = (items: HomeAgendaItem[]): string[] => items.map((i) => i.key);
  const keysOf = (kind: string): string[] =>
    keys(week().items.filter((i) => i.kind === kind)).sort();

  // ─── getHomeWeek: window ───────────────────────────────────────────────────

  describe('getHomeWeek window', () => {
    it('covers today through today + 20 and reports the three dates', () => {
      const res = week();
      expect(HOME_AGENDA_DAYS).toBe(21);
      expect(res).toEqual({ today: T, from: T, to: '2026-03-30', items: [] });
    });

    it('takes today from the UTC instant, not the local clock (late evening UTC)', () => {
      expect(week(new Date('2026-03-10T23:59:59.999Z')).today).toBe('2026-03-10');
      expect(week(new Date('2026-03-11T00:00:00.000Z')).today).toBe('2026-03-11');
    });

    it('defaults to the current instant when no clock is injected', () => {
      jest.useFakeTimers({ now: new Date('2026-07-01T12:00:00.000Z') });
      const res = getHomeWeek(db);
      expect(res).toMatchObject({ today: '2026-07-01', from: '2026-07-01', to: '2026-07-21' });
    });

    it('starts: today and T+20 in; T+21 out; an undated start never shows by itself', () => {
      task('s0', { startDate: at(0), endDate: at(25) });
      task('s20', { startDate: at(20), endDate: at(25) });
      task('s21', { startDate: at(21), endDate: at(25) });
      expect(keysOf('starts')).toEqual(['starts:work_item:s0', 'starts:work_item:s20']);
      const items = week().items.filter((i) => i.kind === 'starts');
      expect(items.map((i) => [i.subject.id, i.date])).toEqual([
        ['s0', at(0)],
        ['s20', at(20)],
      ]);
    });

    it('starts: a task whose planned start has passed is shown starting today, flagged late', () => {
      task('past', { startDate: at(-1), endDate: at(5) });
      const [item] = week().items.filter((i) => i.kind === 'starts');
      expect(item).toMatchObject({
        key: 'starts:work_item:past',
        date: T,
        schedule: { isLate: true, lateDays: 1, isHeldUp: false },
      });
    });

    it('starts: only not_started tasks start; in_progress ones do not', () => {
      task('running', { status: 'in_progress', startDate: at(0), endDate: at(25) });
      expect(keysOf('starts')).toEqual([]);
    });

    it('starts: uses the actual start over the forecast (none for a not_started task)', () => {
      task('begun', { status: 'in_progress', startDate: at(5), actualStartDate: at(5) });
      expect(keysOf('starts')).toEqual([]);
    });

    it('ends: today and T+20 in; T+21 out', () => {
      task('e0', { status: 'in_progress', startDate: at(-5), endDate: at(0) });
      task('e20', { status: 'in_progress', startDate: at(-5), endDate: at(20) });
      task('e21', { status: 'in_progress', startDate: at(-5), endDate: at(21) });
      expect(keysOf('ends')).toEqual(['ends:work_item:e0', 'ends:work_item:e20']);
    });

    it('ends: a task that has really ended (actual end date) is not listed', () => {
      task('done-ish', {
        status: 'in_progress',
        startDate: at(-5),
        endDate: at(3),
        actualEndDate: at(-1),
      });
      expect(keysOf('ends')).toEqual([]);
    });

    it('ends: an overdue task is listed on today with its late days', () => {
      task('overdue', { status: 'in_progress', startDate: at(-9), endDate: at(-2) });
      const [item] = week().items.filter((i) => i.kind === 'ends');
      expect(item).toMatchObject({
        key: 'ends:work_item:overdue',
        date: T,
        schedule: { isLate: true, lateDays: 2 },
      });
    });

    it('completed tasks are never listed, even with dates in the window', () => {
      task('fin', {
        status: 'completed',
        startDate: at(1),
        endDate: at(4),
        actualStartDate: at(-3),
        actualEndDate: at(-1),
      });
      expect(week().items).toEqual([]);
    });

    it('a not_started task starting and ending in the window gives two distinct items', () => {
      task('both', { startDate: at(2), endDate: at(6) });
      const items = week().items;
      expect(items.map((i) => [i.key, i.kind, i.date])).toEqual([
        ['starts:work_item:both', 'starts', at(2)],
        ['ends:work_item:both', 'ends', at(6)],
      ]);
    });

    it('payments: due today and T+20 in; T-1, T+21 and undated out', () => {
      company('v-a');
      invoice('p-1', 'pending', { dueDate: at(-1) });
      invoice('p0', 'pending', { dueDate: at(0) });
      invoice('p20', 'pending', { dueDate: at(20) });
      invoice('p21', 'pending', { dueDate: at(21) });
      invoice('pnull', 'pending', { dueDate: null });
      expect(keysOf('payment')).toEqual(['payment:invoice:p0', 'payment:invoice:p20']);
    });

    it('payments: paid, claimed and fully paid-off invoices are not listed', () => {
      company('v-a');
      invoice('paid', 'paid', { dueDate: at(3) });
      invoice('claimed', 'claimed', { dueDate: at(3) });
      invoice('open', 'pending', { dueDate: at(3) });
      expect(keysOf('payment')).toEqual(['payment:invoice:open']);
    });

    it('payments: a progress payment is keyed on its deposit, with its own due date, and a refund is not a payment', () => {
      company('v-a');
      invoice('inv-p', 'pending', { amount: 2000, dueDate: at(30) });
      deposit('dep-in', 'inv-p', at(5));
      deposit('dep-out', 'inv-p', at(21));
      deposit('dep-past', 'inv-p', at(-2));
      deposit('dep-refund', 'inv-p', at(4), { entryType: 'refund' });
      deposit('dep-paid', 'inv-p', at(6), { status: 'paid' });
      const payments = week().items.filter((i) => i.kind === 'payment');
      expect(payments.map((i) => [i.key, i.date, i.amount])).toEqual([
        ['payment:progress_payment:dep-in', at(5), 300],
      ]);
      expect(payments[0]!.subject).toEqual({
        type: 'progress_payment',
        id: 'dep-in',
        label: 'NR-inv-p',
        area: null,
      });
    });

    it('payments: an offer lists only its pending progress payments, as offers', () => {
      company('v-a');
      invoice('off', 'quotation', { amount: 5000, dueDate: at(2) });
      deposit('dep-off', 'off', at(7));
      const payments = week().items.filter((i) => i.kind === 'payment');
      expect(payments.map((i) => [i.key, i.recordKind])).toEqual([
        ['payment:progress_payment:dep-off', 'offer'],
      ]);
    });

    it('payments: carry amount, record kind and company name; other kinds carry none', () => {
      company('v-a', 'Company A');
      invoice('inv-1', 'pending', { amount: 1234.56, dueDate: at(1) });
      const [item] = week().items;
      expect(item).toMatchObject({
        key: 'payment:invoice:inv-1',
        kind: 'payment',
        amount: 1234.56,
        recordKind: 'invoice',
        companyName: 'Company A',
        schedule: null,
        heldUpBy: null,
        subject: { type: 'invoice', id: 'inv-1', label: 'NR-inv-1', area: null },
        link: { route: 'invoice', params: { id: 'inv-1' }, query: {} },
      });
    });

    it('deliveries: target today and T+20 in; T-1 and T+21 out', () => {
      purchase('d-1', { targetDeliveryDate: at(-1) });
      purchase('d0', { targetDeliveryDate: at(0) });
      purchase('d20', { targetDeliveryDate: at(20) });
      purchase('d21', { targetDeliveryDate: at(21) });
      purchase('dnone');
      expect(keysOf('delivery')).toEqual([
        'delivery:household_item:d0',
        'delivery:household_item:d20',
      ]);
    });

    it('deliveries: the date is latest, else earliest, else target', () => {
      purchase('latest', {
        targetDeliveryDate: at(2),
        earliestDeliveryDate: at(4),
        latestDeliveryDate: at(6),
      });
      purchase('earliest', { targetDeliveryDate: at(2), earliestDeliveryDate: at(4) });
      purchase('target', { targetDeliveryDate: at(2) });
      const byId = new Map(
        week()
          .items.filter((i) => i.kind === 'delivery')
          .map((i) => [i.subject.id, i.date]),
      );
      expect(byId.get('latest')).toBe(at(6));
      expect(byId.get('earliest')).toBe(at(4));
      expect(byId.get('target')).toBe(at(2));
    });

    it('deliveries: the fallback date decides the window, not the target', () => {
      purchase('late-out', { targetDeliveryDate: at(3), latestDeliveryDate: at(22) });
      purchase('early-in', { targetDeliveryDate: at(40), earliestDeliveryDate: at(8) });
      expect(keysOf('delivery')).toEqual(['delivery:household_item:early-in']);
    });

    it('deliveries: arrived purchases and ones with an actual delivery date are not listed', () => {
      purchase('arrived', { status: 'arrived', targetDeliveryDate: at(2) });
      purchase('delivered', {
        status: 'purchased',
        targetDeliveryDate: at(2),
        actualDeliveryDate: at(-1),
      });
      purchase('bought', { status: 'purchased', targetDeliveryDate: at(2) });
      expect(keysOf('delivery')).toEqual(['delivery:household_item:bought']);
    });

    it('deliveries: carry the company name and the area summary', () => {
      company('v-a', 'Company A');
      db.insert(schema.areas)
        .values({ id: 'a-1', name: 'Building', parentId: null, sortOrder: 0, ...ts })
        .run();
      db.insert(schema.areas)
        .values({ id: 'a-2', name: 'Ground floor', parentId: 'a-1', sortOrder: 0, ...ts })
        .run();
      purchase('hi', { targetDeliveryDate: at(2), vendorId: 'v-a', areaId: 'a-2' });
      const [item] = week().items;
      expect(item).toMatchObject({
        kind: 'delivery',
        companyName: 'Company A',
        link: { route: 'householdItem', params: { id: 'hi' } },
        subject: {
          type: 'household_item',
          id: 'hi',
          label: 'Purchase hi',
          area: {
            id: 'a-2',
            name: 'Ground floor',
            color: null,
            ancestors: [{ id: 'a-1', name: 'Building', color: null }],
          },
        },
      });
    });

    it('milestones: target today and T+20 in; T-1 and T+21 out', () => {
      milestone(1, at(-1));
      milestone(2, at(0));
      milestone(3, at(20));
      milestone(4, at(21));
      expect(keysOf('milestone')).toEqual(['milestone:milestone:2', 'milestone:milestone:3']);
    });

    it('milestones: reached ones (flag or completion time) are not listed', () => {
      milestone(1, at(3), { isCompleted: true });
      milestone(2, at(3), { completedAt: '2026-03-09T10:00:00.000Z' });
      milestone(3, at(3));
      expect(keysOf('milestone')).toEqual(['milestone:milestone:3']);
    });

    it('milestones: subject id is the numeric id as text, and the link is the milestone page', () => {
      milestone(7, at(3));
      const [item] = week().items;
      expect(item).toMatchObject({
        subject: { type: 'milestone', id: '7', label: 'Milestone 7', area: null },
        link: { route: 'milestone', params: { id: '7' } },
        companyName: null,
        amount: null,
        recordKind: null,
        schedule: null,
        heldUpBy: null,
      });
    });
  });

  // ─── getHomeWeek: tasks ────────────────────────────────────────────────────

  describe('getHomeWeek tasks', () => {
    it('carries the company, the area and a link to the task', () => {
      company('v-a', 'Company A');
      db.insert(schema.areas)
        .values({ id: 'a-1', name: 'Building', parentId: null, sortOrder: 0, ...ts })
        .run();
      task('wi', {
        title: 'Task A',
        startDate: at(1),
        endDate: at(3),
        assignedVendorId: 'v-a',
        areaId: 'a-1',
      });
      const starts = week().items.find((i) => i.kind === 'starts')!;
      expect(starts).toMatchObject({
        companyName: 'Company A',
        amount: null,
        recordKind: null,
        subject: {
          type: 'work_item',
          id: 'wi',
          label: 'Task A',
          area: { id: 'a-1', name: 'Building', color: null, ancestors: [] },
        },
        link: { route: 'workItem', params: { id: 'wi' } },
        heldUpBy: null,
      });
    });

    it('leaves the area null when the task has none or its area no longer exists', () => {
      task('none', { startDate: at(1), endDate: at(2) });
      expect(week().items.every((i) => i.subject.area === null)).toBe(true);
    });

    it('shares one area summary object between tasks of the same area (computed once)', () => {
      db.insert(schema.areas)
        .values({ id: 'a-1', name: 'Building', parentId: null, sortOrder: 0, ...ts })
        .run();
      task('t1', { startDate: at(1), endDate: at(2), areaId: 'a-1' });
      task('t2', { startDate: at(1), endDate: at(2), areaId: 'a-1' });
      const areas = week()
        .items.filter((i) => i.kind === 'starts')
        .map((i) => i.subject.area);
      expect(areas).toHaveLength(2);
      expect(areas[0]).toBe(areas[1]);
    });

    it('flags the critical path from the projection', () => {
      task('a', { startDate: at(1), endDate: at(4) });
      task('b', { startDate: at(5), endDate: at(9) });
      dependency('a', 'b');
      task('side', { startDate: at(1), endDate: at(2) });
      const critical = new Set(projectSchedule(loadScheduleGraph(db), T).criticalPath);
      expect(critical.size).toBeGreaterThan(0);
      for (const item of week().items) {
        if (item.schedule) {
          expect([item.subject.id, item.schedule.isCritical]).toEqual([
            item.subject.id,
            critical.has(item.subject.id),
          ]);
        }
      }
      expect(week().items.some((i) => i.schedule?.isCritical === true)).toBe(true);
      expect(week().items.some((i) => i.schedule?.isCritical === false)).toBe(true);
    });

    it('names the late predecessor that holds a task up, with its title', () => {
      task('pred', {
        title: 'Task A',
        status: 'in_progress',
        startDate: at(-10),
        endDate: at(-2),
      });
      task('succ', { title: 'Task B', startDate: at(-1), endDate: at(4) });
      dependency('pred', 'succ');
      const items = week().items.filter((i) => i.subject.id === 'succ');
      expect(items.map((i) => i.kind)).toEqual(['starts', 'ends']);
      for (const item of items) {
        expect(item.schedule).toMatchObject({ isHeldUp: true });
        expect(item.heldUpBy).toEqual({ id: 'pred', label: 'Task A' });
      }
      const pred = week().items.find((i) => i.subject.id === 'pred')!;
      expect(pred.schedule).toMatchObject({ isLate: true, isHeldUp: false });
      expect(pred.heldUpBy).toBeNull();
    });

    it('names the contributor of an unreached milestone gate the task waits for', () => {
      task('contrib', {
        title: 'Task C',
        status: 'in_progress',
        startDate: at(-10),
        endDate: at(-2),
      });
      task('waits', { title: 'Task W', startDate: at(-1), endDate: at(4) });
      milestone(1, at(30));
      db.insert(schema.milestoneWorkItems).values({ milestoneId: 1, workItemId: 'contrib' }).run();
      db.insert(schema.workItemMilestoneDeps).values({ workItemId: 'waits', milestoneId: 1 }).run();
      const starts = week().items.find((i) => i.key === 'starts:work_item:waits')!;
      expect(starts.heldUpBy).toEqual({ id: 'contrib', label: 'Task C' });
    });

    it('a held-up task has no cause to name when its gate has no contributors', () => {
      task('waits', { startDate: at(3), endDate: at(6) });
      milestone(1, at(-5));
      db.insert(schema.workItemMilestoneDeps).values({ workItemId: 'waits', milestoneId: 1 }).run();
      const starts = week().items.find((i) => i.key === 'starts:work_item:waits')!;
      expect(starts.schedule?.isHeldUp).toBe(true);
      expect(starts.heldUpBy).toBeNull();
    });

    it('does not set heldUpBy on a task that is not held up, even with a predecessor', () => {
      task('pred', { startDate: at(1), endDate: at(2) });
      task('succ', { startDate: at(3), endDate: at(5) });
      dependency('pred', 'succ');
      const succ = week().items.filter((i) => i.subject.id === 'succ');
      expect(succ).toHaveLength(2);
      expect(succ.every((i) => i.schedule?.isHeldUp === false && i.heldUpBy === null)).toBe(true);
    });

    it('does not list a task with no stored dates as starting or ending', () => {
      task('undated');
      expect(week().items.filter((i) => i.subject.id === 'undated')).toEqual([]);
    });

    it('a task with only a stored end date shows only its end', () => {
      task('end-only', { endDate: at(4) });
      const items = week().items.filter((i) => i.subject.id === 'end-only');
      expect(items.map((i) => [i.kind, i.date])).toEqual([['ends', at(4)]]);
    });

    it('a task with only a stored start date shows only its start', () => {
      task('start-only', { startDate: at(4) });
      const items = week().items.filter((i) => i.subject.id === 'start-only');
      expect(items.map((i) => [i.kind, i.date])).toEqual([['starts', at(4)]]);
    });
  });

  // ─── getHomeWeek: order and uniqueness ─────────────────────────────────────

  describe('getHomeWeek order', () => {
    it('sorts by date, then kind (starts, ends, payment, delivery, milestone), then label', () => {
      company('v-a');
      milestone(1, at(2));
      purchase('d', { name: 'Purchase D', targetDeliveryDate: at(2) });
      invoice('i', 'pending', { dueDate: at(2), invoiceNumber: 'NR-I' });
      task('e', { title: 'Task E', status: 'in_progress', startDate: at(-3), endDate: at(2) });
      task('s', { title: 'Task S', startDate: at(2), endDate: at(25) });
      task('early', { title: 'Task Early', startDate: at(1), endDate: at(25) });
      task('late', {
        title: 'Task Late',
        status: 'in_progress',
        startDate: at(-3),
        endDate: at(9),
      });
      expect(HOME_AGENDA_KINDS).toEqual(['starts', 'ends', 'payment', 'delivery', 'milestone']);
      expect(keys(week().items)).toEqual([
        'starts:work_item:early',
        'starts:work_item:s',
        'ends:work_item:e',
        'payment:invoice:i',
        'delivery:household_item:d',
        'milestone:milestone:1',
        'ends:work_item:late',
      ]);
    });

    it('sorts equal kinds by label case-insensitively', () => {
      milestone(1, at(2), { title: 'banana' });
      milestone(2, at(2), { title: 'Cherry' });
      milestone(3, at(2), { title: 'Apple' });
      expect(week().items.map((i) => i.subject.label)).toEqual(['Apple', 'banana', 'Cherry']);
    });

    it('sorts labels the way a German reader expects: an umlaut sorts with its base letter', () => {
      milestone(1, at(2), { title: 'Zaun' });
      milestone(2, at(2), { title: 'Ärger' });
      milestone(3, at(2), { title: 'Bad' });
      expect(week().items.map((i) => i.subject.label)).toEqual(['Ärger', 'Bad', 'Zaun']);
    });

    it('breaks a label tie by subject id', () => {
      milestone(11, at(2), { title: 'Same' });
      milestone(2, at(2), { title: 'Same' });
      // ids compare as text, like every other surface that keys on the subject id
      expect(keys(week().items)).toEqual(['milestone:milestone:11', 'milestone:milestone:2']);
    });

    it('breaks a label tie by subject id whichever record was saved first', () => {
      purchase('p-a', { name: 'Same', targetDeliveryDate: at(5) });
      purchase('p-b', { name: 'Same', targetDeliveryDate: at(5) });
      expect(keys(week().items)).toEqual([
        'delivery:household_item:p-a',
        'delivery:household_item:p-b',
      ]);
    });

    it('gives the same order whatever the insertion order (labels, ids, dates and kinds)', () => {
      purchase('p-b', { name: 'Same', targetDeliveryDate: at(5) });
      purchase('p-a', { name: 'Same', targetDeliveryDate: at(5) });
      milestone(3, at(4), { title: 'Zed' });
      milestone(4, at(4), { title: 'Alpha' });
      purchase('d', { name: 'Purchase D', targetDeliveryDate: at(4) });
      task('s', { title: 'Task S', startDate: at(4), endDate: at(25) });
      expect(keys(week().items)).toEqual([
        'starts:work_item:s',
        'delivery:household_item:d',
        'milestone:milestone:4',
        'milestone:milestone:3',
        'delivery:household_item:p-a',
        'delivery:household_item:p-b',
      ]);
    });

    it('keeps an item whose area row is gone, with no area', () => {
      sqlite.pragma('foreign_keys = OFF');
      task('orphan', { startDate: at(1), endDate: at(2), areaId: 'a-gone' });
      sqlite.pragma('foreign_keys = ON');
      const starts = week().items.find((i) => i.key === 'starts:work_item:orphan')!;
      expect(starts.subject.area).toBeNull();
    });

    it('lists every key once on a fixture with every kind', () => {
      seedAttentionFixture(db);
      const res = getHomeWeek(db, { now: new Date(FIXTURE_NOW) });
      const all = keys(res.items);
      expect(all.length).toBeGreaterThan(20);
      expect(new Set(all).size).toBe(all.length);
      for (const item of res.items) {
        expect(item.key).toBe(`${item.kind}:${item.subject.type}:${item.subject.id}`);
        expect(item.date >= res.from && item.date <= res.to).toBe(true);
      }
      const dates = res.items.map((i) => i.date);
      expect(dates).toEqual([...dates].sort());
    });
  });

  // ─── getHomeWeek: agreement with attention ─────────────────────────────────

  describe('getHomeWeek on the attention fixture', () => {
    function attentionRows(): AttentionRow[] {
      const res = getAttention(db, {
        userId: FIXTURE_USER.id,
        vatRate: VAT,
        includeSnoozed: false,
        now: new Date(FIXTURE_NOW),
      });
      return [...res.rows, ...res.tidyUp];
    }

    beforeEach(() => {
      seedAttentionFixture(db);
    });

    it('every kind appears in the window', () => {
      const kinds = new Set(
        getHomeWeek(db, { now: new Date(FIXTURE_NOW) }).items.map((i) => i.kind),
      );
      expect([...kinds].sort()).toEqual([...HOME_AGENDA_KINDS].sort());
    });

    it('payment subjects and links equal the matching N4/N5 attention rows', () => {
      const res = getHomeWeek(db, { now: new Date(FIXTURE_NOW) });
      const rows = attentionRows().filter((r) => ['N4', 'N5', 'N6'].includes(r.rule));
      const payments = res.items.filter((i) => i.kind === 'payment');
      const shared = payments.filter((p) =>
        rows.some((r) => r.subject.type === p.subject.type && r.subject.id === p.subject.id),
      );
      expect(shared.map((p) => p.subject.id).sort()).toEqual(['dep-2', 'inv-2', 'inv-2b']);
      for (const payment of shared) {
        const row = rows.find(
          (r) => r.subject.type === payment.subject.type && r.subject.id === payment.subject.id,
        )!;
        expect(payment.subject).toEqual(row.subject);
        expect(payment.link).toEqual(row.link);
        expect(payment.amount).toBe(row.amount);
        expect(payment.date).toBe(row.date);
      }
    });

    it('the progress payment uses the deposit as its subject, like attention N5', () => {
      const payment = getHomeWeek(db, { now: new Date(FIXTURE_NOW) }).items.find(
        (i) => i.key === 'payment:progress_payment:dep-2',
      )!;
      expect(payment.subject.type).toBe('progress_payment');
      expect(payment.recordKind).toBe('offer');
      expect(attentionRows().map((r) => r.key)).toContain('N5:progress_payment:dep-2');
    });

    it('milestone, delivery and task subjects equal the attention rows for the same record', () => {
      const res = getHomeWeek(db, { now: new Date(FIXTURE_NOW) });
      const rows = attentionRows();
      let matched = 0;
      for (const item of res.items) {
        if (item.kind === 'payment') continue;
        const row = rows.find(
          (r) => r.subject.type === item.subject.type && r.subject.id === item.subject.id,
        );
        if (!row) continue;
        matched += 1;
        expect(item.subject).toEqual(row.subject);
        expect(item.link).toEqual(row.link);
      }
      expect(matched).toBeGreaterThan(5);
      const ids = res.items.filter((i) => i.kind === 'milestone').map((i) => i.subject.id);
      expect(ids.sort()).toEqual(['1', '3']);
    });

    it('names the right predecessor for each held-up task', () => {
      const items = getHomeWeek(db, { now: new Date(FIXTURE_NOW) }).items;
      const heldUpBy = (key: string) => items.find((i) => i.key === key)?.heldUpBy;
      expect(heldUpBy('starts:work_item:wi-2')).toEqual({ id: 'wi-1', label: 'Task A' });
      expect(heldUpBy('starts:work_item:wi-3')).toEqual({ id: 'wi-2', label: 'Task wi-2' });
      // wi-4 waits for milestone 1, which wi-1 contributes to
      expect(heldUpBy('starts:work_item:wi-4')).toEqual({ id: 'wi-1', label: 'Task A' });
      // wi-4 has only a stored start date, so it has no end item
      expect(heldUpBy('ends:work_item:wi-4')).toBeUndefined();
      // late, not held up
      expect(heldUpBy('starts:work_item:wi-7')).toBeNull();
      expect(items.find((i) => i.key === 'starts:work_item:wi-7')!.schedule).toMatchObject({
        isLate: true,
        isHeldUp: false,
      });
    });

    it('holds-up flags agree with the projection and the critical line with the engine', () => {
      const projection = projectSchedule(loadScheduleGraph(db), FIXTURE_TODAY);
      const critical = new Set(projection.criticalPath);
      const items = getHomeWeek(db, { now: new Date(FIXTURE_NOW) }).items;
      for (const item of items.filter((i) => i.schedule)) {
        const f = projection.workItems.get(item.subject.id);
        if (!f) continue;
        expect(item.schedule).toEqual({
          isLate: f.isLate,
          lateDays: f.lateDays,
          isHeldUp: f.isHeldUp,
          isCritical: critical.has(item.subject.id),
        });
        expect(item.heldUpBy !== null).toBe(f.isHeldUp ? item.heldUpBy !== null : false);
      }
      expect(items.find((i) => i.key === 'starts:work_item:wi-d')!.schedule?.isCritical).toBe(true);
    });

    it('excludes completed tasks and reached milestones of the fixture', () => {
      const all = keys(getHomeWeek(db, { now: new Date(FIXTURE_NOW) }).items);
      expect(all).not.toContain('starts:work_item:wi-9');
      expect(all).not.toContain('ends:work_item:wi-9');
      expect(all).not.toContain('milestone:milestone:4');
      expect(all).not.toContain('delivery:household_item:hi-5');
      expect(all).not.toContain('delivery:household_item:hi-6');
    });

    it('the week for the next day drops a payment due today and its keys stay unique', () => {
      const next = getHomeWeek(db, { now: new Date('2026-03-11T09:00:00.000Z') });
      expect(keys(next.items)).not.toContain('payment:invoice:inv-2b');
      expect(next.to).toBe('2026-03-31');
      expect(new Set(keys(next.items)).size).toBe(next.items.length);
    });
  });

  // ─── getHomePulse ──────────────────────────────────────────────────────────

  describe('getHomePulse', () => {
    it('returns zeros and no verdict on an empty database', () => {
      expect(getHomePulse(db, VAT)).toEqual({
        leftToSpend: { expected: 0, best: 0, worst: 0, verdict: null },
        stillToPay: 0,
        stillToPayCount: 0,
        progress: { total: 0, done: 0, inProgress: 0 },
      });
    });

    it('takes the money figures verbatim from the money service', () => {
      seedAttentionFixture(db);
      const pulse = getHomePulse(db, VAT);
      const money = computeProjectMoney(db, VAT).summary;
      expect(pulse.leftToSpend).toEqual(money.leftToSpend);
      expect(pulse.stillToPay).toBe(money.stillToPay);
      expect(pulse.stillToPayCount).toBe(money.stillToPayCount);
      expect(pulse.stillToPay).toBeGreaterThan(0);
      expect(pulse.stillToPayCount).toBeGreaterThan(0);
      expect(Object.keys(pulse).sort()).toEqual([
        'leftToSpend',
        'progress',
        'stillToPay',
        'stillToPayCount',
      ]);
    });

    it('progress equals the Tasks list totals for no filter, completed and in progress', () => {
      seedAttentionFixture(db);
      const pulse = getHomePulse(db, VAT);
      const total = (status?: 'completed' | 'in_progress') =>
        listWorkItems(db, { pageSize: 1, ...(status ? { status } : {}) }).pagination.totalItems;
      expect(pulse.progress).toEqual({
        total: total(),
        done: total('completed'),
        inProgress: total('in_progress'),
      });
      expect(pulse.progress.total).toBeGreaterThan(pulse.progress.done);
      expect(pulse.progress.done).toBe(1);
      expect(pulse.progress.inProgress).toBe(4);
    });

    it('counts not_started tasks only in the total', () => {
      task('a');
      task('b', { status: 'completed' });
      task('c', { status: 'in_progress' });
      task('d', { status: 'in_progress' });
      expect(getHomePulse(db, VAT).progress).toEqual({ total: 4, done: 1, inProgress: 2 });
    });
  });

  // ─── getHomeSetup ──────────────────────────────────────────────────────────

  describe('getHomeSetup', () => {
    const config = (over: Partial<{ backupDir: string; backupCadence: string }> = {}) => ({
      vatRate: VAT,
      backupDir: join(tempDir, 'backups'),
      ...over,
    });
    const setup = (isAdmin: boolean, over: Parameters<typeof config>[0] = {}, logger?: never) =>
      getHomeSetup(db, { isAdmin, config: config(over), logger });
    const stepMap = (res: Awaited<ReturnType<typeof setup>>) =>
      Object.fromEntries(res.steps.map((s) => [s.id, s.done]));

    function user(id: string, deactivated = false): void {
      db.insert(schema.users)
        .values({
          id,
          email: `${id}@example.test`,
          displayName: `Person ${id}`,
          role: 'member',
          authProvider: 'local',
          passwordHash: 'hashed',
          deactivatedAt: deactivated ? STAMP : null,
          ...ts,
        })
        .run();
    }

    function budgetLine(workItemId: string, plannedAmount: number): void {
      db.insert(schema.workItemBudgets)
        .values({
          id: `line-${workItemId}-${plannedAmount}`,
          workItemId,
          plannedAmount,
          confidence: 'own_estimate',
          includesVat: true,
          budgetSourceId: null,
          ...ts,
        })
        .run();
    }

    it('lists the steps in order; an empty project has every step open and core incomplete', async () => {
      const res = await setup(true);
      expect(res.steps.map((s) => s.id)).toEqual([...HOME_SETUP_STEPS]);
      expect(res.steps.every((s) => s.done === false)).toBe(true);
      expect(res.coreComplete).toBe(false);
    });

    it('members never get the household and backups steps', async () => {
      const res = await setup(false);
      expect(res.steps.map((s) => s.id)).toEqual([
        'house',
        'areas',
        'funding',
        'companies',
        'tasks',
        'firstLog',
      ]);
    });

    it('members are not told about users or backups even when those exist', async () => {
      user('u1');
      user('u2');
      writeFileSync(join(tempDir, 'cornerstone-backup-2026-03-01T100000Z.tar.gz'), 'x');
      const res = await setup(false, { backupDir: tempDir, backupCadence: '0 2 * * *' });
      expect(res.steps.map((s) => s.id)).not.toContain('household');
      expect(res.steps.map((s) => s.id)).not.toContain('backups');
    });

    it('house: done once the household name is a non-blank string', async () => {
      expect(stepMap(await setup(false)).house).toBe(false);
      updateHouseholdSettings(db, { householdName: '   ' });
      expect(stepMap(await setup(false)).house).toBe(false);
      updateHouseholdSettings(db, { householdName: ' Home A ' });
      expect(stepMap(await setup(false)).house).toBe(true);
    });

    it('areas: done with one area', async () => {
      expect(stepMap(await setup(false)).areas).toBe(false);
      db.insert(schema.areas)
        .values({ id: 'a-1', name: 'Building', parentId: null, sortOrder: 0, ...ts })
        .run();
      expect(stepMap(await setup(false)).areas).toBe(true);
    });

    it('funding: needs an active source with an amount above zero', async () => {
      const source = (id: string, status: 'active' | 'exhausted' | 'closed', totalAmount: number) =>
        db
          .insert(schema.budgetSources)
          .values({ id, name: id, sourceType: 'bank_loan', totalAmount, status, ...ts })
          .run();
      expect(stepMap(await setup(false)).funding).toBe(false);
      source('zero', 'active', 0);
      expect(stepMap(await setup(false)).funding).toBe(false);
      source('closed', 'closed', 5000);
      expect(stepMap(await setup(false)).funding).toBe(false);
      source('real', 'active', 0.01);
      expect(stepMap(await setup(false)).funding).toBe(true);
    });

    it('companies: done with one company', async () => {
      expect(stepMap(await setup(false)).companies).toBe(false);
      company('v-a');
      expect(stepMap(await setup(false)).companies).toBe(true);
    });

    it('tasks: false without tasks, for a dated task without cost, and for cost on an undated task', async () => {
      expect(stepMap(await setup(false)).tasks).toBe(false);
      task('dated', { startDate: at(1) });
      expect(stepMap(await setup(false)).tasks).toBe(false);
      task('undated');
      budgetLine('undated', 500);
      expect(stepMap(await setup(false)).tasks).toBe(false);
    });

    it('tasks: true once a dated task has a cost above zero (a start date alone is enough)', async () => {
      task('dated', { startDate: at(1) });
      budgetLine('dated', 1);
      expect(stepMap(await setup(false)).tasks).toBe(true);
    });

    it('tasks: an end date alone counts as dated, and a zero cost does not count', async () => {
      task('ends-only', { endDate: at(4) });
      budgetLine('ends-only', 0);
      expect(stepMap(await setup(false)).tasks).toBe(false);
      budgetLine('ends-only', 800);
      expect(stepMap(await setup(false)).tasks).toBe(true);
    });

    it('firstLog: only a saved, manual diary entry counts', async () => {
      const entry = (id: string, o: Partial<typeof schema.diaryEntries.$inferInsert>) =>
        db
          .insert(schema.diaryEntries)
          .values({
            id,
            entryType: 'daily_log',
            entryDate: T,
            body: '',
            status: 'saved',
            isAutomatic: false,
            ...ts,
            ...o,
          })
          .run();
      entry('draft', { status: 'draft' });
      entry('auto', { entryType: 'invoice_status', isAutomatic: true });
      expect(stepMap(await setup(false)).firstLog).toBe(false);
      entry('real', {});
      expect(stepMap(await setup(false)).firstLog).toBe(true);
    });

    it('household: admins see it done only with a second active user', async () => {
      user('u1');
      expect(stepMap(await setup(true)).household).toBe(false);
      user('u2', true);
      expect(stepMap(await setup(true)).household).toBe(false);
      user('u3');
      expect(stepMap(await setup(true)).household).toBe(true);
    });

    it('backups: a cadence counts as done without looking at the directory', async () => {
      const res = await setup(true, { backupCadence: '0 2 * * *' });
      expect(stepMap(res).backups).toBe(true);
    });

    it('backups: a blank cadence falls through to the directory check', async () => {
      const res = await setup(true, { backupCadence: '   ' });
      expect(stepMap(res).backups).toBe(false);
    });

    it('backups: a missing directory means no backups yet (false, not null)', async () => {
      expect(stepMap(await setup(true, { backupDir: join(tempDir, 'nope') })).backups).toBe(false);
    });

    it('backups: one backup archive in the directory is done; other files are not', async () => {
      writeFileSync(join(tempDir, 'notes.txt'), 'x');
      expect(stepMap(await setup(true, { backupDir: tempDir })).backups).toBe(false);
      writeFileSync(join(tempDir, 'cornerstone-backup-2026-03-01T100000Z.tar.gz'), 'x');
      expect(stepMap(await setup(true, { backupDir: tempDir })).backups).toBe(true);
    });

    it('backups: null when the directory cannot be checked, and a warning is logged without the path', async () => {
      const notADirectory = join(tempDir, 'a-file');
      writeFileSync(notADirectory, 'x');
      const warn = jest.fn<(obj: Record<string, unknown>, msg: string) => void>();
      const res = await getHomeSetup(db, {
        isAdmin: true,
        config: config({ backupDir: notADirectory }),
        logger: { warn },
      });
      expect(stepMap(res).backups).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      const [obj, message] = warn.mock.calls[0]!;
      expect(JSON.stringify([obj, message])).not.toContain(tempDir);
      expect(JSON.stringify([obj, message])).not.toContain('a-file');
      expect(obj).toEqual({ errorName: expect.any(String) });
    });

    it('backups: a failed check without a logger still reports null and does not throw', async () => {
      const notADirectory = join(tempDir, 'a-file');
      writeFileSync(notADirectory, 'x');
      const res = await setup(true, { backupDir: notADirectory });
      expect(stepMap(res).backups).toBeNull();
      expect(res.coreComplete).toBe(false);
    });

    it('a failed backup check does not block coreComplete (it is not a core step)', async () => {
      updateHouseholdSettings(db, { householdName: 'Home A' });
      db.insert(schema.areas)
        .values({ id: 'a-1', name: 'Building', parentId: null, sortOrder: 0, ...ts })
        .run();
      db.insert(schema.budgetSources)
        .values({
          id: 's',
          name: 'Loan A',
          sourceType: 'bank_loan',
          totalAmount: 1000,
          status: 'active',
          ...ts,
        })
        .run();
      company('v-a');
      task('wi', { startDate: at(1) });
      budgetLine('wi', 100);
      const notADirectory = join(tempDir, 'a-file');
      writeFileSync(notADirectory, 'x');
      const res = await setup(true, { backupDir: notADirectory });
      expect(res.coreComplete).toBe(true);
      expect(stepMap(res).backups).toBeNull();
      expect(stepMap(res).household).toBe(false);
      expect(stepMap(res).firstLog).toBe(false);
    });

    it('coreComplete needs all five core steps: house, areas, funding, companies, tasks', async () => {
      const core = ['house', 'areas', 'funding', 'companies', 'tasks'];
      const fill: Record<string, () => void> = {
        house: () => updateHouseholdSettings(db, { householdName: 'Home A' }),
        areas: () =>
          void db
            .insert(schema.areas)
            .values({ id: 'a-1', name: 'Building', parentId: null, sortOrder: 0, ...ts })
            .run(),
        funding: () =>
          void db
            .insert(schema.budgetSources)
            .values({
              id: 's',
              name: 'Loan A',
              sourceType: 'bank_loan',
              totalAmount: 1000,
              status: 'active',
              ...ts,
            })
            .run(),
        companies: () => company('v-a'),
        tasks: () => {
          task('wi', { startDate: at(1) });
          budgetLine('wi', 100);
        },
      };
      for (let i = 0; i < core.length; i += 1) {
        fill[core[i]!]!();
        const res = await setup(false);
        expect(res.coreComplete).toBe(i === core.length - 1);
      }
      const final = stepMap(await setup(false));
      expect(core.every((id) => final[id] === true)).toBe(true);
    });

    it('members and admins get the same answers for the shared steps', async () => {
      updateHouseholdSettings(db, { householdName: 'Home A' });
      company('v-a');
      const member = stepMap(await setup(false));
      const admin = stepMap(await setup(true));
      for (const [id, done] of Object.entries(member)) expect(admin[id]).toBe(done);
    });
  });
});
