import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as budgetCategoryService from './budgetCategoryService.js';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  CategoryInUseError,
} from '../errors/AppError.js';
import type { CreateBudgetCategoryRequest, UpdateBudgetCategoryRequest } from '@cornerstone/shared';

/**
 * NOTE: The migration seeds 10 default budget categories:
 * Materials, Labor, Permits, Design, Equipment, Landscaping,
 * Utilities, Insurance, Contingency, Other.
 *
 * Tests use distinct names to avoid UNIQUE constraint violations.
 * Test-specific names use a prefix like "Test Cat" or "Custom Cat"
 * to avoid collisions with the seeded defaults.
 */

describe('Budget Category Service', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  /** Number of categories seeded by migration */
  const SEEDED_CATEGORY_COUNT = 10;

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

  let categoryTimestampOffset = 0;

  /**
   * Helper: Create a test budget category directly in the database.
   * Uses unique names to avoid conflicts with migration-seeded categories.
   */
  function createTestCategory(
    name: string,
    options: {
      description?: string | null;
      color?: string | null;
      sortOrder?: number;
    } = {},
  ) {
    const id = `cat-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const timestamp = new Date(Date.now() + categoryTimestampOffset).toISOString();
    categoryTimestampOffset += 1;

    db.insert(schema.budgetCategories)
      .values({
        id,
        name,
        description: options.description ?? null,
        color: options.color ?? null,
        sortOrder: options.sortOrder ?? 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    return { id, name, ...options, createdAt: timestamp, updatedAt: timestamp };
  }

  /**
   * Helper: Create a subsidy program that references a budget category.
   */
  function createSubsidyProgramReferencing(categoryId: string) {
    const programId = `prog-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();

    db.insert(schema.subsidyPrograms)
      .values({
        id: programId,
        name: `Program ${programId}`, // Unique name
        reductionType: 'percentage',
        reductionValue: 10,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    db.insert(schema.subsidyProgramCategories)
      .values({
        subsidyProgramId: programId,
        budgetCategoryId: categoryId,
      })
      .run();

    return programId;
  }

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    categoryTimestampOffset = 0;
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── listBudgetCategories() ────────────────────────────────────────────────

  describe('listBudgetCategories()', () => {
    it('returns the 10 seeded default categories after migration', () => {
      // Migration seeds 10 default categories
      const result = budgetCategoryService.listBudgetCategories(db);
      expect(result).toHaveLength(SEEDED_CATEGORY_COUNT);
    });

    it('returns categories sorted by sortOrder ascending', () => {
      // The seeded categories are already sorted 0-9.
      // Add custom ones with specific sort orders to verify ordering.
      createTestCategory('Test Cat Alpha', { sortOrder: 100 });
      createTestCategory('Test Cat Gamma', { sortOrder: 102 });
      createTestCategory('Test Cat Beta', { sortOrder: 101 });

      const result = budgetCategoryService.listBudgetCategories(db);

      // Find our test categories in the sorted list
      const testCats = result.filter((c) => c.name.startsWith('Test Cat'));
      expect(testCats).toHaveLength(3);
      expect(testCats[0].name).toBe('Test Cat Alpha');
      expect(testCats[1].name).toBe('Test Cat Beta');
      expect(testCats[2].name).toBe('Test Cat Gamma');
    });

    it('includes newly created categories in the result', () => {
      const countBefore = budgetCategoryService.listBudgetCategories(db).length;

      createTestCategory('Custom Insulation');

      const result = budgetCategoryService.listBudgetCategories(db);
      expect(result).toHaveLength(countBefore + 1);
    });

    it('returns all category properties', () => {
      const cat = createTestCategory('Custom Roofing', {
        description: 'Roof and waterproofing costs',
        color: '#FF5733',
        sortOrder: 99,
      });

      const result = budgetCategoryService.listBudgetCategories(db);

      const found = result.find((c) => c.id === cat.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe('Custom Roofing');
      expect(found!.description).toBe('Roof and waterproofing costs');
      expect(found!.color).toBe('#FF5733');
      expect(found!.sortOrder).toBe(99);
      expect(found!.createdAt).toBeDefined();
      expect(found!.updatedAt).toBeDefined();
    });

    it('returns category with null description and null color', () => {
      const cat = createTestCategory('Custom Plumbing', { description: null, color: null });

      const result = budgetCategoryService.listBudgetCategories(db);

      const found = result.find((c) => c.id === cat.id);
      expect(found).toBeDefined();
      expect(found!.description).toBeNull();
      expect(found!.color).toBeNull();
    });
  });

  // ─── getBudgetCategoryById() ───────────────────────────────────────────────

  describe('getBudgetCategoryById()', () => {
    it('returns a seeded category by ID', () => {
      // 'Materials' is seeded with id 'bc-materials'
      const result = budgetCategoryService.getBudgetCategoryById(db, 'bc-materials');

      expect(result.id).toBe('bc-materials');
      expect(result.name).toBe('Materials');
    });

    it('returns a newly created category by ID', () => {
      const cat = createTestCategory('Custom Electrical', { color: '#FF5733', sortOrder: 1 });

      const result = budgetCategoryService.getBudgetCategoryById(db, cat.id);

      expect(result.id).toBe(cat.id);
      expect(result.name).toBe('Custom Electrical');
      expect(result.color).toBe('#FF5733');
      expect(result.sortOrder).toBe(1);
    });

    it('throws NotFoundError when category does not exist', () => {
      expect(() => {
        budgetCategoryService.getBudgetCategoryById(db, 'non-existent-id');
      }).toThrow(NotFoundError);

      expect(() => {
        budgetCategoryService.getBudgetCategoryById(db, 'non-existent-id');
      }).toThrow('Budget category not found');
    });

    it('returns category with null description and color', () => {
      const cat = createTestCategory('Custom Windows', { description: null, color: null });

      const result = budgetCategoryService.getBudgetCategoryById(db, cat.id);

      expect(result.description).toBeNull();
      expect(result.color).toBeNull();
    });
  });

  // ─── createBudgetCategory() ────────────────────────────────────────────────

  describe('createBudgetCategory()', () => {
    it('creates a category with name only', () => {
      const data: CreateBudgetCategoryRequest = { name: 'Custom Masonry' };

      const result = budgetCategoryService.createBudgetCategory(db, data);

      expect(result.id).toBeDefined();
      expect(result.name).toBe('Custom Masonry');
      expect(result.description).toBeNull();
      expect(result.color).toBeNull();
      expect(result.sortOrder).toBe(0);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('creates a category with all fields', () => {
      const data: CreateBudgetCategoryRequest = {
        name: 'Custom Foundation',
        description: 'Foundation and concrete costs',
        color: '#3B82F6',
        sortOrder: 5,
      };

      const result = budgetCategoryService.createBudgetCategory(db, data);

      expect(result.name).toBe('Custom Foundation');
      expect(result.description).toBe('Foundation and concrete costs');
      expect(result.color).toBe('#3B82F6');
      expect(result.sortOrder).toBe(5);
    });

    it('trims leading and trailing whitespace from name', () => {
      const data: CreateBudgetCategoryRequest = { name: '  Custom Tiling  ' };

      const result = budgetCategoryService.createBudgetCategory(db, data);

      expect(result.name).toBe('Custom Tiling');
    });

    it('creates category with sortOrder of 0 (default)', () => {
      const data: CreateBudgetCategoryRequest = { name: 'Custom HVAC', sortOrder: 0 };

      const result = budgetCategoryService.createBudgetCategory(db, data);

      expect(result.sortOrder).toBe(0);
    });

    it('stores category in the database (persists)', () => {
      const data: CreateBudgetCategoryRequest = { name: 'Custom Siding' };
      const created = budgetCategoryService.createBudgetCategory(db, data);

      const fetched = budgetCategoryService.getBudgetCategoryById(db, created.id);
      expect(fetched.id).toBe(created.id);
      expect(fetched.name).toBe('Custom Siding');
    });

    it('accepts uppercase hex color', () => {
      const data: CreateBudgetCategoryRequest = { name: 'Custom Painting', color: '#FF5733' };

      const result = budgetCategoryService.createBudgetCategory(db, data);

      expect(result.color).toBe('#FF5733');
    });

    it('accepts lowercase hex color', () => {
      const data: CreateBudgetCategoryRequest = { name: 'Custom Flooring', color: '#ff5733' };

      const result = budgetCategoryService.createBudgetCategory(db, data);

      expect(result.color).toBe('#ff5733');
    });

    it('accepts mixed-case hex color', () => {
      const data: CreateBudgetCategoryRequest = { name: 'Custom Drywall', color: '#Ff5733' };

      const result = budgetCategoryService.createBudgetCategory(db, data);

      expect(result.color).toBe('#Ff5733');
    });

    it('throws ValidationError for empty name', () => {
      const data: CreateBudgetCategoryRequest = { name: '' };

      expect(() => {
        budgetCategoryService.createBudgetCategory(db, data);
      }).toThrow(ValidationError);
      expect(() => {
        budgetCategoryService.createBudgetCategory(db, data);
      }).toThrow('Budget category name must be between 1 and 100 characters');
    });

    it('throws ValidationError for whitespace-only name', () => {
      const data: CreateBudgetCategoryRequest = { name: '   ' };

      expect(() => {
        budgetCategoryService.createBudgetCategory(db, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for name exceeding 100 characters', () => {
      const data: CreateBudgetCategoryRequest = { name: 'a'.repeat(101) };

      expect(() => {
        budgetCategoryService.createBudgetCategory(db, data);
      }).toThrow(ValidationError);
      expect(() => {
        budgetCategoryService.createBudgetCategory(db, data);
      }).toThrow('Budget category name must be between 1 and 100 characters');
    });

    it('accepts name with exactly 100 characters', () => {
      const name = 'X'.repeat(100);
      const data: CreateBudgetCategoryRequest = { name };

      const result = budgetCategoryService.createBudgetCategory(db, data);

      expect(result.name).toBe(name);
    });

    it('throws ValidationError for description exceeding 500 characters', () => {
      const data: CreateBudgetCategoryRequest = {
        name: 'Custom Staging',
        description: 'a'.repeat(501),
      };

      expect(() => {
        budgetCategoryService.createBudgetCategory(db, data);
      }).toThrow(ValidationError);
      expect(() => {
        budgetCategoryService.createBudgetCategory(db, data);
      }).toThrow('Budget category description must be at most 500 characters');
    });

    it('accepts description with exactly 500 characters', () => {
      const data: CreateBudgetCategoryRequest = {
        name: 'Custom Staging',
        description: 'a'.repeat(500),
      };

      const result = budgetCategoryService.createBudgetCategory(db, data);

      expect(result.description).toHaveLength(500);
    });

    it('throws ValidationError for invalid hex color (no hash)', () => {
      const data: CreateBudgetCategoryRequest = { name: 'Custom Glazing', color: 'FF5733' };

      expect(() => {
        budgetCategoryService.createBudgetCategory(db, data);
      }).toThrow(ValidationError);
      expect(() => {
        budgetCategoryService.createBudgetCategory(db, data);
      }).toThrow('Color must be a hex color code in format #RRGGBB');
    });

    it('throws ValidationError for invalid hex color (word)', () => {
      const data: CreateBudgetCategoryRequest = { name: 'Custom Cladding', color: 'blue' };

      expect(() => {
        budgetCategoryService.createBudgetCategory(db, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for 3-digit hex color', () => {
      const data: CreateBudgetCategoryRequest = { name: 'Custom Fascia', color: '#FFF' };

      expect(() => {
        budgetCategoryService.createBudgetCategory(db, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for negative sortOrder', () => {
      const data: CreateBudgetCategoryRequest = { name: 'Custom Grading', sortOrder: -1 };

      expect(() => {
        budgetCategoryService.createBudgetCategory(db, data);
      }).toThrow(ValidationError);
      expect(() => {
        budgetCategoryService.createBudgetCategory(db, data);
      }).toThrow('Sort order must be a non-negative integer');
    });

    it('throws ConflictError for duplicate name (exact match with seeded category)', () => {
      // 'Materials' is a seeded default category name
      const data: CreateBudgetCategoryRequest = { name: 'Materials' };

      expect(() => {
        budgetCategoryService.createBudgetCategory(db, data);
      }).toThrow(ConflictError);
      expect(() => {
        budgetCategoryService.createBudgetCategory(db, data);
      }).toThrow('A budget category with this name already exists');
    });

    it('throws ConflictError for duplicate name (case-insensitive match with seeded)', () => {
      const data: CreateBudgetCategoryRequest = { name: 'MATERIALS' };

      expect(() => {
        budgetCategoryService.createBudgetCategory(db, data);
      }).toThrow(ConflictError);
    });

    it('throws ConflictError for duplicate name after trimming', () => {
      const data: CreateBudgetCategoryRequest = { name: '  MATERIALS  ' };

      expect(() => {
        budgetCategoryService.createBudgetCategory(db, data);
      }).toThrow(ConflictError);
    });

    it('throws ConflictError for duplicate name with a newly created category', () => {
      createTestCategory('Custom Terrace');

      const data: CreateBudgetCategoryRequest = { name: 'Custom Terrace' };

      expect(() => {
        budgetCategoryService.createBudgetCategory(db, data);
      }).toThrow(ConflictError);
    });

    it('accepts null color without validation error', () => {
      const data: CreateBudgetCategoryRequest = { name: 'Custom Gutters', color: null };

      const result = budgetCategoryService.createBudgetCategory(db, data);

      expect(result.color).toBeNull();
    });

    it('accepts null description without validation error', () => {
      const data: CreateBudgetCategoryRequest = { name: 'Custom Attic', description: null };

      const result = budgetCategoryService.createBudgetCategory(db, data);

      expect(result.description).toBeNull();
    });
  });

  // ─── updateBudgetCategory() ────────────────────────────────────────────────

  describe('updateBudgetCategory()', () => {
    it('updates the name of an existing category', () => {
      const cat = createTestCategory('Custom Sprinklers');

      const data: UpdateBudgetCategoryRequest = { name: 'Custom Irrigation' };
      const result = budgetCategoryService.updateBudgetCategory(db, cat.id, data);

      expect(result.id).toBe(cat.id);
      expect(result.name).toBe('Custom Irrigation');
    });

    it('updates only description (partial update)', () => {
      const cat = createTestCategory('Custom Fencing', {
        color: '#FF0000',
        sortOrder: 50,
      });

      const data: UpdateBudgetCategoryRequest = { description: 'Updated fence description' };
      const result = budgetCategoryService.updateBudgetCategory(db, cat.id, data);

      expect(result.name).toBe('Custom Fencing');
      expect(result.description).toBe('Updated fence description');
      expect(result.color).toBe('#FF0000');
      expect(result.sortOrder).toBe(50);
    });

    it('updates only color (partial update)', () => {
      const cat = createTestCategory('Custom Barn', { color: '#FF0000' });

      const data: UpdateBudgetCategoryRequest = { color: '#00FF00' };
      const result = budgetCategoryService.updateBudgetCategory(db, cat.id, data);

      expect(result.name).toBe('Custom Barn');
      expect(result.color).toBe('#00FF00');
    });

    it('removes color by setting to null', () => {
      const cat = createTestCategory('Custom Deck', { color: '#FF0000' });

      const data: UpdateBudgetCategoryRequest = { color: null };
      const result = budgetCategoryService.updateBudgetCategory(db, cat.id, data);

      expect(result.color).toBeNull();
    });

    it('removes description by setting to null', () => {
      const cat = createTestCategory('Custom Garage', { description: 'Some description' });

      const data: UpdateBudgetCategoryRequest = { description: null };
      const result = budgetCategoryService.updateBudgetCategory(db, cat.id, data);

      expect(result.description).toBeNull();
    });

    it('updates only sortOrder (partial update)', () => {
      const cat = createTestCategory('Custom Carport', { sortOrder: 1 });

      const data: UpdateBudgetCategoryRequest = { sortOrder: 10 };
      const result = budgetCategoryService.updateBudgetCategory(db, cat.id, data);

      expect(result.sortOrder).toBe(10);
      expect(result.name).toBe('Custom Carport');
    });

    it('updates all fields at once', () => {
      const cat = createTestCategory('Custom Pergola', {
        description: 'Old desc',
        color: '#000000',
        sortOrder: 1,
      });

      const data: UpdateBudgetCategoryRequest = {
        name: 'Custom Awning',
        description: 'New description',
        color: '#FFFFFF',
        sortOrder: 99,
      };
      const result = budgetCategoryService.updateBudgetCategory(db, cat.id, data);

      expect(result.name).toBe('Custom Awning');
      expect(result.description).toBe('New description');
      expect(result.color).toBe('#FFFFFF');
      expect(result.sortOrder).toBe(99);
    });

    it('trims name before updating', () => {
      const cat = createTestCategory('Custom Patio');

      const data: UpdateBudgetCategoryRequest = { name: '  Custom Garden  ' };
      const result = budgetCategoryService.updateBudgetCategory(db, cat.id, data);

      expect(result.name).toBe('Custom Garden');
    });

    it('allows updating name to the same value (no conflict)', () => {
      const cat = createTestCategory('Custom Pool');

      const data: UpdateBudgetCategoryRequest = { name: 'Custom Pool' };
      const result = budgetCategoryService.updateBudgetCategory(db, cat.id, data);

      expect(result.name).toBe('Custom Pool');
    });

    it('sets updatedAt to a new timestamp on update', async () => {
      const cat = createTestCategory('Custom Spa');

      await new Promise((resolve) => setTimeout(resolve, 1));

      const data: UpdateBudgetCategoryRequest = { name: 'Custom Hot Tub' };
      const result = budgetCategoryService.updateBudgetCategory(db, cat.id, data);

      expect(result.updatedAt).not.toBe(cat.updatedAt);
    });

    it('can update a seeded category', () => {
      // Update the seeded 'Materials' category (id: bc-materials)
      const data: UpdateBudgetCategoryRequest = { sortOrder: 50 };
      const result = budgetCategoryService.updateBudgetCategory(db, 'bc-materials', data);

      expect(result.id).toBe('bc-materials');
      expect(result.name).toBe('Materials');
      expect(result.sortOrder).toBe(50);
    });

    it('throws NotFoundError when category does not exist', () => {
      const data: UpdateBudgetCategoryRequest = { name: 'Test' };

      expect(() => {
        budgetCategoryService.updateBudgetCategory(db, 'non-existent-id', data);
      }).toThrow(NotFoundError);
      expect(() => {
        budgetCategoryService.updateBudgetCategory(db, 'non-existent-id', data);
      }).toThrow('Budget category not found');
    });

    it('throws ValidationError when no fields are provided', () => {
      const cat = createTestCategory('Custom Sauna');

      const data: UpdateBudgetCategoryRequest = {};

      expect(() => {
        budgetCategoryService.updateBudgetCategory(db, cat.id, data);
      }).toThrow(ValidationError);
      expect(() => {
        budgetCategoryService.updateBudgetCategory(db, cat.id, data);
      }).toThrow('At least one field must be provided');
    });

    it('throws ValidationError for empty name', () => {
      const cat = createTestCategory('Custom Cellar');

      const data: UpdateBudgetCategoryRequest = { name: '' };

      expect(() => {
        budgetCategoryService.updateBudgetCategory(db, cat.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for whitespace-only name', () => {
      const cat = createTestCategory('Custom Basement');

      const data: UpdateBudgetCategoryRequest = { name: '   ' };

      expect(() => {
        budgetCategoryService.updateBudgetCategory(db, cat.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for name exceeding 100 characters', () => {
      const cat = createTestCategory('Custom Atrium');

      const data: UpdateBudgetCategoryRequest = { name: 'a'.repeat(101) };

      expect(() => {
        budgetCategoryService.updateBudgetCategory(db, cat.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for description exceeding 500 characters', () => {
      const cat = createTestCategory('Custom Balcony');

      const data: UpdateBudgetCategoryRequest = { description: 'a'.repeat(501) };

      expect(() => {
        budgetCategoryService.updateBudgetCategory(db, cat.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for invalid hex color format', () => {
      const cat = createTestCategory('Custom Terrace B');

      const data: UpdateBudgetCategoryRequest = { color: 'not-a-color' };

      expect(() => {
        budgetCategoryService.updateBudgetCategory(db, cat.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for negative sortOrder', () => {
      const cat = createTestCategory('Custom Lobby');

      const data: UpdateBudgetCategoryRequest = { sortOrder: -5 };

      expect(() => {
        budgetCategoryService.updateBudgetCategory(db, cat.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ConflictError when new name conflicts with another category', () => {
      const cat = createTestCategory('Custom Studio');

      // Try to rename to a seeded category name
      const data: UpdateBudgetCategoryRequest = { name: 'Labor' };

      expect(() => {
        budgetCategoryService.updateBudgetCategory(db, cat.id, data);
      }).toThrow(ConflictError);
      expect(() => {
        budgetCategoryService.updateBudgetCategory(db, cat.id, data);
      }).toThrow('A budget category with this name already exists');
    });

    it('throws ConflictError for case-insensitive name conflict with another category', () => {
      const cat = createTestCategory('Custom Veranda');

      const data: UpdateBudgetCategoryRequest = { name: 'LABOR' };

      expect(() => {
        budgetCategoryService.updateBudgetCategory(db, cat.id, data);
      }).toThrow(ConflictError);
    });
  });

  // ─── deleteBudgetCategory() ────────────────────────────────────────────────

  describe('deleteBudgetCategory()', () => {
    it('deletes a custom category successfully', () => {
      const cat = createTestCategory('Custom Driveway');

      budgetCategoryService.deleteBudgetCategory(db, cat.id);

      expect(() => {
        budgetCategoryService.getBudgetCategoryById(db, cat.id);
      }).toThrow(NotFoundError);
    });

    it('removes category from the list after deletion', () => {
      const cat1 = createTestCategory('Custom Walkway');
      createTestCategory('Custom Path');

      const countBefore = budgetCategoryService.listBudgetCategories(db).length;

      budgetCategoryService.deleteBudgetCategory(db, cat1.id);

      const result = budgetCategoryService.listBudgetCategories(db);
      expect(result).toHaveLength(countBefore - 1);

      const found = result.find((c) => c.id === cat1.id);
      expect(found).toBeUndefined();
    });

    it('can delete a seeded category', () => {
      // bc-other is a seeded default not used by any subsidy program
      budgetCategoryService.deleteBudgetCategory(db, 'bc-other');

      expect(() => {
        budgetCategoryService.getBudgetCategoryById(db, 'bc-other');
      }).toThrow(NotFoundError);
    });

    it('throws NotFoundError when category does not exist', () => {
      expect(() => {
        budgetCategoryService.deleteBudgetCategory(db, 'non-existent-id');
      }).toThrow(NotFoundError);
      expect(() => {
        budgetCategoryService.deleteBudgetCategory(db, 'non-existent-id');
      }).toThrow('Budget category not found');
    });

    it('throws CategoryInUseError when category is referenced by a subsidy program', () => {
      const cat = createTestCategory('Custom Ventilation');
      createSubsidyProgramReferencing(cat.id);

      expect(() => {
        budgetCategoryService.deleteBudgetCategory(db, cat.id);
      }).toThrow(CategoryInUseError);
      expect(() => {
        budgetCategoryService.deleteBudgetCategory(db, cat.id);
      }).toThrow('Budget category is in use and cannot be deleted');
    });

    it('includes subsidyProgramCount in CategoryInUseError details', () => {
      const cat = createTestCategory('Custom Skylights');
      createSubsidyProgramReferencing(cat.id);

      let thrownError: CategoryInUseError | null = null;
      try {
        budgetCategoryService.deleteBudgetCategory(db, cat.id);
      } catch (err) {
        if (err instanceof CategoryInUseError) {
          thrownError = err;
        }
      }

      expect(thrownError).not.toBeNull();
      expect(thrownError?.details?.subsidyProgramCount).toBe(1);
      expect(thrownError?.details?.workItemCount).toBe(0);
    });

    it('successfully deletes a category not referenced by any subsidy program', () => {
      const cat1 = createTestCategory('Custom Dormer');
      const cat2 = createTestCategory('Custom Gable');
      // Reference cat2, but not cat1
      createSubsidyProgramReferencing(cat2.id);

      // cat1 should be deletable
      budgetCategoryService.deleteBudgetCategory(db, cat1.id);

      expect(() => {
        budgetCategoryService.getBudgetCategoryById(db, cat1.id);
      }).toThrow(NotFoundError);
    });

    it('CategoryInUseError has code CATEGORY_IN_USE and statusCode 409', () => {
      const cat = createTestCategory('Custom Eave');
      createSubsidyProgramReferencing(cat.id);

      let thrownError: CategoryInUseError | null = null;
      try {
        budgetCategoryService.deleteBudgetCategory(db, cat.id);
      } catch (err) {
        if (err instanceof CategoryInUseError) {
          thrownError = err;
        }
      }

      expect(thrownError?.code).toBe('CATEGORY_IN_USE');
      expect(thrownError?.statusCode).toBe(409);
    });
  });
});
