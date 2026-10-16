/**
 * Unit tests for appSettingsService.ts
 *
 * Tests cover:
 * - getHouseholdSettings (empty table, after writes, partial writes)
 * - updateHouseholdSettings (partial update, null clearing, validation errors, persistence)
 *
 * Strategy:
 * - Fresh in-memory SQLite per test with migrations applied
 *
 * Story: #1877 Source contact fields, household sender setting & document attachment typing
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as appSettingsService from './appSettingsService.js';
import { ValidationError } from '../errors/AppError.js';

describe('appSettingsService', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── getHouseholdSettings() ────────────────────────────────────────────────

  describe('getHouseholdSettings()', () => {
    it('returns both fields null on an empty app_settings table', () => {
      const result = appSettingsService.getHouseholdSettings(db);

      expect(result).toEqual({
        householdName: null,
        householdAddress: null,
        entriesLanguage: 'en',
      });
    });

    it('returns the persisted householdName after an update, address stays null', () => {
      appSettingsService.updateHouseholdSettings(db, { householdName: 'The Smith Family' });

      const result = appSettingsService.getHouseholdSettings(db);

      expect(result.householdName).toBe('The Smith Family');
      expect(result.householdAddress).toBeNull();
    });

    it('returns both fields after both have been set', () => {
      appSettingsService.updateHouseholdSettings(db, {
        householdName: 'The Smith Family',
        householdAddress: '123 Main St, Springfield',
      });

      const result = appSettingsService.getHouseholdSettings(db);

      expect(result).toEqual({
        householdName: 'The Smith Family',
        householdAddress: '123 Main St, Springfield',
        entriesLanguage: 'en',
      });
    });
  });

  // ─── updateHouseholdSettings() ─────────────────────────────────────────────

  describe('updateHouseholdSettings()', () => {
    it('updates only householdName — householdAddress remains unchanged (partial update)', () => {
      appSettingsService.updateHouseholdSettings(db, {
        householdName: 'Original Name',
        householdAddress: 'Original Address',
      });

      const result = appSettingsService.updateHouseholdSettings(db, { householdName: 'New Name' });

      expect(result.householdName).toBe('New Name');
      expect(result.householdAddress).toBe('Original Address');
    });

    it('updates only householdAddress — householdName remains unchanged (partial update)', () => {
      appSettingsService.updateHouseholdSettings(db, {
        householdName: 'Original Name',
        householdAddress: 'Original Address',
      });

      const result = appSettingsService.updateHouseholdSettings(db, {
        householdAddress: 'New Address',
      });

      expect(result.householdName).toBe('Original Name');
      expect(result.householdAddress).toBe('New Address');
    });

    it('setting householdName to null clears the previously stored value', () => {
      appSettingsService.updateHouseholdSettings(db, { householdName: 'To Be Cleared' });

      const result = appSettingsService.updateHouseholdSettings(db, { householdName: null });

      expect(result.householdName).toBeNull();
    });

    it('setting householdAddress to null clears the previously stored value', () => {
      appSettingsService.updateHouseholdSettings(db, { householdAddress: 'To Be Cleared' });

      const result = appSettingsService.updateHouseholdSettings(db, { householdAddress: null });

      expect(result.householdAddress).toBeNull();
    });

    it('updates both fields at once', () => {
      const result = appSettingsService.updateHouseholdSettings(db, {
        householdName: 'Both Fields',
        householdAddress: '456 Oak Ave',
      });

      expect(result.householdName).toBe('Both Fields');
      expect(result.householdAddress).toBe('456 Oak Ave');
    });

    it('persists the update to the app_settings table as key-value rows', () => {
      appSettingsService.updateHouseholdSettings(db, {
        householdName: 'Persisted Name',
        householdAddress: 'Persisted Address',
      });

      const rows = db.select().from(schema.appSettings).all();
      expect(rows).toHaveLength(2);
      const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      expect(byKey['household_name']).toBe('Persisted Name');
      expect(byKey['household_address']).toBe('Persisted Address');
    });

    it('does not create a duplicate row when updating an existing key (upsert)', () => {
      appSettingsService.updateHouseholdSettings(db, { householdName: 'First' });
      appSettingsService.updateHouseholdSettings(db, { householdName: 'Second' });

      const rows = db
        .select()
        .from(schema.appSettings)
        .all()
        .filter((r) => r.key === 'household_name');
      expect(rows).toHaveLength(1);
      expect(rows[0]!.value).toBe('Second');
    });

    it('updates the updated_at timestamp on each write', () => {
      const rowsBefore = db.select().from(schema.appSettings).all();
      expect(rowsBefore).toHaveLength(0);

      appSettingsService.updateHouseholdSettings(db, { householdName: 'Name' });
      const [row] = db
        .select()
        .from(schema.appSettings)
        .all()
        .filter((r) => r.key === 'household_name');

      expect(row!.updatedAt).toBeTruthy();
      expect(typeof row!.updatedAt).toBe('string');
    });

    it('throws ValidationError when both fields are undefined (empty update)', () => {
      expect(() => {
        appSettingsService.updateHouseholdSettings(db, {});
      }).toThrow(ValidationError);
      expect(() => {
        appSettingsService.updateHouseholdSettings(db, {});
      }).toThrow('At least one field must be provided');
    });

    it('throws ValidationError when householdName exceeds 200 characters', () => {
      const longName = 'A'.repeat(201);

      expect(() => {
        appSettingsService.updateHouseholdSettings(db, { householdName: longName });
      }).toThrow(ValidationError);
      expect(() => {
        appSettingsService.updateHouseholdSettings(db, { householdName: longName });
      }).toThrow('Household name must be 200 characters or fewer');
    });

    it('accepts householdName at exactly 200 characters', () => {
      const name = 'A'.repeat(200);

      const result = appSettingsService.updateHouseholdSettings(db, { householdName: name });

      expect(result.householdName).toBe(name);
    });

    it('throws ValidationError when householdAddress exceeds 500 characters', () => {
      const longAddress = 'B'.repeat(501);

      expect(() => {
        appSettingsService.updateHouseholdSettings(db, { householdAddress: longAddress });
      }).toThrow(ValidationError);
      expect(() => {
        appSettingsService.updateHouseholdSettings(db, { householdAddress: longAddress });
      }).toThrow('Household address must be 500 characters or fewer');
    });

    it('accepts householdAddress at exactly 500 characters', () => {
      const address = 'B'.repeat(500);

      const result = appSettingsService.updateHouseholdSettings(db, { householdAddress: address });

      expect(result.householdAddress).toBe(address);
    });

    it('does not throw when householdName is null (null is a valid "clear" value, not subject to length validation)', () => {
      expect(() => {
        appSettingsService.updateHouseholdSettings(db, { householdName: null });
      }).not.toThrow();
    });

    it('does not validate the field being left untouched when only the other field is invalid', () => {
      // Only householdAddress is provided and invalid — householdName is untouched (undefined),
      // so its absence must not trigger an unrelated validation error.
      expect(() => {
        appSettingsService.updateHouseholdSettings(db, { householdAddress: 'C'.repeat(501) });
      }).toThrow('Household address must be 500 characters or fewer');
    });
  });
  // ─── entriesLanguage (#2215) ───────────────────────────────────────────────

  describe('entriesLanguage', () => {
    let seq = 0;

    function addUser(createdAt: string, id: string, locale?: string): string {
      seq += 1;
      db.insert(schema.users)
        .values({
          id,
          email: `user${seq}@example.com`,
          displayName: `User ${seq}`,
          role: 'member',
          authProvider: 'local',
          createdAt,
          updatedAt: createdAt,
        })
        .run();
      if (locale !== undefined) {
        db.insert(schema.userPreferences)
          .values({ userId: id, key: 'locale', value: locale, createdAt, updatedAt: createdAt })
          .run();
      }
      return id;
    }

    const settingsRows = () => db.select().from(schema.appSettings).all();

    it('is en when there are no users and nothing is stored', () => {
      expect(appSettingsService.getHouseholdSettings(db).entriesLanguage).toBe('en');
    });

    it.each(['de', 'en'])('follows the earliest user locale %s', (locale) => {
      addUser('2026-01-01T00:00:00.000Z', 'u-1', locale);

      expect(appSettingsService.getHouseholdSettings(db).entriesLanguage).toBe(locale);
    });

    it.each(['system', 'fr', ''])('falls back to en for the founder locale "%s"', (locale) => {
      addUser('2026-01-01T00:00:00.000Z', 'u-1', locale);

      expect(appSettingsService.getHouseholdSettings(db).entriesLanguage).toBe('en');
    });

    it('falls back to en when the founder has no locale preference row', () => {
      addUser('2026-01-01T00:00:00.000Z', 'u-1');

      expect(appSettingsService.getHouseholdSettings(db).entriesLanguage).toBe('en');
    });

    it('ignores a later user with de when the founder has no locale', () => {
      addUser('2026-01-01T00:00:00.000Z', 'u-1');
      addUser('2026-02-01T00:00:00.000Z', 'u-2', 'de');

      expect(appSettingsService.getHouseholdSettings(db).entriesLanguage).toBe('en');
    });

    it('picks the founder by created_at, not by insertion order', () => {
      addUser('2026-03-01T00:00:00.000Z', 'u-a', 'en');
      addUser('2026-01-01T00:00:00.000Z', 'u-z', 'de');

      expect(appSettingsService.getHouseholdSettings(db).entriesLanguage).toBe('de');
    });

    it('breaks a created_at tie by the lowest id', () => {
      addUser('2026-01-01T00:00:00.000Z', 'u-b', 'en');
      addUser('2026-01-01T00:00:00.000Z', 'u-a', 'de');

      expect(appSettingsService.getHouseholdSettings(db).entriesLanguage).toBe('de');
    });

    it('still counts a deactivated founder', () => {
      addUser('2026-01-01T00:00:00.000Z', 'u-1', 'de');
      db.update(schema.users)
        .set({ deactivatedAt: '2026-02-01T00:00:00.000Z' })
        .where(eq(schema.users.id, 'u-1'))
        .run();
      addUser('2026-03-01T00:00:00.000Z', 'u-2', 'en');

      expect(appSettingsService.getHouseholdSettings(db).entriesLanguage).toBe('de');
    });

    it('counts an admin and a member alike (any role)', () => {
      addUser('2026-01-01T00:00:00.000Z', 'u-1', 'de');
      db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, 'u-1')).run();

      expect(appSettingsService.getHouseholdSettings(db).entriesLanguage).toBe('de');
    });

    it('does not write any app_settings row when reading', () => {
      addUser('2026-01-01T00:00:00.000Z', 'u-1', 'de');
      const before = settingsRows().length;

      appSettingsService.getHouseholdSettings(db);
      appSettingsService.getHouseholdSettings(db);

      expect(settingsRows()).toHaveLength(before);
      expect(before).toBe(0);
    });

    it('changes with the founder locale while nothing is stored, but not with another user', () => {
      addUser('2026-01-01T00:00:00.000Z', 'u-1', 'en');
      addUser('2026-02-01T00:00:00.000Z', 'u-2');
      expect(appSettingsService.getHouseholdSettings(db).entriesLanguage).toBe('en');

      db.insert(schema.userPreferences)
        .values({ userId: 'u-2', key: 'locale', value: 'de', createdAt: 'x', updatedAt: 'x' })
        .run();
      expect(appSettingsService.getHouseholdSettings(db).entriesLanguage).toBe('en');

      db.update(schema.userPreferences)
        .set({ value: 'de' })
        .where(eq(schema.userPreferences.userId, 'u-1'))
        .run();
      expect(appSettingsService.getHouseholdSettings(db).entriesLanguage).toBe('de');
    });

    it('lets a stored en beat a founder de', () => {
      addUser('2026-01-01T00:00:00.000Z', 'u-1', 'de');

      appSettingsService.updateHouseholdSettings(db, { entriesLanguage: 'en' });

      expect(appSettingsService.getHouseholdSettings(db).entriesLanguage).toBe('en');
    });

    it('lets a stored de beat a founder en', () => {
      addUser('2026-01-01T00:00:00.000Z', 'u-1', 'en');

      appSettingsService.updateHouseholdSettings(db, { entriesLanguage: 'de' });

      expect(appSettingsService.getHouseholdSettings(db).entriesLanguage).toBe('de');
    });

    it('derives again when the stored value is garbage', () => {
      addUser('2026-01-01T00:00:00.000Z', 'u-1', 'de');
      db.insert(schema.appSettings)
        .values({ key: 'entries_language', value: 'klingon', updatedAt: 'x' })
        .run();

      expect(appSettingsService.getHouseholdSettings(db).entriesLanguage).toBe('de');
    });

    it('update writes the entries_language row and returns it', () => {
      const result = appSettingsService.updateHouseholdSettings(db, { entriesLanguage: 'de' });

      expect(result.entriesLanguage).toBe('de');
      expect(settingsRows().map((r) => [r.key, r.value])).toEqual([['entries_language', 'de']]);
    });

    it('update with only entriesLanguage counts as a field and leaves name/address alone', () => {
      appSettingsService.updateHouseholdSettings(db, { householdName: 'Sample Household' });

      const result = appSettingsService.updateHouseholdSettings(db, { entriesLanguage: 'en' });

      expect(result.householdName).toBe('Sample Household');
      expect(result.householdAddress).toBeNull();
    });

    it('update upserts rather than duplicating the entries_language row', () => {
      appSettingsService.updateHouseholdSettings(db, { entriesLanguage: 'de' });
      appSettingsService.updateHouseholdSettings(db, { entriesLanguage: 'en' });

      expect(settingsRows().filter((r) => r.key === 'entries_language')).toHaveLength(1);
      expect(appSettingsService.getHouseholdSettings(db).entriesLanguage).toBe('en');
    });

    it('update rejects a non-enum value and writes nothing', () => {
      const bad = { entriesLanguage: 'fr' } as unknown as Parameters<
        typeof appSettingsService.updateHouseholdSettings
      >[1];

      expect(() => appSettingsService.updateHouseholdSettings(db, bad)).toThrow(ValidationError);
      expect(settingsRows()).toHaveLength(0);
    });

    it('update rejects null as a non-enum value', () => {
      const bad = { entriesLanguage: null } as unknown as Parameters<
        typeof appSettingsService.updateHouseholdSettings
      >[1];

      expect(() => appSettingsService.updateHouseholdSettings(db, bad)).toThrow(ValidationError);
    });
  });
});
