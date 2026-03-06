/**
 * Tests for bug #482 — Household item schedule not recalculated when constraint dates change.
 *
 * Verifies that updateHouseholdItem() triggers autoReschedule() when any scheduling-relevant
 * field is changed (earliestDeliveryDate, latestDeliveryDate, actualDeliveryDate, status),
 * and that the resulting targetDeliveryDate and isLate values are correctly computed.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as householdItemService from './householdItemService.js';

describe('householdItemService — reschedule on constraint change (bug #482)', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  /** Today's date in YYYY-MM-DD format — used for floor-rule assertions. */
  const TODAY = new Date().toISOString().slice(0, 10);

  /** Creates a fresh in-memory database with migrations applied. */
  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  let idCounter = 0;

  /** Helper: Create a test user. */
  function createTestUser(
    email: string = 'user@example.com',
    displayName: string = 'Test User',
    role: 'admin' | 'member' = 'member',
  ): string {
    const now = new Date(Date.now() + idCounter++).toISOString();
    const userId = `user-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    db.insert(schema.users)
      .values({
        id: userId,
        email,
        displayName,
        role,
        authProvider: 'local',
        passwordHash: '$scrypt$n=16384,r=8,p=1$c29tZXNhbHQ=$c29tZWhhc2g=',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return userId;
  }

  /**
   * Helper: Insert a minimal work item directly into the DB.
   *
   * autoReschedule() runs CPM on all work items before computing HI delivery dates.
   * Some tests need a work item in the DB so the schedule result map is populated;
   * others don't need one (HI with only an earliestDeliveryDate and no deps is
   * computed purely from the constraint, not from a predecessor WI end date).
   */
  function insertWorkItem(userId: string, opts: { endDate?: string } = {}): string {
    const now = new Date(Date.now() + idCounter++).toISOString();
    const workItemId = `wi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    db.insert(schema.workItems)
      .values({
        id: workItemId,
        title: 'Dummy Work Item',
        status: 'not_started',
        startDate: opts.endDate ?? null,
        endDate: opts.endDate ?? null,
        actualStartDate: null,
        actualEndDate: null,
        durationDays: null,
        startAfter: null,
        startBefore: null,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return workItemId;
  }

  beforeEach(() => {
    idCounter = 0;
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterEach(() => {
    sqlite.close();
  });

  // ---------------------------------------------------------------------------
  // Scenario 1: earliestDeliveryDate change triggers reschedule
  // ---------------------------------------------------------------------------

  it('updating earliestDeliveryDate triggers reschedule — targetDeliveryDate is updated', () => {
    // Given: A household item with no delivery constraint
    const userId = createTestUser();
    const item = householdItemService.createHouseholdItem(db, userId, {
      name: 'Kitchen Refrigerator',
    });
    expect(item.targetDeliveryDate).toBeNull();

    // When: Setting earliestDeliveryDate to a future date
    const updated = householdItemService.updateHouseholdItem(db, item.id, {
      earliestDeliveryDate: '2030-01-01',
    });

    // Then: targetDeliveryDate is set to the constraint date (no deps, no floor hit)
    expect(updated.targetDeliveryDate).toBe('2030-01-01');
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: latestDeliveryDate change triggers reschedule (no error)
  // ---------------------------------------------------------------------------

  it('updating latestDeliveryDate triggers reschedule without error and returns valid detail', () => {
    // Given: A household item with an earliestDeliveryDate already set.
    // Note: createHouseholdItem does NOT call autoReschedule, so targetDeliveryDate
    // is null immediately after creation. A subsequent scheduling-field update triggers it.
    const userId = createTestUser();
    const item = householdItemService.createHouseholdItem(db, userId, {
      name: 'Living Room Sofa',
      earliestDeliveryDate: '2030-01-01',
    });
    // targetDeliveryDate is null right after creation (no reschedule on create)
    expect(item.targetDeliveryDate).toBeNull();

    // When: Updating with latestDeliveryDate (a scheduling-relevant field) — triggers reschedule
    let updated: ReturnType<typeof householdItemService.updateHouseholdItem> | undefined;
    expect(() => {
      updated = householdItemService.updateHouseholdItem(db, item.id, {
        latestDeliveryDate: '2030-06-01',
      });
    }).not.toThrow();

    // Then: Returns valid HouseholdItemDetail with correct fields
    expect(updated).toBeDefined();
    expect(updated!.id).toBe(item.id);
    expect(updated!.latestDeliveryDate).toBe('2030-06-01');
    // targetDeliveryDate is now driven by earliestDeliveryDate constraint after reschedule
    expect(updated!.targetDeliveryDate).toBe('2030-01-01');
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: status change triggers reschedule — isLate recalculated
  // ---------------------------------------------------------------------------

  it('updating status triggers reschedule — targetDeliveryDate is recalculated', () => {
    // Given: A household item with earliestDeliveryDate in the past.
    // createHouseholdItem does NOT call autoReschedule, so targetDeliveryDate is null.
    const userId = createTestUser();
    const item = householdItemService.createHouseholdItem(db, userId, {
      name: 'Bathroom Tiles',
      earliestDeliveryDate: '2020-01-01',
      status: 'planned',
    });
    expect(item.targetDeliveryDate).toBeNull();

    // When: Updating with status: 'planned' (a scheduling-relevant field) — triggers reschedule
    const updated = householdItemService.updateHouseholdItem(db, item.id, {
      status: 'planned',
    });

    // Then: autoReschedule ran and computed targetDeliveryDate.
    //
    // The CPM logic for household items with no predecessors uses:
    //   maxES = today (default starting point — "no later than today")
    //   es = maxDate(maxES, earliestDeliveryDate) = maxDate(today, '2020-01-01') = today
    //   targetDate = es = today
    // Then the 'planned' floor rule: maxDate(today, today) = today — no floor needed.
    // isLate = false because the date was NOT pushed forward by the floor step.
    //
    // In other words: a past earliestDeliveryDate acts as a no-op constraint —
    // the date is already anchored to today by the default maxES.
    expect(updated.targetDeliveryDate).toBe(TODAY);
    expect(updated.isLate).toBe(false);
  });

  it('updating status triggers reschedule — targetDeliveryDate changes from null to a value', () => {
    // Given: A household item with a future earliestDeliveryDate.
    // createHouseholdItem does NOT call autoReschedule, so targetDeliveryDate starts null.
    const userId = createTestUser();
    const hi = householdItemService.createHouseholdItem(db, userId, {
      name: 'Delayed Bathroom Tiles',
      earliestDeliveryDate: '2030-05-15',
      status: 'purchased',
    });
    expect(hi.targetDeliveryDate).toBeNull();

    // When: Updating status (a scheduling-relevant field) — triggers reschedule
    const updated = householdItemService.updateHouseholdItem(db, hi.id, {
      status: 'scheduled',
    });

    // Then: autoReschedule ran and set targetDeliveryDate from the earliestDeliveryDate constraint
    expect(updated.targetDeliveryDate).toBe('2030-05-15');
    expect(updated.isLate).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Scenario 4: actualDeliveryDate change overrides CPM targetDeliveryDate
  // ---------------------------------------------------------------------------

  it('updating actualDeliveryDate triggers reschedule — actualDeliveryDate overrides CPM', () => {
    // Given: A household item with a future earliestDeliveryDate
    const userId = createTestUser();
    const item = householdItemService.createHouseholdItem(db, userId, {
      name: 'Master Bedroom Bed Frame',
      earliestDeliveryDate: '2030-01-01',
    });

    // When: Setting actualDeliveryDate to a specific date in the past
    const updated = householdItemService.updateHouseholdItem(db, item.id, {
      actualDeliveryDate: '2026-04-01',
    });

    // Then: targetDeliveryDate reflects the actualDeliveryDate (overrides CPM)
    expect(updated.targetDeliveryDate).toBe('2026-04-01');
    // isLate is false when actualDeliveryDate is set (actual dates are authoritative)
    expect(updated.isLate).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Scenario 5: status → 'arrived' auto-sets actualDeliveryDate and triggers reschedule
  // ---------------------------------------------------------------------------

  it("updating status to 'arrived' auto-sets actualDeliveryDate to today and triggers reschedule", () => {
    // Given: A household item with a future earliestDeliveryDate but no actualDeliveryDate
    const userId = createTestUser();
    const item = householdItemService.createHouseholdItem(db, userId, {
      name: 'Dining Table',
      earliestDeliveryDate: '2030-01-01',
      status: 'scheduled',
    });
    expect(item.actualDeliveryDate).toBeNull();

    // When: Updating status to 'arrived' (no explicit actualDeliveryDate in payload)
    const updated = householdItemService.updateHouseholdItem(db, item.id, {
      status: 'arrived',
    });

    // Then: actualDeliveryDate is auto-set to today
    expect(updated.actualDeliveryDate).toBe(TODAY);
    // targetDeliveryDate reflects today (actualDeliveryDate overrides CPM)
    expect(updated.targetDeliveryDate).toBe(TODAY);
    // Arrived items are not flagged late
    expect(updated.isLate).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Scenario 6: non-scheduling field update does NOT trigger reschedule
  // ---------------------------------------------------------------------------

  it('updating a non-scheduling field does not change targetDeliveryDate', () => {
    // Given: A household item with earliestDeliveryDate that triggers a computed target
    const userId = createTestUser();
    const item = householdItemService.createHouseholdItem(db, userId, {
      name: 'Office Chair',
      earliestDeliveryDate: '2030-01-01',
    });

    // First trigger reschedule so targetDeliveryDate is set
    const afterSchedule = householdItemService.updateHouseholdItem(db, item.id, {
      earliestDeliveryDate: '2030-01-01',
    });
    const initialTargetDate = afterSchedule.targetDeliveryDate;
    expect(initialTargetDate).toBe('2030-01-01');

    // When: Updating only a non-scheduling field (name)
    const updated = householdItemService.updateHouseholdItem(db, item.id, {
      name: 'Ergonomic Office Chair',
    });

    // Then: targetDeliveryDate is unchanged
    expect(updated.targetDeliveryDate).toBe(initialTargetDate);
    expect(updated.name).toBe('Ergonomic Office Chair');
  });

  // ---------------------------------------------------------------------------
  // Scenario 7: dependent HI is rescheduled when predecessor's constraint changes
  // ---------------------------------------------------------------------------

  it("predecessor HI constraint change cascades to successor HI's targetDeliveryDate via work item dep", () => {
    // Given: Two household items (A and B) where B depends on a work item
    //        whose end date will be pushed out by A's earliestDeliveryDate.
    //
    // Scenario:
    //   - Work item WI-A has endDate '2030-01-01' (its fixed end date)
    //   - HI-A has no dependency — its earliestDeliveryDate is the test variable
    //   - HI-B has a finish_to_start dependency on WI-A (predecessor)
    //   - After reschedule, HI-B.targetDeliveryDate >= WI-A.endDate
    //
    // We update HI-A's earliestDeliveryDate — autoReschedule reruns, which also
    // recomputes HI-B's targetDeliveryDate from WI-A's end date.

    const userId = createTestUser();

    // Create a work item that will act as HI-B's predecessor
    const wiId = insertWorkItem(userId, { endDate: '2030-03-01' });

    // Create HI-A (independent — just to confirm it is also rescheduled)
    const hiA = householdItemService.createHouseholdItem(db, userId, {
      name: 'HI-A: Kitchen Tiles',
    });

    // Create HI-B with a finish_to_start dep on wiId
    const hiB = householdItemService.createHouseholdItem(db, userId, {
      name: 'HI-B: Kitchen Cabinets',
    });
    db.insert(schema.householdItemDeps)
      .values({
        householdItemId: hiB.id,
        predecessorType: 'work_item',
        predecessorId: wiId,
      })
      .run();

    // When: Updating HI-A with a new earliestDeliveryDate (triggers autoReschedule)
    householdItemService.updateHouseholdItem(db, hiA.id, {
      earliestDeliveryDate: '2030-03-01',
    });

    // Then: HI-B's targetDeliveryDate is updated to reflect WI-A's end date
    const hiBAfter = householdItemService.getHouseholdItemById(db, hiB.id);
    // HI-B depends on WI-A with endDate '2030-03-01'
    // autoReschedule computes HI-B.targetDeliveryDate >= '2030-03-01'
    expect(hiBAfter.targetDeliveryDate).not.toBeNull();
    expect(hiBAfter.targetDeliveryDate! >= '2030-03-01').toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Additional edge case: latestDeliveryDate alone (no earliestDeliveryDate) still runs reschedule
  // ---------------------------------------------------------------------------

  it('updating only latestDeliveryDate on an unconstrained HI still triggers reschedule without error', () => {
    // Given: A household item with no delivery constraints at all
    const userId = createTestUser();
    const item = householdItemService.createHouseholdItem(db, userId, {
      name: 'Guest Room Bed',
    });
    expect(item.targetDeliveryDate).toBeNull();

    // When: Setting only latestDeliveryDate
    let result: ReturnType<typeof householdItemService.updateHouseholdItem> | undefined;
    expect(() => {
      result = householdItemService.updateHouseholdItem(db, item.id, {
        latestDeliveryDate: '2030-12-31',
      });
    }).not.toThrow();

    // Then: Valid response returned; item has no earliestDeliveryDate so
    // targetDeliveryDate remains null (no constraint drives the schedule)
    expect(result).toBeDefined();
    expect(result!.latestDeliveryDate).toBe('2030-12-31');
    expect(result!.targetDeliveryDate).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Additional: clearing earliestDeliveryDate resets targetDeliveryDate to null
  // ---------------------------------------------------------------------------

  it('clearing earliestDeliveryDate to null triggers reschedule — targetDeliveryDate becomes null', () => {
    // Given: A household item with earliestDeliveryDate set
    const userId = createTestUser();
    const item = householdItemService.createHouseholdItem(db, userId, {
      name: 'Patio Furniture Set',
      earliestDeliveryDate: '2030-06-01',
    });

    // First trigger reschedule so targetDeliveryDate is set
    const afterSet = householdItemService.updateHouseholdItem(db, item.id, {
      earliestDeliveryDate: '2030-06-01',
    });
    expect(afterSet.targetDeliveryDate).toBe('2030-06-01');

    // When: Clearing earliestDeliveryDate
    const updated = householdItemService.updateHouseholdItem(db, item.id, {
      earliestDeliveryDate: null,
    });

    // Then: targetDeliveryDate is null (no constraints, no deps)
    expect(updated.earliestDeliveryDate).toBeNull();
    expect(updated.targetDeliveryDate).toBeNull();
  });
});
