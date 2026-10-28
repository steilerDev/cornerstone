import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as workItemService from './workItemService.js';
import { ValidationError } from '../errors/AppError.js';
import type { WorkItemListRow } from '@cornerstone/shared';

const NOW = new Date('2026-03-10T09:00:00Z');
const OPTS = { vatRate: 0.19, now: NOW };

describe('workItemService.listWorkItemRows', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let userId: string;
  let sourceId: string;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    userId = 'user-1';
    const ts = '2026-01-01T00:00:00.000Z';
    db.insert(schema.users)
      .values({
        id: userId,
        email: 'rows@example.com',
        displayName: 'Rows User',
        role: 'member',
        authProvider: 'local',
        passwordHash: 'x',
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    sourceId = 'src-1';
    db.insert(schema.budgetSources)
      .values({
        id: sourceId,
        name: 'Savings',
        sourceType: 'savings',
        totalAmount: 500000,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
  });

  afterEach(() => {
    sqlite.close();
  });

  let counter = 0;
  const TS = '2026-01-01T00:00:00.000Z';

  /** Direct insert: no auto-reschedule, so every date below is exactly what the engine sees. */
  function task(id: string, over: Partial<typeof schema.workItems.$inferInsert> = {}): string {
    counter += 1;
    const createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, counter)).toISOString();
    db.insert(schema.workItems)
      .values({
        id,
        title: `Task ${id}`,
        status: 'not_started',
        createdBy: userId,
        createdAt,
        updatedAt: createdAt,
        ...over,
      })
      .run();
    return id;
  }

  function depend(predecessorId: string, successorId: string) {
    db.insert(schema.workItemDependencies)
      .values({ predecessorId, successorId, dependencyType: 'finish_to_start', leadLagDays: 0 })
      .run();
  }

  function line(workItemId: string, plannedAmount: number, id = `bl-${++counter}`) {
    db.insert(schema.workItemBudgets)
      .values({
        id,
        workItemId,
        plannedAmount,
        confidence: 'own_estimate',
        budgetSourceId: sourceId,
        includesVat: true,
        createdBy: userId,
        createdAt: TS,
        updatedAt: TS,
      })
      .run();
  }

  /** One task per window (today 2026-03-10) plus a dependency chain and cost lines. */
  function seed() {
    task('done', {
      status: 'completed',
      actualStartDate: '2026-03-01',
      actualEndDate: '2026-03-05',
    });
    task('late', {
      status: 'in_progress',
      startDate: '2026-02-20',
      endDate: '2026-02-23',
      actualStartDate: '2026-02-20',
      durationDays: 3,
    });
    task('late2', { startDate: '2026-03-01', durationDays: 2 });
    task('prog', {
      status: 'in_progress',
      startDate: '2026-03-09',
      actualStartDate: '2026-03-09',
      durationDays: 10,
    });
    task('soon', { startDate: '2026-03-14', durationDays: 2 });
    task('next', { startDate: '2026-03-20', durationDays: 2 });
    task('later', { startDate: '2026-05-01', durationDays: 2 });
    task('undated');
    depend('late', 'undated');
    depend('soon', 'next');
    depend('prog', 'next');
    line('soon', 1000);
    line('next', 500);
    line('next', 700);
  }

  const rows = (query: Parameters<typeof workItemService.listWorkItemRows>[1] = {}) =>
    workItemService.listWorkItemRows(db, query, OPTS);
  const ids = (items: WorkItemListRow[]) => items.map((item) => item.id);
  const byId = (items: WorkItemListRow[], id: string) => items.find((item) => item.id === id)!;

  describe('windows, grouping and counts', () => {
    it('assigns each task its time window', () => {
      seed();
      const { items } = rows();
      const windows = Object.fromEntries(items.map((item) => [item.id, item.timeWindow]));
      expect(windows).toEqual({
        done: 'done',
        late: 'late',
        late2: 'late',
        prog: 'this_week',
        soon: 'this_week',
        next: 'next_two_weeks',
        later: 'later',
        undated: 'later',
      });
    });

    it('group=time orders the windows first, then the sort inside each window', () => {
      seed();
      const asc = rows({ group: 'time', sortBy: 'title', sortOrder: 'asc' });
      expect(ids(asc.items)).toEqual([
        'late',
        'late2',
        'prog',
        'soon',
        'next',
        'later',
        'undated',
        'done',
      ]);
      const desc = rows({ group: 'time', sortBy: 'title', sortOrder: 'desc' });
      expect(ids(desc.items)).toEqual([
        'late2',
        'late',
        'soon',
        'prog',
        'next',
        'undated',
        'later',
        'done',
      ]);
    });

    it('without group the sort alone orders the rows and there are no groupCounts', () => {
      seed();
      const result = rows({ sortBy: 'title', sortOrder: 'asc' });
      expect(ids(result.items)).toEqual([
        'done',
        'late',
        'late2',
        'later',
        'next',
        'prog',
        'soon',
        'undated',
      ]);
      expect(result).not.toHaveProperty('groupCounts');
    });

    it('groupCounts carry every key and count the rows matching the query, ignoring ids', () => {
      seed();
      const all = rows({ group: 'time' });
      expect(all.groupCounts).toEqual({
        late: 2,
        this_week: 2,
        next_two_weeks: 1,
        later: 2,
        done: 1,
      });
      const narrowed = rows({ group: 'time', ids: 'late,done' });
      expect(narrowed.groupCounts).toEqual(all.groupCounts);
      const none = rows({ group: 'time', status: 'in_progress', q: 'zzz' });
      expect(none.groupCounts).toEqual({
        late: 0,
        this_week: 0,
        next_two_weeks: 0,
        later: 0,
        done: 0,
      });
    });

    it('scopeTotal counts the rows matching only the status chip', () => {
      seed();
      expect(rows().scopeTotal).toBe(8);
      expect(rows({ status: 'in_progress' }).scopeTotal).toBe(2);
      const filtered = rows({ status: 'in_progress', q: 'Task late' });
      expect(filtered.scopeTotal).toBe(2);
      expect(filtered.pagination.totalItems).toBe(1);
      expect(rows({ ids: 'done' }).scopeTotal).toBe(8);
    });

    it('is empty for an empty database', () => {
      const result = rows({ group: 'time' });
      expect(result.items).toEqual([]);
      expect(result.scopeTotal).toBe(0);
      expect(result.pagination).toEqual({ page: 1, pageSize: 25, totalItems: 0, totalPages: 0 });
    });

    it('uses the real clock when no now is injected', () => {
      seed();
      const result = workItemService.listWorkItemRows(db, {}, { vatRate: 0.19 });
      expect(result.items).toHaveLength(8);
    });
  });

  describe('milestoneId', () => {
    it('narrows to the tasks counting toward the milestone; an unknown id gives no rows', () => {
      seed();
      db.insert(schema.milestones)
        .values({ id: 1, title: 'Roof', targetDate: '2026-04-01', createdAt: TS, updatedAt: TS })
        .run();
      db.insert(schema.milestoneWorkItems)
        .values([
          { milestoneId: 1, workItemId: 'soon' },
          { milestoneId: 1, workItemId: 'next' },
        ])
        .run();
      expect(ids(rows({ milestoneId: 1, sortBy: 'title', sortOrder: 'asc' }).items)).toEqual([
        'next',
        'soon',
      ]);
      const unknown = rows({ milestoneId: 99 });
      expect(unknown.items).toEqual([]);
      expect(unknown.pagination.totalItems).toBe(0);
      // listWorkItems honours it too (shared condition builder)
      expect(
        workItemService
          .listWorkItems(db, { milestoneId: 1 })
          .items.map((item) => item.id)
          .sort(),
      ).toEqual(['next', 'soon']);
    });
  });

  describe('ids', () => {
    it('narrows the rows only; page and pageSize are ignored', () => {
      seed();
      const result = rows({
        ids: ' soon, late ,,next',
        page: 3,
        pageSize: 1,
        sortBy: 'title',
        sortOrder: 'asc',
      });
      expect(ids(result.items)).toEqual(['late', 'next', 'soon']);
      expect(result.pagination).toEqual({ page: 1, pageSize: 100, totalItems: 3, totalPages: 1 });
    });

    it('an ids list that matches nothing is an empty page with zero pages', () => {
      seed();
      const result = rows({ ids: 'nope' });
      expect(result.items).toEqual([]);
      expect(result.pagination).toEqual({ page: 1, pageSize: 100, totalItems: 0, totalPages: 0 });
    });

    it('blank ids (only commas and spaces) behave as no ids', () => {
      seed();
      const result = rows({ ids: ' , ,', pageSize: 2 });
      expect(result.items).toHaveLength(2);
      expect(result.pagination.pageSize).toBe(2);
    });

    it('accepts exactly 100 ids and rejects 101 with a validation error', () => {
      seed();
      const hundred = Array.from({ length: 100 }, (_, i) => `x${i}`).join(',');
      expect(rows({ ids: hundred }).items).toEqual([]);
      expect(() => rows({ ids: `${hundred},x100` })).toThrow(ValidationError);
    });

    it('still honours the other filters', () => {
      seed();
      expect(ids(rows({ ids: 'late,done', status: 'completed' }).items)).toEqual(['done']);
    });
  });

  describe('expected cost', () => {
    it('is null without budget lines and the sum of the lines otherwise', () => {
      seed();
      const { items } = rows();
      expect(byId(items, 'late').expectedCost).toBeNull();
      expect(byId(items, 'soon').expectedCost).toBe(1000);
      expect(byId(items, 'next').expectedCost).toBe(1200);
    });

    it('sorts by expected cost with unpriced tasks last in both directions', () => {
      seed();
      task('mid');
      line('mid', 800);
      const asc = ids(rows({ sortBy: 'expected_cost', sortOrder: 'asc' }).items);
      expect(asc.slice(0, 3)).toEqual(['mid', 'soon', 'next']);
      expect(asc.slice(3)).toHaveLength(6);
      const desc = ids(rows({ sortBy: 'expected_cost', sortOrder: 'desc' }).items);
      expect(desc.slice(0, 3)).toEqual(['next', 'soon', 'mid']);
      // unpriced rows tie-break by createdAt, then id
      expect(desc.slice(3)).toEqual(['done', 'late', 'late2', 'prog', 'later', 'undated']);
    });

    it('a task whose lines are all zero is priced 0, not null, and sorts before priced ones asc', () => {
      seed();
      task('free');
      line('free', 0);
      const result = rows({ sortBy: 'expected_cost', sortOrder: 'asc' });
      expect(byId(result.items, 'free').expectedCost).toBe(0);
      expect(ids(result.items)[0]).toBe('free');
    });

    it('computes costs for the page rows when another sort is used and none has lines', () => {
      task('bare');
      expect(rows().items[0]!.expectedCost).toBeNull();
    });
  });

  describe('enrichment', () => {
    it('flags the critical path and never flags a completed task', () => {
      seed();
      const { items } = rows();
      for (const item of items) {
        if (item.status === 'completed') expect(item.isCritical).toBe(false);
      }
      expect(items.some((item) => item.isCritical)).toBe(true);
    });

    it('names what a task waits for: the held-up cause first, then how many more', () => {
      seed();
      const { items } = rows();
      expect(byId(items, 'undated').waitsFor).toEqual({
        id: 'late',
        title: 'Task late',
        more: 0,
      });
      const next = byId(items, 'next').waitsFor!;
      expect(next.more).toBe(1);
      expect(['soon', 'prog']).toContain(next.id);
      expect(byId(items, 'late').waitsFor).toBeNull();
    });

    it('a completed task waits for nothing and holds nothing up', () => {
      seed();
      task('after-done');
      depend('done', 'after-done');
      depend('after-done', 'later');
      const { items } = rows();
      expect(byId(items, 'done').waitsFor).toBeNull();
      expect(byId(items, 'done').holdsUp).toBeNull();
      expect(byId(items, 'after-done').waitsFor).toBeNull();
    });

    it('reports how many tasks a slipping task holds up, and null when it holds up none', () => {
      seed();
      const { items } = rows();
      expect(byId(items, 'late').holdsUp).toMatchObject({ count: 1 });
      expect(byId(items, 'undated').holdsUp).toBeNull();
    });

    it('keeps the summary fields and adds grants', () => {
      seed();
      const row = byId(rows().items, 'soon');
      expect(row).toMatchObject({ title: 'Task soon', status: 'not_started', grants: [] });
      expect(row.budgetLineCount).toBe(1);
    });
  });

  describe('pagination and filters', () => {
    it('pages the sorted rows and reports totals', () => {
      seed();
      const result = rows({ sortBy: 'title', sortOrder: 'asc', page: 2, pageSize: 3 });
      expect(ids(result.items)).toEqual(['later', 'next', 'prog']);
      expect(result.pagination).toEqual({ page: 2, pageSize: 3, totalItems: 8, totalPages: 3 });
    });

    it('applies the shown-date filters and returns the filter meta', () => {
      seed();
      const result = rows({ startDateFrom: '2026-03-12', startDateTo: '2026-03-31' });
      expect(ids(result.items).sort()).toEqual(['next', 'soon']);
      expect(result.filterMeta?.budgetLines).toBeDefined();
    });

    it('reports the real budget-line range in the filter meta', () => {
      seed();
      expect(rows().filterMeta?.budgetLines).toEqual({ min: 0, max: 2 });
    });
  });

  describe('budget-line count filters', () => {
    it('budgetLinesMin and budgetLinesMax filter by the number of lines', () => {
      seed();
      expect(ids(rows({ budgetLinesMin: 1 }).items).sort()).toEqual(['next', 'soon']);
      expect(ids(rows({ budgetLinesMin: 2 }).items)).toEqual(['next']);
      expect(ids(rows({ budgetLinesMax: 1 }).items).sort()).toEqual([
        'done',
        'late',
        'late2',
        'later',
        'prog',
        'soon',
        'undated',
      ]);
      expect(ids(rows({ budgetLinesMin: 1, budgetLinesMax: 1 }).items)).toEqual(['soon']);
      expect(
        workItemService.listWorkItems(db, { budgetLinesMin: 2 }).items.map((i) => i.id),
      ).toEqual(['next']);
    });

    it('the filter meta ignores the range itself', () => {
      seed();
      expect(rows({ budgetLinesMin: 2 }).filterMeta?.budgetLines).toEqual({ min: 0, max: 2 });
    });
  });
});
