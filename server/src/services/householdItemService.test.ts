import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as householdItemService from './householdItemService.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';

describe('Household Item Service', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  /** Creates a fresh in-memory database with migrations applied. */
  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  let idCounter = 0;

  /** Helper: Create a test user */
  function createTestUser(email: string, displayName: string, role: 'admin' | 'member' = 'member') {
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

  /** Helper: Create a test vendor */
  function createTestVendor(name: string) {
    const now = new Date(Date.now() + idCounter++).toISOString();
    const vendorId = `vendor-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    db.insert(schema.vendors)
      .values({
        id: vendorId,
        name,
        tradeId: null,
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

  /** Helper: Insert a test area directly into the DB. Returns the area ID. */
  function insertTestArea(
    name: string,
    color: string | null = null,
    parentId: string | null = null,
  ) {
    const now = new Date(Date.now() + idCounter++).toISOString();
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
  // createHouseholdItem()
  // ---------------------------------------------------------------------------

  describe('createHouseholdItem()', () => {
    it('creates item with only required name field and applies all defaults', () => {
      // Given: A user and minimal request data
      const userId = createTestUser('user@example.com', 'Test User');
      const data: Parameters<typeof householdItemService.createHouseholdItem>[2] = {
        name: 'Living Room Sofa',
      };

      // When: Creating household item
      const result = householdItemService.createHouseholdItem(db, userId, data);

      // Then: Item is created with correct defaults
      expect(result.id).toBeDefined();
      expect(result.name).toBe('Living Room Sofa');
      expect(result.description).toBeNull();
      expect(result.category).toBe('hic-other');
      expect(result.status).toBe('planned');
      expect(result.quantity).toBe(1);
      expect(result.vendor).toBeNull();
      expect(result.area).toBeNull();
      expect(result.url).toBeNull();
      expect(result.orderDate).toBeNull();
      expect(result.targetDeliveryDate).toBeNull();
      expect(result.actualDeliveryDate).toBeNull();
      expect(result.earliestDeliveryDate).toBeNull();
      expect(result.latestDeliveryDate).toBeNull();
      expect(result.dependencies).toEqual([]);
      expect(result.subsidies).toEqual([]);
      expect(result.budgetLineCount).toBe(0);
      expect(result.totalPlannedAmount).toBe(0);
      expect(result.createdBy?.id).toBe(userId);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('creates item with all optional fields', () => {
      // Given: A user and vendor
      const userId = createTestUser('user@example.com', 'Test User');
      const vendorId = createTestVendor('IKEA');

      const data: Parameters<typeof householdItemService.createHouseholdItem>[2] = {
        name: 'King Bed Frame',
        description: 'Solid oak king bed frame with headboard',
        category: 'hic-furniture',
        status: 'purchased',
        vendorId,
        url: 'https://ikea.com/king-bed',
        quantity: 1,
        orderDate: '2026-03-01',
        earliestDeliveryDate: '2026-04-01',
        latestDeliveryDate: '2026-04-30',
        actualDeliveryDate: null,
      };

      // When: Creating household item
      const result = householdItemService.createHouseholdItem(db, userId, data);

      // Then: All fields are set correctly
      expect(result.name).toBe('King Bed Frame');
      expect(result.description).toBe('Solid oak king bed frame with headboard');
      expect(result.category).toBe('hic-furniture');
      expect(result.status).toBe('purchased');
      expect(result.vendor?.id).toBe(vendorId);
      expect(result.vendor?.name).toBe('IKEA');
      expect(result.url).toBe('https://ikea.com/king-bed');
      expect(result.area).toBeNull();
      expect(result.quantity).toBe(1);
      expect(result.orderDate).toBe('2026-03-01');
      expect(result.earliestDeliveryDate).toBe('2026-04-01');
      expect(result.latestDeliveryDate).toBe('2026-04-30');
      expect(result.actualDeliveryDate).toBeNull();
      expect(result.createdBy?.id).toBe(userId);
    });

    it('trims whitespace from name', () => {
      // Given: Name with leading/trailing whitespace
      const userId = createTestUser('user@example.com', 'Test User');
      const data: Parameters<typeof householdItemService.createHouseholdItem>[2] = {
        name: '  Kitchen Table  ',
      };

      // When: Creating household item
      const result = householdItemService.createHouseholdItem(db, userId, data);

      // Then: Name is trimmed
      expect(result.name).toBe('Kitchen Table');
    });

    it('throws ValidationError when name is empty string', () => {
      // Given: Empty name
      const userId = createTestUser('user@example.com', 'Test User');
      const data: Parameters<typeof householdItemService.createHouseholdItem>[2] = { name: '' };

      // When/Then: Throws validation error
      expect(() => householdItemService.createHouseholdItem(db, userId, data)).toThrow(
        ValidationError,
      );
      expect(() => householdItemService.createHouseholdItem(db, userId, data)).toThrow(
        'Name is required',
      );
    });

    it('throws ValidationError when name is only whitespace', () => {
      // Given: Whitespace-only name
      const userId = createTestUser('user@example.com', 'Test User');
      const data: Parameters<typeof householdItemService.createHouseholdItem>[2] = { name: '   ' };

      // When/Then: Throws validation error
      expect(() => householdItemService.createHouseholdItem(db, userId, data)).toThrow(
        ValidationError,
      );
    });

    it('throws ValidationError for non-existent vendorId', () => {
      // Given: Non-existent vendor ID
      const userId = createTestUser('user@example.com', 'Test User');
      const data: Parameters<typeof householdItemService.createHouseholdItem>[2] = {
        name: 'Test Item',
        vendorId: 'non-existent-vendor-id',
      };

      // When/Then: Throws validation error
      expect(() => householdItemService.createHouseholdItem(db, userId, data)).toThrow(
        ValidationError,
      );
      expect(() => householdItemService.createHouseholdItem(db, userId, data)).toThrow(
        'Vendor not found: non-existent-vendor-id',
      );
    });

    it('throws ValidationError for non-existent areaId', () => {
      // Given: A non-existent area ID
      const userId = createTestUser('user@example.com', 'Test User');
      const data: Parameters<typeof householdItemService.createHouseholdItem>[2] = {
        name: 'Test Item',
        areaId: 'non-existent-area-id',
      };

      // When/Then: Throws validation error
      expect(() => householdItemService.createHouseholdItem(db, userId, data)).toThrow(
        ValidationError,
      );
      expect(() => householdItemService.createHouseholdItem(db, userId, data)).toThrow(
        'Area not found: non-existent-area-id',
      );
    });

    it('creates item with valid areaId and returns area object', () => {
      // Given: A user and a real area
      const userId = createTestUser('user@example.com', 'Test User');
      const areaId = insertTestArea('Bedroom', '#9B59B6');
      const data: Parameters<typeof householdItemService.createHouseholdItem>[2] = {
        name: 'Wardrobe',
        areaId,
      };

      // When: Creating household item
      const result = householdItemService.createHouseholdItem(db, userId, data);

      // Then: Area is populated in response
      expect(result.area).not.toBeNull();
      expect(result.area!.id).toBe(areaId);
      expect(result.area!.name).toBe('Bedroom');
      expect(result.area!.color).toBe('#9B59B6');
    });

    it('sets createdBy from userId', () => {
      // Given: Two users
      const user1 = createTestUser('user1@example.com', 'User One');
      const user2 = createTestUser('user2@example.com', 'User Two');

      // When: Creating with specific user
      const result = householdItemService.createHouseholdItem(db, user2, { name: 'My Lamp' });

      // Then: createdBy reflects user2, not user1
      expect(result.createdBy?.id).toBe(user2);
      expect(result.createdBy?.id).not.toBe(user1);
    });

    it('creates item with category appliances', () => {
      // Given: User
      const userId = createTestUser('user@example.com', 'Test User');

      // When: Creating with specific category
      const result = householdItemService.createHouseholdItem(db, userId, {
        name: 'Dishwasher',
        category: 'hic-appliances',
      });

      // Then: Category is set correctly
      expect(result.category).toBe('hic-appliances');
    });

    it('creates item with status scheduled', () => {
      // Given: User
      const userId = createTestUser('user@example.com', 'Test User');

      // When: Creating with specific status
      const result = householdItemService.createHouseholdItem(db, userId, {
        name: 'Washing Machine',
        status: 'scheduled',
      });

      // Then: Status is set correctly
      expect(result.status).toBe('scheduled');
    });

    it('creates item with quantity greater than 1', () => {
      // Given: User
      const userId = createTestUser('user@example.com', 'Test User');

      // When: Creating with specific quantity
      const result = householdItemService.createHouseholdItem(db, userId, {
        name: 'Bar Stools',
        quantity: 4,
      });

      // Then: Quantity is set correctly
      expect(result.quantity).toBe(4);
    });
  });

  // ---------------------------------------------------------------------------
  // getHouseholdItemById()
  // ---------------------------------------------------------------------------

  describe('getHouseholdItemById()', () => {
    it('returns full detail with area, dependencies, and subsidies', () => {
      // Given: An item created with a vendor
      const userId = createTestUser('user@example.com', 'Test User');
      const created = householdItemService.createHouseholdItem(db, userId, {
        name: 'Coffee Table',
      });

      // When: Getting by ID
      const result = householdItemService.getHouseholdItemById(db, created.id);

      // Then: Full detail is returned
      expect(result.id).toBe(created.id);
      expect(result.name).toBe('Coffee Table');
      expect(result.area).toBeNull();
      expect(result.dependencies).toEqual([]);
      expect(result.subsidies).toEqual([]);
    });

    it('throws NotFoundError for non-existent ID', () => {
      // Given: No household items exist
      // When/Then: Throws not found error
      expect(() => householdItemService.getHouseholdItemById(db, 'non-existent-id')).toThrow(
        NotFoundError,
      );
      expect(() => householdItemService.getHouseholdItemById(db, 'non-existent-id')).toThrow(
        'Household item not found',
      );
    });

    it('returns vendor details when vendor is linked', () => {
      // Given: An item with a vendor
      const userId = createTestUser('user@example.com', 'Test User');
      const vendorId = createTestVendor('Best Buy');
      const created = householdItemService.createHouseholdItem(db, userId, {
        name: 'Smart TV',
        vendorId,
        category: 'hic-electronics',
      });

      // When: Getting by ID
      const result = householdItemService.getHouseholdItemById(db, created.id);

      // Then: Vendor info is populated
      expect(result.vendor?.id).toBe(vendorId);
      expect(result.vendor?.name).toBe('Best Buy');
    });

    it('returns dependencies linked to the household item', () => {
      // Given: A household item and a work item to depend on
      const userId = createTestUser('user@example.com', 'Test User');
      const created = householdItemService.createHouseholdItem(db, userId, {
        name: 'Kitchen Cabinets',
      });

      // Insert a work item and link it as a dependency
      const now = new Date().toISOString();
      const workItemId = 'wi-test-001';
      db.insert(schema.workItems)
        .values({
          id: workItemId,
          title: 'Install Cabinets',
          status: 'not_started',
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      db.insert(schema.householdItemDeps)
        .values({
          householdItemId: created.id,
          predecessorType: 'work_item',
          predecessorId: workItemId,
        })
        .run();

      // When: Getting by ID
      const result = householdItemService.getHouseholdItemById(db, created.id);

      // Then: Dependency is included
      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0].predecessorType).toBe('work_item');
      expect(result.dependencies[0].predecessorId).toBe(workItemId);
    });
  });

  // ---------------------------------------------------------------------------
  // updateHouseholdItem()
  // ---------------------------------------------------------------------------

  describe('updateHouseholdItem()', () => {
    it('updates a single field and leaves others unchanged', () => {
      // Given: An existing household item
      const userId = createTestUser('user@example.com', 'Test User');
      const item = householdItemService.createHouseholdItem(db, userId, {
        name: 'Original Name',
        category: 'hic-furniture',
        status: 'planned',
      });

      // When: Updating only status
      const updated = householdItemService.updateHouseholdItem(db, item.id, {
        status: 'purchased',
      });

      // Then: Only status changed
      expect(updated.status).toBe('purchased');
      expect(updated.name).toBe('Original Name');
      expect(updated.category).toBe('hic-furniture');
      expect(updated.updatedAt).not.toBe(item.updatedAt);
    });

    it('updates vendor to null (clears it)', () => {
      // Given: An item with a vendor
      const userId = createTestUser('user@example.com', 'Test User');
      const vendorId = createTestVendor('Home Depot');
      const item = householdItemService.createHouseholdItem(db, userId, {
        name: 'Paint',
        vendorId,
      });
      expect(item.vendor?.id).toBe(vendorId);

      // When: Clearing vendor
      const updated = householdItemService.updateHouseholdItem(db, item.id, {
        vendorId: null,
      });

      // Then: Vendor is null
      expect(updated.vendor).toBeNull();
    });

    it('updates areaId to a valid area', () => {
      // Given: An item without an area
      const userId = createTestUser('user@example.com', 'Test User');
      const item = householdItemService.createHouseholdItem(db, userId, { name: 'Lamp' });
      expect(item.area).toBeNull();

      // When: Updating areaId to null (clearing it)
      const updated = householdItemService.updateHouseholdItem(db, item.id, {
        areaId: null,
      });

      // Then: Area is still null
      expect(updated.area).toBeNull();
    });

    it('throws ValidationError for non-existent areaId in update', () => {
      // Given: An existing item and a bad area ID
      const userId = createTestUser('user@example.com', 'Test User');
      const item = householdItemService.createHouseholdItem(db, userId, { name: 'Blender' });

      // When/Then: Throws validation error
      expect(() =>
        householdItemService.updateHouseholdItem(db, item.id, {
          areaId: 'non-existent-area-id',
        }),
      ).toThrow(ValidationError);
      expect(() =>
        householdItemService.updateHouseholdItem(db, item.id, {
          areaId: 'non-existent-area-id',
        }),
      ).toThrow('Area not found: non-existent-area-id');
    });

    it('updates areaId to a valid area and returns area object', () => {
      // Given: An item without an area and a real area
      const userId = createTestUser('user@example.com', 'Test User');
      const areaId = insertTestArea('Kitchen', '#E74C3C');
      const item = householdItemService.createHouseholdItem(db, userId, { name: 'Blender' });
      expect(item.area).toBeNull();

      // When: Updating to a real area
      const updated = householdItemService.updateHouseholdItem(db, item.id, { areaId });

      // Then: Area is populated
      expect(updated.area).not.toBeNull();
      expect(updated.area!.id).toBe(areaId);
      expect(updated.area!.name).toBe('Kitchen');
      expect(updated.area!.color).toBe('#E74C3C');
    });

    it('throws NotFoundError for non-existent ID', () => {
      // Given: No household items exist
      // When/Then: Throws not found error
      expect(() =>
        householdItemService.updateHouseholdItem(db, 'non-existent-id', { status: 'purchased' }),
      ).toThrow(NotFoundError);
      expect(() =>
        householdItemService.updateHouseholdItem(db, 'non-existent-id', { status: 'purchased' }),
      ).toThrow('Household item not found');
    });

    it('throws ValidationError for non-existent vendorId in update', () => {
      // Given: An existing item
      const userId = createTestUser('user@example.com', 'Test User');
      const item = householdItemService.createHouseholdItem(db, userId, { name: 'Chair' });

      // When/Then: Throws validation error for bad vendor
      expect(() =>
        householdItemService.updateHouseholdItem(db, item.id, {
          vendorId: 'bad-vendor-id',
        }),
      ).toThrow(ValidationError);
      expect(() =>
        householdItemService.updateHouseholdItem(db, item.id, {
          vendorId: 'bad-vendor-id',
        }),
      ).toThrow('Vendor not found: bad-vendor-id');
    });

    it('throws ValidationError when name is empty string in update', () => {
      // Given: An existing item
      const userId = createTestUser('user@example.com', 'Test User');
      const item = householdItemService.createHouseholdItem(db, userId, { name: 'Chair' });

      // When/Then: Throws validation error for empty name
      expect(() => householdItemService.updateHouseholdItem(db, item.id, { name: '' })).toThrow(
        ValidationError,
      );
      expect(() => householdItemService.updateHouseholdItem(db, item.id, { name: '' })).toThrow(
        'Name cannot be empty',
      );
    });

    it('updates multiple fields simultaneously', () => {
      // Given: An existing item
      const userId = createTestUser('user@example.com', 'Test User');
      const item = householdItemService.createHouseholdItem(db, userId, {
        name: 'Draft Item',
        category: 'hic-other',
        status: 'planned',
      });

      // When: Updating multiple fields
      const updated = householdItemService.updateHouseholdItem(db, item.id, {
        name: 'Final Name',
        category: 'hic-fixtures',
        status: 'purchased',
        quantity: 2,
      });

      // Then: All updated fields are correct
      expect(updated.name).toBe('Final Name');
      expect(updated.category).toBe('hic-fixtures');
      expect(updated.status).toBe('purchased');
      expect(updated.quantity).toBe(2);
    });

    it('can update delivery date constraints', () => {
      // Given: An existing item
      const userId = createTestUser('user@example.com', 'Test User');
      const item = householdItemService.createHouseholdItem(db, userId, { name: 'Fridge' });

      // When: Setting delivery date constraints and actual date
      const updated = householdItemService.updateHouseholdItem(db, item.id, {
        orderDate: '2026-03-10',
        earliestDeliveryDate: '2026-04-10',
        latestDeliveryDate: '2026-04-20',
        actualDeliveryDate: '2026-04-12',
      });

      // Then: Dates are set correctly
      expect(updated.orderDate).toBe('2026-03-10');
      expect(updated.earliestDeliveryDate).toBe('2026-04-10');
      expect(updated.latestDeliveryDate).toBe('2026-04-20');
      expect(updated.actualDeliveryDate).toBe('2026-04-12');
    });

    it('can clear optional fields to null', () => {
      // Given: An item with optional fields set
      const userId = createTestUser('user@example.com', 'Test User');
      const item = householdItemService.createHouseholdItem(db, userId, {
        name: 'Rug',
        url: 'https://example.com/rug',
        orderDate: '2026-03-01',
      });

      // When: Clearing optional fields
      const updated = householdItemService.updateHouseholdItem(db, item.id, {
        areaId: null,
        url: null,
        orderDate: null,
      });

      // Then: Fields are null
      expect(updated.area).toBeNull();
      expect(updated.url).toBeNull();
      expect(updated.orderDate).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // deleteHouseholdItem()
  // ---------------------------------------------------------------------------

  describe('deleteHouseholdItem()', () => {
    it('deletes the item successfully', () => {
      // Given: An existing item
      const userId = createTestUser('user@example.com', 'Test User');
      const item = householdItemService.createHouseholdItem(db, userId, { name: 'Ottoman' });

      // When: Deleting it
      householdItemService.deleteHouseholdItem(db, item.id);

      // Then: It can no longer be found
      expect(() => householdItemService.getHouseholdItemById(db, item.id)).toThrow(NotFoundError);
    });

    it('throws NotFoundError for non-existent ID', () => {
      // Given: No household items exist
      // When/Then: Throws not found error
      expect(() => householdItemService.deleteHouseholdItem(db, 'non-existent-id')).toThrow(
        NotFoundError,
      );
      expect(() => householdItemService.deleteHouseholdItem(db, 'non-existent-id')).toThrow(
        'Household item not found',
      );
    });

    it('cascades to dependency records when item is deleted', () => {
      // Given: An item with a dependency
      const userId = createTestUser('user@example.com', 'Test User');
      const item = householdItemService.createHouseholdItem(db, userId, { name: 'Armchair' });

      // Insert a work item and link as dependency
      const now = new Date().toISOString();
      const workItemId = 'wi-dep-cascade-test';
      db.insert(schema.workItems)
        .values({
          id: workItemId,
          title: 'Deliver Armchair',
          status: 'not_started',
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      db.insert(schema.householdItemDeps)
        .values({
          householdItemId: item.id,
          predecessorType: 'work_item',
          predecessorId: workItemId,
        })
        .run();

      // When: Deleting the item
      householdItemService.deleteHouseholdItem(db, item.id);

      // Then: Dependency records are deleted
      const depRows = db
        .select()
        .from(schema.householdItemDeps)
        .where(eq(schema.householdItemDeps.householdItemId, item.id))
        .all();
      expect(depRows).toHaveLength(0);
    });

    it('cascades to dependency records', () => {
      // Given: An item linked to a work item dependency
      const userId = createTestUser('user@example.com', 'Test User');
      const item = householdItemService.createHouseholdItem(db, userId, {
        name: 'Countertop',
      });

      const now = new Date().toISOString();
      const workItemId = 'wi-cascade-test';
      db.insert(schema.workItems)
        .values({
          id: workItemId,
          title: 'Install Countertop',
          status: 'not_started',
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      db.insert(schema.householdItemDeps)
        .values({
          householdItemId: item.id,
          predecessorType: 'work_item',
          predecessorId: workItemId,
        })
        .run();

      // When: Deleting the item
      householdItemService.deleteHouseholdItem(db, item.id);

      // Then: Dependency records are deleted
      const depRows = db
        .select()
        .from(schema.householdItemDeps)
        .where(eq(schema.householdItemDeps.householdItemId, item.id))
        .all();
      expect(depRows).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // listHouseholdItems()
  // ---------------------------------------------------------------------------

  describe('listHouseholdItems()', () => {
    it('returns empty list when no items exist', () => {
      // Given: No items
      const query: Parameters<typeof householdItemService.listHouseholdItems>[1] = {};

      // When: Listing
      const result = householdItemService.listHouseholdItems(db, query);

      // Then: Returns empty paginated response
      expect(result.items).toHaveLength(0);
      expect(result.pagination.totalItems).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.pageSize).toBe(25);
    });

    it('returns paginated items with default page/pageSize', () => {
      // Given: A user and 3 items
      const userId = createTestUser('user@example.com', 'Test User');
      for (let i = 1; i <= 3; i++) {
        householdItemService.createHouseholdItem(db, userId, { name: `Item ${i}` });
      }

      // When: Listing with defaults
      const result = householdItemService.listHouseholdItems(db, {});

      // Then: Returns all 3 items
      expect(result.items).toHaveLength(3);
      expect(result.pagination.totalItems).toBe(3);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.pageSize).toBe(25);
    });

    it('paginates correctly with page and pageSize', () => {
      // Given: A user and 10 items
      const userId = createTestUser('user@example.com', 'Test User');
      for (let i = 1; i <= 10; i++) {
        householdItemService.createHouseholdItem(db, userId, { name: `Item ${i}` });
      }

      // When: Getting page 2 with pageSize 4
      const result = householdItemService.listHouseholdItems(db, { page: 2, pageSize: 4 });

      // Then: Correct pagination metadata
      expect(result.items).toHaveLength(4);
      expect(result.pagination.totalItems).toBe(10);
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.pageSize).toBe(4);
      expect(result.pagination.totalPages).toBe(3);
    });

    it('filters by category (exact match)', () => {
      // Given: Items with different categories
      const userId = createTestUser('user@example.com', 'Test User');
      householdItemService.createHouseholdItem(db, userId, {
        name: 'Sofa',
        category: 'hic-furniture',
      });
      householdItemService.createHouseholdItem(db, userId, {
        name: 'Dishwasher',
        category: 'hic-appliances',
      });
      householdItemService.createHouseholdItem(db, userId, {
        name: 'Chandelier',
        category: 'hic-fixtures',
      });

      // When: Filtering by category
      const result = householdItemService.listHouseholdItems(db, { category: 'hic-appliances' });

      // Then: Only appliances returned
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Dishwasher');
    });

    it('filters by status (exact match)', () => {
      // Given: Items with different statuses
      const userId = createTestUser('user@example.com', 'Test User');
      householdItemService.createHouseholdItem(db, userId, {
        name: 'Item A',
        status: 'planned',
      });
      householdItemService.createHouseholdItem(db, userId, {
        name: 'Item B',
        status: 'purchased',
      });
      householdItemService.createHouseholdItem(db, userId, {
        name: 'Item C',
        status: 'arrived',
      });

      // When: Filtering by status
      const result = householdItemService.listHouseholdItems(db, { status: 'purchased' });

      // Then: Only purchased items
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Item B');
    });

    it('filters by vendorId (exact match)', () => {
      // Given: Items with different vendors
      const userId = createTestUser('user@example.com', 'Test User');
      const vendor1 = createTestVendor('IKEA');
      const vendor2 = createTestVendor('Pottery Barn');
      householdItemService.createHouseholdItem(db, userId, {
        name: 'Billy Shelf',
        vendorId: vendor1,
      });
      householdItemService.createHouseholdItem(db, userId, {
        name: 'Linen Sofa',
        vendorId: vendor2,
      });
      householdItemService.createHouseholdItem(db, userId, { name: 'No Vendor' });

      // When: Filtering by vendor1
      const result = householdItemService.listHouseholdItems(db, { vendorId: vendor1 });

      // Then: Only vendor1's items
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Billy Shelf');
    });

    it('filters by areaId (exact match)', () => {
      // Given: Items with different areas are possible once areas exist; without an area, returns null
      const userId = createTestUser('user@example.com', 'Test User');
      householdItemService.createHouseholdItem(db, userId, { name: 'Bed' });
      householdItemService.createHouseholdItem(db, userId, { name: 'Couch' });

      // When: Filtering with null areaId (no area assigned)
      const result = householdItemService.listHouseholdItems(db, {});

      // Then: Items without area are returned
      expect(result.items).toHaveLength(2);
      result.items.forEach((item) => expect(item.area).toBeNull());
    });

    it('filters by areaId returns only items in that area', () => {
      // Given: A real area and items — some in the area, some not
      const userId = createTestUser('user@example.com', 'Test User');
      const areaId = insertTestArea('Master Bedroom');
      const area2Id = insertTestArea('Living Room');
      householdItemService.createHouseholdItem(db, userId, {
        name: 'King Bed',
        areaId,
      });
      householdItemService.createHouseholdItem(db, userId, {
        name: 'Sofa',
        areaId: area2Id,
      });
      householdItemService.createHouseholdItem(db, userId, { name: 'No Area Item' });

      // When: Filtering by area
      const result = householdItemService.listHouseholdItems(db, { areaId });

      // Then: Only items in that area are returned
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('King Bed');
      expect(result.items[0].area!.id).toBe(areaId);
    });

    it('areaId filter on a leaf area (no descendants) returns only exact-match items', () => {
      // Given: A leaf area with one household item and a sibling area with another
      const userId = createTestUser('leafhi@example.com', 'Leaf HI User');
      const leafAreaId = insertTestArea('Utility Room');
      const siblingAreaId = insertTestArea('Attic');
      householdItemService.createHouseholdItem(db, userId, {
        name: 'Washing Machine',
        areaId: leafAreaId,
      });
      householdItemService.createHouseholdItem(db, userId, {
        name: 'Storage Shelves',
        areaId: siblingAreaId,
      });

      // When: Filtering by the leaf area
      const result = householdItemService.listHouseholdItems(db, { areaId: leafAreaId });

      // Then: Only the item in the leaf area is returned
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Washing Machine');
      expect(result.items[0].area!.id).toBe(leafAreaId);
    });

    it('areaId filter on a parent area includes items from direct child areas', () => {
      // Given: Parent area P with child area C; one household item in each
      const userId = createTestUser('parenthi@example.com', 'Parent HI User');
      const parentAreaId = insertTestArea('Upper Floor');
      const childAreaId = insertTestArea('Upper Floor Bathroom', null, parentAreaId);
      householdItemService.createHouseholdItem(db, userId, {
        name: 'Landing Rug',
        areaId: parentAreaId,
      });
      householdItemService.createHouseholdItem(db, userId, {
        name: 'Bathtub',
        areaId: childAreaId,
      });

      // When: Filtering by the parent area
      const result = householdItemService.listHouseholdItems(db, { areaId: parentAreaId });

      // Then: Both items are returned (parent + child)
      expect(result.items).toHaveLength(2);
      const names = result.items.map((i) => i.name).sort();
      expect(names).toEqual(['Bathtub', 'Landing Rug']);
    });

    it('areaId filter on grandparent area includes items from all descendant levels', () => {
      // Given: Three-level hierarchy G → P → C, each with one household item
      const userId = createTestUser('gphi@example.com', 'Grandparent HI User');
      const grandparentId = insertTestArea('Building');
      const parentId = insertTestArea('Building Second Floor', null, grandparentId);
      const childId = insertTestArea('Building Second Floor Study', null, parentId);
      householdItemService.createHouseholdItem(db, userId, {
        name: 'Entrance Mirror',
        areaId: grandparentId,
      });
      householdItemService.createHouseholdItem(db, userId, {
        name: 'Hallway Console',
        areaId: parentId,
      });
      householdItemService.createHouseholdItem(db, userId, {
        name: 'Desk Chair',
        areaId: childId,
      });

      // When: Filtering by grandparent — should return all 3
      const allResult = householdItemService.listHouseholdItems(db, { areaId: grandparentId });
      expect(allResult.items).toHaveLength(3);

      // When: Filtering by parent — should return 2 (parent + child, not grandparent)
      const parentResult = householdItemService.listHouseholdItems(db, { areaId: parentId });
      expect(parentResult.items).toHaveLength(2);
      const parentNames = parentResult.items.map((i) => i.name).sort();
      expect(parentNames).toEqual(['Desk Chair', 'Hallway Console']);

      // When: Filtering by child — should return 1 (leaf only)
      const childResult = householdItemService.listHouseholdItems(db, { areaId: childId });
      expect(childResult.items).toHaveLength(1);
      expect(childResult.items[0].name).toBe('Desk Chair');
    });

    it('search q matches name (case-insensitive)', () => {
      // Given: Items with different names
      const userId = createTestUser('user@example.com', 'Test User');
      householdItemService.createHouseholdItem(db, userId, { name: 'Living Room Sofa' });
      householdItemService.createHouseholdItem(db, userId, { name: 'Bedroom Dresser' });
      householdItemService.createHouseholdItem(db, userId, { name: 'Kitchen Blender' });

      // When: Searching by name fragment
      const result = householdItemService.listHouseholdItems(db, { q: 'sofa' });

      // Then: Only matching items
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Living Room Sofa');
    });

    it('search q matches description (case-insensitive)', () => {
      // Given: Items with different descriptions
      const userId = createTestUser('user@example.com', 'Test User');
      householdItemService.createHouseholdItem(db, userId, {
        name: 'Item A',
        description: 'This is a leather recliner chair',
      });
      householdItemService.createHouseholdItem(db, userId, {
        name: 'Item B',
        description: 'Oak dining table',
      });

      // When: Searching by description fragment
      const result = householdItemService.listHouseholdItems(db, { q: 'LEATHER' });

      // Then: Only matching items
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Item A');
    });

    it('search q matches url (case-insensitive)', () => {
      // Given: Items with different URLs
      const userId = createTestUser('user@example.com', 'Test User');
      householdItemService.createHouseholdItem(db, userId, {
        name: 'Shelf',
        url: 'https://shop.example.com/home-office-shelf',
      });
      householdItemService.createHouseholdItem(db, userId, {
        name: 'Mirror',
        url: 'https://shop.example.com/bathroom-mirror',
      });

      // When: Searching by URL fragment (name match)
      const result = householdItemService.listHouseholdItems(db, { q: 'Shelf' });

      // Then: Only matching items
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Shelf');
    });

    it('sorts by name ascending', () => {
      // Given: Items with different names
      const userId = createTestUser('user@example.com', 'Test User');
      householdItemService.createHouseholdItem(db, userId, { name: 'Zebra Chair' });
      householdItemService.createHouseholdItem(db, userId, { name: 'Apple Lamp' });
      householdItemService.createHouseholdItem(db, userId, { name: 'Mango Table' });

      // When: Sorting by name asc
      const result = householdItemService.listHouseholdItems(db, {
        sortBy: 'name',
        sortOrder: 'asc',
      });

      // Then: Items are sorted alphabetically
      const names = result.items.map((i) => i.name);
      expect(names[0]).toBe('Apple Lamp');
      expect(names[1]).toBe('Mango Table');
      expect(names[2]).toBe('Zebra Chair');
    });

    it('sorts by category descending', () => {
      // Given: Items with different categories
      const userId = createTestUser('user@example.com', 'Test User');
      householdItemService.createHouseholdItem(db, userId, {
        name: 'Sofa',
        category: 'hic-furniture',
      });
      householdItemService.createHouseholdItem(db, userId, {
        name: 'Blender',
        category: 'hic-appliances',
      });

      // When: Sorting by category desc
      const result = householdItemService.listHouseholdItems(db, {
        sortBy: 'category',
        sortOrder: 'desc',
      });

      // Then: Sorted category desc (hic-furniture > hic-appliances alphabetically)
      const categories = result.items.map((i) => i.category);
      expect(categories[0]).toBe('hic-furniture');
      expect(categories[1]).toBe('hic-appliances');
    });

    it('includes budgetLineCount and totalPlannedAmount aggregation', () => {
      // Given: An item with budget lines
      const userId = createTestUser('user@example.com', 'Test User');
      const item = householdItemService.createHouseholdItem(db, userId, { name: 'TV Stand' });

      // Add two budget lines
      const now = new Date().toISOString();
      db.insert(schema.householdItemBudgets)
        .values({
          id: 'budget-1',
          householdItemId: item.id,
          plannedAmount: 150.0,
          confidence: 'own_estimate',
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      db.insert(schema.householdItemBudgets)
        .values({
          id: 'budget-2',
          householdItemId: item.id,
          plannedAmount: 75.5,
          confidence: 'quote',
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      // When: Listing items
      const result = householdItemService.listHouseholdItems(db, {});

      // Then: Aggregates are correct
      expect(result.items).toHaveLength(1);
      expect(result.items[0].budgetLineCount).toBe(2);
      expect(result.items[0].totalPlannedAmount).toBe(225.5);
    });

    it('combined category + status filter works correctly', () => {
      // Given: Items with various category/status combinations
      const userId = createTestUser('user@example.com', 'Test User');
      householdItemService.createHouseholdItem(db, userId, {
        name: 'Match',
        category: 'hic-appliances',
        status: 'arrived',
      });
      householdItemService.createHouseholdItem(db, userId, {
        name: 'Wrong Status',
        category: 'hic-appliances',
        status: 'purchased',
      });
      householdItemService.createHouseholdItem(db, userId, {
        name: 'Wrong Category',
        category: 'hic-furniture',
        status: 'arrived',
      });

      // When: Filtering by both category and status
      const result = householdItemService.listHouseholdItems(db, {
        category: 'hic-appliances',
        status: 'arrived',
      });

      // Then: Only the matching item is returned
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Match');
    });
  });

  // ---------------------------------------------------------------------------
  // toHouseholdItemSummary() — export sanity checks
  // ---------------------------------------------------------------------------

  describe('toHouseholdItemSummary()', () => {
    it('returns summary shape with area field', () => {
      // Given: An item without an area
      const userId = createTestUser('user@example.com', 'Test User');
      const _item = householdItemService.createHouseholdItem(db, userId, {
        name: 'Patio Table',
      });

      // When: Getting list (which returns summary)
      const result = householdItemService.listHouseholdItems(db, {});

      // Then: area in summary is null when unset
      expect(result.items[0].area).toBeNull();
    });

    it('returns summary with earliestDeliveryDate and latestDeliveryDate fields', () => {
      // Given: An item
      const userId = createTestUser('user@example.com', 'Test User');
      const _item = householdItemService.createHouseholdItem(db, userId, {
        name: 'Patio Table',
      });

      // When: Getting list (which returns summary)
      const result = householdItemService.listHouseholdItems(db, {});

      // Then: Summary includes delivery date fields
      expect(result.items[0]).toHaveProperty('earliestDeliveryDate');
      expect(result.items[0]).toHaveProperty('latestDeliveryDate');
      expect(result.items[0].earliestDeliveryDate).toBeNull();
      expect(result.items[0].latestDeliveryDate).toBeNull();
    });
  });
});
