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
   * Helper: Insert a test area directly into the DB.
   * Returns the area ID.
   */
  function insertTestArea(
    name: string,
    color: string | null = null,
    parentId: string | null = null,
  ) {
    const now = new Date().toISOString();
    const areaId = `area-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    db.insert(schema.areas)
      .values({
        id: areaId,
        name,
        parentId,
        color,
        description: null,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return areaId;
  }

  /**
   * Helper: Insert a test trade directly into the DB.
   * Returns the trade ID.
   */
  function insertTestTrade(name: string) {
    const now = new Date().toISOString();
    const tradeId = `trade-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    db.insert(schema.trades)
      .values({
        id: tradeId,
        name,
        color: null,
        description: null,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return tradeId;
  }

  /**
   * Helper: Insert a test vendor directly into the DB.
   * Returns the vendor ID.
   */
  function insertTestVendor(name: string, tradeId: string | null = null) {
    const now = new Date().toISOString();
    const vendorId = `vendor-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    db.insert(schema.vendors)
      .values({
        id: vendorId,
        name,
        tradeId,
        phone: null,
        email: null,
        address: null,
        notes: null,
        createdBy: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return vendorId;
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
      expect(result.subtasks).toEqual([]);
      expect(result.dependencies).toEqual({ predecessors: [], successors: [] });
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('creates work item with all optional fields', () => {
      // Given: A user and another user for assignment
      const creatorId = createTestUser('creator@example.com', 'Creator');
      const assigneeId = createTestUser('assignee@example.com', 'Assignee');

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

    it('throws ValidationError when areaId does not exist', () => {
      // Given: A user and a non-existent area ID
      const userId = createTestUser('user@example.com', 'Test User');
      const data: CreateWorkItemRequest = {
        title: 'Test',
        areaId: 'non-existent-area-id',
      };

      // When/Then: Throws validation error
      expect(() => workItemService.createWorkItem(db, userId, data)).toThrow(ValidationError);
      expect(() => workItemService.createWorkItem(db, userId, data)).toThrow(
        'Area not found: non-existent-area-id',
      );
    });

    it('creates work item with valid areaId and returns area object in response', () => {
      // Given: A user and a real area
      const userId = createTestUser('user@example.com', 'Test User');
      const areaId = insertTestArea('Kitchen', '#FF5733');
      const data: CreateWorkItemRequest = {
        title: 'Install kitchen cabinets',
        areaId,
      };

      // When: Creating work item
      const result = workItemService.createWorkItem(db, userId, data);

      // Then: area object is populated in response
      expect(result.area).not.toBeNull();
      expect(result.area!.id).toBe(areaId);
      expect(result.area!.name).toBe('Kitchen');
      expect(result.area!.color).toBe('#FF5733');
    });

    it('creates work item with valid assignedVendorId and returns vendor object with trade', () => {
      // Given: A user, a trade, and a vendor with that trade
      const userId = createTestUser('user@example.com', 'Test User');
      const tradeId = insertTestTrade('Custom Test Trade');
      const vendorId = insertTestVendor('Sparky Electric', tradeId);
      const data: CreateWorkItemRequest = {
        title: 'Wire the living room',
        assignedVendorId: vendorId,
      };

      // When: Creating work item
      const result = workItemService.createWorkItem(db, userId, data);

      // Then: assignedVendor is populated with trade info
      expect(result.assignedVendor).not.toBeNull();
      expect(result.assignedVendor!.id).toBe(vendorId);
      expect(result.assignedVendor!.name).toBe('Sparky Electric');
      expect(result.assignedVendor!.trade).not.toBeNull();
      expect(result.assignedVendor!.trade!.id).toBe(tradeId);
      expect(result.assignedVendor!.trade!.name).toBe('Custom Test Trade');
    });

    it('throws ValidationError when both assignedUserId and assignedVendorId are set', () => {
      // Given: A user and a vendor — mutual exclusivity enforced by DB trigger
      const userId = createTestUser('user@example.com', 'Test User');
      const vendorId = insertTestVendor('Bob Builder');
      const data: CreateWorkItemRequest = {
        title: 'Test',
        assignedUserId: userId,
        assignedVendorId: vendorId,
      };

      // When/Then: The DB trigger fires and raises an error
      expect(() => workItemService.createWorkItem(db, userId, data)).toThrow();
    });

    it('throws ValidationError for non-existent assignedVendorId', () => {
      // Given: A non-existent vendor ID
      const userId = createTestUser('user@example.com', 'Test User');
      const data: CreateWorkItemRequest = {
        title: 'Test',
        assignedVendorId: 'non-existent-vendor-id',
      };

      // When/Then: Throws validation error
      expect(() => workItemService.createWorkItem(db, userId, data)).toThrow(ValidationError);
      expect(() => workItemService.createWorkItem(db, userId, data)).toThrow(
        'Vendor not found: non-existent-vendor-id',
      );
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
      // Given: A work item with subtask and dependencies
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = workItemService.createWorkItem(db, userId, {
        title: 'Main Task',
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
      expect(detail.subtasks).toHaveLength(1);
      expect(detail.subtasks[0]!.title).toBe('Subtask 1');
      expect(detail.dependencies.predecessors).toHaveLength(1);
      expect(detail.dependencies.predecessors[0]!.workItem.title).toBe('Predecessor');
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

      // When: Updating both dates (use far-future dates so the scheduler's "today floor"
      // for not_started items never clamps them to the current date)
      const updated = workItemService.updateWorkItem(db, workItem.id, {
        startDate: '2099-04-01',
        endDate: '2099-04-10',
      });

      // Then: Both updated successfully
      expect(updated.startDate).toBe('2099-04-01');
      expect(updated.endDate).toBe('2099-04-10');
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

    it('updates areaId to null (clears area)', () => {
      // Given: Work item without area
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = workItemService.createWorkItem(db, userId, { title: 'Test' });

      // When: Updating areaId to null
      const updated = workItemService.updateWorkItem(db, workItem.id, {
        areaId: null,
      });

      // Then: Area is still null
      expect(updated.area).toBeNull();
    });

    it('throws ValidationError for non-existent areaId in update', () => {
      // Given: An existing work item and a bad area ID
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = workItemService.createWorkItem(db, userId, { title: 'Test' });

      // When/Then: Throws validation error
      expect(() =>
        workItemService.updateWorkItem(db, workItem.id, {
          areaId: 'non-existent-area-id',
        }),
      ).toThrow(ValidationError);
      expect(() =>
        workItemService.updateWorkItem(db, workItem.id, {
          areaId: 'non-existent-area-id',
        }),
      ).toThrow('Area not found: non-existent-area-id');
    });

    it('updates areaId to a valid area and returns area object', () => {
      // Given: A work item without an area and a real area
      const userId = createTestUser('user@example.com', 'Test User');
      const areaId = insertTestArea('Bathroom', '#3498DB');
      const workItem = workItemService.createWorkItem(db, userId, { title: 'Tile bathroom' });
      expect(workItem.area).toBeNull();

      // When: Updating areaId to a real area
      const updated = workItemService.updateWorkItem(db, workItem.id, { areaId });

      // Then: Area is populated
      expect(updated.area).not.toBeNull();
      expect(updated.area!.id).toBe(areaId);
      expect(updated.area!.name).toBe('Bathroom');
      expect(updated.area!.color).toBe('#3498DB');
    });

    it('mutual exclusivity check: setting vendor on item that has a user throws', () => {
      // Given: A work item assigned to a user
      const userId = createTestUser('user@example.com', 'Test User');
      const vendorId = insertTestVendor('Fix-It Inc');
      const workItem = workItemService.createWorkItem(db, userId, {
        title: 'Test',
        assignedUserId: userId,
      });

      // When/Then: Trying to also set a vendor triggers the DB trigger
      expect(() =>
        workItemService.updateWorkItem(db, workItem.id, {
          assignedVendorId: vendorId,
        }),
      ).toThrow();
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

    it('filters by areaId returns results (no area set)', () => {
      // Given: Work items without areas
      const userId = createTestUser('user@example.com', 'Test User');
      workItemService.createWorkItem(db, userId, { title: 'Item A' });
      workItemService.createWorkItem(db, userId, { title: 'Item B' });

      // When: Listing without areaId filter
      const result = workItemService.listWorkItems(db, {});

      // Then: Returns all items (area is null for all)
      expect(result.items).toHaveLength(2);
      result.items.forEach((item) => expect(item.area).toBeNull());
    });

    it('filters by areaId returns only items in that area', () => {
      // Given: A real area and work items — some in the area, some not
      const userId = createTestUser('user@example.com', 'Test User');
      const areaId = insertTestArea('Living Room');
      const area2Id = insertTestArea('Bedroom');
      workItemService.createWorkItem(db, userId, { title: 'In Living Room', areaId });
      workItemService.createWorkItem(db, userId, { title: 'In Bedroom', areaId: area2Id });
      workItemService.createWorkItem(db, userId, { title: 'No Area' });

      // When: Filtering by area
      const result = workItemService.listWorkItems(db, { areaId });

      // Then: Only work items in that area are returned
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('In Living Room');
      expect(result.items[0]!.area!.id).toBe(areaId);
    });

    it('areaId filter on a leaf area (no descendants) returns only exact-match items', () => {
      // Given: A leaf area with one work item and a sibling area with another item
      const userId = createTestUser('leaffilter@example.com', 'Leaf User');
      const leafAreaId = insertTestArea('Garage');
      const siblingAreaId = insertTestArea('Garden');
      workItemService.createWorkItem(db, userId, { title: 'Garage Door', areaId: leafAreaId });
      workItemService.createWorkItem(db, userId, { title: 'Plant Hedge', areaId: siblingAreaId });

      // When: Filtering by the leaf area
      const result = workItemService.listWorkItems(db, { areaId: leafAreaId });

      // Then: Only the item in the leaf area is returned
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('Garage Door');
      expect(result.items[0]!.area!.id).toBe(leafAreaId);
    });

    it('areaId filter on a parent area includes items from direct child areas', () => {
      // Given: Parent area P with child area C; one work item in each
      const userId = createTestUser('parentfilter@example.com', 'Parent User');
      const parentAreaId = insertTestArea('Ground Floor');
      const childAreaId = insertTestArea('Ground Floor Kitchen', null, parentAreaId);
      workItemService.createWorkItem(db, userId, {
        title: 'Hallway Tiles',
        areaId: parentAreaId,
      });
      workItemService.createWorkItem(db, userId, {
        title: 'Kitchen Sink',
        areaId: childAreaId,
      });

      // When: Filtering by the parent area
      const result = workItemService.listWorkItems(db, { areaId: parentAreaId });

      // Then: Both items are returned (parent + child)
      expect(result.items).toHaveLength(2);
      const titles = result.items.map((i) => i.title).sort();
      expect(titles).toEqual(['Hallway Tiles', 'Kitchen Sink']);
    });

    it('areaId filter on grandparent area includes items from all descendant levels', () => {
      // Given: Three-level hierarchy G → P → C, each with one work item
      const userId = createTestUser('grandparent@example.com', 'Grandparent User');
      const grandparentId = insertTestArea('House');
      const parentId = insertTestArea('First Floor', null, grandparentId);
      const childId = insertTestArea('First Floor Bedroom', null, parentId);
      workItemService.createWorkItem(db, userId, {
        title: 'Exterior Paint',
        areaId: grandparentId,
      });
      workItemService.createWorkItem(db, userId, {
        title: 'Corridor Flooring',
        areaId: parentId,
      });
      workItemService.createWorkItem(db, userId, {
        title: 'Bedroom Wardrobe',
        areaId: childId,
      });

      // When: Filtering by grandparent — should return all 3
      const allResult = workItemService.listWorkItems(db, { areaId: grandparentId });
      expect(allResult.items).toHaveLength(3);

      // When: Filtering by parent — should return 2 (parent + child, not grandparent)
      const parentResult = workItemService.listWorkItems(db, { areaId: parentId });
      expect(parentResult.items).toHaveLength(2);
      const parentTitles = parentResult.items.map((i) => i.title).sort();
      expect(parentTitles).toEqual(['Bedroom Wardrobe', 'Corridor Flooring']);

      // When: Filtering by child — should return 1 (leaf)
      const childResult = workItemService.listWorkItems(db, { areaId: childId });
      expect(childResult.items).toHaveLength(1);
      expect(childResult.items[0]!.title).toBe('Bedroom Wardrobe');
    });

    it('areaId filter on a parent area excludes items from unrelated areas', () => {
      // Given: Hierarchy P → C and an unrelated area U, each with one work item
      const userId = createTestUser('unrelated@example.com', 'Unrelated User');
      const parentAreaId = insertTestArea('Wing A');
      const childAreaId = insertTestArea('Wing A Office', null, parentAreaId);
      const unrelatedAreaId = insertTestArea('Wing B');
      workItemService.createWorkItem(db, userId, {
        title: 'Wing A Reception',
        areaId: parentAreaId,
      });
      workItemService.createWorkItem(db, userId, {
        title: 'Wing A Office Desk',
        areaId: childAreaId,
      });
      workItemService.createWorkItem(db, userId, {
        title: 'Wing B Storage',
        areaId: unrelatedAreaId,
      });

      // When: Filtering by parent area
      const result = workItemService.listWorkItems(db, { areaId: parentAreaId });

      // Then: Items from Wing A (parent + child) are returned, Wing B is excluded
      expect(result.items).toHaveLength(2);
      const titles = result.items.map((i) => i.title).sort();
      expect(titles).toEqual(['Wing A Office Desk', 'Wing A Reception']);
    });

    it('filters by assignedVendorId returns only items assigned to that vendor', () => {
      // Given: Two vendors and work items assigned to each
      const userId = createTestUser('user@example.com', 'Test User');
      const vendor1 = insertTestVendor('Plumbers R Us');
      const vendor2 = insertTestVendor('Electricians Inc');
      workItemService.createWorkItem(db, userId, {
        title: 'Fix pipes',
        assignedVendorId: vendor1,
      });
      workItemService.createWorkItem(db, userId, {
        title: 'Wire up lights',
        assignedVendorId: vendor2,
      });
      workItemService.createWorkItem(db, userId, { title: 'Unassigned task' });

      // When: Filtering by vendor1
      const result = workItemService.listWorkItems(db, { assignedVendorId: vendor1 });

      // Then: Only items assigned to vendor1 are returned
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('Fix pipes');
      expect(result.items[0]!.assignedVendor!.id).toBe(vendor1);
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
      expect(result1.items[0]!.title).toBe('Install plumbing');

      // And: Searching for "INSTALL" (case-insensitive)
      const result2 = workItemService.listWorkItems(db, { q: 'INSTALL' });
      expect(result2.items).toHaveLength(2);

      // And: Searching for "foundation" (matches description)
      const result3 = workItemService.listWorkItems(db, { q: 'foundation' });
      expect(result3.items).toHaveLength(1);
      expect(result3.items[0]!.title).toBe('Foundation work');
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
      expect(result.items[0]!.title).toBe('Alpha');
      expect(result.items[1]!.title).toBe('Beta');
      expect(result.items[2]!.title).toBe('Zebra');
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
      expect(result.items[0]!.startDate).toBe('2026-03-15');
      expect(result.items[1]!.startDate).toBe('2026-03-10');
      expect(result.items[2]!.startDate).toBe('2026-03-01');
      expect(result.items[3]!.startDate).toBeNull();
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
      expect(result.items[0]!.title).toBe('Third');
      expect(result.items[1]!.title).toBe('Second');
      expect(result.items[2]!.title).toBe('First');
    });

    it('combines multiple filters with AND logic', () => {
      // Given: Work items with various properties
      const creator = createTestUser('creator@example.com', 'Creator');
      const userA = createTestUser('userA@example.com', 'User A');

      workItemService.createWorkItem(db, creator, {
        title: 'Electrical wiring in progress',
        status: 'in_progress',
        assignedUserId: userA,
      });
      workItemService.createWorkItem(db, creator, {
        title: 'Electrical planning not started',
        status: 'not_started',
        assignedUserId: userA,
      });
      workItemService.createWorkItem(db, creator, {
        title: 'Electrical installation in progress',
        status: 'in_progress',
        assignedUserId: userA,
      });

      // When: Filtering by status=in_progress AND assignedUserId=userA AND q=wiring
      const result = workItemService.listWorkItems(db, {
        status: 'in_progress',
        assignedUserId: userA,
        q: 'wiring',
      });

      // Then: Only items matching ALL criteria
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('Electrical wiring in progress');
    });

    it('includes area in list response', () => {
      // Given: Work item without area
      const userId = createTestUser('user@example.com', 'Test User');
      workItemService.createWorkItem(db, userId, { title: 'Test' });

      // When: Listing work items
      const result = workItemService.listWorkItems(db, {});

      // Then: Area is null when unset
      expect(result.items[0]!.area).toBeNull();
    });

    it('includes assignedUser summary in list response', () => {
      // Given: Work item assigned to a user
      const creator = createTestUser('creator@example.com', 'Creator');
      const assignee = createTestUser('assignee@example.com', 'Assignee User');
      workItemService.createWorkItem(db, creator, { title: 'Test', assignedUserId: assignee });

      // When: Listing work items
      const result = workItemService.listWorkItems(db, {});

      // Then: Assigned user summary is included
      expect(result.items[0]!.assignedUser).toBeDefined();
      expect(result.items[0]!.assignedUser?.displayName).toBe('Assignee User');
    });
  });

  // ─── areaId CSV and multi-area filter (Issue #1241) ──────────────────────

  describe('listWorkItems() — areaId CSV and multi-area filter', () => {
    /**
     * Fixture tree shared across all cases in this block:
     *
     *   root  (parentId: null)
     *     ├─ child-a  (parentId: root)
     *     │    └─ grandchild-a1  (parentId: child-a)
     *     └─ child-b  (parentId: root)
     *
     * Work items: one per area + one with no area = 5 items total.
     */
    let userId: string;
    let rootId: string;
    let childAId: string;
    let grandchildA1Id: string;
    let childBId: string;

    beforeEach(() => {
      userId = createTestUser('csvfilter@example.com', 'CSV Filter User');
      rootId = insertTestArea('Root');
      childAId = insertTestArea('Child A', null, rootId);
      grandchildA1Id = insertTestArea('Grandchild A1', null, childAId);
      childBId = insertTestArea('Child B', null, rootId);
      workItemService.createWorkItem(db, userId, { title: 'Root Item', areaId: rootId });
      workItemService.createWorkItem(db, userId, { title: 'Child A Item', areaId: childAId });
      workItemService.createWorkItem(db, userId, {
        title: 'Grandchild A1 Item',
        areaId: grandchildA1Id,
      });
      workItemService.createWorkItem(db, userId, { title: 'Child B Item', areaId: childBId });
      workItemService.createWorkItem(db, userId, { title: 'No Area Item' });
    });

    it('case 1: single leaf ID returns only that leaf item', () => {
      // When: Filtering by the grandchild (leaf) area
      const result = workItemService.listWorkItems(db, { areaId: grandchildA1Id });

      // Then: Only the grandchild item is returned
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('Grandchild A1 Item');
    });

    it('case 2: single parent ID expands to include direct child items', () => {
      // When: Filtering by child-a (has one child: grandchild-a1)
      const result = workItemService.listWorkItems(db, { areaId: childAId });

      // Then: child-a item + grandchild-a1 item are returned
      expect(result.items).toHaveLength(2);
      const titles = result.items.map((i) => i.title).sort();
      expect(titles).toEqual(['Child A Item', 'Grandchild A1 Item']);
    });

    it('case 3: root ID returns full subtree (all 4 area items, excludes no-area item)', () => {
      // When: Filtering by root
      const result = workItemService.listWorkItems(db, { areaId: rootId });

      // Then: All 4 items with an area are returned; no-area item excluded
      expect(result.items).toHaveLength(4);
      const titles = result.items.map((i) => i.title).sort();
      expect(titles).toEqual(['Child A Item', 'Child B Item', 'Grandchild A1 Item', 'Root Item']);
    });

    it('case 4: CSV of two non-adjacent IDs returns exactly those subtrees', () => {
      // When: Filtering by CSV of grandchild-a1 + child-b (neither is ancestor of the other)
      const result = workItemService.listWorkItems(db, {
        areaId: `${grandchildA1Id},${childBId}`,
      });

      // Then: Exactly the grandchild-a1 item and the child-b item are returned
      expect(result.items).toHaveLength(2);
      const titles = result.items.map((i) => i.title).sort();
      expect(titles).toEqual(['Child B Item', 'Grandchild A1 Item']);
    });

    it('case 5: CSV of parent + its descendant deduplicates and returns same items as parent alone', () => {
      // When: client sends both child-a and grandchild-a1 (redundant, but valid)
      const result = workItemService.listWorkItems(db, {
        areaId: `${childAId},${grandchildA1Id}`,
      });

      // Then: 2 items — child-a + grandchild-a1 (no duplication in results)
      expect(result.items).toHaveLength(2);
      const titles = result.items.map((i) => i.title).sort();
      expect(titles).toEqual(['Child A Item', 'Grandchild A1 Item']);
    });

    it('case 6: array input returns union of subtrees', () => {
      // When: Passing an array (internal API usage pattern)
      // WorkItemListQuery.areaId is typed `string` on the wire, but resolveAreaIds
      // accepts `string | string[]` — cast to satisfy TS.
      const result = workItemService.listWorkItems(db, {
        areaId: [childAId, childBId],
      } as unknown as WorkItemListQuery);

      // Then: 3 items — child-a, grandchild-a1 (descendant of child-a), child-b
      expect(result.items).toHaveLength(3);
      const titles = result.items.map((i) => i.title).sort();
      expect(titles).toEqual(['Child A Item', 'Child B Item', 'Grandchild A1 Item']);
    });

    it('case 7: empty string skips filter and returns all items', () => {
      // When: areaId is an empty string (falsy guard skips the filter)
      const result = workItemService.listWorkItems(db, { areaId: '' });

      // Then: All 5 items are returned (filter not applied)
      expect(result.items).toHaveLength(5);
    });

    it('case 8: unknown ID returns empty result set', () => {
      // When: Filtering by a non-existent area ID
      const result = workItemService.listWorkItems(db, { areaId: 'non-existent-area-uuid' });

      // Then: No items match (unknown IDs are silently ignored; inArray returns no rows)
      expect(result.items).toHaveLength(0);
    });

    it('case 9: CSV with empty segments filters them out without error', () => {
      // When: CSV string has leading/trailing/double commas
      const result = workItemService.listWorkItems(db, {
        areaId: `,${childAId},`,
      });

      // Then: 2 items (child-a + grandchild-a1); empty segments silently dropped
      expect(result.items).toHaveLength(2);
      const titles = result.items.map((i) => i.title).sort();
      expect(titles).toEqual(['Child A Item', 'Grandchild A1 Item']);
    });

    it('whitespace-only segments in CSV are trimmed and filtered out', () => {
      // When: CSV contains a whitespace-only segment between commas
      const result = workItemService.listWorkItems(db, {
        areaId: `  ,${childBId},  `,
      });

      // Then: Only child-b item is returned; whitespace segments dropped
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('Child B Item');
    });

    it('CSV with all empty/whitespace segments resolves to zero IDs — filter skipped, returns all', () => {
      // When: areaId resolves to empty after trimming all segments
      // resolveAreaIds returns [] — the guard skips inArray, so all items returned
      const result = workItemService.listWorkItems(db, { areaId: ' , , ' });

      // Then: filter is skipped entirely, all 5 items returned
      expect(result.items).toHaveLength(5);
    });
  });

  // ─── Budget fields: createWorkItem() / updateWorkItem() ───────────────────
  // NOTE: Story #147 budget fields (plannedBudget, actualCost, confidencePercent,
  // budgetCategoryId, budgetSourceId) were removed from work_items in Story 5.9.
  // Budget data now lives in work_item_budgets (see workItemBudgetService.test.ts).

  // ─── Actual dates: createWorkItem() ───────────────────────────────────────

  describe('createWorkItem() - actual dates (Issue #296)', () => {
    it('creates work item with actualStartDate and actualEndDate', () => {
      // Given: A request with explicit actual dates
      const userId = createTestUser('user@example.com', 'Test User');
      const data: CreateWorkItemRequest = {
        title: 'Foundation Work',
        actualStartDate: '2026-03-01',
        actualEndDate: '2026-03-10',
      };

      // When: Creating the work item
      const result = workItemService.createWorkItem(db, userId, data);

      // Then: Actual dates are persisted and returned
      expect(result.actualStartDate).toBe('2026-03-01');
      expect(result.actualEndDate).toBe('2026-03-10');
    });

    it('actual dates default to null when not provided', () => {
      // Given: A request without actual dates
      const userId = createTestUser('user@example.com', 'Test User');
      const data: CreateWorkItemRequest = { title: 'Foundation Work' };

      // When: Creating the work item
      const result = workItemService.createWorkItem(db, userId, data);

      // Then: Actual dates are null
      expect(result.actualStartDate).toBeNull();
      expect(result.actualEndDate).toBeNull();
    });

    it('actual dates appear in WorkItemSummary list response', () => {
      // Given: A work item with actual dates
      const userId = createTestUser('user@example.com', 'Test User');
      workItemService.createWorkItem(db, userId, {
        title: 'Foundation Work',
        actualStartDate: '2026-03-01',
        actualEndDate: '2026-03-10',
      });

      // When: Listing work items
      const result = workItemService.listWorkItems(db, {});

      // Then: Actual dates are included in list summary
      expect(result.items[0]!.actualStartDate).toBe('2026-03-01');
      expect(result.items[0]!.actualEndDate).toBe('2026-03-10');
    });

    it('actual dates appear in WorkItemDetail response', () => {
      // Given: A work item with actual dates
      const userId = createTestUser('user@example.com', 'Test User');
      const created = workItemService.createWorkItem(db, userId, {
        title: 'Foundation Work',
        actualStartDate: '2026-03-05',
        actualEndDate: '2026-03-12',
      });

      // When: Getting work item detail
      const detail = workItemService.getWorkItemDetail(db, created.id);

      // Then: Actual dates are in the detail
      expect(detail.actualStartDate).toBe('2026-03-05');
      expect(detail.actualEndDate).toBe('2026-03-12');
    });
  });

  // ─── Status transition auto-population of actual dates (Issue #296) ────────

  describe('updateWorkItem() - status transitions auto-populate actual dates', () => {
    it('not_started → in_progress auto-populates actualStartDate with today', () => {
      // Given: A not_started work item with no actualStartDate
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = workItemService.createWorkItem(db, userId, {
        title: 'Foundation Work',
        status: 'not_started',
      });
      expect(workItem.actualStartDate).toBeNull();

      // When: Transitioning to in_progress
      const updated = workItemService.updateWorkItem(db, workItem.id, { status: 'in_progress' });

      // Then: actualStartDate is set to today (YYYY-MM-DD)
      const today = new Date().toISOString().slice(0, 10);
      expect(updated.actualStartDate).toBe(today);
      expect(updated.actualEndDate).toBeNull(); // Not set yet
    });

    it('in_progress → completed auto-populates actualEndDate with today', () => {
      // Given: An in_progress work item with no actualEndDate
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = workItemService.createWorkItem(db, userId, {
        title: 'Foundation Work',
        status: 'in_progress',
        actualStartDate: '2026-03-01', // Already has start date
      });
      expect(workItem.actualEndDate).toBeNull();

      // When: Transitioning to completed
      const updated = workItemService.updateWorkItem(db, workItem.id, { status: 'completed' });

      // Then: actualEndDate is set to today, actualStartDate unchanged
      const today = new Date().toISOString().slice(0, 10);
      expect(updated.actualEndDate).toBe(today);
      expect(updated.actualStartDate).toBe('2026-03-01'); // Not overwritten
    });

    it('not_started → completed (direct skip) auto-populates both actual dates', () => {
      // Given: A not_started work item with no actual dates
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = workItemService.createWorkItem(db, userId, {
        title: 'Foundation Work',
        status: 'not_started',
      });
      expect(workItem.actualStartDate).toBeNull();
      expect(workItem.actualEndDate).toBeNull();

      // When: Transitioning directly to completed
      const updated = workItemService.updateWorkItem(db, workItem.id, { status: 'completed' });

      // Then: Both actual dates are set to today
      const today = new Date().toISOString().slice(0, 10);
      expect(updated.actualStartDate).toBe(today);
      expect(updated.actualEndDate).toBe(today);
    });

    it('does NOT overwrite existing actualStartDate on not_started → in_progress transition', () => {
      // Given: A not_started work item with an existing actualStartDate
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = workItemService.createWorkItem(db, userId, {
        title: 'Foundation Work',
        status: 'not_started',
        actualStartDate: '2026-01-15', // Already set
      });

      // When: Transitioning to in_progress
      const updated = workItemService.updateWorkItem(db, workItem.id, { status: 'in_progress' });

      // Then: Existing actualStartDate is preserved, not overwritten with today
      expect(updated.actualStartDate).toBe('2026-01-15');
    });

    it('does NOT overwrite existing actualEndDate on in_progress → completed transition', () => {
      // Given: An in_progress work item with an existing actualEndDate
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = workItemService.createWorkItem(db, userId, {
        title: 'Foundation Work',
        status: 'in_progress',
        actualStartDate: '2026-03-01',
        actualEndDate: '2026-03-08', // Already set
      });

      // When: Transitioning to completed
      const updated = workItemService.updateWorkItem(db, workItem.id, { status: 'completed' });

      // Then: Existing actualEndDate is preserved
      expect(updated.actualEndDate).toBe('2026-03-08');
    });

    it('uses explicitly provided actualStartDate in same request, not today', () => {
      // Given: A not_started work item
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = workItemService.createWorkItem(db, userId, {
        title: 'Foundation Work',
        status: 'not_started',
      });

      // When: Transitioning to in_progress AND providing explicit actualStartDate
      const updated = workItemService.updateWorkItem(db, workItem.id, {
        status: 'in_progress',
        actualStartDate: '2026-02-20', // Explicit date, not today
      });

      // Then: The explicit date is used instead of today
      expect(updated.actualStartDate).toBe('2026-02-20');
    });

    it('uses explicitly provided actualEndDate in same request, not today', () => {
      // Given: An in_progress work item
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = workItemService.createWorkItem(db, userId, {
        title: 'Foundation Work',
        status: 'in_progress',
        actualStartDate: '2026-03-01',
      });

      // When: Transitioning to completed AND providing explicit actualEndDate
      const updated = workItemService.updateWorkItem(db, workItem.id, {
        status: 'completed',
        actualEndDate: '2026-03-20', // Explicit date, not today
      });

      // Then: The explicit date is used instead of today
      expect(updated.actualEndDate).toBe('2026-03-20');
    });

    it('no auto-population when status does not change', () => {
      // Given: A not_started work item
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = workItemService.createWorkItem(db, userId, {
        title: 'Foundation Work',
        status: 'not_started',
      });

      // When: Updating only the title (status unchanged)
      const updated = workItemService.updateWorkItem(db, workItem.id, {
        title: 'Updated Title',
      });

      // Then: Actual dates remain null (no auto-population)
      expect(updated.actualStartDate).toBeNull();
      expect(updated.actualEndDate).toBeNull();
    });

    it('no auto-population on in_progress → not_started reversal', () => {
      // Given: An in_progress work item
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = workItemService.createWorkItem(db, userId, {
        title: 'Foundation Work',
        status: 'in_progress',
      });

      // When: Reversing status back to not_started
      const updated = workItemService.updateWorkItem(db, workItem.id, {
        status: 'not_started',
      });

      // Then: No auto-population occurs for this transition
      expect(updated.actualStartDate).toBeNull();
      expect(updated.actualEndDate).toBeNull();
    });
  });

  // ─── Manual actualDate updates via updateWorkItem() ───────────────────────

  describe('updateWorkItem() - manual actual date updates (Issue #296)', () => {
    it('allows updating actualStartDate directly', () => {
      // Given: A work item with no actualStartDate
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = workItemService.createWorkItem(db, userId, { title: 'Foundation Work' });

      // When: Updating actualStartDate
      const updated = workItemService.updateWorkItem(db, workItem.id, {
        actualStartDate: '2026-04-01',
      });

      // Then: actualStartDate is set
      expect(updated.actualStartDate).toBe('2026-04-01');
    });

    it('allows updating actualEndDate directly', () => {
      // Given: A work item with no actualEndDate
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = workItemService.createWorkItem(db, userId, { title: 'Foundation Work' });

      // When: Updating actualEndDate
      const updated = workItemService.updateWorkItem(db, workItem.id, {
        actualEndDate: '2026-04-15',
      });

      // Then: actualEndDate is set
      expect(updated.actualEndDate).toBe('2026-04-15');
    });

    it('allows clearing actualStartDate to null', () => {
      // Given: A work item with actualStartDate set
      const userId = createTestUser('user@example.com', 'Test User');
      const workItem = workItemService.createWorkItem(db, userId, {
        title: 'Foundation Work',
        actualStartDate: '2026-03-01',
      });

      // When: Clearing actualStartDate
      const updated = workItemService.updateWorkItem(db, workItem.id, {
        actualStartDate: null,
      });

      // Then: actualStartDate is null
      expect(updated.actualStartDate).toBeNull();
    });
  });
});
