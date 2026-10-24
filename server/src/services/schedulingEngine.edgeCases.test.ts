/**
 * Edge cases of the scheduling engine that the feature suites do not reach: cascade graphs
 * with upstream edges and diamonds, cycles next to free items, and household-item
 * dependencies whose predecessor is gone (household_item_deps.predecessor_id has no foreign
 * key). All data is synthetic.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { autoReschedule, schedule } from './schedulingEngine.js';
import type { SchedulingDependency, SchedulingWorkItem } from './schedulingEngine.js';

const TODAY = '2026-01-05';

function item(id: string, durationDays = 2): SchedulingWorkItem {
  return {
    id,
    status: 'not_started',
    startDate: '2026-02-01',
    endDate: null,
    actualStartDate: null,
    actualEndDate: null,
    durationDays,
    startAfter: null,
    startBefore: null,
  };
}

function dep(predecessorId: string, successorId: string): SchedulingDependency {
  return { predecessorId, successorId, dependencyType: 'finish_to_start', leadLagDays: 0 };
}

describe('schedule() graph edge cases', () => {
  it('cascade mode ignores an upstream edge into the anchor and walks a diamond once', () => {
    // U -> A (upstream, outside the cascade), A -> B, A -> C, B -> D, C -> D (diamond)
    const result = schedule({
      mode: 'cascade',
      anchorWorkItemId: 'A',
      workItems: ['U', 'A', 'B', 'C', 'D'].map((id) => item(id)),
      dependencies: [dep('U', 'A'), dep('A', 'B'), dep('A', 'C'), dep('B', 'D'), dep('C', 'D')],
      today: TODAY,
    });

    expect(result.scheduledItems.map((s) => s.workItemId).sort()).toEqual(['A', 'B', 'C', 'D']);
    const byId = new Map(result.scheduledItems.map((s) => [s.workItemId, s]));
    expect(byId.get('D')!.scheduledStartDate).toBe(byId.get('B')!.scheduledEndDate);
  });

  it('reports only the items of a cycle, not a free item scheduled before it', () => {
    const result = schedule({
      mode: 'full',
      workItems: [item('FREE'), item('X'), item('Y')],
      dependencies: [dep('FREE', 'X'), dep('X', 'Y'), dep('Y', 'X')],
      today: TODAY,
    });

    expect([...(result.cycleNodes ?? [])].sort()).toEqual(['X', 'Y']);
  });
});

describe('autoReschedule household item dependency edge cases', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  const NOW = '2026-01-01T00:00:00.000Z';

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
  });

  afterEach(() => {
    sqlite.close();
  });

  function insertWorkItem(id: string, startDate: string, durationDays: number): void {
    db.insert(schema.workItems)
      .values({
        id,
        title: id,
        status: 'not_started',
        startDate,
        durationDays,
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
  }

  function insertHouseholdItem(
    id: string,
    status: 'planned' | 'purchased' | 'scheduled' | 'arrived' = 'planned',
    actualDeliveryDate: string | null = null,
  ): void {
    db.insert(schema.householdItems)
      .values({
        id,
        name: id,
        categoryId: 'hic-furniture',
        status,
        actualDeliveryDate,
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
  }

  function insertDep(
    householdItemId: string,
    predecessorType: 'work_item' | 'milestone',
    predecessorId: string,
  ) {
    db.insert(schema.householdItemDeps)
      .values({
        householdItemId,
        predecessorType,
        predecessorId,
      })
      .run();
  }

  function target(id: string): string | null {
    return db.select().from(schema.householdItems).where(eq(schema.householdItems.id, id)).get()!
      .targetDeliveryDate;
  }

  it('falls back to today for a work item predecessor that no longer exists', () => {
    insertHouseholdItem('hi-a');
    insertDep('hi-a', 'work_item', 'gone-work-item');

    autoReschedule(db, { today: TODAY });

    expect(target('hi-a')).toBe(TODAY);
  });

  it('falls back to today for a milestone predecessor that no longer exists', () => {
    insertHouseholdItem('hi-b');
    insertDep('hi-b', 'milestone', '9999');

    autoReschedule(db, { today: TODAY });

    expect(target('hi-b')).toBe(TODAY);
  });

  it('uses the latest end of the milestone contributors for an open milestone', () => {
    insertWorkItem('wi-short', '2026-03-01', 2);
    insertWorkItem('wi-long', '2026-03-01', 10);
    const milestoneId = db
      .insert(schema.milestones)
      .values({ title: 'Roof', targetDate: '2026-02-01', createdAt: NOW, updatedAt: NOW })
      .returning({ id: schema.milestones.id })
      .get().id;
    db.insert(schema.milestoneWorkItems).values({ milestoneId, workItemId: 'wi-short' }).run();
    db.insert(schema.milestoneWorkItems).values({ milestoneId, workItemId: 'wi-long' }).run();
    insertHouseholdItem('hi-d');
    insertDep('hi-d', 'milestone', String(milestoneId));

    autoReschedule(db, { today: TODAY });

    expect(target('hi-d')).toBe('2026-03-11');
  });

  it.each(['planned', 'purchased', 'scheduled'] as const)(
    'a %s household item behind a finished predecessor is never targeted before today',
    (status) => {
      insertWorkItem('wi-early', '2026-01-01', 1);
      db.update(schema.workItems)
        .set({ status: 'completed', actualStartDate: '2025-12-01', actualEndDate: '2025-12-02' })
        .where(eq(schema.workItems.id, 'wi-early'))
        .run();
      insertHouseholdItem('hi-e', status);
      insertDep('hi-e', 'work_item', 'wi-early');

      autoReschedule(db, { today: TODAY });

      expect(target('hi-e')! >= TODAY).toBe(true);
    },
  );

  it('uses the actual delivery date of an arrived household item instead of the computed target', () => {
    insertWorkItem('wi-late', '2026-03-01', 5);
    insertHouseholdItem('hi-f', 'arrived', '2026-01-02');
    insertDep('hi-f', 'work_item', 'wi-late');

    autoReschedule(db, { today: TODAY });

    expect(target('hi-f')).toBe('2026-01-02');
  });

  it('pushes every work item that requires the same milestone', () => {
    insertWorkItem('wi-contrib', '2026-03-01', 9);
    insertWorkItem('wi-dep-1', '2026-03-01', 2);
    insertWorkItem('wi-dep-2', '2026-03-01', 3);
    const milestoneId = db
      .insert(schema.milestones)
      .values({ title: 'Walls', targetDate: '2026-03-02', createdAt: NOW, updatedAt: NOW })
      .returning({ id: schema.milestones.id })
      .get().id;
    db.insert(schema.milestoneWorkItems).values({ milestoneId, workItemId: 'wi-contrib' }).run();
    db.insert(schema.workItemMilestoneDeps).values({ workItemId: 'wi-dep-1', milestoneId }).run();
    db.insert(schema.workItemMilestoneDeps).values({ workItemId: 'wi-dep-2', milestoneId }).run();

    autoReschedule(db, { today: TODAY });

    const start = (id: string) =>
      db.select().from(schema.workItems).where(eq(schema.workItems.id, id)).get()!.startDate;
    expect(start('wi-dep-1')).toBe('2026-03-10');
    expect(start('wi-dep-2')).toBe('2026-03-10');
  });
});
