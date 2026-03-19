import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as areaService from './areaService.js';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  AreaInUseError,
} from '../errors/AppError.js';
import type { CreateAreaRequest, UpdateAreaRequest } from '@cornerstone/shared';

describe('Area Service', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  let areaTimestampOffset = 0;

  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  /**
   * Helper: Create an area directly in the database.
   */
  function createTestArea(
    name: string,
    options: {
      parentId?: string | null;
      description?: string | null;
      color?: string | null;
      sortOrder?: number;
    } = {},
  ) {
    const id = `area-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const timestamp = new Date(Date.now() + areaTimestampOffset).toISOString();
    areaTimestampOffset += 1;

    db.insert(schema.areas)
      .values({
        id,
        name,
        parentId: options.parentId ?? null,
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
   * Helper: Create a work item referencing an area.
   */
  function createTestWorkItem(areaId: string) {
    const id = `wi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();
    db.insert(schema.workItems)
      .values({
        id,
        title: 'Test Work Item',
        status: 'not_started',
        areaId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  /**
   * Helper: Create a household item referencing an area.
   */
  function createTestHouseholdItem(areaId: string) {
    const id = `hi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();
    db.insert(schema.householdItems)
      .values({
        id,
        name: 'Test Household Item',
        categoryId: 'hic-furniture',
        areaId,
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
    areaTimestampOffset = 0;
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── listAreas() ───────────────────────────────────────────────────────────

  describe('listAreas()', () => {
    it('returns empty list when no areas exist', () => {
      const result = areaService.listAreas(db);
      expect(result).toHaveLength(0);
    });

    it('returns all areas when multiple exist', () => {
      createTestArea('Kitchen');
      createTestArea('Bathroom');
      createTestArea('Living Room');

      const result = areaService.listAreas(db);
      expect(result).toHaveLength(3);
    });

    it('returns areas sorted by sortOrder ascending, then name ascending', () => {
      createTestArea('Zeta Area', { sortOrder: 10 });
      createTestArea('Alpha Area', { sortOrder: 5 });
      createTestArea('Beta Area', { sortOrder: 5 });

      const result = areaService.listAreas(db);
      expect(result[0].name).toBe('Alpha Area');
      expect(result[1].name).toBe('Beta Area');
      expect(result[2].name).toBe('Zeta Area');
    });

    it('returns all area fields', () => {
      const area = createTestArea('Custom Kitchen', {
        description: 'Main cooking area',
        color: '#FF5733',
        sortOrder: 5,
        parentId: null,
      });

      const result = areaService.listAreas(db);
      const found = result.find((a) => a.id === area.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe('Custom Kitchen');
      expect(found!.description).toBe('Main cooking area');
      expect(found!.color).toBe('#FF5733');
      expect(found!.sortOrder).toBe(5);
      expect(found!.parentId).toBeNull();
      expect(found!.createdAt).toBeDefined();
      expect(found!.updatedAt).toBeDefined();
    });

    it('filters areas by name search (case-insensitive)', () => {
      createTestArea('Kitchen Area');
      createTestArea('Bathroom Tiles');
      createTestArea('KITCHEN Cabinets');

      const result = areaService.listAreas(db, 'kitchen');
      expect(result).toHaveLength(2);
      expect(result.every((a) => a.name.toLowerCase().includes('kitchen'))).toBe(true);
    });

    it('returns empty list when search matches nothing', () => {
      createTestArea('Kitchen');
      createTestArea('Bathroom');

      const result = areaService.listAreas(db, 'nonexistent');
      expect(result).toHaveLength(0);
    });

    it('returns all areas when search is empty string (no filter)', () => {
      createTestArea('Kitchen');
      createTestArea('Bathroom');

      // Empty string is falsy — no filter applied
      const result = areaService.listAreas(db, '');
      expect(result).toHaveLength(2);
    });

    it('returns areas with null description and null color', () => {
      const area = createTestArea('Garage', { description: null, color: null });

      const result = areaService.listAreas(db);
      const found = result.find((a) => a.id === area.id);
      expect(found).toBeDefined();
      expect(found!.description).toBeNull();
      expect(found!.color).toBeNull();
    });

    it('returns child areas with parentId set', () => {
      const parent = createTestArea('Floor 1');
      const child = createTestArea('Bedroom', { parentId: parent.id });

      const result = areaService.listAreas(db);
      const foundChild = result.find((a) => a.id === child.id);
      expect(foundChild).toBeDefined();
      expect(foundChild!.parentId).toBe(parent.id);
    });
  });

  // ─── getAreaById() ─────────────────────────────────────────────────────────

  describe('getAreaById()', () => {
    it('returns an area by ID', () => {
      const area = createTestArea('Test Kitchen', { color: '#AABBCC', sortOrder: 3 });

      const result = areaService.getAreaById(db, area.id);

      expect(result.id).toBe(area.id);
      expect(result.name).toBe('Test Kitchen');
      expect(result.color).toBe('#AABBCC');
      expect(result.sortOrder).toBe(3);
    });

    it('throws NotFoundError when area does not exist', () => {
      expect(() => {
        areaService.getAreaById(db, 'non-existent-id');
      }).toThrow(NotFoundError);

      expect(() => {
        areaService.getAreaById(db, 'non-existent-id');
      }).toThrow('Area not found');
    });

    it('returns area with null parentId for top-level areas', () => {
      const area = createTestArea('Top Level Area');

      const result = areaService.getAreaById(db, area.id);

      expect(result.parentId).toBeNull();
    });

    it('returns area with parentId set for child areas', () => {
      const parent = createTestArea('Parent Area');
      const child = createTestArea('Child Area', { parentId: parent.id });

      const result = areaService.getAreaById(db, child.id);

      expect(result.parentId).toBe(parent.id);
    });
  });

  // ─── createArea() ──────────────────────────────────────────────────────────

  describe('createArea()', () => {
    it('creates a top-level area with name only', () => {
      const data: CreateAreaRequest = { name: 'Living Room' };

      const result = areaService.createArea(db, data);

      expect(result.id).toBeDefined();
      expect(result.name).toBe('Living Room');
      expect(result.parentId).toBeNull();
      expect(result.description).toBeNull();
      expect(result.color).toBeNull();
      expect(result.sortOrder).toBe(0);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('creates an area with all fields', () => {
      const data: CreateAreaRequest = {
        name: 'Master Bedroom',
        description: 'Main sleeping area',
        color: '#3B82F6',
        sortOrder: 5,
      };

      const result = areaService.createArea(db, data);

      expect(result.name).toBe('Master Bedroom');
      expect(result.description).toBe('Main sleeping area');
      expect(result.color).toBe('#3B82F6');
      expect(result.sortOrder).toBe(5);
      expect(result.parentId).toBeNull();
    });

    it('creates a child area with parentId', () => {
      const parent = createTestArea('Floor 1');
      const data: CreateAreaRequest = { name: 'Bedroom 1', parentId: parent.id };

      const result = areaService.createArea(db, data);

      expect(result.parentId).toBe(parent.id);
      expect(result.name).toBe('Bedroom 1');
    });

    it('trims leading and trailing whitespace from name', () => {
      const data: CreateAreaRequest = { name: '  Kitchen Area  ' };

      const result = areaService.createArea(db, data);

      expect(result.name).toBe('Kitchen Area');
    });

    it('persists area in the database', () => {
      const data: CreateAreaRequest = { name: 'Study Room' };
      const created = areaService.createArea(db, data);

      const fetched = areaService.getAreaById(db, created.id);
      expect(fetched.id).toBe(created.id);
      expect(fetched.name).toBe('Study Room');
    });

    it('throws ValidationError for empty name', () => {
      const data: CreateAreaRequest = { name: '' };

      expect(() => {
        areaService.createArea(db, data);
      }).toThrow(ValidationError);

      expect(() => {
        areaService.createArea(db, data);
      }).toThrow('Area name must be between 1 and 200 characters');
    });

    it('throws ValidationError for whitespace-only name', () => {
      const data: CreateAreaRequest = { name: '   ' };

      expect(() => {
        areaService.createArea(db, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for name exceeding 200 characters', () => {
      const data: CreateAreaRequest = { name: 'a'.repeat(201) };

      expect(() => {
        areaService.createArea(db, data);
      }).toThrow(ValidationError);

      expect(() => {
        areaService.createArea(db, data);
      }).toThrow('Area name must be between 1 and 200 characters');
    });

    it('accepts name with exactly 200 characters', () => {
      const name = 'X'.repeat(200);
      const data: CreateAreaRequest = { name };

      const result = areaService.createArea(db, data);

      expect(result.name).toBe(name);
    });

    it('throws ValidationError for description exceeding 2000 characters', () => {
      const data: CreateAreaRequest = {
        name: 'Test Area',
        description: 'a'.repeat(2001),
      };

      expect(() => {
        areaService.createArea(db, data);
      }).toThrow(ValidationError);

      expect(() => {
        areaService.createArea(db, data);
      }).toThrow('Area description must be at most 2000 characters');
    });

    it('accepts description with exactly 2000 characters', () => {
      const data: CreateAreaRequest = {
        name: 'Test Area',
        description: 'a'.repeat(2000),
      };

      const result = areaService.createArea(db, data);

      expect(result.description).toHaveLength(2000);
    });

    it('throws ValidationError for invalid color format', () => {
      const data: CreateAreaRequest = { name: 'Test Area', color: 'blue' };

      expect(() => {
        areaService.createArea(db, data);
      }).toThrow(ValidationError);

      expect(() => {
        areaService.createArea(db, data);
      }).toThrow('Color must be a hex color code in format #RRGGBB');
    });

    it('throws ValidationError for 3-digit hex color', () => {
      const data: CreateAreaRequest = { name: 'Test Area', color: '#FFF' };

      expect(() => {
        areaService.createArea(db, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for negative sortOrder', () => {
      const data: CreateAreaRequest = { name: 'Test Area', sortOrder: -1 };

      expect(() => {
        areaService.createArea(db, data);
      }).toThrow(ValidationError);

      expect(() => {
        areaService.createArea(db, data);
      }).toThrow('Sort order must be a non-negative integer');
    });

    it('throws ValidationError when parentId does not exist', () => {
      const data: CreateAreaRequest = { name: 'Test Area', parentId: 'non-existent-parent' };

      expect(() => {
        areaService.createArea(db, data);
      }).toThrow(ValidationError);

      expect(() => {
        areaService.createArea(db, data);
      }).toThrow('Parent area does not exist');
    });

    it('throws ConflictError for duplicate name at same level (top-level)', () => {
      createTestArea('Kitchen');
      const data: CreateAreaRequest = { name: 'Kitchen' };

      expect(() => {
        areaService.createArea(db, data);
      }).toThrow(ConflictError);

      expect(() => {
        areaService.createArea(db, data);
      }).toThrow('An area with this name already exists at this level');
    });

    it('throws ConflictError for duplicate name case-insensitive (top-level)', () => {
      createTestArea('Kitchen');
      const data: CreateAreaRequest = { name: 'KITCHEN' };

      expect(() => {
        areaService.createArea(db, data);
      }).toThrow(ConflictError);
    });

    it('allows same name under different parents', () => {
      const parent1 = createTestArea('Floor 1');
      const parent2 = createTestArea('Floor 2');
      const data1: CreateAreaRequest = { name: 'Bedroom', parentId: parent1.id };
      const data2: CreateAreaRequest = { name: 'Bedroom', parentId: parent2.id };

      const result1 = areaService.createArea(db, data1);
      const result2 = areaService.createArea(db, data2);

      expect(result1.id).not.toBe(result2.id);
      expect(result1.name).toBe('Bedroom');
      expect(result2.name).toBe('Bedroom');
    });

    it('allows same name at top-level and child level', () => {
      const parent = createTestArea('Kitchen');
      // "Kitchen" already exists at top level. A child named "Kitchen" under parent is OK.
      const data: CreateAreaRequest = { name: 'Kitchen', parentId: parent.id };

      const result = areaService.createArea(db, data);

      expect(result.parentId).toBe(parent.id);
    });

    it('throws ConflictError for duplicate name among siblings (child level)', () => {
      const parent = createTestArea('Floor 1');
      createTestArea('Bedroom', { parentId: parent.id });
      const data: CreateAreaRequest = { name: 'Bedroom', parentId: parent.id };

      expect(() => {
        areaService.createArea(db, data);
      }).toThrow(ConflictError);
    });

    it('accepts null color without validation error', () => {
      const data: CreateAreaRequest = { name: 'Test Area', color: null };

      const result = areaService.createArea(db, data);

      expect(result.color).toBeNull();
    });

    it('accepts null description without validation error', () => {
      const data: CreateAreaRequest = { name: 'Test Area', description: null };

      const result = areaService.createArea(db, data);

      expect(result.description).toBeNull();
    });

    it('creates area with sortOrder 0 by default', () => {
      const data: CreateAreaRequest = { name: 'No Sort Order Area' };

      const result = areaService.createArea(db, data);

      expect(result.sortOrder).toBe(0);
    });
  });

  // ─── updateArea() ──────────────────────────────────────────────────────────

  describe('updateArea()', () => {
    it('updates the name of an existing area', () => {
      const area = createTestArea('Old Name');

      const data: UpdateAreaRequest = { name: 'New Name' };
      const result = areaService.updateArea(db, area.id, data);

      expect(result.id).toBe(area.id);
      expect(result.name).toBe('New Name');
    });

    it('updates parentId to a new parent', () => {
      const parent = createTestArea('New Parent');
      const area = createTestArea('Child Area');

      const data: UpdateAreaRequest = { parentId: parent.id };
      const result = areaService.updateArea(db, area.id, data);

      expect(result.parentId).toBe(parent.id);
    });

    it('clears parentId by setting to null (move to top-level)', () => {
      const parent = createTestArea('Parent');
      const area = createTestArea('Child', { parentId: parent.id });

      const data: UpdateAreaRequest = { parentId: null };
      const result = areaService.updateArea(db, area.id, data);

      expect(result.parentId).toBeNull();
    });

    it('updates description only (partial update)', () => {
      const area = createTestArea('Study', { color: '#FF0000', sortOrder: 3 });

      const data: UpdateAreaRequest = { description: 'Updated description' };
      const result = areaService.updateArea(db, area.id, data);

      expect(result.name).toBe('Study');
      expect(result.description).toBe('Updated description');
      expect(result.color).toBe('#FF0000');
      expect(result.sortOrder).toBe(3);
    });

    it('updates color only', () => {
      const area = createTestArea('Garage', { color: '#FF0000' });

      const data: UpdateAreaRequest = { color: '#00FF00' };
      const result = areaService.updateArea(db, area.id, data);

      expect(result.color).toBe('#00FF00');
      expect(result.name).toBe('Garage');
    });

    it('removes color by setting to null', () => {
      const area = createTestArea('Storage', { color: '#FF0000' });

      const data: UpdateAreaRequest = { color: null };
      const result = areaService.updateArea(db, area.id, data);

      expect(result.color).toBeNull();
    });

    it('removes description by setting to null', () => {
      const area = createTestArea('Workshop', { description: 'Some description' });

      const data: UpdateAreaRequest = { description: null };
      const result = areaService.updateArea(db, area.id, data);

      expect(result.description).toBeNull();
    });

    it('updates sortOrder only', () => {
      const area = createTestArea('Pantry', { sortOrder: 1 });

      const data: UpdateAreaRequest = { sortOrder: 10 };
      const result = areaService.updateArea(db, area.id, data);

      expect(result.sortOrder).toBe(10);
      expect(result.name).toBe('Pantry');
    });

    it('updates all fields at once', () => {
      const parent = createTestArea('New Parent');
      const area = createTestArea('Old Name', {
        description: 'Old desc',
        color: '#000000',
        sortOrder: 1,
      });

      const data: UpdateAreaRequest = {
        name: 'New Name',
        parentId: parent.id,
        description: 'New description',
        color: '#FFFFFF',
        sortOrder: 99,
      };
      const result = areaService.updateArea(db, area.id, data);

      expect(result.name).toBe('New Name');
      expect(result.parentId).toBe(parent.id);
      expect(result.description).toBe('New description');
      expect(result.color).toBe('#FFFFFF');
      expect(result.sortOrder).toBe(99);
    });

    it('trims name before updating', () => {
      const area = createTestArea('Old Name');

      const data: UpdateAreaRequest = { name: '  New Name  ' };
      const result = areaService.updateArea(db, area.id, data);

      expect(result.name).toBe('New Name');
    });

    it('allows updating name to the same value (no conflict)', () => {
      const area = createTestArea('Same Name');

      const data: UpdateAreaRequest = { name: 'Same Name' };
      const result = areaService.updateArea(db, area.id, data);

      expect(result.name).toBe('Same Name');
    });

    it('sets updatedAt to a new timestamp on update', async () => {
      const area = createTestArea('Timestamp Test');

      await new Promise((resolve) => setTimeout(resolve, 1));

      const data: UpdateAreaRequest = { name: 'Updated Name' };
      const result = areaService.updateArea(db, area.id, data);

      expect(result.updatedAt).not.toBe(area.createdAt);
    });

    it('throws NotFoundError when area does not exist', () => {
      const data: UpdateAreaRequest = { name: 'Test' };

      expect(() => {
        areaService.updateArea(db, 'non-existent-id', data);
      }).toThrow(NotFoundError);

      expect(() => {
        areaService.updateArea(db, 'non-existent-id', data);
      }).toThrow('Area not found');
    });

    it('throws ValidationError when no fields are provided', () => {
      const area = createTestArea('Test Area');

      const data: UpdateAreaRequest = {};

      expect(() => {
        areaService.updateArea(db, area.id, data);
      }).toThrow(ValidationError);

      expect(() => {
        areaService.updateArea(db, area.id, data);
      }).toThrow('At least one field must be provided');
    });

    it('throws ValidationError for empty name', () => {
      const area = createTestArea('Test Area');

      const data: UpdateAreaRequest = { name: '' };

      expect(() => {
        areaService.updateArea(db, area.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for name exceeding 200 characters', () => {
      const area = createTestArea('Test Area');

      const data: UpdateAreaRequest = { name: 'a'.repeat(201) };

      expect(() => {
        areaService.updateArea(db, area.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for invalid hex color format', () => {
      const area = createTestArea('Test Area');

      const data: UpdateAreaRequest = { color: 'not-a-color' };

      expect(() => {
        areaService.updateArea(db, area.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for negative sortOrder', () => {
      const area = createTestArea('Test Area');

      const data: UpdateAreaRequest = { sortOrder: -5 };

      expect(() => {
        areaService.updateArea(db, area.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for non-existent parentId', () => {
      const area = createTestArea('Test Area');

      const data: UpdateAreaRequest = { parentId: 'non-existent-parent' };

      expect(() => {
        areaService.updateArea(db, area.id, data);
      }).toThrow(ValidationError);

      expect(() => {
        areaService.updateArea(db, area.id, data);
      }).toThrow('Parent area does not exist');
    });

    it('throws ValidationError for circular reference: self as parent', () => {
      const area = createTestArea('Test Area');

      const data: UpdateAreaRequest = { parentId: area.id };

      expect(() => {
        areaService.updateArea(db, area.id, data);
      }).toThrow(ValidationError);

      expect(() => {
        areaService.updateArea(db, area.id, data);
      }).toThrow('circular reference');
    });

    it('throws ValidationError for circular reference: descendant as parent', () => {
      const grandparent = createTestArea('Grandparent');
      const parent = createTestArea('Parent', { parentId: grandparent.id });
      const child = createTestArea('Child', { parentId: parent.id });

      // Try to make grandparent a child of its own descendant
      const data: UpdateAreaRequest = { parentId: child.id };

      expect(() => {
        areaService.updateArea(db, grandparent.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ConflictError when new name conflicts with sibling area', () => {
      createTestArea('Existing Sibling');
      const area = createTestArea('Another Area');

      const data: UpdateAreaRequest = { name: 'Existing Sibling' };

      expect(() => {
        areaService.updateArea(db, area.id, data);
      }).toThrow(ConflictError);

      expect(() => {
        areaService.updateArea(db, area.id, data);
      }).toThrow('An area with this name already exists at this level');
    });

    it('throws ConflictError for case-insensitive name conflict with sibling', () => {
      createTestArea('Kitchen');
      const area = createTestArea('Study');

      const data: UpdateAreaRequest = { name: 'KITCHEN' };

      expect(() => {
        areaService.updateArea(db, area.id, data);
      }).toThrow(ConflictError);
    });

    it('does not throw ConflictError when same name exists under different parent', () => {
      const parent1 = createTestArea('Floor 1');
      const parent2 = createTestArea('Floor 2');
      createTestArea('Bedroom', { parentId: parent1.id });
      const areaUnderParent2 = createTestArea('Study', { parentId: parent2.id });

      // Rename study (under parent2) to "Bedroom" — no conflict since parent1 has bedroom, not parent2
      const data: UpdateAreaRequest = { name: 'Bedroom' };
      const result = areaService.updateArea(db, areaUnderParent2.id, data);

      expect(result.name).toBe('Bedroom');
    });
  });

  // ─── deleteArea() ──────────────────────────────────────────────────────────

  describe('deleteArea()', () => {
    it('deletes an area successfully', () => {
      const area = createTestArea('Delete Me');

      areaService.deleteArea(db, area.id);

      expect(() => {
        areaService.getAreaById(db, area.id);
      }).toThrow(NotFoundError);
    });

    it('removes area from list after deletion', () => {
      const area1 = createTestArea('Area One');
      createTestArea('Area Two');

      areaService.deleteArea(db, area1.id);

      const result = areaService.listAreas(db);
      expect(result.find((a) => a.id === area1.id)).toBeUndefined();
      expect(result).toHaveLength(1);
    });

    it('throws NotFoundError when area does not exist', () => {
      expect(() => {
        areaService.deleteArea(db, 'non-existent-id');
      }).toThrow(NotFoundError);

      expect(() => {
        areaService.deleteArea(db, 'non-existent-id');
      }).toThrow('Area not found');
    });

    it('throws AreaInUseError when area is referenced by a work item', () => {
      const area = createTestArea('In Use Area');
      createTestWorkItem(area.id);

      expect(() => {
        areaService.deleteArea(db, area.id);
      }).toThrow(AreaInUseError);

      expect(() => {
        areaService.deleteArea(db, area.id);
      }).toThrow('Area is in use and cannot be deleted');
    });

    it('includes workItemCount in AreaInUseError details when work item references area', () => {
      const area = createTestArea('WI Referenced Area');
      createTestWorkItem(area.id);
      createTestWorkItem(area.id);

      let thrownError: AreaInUseError | null = null;
      try {
        areaService.deleteArea(db, area.id);
      } catch (err) {
        if (err instanceof AreaInUseError) {
          thrownError = err;
        }
      }

      expect(thrownError).not.toBeNull();
      expect(thrownError?.details?.workItemCount).toBe(2);
      expect(thrownError?.details?.householdItemCount).toBe(0);
    });

    it('throws AreaInUseError when area is referenced by a household item', () => {
      const area = createTestArea('HI Referenced Area');
      createTestHouseholdItem(area.id);

      expect(() => {
        areaService.deleteArea(db, area.id);
      }).toThrow(AreaInUseError);
    });

    it('includes householdItemCount in AreaInUseError details when HI references area', () => {
      const area = createTestArea('HI Count Area');
      createTestHouseholdItem(area.id);

      let thrownError: AreaInUseError | null = null;
      try {
        areaService.deleteArea(db, area.id);
      } catch (err) {
        if (err instanceof AreaInUseError) {
          thrownError = err;
        }
      }

      expect(thrownError).not.toBeNull();
      expect(thrownError?.details?.householdItemCount).toBe(1);
      expect(thrownError?.details?.workItemCount).toBe(0);
    });

    it('AreaInUseError has code AREA_IN_USE and statusCode 409', () => {
      const area = createTestArea('Code Check Area');
      createTestWorkItem(area.id);

      let thrownError: AreaInUseError | null = null;
      try {
        areaService.deleteArea(db, area.id);
      } catch (err) {
        if (err instanceof AreaInUseError) {
          thrownError = err;
        }
      }

      expect(thrownError?.code).toBe('AREA_IN_USE');
      expect(thrownError?.statusCode).toBe(409);
    });

    it('throws AreaInUseError when a descendant area is referenced by a work item', () => {
      const parent = createTestArea('Parent Area');
      const child = createTestArea('Child Area', { parentId: parent.id });
      createTestWorkItem(child.id);

      // Deleting parent should fail because a descendant is in use
      expect(() => {
        areaService.deleteArea(db, parent.id);
      }).toThrow(AreaInUseError);
    });

    it('throws AreaInUseError when a descendant area is referenced by a household item', () => {
      const parent = createTestArea('Parent Area');
      const child = createTestArea('Child Area', { parentId: parent.id });
      createTestHouseholdItem(child.id);

      expect(() => {
        areaService.deleteArea(db, parent.id);
      }).toThrow(AreaInUseError);
    });

    it('can delete area that is not referenced by any items', () => {
      const area1 = createTestArea('Safe To Delete');
      const area2 = createTestArea('Has References');
      createTestWorkItem(area2.id);

      // area1 should be safely deletable
      areaService.deleteArea(db, area1.id);

      expect(() => {
        areaService.getAreaById(db, area1.id);
      }).toThrow(NotFoundError);

      // area2 still exists
      const found = areaService.getAreaById(db, area2.id);
      expect(found.id).toBe(area2.id);
    });

    it('cascade deletes child areas when parent is deleted (no references)', () => {
      const parent = createTestArea('Parent');
      const child = createTestArea('Child', { parentId: parent.id });

      // Delete parent — child has no references so cascade should work
      areaService.deleteArea(db, parent.id);

      // Both parent and child should be gone
      expect(() => {
        areaService.getAreaById(db, parent.id);
      }).toThrow(NotFoundError);
      expect(() => {
        areaService.getAreaById(db, child.id);
      }).toThrow(NotFoundError);
    });
  });
});
