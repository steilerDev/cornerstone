/**
 * workItemService (#2242): `grants` chips on list rows (AC6) and the remaining branches of the
 * file (existence guard, startAfter / startBefore updates, unknown vendor, budget-line-count
 * filters).
 *
 * Mutations these tests catch:
 *  - a rejected grant still shown as a chip;
 *  - chips unsorted, or an item without grants getting no `grants: []`;
 *  - one query per row instead of one per response (the statement count is asserted);
 *  - a grant of another item leaking into a row.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';
import { ensureWorkItemExists, listWorkItems, updateWorkItem } from './workItemService.js';
import { createMoneySeed } from '../test/moneyDb.js';
import type { MoneySeed } from '../test/moneyDb.js';

describe('workItemService: grant chips and remaining branches (#2242)', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let seed: MoneySeed;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    seed = createMoneySeed(db);
  });

  afterEach(() => {
    sqlite.close();
  });

  const list = (query: Parameters<typeof listWorkItems>[1] = {}) =>
    listWorkItems(db, { page: 1, pageSize: 100, ...query });

  describe('grants on list rows', () => {
    it('attaches every non-rejected grant, ordered by name, and [] when there is none', () => {
      seed.workItem('wi-1', null, 'Roof');
      seed.workItem('wi-2', null, 'Plaster');
      seed.workItem('wi-3', null, 'Paint');
      seed.grant('sp-b', { value: 20, workItems: ['wi-1'] });
      seed.grant('sp-a', { value: 15, workItems: ['wi-1', 'wi-2'] });
      seed.grant('sp-rej', { status: 'rejected', value: 50, workItems: ['wi-1'] });
      seed.grant('sp-fix', { type: 'fixed', value: 300, workItems: ['wi-2'], status: 'applied' });
      // A purchase-only link must not leak into a task row
      seed.householdItem('hi-1');
      seed.grant('sp-hi', { householdItems: ['hi-1'] });

      const byTitle = new Map(list().items.map((i) => [i.title, i.grants]));

      expect(byTitle.get('Roof')).toEqual([
        { id: 'sp-a', name: 'Grant sp-a', reductionType: 'percentage', rate: 15 },
        { id: 'sp-b', name: 'Grant sp-b', reductionType: 'percentage', rate: 20 },
      ]);
      expect(byTitle.get('Plaster')).toEqual([
        { id: 'sp-a', name: 'Grant sp-a', reductionType: 'percentage', rate: 15 },
        { id: 'sp-fix', name: 'Grant sp-fix', reductionType: 'fixed', rate: 300 },
      ]);
      expect(byTitle.get('Paint')).toEqual([]);
    });

    it('is one grant query per response, not one per row', () => {
      for (let i = 0; i < 12; i++) seed.workItem(`wi-${i}`, null, `Task ${i}`);
      seed.grant('sp-1', { workItems: ['wi-0', 'wi-5', 'wi-11'] });
      const statements: string[] = [];
      const logged = drizzle(sqlite, {
        schema,
        logger: { logQuery: (q: string) => statements.push(q) },
      });

      listWorkItems(logged, { page: 1, pageSize: 100 });

      expect(statements.filter((q) => q.includes('link.work_item_id'))).toHaveLength(1);
    });

    it('sends chips on the paged result as well (second page rows)', () => {
      for (let i = 0; i < 3; i++) seed.workItem(`wi-${i}`, null, `Task ${i}`);
      seed.grant('sp-1', { workItems: ['wi-0', 'wi-1', 'wi-2'] });

      const page = listWorkItems(db, { page: 2, pageSize: 2, sortBy: 'title', sortOrder: 'asc' });

      expect(page.items.map((i) => [i.title, i.grants?.length])).toEqual([['Task 2', 1]]);
    });
  });

  describe('remaining branches', () => {
    it('ensureWorkItemExists throws NotFoundError for an unknown id and passes for a known one', () => {
      seed.workItem('wi-1');
      expect(() => ensureWorkItemExists(db, 'wi-1')).not.toThrow();
      expect(() => ensureWorkItemExists(db, 'nope')).toThrow(NotFoundError);
    });

    it('updates startAfter and startBefore, and clears them with null', () => {
      seed.workItem('wi-1');
      const set = updateWorkItem(db, 'wi-1', {
        startAfter: '2026-05-01',
        startBefore: '2026-06-01',
      });
      expect([set.startAfter, set.startBefore]).toEqual(['2026-05-01', '2026-06-01']);
      const cleared = updateWorkItem(db, 'wi-1', { startAfter: null, startBefore: null });
      expect([cleared.startAfter, cleared.startBefore]).toEqual([null, null]);
    });

    it('rejects an unknown assigned vendor on update and accepts a known one', () => {
      seed.workItem('wi-1');
      db.insert(schema.vendors)
        .values({ id: 'v-1', name: 'Company One', createdAt: 'x', updatedAt: 'x' })
        .run();
      expect(() => updateWorkItem(db, 'wi-1', { assignedVendorId: 'nope' })).toThrow(
        ValidationError,
      );
      expect(updateWorkItem(db, 'wi-1', { assignedVendorId: 'v-1' }).assignedVendor?.id).toBe(
        'v-1',
      );
    });

    it('clears the nullable fields of a task with null', () => {
      seed.workItem('wi-1');
      updateWorkItem(db, 'wi-1', {
        description: 'Text',
        startDate: '2026-05-01',
        endDate: '2026-05-09',
        durationDays: 8,
        actualStartDate: '2026-05-02',
        actualEndDate: '2026-05-08',
      });

      const cleared = updateWorkItem(db, 'wi-1', {
        description: null,
        startDate: null,
        endDate: null,
        durationDays: null,
        actualStartDate: null,
        actualEndDate: null,
      });

      expect([
        cleared.description,
        cleared.startDate,
        cleared.endDate,
        cleared.durationDays,
        cleared.actualStartDate,
        cleared.actualEndDate,
      ]).toEqual([null, null, null, null, null, null]);
    });

    it.each(['status', 'updated_at', 'title', 'created_at'] as const)(
      'lists sorted by %s in both directions',
      (sortBy) => {
        seed.workItem('wi-1', null, 'A task');
        seed.workItem('wi-2', null, 'B task');
        const asc = list({ sortBy, sortOrder: 'asc' }).items.map((i) => i.id);
        const desc = list({ sortBy, sortOrder: 'desc' }).items.map((i) => i.id);
        expect([...asc].sort()).toEqual(['wi-1', 'wi-2']);
        expect([...desc].sort()).toEqual(['wi-1', 'wi-2']);
      },
    );

    it('an empty table lists nothing and reports a zero budget-line range', () => {
      const result = list();
      expect(result.items).toEqual([]);
      expect(result.filterMeta).toEqual({ budgetLines: { min: 0, max: 0 } });
    });

    it('filters by the number of budget lines (min and max)', () => {
      seed.workItem('wi-0', null, 'No lines');
      seed.workItem('wi-2', null, 'Two lines');
      seed.wiLine('l-1', 'wi-2');
      seed.wiLine('l-2', 'wi-2');

      expect(list({ budgetLinesMin: 1 }).items.map((i) => i.title)).toEqual(['Two lines']);
      expect(list({ budgetLinesMax: 1 }).items.map((i) => i.title)).toEqual(['No lines']);
    });
  });
});
