import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as subtaskService from './subtaskService.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';
import type {
  CreateSubtaskRequest,
  UpdateSubtaskRequest,
  ReorderSubtasksRequest,
} from '@cornerstone/shared';

describe('Subtask Service', () => {
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
   * Helper: Create a test user
   */
  function createTestUser(email: string, displayName: string, role: 'admin' | 'member' = 'member') {
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
   * Helper: Create a test work item
   */
  function createTestWorkItem(userId: string, title: string) {
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

  /**
   * Helper: Create a test subtask directly in the database
   */
  function createTestSubtask(
    workItemId: string,
    title: string,
    sortOrder: number,
    isCompleted: boolean = false,
  ) {
    const now = new Date().toISOString();
    const subtaskId = `subtask-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    db.insert(schema.workItemSubtasks)
      .values({
        id: subtaskId,
        workItemId,
        title,
        isCompleted,
        sortOrder,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return subtaskId;
  }

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('createSubtask()', () => {
    it('creates a subtask with explicit sortOrder (UAT-3.4-18)', () => {
      // Given: A user and work item exist
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const data: CreateSubtaskRequest = { title: 'First subtask', sortOrder: 0 };

      // When: Creating a subtask
      const result = subtaskService.createSubtask(db, workItemId, data);

      // Then: Subtask is created with specified sortOrder
      expect(result.id).toBeDefined();
      expect(result.title).toBe('First subtask');
      expect(result.isCompleted).toBe(false);
      expect(result.sortOrder).toBe(0);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('creates a subtask without sortOrder (auto-appends to end) (UAT-3.4-19)', () => {
      // Given: A work item with existing subtasks
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      createTestSubtask(workItemId, 'Existing subtask 1', 0);
      createTestSubtask(workItemId, 'Existing subtask 2', 1);

      const data: CreateSubtaskRequest = { title: 'New subtask' };

      // When: Creating a subtask without sortOrder
      const result = subtaskService.createSubtask(db, workItemId, data);

      // Then: Subtask is appended to end (sortOrder = 2)
      expect(result.sortOrder).toBe(2);
      expect(result.title).toBe('New subtask');
    });

    it('auto-generates sortOrder 0 for first subtask', () => {
      // Given: A work item with no subtasks
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const data: CreateSubtaskRequest = { title: 'First subtask' };

      // When: Creating first subtask without sortOrder
      const result = subtaskService.createSubtask(db, workItemId, data);

      // Then: sortOrder is 0
      expect(result.sortOrder).toBe(0);
    });

    it('trims whitespace from subtask title', () => {
      // Given: A user and work item exist
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const data: CreateSubtaskRequest = { title: '  Trimmed title  ' };

      // When: Creating a subtask
      const result = subtaskService.createSubtask(db, workItemId, data);

      // Then: Title is trimmed
      expect(result.title).toBe('Trimmed title');
    });

    it('throws NotFoundError if work item does not exist (UAT-3.4-20)', () => {
      // Given: No work item exists
      const data: CreateSubtaskRequest = { title: 'Subtask on missing work item' };

      // When: Creating a subtask on non-existent work item
      // Then: NotFoundError is thrown
      expect(() => {
        subtaskService.createSubtask(db, 'nonexistent-work-item', data);
      }).toThrow(NotFoundError);
      expect(() => {
        subtaskService.createSubtask(db, 'nonexistent-work-item', data);
      }).toThrow('Work item not found');
    });

    it('throws ValidationError if title is empty after trimming (UAT-3.4-21)', () => {
      // Given: A user and work item exist
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const data: CreateSubtaskRequest = { title: '   ' };

      // When: Creating a subtask with empty title
      // Then: ValidationError is thrown
      expect(() => {
        subtaskService.createSubtask(db, workItemId, data);
      }).toThrow(ValidationError);
      expect(() => {
        subtaskService.createSubtask(db, workItemId, data);
      }).toThrow('Subtask title cannot be empty');
    });

    it('defaults isCompleted to false', () => {
      // Given: A work item exists
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const data: CreateSubtaskRequest = { title: 'New subtask' };

      // When: Creating a subtask
      const result = subtaskService.createSubtask(db, workItemId, data);

      // Then: isCompleted is false
      expect(result.isCompleted).toBe(false);
    });
  });

  describe('listSubtasks()', () => {
    it('returns subtasks sorted by sort_order ASC (UAT-3.4-22)', () => {
      // Given: A work item with multiple subtasks in non-sorted order
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');

      const subtask2Id = createTestSubtask(workItemId, 'Second subtask', 2);
      const subtask0Id = createTestSubtask(workItemId, 'First subtask', 0);
      const subtask1Id = createTestSubtask(workItemId, 'Middle subtask', 1);

      // When: Listing subtasks
      const result = subtaskService.listSubtasks(db, workItemId);

      // Then: Subtasks are sorted by sortOrder ASC
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe(subtask0Id);
      expect(result[0].sortOrder).toBe(0);
      expect(result[1].id).toBe(subtask1Id);
      expect(result[1].sortOrder).toBe(1);
      expect(result[2].id).toBe(subtask2Id);
      expect(result[2].sortOrder).toBe(2);
    });

    it('returns empty array when no subtasks exist (UAT-3.4-23)', () => {
      // Given: A work item with no subtasks
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');

      // When: Listing subtasks
      const result = subtaskService.listSubtasks(db, workItemId);

      // Then: Empty array is returned
      expect(result).toEqual([]);
    });

    it('throws NotFoundError if work item does not exist', () => {
      // Given: No work item exists
      // When: Listing subtasks for non-existent work item
      // Then: NotFoundError is thrown
      expect(() => {
        subtaskService.listSubtasks(db, 'nonexistent-work-item');
      }).toThrow(NotFoundError);
      expect(() => {
        subtaskService.listSubtasks(db, 'nonexistent-work-item');
      }).toThrow('Work item not found');
    });

    it('includes all subtask properties', () => {
      // Given: A work item with a completed subtask
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      createTestSubtask(workItemId, 'Test subtask', 0, true);

      // When: Listing subtasks
      const result = subtaskService.listSubtasks(db, workItemId);

      // Then: All properties are returned
      expect(result).toHaveLength(1);
      expect(result[0].id).toBeDefined();
      expect(result[0].title).toBe('Test subtask');
      expect(result[0].isCompleted).toBe(true);
      expect(result[0].sortOrder).toBe(0);
      expect(result[0].createdAt).toBeDefined();
      expect(result[0].updatedAt).toBeDefined();
    });
  });

  describe('updateSubtask()', () => {
    it('updates subtask title only (UAT-3.4-24)', () => {
      // Given: A subtask exists
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const subtaskId = createTestSubtask(workItemId, 'Original title', 0);
      const data: UpdateSubtaskRequest = { title: 'Updated title' };

      // When: Updating title
      const result = subtaskService.updateSubtask(db, workItemId, subtaskId, data);

      // Then: Title is updated
      expect(result.title).toBe('Updated title');
      expect(result.id).toBe(subtaskId);
    });

    it('updates subtask isCompleted only (UAT-3.4-25)', () => {
      // Given: A subtask exists with isCompleted=false
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const subtaskId = createTestSubtask(workItemId, 'Test subtask', 0, false);
      const data: UpdateSubtaskRequest = { isCompleted: true };

      // When: Updating isCompleted
      const result = subtaskService.updateSubtask(db, workItemId, subtaskId, data);

      // Then: isCompleted is updated
      expect(result.isCompleted).toBe(true);
      expect(result.title).toBe('Test subtask'); // Title unchanged
    });

    it('updates subtask sortOrder only (UAT-3.4-26)', () => {
      // Given: A subtask exists
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const subtaskId = createTestSubtask(workItemId, 'Test subtask', 0);
      const data: UpdateSubtaskRequest = { sortOrder: 5 };

      // When: Updating sortOrder
      const result = subtaskService.updateSubtask(db, workItemId, subtaskId, data);

      // Then: sortOrder is updated
      expect(result.sortOrder).toBe(5);
      expect(result.title).toBe('Test subtask'); // Title unchanged
    });

    it('updates multiple fields at once', () => {
      // Given: A subtask exists
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const subtaskId = createTestSubtask(workItemId, 'Original title', 0, false);
      const data: UpdateSubtaskRequest = {
        title: 'New title',
        isCompleted: true,
        sortOrder: 3,
      };

      // When: Updating all fields
      const result = subtaskService.updateSubtask(db, workItemId, subtaskId, data);

      // Then: All fields are updated
      expect(result.title).toBe('New title');
      expect(result.isCompleted).toBe(true);
      expect(result.sortOrder).toBe(3);
    });

    it('trims whitespace from updated title', () => {
      // Given: A subtask exists
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const subtaskId = createTestSubtask(workItemId, 'Original title', 0);
      const data: UpdateSubtaskRequest = { title: '  Trimmed update  ' };

      // When: Updating with whitespace
      const result = subtaskService.updateSubtask(db, workItemId, subtaskId, data);

      // Then: Title is trimmed
      expect(result.title).toBe('Trimmed update');
    });

    it('throws ValidationError if no fields provided (UAT-3.4-27)', () => {
      // Given: A subtask exists
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const subtaskId = createTestSubtask(workItemId, 'Test subtask', 0);
      const data: UpdateSubtaskRequest = {};

      // When: Updating with no fields
      // Then: ValidationError is thrown
      expect(() => {
        subtaskService.updateSubtask(db, workItemId, subtaskId, data);
      }).toThrow(ValidationError);
      expect(() => {
        subtaskService.updateSubtask(db, workItemId, subtaskId, data);
      }).toThrow('At least one field must be provided');
    });

    it('throws ValidationError if title is empty after trimming', () => {
      // Given: A subtask exists
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const subtaskId = createTestSubtask(workItemId, 'Original title', 0);
      const data: UpdateSubtaskRequest = { title: '   ' };

      // When: Updating with empty title
      // Then: ValidationError is thrown
      expect(() => {
        subtaskService.updateSubtask(db, workItemId, subtaskId, data);
      }).toThrow(ValidationError);
      expect(() => {
        subtaskService.updateSubtask(db, workItemId, subtaskId, data);
      }).toThrow('Subtask title cannot be empty');
    });

    it('throws NotFoundError if subtask does not exist (UAT-3.4-28)', () => {
      // Given: A work item exists but subtask does not
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const data: UpdateSubtaskRequest = { title: 'Update' };

      // When: Updating non-existent subtask
      // Then: NotFoundError is thrown
      expect(() => {
        subtaskService.updateSubtask(db, workItemId, 'nonexistent-subtask', data);
      }).toThrow(NotFoundError);
      expect(() => {
        subtaskService.updateSubtask(db, workItemId, 'nonexistent-subtask', data);
      }).toThrow('Subtask not found');
    });

    it('throws NotFoundError if work item does not exist (UAT-3.4-28)', () => {
      // Given: No work item exists
      const data: UpdateSubtaskRequest = { title: 'Update' };

      // When: Updating subtask on non-existent work item
      // Then: NotFoundError is thrown
      expect(() => {
        subtaskService.updateSubtask(db, 'nonexistent-work-item', 'some-subtask', data);
      }).toThrow(NotFoundError);
      expect(() => {
        subtaskService.updateSubtask(db, 'nonexistent-work-item', 'some-subtask', data);
      }).toThrow('Work item not found');
    });

    it('throws NotFoundError if subtask belongs to different work item', () => {
      // Given: Two work items, subtask on first work item
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem1Id = createTestWorkItem(userId, 'Work Item 1');
      const workItem2Id = createTestWorkItem(userId, 'Work Item 2');
      const subtaskId = createTestSubtask(workItem1Id, 'Subtask on item 1', 0);
      const data: UpdateSubtaskRequest = { title: 'Update' };

      // When: Trying to update subtask via wrong work item ID
      // Then: NotFoundError is thrown
      expect(() => {
        subtaskService.updateSubtask(db, workItem2Id, subtaskId, data);
      }).toThrow(NotFoundError);
      expect(() => {
        subtaskService.updateSubtask(db, workItem2Id, subtaskId, data);
      }).toThrow('Subtask not found');
    });

    it('updates updatedAt timestamp', async () => {
      // Given: A subtask exists
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const subtaskId = createTestSubtask(workItemId, 'Original title', 0);

      // Get original timestamps
      const originalSubtask = db
        .select()
        .from(schema.workItemSubtasks)
        .where(eq(schema.workItemSubtasks.id, subtaskId))
        .get();

      // Wait 1ms to ensure timestamp will be different
      await new Promise((resolve) => setTimeout(resolve, 1));

      // When: Updating subtask
      const data: UpdateSubtaskRequest = { title: 'Updated title' };
      const result = subtaskService.updateSubtask(db, workItemId, subtaskId, data);

      // Then: updatedAt is changed, createdAt is unchanged
      expect(result.updatedAt).not.toBe(originalSubtask?.updatedAt);
      expect(result.createdAt).toBe(originalSubtask?.createdAt);
    });
  });

  describe('deleteSubtask()', () => {
    it('deletes a subtask successfully (UAT-3.4-29)', () => {
      // Given: A subtask exists
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const subtaskId = createTestSubtask(workItemId, 'Subtask to delete', 0);

      // When: Deleting the subtask
      subtaskService.deleteSubtask(db, workItemId, subtaskId);

      // Then: Subtask is deleted
      const deletedSubtask = db
        .select()
        .from(schema.workItemSubtasks)
        .where(eq(schema.workItemSubtasks.id, subtaskId))
        .get();
      expect(deletedSubtask).toBeUndefined();
    });

    it('throws NotFoundError if subtask does not exist (UAT-3.4-30)', () => {
      // Given: A work item exists but subtask does not
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');

      // When: Deleting non-existent subtask
      // Then: NotFoundError is thrown
      expect(() => {
        subtaskService.deleteSubtask(db, workItemId, 'nonexistent-subtask');
      }).toThrow(NotFoundError);
      expect(() => {
        subtaskService.deleteSubtask(db, workItemId, 'nonexistent-subtask');
      }).toThrow('Subtask not found');
    });

    it('throws NotFoundError if work item does not exist (UAT-3.4-30)', () => {
      // Given: No work item exists
      // When: Deleting subtask on non-existent work item
      // Then: NotFoundError is thrown
      expect(() => {
        subtaskService.deleteSubtask(db, 'nonexistent-work-item', 'some-subtask');
      }).toThrow(NotFoundError);
      expect(() => {
        subtaskService.deleteSubtask(db, 'nonexistent-work-item', 'some-subtask');
      }).toThrow('Work item not found');
    });

    it('throws NotFoundError if subtask belongs to different work item', () => {
      // Given: Two work items, subtask on first work item
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem1Id = createTestWorkItem(userId, 'Work Item 1');
      const workItem2Id = createTestWorkItem(userId, 'Work Item 2');
      const subtaskId = createTestSubtask(workItem1Id, 'Subtask on item 1', 0);

      // When: Trying to delete subtask via wrong work item ID
      // Then: NotFoundError is thrown
      expect(() => {
        subtaskService.deleteSubtask(db, workItem2Id, subtaskId);
      }).toThrow(NotFoundError);
      expect(() => {
        subtaskService.deleteSubtask(db, workItem2Id, subtaskId);
      }).toThrow('Subtask not found');
    });
  });

  describe('reorderSubtasks()', () => {
    it('reorders subtasks to match provided array order (UAT-3.4-31)', () => {
      // Given: A work item with 3 subtasks
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const subtask0Id = createTestSubtask(workItemId, 'First', 0);
      const subtask1Id = createTestSubtask(workItemId, 'Second', 1);
      const subtask2Id = createTestSubtask(workItemId, 'Third', 2);

      // When: Reordering to reverse order
      const data: ReorderSubtasksRequest = {
        subtaskIds: [subtask2Id, subtask1Id, subtask0Id],
      };
      const result = subtaskService.reorderSubtasks(db, workItemId, data);

      // Then: Subtasks are reordered
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe(subtask2Id);
      expect(result[0].sortOrder).toBe(0);
      expect(result[1].id).toBe(subtask1Id);
      expect(result[1].sortOrder).toBe(1);
      expect(result[2].id).toBe(subtask0Id);
      expect(result[2].sortOrder).toBe(2);
    });

    it('updates updatedAt timestamp when reordering', async () => {
      // Given: A work item with subtasks
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const subtask0Id = createTestSubtask(workItemId, 'First', 0);
      const subtask1Id = createTestSubtask(workItemId, 'Second', 1);

      // Get original timestamp
      const originalSubtask = db
        .select()
        .from(schema.workItemSubtasks)
        .where(eq(schema.workItemSubtasks.id, subtask0Id))
        .get();

      // Wait 1ms to ensure timestamp will be different
      await new Promise((resolve) => setTimeout(resolve, 1));

      // When: Reordering
      const data: ReorderSubtasksRequest = { subtaskIds: [subtask1Id, subtask0Id] };
      const result = subtaskService.reorderSubtasks(db, workItemId, data);

      // Then: updatedAt is changed
      expect(result[1].id).toBe(subtask0Id);
      expect(result[1].updatedAt).not.toBe(originalSubtask?.updatedAt);
    });

    it('throws ValidationError if subtaskIds array is empty (UAT-3.4-32)', () => {
      // Given: A work item exists
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const data: ReorderSubtasksRequest = { subtaskIds: [] };

      // When: Reordering with empty array
      // Then: ValidationError is thrown
      expect(() => {
        subtaskService.reorderSubtasks(db, workItemId, data);
      }).toThrow(ValidationError);
      expect(() => {
        subtaskService.reorderSubtasks(db, workItemId, data);
      }).toThrow('subtaskIds must be a non-empty array');
    });

    it('throws ValidationError if subtaskIds contains invalid ID (UAT-3.4-33)', () => {
      // Given: A work item with two subtasks
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const subtask0Id = createTestSubtask(workItemId, 'Valid subtask 1', 0);
      createTestSubtask(workItemId, 'Valid subtask 2', 1);

      // When: Reordering with invalid ID (but correct count)
      const data: ReorderSubtasksRequest = {
        subtaskIds: [subtask0Id, 'invalid-subtask-id'],
      };

      // Then: ValidationError is thrown
      expect(() => {
        subtaskService.reorderSubtasks(db, workItemId, data);
      }).toThrow(ValidationError);
      expect(() => {
        subtaskService.reorderSubtasks(db, workItemId, data);
      }).toThrow('Some subtask IDs do not belong to this work item');
    });

    it('throws ValidationError if subtaskId belongs to different work item', () => {
      // Given: Two work items with subtasks
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem1Id = createTestWorkItem(userId, 'Work Item 1');
      const workItem2Id = createTestWorkItem(userId, 'Work Item 2');
      const subtask1aId = createTestSubtask(workItem1Id, 'Subtask 1a on item 1', 0);
      createTestSubtask(workItem1Id, 'Subtask 1b on item 1', 1);
      const subtask2Id = createTestSubtask(workItem2Id, 'Subtask on item 2', 0);

      // When: Trying to reorder using subtask from different work item (but correct count)
      const data: ReorderSubtasksRequest = { subtaskIds: [subtask1aId, subtask2Id] };

      // Then: ValidationError is thrown
      expect(() => {
        subtaskService.reorderSubtasks(db, workItem1Id, data);
      }).toThrow(ValidationError);
      expect(() => {
        subtaskService.reorderSubtasks(db, workItem1Id, data);
      }).toThrow('Some subtask IDs do not belong to this work item');
    });

    it('throws NotFoundError if work item does not exist', () => {
      // Given: No work item exists
      const data: ReorderSubtasksRequest = { subtaskIds: ['some-id'] };

      // When: Reordering on non-existent work item
      // Then: NotFoundError is thrown
      expect(() => {
        subtaskService.reorderSubtasks(db, 'nonexistent-work-item', data);
      }).toThrow(NotFoundError);
      expect(() => {
        subtaskService.reorderSubtasks(db, 'nonexistent-work-item', data);
      }).toThrow('Work item not found');
    });

    it('rejects partial reordering (subset of subtasks)', () => {
      // Given: A work item with 3 subtasks
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const subtask0Id = createTestSubtask(workItemId, 'First', 0);
      const subtask1Id = createTestSubtask(workItemId, 'Second', 1);
      createTestSubtask(workItemId, 'Third', 2);

      // When: Reordering only 2 out of 3 subtasks
      const data: ReorderSubtasksRequest = { subtaskIds: [subtask1Id, subtask0Id] };

      // Then: ValidationError is thrown (API contract requires all IDs)
      expect(() => {
        subtaskService.reorderSubtasks(db, workItemId, data);
      }).toThrow(ValidationError);
      expect(() => {
        subtaskService.reorderSubtasks(db, workItemId, data);
      }).toThrow('All subtask IDs must be provided for reorder');
    });
  });
});
