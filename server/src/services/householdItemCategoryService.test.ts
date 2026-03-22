import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as householdItemCategoryService from './householdItemCategoryService.js';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  CategoryInUseError,
} from '../errors/AppError.js';
import type {
  CreateHouseholdItemCategoryRequest,
  UpdateHouseholdItemCategoryRequest,
} from '@cornerstone/shared';

/**
 * NOTE: After all migrations on a fresh DB, 7 default household item categories remain:
 * Furniture, Appliances, Fixtures, Decor, Electronics, Other, Equipment (added by 0028).
 * Migration 0028 removes Outdoor and Storage when unused on fresh DB.
 *
 * Tests use distinct names (e.g., "Test HIC *") to avoid UNIQUE constraint violations.
 */

describe('Household Item Category Service', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  /** Number of HI categories after all migrations on a fresh DB (0028 removes 2 unused defaults) */
  const SEEDED_CATEGORY_COUNT = 7;

  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  let timestampOffset = 0;

  /**
   * Helper: Insert a test household item category directly into the DB.
   * Uses distinct names to avoid conflicts with seeded categories.
   */
  function createTestCategory(
    name: string,
    options: {
      color?: string | null;
      sortOrder?: number;
    } = {},
  ) {
    const id = `hic-test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const timestamp = new Date(Date.now() + timestampOffset).toISOString();
    timestampOffset += 1;

    db.insert(schema.householdItemCategories)
      .values({
        id,
        name,
        color: options.color ?? null,
        sortOrder: options.sortOrder ?? 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    return { id, name, ...options, createdAt: timestamp, updatedAt: timestamp };
  }

  /**
   * Helper: Create a household item that references the given category.
   * Makes categoryId "in use" so delete is blocked.
   */
  function createHouseholdItemReferencing(categoryId: string) {
    const itemId = `hi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();

    // We need to insert a minimal household item. The categoryId FK references householdItemCategories.
    db.insert(schema.householdItems)
      .values({
        id: itemId,
        name: `Test Item ${itemId}`,
        categoryId,
        status: 'planned',
        quantity: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return itemId;
  }

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    timestampOffset = 0;
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── listHouseholdItemCategories() ────────────────────────────────────────

  describe('listHouseholdItemCategories()', () => {
    it('returns the 7 seeded default categories after migration', () => {
      const result = householdItemCategoryService.listHouseholdItemCategories(db);
      expect(result).toHaveLength(SEEDED_CATEGORY_COUNT);
    });

    it('returns categories sorted by sortOrder ascending', () => {
      createTestCategory('Test HIC Alpha', { sortOrder: 100 });
      createTestCategory('Test HIC Gamma', { sortOrder: 102 });
      createTestCategory('Test HIC Beta', { sortOrder: 101 });

      const result = householdItemCategoryService.listHouseholdItemCategories(db);
      const testCats = result.filter((c) => c.name.startsWith('Test HIC'));
      expect(testCats).toHaveLength(3);
      expect(testCats[0].name).toBe('Test HIC Alpha');
      expect(testCats[1].name).toBe('Test HIC Beta');
      expect(testCats[2].name).toBe('Test HIC Gamma');
    });

    it('includes newly created categories in the result', () => {
      const countBefore = householdItemCategoryService.listHouseholdItemCategories(db).length;
      createTestCategory('Test HIC Custom');
      const result = householdItemCategoryService.listHouseholdItemCategories(db);
      expect(result).toHaveLength(countBefore + 1);
    });

    it('returns all category properties', () => {
      const cat = createTestCategory('Test HIC Full', { color: '#FF5733', sortOrder: 99 });
      const result = householdItemCategoryService.listHouseholdItemCategories(db);
      const found = result.find((c) => c.id === cat.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe('Test HIC Full');
      expect(found!.color).toBe('#FF5733');
      expect(found!.sortOrder).toBe(99);
      expect(found!.createdAt).toBeDefined();
      expect(found!.updatedAt).toBeDefined();
    });

    it('returns category with null color', () => {
      const cat = createTestCategory('Test HIC NoColor', { color: null });
      const result = householdItemCategoryService.listHouseholdItemCategories(db);
      const found = result.find((c) => c.id === cat.id);
      expect(found).toBeDefined();
      expect(found!.color).toBeNull();
    });
  });

  // ─── getHouseholdItemCategoryById() ───────────────────────────────────────

  describe('getHouseholdItemCategoryById()', () => {
    it('returns a seeded category by ID', () => {
      const result = householdItemCategoryService.getHouseholdItemCategoryById(db, 'hic-furniture');
      expect(result.id).toBe('hic-furniture');
      expect(result.name).toBe('Furniture');
    });

    it('returns a newly created category by ID', () => {
      const cat = createTestCategory('Test HIC Electronics', { color: '#FF5733', sortOrder: 1 });
      const result = householdItemCategoryService.getHouseholdItemCategoryById(db, cat.id);
      expect(result.id).toBe(cat.id);
      expect(result.name).toBe('Test HIC Electronics');
      expect(result.color).toBe('#FF5733');
      expect(result.sortOrder).toBe(1);
    });

    it('throws NotFoundError when category does not exist', () => {
      expect(() => {
        householdItemCategoryService.getHouseholdItemCategoryById(db, 'non-existent-id');
      }).toThrow(NotFoundError);
      expect(() => {
        householdItemCategoryService.getHouseholdItemCategoryById(db, 'non-existent-id');
      }).toThrow('Household item category not found');
    });

    it('returns category with null color', () => {
      const cat = createTestCategory('Test HIC NullColor', { color: null });
      const result = householdItemCategoryService.getHouseholdItemCategoryById(db, cat.id);
      expect(result.color).toBeNull();
    });
  });

  // ─── createHouseholdItemCategory() ────────────────────────────────────────

  describe('createHouseholdItemCategory()', () => {
    it('creates a category with name only', () => {
      const data: CreateHouseholdItemCategoryRequest = { name: 'Test HIC Shelving' };
      const result = householdItemCategoryService.createHouseholdItemCategory(db, data);
      expect(result.id).toBeDefined();
      expect(result.name).toBe('Test HIC Shelving');
      expect(result.color).toBeNull();
      expect(result.sortOrder).toBe(0);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('creates a category with all fields', () => {
      const data: CreateHouseholdItemCategoryRequest = {
        name: 'Test HIC Rugs',
        color: '#3B82F6',
        sortOrder: 5,
      };
      const result = householdItemCategoryService.createHouseholdItemCategory(db, data);
      expect(result.name).toBe('Test HIC Rugs');
      expect(result.color).toBe('#3B82F6');
      expect(result.sortOrder).toBe(5);
    });

    it('trims leading and trailing whitespace from name', () => {
      const data: CreateHouseholdItemCategoryRequest = { name: '  Test HIC Lamps  ' };
      const result = householdItemCategoryService.createHouseholdItemCategory(db, data);
      expect(result.name).toBe('Test HIC Lamps');
    });

    it('creates category with sortOrder of 0 (default)', () => {
      const data: CreateHouseholdItemCategoryRequest = { name: 'Test HIC Mirrors', sortOrder: 0 };
      const result = householdItemCategoryService.createHouseholdItemCategory(db, data);
      expect(result.sortOrder).toBe(0);
    });

    it('stores category in the database (persists)', () => {
      const data: CreateHouseholdItemCategoryRequest = { name: 'Test HIC Curtains' };
      const created = householdItemCategoryService.createHouseholdItemCategory(db, data);
      const fetched = householdItemCategoryService.getHouseholdItemCategoryById(db, created.id);
      expect(fetched.id).toBe(created.id);
      expect(fetched.name).toBe('Test HIC Curtains');
    });

    it('accepts uppercase hex color', () => {
      const data: CreateHouseholdItemCategoryRequest = {
        name: 'Test HIC Beds',
        color: '#FF5733',
      };
      const result = householdItemCategoryService.createHouseholdItemCategory(db, data);
      expect(result.color).toBe('#FF5733');
    });

    it('accepts lowercase hex color', () => {
      const data: CreateHouseholdItemCategoryRequest = {
        name: 'Test HIC Sofas',
        color: '#ff5733',
      };
      const result = householdItemCategoryService.createHouseholdItemCategory(db, data);
      expect(result.color).toBe('#ff5733');
    });

    it('accepts null color without validation error', () => {
      const data: CreateHouseholdItemCategoryRequest = { name: 'Test HIC Tables', color: null };
      const result = householdItemCategoryService.createHouseholdItemCategory(db, data);
      expect(result.color).toBeNull();
    });

    it('throws ValidationError for empty name', () => {
      const data: CreateHouseholdItemCategoryRequest = { name: '' };
      expect(() => {
        householdItemCategoryService.createHouseholdItemCategory(db, data);
      }).toThrow(ValidationError);
      expect(() => {
        householdItemCategoryService.createHouseholdItemCategory(db, data);
      }).toThrow('Category name must be between 1 and 100 characters');
    });

    it('throws ValidationError for whitespace-only name', () => {
      const data: CreateHouseholdItemCategoryRequest = { name: '   ' };
      expect(() => {
        householdItemCategoryService.createHouseholdItemCategory(db, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for name exceeding 100 characters', () => {
      const data: CreateHouseholdItemCategoryRequest = { name: 'a'.repeat(101) };
      expect(() => {
        householdItemCategoryService.createHouseholdItemCategory(db, data);
      }).toThrow(ValidationError);
      expect(() => {
        householdItemCategoryService.createHouseholdItemCategory(db, data);
      }).toThrow('Category name must be between 1 and 100 characters');
    });

    it('accepts name with exactly 100 characters', () => {
      const name = 'X'.repeat(100);
      const data: CreateHouseholdItemCategoryRequest = { name };
      const result = householdItemCategoryService.createHouseholdItemCategory(db, data);
      expect(result.name).toBe(name);
    });

    it('throws ValidationError for invalid hex color (no hash)', () => {
      const data: CreateHouseholdItemCategoryRequest = {
        name: 'Test HIC Blinds',
        color: 'FF5733',
      };
      expect(() => {
        householdItemCategoryService.createHouseholdItemCategory(db, data);
      }).toThrow(ValidationError);
      expect(() => {
        householdItemCategoryService.createHouseholdItemCategory(db, data);
      }).toThrow('Color must be a hex color code in format #RRGGBB');
    });

    it('throws ValidationError for invalid hex color (color word)', () => {
      const data: CreateHouseholdItemCategoryRequest = { name: 'Test HIC Pillows', color: 'blue' };
      expect(() => {
        householdItemCategoryService.createHouseholdItemCategory(db, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for 3-digit hex color', () => {
      const data: CreateHouseholdItemCategoryRequest = { name: 'Test HIC Throws', color: '#FFF' };
      expect(() => {
        householdItemCategoryService.createHouseholdItemCategory(db, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for negative sortOrder', () => {
      const data: CreateHouseholdItemCategoryRequest = {
        name: 'Test HIC Clocks',
        sortOrder: -1,
      };
      expect(() => {
        householdItemCategoryService.createHouseholdItemCategory(db, data);
      }).toThrow(ValidationError);
      expect(() => {
        householdItemCategoryService.createHouseholdItemCategory(db, data);
      }).toThrow('Sort order must be a non-negative integer');
    });

    it('throws ConflictError for duplicate name (exact match with seeded category)', () => {
      // 'Furniture' is a seeded category
      const data: CreateHouseholdItemCategoryRequest = { name: 'Furniture' };
      expect(() => {
        householdItemCategoryService.createHouseholdItemCategory(db, data);
      }).toThrow(ConflictError);
      expect(() => {
        householdItemCategoryService.createHouseholdItemCategory(db, data);
      }).toThrow('A household item category with this name already exists');
    });

    it('throws ConflictError for duplicate name (case-insensitive match with seeded)', () => {
      const data: CreateHouseholdItemCategoryRequest = { name: 'FURNITURE' };
      expect(() => {
        householdItemCategoryService.createHouseholdItemCategory(db, data);
      }).toThrow(ConflictError);
    });

    it('throws ConflictError for duplicate name after trimming', () => {
      const data: CreateHouseholdItemCategoryRequest = { name: '  FURNITURE  ' };
      expect(() => {
        householdItemCategoryService.createHouseholdItemCategory(db, data);
      }).toThrow(ConflictError);
    });

    it('throws ConflictError for duplicate name with a newly created category', () => {
      createTestCategory('Test HIC Terrace');
      const data: CreateHouseholdItemCategoryRequest = { name: 'Test HIC Terrace' };
      expect(() => {
        householdItemCategoryService.createHouseholdItemCategory(db, data);
      }).toThrow(ConflictError);
    });
  });

  // ─── updateHouseholdItemCategory() ────────────────────────────────────────

  describe('updateHouseholdItemCategory()', () => {
    it('updates the name of an existing category', () => {
      const cat = createTestCategory('Test HIC Old Name');
      const data: UpdateHouseholdItemCategoryRequest = { name: 'Test HIC New Name' };
      const result = householdItemCategoryService.updateHouseholdItemCategory(db, cat.id, data);
      expect(result.id).toBe(cat.id);
      expect(result.name).toBe('Test HIC New Name');
    });

    it('updates only color (partial update)', () => {
      const cat = createTestCategory('Test HIC Desk', { color: '#FF0000' });
      const data: UpdateHouseholdItemCategoryRequest = { color: '#00FF00' };
      const result = householdItemCategoryService.updateHouseholdItemCategory(db, cat.id, data);
      expect(result.name).toBe('Test HIC Desk');
      expect(result.color).toBe('#00FF00');
    });

    it('removes color by setting to null', () => {
      const cat = createTestCategory('Test HIC Chair', { color: '#FF0000' });
      const data: UpdateHouseholdItemCategoryRequest = { color: null };
      const result = householdItemCategoryService.updateHouseholdItemCategory(db, cat.id, data);
      expect(result.color).toBeNull();
    });

    it('updates only sortOrder (partial update)', () => {
      const cat = createTestCategory('Test HIC Bookshelf', { sortOrder: 1 });
      const data: UpdateHouseholdItemCategoryRequest = { sortOrder: 10 };
      const result = householdItemCategoryService.updateHouseholdItemCategory(db, cat.id, data);
      expect(result.sortOrder).toBe(10);
      expect(result.name).toBe('Test HIC Bookshelf');
    });

    it('updates all fields at once', () => {
      const cat = createTestCategory('Test HIC Ottoman', { color: '#000000', sortOrder: 1 });
      const data: UpdateHouseholdItemCategoryRequest = {
        name: 'Test HIC Footstool',
        color: '#FFFFFF',
        sortOrder: 99,
      };
      const result = householdItemCategoryService.updateHouseholdItemCategory(db, cat.id, data);
      expect(result.name).toBe('Test HIC Footstool');
      expect(result.color).toBe('#FFFFFF');
      expect(result.sortOrder).toBe(99);
    });

    it('trims name before updating', () => {
      const cat = createTestCategory('Test HIC Stool');
      const data: UpdateHouseholdItemCategoryRequest = { name: '  Test HIC Bar Stool  ' };
      const result = householdItemCategoryService.updateHouseholdItemCategory(db, cat.id, data);
      expect(result.name).toBe('Test HIC Bar Stool');
    });

    it('allows updating name to the same value (no conflict)', () => {
      const cat = createTestCategory('Test HIC Armchair');
      const data: UpdateHouseholdItemCategoryRequest = { name: 'Test HIC Armchair' };
      const result = householdItemCategoryService.updateHouseholdItemCategory(db, cat.id, data);
      expect(result.name).toBe('Test HIC Armchair');
    });

    it('sets updatedAt to a new timestamp on update', async () => {
      const cat = createTestCategory('Test HIC Loveseat');
      await new Promise((resolve) => setTimeout(resolve, 1));
      const data: UpdateHouseholdItemCategoryRequest = { name: 'Test HIC Settee' };
      const result = householdItemCategoryService.updateHouseholdItemCategory(db, cat.id, data);
      expect(result.updatedAt).not.toBe(cat.updatedAt);
    });

    it('can update a seeded category', () => {
      const data: UpdateHouseholdItemCategoryRequest = { sortOrder: 50 };
      const result = householdItemCategoryService.updateHouseholdItemCategory(
        db,
        'hic-furniture',
        data,
      );
      expect(result.id).toBe('hic-furniture');
      expect(result.name).toBe('Furniture');
      expect(result.sortOrder).toBe(50);
    });

    it('throws NotFoundError when category does not exist', () => {
      const data: UpdateHouseholdItemCategoryRequest = { name: 'Test' };
      expect(() => {
        householdItemCategoryService.updateHouseholdItemCategory(db, 'non-existent-id', data);
      }).toThrow(NotFoundError);
      expect(() => {
        householdItemCategoryService.updateHouseholdItemCategory(db, 'non-existent-id', data);
      }).toThrow('Household item category not found');
    });

    it('throws ValidationError when no fields are provided', () => {
      const cat = createTestCategory('Test HIC Lamp');
      const data: UpdateHouseholdItemCategoryRequest = {};
      expect(() => {
        householdItemCategoryService.updateHouseholdItemCategory(db, cat.id, data);
      }).toThrow(ValidationError);
      expect(() => {
        householdItemCategoryService.updateHouseholdItemCategory(db, cat.id, data);
      }).toThrow('At least one field must be provided');
    });

    it('throws ValidationError for empty name', () => {
      const cat = createTestCategory('Test HIC Clock');
      const data: UpdateHouseholdItemCategoryRequest = { name: '' };
      expect(() => {
        householdItemCategoryService.updateHouseholdItemCategory(db, cat.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for whitespace-only name', () => {
      const cat = createTestCategory('Test HIC Vase');
      const data: UpdateHouseholdItemCategoryRequest = { name: '   ' };
      expect(() => {
        householdItemCategoryService.updateHouseholdItemCategory(db, cat.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for name exceeding 100 characters', () => {
      const cat = createTestCategory('Test HIC Rug');
      const data: UpdateHouseholdItemCategoryRequest = { name: 'a'.repeat(101) };
      expect(() => {
        householdItemCategoryService.updateHouseholdItemCategory(db, cat.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for invalid hex color format', () => {
      const cat = createTestCategory('Test HIC Plant');
      const data: UpdateHouseholdItemCategoryRequest = { color: 'not-a-color' };
      expect(() => {
        householdItemCategoryService.updateHouseholdItemCategory(db, cat.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for negative sortOrder', () => {
      const cat = createTestCategory('Test HIC Mat');
      const data: UpdateHouseholdItemCategoryRequest = { sortOrder: -5 };
      expect(() => {
        householdItemCategoryService.updateHouseholdItemCategory(db, cat.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ConflictError when new name conflicts with another category', () => {
      const cat = createTestCategory('Test HIC Stand');
      // Try to rename to a seeded category name
      const data: UpdateHouseholdItemCategoryRequest = { name: 'Appliances' };
      expect(() => {
        householdItemCategoryService.updateHouseholdItemCategory(db, cat.id, data);
      }).toThrow(ConflictError);
      expect(() => {
        householdItemCategoryService.updateHouseholdItemCategory(db, cat.id, data);
      }).toThrow('A household item category with this name already exists');
    });

    it('throws ConflictError for case-insensitive name conflict with another category', () => {
      const cat = createTestCategory('Test HIC Cabinet');
      const data: UpdateHouseholdItemCategoryRequest = { name: 'APPLIANCES' };
      expect(() => {
        householdItemCategoryService.updateHouseholdItemCategory(db, cat.id, data);
      }).toThrow(ConflictError);
    });
  });

  // ─── deleteHouseholdItemCategory() ────────────────────────────────────────

  describe('deleteHouseholdItemCategory()', () => {
    it('deletes a custom category successfully', () => {
      const cat = createTestCategory('Test HIC Hammock');
      householdItemCategoryService.deleteHouseholdItemCategory(db, cat.id);
      expect(() => {
        householdItemCategoryService.getHouseholdItemCategoryById(db, cat.id);
      }).toThrow(NotFoundError);
    });

    it('removes category from the list after deletion', () => {
      const cat1 = createTestCategory('Test HIC Pouffe');
      createTestCategory('Test HIC Daybed');
      const countBefore = householdItemCategoryService.listHouseholdItemCategories(db).length;
      householdItemCategoryService.deleteHouseholdItemCategory(db, cat1.id);
      const result = householdItemCategoryService.listHouseholdItemCategories(db);
      expect(result).toHaveLength(countBefore - 1);
      const found = result.find((c) => c.id === cat1.id);
      expect(found).toBeUndefined();
    });

    it('throws NotFoundError when category does not exist', () => {
      expect(() => {
        householdItemCategoryService.deleteHouseholdItemCategory(db, 'non-existent-id');
      }).toThrow(NotFoundError);
      expect(() => {
        householdItemCategoryService.deleteHouseholdItemCategory(db, 'non-existent-id');
      }).toThrow('Household item category not found');
    });

    it('throws CategoryInUseError when category is referenced by a household item', () => {
      const cat = createTestCategory('Test HIC Wardrobe');
      createHouseholdItemReferencing(cat.id);
      expect(() => {
        householdItemCategoryService.deleteHouseholdItemCategory(db, cat.id);
      }).toThrow(CategoryInUseError);
      expect(() => {
        householdItemCategoryService.deleteHouseholdItemCategory(db, cat.id);
      }).toThrow('Household item category is in use and cannot be deleted');
    });

    it('includes householdItemCount in CategoryInUseError details', () => {
      const cat = createTestCategory('Test HIC Sideboard');
      createHouseholdItemReferencing(cat.id);
      createHouseholdItemReferencing(cat.id);

      let thrownError: CategoryInUseError | null = null;
      try {
        householdItemCategoryService.deleteHouseholdItemCategory(db, cat.id);
      } catch (err) {
        if (err instanceof CategoryInUseError) {
          thrownError = err;
        }
      }
      expect(thrownError).not.toBeNull();
      expect(thrownError?.details?.householdItemCount).toBe(2);
    });

    it('CategoryInUseError has code CATEGORY_IN_USE and statusCode 409', () => {
      const cat = createTestCategory('Test HIC Console');
      createHouseholdItemReferencing(cat.id);

      let thrownError: CategoryInUseError | null = null;
      try {
        householdItemCategoryService.deleteHouseholdItemCategory(db, cat.id);
      } catch (err) {
        if (err instanceof CategoryInUseError) {
          thrownError = err;
        }
      }
      expect(thrownError?.code).toBe('CATEGORY_IN_USE');
      expect(thrownError?.statusCode).toBe(409);
    });

    it('can delete a seeded category that is not referenced by any household item', () => {
      // hic-other is seeded but has no items in a fresh test DB
      householdItemCategoryService.deleteHouseholdItemCategory(db, 'hic-other');
      expect(() => {
        householdItemCategoryService.getHouseholdItemCategoryById(db, 'hic-other');
      }).toThrow(NotFoundError);
    });

    it('successfully deletes a category not referenced by any household items', () => {
      const cat1 = createTestCategory('Test HIC Bookcase');
      const cat2 = createTestCategory('Test HIC Display');
      // Reference cat2, but not cat1
      createHouseholdItemReferencing(cat2.id);
      // cat1 should be deletable
      householdItemCategoryService.deleteHouseholdItemCategory(db, cat1.id);
      expect(() => {
        householdItemCategoryService.getHouseholdItemCategoryById(db, cat1.id);
      }).toThrow(NotFoundError);
    });
  });

  // ─── translationKey field ──────────────────────────────────────────────────

  describe('translationKey field', () => {
    it('listHouseholdItemCategories() returns translationKey for predefined seeded categories', () => {
      // hic-furniture is seeded and given 'householdItemCategories.furniture' by migration 0030
      const result = householdItemCategoryService.listHouseholdItemCategories(db);
      const furniture = result.find((c) => c.id === 'hic-furniture');
      expect(furniture).toBeDefined();
      expect(furniture!.translationKey).toBe('householdItemCategories.furniture');
    });

    it('listHouseholdItemCategories() returns null translationKey for user-created categories', () => {
      createTestCategory('Test HIC Custom Artwork');

      const result = householdItemCategoryService.listHouseholdItemCategories(db);
      const found = result.find((c) => c.name === 'Test HIC Custom Artwork');
      expect(found).toBeDefined();
      expect(found!.translationKey).toBeNull();
    });

    it('listHouseholdItemCategories() returns correct translationKeys for all 7 seeded categories', () => {
      const expectedKeys: Record<string, string> = {
        'hic-furniture': 'householdItemCategories.furniture',
        'hic-appliances': 'householdItemCategories.appliances',
        'hic-fixtures': 'householdItemCategories.fixtures',
        'hic-decor': 'householdItemCategories.decor',
        'hic-electronics': 'householdItemCategories.electronics',
        'hic-equipment': 'householdItemCategories.equipment',
        'hic-other': 'householdItemCategories.other',
      };

      const result = householdItemCategoryService.listHouseholdItemCategories(db);

      for (const [id, key] of Object.entries(expectedKeys)) {
        const cat = result.find((c) => c.id === id);
        expect(cat).toBeDefined();
        expect(cat!.translationKey).toBe(key);
      }
    });

    it('getHouseholdItemCategoryById() returns translationKey for a predefined category', () => {
      const result = householdItemCategoryService.getHouseholdItemCategoryById(
        db,
        'hic-appliances',
      );
      expect(result.translationKey).toBe('householdItemCategories.appliances');
    });

    it('getHouseholdItemCategoryById() returns null translationKey for user-created category', () => {
      const cat = createTestCategory('Test HIC Planters');
      const result = householdItemCategoryService.getHouseholdItemCategoryById(db, cat.id);
      expect(result.translationKey).toBeNull();
    });

    it('createHouseholdItemCategory() always sets translationKey to null on new rows', () => {
      const result = householdItemCategoryService.createHouseholdItemCategory(db, {
        name: 'Test HIC Custom Mats',
      });
      expect(result.translationKey).toBeNull();
    });
  });
});
