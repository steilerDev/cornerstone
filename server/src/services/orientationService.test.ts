/**
 * Unit tests for orientationService.ts
 *
 * Story #1674: Mobile photo upload optimization — Orientations feature.
 *
 * Tests all exported service functions:
 *   - listOrientations
 *   - getOrientationById
 *   - createOrientation
 *   - updateOrientation
 *   - deleteOrientation
 *
 * Strategy:
 *   - Uses buildApp() to get a fully-migrated DB (avoids import.meta.url issue in runMigrations)
 *   - Closes app after each test; operates on app.db directly
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';
import * as schema from '../db/schema.js';
import { NotFoundError, ValidationError, ConflictError } from '../errors/AppError.js';
import {
  listOrientations,
  getOrientationById,
  createOrientation,
  updateOrientation,
  deleteOrientation,
} from './orientationService.js';

describe('orientationService', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-orientation-svc-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';

    app = await buildApp();
    // Ensure clean state
    app.db.delete(schema.orientations).run();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }

    process.env = originalEnv;

    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ─── listOrientations ──────────────────────────────────────────────────────

  describe('listOrientations()', () => {
    it('returns empty array when no orientations exist', () => {
      const result = listOrientations(app.db);
      expect(result).toEqual([]);
    });

    it('returns sorted list by sort_order ascending then name ascending', () => {
      const now = new Date().toISOString();
      app.db
        .insert(schema.orientations)
        .values({ id: 'o1', name: 'West', sortOrder: 2, createdAt: now, updatedAt: now })
        .run();
      app.db
        .insert(schema.orientations)
        .values({ id: 'o2', name: 'South', sortOrder: 1, createdAt: now, updatedAt: now })
        .run();
      app.db
        .insert(schema.orientations)
        .values({ id: 'o3', name: 'North', sortOrder: 1, createdAt: now, updatedAt: now })
        .run();

      const result = listOrientations(app.db);
      expect(result).toHaveLength(3);
      // sortOrder 1: North < South (alphabetical); then sortOrder 2: West
      expect(result[0]!.name).toBe('North');
      expect(result[1]!.name).toBe('South');
      expect(result[2]!.name).toBe('West');
    });

    it('filters by search string (case-insensitive)', () => {
      const now = new Date().toISOString();
      app.db
        .insert(schema.orientations)
        .values({ id: 'o1', name: 'South', sortOrder: 0, createdAt: now, updatedAt: now })
        .run();
      app.db
        .insert(schema.orientations)
        .values({ id: 'o2', name: 'South-West', sortOrder: 0, createdAt: now, updatedAt: now })
        .run();
      app.db
        .insert(schema.orientations)
        .values({ id: 'o3', name: 'North', sortOrder: 0, createdAt: now, updatedAt: now })
        .run();

      const result = listOrientations(app.db, 'sou');
      expect(result).toHaveLength(2);
      expect(result.every((o) => o.name.toLowerCase().includes('sou'))).toBe(true);
    });

    it('returns empty array when search matches nothing', () => {
      const now = new Date().toISOString();
      app.db
        .insert(schema.orientations)
        .values({ id: 'o1', name: 'South', sortOrder: 0, createdAt: now, updatedAt: now })
        .run();

      const result = listOrientations(app.db, 'nonexistent');
      expect(result).toEqual([]);
    });

    it('search matches description-only (name does not match, description does)', () => {
      const now = new Date().toISOString();
      app.db
        .insert(schema.orientations)
        .values({
          id: 'o-desc-1',
          name: 'North',
          description: 'Facing garden side',
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      app.db
        .insert(schema.orientations)
        .values({
          id: 'o-desc-2',
          name: 'South',
          description: 'Facing street side',
          sortOrder: 1,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      // 'garden' matches description of 'North' only, not name
      const result = listOrientations(app.db, 'garden');
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('North');
      expect(result[0]!.description).toBe('Facing garden side');
    });

    it('search matching both name and description returns single row without duplicates', () => {
      const now = new Date().toISOString();
      // Insert one orientation where 'south' matches both name AND description
      app.db
        .insert(schema.orientations)
        .values({
          id: 'o-both-1',
          name: 'South',
          description: 'South-facing terrace',
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const result = listOrientations(app.db, 'south');
      // Must return exactly 1 row, not 2 (no duplication from OR condition)
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('South');
    });

    it('null description is safe — orientation with null description excluded from description-only match', () => {
      const now = new Date().toISOString();
      // One orientation with null description, one with a matching description
      app.db
        .insert(schema.orientations)
        .values({
          id: 'o-null-desc',
          name: 'West',
          description: null,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      app.db
        .insert(schema.orientations)
        .values({
          id: 'o-has-desc',
          name: 'East',
          description: 'Terrace facing east',
          sortOrder: 1,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      // 'terrace' matches only o-has-desc's description; o-null-desc has null description
      const result = listOrientations(app.db, 'terrace');
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('East');
    });

    it('name-only match still works (regression guard for OR condition)', () => {
      const now = new Date().toISOString();
      app.db
        .insert(schema.orientations)
        .values({
          id: 'o-name-only',
          name: 'Southwest',
          description: 'Main compass bearing',
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      app.db
        .insert(schema.orientations)
        .values({
          id: 'o-no-match',
          name: 'Northeast',
          description: 'Another bearing',
          sortOrder: 1,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      // 'southwest' matches name of o-name-only only (not o-no-match's name or description)
      const result = listOrientations(app.db, 'southwest');
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Southwest');
    });

    it('description search is case-insensitive', () => {
      const now = new Date().toISOString();
      app.db
        .insert(schema.orientations)
        .values({
          id: 'o-ci-desc',
          name: 'North',
          description: 'Mountain View',
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      expect(listOrientations(app.db, 'MOUNTAIN')).toHaveLength(1);
      expect(listOrientations(app.db, 'mountain')).toHaveLength(1);
      expect(listOrientations(app.db, 'Mountain')).toHaveLength(1);
    });
  });

  // ─── getOrientationById ────────────────────────────────────────────────────

  describe('getOrientationById()', () => {
    it('returns orientation for valid ID', () => {
      const now = new Date().toISOString();
      app.db
        .insert(schema.orientations)
        .values({ id: 'o-get-1', name: 'East', sortOrder: 3, createdAt: now, updatedAt: now })
        .run();

      const result = getOrientationById(app.db, 'o-get-1');
      expect(result.id).toBe('o-get-1');
      expect(result.name).toBe('East');
      expect(result.sortOrder).toBe(3);
    });

    it('throws NotFoundError for unknown ID', () => {
      expect(() => getOrientationById(app.db, 'no-such-id')).toThrow(NotFoundError);
    });
  });

  // ─── createOrientation ─────────────────────────────────────────────────────

  describe('createOrientation()', () => {
    it('creates orientation with valid data and returns all fields', () => {
      const result = createOrientation(app.db, {
        name: 'South',
        description: 'Street-facing',
        sortOrder: 1,
      });

      expect(result.id).toBeDefined();
      expect(result.name).toBe('South');
      expect(result.description).toBe('Street-facing');
      expect(result.sortOrder).toBe(1);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('creates orientation with null description when not provided', () => {
      const result = createOrientation(app.db, { name: 'North' });

      expect(result.description).toBeNull();
    });

    it('creates orientation with null description when explicitly null', () => {
      const result = createOrientation(app.db, { name: 'North', description: null });

      expect(result.description).toBeNull();
    });

    it('defaults sortOrder to 0 when not provided', () => {
      const result = createOrientation(app.db, { name: 'South' });

      expect(result.sortOrder).toBe(0);
    });

    it('trims whitespace from name', () => {
      const result = createOrientation(app.db, { name: '  South  ' });

      expect(result.name).toBe('South');
    });

    it('throws ConflictError for duplicate name (same case)', () => {
      createOrientation(app.db, { name: 'South' });

      expect(() => createOrientation(app.db, { name: 'South' })).toThrow(ConflictError);
    });

    it('throws ConflictError for duplicate name (different case)', () => {
      createOrientation(app.db, { name: 'South' });

      expect(() => createOrientation(app.db, { name: 'SOUTH' })).toThrow(ConflictError);
    });

    it('throws ValidationError for empty string name', () => {
      expect(() => createOrientation(app.db, { name: '' })).toThrow(ValidationError);
    });

    it('throws ValidationError for name exceeding 200 characters', () => {
      const longName = 'A'.repeat(201);
      expect(() => createOrientation(app.db, { name: longName })).toThrow(ValidationError);
    });

    it('throws ValidationError for description exceeding 2000 characters', () => {
      const longDesc = 'A'.repeat(2001);
      expect(() => createOrientation(app.db, { name: 'South', description: longDesc })).toThrow(
        ValidationError,
      );
    });

    it('throws ValidationError for negative sortOrder', () => {
      expect(() => createOrientation(app.db, { name: 'South', sortOrder: -1 })).toThrow(
        ValidationError,
      );
    });

    it('accepts sortOrder of 0', () => {
      const result = createOrientation(app.db, { name: 'South', sortOrder: 0 });
      expect(result.sortOrder).toBe(0);
    });
  });

  // ─── updateOrientation ─────────────────────────────────────────────────────

  describe('updateOrientation()', () => {
    it('updates name and returns updated orientation', () => {
      const now = new Date().toISOString();
      app.db
        .insert(schema.orientations)
        .values({ id: 'o-upd-1', name: 'South', sortOrder: 0, createdAt: now, updatedAt: now })
        .run();

      const result = updateOrientation(app.db, 'o-upd-1', { name: 'North' });
      expect(result.name).toBe('North');
      expect(result.id).toBe('o-upd-1');
    });

    it('updates description only (partial update)', () => {
      const now = new Date().toISOString();
      app.db
        .insert(schema.orientations)
        .values({ id: 'o-upd-2', name: 'East', sortOrder: 0, createdAt: now, updatedAt: now })
        .run();

      const result = updateOrientation(app.db, 'o-upd-2', { description: 'Garden-facing' });
      expect(result.description).toBe('Garden-facing');
      expect(result.name).toBe('East'); // Unchanged
    });

    it('updates sortOrder only (partial update)', () => {
      const now = new Date().toISOString();
      app.db
        .insert(schema.orientations)
        .values({ id: 'o-upd-3', name: 'West', sortOrder: 0, createdAt: now, updatedAt: now })
        .run();

      const result = updateOrientation(app.db, 'o-upd-3', { sortOrder: 5 });
      expect(result.sortOrder).toBe(5);
      expect(result.name).toBe('West'); // Unchanged
    });

    it('throws ConflictError when new name conflicts with another orientation', () => {
      const now = new Date().toISOString();
      app.db
        .insert(schema.orientations)
        .values({ id: 'o-c1', name: 'South', sortOrder: 0, createdAt: now, updatedAt: now })
        .run();
      app.db
        .insert(schema.orientations)
        .values({ id: 'o-c2', name: 'North', sortOrder: 0, createdAt: now, updatedAt: now })
        .run();

      expect(() => updateOrientation(app.db, 'o-c2', { name: 'South' })).toThrow(ConflictError);
    });

    it('does NOT throw when name is updated to the same value (no conflict with self)', () => {
      const now = new Date().toISOString();
      app.db
        .insert(schema.orientations)
        .values({ id: 'o-self', name: 'South', sortOrder: 0, createdAt: now, updatedAt: now })
        .run();

      expect(() => updateOrientation(app.db, 'o-self', { name: 'South' })).not.toThrow();
    });

    it('throws ValidationError when no fields are provided', () => {
      const now = new Date().toISOString();
      app.db
        .insert(schema.orientations)
        .values({ id: 'o-empty', name: 'East', sortOrder: 0, createdAt: now, updatedAt: now })
        .run();

      expect(() => updateOrientation(app.db, 'o-empty', {})).toThrow(ValidationError);
    });

    it('throws NotFoundError for unknown orientation ID', () => {
      expect(() => updateOrientation(app.db, 'no-such-id', { name: 'South' })).toThrow(
        NotFoundError,
      );
    });

    it('throws ValidationError when name is empty string', () => {
      const now = new Date().toISOString();
      app.db
        .insert(schema.orientations)
        .values({ id: 'o-empty-name', name: 'West', sortOrder: 0, createdAt: now, updatedAt: now })
        .run();

      expect(() => updateOrientation(app.db, 'o-empty-name', { name: '' })).toThrow(
        ValidationError,
      );
    });

    it('throws ValidationError when name exceeds 200 characters', () => {
      const now = new Date().toISOString();
      app.db
        .insert(schema.orientations)
        .values({ id: 'o-long-name', name: 'West', sortOrder: 0, createdAt: now, updatedAt: now })
        .run();

      const longName = 'A'.repeat(201);
      expect(() => updateOrientation(app.db, 'o-long-name', { name: longName })).toThrow(
        ValidationError,
      );
    });

    it('throws ValidationError when description exceeds 2000 characters', () => {
      const now = new Date().toISOString();
      app.db
        .insert(schema.orientations)
        .values({ id: 'o-long-desc', name: 'West', sortOrder: 0, createdAt: now, updatedAt: now })
        .run();

      const longDesc = 'D'.repeat(2001);
      expect(() => updateOrientation(app.db, 'o-long-desc', { description: longDesc })).toThrow(
        ValidationError,
      );
    });

    it('throws ValidationError when sortOrder is negative', () => {
      const now = new Date().toISOString();
      app.db
        .insert(schema.orientations)
        .values({ id: 'o-neg-sort', name: 'West', sortOrder: 0, createdAt: now, updatedAt: now })
        .run();

      expect(() => updateOrientation(app.db, 'o-neg-sort', { sortOrder: -1 })).toThrow(
        ValidationError,
      );
    });
  });

  // ─── deleteOrientation ─────────────────────────────────────────────────────

  describe('deleteOrientation()', () => {
    it('deletes orientation successfully', () => {
      const now = new Date().toISOString();
      app.db
        .insert(schema.orientations)
        .values({ id: 'o-del-1', name: 'South', sortOrder: 0, createdAt: now, updatedAt: now })
        .run();

      expect(() => deleteOrientation(app.db, 'o-del-1')).not.toThrow();

      // Verify it's gone
      const row = app.db
        .select()
        .from(schema.orientations)
        .where(eq(schema.orientations.id, 'o-del-1'))
        .get();
      expect(row).toBeUndefined();
    });

    it('sets photo orientationId to null when orientation is deleted (SET NULL FK)', () => {
      const now = new Date().toISOString();

      // Insert an orientation
      app.db
        .insert(schema.orientations)
        .values({ id: 'o-del-fk', name: 'East', sortOrder: 0, createdAt: now, updatedAt: now })
        .run();

      // Insert a photo referencing the orientation (no createdBy FK needed)
      app.db
        .insert(schema.photos)
        .values({
          id: 'photo-uuid-1234',
          entityType: 'work_item',
          entityId: 'wi-123',
          filename: 'original.jpg',
          originalFilename: 'test.jpg',
          mimeType: 'image/jpeg',
          fileSize: 1024,
          width: 800,
          height: 600,
          takenAt: null,
          caption: null,
          areaId: null,
          orientationId: 'o-del-fk',
          sortOrder: 0,
          createdBy: null,
          createdAt: now,
          updatedAt: now,
          annotatedAt: null,
        })
        .run();

      // Delete orientation
      deleteOrientation(app.db, 'o-del-fk');

      // Orientation should be gone
      const orientationRow = app.db
        .select()
        .from(schema.orientations)
        .where(eq(schema.orientations.id, 'o-del-fk'))
        .get();
      expect(orientationRow).toBeUndefined();

      // Photo should still exist but with orientationId = null (SET NULL FK)
      const updatedPhoto = app.db
        .select()
        .from(schema.photos)
        .where(eq(schema.photos.id, 'photo-uuid-1234'))
        .get();
      expect(updatedPhoto).toBeDefined();
      expect(updatedPhoto?.orientationId).toBeNull();
    });

    it('throws NotFoundError for unknown orientation ID', () => {
      expect(() => deleteOrientation(app.db, 'no-such-id')).toThrow(NotFoundError);
    });
  });
});
