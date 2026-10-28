/**
 * workItemService.getWorkItemPageDetail (#2248): the task page's detail, i.e. WorkItemDetail plus
 * expected cost, grants, waits-for, holds-up and the assigned company's phone, computed by the
 * same helper as the Tasks list rows.
 *
 * Mutations these tests catch:
 *  - a missing task answering 200 instead of 404;
 *  - the phone dropped, or read from the wrong company;
 *  - a task without cost lines showing 0 instead of null;
 *  - a rejected grant shown by name;
 *  - a completed task still showing waits-for / holds-up;
 *  - `now` ignored (holds-up window depends on today).
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { NotFoundError } from '../errors/AppError.js';
import { getWorkItemPageDetail, listWorkItemRows } from './workItemService.js';
import { openMoneyDb } from '../test/moneyDb.js';
import type { MoneySeed, MoneyTestDb } from '../test/moneyDb.js';

const NOW = new Date('2026-03-10T09:00:00Z');
const OPTS = { vatRate: 0.19, now: NOW };
const TS = '2026-01-01T00:00:00.000Z';

describe('workItemService.getWorkItemPageDetail', () => {
  let sqlite: Database.Database;
  let db: MoneyTestDb;
  let seed: MoneySeed;

  beforeEach(() => {
    ({ sqlite, db, seed } = openMoneyDb());
  });

  afterEach(() => {
    sqlite.close();
  });

  function task(id: string, over: Partial<typeof schema.workItems.$inferInsert> = {}) {
    db.insert(schema.workItems)
      .values({
        id,
        title: `Task ${id}`,
        status: 'not_started',
        createdAt: TS,
        updatedAt: TS,
        ...over,
      })
      .run();
  }

  function depend(predecessorId: string, successorId: string, leadLagDays = 0) {
    db.insert(schema.workItemDependencies)
      .values({ predecessorId, successorId, dependencyType: 'finish_to_start', leadLagDays })
      .run();
  }

  const page = (id: string, now: Date = NOW) =>
    getWorkItemPageDetail(db, id, { vatRate: 0.19, now });

  it('throws NotFoundError for an unknown task', () => {
    expect(() => page('missing')).toThrow(NotFoundError);
  });

  describe('assigned company phone', () => {
    it('is null when the task has no company', () => {
      task('wi-1');
      expect(page('wi-1').assignedVendor).toBeNull();
    });

    it('carries the company phone next to the summary fields', () => {
      db.update(schema.vendors).set({ phone: '+49 30 1234567' }).run();
      task('wi-1', { assignedVendorId: 'vendor' });
      const vendor = page('wi-1').assignedVendor!;
      expect(vendor).toMatchObject({ id: 'vendor', name: 'Company One', phone: '+49 30 1234567' });
      expect(vendor).toHaveProperty('trade');
    });

    it('is null when the company has no phone on file', () => {
      task('wi-1', { assignedVendorId: 'vendor' });
      expect(page('wi-1').assignedVendor).toMatchObject({ id: 'vendor', phone: null });
    });
  });

  describe('expected cost', () => {
    it('is null without cost lines (never 0)', () => {
      task('wi-1');
      expect(page('wi-1').expectedCost).toBeNull();
    });

    it('is the engine expected cost with cost lines', () => {
      seed.workItem('wi-1');
      seed.wiLine('l-1', 'wi-1', { planned: 1000, includesVat: true });
      seed.wiLine('l-2', 'wi-1', { planned: 500, includesVat: true });
      const cost = page('wi-1').expectedCost;
      expect(cost).toBeGreaterThan(0);
      const row = listWorkItemRows(db, {}, OPTS).items.find((i) => i.id === 'wi-1')!;
      expect(cost).toBe(row.expectedCost);
    });
  });

  describe('grants', () => {
    it('lists non-rejected grants by name and leaves rejected ones out', () => {
      seed.workItem('wi-1');
      seed.grant('sp-b', { value: 20, workItems: ['wi-1'] });
      seed.grant('sp-a', { value: 15, workItems: ['wi-1'] });
      seed.grant('sp-rej', { status: 'rejected', workItems: ['wi-1'] });
      expect(page('wi-1').grants.map((g) => g.name)).toEqual(['Grant sp-a', 'Grant sp-b']);
    });

    it('is an empty list without grants', () => {
      seed.workItem('wi-1');
      expect(page('wi-1').grants).toEqual([]);
    });
  });

  describe('waits for and holds up', () => {
    function chain() {
      task('a', { status: 'in_progress', startDate: '2026-03-01', endDate: '2026-03-12' });
      task('b', { startDate: '2026-03-13', endDate: '2026-03-15' });
      task('c', { startDate: '2026-03-16', endDate: '2026-03-18' });
      depend('a', 'b');
      depend('b', 'c');
    }

    it('names the first unfinished predecessor and counts what the task holds up', () => {
      chain();
      const a = page('a');
      expect(a.waitsFor).toBeNull();
      expect(a.holdsUp).toEqual({ count: 2, startingWithin14Days: 2 });
      const b = page('b');
      expect(b.waitsFor).toEqual({ id: 'a', title: 'Task a', more: 0 });
      expect(b.holdsUp?.count).toBe(1);
    });

    it('is null for both on a task with no dependencies', () => {
      task('solo');
      expect(page('solo')).toMatchObject({ waitsFor: null, holdsUp: null });
    });

    it('is null for both once the task is completed', () => {
      chain();
      db.update(schema.workItems)
        .set({ status: 'completed', actualStartDate: '2026-03-02', actualEndDate: '2026-03-09' })
        .where(eq(schema.workItems.id, 'b'))
        .run();
      const b = page('b');
      expect(b.waitsFor).toBeNull();
      expect(b.holdsUp).toBeNull();
    });

    it('uses opts.now for the 14-day window (deterministic)', () => {
      chain();
      task('far', { startDate: '2026-06-01', endDate: '2026-06-03' });
      depend('a', 'far');
      const near = page('a', NOW).holdsUp!;
      expect(near).toEqual({ count: 3, startingWithin14Days: 2 });
      expect(page('a', NOW)).toEqual(page('a', NOW));
      // Moving today into late May pulls the late chain forward and "far" into the window
      expect(page('a', new Date('2026-05-25T09:00:00Z')).holdsUp).not.toEqual(near);
    });
  });

  it('defaults now to the current date when omitted', () => {
    task('wi-1');
    expect(getWorkItemPageDetail(db, 'wi-1', { vatRate: 0.19 }).id).toBe('wi-1');
  });

  it('keeps the base detail fields (title, subtasks, dependencies)', () => {
    task('wi-1');
    const detail = page('wi-1');
    expect(detail).toMatchObject({ id: 'wi-1', title: 'Task wi-1', subtasks: [] });
    expect(detail).not.toHaveProperty('isCritical');
  });
});
