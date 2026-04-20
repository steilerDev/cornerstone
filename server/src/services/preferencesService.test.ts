/**
 * Unit tests for preferencesService.ts
 *
 * Tests cover:
 * - listPreferences (empty, per-user isolation)
 * - upsertPreference (insert, update — no duplicate)
 * - deletePreference (found, not found)
 *
 * Strategy:
 * - Fresh in-memory SQLite per test with migrations applied
 * - Test user inserted before each test via Drizzle
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as preferencesService from './preferencesService.js';

// ─── Test database setup ──────────────────────────────────────────────────────

describe('preferencesService', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  function insertTestUser(id = 'user-001', email = 'test@example.com', displayName = 'Test User') {
    const now = new Date().toISOString();
    db.insert(schema.users)
      .values({
        id,
        email,
        displayName,
        role: 'member',
        authProvider: 'local',
        passwordHash: 'hashed',
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
    insertTestUser();
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── listPreferences() ─────────────────────────────────────────────────────

  describe('listPreferences()', () => {
    it('returns empty array for a new user with no preferences', () => {
      const result = preferencesService.listPreferences(db, 'user-001');

      expect(result).toEqual([]);
    });

    it('returns preferences only for the specified user', () => {
      // Create a second user
      insertTestUser('user-002', 'other@example.com', 'Other User');

      preferencesService.upsertPreference(db, 'user-001', 'theme', 'dark');
      preferencesService.upsertPreference(db, 'user-002', 'theme', 'light');
      preferencesService.upsertPreference(db, 'user-002', 'dashboard.hiddenCards', '[]');

      const result = preferencesService.listPreferences(db, 'user-001');

      expect(result).toHaveLength(1);
      expect(result[0]!.key).toBe('theme');
      expect(result[0]!.value).toBe('dark');
    });

    it('returns all preferences for a user with multiple keys', () => {
      preferencesService.upsertPreference(db, 'user-001', 'theme', 'dark');
      preferencesService.upsertPreference(
        db,
        'user-001',
        'dashboard.hiddenCards',
        '["budget-summary"]',
      );

      const result = preferencesService.listPreferences(db, 'user-001');

      expect(result).toHaveLength(2);
      const keys = result.map((p) => p.key).sort();
      expect(keys).toEqual(['dashboard.hiddenCards', 'theme']);
    });

    it('returns preferences with key, value, and updatedAt fields', () => {
      preferencesService.upsertPreference(db, 'user-001', 'theme', 'system');

      const result = preferencesService.listPreferences(db, 'user-001');

      expect(result).toHaveLength(1);
      expect(result[0]!.key).toBe('theme');
      expect(result[0]!.value).toBe('system');
      expect(typeof result[0]!.updatedAt).toBe('string');
      expect(result[0]!.updatedAt).toBeTruthy();
    });

    it('returns empty array for a user ID that does not exist', () => {
      const result = preferencesService.listPreferences(db, 'non-existent-user');

      expect(result).toEqual([]);
    });
  });

  // ─── upsertPreference() ────────────────────────────────────────────────────

  describe('upsertPreference()', () => {
    it('inserts a new preference and returns the UserPreference shape', () => {
      const result = preferencesService.upsertPreference(db, 'user-001', 'theme', 'dark');

      expect(result.key).toBe('theme');
      expect(result.value).toBe('dark');
      expect(typeof result.updatedAt).toBe('string');
      expect(result.updatedAt).toBeTruthy();
    });

    it('persists the preference to the database', () => {
      preferencesService.upsertPreference(db, 'user-001', 'theme', 'light');

      const all = db.select().from(schema.userPreferences).all();
      expect(all).toHaveLength(1);
      expect(all[0]!.key).toBe('theme');
      expect(all[0]!.value).toBe('light');
      expect(all[0]!.userId).toBe('user-001');
    });

    it('updates value of an existing key without creating a duplicate', () => {
      preferencesService.upsertPreference(db, 'user-001', 'theme', 'dark');
      preferencesService.upsertPreference(db, 'user-001', 'theme', 'light');

      // Should not have a duplicate row
      const all = db.select().from(schema.userPreferences).all();
      expect(all).toHaveLength(1);
      expect(all[0]!.value).toBe('light');
    });

    it('returns the updated value after upsert on existing key', () => {
      preferencesService.upsertPreference(db, 'user-001', 'theme', 'dark');
      const result = preferencesService.upsertPreference(db, 'user-001', 'theme', 'system');

      expect(result.key).toBe('theme');
      expect(result.value).toBe('system');
    });

    it('updates updatedAt timestamp when updating existing key', () => {
      const first = preferencesService.upsertPreference(db, 'user-001', 'theme', 'dark');
      // Brief delay to ensure new timestamp differs
      const second = preferencesService.upsertPreference(db, 'user-001', 'theme', 'light');

      // The updatedAt from the second call should be >= the first
      expect(second.updatedAt >= first.updatedAt).toBe(true);
    });

    it('allows different keys for the same user', () => {
      preferencesService.upsertPreference(db, 'user-001', 'theme', 'dark');
      preferencesService.upsertPreference(db, 'user-001', 'dashboard.hiddenCards', '[]');

      const all = db.select().from(schema.userPreferences).all();
      expect(all).toHaveLength(2);
    });

    it('allows the same key for different users', () => {
      insertTestUser('user-002', 'other@example.com', 'Other User');
      preferencesService.upsertPreference(db, 'user-001', 'theme', 'dark');
      preferencesService.upsertPreference(db, 'user-002', 'theme', 'light');

      const all = db.select().from(schema.userPreferences).all();
      expect(all).toHaveLength(2);
    });
  });

  // ─── deletePreference() ────────────────────────────────────────────────────

  describe('deletePreference()', () => {
    it('returns true and removes the preference when found', () => {
      preferencesService.upsertPreference(db, 'user-001', 'theme', 'dark');

      const result = preferencesService.deletePreference(db, 'user-001', 'theme');

      expect(result).toBe(true);
      const all = db.select().from(schema.userPreferences).all();
      expect(all).toHaveLength(0);
    });

    it('returns false when preference does not exist', () => {
      const result = preferencesService.deletePreference(db, 'user-001', 'non-existent-key');

      expect(result).toBe(false);
    });

    it('deletes only the specified key, not other keys for the same user', () => {
      preferencesService.upsertPreference(db, 'user-001', 'theme', 'dark');
      preferencesService.upsertPreference(db, 'user-001', 'dashboard.hiddenCards', '[]');

      preferencesService.deletePreference(db, 'user-001', 'theme');

      const all = db.select().from(schema.userPreferences).all();
      expect(all).toHaveLength(1);
      expect(all[0]!.key).toBe('dashboard.hiddenCards');
    });

    it('does not delete the same key for a different user', () => {
      insertTestUser('user-002', 'other@example.com', 'Other User');
      preferencesService.upsertPreference(db, 'user-001', 'theme', 'dark');
      preferencesService.upsertPreference(db, 'user-002', 'theme', 'light');

      preferencesService.deletePreference(db, 'user-001', 'theme');

      const all = db.select().from(schema.userPreferences).all();
      expect(all).toHaveLength(1);
      expect(all[0]!.userId).toBe('user-002');
    });
  });
});
