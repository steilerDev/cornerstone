import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as workItemService from './workItemService.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';
import type { CreateWorkItemRequest, WorkItemListQuery } from '@cornerstone/shared';

describe('Work Item Service', () => {
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
   * Helper: Create a test tag
   */
  function createTestTag(name: string, color: string = '#3b82f6') {
    const tagId = `tag-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    db.insert(schema.tags)
      .values({
        id: tagId,
        name,
        color,
        createdAt: new Date().toISOString(),
      })
      .run();
    return tagId;
  }

  /**
   * Helper: Create a test budget category
   */
  function createTestBudgetCategory(name: string) {
    const id = `cat-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();
    db.insert(schema.budgetCategories)
      .values({
        id,
        name,
        description: null,
        color: null,
        sortOrder: 100,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  /**
   * Helper: Create a test budget source
   */
  function createTestBudgetSource(name: string) {
    const id = `src-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();
    db.insert(schema.budgetSources)
      .values({
        id,
        name,
        sourceType: 'bank_loan',
        totalAmount: 500000,
        interestRate: null,
        terms: null,
        notes: null,
        status: 'active',
        createdBy: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('createWorkItem()', () => {
    it('creates work item with only required title field', () => {
      // Given: A user and minimal request data
      const userId = createTestUser('user@example.com', 'Test User');
      const data: CreateWorkItemRequest = {
        title: 'Install electrical panel',
      };

      // When: Creating work item
      const result = workItemService.createWorkItem(db, userId, data);

      // Then: Work item is created with defaults
      expect(result.id).toBeDefined();
      expect(result.title).toBe('Install electrical panel');
      expect(result.description).toBeNull();
      expect(result.status).toBe('not_started');
      expect(result.startDate).toBeNull();
      expect(result.endDate).toBeNull();
      expect(result.durationDays).toBeNull();
      expect(result.startAfter).toBeNull();
      expect(result.startBefore).toBeNull();
      expect(result.assignedUser).toBeNull();
      expect(result.createdBy?.id).toBe(userId);
      expect(result.tags).toEqual([]);
      expect(result.subtasks).toEqual([]);
      expect(result.dependencies).toEqual({ predecessors: [], successors: [] });
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('creates work item with all optional fields', () => {
      // Given: A user, a tag, and another user for assignment
      const creatorId = createTestUser('creator@example.com', 'Creator');
      const assigneeId = createTestUser('assignee@example.com', 'Assignee');
      const tagId = createTestTag('Foundation');

      const data: CreateWorkItemRequest = {
        title: 'Pour foundation',
        description: 'Pour concrete foundation for main structure',
        status: 'in_progress',
        startDate: '2026-03-01',
        endDate: '2026-03-05',
        durationDays: 4,
        startAfter: '2026-02-28',
        startBefore: '2026-03-10',
        assignedUserId: assigneeId,
        tagIds: [tagId],
      };

      // When: Creating work item
      const result = workItemService.createWorkItem(db, creatorId, data);

      // Then: All fields are set correctly
      expect(result.title).toBe('Pour foundation');
      expect(result.description).toBe('Pour concrete foundation for main structure');
      expect(result.status).toBe('in_progress');
      expect(result.startDate).toBe('2026-03-01');
      expect(result.endDate).toBe('2026-03-05');
      expect(result.durationDays).toBe(4);
      expect(result.startAfter).toBe('2026-02-28');
      expect(result.startBefore).toBe('2026-03-10');
      expect(result.assignedUser?.id).toBe(assigneeId);
      expect(result.createdBy?.id).toBe(creatorId);
      expect(result.tags).toHaveLength(1);
      expect(result.tags[0].name).toBe('Foundation');
    });

    it('trims whitespace from title', () => {
      // Given: Title with leading/trailing whitespace
      const userId = createTestUser('user@example.com', 'Test User');
      const data: CreateWorkItemRequest = {
        title: '  Install plumbing  ',
      };

      // When: Creating work item
      const result = workItemService.createWorkItem(db, userId, data);

      // Then: Title is trimmed
      expect(result.title).toBe('Install plumbing');
    });

    it('throws ValidationError when title is empty', () => {
      // Given: Empty title
      const userId = createTestUser('user@example.com', 'Test User');
      const data: CreateWorkItemRequest = {
        title: '',
      };

      // When/Then: Throws validation error
      expect(() => workItemService.createWorkItem(db, userId, data)).toThrow(ValidationError);
      expect(() => workItemService.createWorkItem(db, userId, data)).toThrow('Title is required');
    });

    it('throws ValidationError when title is only whitespace', () => {
      // Given: Whitespace-only title
      const userId = createTestUser('user@example.com', 'Test User');
      const data: CreateWorkItemRequest = {
        title: '   ',
      };

      // When/Then: Throws validation error
      expect(() => workItemService.createWorkItem(db, userId, data)).toThrow(ValidationError);
    });

    it('throws ValidationError when startDate is after endDate', () => {
      // Given: Invalid date range
      const userId = createTestUser('user@example.com', 'Test User');
      const data: CreateWorkItemRequest = {
        title: 'Test',
        startDate: '2026-03-10',
        endDate: '2026-03-01',
      };

      // When/Then: Throws validation error
      expect(() => workItemService.createWorkItem(db, userId, data)).toThrow(ValidationError);
      expect(() => workItemService.createWorkItem(db, userId, data)).toThrow(
        'startDate must be before or equal to endDate',
      );
    });

    it('throws ValidationError when startAfter is after startBefore', () => {
      // Given: Invalid constraint range
      const userId = createTestUser('user@example.com', 'Test User');
      const data: CreateWorkItemRequest = {
        title: 'Test',
        startAfter: '2026-03-10',
        startBefore: '2026-03-01',
      };

      // When/Then: Throws validation error
      expect(() => workItemService.createWorkItem(db, userId, data)).toThrow(ValidationError);
      expect(() => workItemService.createWorkItem(db, userId, data)).toThrow(
        'startAfter must be before or equal to startBefore',
      );
    });

    it('allows startDate equal to endDate', () => {
      // Given: Same start and end date
      const userId = createTestUser('user@example.com', 'Test User');
      const data: CreateWorkItemRequest = {
        title: 'One day task',
        startDate: '2026-03-01',
        endDate: '2026-03-01',
      };

      // When: Creating work item
      const result = workItemService.createWorkItem(db, userId, data);

      // Then: Created successfully
      expect(result.startDate).toBe('2026-03-01');
      expect(result.endDate).toBe('2026-03-01');
    });

    it('throws ValidationError when assignedUserId does not exist', () => {
      // Given: Non-existent user ID
      const userId = createTestUser('user@example.com', 'Test User');
      const data: CreateWorkItemRequest = {
        title: 'Test',
        assignedUserId: 'non-existent-user-id',
      };

      // When/Then: Throws validation error
      expect(() => workItemService.createWorkItem(db, userId, data)).toThrow(ValidationError);
      expect(() => workItemService.createWorkItem(db, userId, data)).toThrow(
        'User not found: non-existent-user-id',
      );
    });

    it('throws ValidationError when assignedUserId is deactivated', () => {
      // Given: A deactivated user
      const creatorId = createTestUser('creator@example.com', 'Creator');
      const deactivatedId = createTestUser('deactivated@example.com', 'Deactivated');
      db.update(schema.users)
        .set({ deactivatedAt: new Date().toISOString() })
        .where(eq(schema.users.id, deactivatedId))
        .run();

      const data: CreateWorkItemRequest = {
        title: 'Test',
        assignedUserId: deactivatedId,
      };

      // When/Then: Throws validation error
      expect(() => workItemService.createWorkItem(db, creatorId, data)).toThrow(ValidationError);
      expect(() => workItemService.createWorkItem(db, creatorId, data)).toThrow(
        `User is deactivated: ${deactivatedId}`,
      );
    });

    it('throws ValidationError when tagId does not exist', () => {
      // Given: Non-existent tag ID
      const userId = createTestUser('user@example.com', 'Test User');
      const data: CreateWorkItemRequest = {
        title: 'Test',
        tagIds: ['non-existent-tag-id'],
      };

      // When/Then: Throws validation error
      expect(() => workItemService.createWorkItem(db, userId, data)).toThrow(ValidationError);
      expect(() => workItemService.createWorkItem(db, userId, data)).toThrow(
        'Tag not found: non-existent-tag-id',
      );
    });

    it('creates work item with multiple tags', () => {
      // Given: Multiple tags
      const userId = createTestUser('user@example.com', 'Test User');
      const tag1 = createTestTag('Foundation');
      const tag2 = createTestTag('Electrical');
      const tag3 = createTestTag('Urgent');

      const data: CreateWorkItemRequest = {
        title: 'Multi-tag task',
        tagIds: [tag1, tag2, tag3],
      };

      // When: Creating work item
      const result = workItemService.createWorkItem(db, userId, data);

      // Then: All tags are assigned
      expect(result.tags).toHaveLength(3);
      const tagNames = result.tags.map((t) => t.name).sort();
      expect(tagNames).toEqual(['Electrical', 'Foundation', 'Urgent']);
    });
  });

  describe('findWorkItemById()', () => {
    it('finds existing work item', () => {
      // Given: A work item exists
      const userId = createTestUser('user@example.com', 'Test User');
      const created = workItemService.createWorkItem(db, userId, { title: 'Test Work Item' });

      // When: Finding by ID
      const found = workItemService.findWorkItemById(db, created.id);

      // Then: Work item is found
      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.title).toBe('Test Work Item');
    });

    it('returns undefined for non-existent ID', () => {
      // Given: No work items exist
      // When: Finding by non-existent ID
      const found = workItemService.findWorkItemById(db, 'non-existent-id');

      // Then: Returns undefined
      expect(found).toBeUndefined();
    });
  });

  describe('getWorkItemDetail()', () => {
    it('returns work item detail with all relationships', () => {
      // Given: A work item with tags, subtask, and dependencies
      const userId = createTestUser('user@example.com', 'Test User');
      const tagId = createTestTag('Foundation');
      const workItem = workItemService.createWorkItem(db, userId, {
        title: 'Main Task',
        tagIds: [tagId],
      });

      // Add a subtask
      db.insert(schema.workItemSubtasks)
        .values({
          id: 'subtask-1',
          workItemId: workItem.id,
          title: 'Subtask 1',
          isCompleted: false,
          sortOrder: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();

      // Add a dependency (predecessor)
      const predecessor = workItemService.createWorkItem(db, userId, { title: 'Predecessor' });
      db.insert(schema.workItemDependencies)
        .values({
          predecessorId: predecessor.id,
          successorId: workItem.id,
          dependencyType: 'finish_to_start',
        })
        .run();

      // When: Getting work item detail
      const detail = workItemService.getWorkItemDetail(db, workItem.id);

      // Then: All relationships are loaded
      expect(detail.id).toBe(workItem.id);
      expect(detail.tags).toHaveLength(1);
      expect(detail.subtasks).toHaveLength(1);
      expect(detail.subtasks[0].title).toBe('Subtask 1');
      expect(detail.dependencies.predecessors).toHaveLength(1);
      expect(detail.dependencies.predecessors[0].workItem.title).toBe('Predecessor');
      expect(detail.dependencies.successors).toHaveLength(0);
    });

    it('throws NotFoundError when work item does not exist', () => {
      // Given: No work items exist
      // When/Then: Throws not found error
      expect(() => workItemService.getWorkItemDetail(db, 'non-existent-id')).toThrow(NotFoundError);
      expect(() => workItemService.getWorkItemDetail(db, 'non-existent-id')).toThrow(
        'Work item not found',
      );
    });

    it('includes assigned user summary when assigned', () => {
      // Given: A work item assigned to a user
      const creatorId = createTestUser('creator@example.com', 'Creator');
      const assigneeId = createTestUser('assignee@example.com', 'John Doe', 'member');
      const workItem = workItemService.createWorkItem(db, creatorId, {
        title: 'Assigned Task',
        assignedUserId: assigneeId,
      });

      // When: Getting detail
      const detail = workItemService.getWorkItemDetail(db, workItem.id);

      // Then: Assigned user is included
      expect(detail.assignedUser).toBeDefined();
      expect(detail.assignedUser?.id).toBe(assigneeId);
      expect(detail.assignedUser?.displayName).toBe('John Doe');
      expect(detail.assignedUser?.email).toBe('assignee@example.com');
    });

    it('returns null assignedUser when not assigned', () => {
      // Given: A work item with no assignee
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = workItemService.createWorkItem(db, userId, { title: 'Unassigned Task' });

      // When: Getting detail
      const detail = workItemService.getWorkItemDetail(db, workItem.id);

      // Then: assignedUser is null
      expect(detail.assignedUser).toBeNull();
    });
  });

  describe('updateWorkItem()', () => {
    it('updates only provided fields', () => {
      // Given: An existing work item
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = workItemService.createWorkItem(db, userId, {
        title: 'Original Title',
        description: 'Original description',
        status: 'not_started',
      });

      // When: Updating only status
      const updated = workItemService.updateWorkItem(db, workItem.id, {
        status: 'in_progress',
      });

      // Then: Only status changed
      expect(updated.status).toBe('in_progress');
      expect(updated.title).toBe('Original Title');
      expect(updated.description).toBe('Original description');
      expect(updated.updatedAt).not.toBe(workItem.updatedAt);
    });

    it('updates title and trims whitespace', () => {
      // Given: An existing work item
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = workItemService.createWorkItem(db, userId, { title: 'Original' });

      // When: Updating title with whitespace
      const updated = workItemService.updateWorkItem(db, workItem.id, {
        title: '  New Title  ',
      });

      // Then: Title is trimmed
      expect(updated.title).toBe('New Title');
    });

    it('throws ValidationError when update title is empty', () => {
      // Given: An existing work item
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = workItemService.createWorkItem(db, userId, { title: 'Original' });

      // When/Then: Throws validation error
      expect(() => workItemService.updateWorkItem(db, workItem.id, { title: '' })).toThrow(
        ValidationError,
      );
      expect(() => workItemService.updateWorkItem(db, workItem.id, { title: '   ' })).toThrow(
        'Title cannot be empty',
      );
    });

    it('throws ValidationError when no fields provided', () => {
      // Given: An existing work item
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = workItemService.createWorkItem(db, userId, { title: 'Original' });

      // When/Then: Throws validation error
      expect(() => workItemService.updateWorkItem(db, workItem.id, {})).toThrow(ValidationError);
      expect(() => workItemService.updateWorkItem(db, workItem.id, {})).toThrow(
        'At least one field must be provided',
      );
    });

    it('validates date constraints with merged data', () => {
      // Given: Work item with startDate set
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = workItemService.createWorkItem(db, userId, {
        title: 'Test',
        startDate: '2026-03-01',
      });

      // When: Updating endDate to be before startDate
      // Then: Throws validation error
      expect(() =>
        workItemService.updateWorkItem(db, workItem.id, { endDate: '2026-02-28' }),
      ).toThrow(ValidationError);
      expect(() =>
        workItemService.updateWorkItem(db, workItem.id, { endDate: '2026-02-28' }),
      ).toThrow('startDate must be before or equal to endDate');
    });

    it('allows updating both dates simultaneously', () => {
      // Given: Work item with dates
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = workItemService.createWorkItem(db, userId, {
        title: 'Test',
        startDate: '2026-03-01',
        endDate: '2026-03-05',
      });

      // When: Updating both dates
      const updated = workItemService.updateWorkItem(db, workItem.id, {
        startDate: '2026-04-01',
        endDate: '2026-04-10',
      });

      // Then: Both updated successfully
      expect(updated.startDate).toBe('2026-04-01');
      expect(updated.endDate).toBe('2026-04-10');
    });

    it('allows setting description to null', () => {
      // Given: Work item with description
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = workItemService.createWorkItem(db, userId, {
        title: 'Test',
        description: 'Some description',
      });

      // When: Setting description to null
      const updated = workItemService.updateWorkItem(db, workItem.id, {
        description: null,
      });

      // Then: Description is null
      expect(updated.description).toBeNull();
    });

    it('allows changing assignedUserId', () => {
      // Given: Work item assigned to user A
      const creator = createTestUser('creator@example.com', 'Creator');
      const userA = createTestUser('userA@example.com', 'User A');
      const userB = createTestUser('userB@example.com', 'User B');
      const workItem = workItemService.createWorkItem(db, creator, {
        title: 'Test',
        assignedUserId: userA,
      });

      // When: Changing to user B
      const updated = workItemService.updateWorkItem(db, workItem.id, {
        assignedUserId: userB,
      });

      // Then: Assigned to user B
      expect(updated.assignedUser?.id).toBe(userB);
      expect(updated.assignedUser?.displayName).toBe('User B');
    });

    it('allows unsetting assignedUserId', () => {
      // Given: Work item assigned to a user
      const creator = createTestUser('creator@example.com', 'Creator');
      const assignee = createTestUser('assignee@example.com', 'Assignee');
      const workItem = workItemService.createWorkItem(db, creator, {
        title: 'Test',
        assignedUserId: assignee,
      });

      // When: Unsetting assignedUserId
      const updated = workItemService.updateWorkItem(db, workItem.id, {
        assignedUserId: null,
      });

      // Then: No longer assigned
      expect(updated.assignedUser).toBeNull();
    });

    it('throws ValidationError when assignedUserId does not exist', () => {
      // Given: An existing work item
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = workItemService.createWorkItem(db, userId, { title: 'Test' });

      // When/Then: Throws validation error
      expect(() =>
        workItemService.updateWorkItem(db, workItem.id, { assignedUserId: 'non-existent' }),
      ).toThrow(ValidationError);
      expect(() =>
        workItemService.updateWorkItem(db, workItem.id, { assignedUserId: 'non-existent' }),
      ).toThrow('User not found: non-existent');
    });

    it('replaces tags (set semantics, not merge)', () => {
      // Given: Work item with tags [A, B]
      const userId = createTestUser('user@example.com', 'Test User');
      const tagA = createTestTag('Tag A');
      const tagB = createTestTag('Tag B');
      const tagC = createTestTag('Tag C');
      const workItem = workItemService.createWorkItem(db, userId, {
        title: 'Test',
        tagIds: [tagA, tagB],
      });

      // When: Updating tags to [B, C]
      const updated = workItemService.updateWorkItem(db, workItem.id, {
        tagIds: [tagB, tagC],
      });

      // Then: Tags are [B, C] (not [A, B, C])
      expect(updated.tags).toHaveLength(2);
      const tagNames = updated.tags.map((t) => t.name).sort();
      expect(tagNames).toEqual(['Tag B', 'Tag C']);
    });

    it('allows clearing all tags', () => {
      // Given: Work item with tags
      const userId = createTestUser('user@example.com', 'Test User');
      const tagId = createTestTag('Tag A');
      const workItem = workItemService.createWorkItem(db, userId, {
        title: 'Test',
        tagIds: [tagId],
      });

      // When: Updating tags to empty array
      const updated = workItemService.updateWorkItem(db, workItem.id, {
        tagIds: [],
      });

      // Then: No tags
      expect(updated.tags).toHaveLength(0);
    });

    it('throws NotFoundError when work item does not exist', () => {
      // Given: No work items exist
      // When/Then: Throws not found error
      expect(() => workItemService.updateWorkItem(db, 'non-existent', { title: 'New' })).toThrow(
        NotFoundError,
      );
      expect(() => workItemService.updateWorkItem(db, 'non-existent', { title: 'New' })).toThrow(
        'Work item not found',
      );
    });
  });

  describe('deleteWorkItem()', () => {
    it('deletes work item successfully', () => {
      // Given: A work item exists
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = workItemService.createWorkItem(db, userId, { title: 'To Delete' });

      // When: Deleting the work item
      workItemService.deleteWorkItem(db, workItem.id);

      // Then: Work item no longer exists
      const found = workItemService.findWorkItemById(db, workItem.id);
      expect(found).toBeUndefined();
    });

    it('cascades delete to tags association', () => {
      // Given: Work item with tags
      const userId = createTestUser('user@example.com', 'Test User');
      const tagId = createTestTag('Test Tag');
      const workItem = workItemService.createWorkItem(db, userId, {
        title: 'Test',
        tagIds: [tagId],
      });

      // When: Deleting work item
      workItemService.deleteWorkItem(db, workItem.id);

      // Then: Tag association is deleted
      const associations = db
        .select()
        .from(schema.workItemTags)
        .where(eq(schema.workItemTags.workItemId, workItem.id))
        .all();
      expect(associations).toHaveLength(0);

      // And: Tag itself still exists
      const tag = db.select().from(schema.tags).where(eq(schema.tags.id, tagId)).get();
      expect(tag).toBeDefined();
    });

    it('cascades delete to subtasks', () => {
      // Given: Work item with subtask
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = workItemService.createWorkItem(db, userId, { title: 'Test' });
      db.insert(schema.workItemSubtasks)
        .values({
          id: 'subtask-1',
          workItemId: workItem.id,
          title: 'Subtask',
          isCompleted: false,
          sortOrder: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();

      // When: Deleting work item
      workItemService.deleteWorkItem(db, workItem.id);

      // Then: Subtask is deleted
      const subtasks = db
        .select()
        .from(schema.workItemSubtasks)
        .where(eq(schema.workItemSubtasks.workItemId, workItem.id))
        .all();
      expect(subtasks).toHaveLength(0);
    });

    it('cascades delete to dependencies', () => {
      // Given: Work items with dependencies
      const userId = createTestUser('user@example.com', 'Test User');
      const workItemA = workItemService.createWorkItem(db, userId, { title: 'A' });
      const workItemB = workItemService.createWorkItem(db, userId, { title: 'B' });
      db.insert(schema.workItemDependencies)
        .values({
          predecessorId: workItemA.id,
          successorId: workItemB.id,
          dependencyType: 'finish_to_start',
        })
        .run();

      // When: Deleting workItemA
      workItemService.deleteWorkItem(db, workItemA.id);

      // Then: Dependency is deleted
      const dependencies = db
        .select()
        .from(schema.workItemDependencies)
        .where(eq(schema.workItemDependencies.predecessorId, workItemA.id))
        .all();
      expect(dependencies).toHaveLength(0);

      // And: workItemB still exists
      const foundB = workItemService.findWorkItemById(db, workItemB.id);
      expect(foundB).toBeDefined();
    });

    it('throws NotFoundError when work item does not exist', () => {
      // Given: No work items exist
      // When/Then: Throws not found error
      expect(() => workItemService.deleteWorkItem(db, 'non-existent')).toThrow(NotFoundError);
      expect(() => workItemService.deleteWorkItem(db, 'non-existent')).toThrow(
        'Work item not found',
      );
    });
  });

  describe('listWorkItems()', () => {
    it('returns empty list when no work items exist', () => {
      // Given: No work items
      const query: WorkItemListQuery = {};

      // When: Listing work items
      const result = workItemService.listWorkItems(db, query);

      // Then: Empty list with correct pagination
      expect(result.items).toHaveLength(0);
      expect(result.pagination).toEqual({
        page: 1,
        pageSize: 25,
        totalItems: 0,
        totalPages: 0,
      });
    });

    it('returns paginated work items with defaults', () => {
      // Given: 30 work items exist
      const userId = createTestUser('user@example.com', 'Test User');
      for (let i = 1; i <= 30; i++) {
        workItemService.createWorkItem(db, userId, { title: `Work Item ${i}` });
      }

      // When: Listing with no query params
      const result = workItemService.listWorkItems(db, {});

      // Then: First page with 25 items
      expect(result.items).toHaveLength(25);
      expect(result.pagination).toEqual({
        page: 1,
        pageSize: 25,
        totalItems: 30,
        totalPages: 2,
      });
    });

    it('supports custom page size', () => {
      // Given: 10 work items
      const userId = createTestUser('user@example.com', 'Test User');
      for (let i = 1; i <= 10; i++) {
        workItemService.createWorkItem(db, userId, { title: `Work Item ${i}` });
      }

      // When: Requesting page size of 5
      const result = workItemService.listWorkItems(db, { pageSize: 5 });

      // Then: Returns 5 items
      expect(result.items).toHaveLength(5);
      expect(result.pagination.pageSize).toBe(5);
      expect(result.pagination.totalPages).toBe(2);
    });

    it('enforces maximum page size of 100', () => {
      // Given: Work items exist
      const userId = createTestUser('user@example.com', 'Test User');
      workItemService.createWorkItem(db, userId, { title: 'Test' });

      // When: Requesting page size > 100
      const result = workItemService.listWorkItems(db, { pageSize: 200 });

      // Then: Capped at 100
      expect(result.pagination.pageSize).toBe(100);
    });

    it('supports pagination navigation', () => {
      // Given: 30 work items
      const userId = createTestUser('user@example.com', 'Test User');
      for (let i = 1; i <= 30; i++) {
        workItemService.createWorkItem(db, userId, { title: `Work Item ${i}` });
      }

      // When: Requesting page 2 with size 25
      const result = workItemService.listWorkItems(db, { page: 2, pageSize: 25 });

      // Then: Returns remaining 5 items
      expect(result.items).toHaveLength(5);
      expect(result.pagination.page).toBe(2);
    });

    it('returns empty array for page beyond total pages', () => {
      // Given: 10 work items
      const userId = createTestUser('user@example.com', 'Test User');
      for (let i = 1; i <= 10; i++) {
        workItemService.createWorkItem(db, userId, { title: `Work Item ${i}` });
      }

      // When: Requesting page 100
      const result = workItemService.listWorkItems(db, { page: 100 });

      // Then: Empty array but correct total
      expect(result.items).toHaveLength(0);
      expect(result.pagination.totalItems).toBe(10);
    });

    it('filters by status', () => {
      // Given: Work items with various statuses
      const userId = createTestUser('user@example.com', 'Test User');
      workItemService.createWorkItem(db, userId, { title: 'Not Started 1', status: 'not_started' });
      workItemService.createWorkItem(db, userId, { title: 'In Progress 1', status: 'in_progress' });
      workItemService.createWorkItem(db, userId, { title: 'In Progress 2', status: 'in_progress' });
      workItemService.createWorkItem(db, userId, { title: 'Completed 1', status: 'completed' });

      // When: Filtering by in_progress
      const result = workItemService.listWorkItems(db, { status: 'in_progress' });

      // Then: Returns only in_progress items
      expect(result.items).toHaveLength(2);
      expect(result.items.every((item) => item.status === 'in_progress')).toBe(true);
    });

    it('filters by assignedUserId', () => {
      // Given: Work items assigned to different users
      const creator = createTestUser('creator@example.com', 'Creator');
      const userA = createTestUser('userA@example.com', 'User A');
      const userB = createTestUser('userB@example.com', 'User B');
      workItemService.createWorkItem(db, creator, { title: 'For A', assignedUserId: userA });
      workItemService.createWorkItem(db, creator, { title: 'For B', assignedUserId: userB });
      workItemService.createWorkItem(db, creator, { title: 'For A 2', assignedUserId: userA });
      workItemService.createWorkItem(db, creator, { title: 'Unassigned' });

      // When: Filtering by userA
      const result = workItemService.listWorkItems(db, { assignedUserId: userA });

      // Then: Returns only userA's items
      expect(result.items).toHaveLength(2);
      expect(result.items.every((item) => item.assignedUser?.id === userA)).toBe(true);
    });

    it('filters by tagId', () => {
      // Given: Work items with various tags
      const userId = createTestUser('user@example.com', 'Test User');
      const tagA = createTestTag('Tag A');
      const tagB = createTestTag('Tag B');
      workItemService.createWorkItem(db, userId, { title: 'Has A', tagIds: [tagA] });
      workItemService.createWorkItem(db, userId, { title: 'Has B', tagIds: [tagB] });
      workItemService.createWorkItem(db, userId, { title: 'Has A and B', tagIds: [tagA, tagB] });
      workItemService.createWorkItem(db, userId, { title: 'No tags' });

      // When: Filtering by tagA
      const result = workItemService.listWorkItems(db, { tagId: tagA });

      // Then: Returns items with tagA
      expect(result.items).toHaveLength(2);
      expect(result.items.every((item) => item.tags.some((t) => t.id === tagA))).toBe(true);
    });

    it('searches title and description (case-insensitive)', () => {
      // Given: Work items with various content
      const userId = createTestUser('user@example.com', 'Test User');
      workItemService.createWorkItem(db, userId, {
        title: 'Install plumbing',
        description: 'Install all pipes',
      });
      workItemService.createWorkItem(db, userId, {
        title: 'Electrical wiring',
        description: 'Install electrical system',
      });
      workItemService.createWorkItem(db, userId, {
        title: 'Foundation work',
        description: 'Pour concrete for foundation',
      });

      // When: Searching for "plumb"
      const result1 = workItemService.listWorkItems(db, { q: 'plumb' });
      expect(result1.items).toHaveLength(1);
      expect(result1.items[0].title).toBe('Install plumbing');

      // And: Searching for "INSTALL" (case-insensitive)
      const result2 = workItemService.listWorkItems(db, { q: 'INSTALL' });
      expect(result2.items).toHaveLength(2);

      // And: Searching for "foundation" (matches description)
      const result3 = workItemService.listWorkItems(db, { q: 'foundation' });
      expect(result3.items).toHaveLength(1);
      expect(result3.items[0].title).toBe('Foundation work');
    });

    it('supports custom sorting by title ascending', () => {
      // Given: Work items with various titles
      const userId = createTestUser('user@example.com', 'Test User');
      workItemService.createWorkItem(db, userId, { title: 'Zebra' });
      workItemService.createWorkItem(db, userId, { title: 'Alpha' });
      workItemService.createWorkItem(db, userId, { title: 'Beta' });

      // When: Sorting by title ascending
      const result = workItemService.listWorkItems(db, { sortBy: 'title', sortOrder: 'asc' });

      // Then: Items are sorted alphabetically
      expect(result.items[0].title).toBe('Alpha');
      expect(result.items[1].title).toBe('Beta');
      expect(result.items[2].title).toBe('Zebra');
    });

    it('supports sorting by start_date descending', () => {
      // Given: Work items with various start dates
      const userId = createTestUser('user@example.com', 'Test User');
      workItemService.createWorkItem(db, userId, { title: 'A', startDate: '2026-03-01' });
      workItemService.createWorkItem(db, userId, { title: 'B', startDate: '2026-03-15' });
      workItemService.createWorkItem(db, userId, { title: 'C', startDate: '2026-03-10' });
      workItemService.createWorkItem(db, userId, { title: 'D' }); // null start date

      // When: Sorting by start_date descending
      const result = workItemService.listWorkItems(db, {
        sortBy: 'start_date',
        sortOrder: 'desc',
      });

      // Then: Items sorted by date (null last)
      expect(result.items[0].startDate).toBe('2026-03-15');
      expect(result.items[1].startDate).toBe('2026-03-10');
      expect(result.items[2].startDate).toBe('2026-03-01');
      expect(result.items[3].startDate).toBeNull();
    });

    it('defaults to created_at descending', () => {
      // Given: Work items created in sequence
      const userId = createTestUser('user@example.com', 'Test User');
      workItemService.createWorkItem(db, userId, { title: 'First' });
      workItemService.createWorkItem(db, userId, { title: 'Second' });
      workItemService.createWorkItem(db, userId, { title: 'Third' });

      // When: Listing without sort params
      const result = workItemService.listWorkItems(db, {});

      // Then: Most recent first
      expect(result.items[0].title).toBe('Third');
      expect(result.items[1].title).toBe('Second');
      expect(result.items[2].title).toBe('First');
    });

    it('combines multiple filters with AND logic', () => {
      // Given: Work items with various properties
      const creator = createTestUser('creator@example.com', 'Creator');
      const userA = createTestUser('userA@example.com', 'User A');
      const tagElectrical = createTestTag('Electrical');

      workItemService.createWorkItem(db, creator, {
        title: 'Electrical wiring in progress',
        status: 'in_progress',
        assignedUserId: userA,
        tagIds: [tagElectrical],
      });
      workItemService.createWorkItem(db, creator, {
        title: 'Electrical planning not started',
        status: 'not_started',
        assignedUserId: userA,
        tagIds: [tagElectrical],
      });
      workItemService.createWorkItem(db, creator, {
        title: 'Electrical installation in progress',
        status: 'in_progress',
        assignedUserId: userA,
        tagIds: [tagElectrical],
      });

      // When: Filtering by status=in_progress AND assignedUserId=userA AND q=wiring
      const result = workItemService.listWorkItems(db, {
        status: 'in_progress',
        assignedUserId: userA,
        q: 'wiring',
      });

      // Then: Only items matching ALL criteria
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('Electrical wiring in progress');
    });

    it('includes tags in list response', () => {
      // Given: Work item with tags
      const userId = createTestUser('user@example.com', 'Test User');
      const tagId = createTestTag('Foundation');
      workItemService.createWorkItem(db, userId, { title: 'Test', tagIds: [tagId] });

      // When: Listing work items
      const result = workItemService.listWorkItems(db, {});

      // Then: Tags are included
      expect(result.items[0].tags).toHaveLength(1);
      expect(result.items[0].tags[0].name).toBe('Foundation');
    });

    it('includes assignedUser summary in list response', () => {
      // Given: Work item assigned to a user
      const creator = createTestUser('creator@example.com', 'Creator');
      const assignee = createTestUser('assignee@example.com', 'Assignee User');
      workItemService.createWorkItem(db, creator, { title: 'Test', assignedUserId: assignee });

      // When: Listing work items
      const result = workItemService.listWorkItems(db, {});

      // Then: Assigned user summary is included
      expect(result.items[0].assignedUser).toBeDefined();
      expect(result.items[0].assignedUser?.displayName).toBe('Assignee User');
    });
  });

  // ─── Budget fields: createWorkItem() ──────────────────────────────────────

  describe('createWorkItem() — budget fields (Story #147)', () => {
    it('creates work item with all budget fields set', () => {
      // Given: Valid budget category and source
      const userId = createTestUser('budget-user@example.com', 'Budget User');
      const categoryId = createTestBudgetCategory('Site-Specific Labor');
      const sourceId = createTestBudgetSource('Home Equity Loan');

      const result = workItemService.createWorkItem(db, userId, {
        title: 'Install electrical',
        plannedBudget: 15000,
        actualCost: 12500.5,
        confidencePercent: 80,
        budgetCategoryId: categoryId,
        budgetSourceId: sourceId,
      });

      expect(result.plannedBudget).toBe(15000);
      expect(result.actualCost).toBe(12500.5);
      expect(result.confidencePercent).toBe(80);
      expect(result.budgetCategoryId).toBe(categoryId);
      expect(result.budgetSourceId).toBe(sourceId);
    });

    it('budget fields default to null when not provided', () => {
      const userId = createTestUser('user2@example.com', 'User 2');

      const result = workItemService.createWorkItem(db, userId, {
        title: 'No Budget Task',
      });

      expect(result.plannedBudget).toBeNull();
      expect(result.actualCost).toBeNull();
      expect(result.confidencePercent).toBeNull();
      expect(result.budgetCategoryId).toBeNull();
      expect(result.budgetSourceId).toBeNull();
    });

    it('allows plannedBudget of 0', () => {
      const userId = createTestUser('user3@example.com', 'User 3');

      const result = workItemService.createWorkItem(db, userId, {
        title: 'Zero Budget Task',
        plannedBudget: 0,
      });

      expect(result.plannedBudget).toBe(0);
    });

    it('allows actualCost of 0', () => {
      const userId = createTestUser('user4@example.com', 'User 4');

      const result = workItemService.createWorkItem(db, userId, {
        title: 'Zero Cost Task',
        actualCost: 0,
      });

      expect(result.actualCost).toBe(0);
    });

    it('allows confidencePercent of 0 (boundary)', () => {
      const userId = createTestUser('user5@example.com', 'User 5');

      const result = workItemService.createWorkItem(db, userId, {
        title: 'Zero Confidence Task',
        confidencePercent: 0,
      });

      expect(result.confidencePercent).toBe(0);
    });

    it('allows confidencePercent of 100 (boundary)', () => {
      const userId = createTestUser('user6@example.com', 'User 6');

      const result = workItemService.createWorkItem(db, userId, {
        title: 'Full Confidence Task',
        confidencePercent: 100,
      });

      expect(result.confidencePercent).toBe(100);
    });

    it('throws ValidationError when plannedBudget is negative', () => {
      const userId = createTestUser('user7@example.com', 'User 7');

      expect(() =>
        workItemService.createWorkItem(db, userId, {
          title: 'Test',
          plannedBudget: -1,
        }),
      ).toThrow(ValidationError);
      expect(() =>
        workItemService.createWorkItem(db, userId, {
          title: 'Test',
          plannedBudget: -1,
        }),
      ).toThrow('plannedBudget must be >= 0');
    });

    it('throws ValidationError when actualCost is negative', () => {
      const userId = createTestUser('user8@example.com', 'User 8');

      expect(() =>
        workItemService.createWorkItem(db, userId, {
          title: 'Test',
          actualCost: -0.01,
        }),
      ).toThrow(ValidationError);
      expect(() =>
        workItemService.createWorkItem(db, userId, {
          title: 'Test',
          actualCost: -0.01,
        }),
      ).toThrow('actualCost must be >= 0');
    });

    it('throws ValidationError when confidencePercent is below 0', () => {
      const userId = createTestUser('user9@example.com', 'User 9');

      expect(() =>
        workItemService.createWorkItem(db, userId, {
          title: 'Test',
          confidencePercent: -1,
        }),
      ).toThrow(ValidationError);
      expect(() =>
        workItemService.createWorkItem(db, userId, {
          title: 'Test',
          confidencePercent: -1,
        }),
      ).toThrow('confidencePercent must be between 0 and 100');
    });

    it('throws ValidationError when confidencePercent is above 100', () => {
      const userId = createTestUser('user10@example.com', 'User 10');

      expect(() =>
        workItemService.createWorkItem(db, userId, {
          title: 'Test',
          confidencePercent: 101,
        }),
      ).toThrow(ValidationError);
      expect(() =>
        workItemService.createWorkItem(db, userId, {
          title: 'Test',
          confidencePercent: 101,
        }),
      ).toThrow('confidencePercent must be between 0 and 100');
    });

    it('throws ValidationError when budgetCategoryId does not exist', () => {
      const userId = createTestUser('user11@example.com', 'User 11');

      expect(() =>
        workItemService.createWorkItem(db, userId, {
          title: 'Test',
          budgetCategoryId: 'non-existent-category',
        }),
      ).toThrow(ValidationError);
      expect(() =>
        workItemService.createWorkItem(db, userId, {
          title: 'Test',
          budgetCategoryId: 'non-existent-category',
        }),
      ).toThrow('Budget category not found: non-existent-category');
    });

    it('throws ValidationError when budgetSourceId does not exist', () => {
      const userId = createTestUser('user12@example.com', 'User 12');

      expect(() =>
        workItemService.createWorkItem(db, userId, {
          title: 'Test',
          budgetSourceId: 'non-existent-source',
        }),
      ).toThrow(ValidationError);
      expect(() =>
        workItemService.createWorkItem(db, userId, {
          title: 'Test',
          budgetSourceId: 'non-existent-source',
        }),
      ).toThrow('Budget source not found: non-existent-source');
    });
  });

  // ─── Budget fields: updateWorkItem() ──────────────────────────────────────

  describe('updateWorkItem() — budget fields (Story #147)', () => {
    it('updates plannedBudget on existing work item', () => {
      const userId = createTestUser('budget-upd@example.com', 'Budget Update');
      const workItem = workItemService.createWorkItem(db, userId, {
        title: 'Budget Work',
        plannedBudget: 10000,
      });

      const updated = workItemService.updateWorkItem(db, workItem.id, {
        plannedBudget: 20000,
      });

      expect(updated.plannedBudget).toBe(20000);
    });

    it('updates actualCost on existing work item', () => {
      const userId = createTestUser('cost-upd@example.com', 'Cost Update');
      const workItem = workItemService.createWorkItem(db, userId, {
        title: 'Cost Work',
        actualCost: 5000,
      });

      const updated = workItemService.updateWorkItem(db, workItem.id, {
        actualCost: 7500.75,
      });

      expect(updated.actualCost).toBe(7500.75);
    });

    it('updates confidencePercent on existing work item', () => {
      const userId = createTestUser('conf-upd@example.com', 'Confidence Update');
      const workItem = workItemService.createWorkItem(db, userId, {
        title: 'Confidence Work',
        confidencePercent: 50,
      });

      const updated = workItemService.updateWorkItem(db, workItem.id, {
        confidencePercent: 90,
      });

      expect(updated.confidencePercent).toBe(90);
    });

    it('sets budgetCategoryId on existing work item', () => {
      const userId = createTestUser('cat-upd@example.com', 'Category Update');
      const categoryId = createTestBudgetCategory('Roof-Specific Materials');
      const workItem = workItemService.createWorkItem(db, userId, { title: 'Category Work' });

      const updated = workItemService.updateWorkItem(db, workItem.id, {
        budgetCategoryId: categoryId,
      });

      expect(updated.budgetCategoryId).toBe(categoryId);
    });

    it('clears budgetCategoryId by setting to null', () => {
      const userId = createTestUser('cat-clr@example.com', 'Category Clear');
      const categoryId = createTestBudgetCategory('Temporary Category');
      const workItem = workItemService.createWorkItem(db, userId, {
        title: 'Work With Category',
        budgetCategoryId: categoryId,
      });

      const updated = workItemService.updateWorkItem(db, workItem.id, {
        budgetCategoryId: null,
      });

      expect(updated.budgetCategoryId).toBeNull();
    });

    it('sets budgetSourceId on existing work item', () => {
      const userId = createTestUser('src-upd@example.com', 'Source Update');
      const sourceId = createTestBudgetSource('Construction Loan');
      const workItem = workItemService.createWorkItem(db, userId, { title: 'Source Work' });

      const updated = workItemService.updateWorkItem(db, workItem.id, {
        budgetSourceId: sourceId,
      });

      expect(updated.budgetSourceId).toBe(sourceId);
    });

    it('clears budgetSourceId by setting to null', () => {
      const userId = createTestUser('src-clr@example.com', 'Source Clear');
      const sourceId = createTestBudgetSource('Temporary Source');
      const workItem = workItemService.createWorkItem(db, userId, {
        title: 'Work With Source',
        budgetSourceId: sourceId,
      });

      const updated = workItemService.updateWorkItem(db, workItem.id, {
        budgetSourceId: null,
      });

      expect(updated.budgetSourceId).toBeNull();
    });

    it('clears plannedBudget by setting to null', () => {
      const userId = createTestUser('plan-clr@example.com', 'Plan Clear');
      const workItem = workItemService.createWorkItem(db, userId, {
        title: 'Work With Budget',
        plannedBudget: 50000,
      });

      const updated = workItemService.updateWorkItem(db, workItem.id, {
        plannedBudget: null,
      });

      expect(updated.plannedBudget).toBeNull();
    });

    it('throws ValidationError when updating plannedBudget to negative', () => {
      const userId = createTestUser('neg-plan@example.com', 'Neg Plan');
      const workItem = workItemService.createWorkItem(db, userId, { title: 'Test' });

      expect(() =>
        workItemService.updateWorkItem(db, workItem.id, { plannedBudget: -500 }),
      ).toThrow(ValidationError);
      expect(() =>
        workItemService.updateWorkItem(db, workItem.id, { plannedBudget: -500 }),
      ).toThrow('plannedBudget must be >= 0');
    });

    it('throws ValidationError when updating actualCost to negative', () => {
      const userId = createTestUser('neg-cost@example.com', 'Neg Cost');
      const workItem = workItemService.createWorkItem(db, userId, { title: 'Test' });

      expect(() => workItemService.updateWorkItem(db, workItem.id, { actualCost: -1 })).toThrow(
        ValidationError,
      );
      expect(() => workItemService.updateWorkItem(db, workItem.id, { actualCost: -1 })).toThrow(
        'actualCost must be >= 0',
      );
    });

    it('throws ValidationError when updating confidencePercent below 0', () => {
      const userId = createTestUser('neg-conf@example.com', 'Neg Conf');
      const workItem = workItemService.createWorkItem(db, userId, { title: 'Test' });

      expect(() =>
        workItemService.updateWorkItem(db, workItem.id, { confidencePercent: -1 }),
      ).toThrow(ValidationError);
      expect(() =>
        workItemService.updateWorkItem(db, workItem.id, { confidencePercent: -1 }),
      ).toThrow('confidencePercent must be between 0 and 100');
    });

    it('throws ValidationError when updating confidencePercent above 100', () => {
      const userId = createTestUser('over-conf@example.com', 'Over Conf');
      const workItem = workItemService.createWorkItem(db, userId, { title: 'Test' });

      expect(() =>
        workItemService.updateWorkItem(db, workItem.id, { confidencePercent: 101 }),
      ).toThrow(ValidationError);
    });

    it('throws ValidationError when updating budgetCategoryId to non-existent ID', () => {
      const userId = createTestUser('bad-cat@example.com', 'Bad Cat');
      const workItem = workItemService.createWorkItem(db, userId, { title: 'Test' });

      expect(() =>
        workItemService.updateWorkItem(db, workItem.id, {
          budgetCategoryId: 'non-existent-category',
        }),
      ).toThrow(ValidationError);
      expect(() =>
        workItemService.updateWorkItem(db, workItem.id, {
          budgetCategoryId: 'non-existent-category',
        }),
      ).toThrow('Budget category not found: non-existent-category');
    });

    it('throws ValidationError when updating budgetSourceId to non-existent ID', () => {
      const userId = createTestUser('bad-src@example.com', 'Bad Src');
      const workItem = workItemService.createWorkItem(db, userId, { title: 'Test' });

      expect(() =>
        workItemService.updateWorkItem(db, workItem.id, {
          budgetSourceId: 'non-existent-source',
        }),
      ).toThrow(ValidationError);
      expect(() =>
        workItemService.updateWorkItem(db, workItem.id, {
          budgetSourceId: 'non-existent-source',
        }),
      ).toThrow('Budget source not found: non-existent-source');
    });
  });
});
