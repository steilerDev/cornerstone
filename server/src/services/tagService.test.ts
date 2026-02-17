import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as tagService from './tagService.js';
import { NotFoundError, ValidationError, ConflictError } from '../errors/AppError.js';
import type { CreateTagRequest, UpdateTagRequest } from '@cornerstone/shared';

describe('Tag Service', () => {
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
   * Helper: Create a test tag directly in the database
   */
  function createTestTag(name: string, color: string | null = '#3B82F6') {
    const tagId = `tag-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();
    db.insert(schema.tags)
      .values({
        id: tagId,
        name,
        color,
        createdAt: now,
      })
      .run();
    return { id: tagId, name, color, createdAt: now };
  }

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('listTags()', () => {
    it('returns empty array when no tags exist (UAT-3.3-09)', () => {
      // Given: No tags in the database
      // When: Listing tags
      const result = tagService.listTags(db);

      // Then: Empty array is returned
      expect(result).toEqual([]);
    });

    it('returns all tags sorted alphabetically by name (UAT-3.3-08)', () => {
      // Given: Multiple tags with unsorted names
      createTestTag('Plumbing', '#3B82F6');
      createTestTag('Electrical', '#EF4444');
      createTestTag('Concrete', '#10B981');

      // When: Listing tags
      const result = tagService.listTags(db);

      // Then: Tags are sorted alphabetically
      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('Concrete');
      expect(result[1].name).toBe('Electrical');
      expect(result[2].name).toBe('Plumbing');
    });

    it('sorts tags case-insensitively', () => {
      // Given: Tags with mixed case names
      createTestTag('zeta', '#000000');
      createTestTag('Alpha', '#111111');
      createTestTag('BETA', '#222222');

      // When: Listing tags
      const result = tagService.listTags(db);

      // Then: Tags are sorted case-insensitively
      expect(result.map((t) => t.name)).toEqual(['Alpha', 'BETA', 'zeta']);
    });

    it('returns tags with all properties', () => {
      // Given: A tag with all properties set
      const tag = createTestTag('Test Tag', '#FF5733');

      // When: Listing tags
      const result = tagService.listTags(db);

      // Then: All properties are returned
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: tag.id,
        name: 'Test Tag',
        color: '#FF5733',
        createdAt: tag.createdAt,
      });
    });

    it('returns tags with null color', () => {
      // Given: A tag without color
      createTestTag('No Color Tag', null);

      // When: Listing tags
      const result = tagService.listTags(db);

      // Then: Color is null
      expect(result).toHaveLength(1);
      expect(result[0].color).toBeNull();
    });

    it('handles large number of tags (UAT-3.3-10)', () => {
      // Given: 100 tags
      for (let i = 0; i < 100; i++) {
        createTestTag(`Tag ${i.toString().padStart(3, '0')}`, '#3B82F6');
      }

      // When: Listing tags
      const result = tagService.listTags(db);

      // Then: All 100 tags are returned in one call
      expect(result).toHaveLength(100);
    });
  });

  describe('getTagById()', () => {
    it('returns tag when it exists', () => {
      // Given: A tag exists
      const tag = createTestTag('Electrical', '#3B82F6');

      // When: Getting tag by ID
      const result = tagService.getTagById(db, tag.id);

      // Then: Tag is returned
      expect(result).toEqual({
        id: tag.id,
        name: 'Electrical',
        color: '#3B82F6',
        createdAt: tag.createdAt,
      });
    });

    it('throws NotFoundError when tag does not exist (UAT-3.3-16)', () => {
      // Given: No tag with given ID
      // When: Getting tag by non-existent ID
      // Then: NotFoundError is thrown
      expect(() => {
        tagService.getTagById(db, 'non-existent-id');
      }).toThrow(NotFoundError);
      expect(() => {
        tagService.getTagById(db, 'non-existent-id');
      }).toThrow('Tag not found');
    });
  });

  describe('createTag()', () => {
    it('creates tag with name only (UAT-3.3-01)', () => {
      // Given: Request with only name
      const data: CreateTagRequest = {
        name: 'Electrical',
      };

      // When: Creating tag
      const result = tagService.createTag(db, data);

      // Then: Tag is created with defaults
      expect(result.id).toBeDefined();
      expect(result.name).toBe('Electrical');
      expect(result.color).toBeNull();
      expect(result.createdAt).toBeDefined();
    });

    it('creates tag with name and color (UAT-3.3-02)', () => {
      // Given: Request with name and color
      const data: CreateTagRequest = {
        name: 'Plumbing',
        color: '#3B82F6',
      };

      // When: Creating tag
      const result = tagService.createTag(db, data);

      // Then: Tag is created with color
      expect(result.id).toBeDefined();
      expect(result.name).toBe('Plumbing');
      expect(result.color).toBe('#3B82F6');
      expect(result.createdAt).toBeDefined();
    });

    it('trims leading and trailing spaces from name (UAT-3.3-39)', () => {
      // Given: Name with spaces
      const data: CreateTagRequest = {
        name: '  Electrical  ',
      };

      // When: Creating tag
      const result = tagService.createTag(db, data);

      // Then: Name is trimmed
      expect(result.name).toBe('Electrical');
    });

    it('throws ValidationError for empty name (UAT-3.3-03)', () => {
      // Given: Request with empty name
      const data: CreateTagRequest = {
        name: '',
      };

      // When: Creating tag
      // Then: ValidationError is thrown
      expect(() => {
        tagService.createTag(db, data);
      }).toThrow(ValidationError);
      expect(() => {
        tagService.createTag(db, data);
      }).toThrow('Tag name must be between 1 and 50 characters');
    });

    it('throws ValidationError for whitespace-only name', () => {
      // Given: Request with only whitespace
      const data: CreateTagRequest = {
        name: '   ',
      };

      // When: Creating tag
      // Then: ValidationError is thrown
      expect(() => {
        tagService.createTag(db, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for name exceeding 50 characters (UAT-3.3-04)', () => {
      // Given: Request with name > 50 chars
      const data: CreateTagRequest = {
        name: 'a'.repeat(51),
      };

      // When: Creating tag
      // Then: ValidationError is thrown
      expect(() => {
        tagService.createTag(db, data);
      }).toThrow(ValidationError);
      expect(() => {
        tagService.createTag(db, data);
      }).toThrow('Tag name must be between 1 and 50 characters');
    });

    it('accepts name with exactly 50 characters', () => {
      // Given: Request with exactly 50 chars
      const name = 'a'.repeat(50);
      const data: CreateTagRequest = {
        name,
      };

      // When: Creating tag
      const result = tagService.createTag(db, data);

      // Then: Tag is created
      expect(result.name).toBe(name);
    });

    it('throws ValidationError for invalid color format - no hash (UAT-3.3-05)', () => {
      // Given: Request with color missing hash
      const data: CreateTagRequest = {
        name: 'Test',
        color: 'FF5733',
      };

      // When: Creating tag
      // Then: ValidationError is thrown
      expect(() => {
        tagService.createTag(db, data);
      }).toThrow(ValidationError);
      expect(() => {
        tagService.createTag(db, data);
      }).toThrow('Color must be a hex color code in format #RRGGBB');
    });

    it('throws ValidationError for invalid color format - word (UAT-3.3-05)', () => {
      // Given: Request with color as word
      const data: CreateTagRequest = {
        name: 'Test',
        color: 'blue',
      };

      // When: Creating tag
      // Then: ValidationError is thrown
      expect(() => {
        tagService.createTag(db, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for short hex code (UAT-3.3-41)', () => {
      // Given: Request with 3-digit hex
      const data: CreateTagRequest = {
        name: 'Test',
        color: '#FFF',
      };

      // When: Creating tag
      // Then: ValidationError is thrown
      expect(() => {
        tagService.createTag(db, data);
      }).toThrow(ValidationError);
    });

    it('accepts uppercase hex color (UAT-3.3-40)', () => {
      // Given: Request with uppercase hex
      const data: CreateTagRequest = {
        name: 'Test',
        color: '#FF5733',
      };

      // When: Creating tag
      const result = tagService.createTag(db, data);

      // Then: Tag is created
      expect(result.color).toBe('#FF5733');
    });

    it('accepts lowercase hex color (UAT-3.3-40)', () => {
      // Given: Request with lowercase hex
      const data: CreateTagRequest = {
        name: 'Test',
        color: '#ff5733',
      };

      // When: Creating tag
      const result = tagService.createTag(db, data);

      // Then: Tag is created
      expect(result.color).toBe('#ff5733');
    });

    it('accepts mixed case hex color', () => {
      // Given: Request with mixed case hex
      const data: CreateTagRequest = {
        name: 'Test',
        color: '#Ff5733',
      };

      // When: Creating tag
      const result = tagService.createTag(db, data);

      // Then: Tag is created
      expect(result.color).toBe('#Ff5733');
    });

    it('throws ConflictError for duplicate name (UAT-3.3-06)', () => {
      // Given: Existing tag named "Electrical"
      createTestTag('Electrical', '#3B82F6');

      // When: Creating tag with same name
      const data: CreateTagRequest = {
        name: 'Electrical',
      };

      // Then: ConflictError is thrown
      expect(() => {
        tagService.createTag(db, data);
      }).toThrow(ConflictError);
      expect(() => {
        tagService.createTag(db, data);
      }).toThrow('A tag with this name already exists');
    });

    it('throws ConflictError for duplicate name case-insensitive (UAT-3.3-06)', () => {
      // Given: Existing tag named "Electrical"
      createTestTag('Electrical', '#3B82F6');

      // When: Creating tag with lowercase version
      const data: CreateTagRequest = {
        name: 'electrical',
      };

      // Then: ConflictError is thrown
      expect(() => {
        tagService.createTag(db, data);
      }).toThrow(ConflictError);
    });

    it('throws ConflictError for duplicate name with different case and spaces', () => {
      // Given: Existing tag
      createTestTag('Electrical', '#3B82F6');

      // When: Creating tag with spaces and different case
      const data: CreateTagRequest = {
        name: '  ELECTRICAL  ',
      };

      // Then: ConflictError is thrown (trimmed before check)
      expect(() => {
        tagService.createTag(db, data);
      }).toThrow(ConflictError);
    });
  });

  describe('updateTag()', () => {
    it('updates tag name (UAT-3.3-12)', () => {
      // Given: Existing tag
      const tag = createTestTag('Electrical', '#3B82F6');

      // When: Updating name
      const data: UpdateTagRequest = {
        name: 'Electrical Work',
      };
      const result = tagService.updateTag(db, tag.id, data);

      // Then: Name is updated
      expect(result.id).toBe(tag.id);
      expect(result.name).toBe('Electrical Work');
      expect(result.color).toBe('#3B82F6'); // Color unchanged
      expect(result.createdAt).toBe(tag.createdAt);
    });

    it('updates tag color (UAT-3.3-13)', () => {
      // Given: Existing tag with color
      const tag = createTestTag('Electrical', '#FF0000');

      // When: Updating color
      const data: UpdateTagRequest = {
        color: '#00FF00',
      };
      const result = tagService.updateTag(db, tag.id, data);

      // Then: Color is updated
      expect(result.id).toBe(tag.id);
      expect(result.name).toBe('Electrical'); // Name unchanged
      expect(result.color).toBe('#00FF00');
    });

    it('removes color by setting to null (UAT-3.3-14)', () => {
      // Given: Existing tag with color
      const tag = createTestTag('Electrical', '#FF0000');

      // When: Setting color to null
      const data: UpdateTagRequest = {
        color: null,
      };
      const result = tagService.updateTag(db, tag.id, data);

      // Then: Color is removed
      expect(result.color).toBeNull();
    });

    it('updates both name and color', () => {
      // Given: Existing tag
      const tag = createTestTag('Electrical', '#FF0000');

      // When: Updating both fields
      const data: UpdateTagRequest = {
        name: 'Electrical Systems',
        color: '#00FF00',
      };
      const result = tagService.updateTag(db, tag.id, data);

      // Then: Both are updated
      expect(result.name).toBe('Electrical Systems');
      expect(result.color).toBe('#00FF00');
    });

    it('trims name before update', () => {
      // Given: Existing tag
      const tag = createTestTag('Electrical', '#3B82F6');

      // When: Updating with spaces
      const data: UpdateTagRequest = {
        name: '  Electrical Work  ',
      };
      const result = tagService.updateTag(db, tag.id, data);

      // Then: Name is trimmed
      expect(result.name).toBe('Electrical Work');
    });

    it('allows updating tag name to same value (UAT-3.3-42)', () => {
      // Given: Existing tag
      const tag = createTestTag('Electrical', '#3B82F6');

      // When: Updating to same name
      const data: UpdateTagRequest = {
        name: 'Electrical',
      };
      const result = tagService.updateTag(db, tag.id, data);

      // Then: Update succeeds (no conflict)
      expect(result.name).toBe('Electrical');
    });

    it('throws NotFoundError for non-existent tag (UAT-3.3-16)', () => {
      // Given: No tag with given ID
      // When: Updating non-existent tag
      const data: UpdateTagRequest = {
        name: 'Test',
      };

      // Then: NotFoundError is thrown
      expect(() => {
        tagService.updateTag(db, 'non-existent-id', data);
      }).toThrow(NotFoundError);
      expect(() => {
        tagService.updateTag(db, 'non-existent-id', data);
      }).toThrow('Tag not found');
    });

    it('throws ValidationError when no fields provided', () => {
      // Given: Existing tag
      const tag = createTestTag('Electrical', '#3B82F6');

      // When: Updating with empty data
      const data: UpdateTagRequest = {};

      // Then: ValidationError is thrown
      expect(() => {
        tagService.updateTag(db, tag.id, data);
      }).toThrow(ValidationError);
      expect(() => {
        tagService.updateTag(db, tag.id, data);
      }).toThrow('At least one field must be provided');
    });

    it('throws ValidationError for empty name', () => {
      // Given: Existing tag
      const tag = createTestTag('Electrical', '#3B82F6');

      // When: Updating with empty name
      const data: UpdateTagRequest = {
        name: '',
      };

      // Then: ValidationError is thrown
      expect(() => {
        tagService.updateTag(db, tag.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for name exceeding 50 characters', () => {
      // Given: Existing tag
      const tag = createTestTag('Electrical', '#3B82F6');

      // When: Updating with long name
      const data: UpdateTagRequest = {
        name: 'a'.repeat(51),
      };

      // Then: ValidationError is thrown
      expect(() => {
        tagService.updateTag(db, tag.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for invalid color format', () => {
      // Given: Existing tag
      const tag = createTestTag('Electrical', '#3B82F6');

      // When: Updating with invalid color
      const data: UpdateTagRequest = {
        color: 'blue',
      };

      // Then: ValidationError is thrown
      expect(() => {
        tagService.updateTag(db, tag.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ConflictError when name conflicts with another tag (UAT-3.3-15)', () => {
      // Given: Two existing tags
      const tag1 = createTestTag('Electrical', '#3B82F6');
      createTestTag('Plumbing', '#EF4444');

      // When: Updating tag1 name to match tag2
      const data: UpdateTagRequest = {
        name: 'Plumbing',
      };

      // Then: ConflictError is thrown
      expect(() => {
        tagService.updateTag(db, tag1.id, data);
      }).toThrow(ConflictError);
      expect(() => {
        tagService.updateTag(db, tag1.id, data);
      }).toThrow('A tag with this name already exists');
    });

    it('throws ConflictError for case-insensitive name conflict', () => {
      // Given: Two existing tags
      const tag1 = createTestTag('Electrical', '#3B82F6');
      createTestTag('Plumbing', '#EF4444');

      // When: Updating with different case
      const data: UpdateTagRequest = {
        name: 'PLUMBING',
      };

      // Then: ConflictError is thrown
      expect(() => {
        tagService.updateTag(db, tag1.id, data);
      }).toThrow(ConflictError);
    });
  });

  describe('deleteTag()', () => {
    it('deletes tag successfully', () => {
      // Given: Existing tag
      const tag = createTestTag('Electrical', '#3B82F6');

      // When: Deleting tag
      tagService.deleteTag(db, tag.id);

      // Then: Tag is deleted
      expect(() => {
        tagService.getTagById(db, tag.id);
      }).toThrow(NotFoundError);
    });

    it('cascades delete to work_item_tags (UAT-3.3-18)', () => {
      // Given: Tag associated with work items
      const tag = createTestTag('Electrical', '#3B82F6');

      // Create work item and associate tag
      const workItemId = `wi-${Date.now()}`;
      const now = new Date().toISOString();
      db.insert(schema.workItems)
        .values({
          id: workItemId,
          title: 'Test work item',
          status: 'not_started',
          createdAt: now,
          updatedAt: now,
        })
        .run();

      db.insert(schema.workItemTags)
        .values({
          workItemId,
          tagId: tag.id,
        })
        .run();

      // Verify association exists
      const associations = db
        .select()
        .from(schema.workItemTags)
        .where(eq(schema.workItemTags.tagId, tag.id))
        .all();
      expect(associations).toHaveLength(1);

      // When: Deleting tag
      tagService.deleteTag(db, tag.id);

      // Then: Tag is deleted and association is removed
      expect(() => {
        tagService.getTagById(db, tag.id);
      }).toThrow(NotFoundError);

      const afterAssociations = db.select().from(schema.workItemTags).all();
      expect(afterAssociations).toHaveLength(0);

      // Work item still exists
      const workItem = db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, workItemId))
        .get();
      expect(workItem).toBeDefined();
    });

    it('throws NotFoundError for non-existent tag (UAT-3.3-19)', () => {
      // Given: No tag with given ID
      // When: Deleting non-existent tag
      // Then: NotFoundError is thrown
      expect(() => {
        tagService.deleteTag(db, 'non-existent-id');
      }).toThrow(NotFoundError);
      expect(() => {
        tagService.deleteTag(db, 'non-existent-id');
      }).toThrow('Tag not found');
    });
  });
});
