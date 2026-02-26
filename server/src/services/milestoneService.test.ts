import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as milestoneService from './milestoneService.js';
import { NotFoundError, ValidationError, ConflictError } from '../errors/AppError.js';
import type { CreateMilestoneRequest } from '@cornerstone/shared';

describe('Milestone Service', () => {
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
   * Helper: Create a test user and return the user ID.
   */
  function createTestUser(
    email: string,
    displayName: string,
    role: 'admin' | 'member' = 'member',
  ): string {
    const now = new Date().toISOString();
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
   * Helper: Create a test work item and return the work item ID.
   */
  function createTestWorkItem(userId: string, title: string): string {
    const now = new Date().toISOString();
    const workItemId = `work-item-${Date.now()}-${Math.random().toString(36).substring(7)}`;
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

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── getAllMilestones ─────────────────────────────────────────────────────────

  describe('getAllMilestones', () => {
    it('should return empty list when no milestones exist', () => {
      const result = milestoneService.getAllMilestones(db);
      expect(result.milestones).toEqual([]);
    });

    it('should return all milestones sorted by target_date ascending', () => {
      const userId = createTestUser('user@example.com', 'Test User');

      milestoneService.createMilestone(
        db,
        { title: 'Milestone B', targetDate: '2026-06-01' },
        userId,
      );
      milestoneService.createMilestone(
        db,
        { title: 'Milestone A', targetDate: '2026-04-01' },
        userId,
      );
      milestoneService.createMilestone(
        db,
        { title: 'Milestone C', targetDate: '2026-08-01' },
        userId,
      );

      const result = milestoneService.getAllMilestones(db);
      expect(result.milestones).toHaveLength(3);
      expect(result.milestones[0].title).toBe('Milestone A');
      expect(result.milestones[1].title).toBe('Milestone B');
      expect(result.milestones[2].title).toBe('Milestone C');
    });

    it('should include workItemCount=0 when no work items linked', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      milestoneService.createMilestone(
        db,
        { title: 'Empty Milestone', targetDate: '2026-04-15' },
        userId,
      );

      const result = milestoneService.getAllMilestones(db);
      expect(result.milestones[0].workItemCount).toBe(0);
    });

    it('should include correct workItemCount when work items are linked', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      const milestone = milestoneService.createMilestone(
        db,
        { title: 'Milestone With Items', targetDate: '2026-04-15' },
        userId,
      );
      milestoneService.linkWorkItem(db, milestone.id, workItemA);
      milestoneService.linkWorkItem(db, milestone.id, workItemB);

      const result = milestoneService.getAllMilestones(db);
      expect(result.milestones[0].workItemCount).toBe(2);
    });

    it('should include createdBy user info when user exists', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15' },
        userId,
      );

      const result = milestoneService.getAllMilestones(db);
      expect(result.milestones[0].createdBy).not.toBeNull();
      expect(result.milestones[0].createdBy!.id).toBe(userId);
      expect(result.milestones[0].createdBy!.displayName).toBe('Test User');
      expect(result.milestones[0].createdBy!.email).toBe('user@example.com');
    });

    it('should include standard milestone summary fields', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      milestoneService.createMilestone(
        db,
        { title: 'Foundation Complete', targetDate: '2026-04-15', description: 'Desc' },
        userId,
      );

      const result = milestoneService.getAllMilestones(db);
      const ms = result.milestones[0];
      expect(ms.id).toBeDefined();
      expect(ms.title).toBe('Foundation Complete');
      expect(ms.description).toBe('Desc');
      expect(ms.targetDate).toBe('2026-04-15');
      expect(ms.isCompleted).toBe(false);
      expect(ms.completedAt).toBeNull();
      expect(ms.createdAt).toBeDefined();
      expect(ms.updatedAt).toBeDefined();
    });
  });

  // ─── getMilestoneById ─────────────────────────────────────────────────────────

  describe('getMilestoneById', () => {
    it('should return milestone detail by ID', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const created = milestoneService.createMilestone(
        db,
        { title: 'Foundation Complete', targetDate: '2026-04-15' },
        userId,
      );

      const result = milestoneService.getMilestoneById(db, created.id);
      expect(result.id).toBe(created.id);
      expect(result.title).toBe('Foundation Complete');
      expect(result.targetDate).toBe('2026-04-15');
    });

    it('should throw NotFoundError when milestone does not exist', () => {
      expect(() => milestoneService.getMilestoneById(db, 99999)).toThrow(NotFoundError);
      expect(() => milestoneService.getMilestoneById(db, 99999)).toThrow('Milestone not found');
    });

    it('should include linked work items in detail', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemA = createTestWorkItem(userId, 'Pour Foundation');
      const workItemB = createTestWorkItem(userId, 'Install Rebar');

      const created = milestoneService.createMilestone(
        db,
        { title: 'Foundation Complete', targetDate: '2026-04-15' },
        userId,
      );
      milestoneService.linkWorkItem(db, created.id, workItemA);
      milestoneService.linkWorkItem(db, created.id, workItemB);

      const result = milestoneService.getMilestoneById(db, created.id);
      expect(result.workItems).toHaveLength(2);
      const ids = result.workItems.map((w) => w.id);
      expect(ids).toContain(workItemA);
      expect(ids).toContain(workItemB);
    });

    it('should return empty workItems array when no work items linked', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const created = milestoneService.createMilestone(
        db,
        { title: 'Empty Milestone', targetDate: '2026-04-15' },
        userId,
      );

      const result = milestoneService.getMilestoneById(db, created.id);
      expect(result.workItems).toEqual([]);
    });

    it('should include createdBy info', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const created = milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15' },
        userId,
      );

      const result = milestoneService.getMilestoneById(db, created.id);
      expect(result.createdBy).not.toBeNull();
      expect(result.createdBy!.id).toBe(userId);
    });
  });

  // ─── createMilestone ─────────────────────────────────────────────────────────

  describe('createMilestone', () => {
    it('should create a milestone with required fields', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const request: CreateMilestoneRequest = {
        title: 'Foundation Complete',
        targetDate: '2026-04-15',
      };

      const result = milestoneService.createMilestone(db, request, userId);

      expect(result.id).toBeDefined();
      expect(result.title).toBe('Foundation Complete');
      expect(result.targetDate).toBe('2026-04-15');
      expect(result.isCompleted).toBe(false);
      expect(result.completedAt).toBeNull();
      expect(result.description).toBeNull();
      expect(result.color).toBeNull();
      expect(result.workItems).toEqual([]);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('should create a milestone with all optional fields', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const request: CreateMilestoneRequest = {
        title: 'Framing Complete',
        targetDate: '2026-06-01',
        description: 'All framing work finished',
        color: '#EF4444',
      };

      const result = milestoneService.createMilestone(db, request, userId);

      expect(result.title).toBe('Framing Complete');
      expect(result.description).toBe('All framing work finished');
      expect(result.color).toBe('#EF4444');
    });

    it('should trim whitespace from title', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const result = milestoneService.createMilestone(
        db,
        { title: '  Padded Title  ', targetDate: '2026-04-15' },
        userId,
      );
      expect(result.title).toBe('Padded Title');
    });

    it('should set createdBy to the provided userId', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const result = milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15' },
        userId,
      );
      expect(result.createdBy!.id).toBe(userId);
    });

    it('should throw ValidationError when title is empty', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      expect(() =>
        milestoneService.createMilestone(db, { title: '', targetDate: '2026-04-15' }, userId),
      ).toThrow(ValidationError);
      expect(() =>
        milestoneService.createMilestone(db, { title: '', targetDate: '2026-04-15' }, userId),
      ).toThrow('Title is required');
    });

    it('should throw ValidationError when title is only whitespace', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      expect(() =>
        milestoneService.createMilestone(db, { title: '   ', targetDate: '2026-04-15' }, userId),
      ).toThrow(ValidationError);
    });

    it('should throw ValidationError when title exceeds 200 characters', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const longTitle = 'A'.repeat(201);
      expect(() =>
        milestoneService.createMilestone(
          db,
          { title: longTitle, targetDate: '2026-04-15' },
          userId,
        ),
      ).toThrow(ValidationError);
      expect(() =>
        milestoneService.createMilestone(
          db,
          { title: longTitle, targetDate: '2026-04-15' },
          userId,
        ),
      ).toThrow('200 characters');
    });

    it('should throw ValidationError when targetDate is missing', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      expect(() =>
        milestoneService.createMilestone(
          db,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { title: 'Milestone' } as any,
          userId,
        ),
      ).toThrow(ValidationError);
      expect(() =>
        milestoneService.createMilestone(
          db,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { title: 'Milestone' } as any,
          userId,
        ),
      ).toThrow('targetDate is required');
    });

    it('should throw ValidationError when targetDate is not a valid YYYY-MM-DD date', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      expect(() =>
        milestoneService.createMilestone(
          db,
          { title: 'Milestone', targetDate: '04/15/2026' },
          userId,
        ),
      ).toThrow(ValidationError);
      expect(() =>
        milestoneService.createMilestone(
          db,
          { title: 'Milestone', targetDate: '04/15/2026' },
          userId,
        ),
      ).toThrow('ISO 8601');
    });

    it('should throw ValidationError when description exceeds 2000 characters', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const longDesc = 'D'.repeat(2001);
      expect(() =>
        milestoneService.createMilestone(
          db,
          { title: 'Milestone', targetDate: '2026-04-15', description: longDesc },
          userId,
        ),
      ).toThrow(ValidationError);
      expect(() =>
        milestoneService.createMilestone(
          db,
          { title: 'Milestone', targetDate: '2026-04-15', description: longDesc },
          userId,
        ),
      ).toThrow('2000 characters');
    });

    it('should throw ValidationError when color is not a valid hex color', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      expect(() =>
        milestoneService.createMilestone(
          db,
          { title: 'Milestone', targetDate: '2026-04-15', color: 'red' },
          userId,
        ),
      ).toThrow(ValidationError);
      expect(() =>
        milestoneService.createMilestone(
          db,
          { title: 'Milestone', targetDate: '2026-04-15', color: 'red' },
          userId,
        ),
      ).toThrow('hex color');
    });

    it('should accept null color', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const result = milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15', color: null },
        userId,
      );
      expect(result.color).toBeNull();
    });

    it('should accept valid lowercase hex color', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const result = milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15', color: '#ef4444' },
        userId,
      );
      expect(result.color).toBe('#ef4444');
    });

    // ── workItemIds on creation ──────────────────────────────────────────────

    it('should link work items when workItemIds is provided', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemA = createTestWorkItem(userId, 'Foundation Work');
      const workItemB = createTestWorkItem(userId, 'Framing Work');

      const result = milestoneService.createMilestone(
        db,
        {
          title: 'Phase 1 Complete',
          targetDate: '2026-06-01',
          workItemIds: [workItemA, workItemB],
        },
        userId,
      );

      expect(result.workItems).toHaveLength(2);
      const ids = result.workItems.map((w) => w.id);
      expect(ids).toContain(workItemA);
      expect(ids).toContain(workItemB);
    });

    it('should create milestone with empty workItemIds array (no junction rows)', () => {
      const userId = createTestUser('user@example.com', 'Test User');

      const result = milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15', workItemIds: [] },
        userId,
      );

      expect(result.workItems).toEqual([]);
    });

    it('should silently skip invalid (non-existent) work item IDs in workItemIds', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const validWorkItem = createTestWorkItem(userId, 'Real Work Item');

      const result = milestoneService.createMilestone(
        db,
        {
          title: 'Milestone',
          targetDate: '2026-04-15',
          workItemIds: [validWorkItem, 'nonexistent-work-item-id'],
        },
        userId,
      );

      // Only the valid work item is linked; invalid IDs are silently skipped
      expect(result.workItems).toHaveLength(1);
      expect(result.workItems[0].id).toBe(validWorkItem);
    });

    it('should create milestone without workItemIds field (backward compatible)', () => {
      const userId = createTestUser('user@example.com', 'Test User');

      const result = milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15' },
        userId,
      );

      // workItemIds field absent — workItems array should be empty
      expect(result.workItems).toEqual([]);
    });

    it('should skip all IDs when workItemIds contains only invalid IDs', () => {
      const userId = createTestUser('user@example.com', 'Test User');

      const result = milestoneService.createMilestone(
        db,
        {
          title: 'Milestone',
          targetDate: '2026-04-15',
          workItemIds: ['invalid-1', 'invalid-2'],
        },
        userId,
      );

      expect(result.workItems).toEqual([]);
    });
  });

  // ─── updateMilestone ─────────────────────────────────────────────────────────

  describe('updateMilestone', () => {
    it('should update title', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const created = milestoneService.createMilestone(
        db,
        { title: 'Old Title', targetDate: '2026-04-15' },
        userId,
      );

      const updated = milestoneService.updateMilestone(db, created.id, { title: 'New Title' });
      expect(updated.title).toBe('New Title');
    });

    it('should update description', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const created = milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15' },
        userId,
      );

      const updated = milestoneService.updateMilestone(db, created.id, {
        description: 'New description',
      });
      expect(updated.description).toBe('New description');
    });

    it('should update targetDate', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const created = milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15' },
        userId,
      );

      const updated = milestoneService.updateMilestone(db, created.id, {
        targetDate: '2026-08-01',
      });
      expect(updated.targetDate).toBe('2026-08-01');
    });

    it('should set completedAt when isCompleted transitions to true', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const created = milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15' },
        userId,
      );
      expect(created.completedAt).toBeNull();

      const updated = milestoneService.updateMilestone(db, created.id, { isCompleted: true });
      expect(updated.isCompleted).toBe(true);
      expect(updated.completedAt).not.toBeNull();
      // completedAt should be a valid ISO timestamp
      expect(new Date(updated.completedAt!).toISOString()).toBe(updated.completedAt);
    });

    it('should clear completedAt when isCompleted transitions to false', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const created = milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15' },
        userId,
      );

      // First mark as completed
      milestoneService.updateMilestone(db, created.id, { isCompleted: true });

      // Then mark as incomplete
      const updated = milestoneService.updateMilestone(db, created.id, { isCompleted: false });
      expect(updated.isCompleted).toBe(false);
      expect(updated.completedAt).toBeNull();
    });

    it('should update color', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const created = milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15' },
        userId,
      );

      const updated = milestoneService.updateMilestone(db, created.id, { color: '#3B82F6' });
      expect(updated.color).toBe('#3B82F6');
    });

    it('should clear color when set to null', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const created = milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15', color: '#EF4444' },
        userId,
      );

      const updated = milestoneService.updateMilestone(db, created.id, { color: null });
      expect(updated.color).toBeNull();
    });

    it('should update updatedAt timestamp', async () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const created = milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15' },
        userId,
      );
      const originalUpdatedAt = created.updatedAt;

      // Small delay to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = milestoneService.updateMilestone(db, created.id, { title: 'New Title' });
      expect(updated.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('should throw ValidationError when no fields provided', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const created = milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15' },
        userId,
      );

      expect(() => milestoneService.updateMilestone(db, created.id, {})).toThrow(ValidationError);
      expect(() => milestoneService.updateMilestone(db, created.id, {})).toThrow(
        'At least one field must be provided',
      );
    });

    it('should throw NotFoundError when milestone does not exist', () => {
      expect(() => milestoneService.updateMilestone(db, 99999, { title: 'New Title' })).toThrow(
        NotFoundError,
      );
      expect(() => milestoneService.updateMilestone(db, 99999, { title: 'New Title' })).toThrow(
        'Milestone not found',
      );
    });

    it('should throw ValidationError when title is empty string', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const created = milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15' },
        userId,
      );

      expect(() => milestoneService.updateMilestone(db, created.id, { title: '' })).toThrow(
        ValidationError,
      );
    });

    it('should throw ValidationError when title exceeds 200 characters', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const created = milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15' },
        userId,
      );
      const longTitle = 'A'.repeat(201);

      expect(() => milestoneService.updateMilestone(db, created.id, { title: longTitle })).toThrow(
        ValidationError,
      );
    });

    it('should throw ValidationError when targetDate format is invalid', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const created = milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15' },
        userId,
      );

      expect(() =>
        milestoneService.updateMilestone(db, created.id, { targetDate: 'not-a-date' }),
      ).toThrow(ValidationError);
    });

    it('should throw ValidationError when color is invalid hex', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const created = milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15' },
        userId,
      );

      expect(() => milestoneService.updateMilestone(db, created.id, { color: 'blue' })).toThrow(
        ValidationError,
      );
    });

    it('should throw ValidationError when description exceeds 2000 characters', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const created = milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15' },
        userId,
      );
      const longDesc = 'D'.repeat(2001);

      expect(() =>
        milestoneService.updateMilestone(db, created.id, { description: longDesc }),
      ).toThrow(ValidationError);
    });
  });

  // ─── deleteMilestone ─────────────────────────────────────────────────────────

  describe('deleteMilestone', () => {
    it('should delete an existing milestone', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const created = milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15' },
        userId,
      );

      milestoneService.deleteMilestone(db, created.id);

      expect(() => milestoneService.getMilestoneById(db, created.id)).toThrow(NotFoundError);
    });

    it('should throw NotFoundError when milestone does not exist', () => {
      expect(() => milestoneService.deleteMilestone(db, 99999)).toThrow(NotFoundError);
      expect(() => milestoneService.deleteMilestone(db, 99999)).toThrow('Milestone not found');
    });

    it('should cascade-delete work item links when milestone is deleted', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      const milestone = milestoneService.createMilestone(
        db,
        { title: 'Milestone With Items', targetDate: '2026-04-15' },
        userId,
      );
      milestoneService.linkWorkItem(db, milestone.id, workItemA);
      milestoneService.linkWorkItem(db, milestone.id, workItemB);

      // Verify links exist before delete
      const beforeDelete = milestoneService.getMilestoneById(db, milestone.id);
      expect(beforeDelete.workItems).toHaveLength(2);

      // Delete the milestone
      milestoneService.deleteMilestone(db, milestone.id);

      // Verify the milestone is gone
      expect(() => milestoneService.getMilestoneById(db, milestone.id)).toThrow(NotFoundError);

      // Verify the work items themselves are not deleted by linking them to a new milestone
      // If linkWorkItem throws NotFoundError, the work items were erroneously deleted
      const anotherMilestone = milestoneService.createMilestone(
        db,
        { title: 'Another Milestone', targetDate: '2026-05-01' },
        userId,
      );
      milestoneService.linkWorkItem(db, anotherMilestone.id, workItemA);
      milestoneService.linkWorkItem(db, anotherMilestone.id, workItemB);
      const afterCheck = milestoneService.getMilestoneById(db, anotherMilestone.id);
      expect(afterCheck.workItems).toHaveLength(2);
    });
  });

  // ─── linkWorkItem ─────────────────────────────────────────────────────────────

  describe('linkWorkItem', () => {
    it('should link a work item to a milestone and return link response', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = createTestWorkItem(userId, 'Pour Foundation');
      const milestone = milestoneService.createMilestone(
        db,
        { title: 'Foundation Complete', targetDate: '2026-04-15' },
        userId,
      );

      const result = milestoneService.linkWorkItem(db, milestone.id, workItem);

      expect(result.milestoneId).toBe(milestone.id);
      expect(result.workItemId).toBe(workItem);
    });

    it('should make the linked work item appear in getMilestoneById', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = createTestWorkItem(userId, 'Pour Foundation');
      const milestone = milestoneService.createMilestone(
        db,
        { title: 'Foundation Complete', targetDate: '2026-04-15' },
        userId,
      );

      milestoneService.linkWorkItem(db, milestone.id, workItem);

      const detail = milestoneService.getMilestoneById(db, milestone.id);
      expect(detail.workItems).toHaveLength(1);
      expect(detail.workItems[0].id).toBe(workItem);
      expect(detail.workItems[0].title).toBe('Pour Foundation');
    });

    it('should increment workItemCount in getAllMilestones', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');
      const milestone = milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15' },
        userId,
      );

      milestoneService.linkWorkItem(db, milestone.id, workItemA);
      milestoneService.linkWorkItem(db, milestone.id, workItemB);

      const list = milestoneService.getAllMilestones(db);
      expect(list.milestones[0].workItemCount).toBe(2);
    });

    it('should throw NotFoundError when milestone does not exist', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = createTestWorkItem(userId, 'Work Item');

      expect(() => milestoneService.linkWorkItem(db, 99999, workItem)).toThrow(NotFoundError);
      expect(() => milestoneService.linkWorkItem(db, 99999, workItem)).toThrow(
        'Milestone not found',
      );
    });

    it('should throw NotFoundError when work item does not exist', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const milestone = milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15' },
        userId,
      );

      expect(() =>
        milestoneService.linkWorkItem(db, milestone.id, 'nonexistent-work-item'),
      ).toThrow(NotFoundError);
      expect(() =>
        milestoneService.linkWorkItem(db, milestone.id, 'nonexistent-work-item'),
      ).toThrow('Work item not found');
    });

    it('should throw ConflictError when work item is already linked to this milestone', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = createTestWorkItem(userId, 'Work Item');
      const milestone = milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15' },
        userId,
      );

      // Link once — should succeed
      milestoneService.linkWorkItem(db, milestone.id, workItem);

      // Link again — should fail with ConflictError
      expect(() => milestoneService.linkWorkItem(db, milestone.id, workItem)).toThrow(
        ConflictError,
      );
      expect(() => milestoneService.linkWorkItem(db, milestone.id, workItem)).toThrow(
        'already linked',
      );
    });

    it('should allow same work item to be linked to different milestones', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = createTestWorkItem(userId, 'Shared Work Item');
      const milestoneA = milestoneService.createMilestone(
        db,
        { title: 'Milestone A', targetDate: '2026-04-15' },
        userId,
      );
      const milestoneB = milestoneService.createMilestone(
        db,
        { title: 'Milestone B', targetDate: '2026-06-01' },
        userId,
      );

      // Both links should succeed without conflict
      milestoneService.linkWorkItem(db, milestoneA.id, workItem);
      milestoneService.linkWorkItem(db, milestoneB.id, workItem);

      const detailA = milestoneService.getMilestoneById(db, milestoneA.id);
      const detailB = milestoneService.getMilestoneById(db, milestoneB.id);
      expect(detailA.workItems).toHaveLength(1);
      expect(detailB.workItems).toHaveLength(1);
    });
  });

  // ─── unlinkWorkItem ───────────────────────────────────────────────────────────

  describe('unlinkWorkItem', () => {
    it('should unlink a work item from a milestone', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = createTestWorkItem(userId, 'Pour Foundation');
      const milestone = milestoneService.createMilestone(
        db,
        { title: 'Foundation Complete', targetDate: '2026-04-15' },
        userId,
      );

      milestoneService.linkWorkItem(db, milestone.id, workItem);

      // Verify it's linked
      const before = milestoneService.getMilestoneById(db, milestone.id);
      expect(before.workItems).toHaveLength(1);

      // Unlink
      milestoneService.unlinkWorkItem(db, milestone.id, workItem);

      // Verify it's unlinked
      const after = milestoneService.getMilestoneById(db, milestone.id);
      expect(after.workItems).toHaveLength(0);
    });

    it('should only unlink the specified work item', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');
      const milestone = milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15' },
        userId,
      );

      milestoneService.linkWorkItem(db, milestone.id, workItemA);
      milestoneService.linkWorkItem(db, milestone.id, workItemB);

      milestoneService.unlinkWorkItem(db, milestone.id, workItemA);

      const after = milestoneService.getMilestoneById(db, milestone.id);
      expect(after.workItems).toHaveLength(1);
      expect(after.workItems[0].id).toBe(workItemB);
    });

    it('should throw NotFoundError when milestone does not exist', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = createTestWorkItem(userId, 'Work Item');

      expect(() => milestoneService.unlinkWorkItem(db, 99999, workItem)).toThrow(NotFoundError);
      expect(() => milestoneService.unlinkWorkItem(db, 99999, workItem)).toThrow(
        'Milestone not found',
      );
    });

    it('should throw NotFoundError when work item does not exist', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const milestone = milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15' },
        userId,
      );

      expect(() => milestoneService.unlinkWorkItem(db, milestone.id, 'nonexistent-id')).toThrow(
        NotFoundError,
      );
      expect(() => milestoneService.unlinkWorkItem(db, milestone.id, 'nonexistent-id')).toThrow(
        'Work item not found',
      );
    });

    it('should throw NotFoundError when work item is not linked to the milestone', () => {
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = createTestWorkItem(userId, 'Work Item');
      const milestone = milestoneService.createMilestone(
        db,
        { title: 'Milestone', targetDate: '2026-04-15' },
        userId,
      );

      // Never linked — should throw NotFoundError
      expect(() => milestoneService.unlinkWorkItem(db, milestone.id, workItem)).toThrow(
        NotFoundError,
      );
      expect(() => milestoneService.unlinkWorkItem(db, milestone.id, workItem)).toThrow(
        'not linked',
      );
    });
  });
});
