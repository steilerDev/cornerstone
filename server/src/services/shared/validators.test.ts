import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../../db/migrate.js';
import * as schema from '../../db/schema.js';
import { ValidationError } from '../../errors/AppError.js';
import {
  VALID_CONFIDENCE_LEVELS,
  MAX_DESCRIPTION_LENGTH,
  validateConfidence,
  validateDescription,
  validateBudgetCategoryId,
  validateBudgetSourceId,
  validateVendorId,
} from './validators.js';

describe('Shared Validators', () => {
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

  // ─── Constants ───────────────────────────────────────────────────────────

  describe('VALID_CONFIDENCE_LEVELS', () => {
    it('contains exactly the four expected confidence level values', () => {
      expect(VALID_CONFIDENCE_LEVELS).toHaveLength(4);
      expect(VALID_CONFIDENCE_LEVELS).toContain('own_estimate');
      expect(VALID_CONFIDENCE_LEVELS).toContain('professional_estimate');
      expect(VALID_CONFIDENCE_LEVELS).toContain('quote');
      expect(VALID_CONFIDENCE_LEVELS).toContain('invoice');
    });

    it('matches the exact array order', () => {
      expect(VALID_CONFIDENCE_LEVELS).toEqual([
        'own_estimate',
        'professional_estimate',
        'quote',
        'invoice',
      ]);
    });
  });

  describe('MAX_DESCRIPTION_LENGTH', () => {
    it('equals 500', () => {
      expect(MAX_DESCRIPTION_LENGTH).toBe(500);
    });
  });

  // ─── validateConfidence ──────────────────────────────────────────────────

  describe('validateConfidence()', () => {
    it('does not throw for own_estimate', () => {
      expect(() => validateConfidence('own_estimate')).not.toThrow();
    });

    it('does not throw for professional_estimate', () => {
      expect(() => validateConfidence('professional_estimate')).not.toThrow();
    });

    it('does not throw for quote', () => {
      expect(() => validateConfidence('quote')).not.toThrow();
    });

    it('does not throw for invoice', () => {
      expect(() => validateConfidence('invoice')).not.toThrow();
    });

    it('throws ValidationError for an unrecognized value', () => {
      expect(() => validateConfidence('bad_value')).toThrow(ValidationError);
    });

    it('throws ValidationError for an empty string', () => {
      expect(() => validateConfidence('')).toThrow(ValidationError);
    });

    it('throws ValidationError for a value that is close but not exact', () => {
      expect(() => validateConfidence('Own_Estimate')).toThrow(ValidationError);
      expect(() => validateConfidence('OWN_ESTIMATE')).toThrow(ValidationError);
    });

    it('throws ValidationError for numeric string', () => {
      expect(() => validateConfidence('1')).toThrow(ValidationError);
    });

    it('error message lists valid confidence levels', () => {
      expect(() => validateConfidence('invalid')).toThrow(
        'confidence must be one of: own_estimate, professional_estimate, quote, invoice',
      );
    });
  });

  // ─── validateDescription ─────────────────────────────────────────────────

  describe('validateDescription()', () => {
    it('does not throw for null', () => {
      expect(() => validateDescription(null)).not.toThrow();
    });

    it('does not throw for undefined', () => {
      expect(() => validateDescription(undefined)).not.toThrow();
    });

    it('does not throw for an empty string', () => {
      expect(() => validateDescription('')).not.toThrow();
    });

    it('does not throw for a description exactly at the 500-character limit', () => {
      expect(() => validateDescription('x'.repeat(500))).not.toThrow();
    });

    it('does not throw for a short description', () => {
      expect(() => validateDescription('Short description')).not.toThrow();
    });

    it('throws ValidationError for a description of 501 characters', () => {
      expect(() => validateDescription('x'.repeat(501))).toThrow(ValidationError);
    });

    it('throws ValidationError for a very long description', () => {
      expect(() => validateDescription('a'.repeat(1000))).toThrow(ValidationError);
    });

    it('error message mentions the max length', () => {
      expect(() => validateDescription('x'.repeat(501))).toThrow(
        'Description must not exceed 500 characters',
      );
    });
  });

  // ─── validateBudgetCategoryId ────────────────────────────────────────────

  describe('validateBudgetCategoryId()', () => {
    it('does not throw when the budget category exists', () => {
      const now = new Date().toISOString();
      db.insert(schema.budgetCategories)
        .values({
          id: 'bc-test-1',
          name: 'Test Category',
          description: null,
          color: null,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      expect(() => validateBudgetCategoryId(db, 'bc-test-1')).not.toThrow();
    });

    it('throws ValidationError when the budget category does not exist', () => {
      expect(() => validateBudgetCategoryId(db, 'bc-missing')).toThrow(ValidationError);
    });

    it('includes the missing ID in the error message', () => {
      expect(() => validateBudgetCategoryId(db, 'bc-not-here')).toThrow(
        'Budget category not found: bc-not-here',
      );
    });
  });

  // ─── validateBudgetSourceId ──────────────────────────────────────────────

  describe('validateBudgetSourceId()', () => {
    it('does not throw when the budget source exists', () => {
      const now = new Date().toISOString();
      db.insert(schema.budgetSources)
        .values({
          id: 'bs-test-1',
          name: 'Test Source',
          sourceType: 'savings',
          totalAmount: 50000,
          interestRate: null,
          terms: null,
          notes: null,
          status: 'active',
          createdBy: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      expect(() => validateBudgetSourceId(db, 'bs-test-1')).not.toThrow();
    });

    it('throws ValidationError when the budget source does not exist', () => {
      expect(() => validateBudgetSourceId(db, 'bs-missing')).toThrow(ValidationError);
    });

    it('includes the missing ID in the error message', () => {
      expect(() => validateBudgetSourceId(db, 'bs-not-here')).toThrow(
        'Budget source not found: bs-not-here',
      );
    });
  });

  // ─── validateVendorId ────────────────────────────────────────────────────

  describe('validateVendorId()', () => {
    it('does not throw when the vendor exists', () => {
      const now = new Date().toISOString();
      db.insert(schema.vendors)
        .values({
          id: 'vendor-test-1',
          name: 'Test Vendor',
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

      expect(() => validateVendorId(db, 'vendor-test-1')).not.toThrow();
    });

    it('throws ValidationError when the vendor does not exist', () => {
      expect(() => validateVendorId(db, 'vendor-missing')).toThrow(ValidationError);
    });

    it('includes the missing ID in the error message', () => {
      expect(() => validateVendorId(db, 'vendor-not-here')).toThrow(
        'Vendor not found: vendor-not-here',
      );
    });
  });
});
