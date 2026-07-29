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

      expect(result).toEqual({ householdName: null, householdAddress: null });
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
});
