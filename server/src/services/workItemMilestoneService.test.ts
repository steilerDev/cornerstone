/**
 * Unit tests for workItemMilestoneService.
 *
 * Tests the bidirectional milestone relationship logic:
 * - getWorkItemMilestones: returns required and linked milestone arrays
 * - addRequiredMilestone: links a milestone as a dependency of a work item
 * - removeRequiredMilestone: removes a required milestone dependency
 * - addLinkedMilestone: links a work item as a contributor to a milestone
 * - removeLinkedMilestone: removes a linked milestone association
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as workItemMilestoneService from './workItemMilestoneService.js';
import { NotFoundError, ConflictError } from '../errors/AppError.js';

describe('Work Item Milestone Service', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  /**
   * Creates a fresh in-memory database with migrations applied.
   */
  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  /**
   * Helper: Insert a test user and return the ID.
   */
  function insertTestUser(email: string, displayName: string): string {
    const now = new Date().toISOString();
    const userId = `user-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    db.insert(schema.users)
      .values({
        id: userId,
        email,
        displayName,
        role: 'member',
        authProvider: 'local',
        passwordHash: '$scrypt$n=16384,r=8,p=1$c29tZXNhbHQ=$c29tZWhhc2g=',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return userId;
  }

  /**
   * Helper: Insert a test work item and return the ID.
   */
  function insertTestWorkItem(userId: string, title: string): string {
    const now = new Date().toISOString();
    const workItemId = `wi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    db.insert(schema.workItems)
      .values({
        id: workItemId,
        title,
        status: 'not_started',
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return workItemId;
  }

  /**
   * Helper: Insert a test milestone and return the ID.
   */
  function insertTestMilestone(title: string, targetDate = '2026-06-01'): number {
    const now = new Date().toISOString();
    const result = db
      .insert(schema.milestones)
      .values({
        title,
        targetDate,
        description: null,
        isCompleted: false,
        completedAt: null,
        color: null,
        createdBy: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: schema.milestones.id })
      .get();
    return result!.id;
  }

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterEach(() => {
    if (sqlite && sqlite.open) {
      sqlite.close();
    }
  });

  // ─── getWorkItemMilestones ──────────────────────────────────────────────────

  describe('getWorkItemMilestones()', () => {
    it('returns empty required and linked arrays for a work item with no milestone relationships', () => {
      // Given: A work item with no milestone links
      const userId = insertTestUser('user@example.com', 'Test User');
      const workItemId = insertTestWorkItem(userId, 'Install electrical panel');

      // When: Getting milestones for the work item
      const result = workItemMilestoneService.getWorkItemMilestones(db, workItemId);

      // Then: Both arrays are empty
      expect(result.required).toEqual([]);
      expect(result.linked).toEqual([]);
    });

    it('returns required milestones when the work item has required milestone deps', () => {
      // Given: A work item linked to a required milestone
      const userId = insertTestUser('user@example.com', 'Test User');
      const workItemId = insertTestWorkItem(userId, 'Pour foundation');
      const milestoneId = insertTestMilestone('Foundation Approval');

      db.insert(schema.workItemMilestoneDeps).values({ workItemId, milestoneId }).run();

      // When: Getting milestones
      const result = workItemMilestoneService.getWorkItemMilestones(db, workItemId);

      // Then: Required array has the milestone; linked is empty
      expect(result.required).toHaveLength(1);
      expect(result.required[0].id).toBe(milestoneId);
      expect(result.required[0].name).toBe('Foundation Approval');
      expect(result.required[0].targetDate).toBe('2026-06-01');
      expect(result.linked).toEqual([]);
    });

    it('returns linked milestones when the work item contributes to a milestone', () => {
      // Given: A work item linked to a milestone as a contributor
      const userId = insertTestUser('user@example.com', 'Test User');
      const workItemId = insertTestWorkItem(userId, 'Install plumbing');
      const milestoneId = insertTestMilestone('Rough-In Complete');

      db.insert(schema.milestoneWorkItems).values({ milestoneId, workItemId }).run();

      // When: Getting milestones
      const result = workItemMilestoneService.getWorkItemMilestones(db, workItemId);

      // Then: Linked array has the milestone; required is empty
      expect(result.linked).toHaveLength(1);
      expect(result.linked[0].id).toBe(milestoneId);
      expect(result.linked[0].name).toBe('Rough-In Complete');
      expect(result.required).toEqual([]);
    });

    it('returns both required and linked milestones when both exist', () => {
      // Given: A work item with both types of milestone relationships
      const userId = insertTestUser('user@example.com', 'Test User');
      const workItemId = insertTestWorkItem(userId, 'Install drywall');
      const reqMilestoneId = insertTestMilestone('Framing Inspection');
      const linkedMilestoneId = insertTestMilestone('Drywall Complete', '2026-07-01');

      db.insert(schema.workItemMilestoneDeps)
        .values({ workItemId, milestoneId: reqMilestoneId })
        .run();
      db.insert(schema.milestoneWorkItems)
        .values({ milestoneId: linkedMilestoneId, workItemId })
        .run();

      // When: Getting milestones
      const result = workItemMilestoneService.getWorkItemMilestones(db, workItemId);

      // Then: Both arrays are populated with correct milestones
      expect(result.required).toHaveLength(1);
      expect(result.required[0].id).toBe(reqMilestoneId);
      expect(result.required[0].name).toBe('Framing Inspection');

      expect(result.linked).toHaveLength(1);
      expect(result.linked[0].id).toBe(linkedMilestoneId);
      expect(result.linked[0].name).toBe('Drywall Complete');
    });

    it('returns multiple required milestones when multiple exist', () => {
      // Given: A work item depending on multiple milestones
      const userId = insertTestUser('user@example.com', 'Test User');
      const workItemId = insertTestWorkItem(userId, 'Interior finishing');
      const milestone1Id = insertTestMilestone('Permits Approved', '2026-04-01');
      const milestone2Id = insertTestMilestone('Rough-In Inspected', '2026-05-01');
      const milestone3Id = insertTestMilestone('Frame Signed Off', '2026-05-15');

      db.insert(schema.workItemMilestoneDeps)
        .values({ workItemId, milestoneId: milestone1Id })
        .run();
      db.insert(schema.workItemMilestoneDeps)
        .values({ workItemId, milestoneId: milestone2Id })
        .run();
      db.insert(schema.workItemMilestoneDeps)
        .values({ workItemId, milestoneId: milestone3Id })
        .run();

      // When: Getting milestones
      const result = workItemMilestoneService.getWorkItemMilestones(db, workItemId);

      // Then: All three required milestones are returned
      expect(result.required).toHaveLength(3);
      const ids = result.required.map((m) => m.id);
      expect(ids).toContain(milestone1Id);
      expect(ids).toContain(milestone2Id);
      expect(ids).toContain(milestone3Id);
    });

    it('throws NotFoundError when work item does not exist', () => {
      // When/Then: Throws NotFoundError for a non-existent work item
      expect(() =>
        workItemMilestoneService.getWorkItemMilestones(db, 'non-existent-id'),
      ).toThrow(NotFoundError);
    });
  });

  // ─── addRequiredMilestone ───────────────────────────────────────────────────

  describe('addRequiredMilestone()', () => {
    it('adds a required milestone dependency and returns updated WorkItemMilestones', () => {
      // Given: An existing work item and milestone
      const userId = insertTestUser('user@example.com', 'Test User');
      const workItemId = insertTestWorkItem(userId, 'Lay tiles');
      const milestoneId = insertTestMilestone('Waterproofing Approved');

      // When: Adding the required milestone
      const result = workItemMilestoneService.addRequiredMilestone(db, workItemId, milestoneId);

      // Then: Returns updated milestones with the new required entry
      expect(result.required).toHaveLength(1);
      expect(result.required[0].id).toBe(milestoneId);
      expect(result.required[0].name).toBe('Waterproofing Approved');
      expect(result.linked).toEqual([]);
    });

    it('throws NotFoundError when work item does not exist', () => {
      // Given: A real milestone but no work item
      const milestoneId = insertTestMilestone('Some Milestone');

      // When/Then: Throws NotFoundError
      expect(() =>
        workItemMilestoneService.addRequiredMilestone(db, 'nonexistent-wi', milestoneId),
      ).toThrow(NotFoundError);
    });

    it('throws NotFoundError when milestone does not exist', () => {
      // Given: A real work item but non-existent milestone
      const userId = insertTestUser('user@example.com', 'Test User');
      const workItemId = insertTestWorkItem(userId, 'Paint walls');

      // When/Then: Throws NotFoundError
      expect(() =>
        workItemMilestoneService.addRequiredMilestone(db, workItemId, 99999),
      ).toThrow(NotFoundError);
    });

    it('throws ConflictError when the required dependency already exists (duplicate)', () => {
      // Given: A work item that already requires the milestone
      const userId = insertTestUser('user@example.com', 'Test User');
      const workItemId = insertTestWorkItem(userId, 'Install HVAC');
      const milestoneId = insertTestMilestone('Ductwork Approved');

      workItemMilestoneService.addRequiredMilestone(db, workItemId, milestoneId);

      // When/Then: Adding the same dependency again throws ConflictError
      expect(() =>
        workItemMilestoneService.addRequiredMilestone(db, workItemId, milestoneId),
      ).toThrow(ConflictError);
    });

    it('throws ConflictError when cross-linking: cannot require a milestone already linked as contributor', () => {
      // Given: Work item is already a contributor to the milestone
      const userId = insertTestUser('user@example.com', 'Test User');
      const workItemId = insertTestWorkItem(userId, 'Finish basement');
      const milestoneId = insertTestMilestone('Basement Complete');

      // Link work item as contributor first
      db.insert(schema.milestoneWorkItems).values({ milestoneId, workItemId }).run();

      // When/Then: Trying to also mark it as required should throw ConflictError
      expect(() =>
        workItemMilestoneService.addRequiredMilestone(db, workItemId, milestoneId),
      ).toThrow(ConflictError);
    });

    it('allows same milestone to be required by different work items', () => {
      // Given: Two work items and one shared milestone
      const userId = insertTestUser('user@example.com', 'Test User');
      const workItemA = insertTestWorkItem(userId, 'Work Item A');
      const workItemB = insertTestWorkItem(userId, 'Work Item B');
      const milestoneId = insertTestMilestone('Shared Milestone');

      // When: Both work items add the same required milestone
      const resultA = workItemMilestoneService.addRequiredMilestone(db, workItemA, milestoneId);
      const resultB = workItemMilestoneService.addRequiredMilestone(db, workItemB, milestoneId);

      // Then: Both succeed independently
      expect(resultA.required).toHaveLength(1);
      expect(resultB.required).toHaveLength(1);
    });
  });

  // ─── removeRequiredMilestone ────────────────────────────────────────────────

  describe('removeRequiredMilestone()', () => {
    it('removes a required milestone dependency successfully', () => {
      // Given: A work item that requires a milestone
      const userId = insertTestUser('user@example.com', 'Test User');
      const workItemId = insertTestWorkItem(userId, 'Install windows');
      const milestoneId = insertTestMilestone('Frame Complete');

      workItemMilestoneService.addRequiredMilestone(db, workItemId, milestoneId);

      // When: Removing the dependency
      workItemMilestoneService.removeRequiredMilestone(db, workItemId, milestoneId);

      // Then: The dependency is gone
      const result = workItemMilestoneService.getWorkItemMilestones(db, workItemId);
      expect(result.required).toHaveLength(0);
    });

    it('throws NotFoundError when work item does not exist', () => {
      // Given: A real milestone but no work item
      const milestoneId = insertTestMilestone('Some Milestone');

      // When/Then: Throws NotFoundError
      expect(() =>
        workItemMilestoneService.removeRequiredMilestone(db, 'nonexistent-wi', milestoneId),
      ).toThrow(NotFoundError);
    });

    it('throws NotFoundError when milestone does not exist', () => {
      // Given: A real work item but non-existent milestone
      const userId = insertTestUser('user@example.com', 'Test User');
      const workItemId = insertTestWorkItem(userId, 'Install cabinets');

      // When/Then: Throws NotFoundError
      expect(() =>
        workItemMilestoneService.removeRequiredMilestone(db, workItemId, 99999),
      ).toThrow(NotFoundError);
    });

    it('throws NotFoundError when the dependency does not exist (work item and milestone exist but not linked)', () => {
      // Given: Both work item and milestone exist but no dependency between them
      const userId = insertTestUser('user@example.com', 'Test User');
      const workItemId = insertTestWorkItem(userId, 'Install countertops');
      const milestoneId = insertTestMilestone('Kitchen Milestone');

      // When/Then: Throws NotFoundError
      expect(() =>
        workItemMilestoneService.removeRequiredMilestone(db, workItemId, milestoneId),
      ).toThrow(NotFoundError);
    });

    it('removes only the targeted dependency when multiple required milestones exist', () => {
      // Given: A work item with two required milestones
      const userId = insertTestUser('user@example.com', 'Test User');
      const workItemId = insertTestWorkItem(userId, 'Final inspection');
      const milestone1Id = insertTestMilestone('Electrical Signed Off', '2026-04-01');
      const milestone2Id = insertTestMilestone('Plumbing Signed Off', '2026-04-15');

      workItemMilestoneService.addRequiredMilestone(db, workItemId, milestone1Id);
      workItemMilestoneService.addRequiredMilestone(db, workItemId, milestone2Id);

      // When: Removing only the first milestone
      workItemMilestoneService.removeRequiredMilestone(db, workItemId, milestone1Id);

      // Then: Only the second milestone remains
      const result = workItemMilestoneService.getWorkItemMilestones(db, workItemId);
      expect(result.required).toHaveLength(1);
      expect(result.required[0].id).toBe(milestone2Id);
    });
  });

  // ─── addLinkedMilestone ─────────────────────────────────────────────────────

  describe('addLinkedMilestone()', () => {
    it('adds a linked milestone and returns updated WorkItemMilestones', () => {
      // Given: An existing work item and milestone
      const userId = insertTestUser('user@example.com', 'Test User');
      const workItemId = insertTestWorkItem(userId, 'Pour concrete slab');
      const milestoneId = insertTestMilestone('Foundation Phase Complete');

      // When: Adding the linked milestone
      const result = workItemMilestoneService.addLinkedMilestone(db, workItemId, milestoneId);

      // Then: Returns updated milestones with the new linked entry
      expect(result.linked).toHaveLength(1);
      expect(result.linked[0].id).toBe(milestoneId);
      expect(result.linked[0].name).toBe('Foundation Phase Complete');
      expect(result.required).toEqual([]);
    });

    it('throws NotFoundError when work item does not exist', () => {
      // Given: A real milestone but no work item
      const milestoneId = insertTestMilestone('Some Milestone');

      // When/Then: Throws NotFoundError
      expect(() =>
        workItemMilestoneService.addLinkedMilestone(db, 'nonexistent-wi', milestoneId),
      ).toThrow(NotFoundError);
    });

    it('throws NotFoundError when milestone does not exist', () => {
      // Given: A real work item but non-existent milestone
      const userId = insertTestUser('user@example.com', 'Test User');
      const workItemId = insertTestWorkItem(userId, 'Install roof decking');

      // When/Then: Throws NotFoundError
      expect(() =>
        workItemMilestoneService.addLinkedMilestone(db, workItemId, 99999),
      ).toThrow(NotFoundError);
    });

    it('throws ConflictError when the linked association already exists (duplicate)', () => {
      // Given: A work item already linked to the milestone
      const userId = insertTestUser('user@example.com', 'Test User');
      const workItemId = insertTestWorkItem(userId, 'Install shingles');
      const milestoneId = insertTestMilestone('Roofing Phase Complete');

      workItemMilestoneService.addLinkedMilestone(db, workItemId, milestoneId);

      // When/Then: Adding the same link again throws ConflictError
      expect(() =>
        workItemMilestoneService.addLinkedMilestone(db, workItemId, milestoneId),
      ).toThrow(ConflictError);
    });

    it('throws ConflictError when cross-linking: cannot link as contributor to a milestone already required', () => {
      // Given: Work item already requires the milestone as a dependency
      const userId = insertTestUser('user@example.com', 'Test User');
      const workItemId = insertTestWorkItem(userId, 'Finish attic');
      const milestoneId = insertTestMilestone('Attic Milestone');

      // Add as required first
      db.insert(schema.workItemMilestoneDeps).values({ workItemId, milestoneId }).run();

      // When/Then: Trying to also add as linked should throw ConflictError
      expect(() =>
        workItemMilestoneService.addLinkedMilestone(db, workItemId, milestoneId),
      ).toThrow(ConflictError);
    });

    it('allows same milestone to be contributed to by different work items', () => {
      // Given: Two work items and one shared milestone
      const userId = insertTestUser('user@example.com', 'Test User');
      const workItemA = insertTestWorkItem(userId, 'Task A');
      const workItemB = insertTestWorkItem(userId, 'Task B');
      const milestoneId = insertTestMilestone('Phase Complete');

      // When: Both work items link to the same milestone
      const resultA = workItemMilestoneService.addLinkedMilestone(db, workItemA, milestoneId);
      const resultB = workItemMilestoneService.addLinkedMilestone(db, workItemB, milestoneId);

      // Then: Both succeed independently
      expect(resultA.linked).toHaveLength(1);
      expect(resultB.linked).toHaveLength(1);
    });
  });

  // ─── removeLinkedMilestone ──────────────────────────────────────────────────

  describe('removeLinkedMilestone()', () => {
    it('removes a linked milestone association successfully', () => {
      // Given: A work item linked to a milestone
      const userId = insertTestUser('user@example.com', 'Test User');
      const workItemId = insertTestWorkItem(userId, 'Frame interior walls');
      const milestoneId = insertTestMilestone('Framing Complete');

      workItemMilestoneService.addLinkedMilestone(db, workItemId, milestoneId);

      // When: Removing the link
      workItemMilestoneService.removeLinkedMilestone(db, workItemId, milestoneId);

      // Then: The link is gone
      const result = workItemMilestoneService.getWorkItemMilestones(db, workItemId);
      expect(result.linked).toHaveLength(0);
    });

    it('throws NotFoundError when work item does not exist', () => {
      // Given: A real milestone but no work item
      const milestoneId = insertTestMilestone('Some Milestone');

      // When/Then: Throws NotFoundError
      expect(() =>
        workItemMilestoneService.removeLinkedMilestone(db, 'nonexistent-wi', milestoneId),
      ).toThrow(NotFoundError);
    });

    it('throws NotFoundError when milestone does not exist', () => {
      // Given: A real work item but non-existent milestone
      const userId = insertTestUser('user@example.com', 'Test User');
      const workItemId = insertTestWorkItem(userId, 'Install gutters');

      // When/Then: Throws NotFoundError
      expect(() =>
        workItemMilestoneService.removeLinkedMilestone(db, workItemId, 99999),
      ).toThrow(NotFoundError);
    });

    it('throws NotFoundError when the link does not exist (work item and milestone exist but not linked)', () => {
      // Given: Both work item and milestone exist but no link between them
      const userId = insertTestUser('user@example.com', 'Test User');
      const workItemId = insertTestWorkItem(userId, 'Install downspouts');
      const milestoneId = insertTestMilestone('Exterior Milestone');

      // When/Then: Throws NotFoundError
      expect(() =>
        workItemMilestoneService.removeLinkedMilestone(db, workItemId, milestoneId),
      ).toThrow(NotFoundError);
    });

    it('removes only the targeted link when multiple linked milestones exist', () => {
      // Given: A work item linked to two milestones
      const userId = insertTestUser('user@example.com', 'Test User');
      const workItemId = insertTestWorkItem(userId, 'Complete garage');
      const milestone1Id = insertTestMilestone('Garage Phase 1', '2026-04-01');
      const milestone2Id = insertTestMilestone('Garage Phase 2', '2026-05-01');

      workItemMilestoneService.addLinkedMilestone(db, workItemId, milestone1Id);
      workItemMilestoneService.addLinkedMilestone(db, workItemId, milestone2Id);

      // When: Removing only the first link
      workItemMilestoneService.removeLinkedMilestone(db, workItemId, milestone1Id);

      // Then: Only the second link remains
      const result = workItemMilestoneService.getWorkItemMilestones(db, workItemId);
      expect(result.linked).toHaveLength(1);
      expect(result.linked[0].id).toBe(milestone2Id);
    });
  });

  // ─── toMilestoneSummaryForWorkItem (indirect via getWorkItemMilestones) ─────

  describe('MilestoneSummaryForWorkItem shape', () => {
    it('maps milestone title to the name field in the summary', () => {
      // Given: A milestone with a specific title
      const userId = insertTestUser('user@example.com', 'Test User');
      const workItemId = insertTestWorkItem(userId, 'Test mapping');
      const milestoneId = insertTestMilestone('My Milestone Title');

      db.insert(schema.workItemMilestoneDeps).values({ workItemId, milestoneId }).run();

      // When: Getting milestones
      const result = workItemMilestoneService.getWorkItemMilestones(db, workItemId);

      // Then: The title is exposed as `name` in the summary shape
      expect(result.required[0].name).toBe('My Milestone Title');
    });

    it('exposes targetDate correctly in the summary shape', () => {
      // Given: A milestone with a specific targetDate
      const userId = insertTestUser('user@example.com', 'Test User');
      const workItemId = insertTestWorkItem(userId, 'Test targetDate');
      const milestoneId = insertTestMilestone('Date Check Milestone', '2026-09-15');

      db.insert(schema.workItemMilestoneDeps).values({ workItemId, milestoneId }).run();

      // When: Getting milestones
      const result = workItemMilestoneService.getWorkItemMilestones(db, workItemId);

      // Then: The targetDate matches what was stored
      expect(result.required[0].targetDate).toBe('2026-09-15');
    });
  });
});
