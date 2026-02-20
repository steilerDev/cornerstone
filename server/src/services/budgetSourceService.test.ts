import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as budgetSourceService from './budgetSourceService.js';
import { NotFoundError, ValidationError, BudgetSourceInUseError } from '../errors/AppError.js';
import type { CreateBudgetSourceRequest, UpdateBudgetSourceRequest } from '@cornerstone/shared';

describe('Budget Source Service', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  // A test user ID for createdBy fields
  const TEST_USER_ID = 'user-test-001';

  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  /**
   * Insert a test user directly so foreign key references work.
   */
  function insertTestUser(userId: string = TEST_USER_ID) {
    const now = new Date().toISOString();
    db.insert(schema.users)
      .values({
        id: userId,
        email: `${userId}@example.com`,
        displayName: 'Test User',
        passwordHash: 'hashed',
        role: 'member',
        authProvider: 'local',
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  let timestampOffset = 0;

  /**
   * Helper: Insert a raw budget source directly into the DB for test setup.
   */
  function insertRawSource(
    overrides: Partial<typeof schema.budgetSources.$inferInsert> & {
      name: string;
      sourceType?: 'bank_loan' | 'credit_line' | 'savings' | 'other';
      totalAmount?: number;
    } = { name: 'Test Source' },
  ) {
    const id = `src-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const ts = new Date(Date.now() + timestampOffset++).toISOString();

    db.insert(schema.budgetSources)
      .values({
        id,
        name: overrides.name,
        sourceType: overrides.sourceType ?? 'bank_loan',
        totalAmount: overrides.totalAmount ?? 100000,
        interestRate: overrides.interestRate ?? null,
        terms: overrides.terms ?? null,
        notes: overrides.notes ?? null,
        status: overrides.status ?? 'active',
        createdBy: overrides.createdBy ?? null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    return { id, ...overrides, createdAt: ts, updatedAt: ts };
  }

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    timestampOffset = 0;
    insertTestUser();
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── listBudgetSources() ───────────────────────────────────────────────────

  describe('listBudgetSources()', () => {
    it('returns empty array when no sources exist', () => {
      const result = budgetSourceService.listBudgetSources(db);
      expect(result).toEqual([]);
    });

    it('returns a single source after insertion', () => {
      insertRawSource({ name: 'Home Loan', sourceType: 'bank_loan', totalAmount: 200000 });

      const result = budgetSourceService.listBudgetSources(db);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Home Loan');
    });

    it('returns sources sorted by name ascending', () => {
      insertRawSource({ name: 'Zebra Fund', sourceType: 'savings', totalAmount: 5000 });
      insertRawSource({ name: 'Alpha Bank Loan', sourceType: 'bank_loan', totalAmount: 200000 });
      insertRawSource({ name: 'Mid Credit Line', sourceType: 'credit_line', totalAmount: 50000 });

      const result = budgetSourceService.listBudgetSources(db);
      expect(result[0].name).toBe('Alpha Bank Loan');
      expect(result[1].name).toBe('Mid Credit Line');
      expect(result[2].name).toBe('Zebra Fund');
    });

    it('returns all expected fields for a source', () => {
      insertRawSource({
        name: 'Primary Loan',
        sourceType: 'bank_loan',
        totalAmount: 300000,
        interestRate: 3.5,
        terms: '30-year fixed',
        notes: 'Main financing',
        status: 'active',
        createdBy: TEST_USER_ID,
      });

      const result = budgetSourceService.listBudgetSources(db);
      expect(result).toHaveLength(1);

      const source = result[0];
      expect(source.id).toBeDefined();
      expect(source.name).toBe('Primary Loan');
      expect(source.sourceType).toBe('bank_loan');
      expect(source.totalAmount).toBe(300000);
      expect(source.usedAmount).toBe(0);
      expect(source.availableAmount).toBe(300000);
      expect(source.interestRate).toBe(3.5);
      expect(source.terms).toBe('30-year fixed');
      expect(source.notes).toBe('Main financing');
      expect(source.status).toBe('active');
      expect(source.createdAt).toBeDefined();
      expect(source.updatedAt).toBeDefined();
    });

    it('returns createdBy as UserSummary when createdBy user exists', () => {
      insertRawSource({
        name: 'Loan With Creator',
        sourceType: 'bank_loan',
        totalAmount: 100000,
        createdBy: TEST_USER_ID,
      });

      const result = budgetSourceService.listBudgetSources(db);
      expect(result[0].createdBy).not.toBeNull();
      expect(result[0].createdBy?.id).toBe(TEST_USER_ID);
      expect(result[0].createdBy?.email).toBe(`${TEST_USER_ID}@example.com`);
    });

    it('returns createdBy as null when createdBy is null', () => {
      insertRawSource({ name: 'No Creator', sourceType: 'savings', totalAmount: 10000 });

      const result = budgetSourceService.listBudgetSources(db);
      expect(result[0].createdBy).toBeNull();
    });

    it('computes usedAmount as 0 (Story 6 not yet implemented)', () => {
      insertRawSource({ name: 'Computing Loan', sourceType: 'bank_loan', totalAmount: 50000 });

      const result = budgetSourceService.listBudgetSources(db);
      expect(result[0].usedAmount).toBe(0);
      expect(result[0].availableAmount).toBe(50000);
    });

    it('returns multiple sources with correct data', () => {
      insertRawSource({ name: 'Loan A', sourceType: 'bank_loan', totalAmount: 100000 });
      insertRawSource({ name: 'Savings B', sourceType: 'savings', totalAmount: 20000 });

      const result = budgetSourceService.listBudgetSources(db);
      expect(result).toHaveLength(2);
    });

    it('returns sources with null interestRate correctly', () => {
      insertRawSource({ name: 'No Rate Loan', sourceType: 'savings', totalAmount: 5000 });

      const result = budgetSourceService.listBudgetSources(db);
      expect(result[0].interestRate).toBeNull();
    });
  });

  // ─── getBudgetSourceById() ─────────────────────────────────────────────────

  describe('getBudgetSourceById()', () => {
    it('returns a source by ID', () => {
      const raw = insertRawSource({ name: 'Test Get', sourceType: 'savings', totalAmount: 5000 });

      const result = budgetSourceService.getBudgetSourceById(db, raw.id);
      expect(result.id).toBe(raw.id);
      expect(result.name).toBe('Test Get');
    });

    it('returns all fields correctly', () => {
      const raw = insertRawSource({
        name: 'Full Source',
        sourceType: 'credit_line',
        totalAmount: 75000,
        interestRate: 5.25,
        terms: '5-year revolving',
        notes: 'Secondary credit',
        status: 'exhausted',
        createdBy: TEST_USER_ID,
      });

      const result = budgetSourceService.getBudgetSourceById(db, raw.id);
      expect(result.name).toBe('Full Source');
      expect(result.sourceType).toBe('credit_line');
      expect(result.totalAmount).toBe(75000);
      expect(result.usedAmount).toBe(0);
      expect(result.availableAmount).toBe(75000);
      expect(result.interestRate).toBe(5.25);
      expect(result.terms).toBe('5-year revolving');
      expect(result.notes).toBe('Secondary credit');
      expect(result.status).toBe('exhausted');
    });

    it('throws NotFoundError when source does not exist', () => {
      expect(() => {
        budgetSourceService.getBudgetSourceById(db, 'non-existent-id');
      }).toThrow(NotFoundError);

      expect(() => {
        budgetSourceService.getBudgetSourceById(db, 'non-existent-id');
      }).toThrow('Budget source not found');
    });

    it('returns createdBy with user data when user exists', () => {
      const raw = insertRawSource({
        name: 'With User',
        sourceType: 'bank_loan',
        totalAmount: 100000,
        createdBy: TEST_USER_ID,
      });

      const result = budgetSourceService.getBudgetSourceById(db, raw.id);
      expect(result.createdBy).not.toBeNull();
      expect(result.createdBy?.id).toBe(TEST_USER_ID);
      expect(result.createdBy?.displayName).toBe('Test User');
    });

    it('returns createdBy as null when no user set', () => {
      const raw = insertRawSource({ name: 'No User', sourceType: 'other', totalAmount: 1000 });

      const result = budgetSourceService.getBudgetSourceById(db, raw.id);
      expect(result.createdBy).toBeNull();
    });
  });

  // ─── createBudgetSource() ──────────────────────────────────────────────────

  describe('createBudgetSource()', () => {
    it('creates a source with required fields only', () => {
      const data: CreateBudgetSourceRequest = {
        name: 'Simple Loan',
        sourceType: 'bank_loan',
        totalAmount: 200000,
      };

      const result = budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);

      expect(result.id).toBeDefined();
      expect(result.name).toBe('Simple Loan');
      expect(result.sourceType).toBe('bank_loan');
      expect(result.totalAmount).toBe(200000);
      expect(result.usedAmount).toBe(0);
      expect(result.availableAmount).toBe(200000);
      expect(result.interestRate).toBeNull();
      expect(result.terms).toBeNull();
      expect(result.notes).toBeNull();
      expect(result.status).toBe('active');
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('creates a source with all optional fields', () => {
      const data: CreateBudgetSourceRequest = {
        name: 'Full Loan',
        sourceType: 'credit_line',
        totalAmount: 50000,
        interestRate: 3.75,
        terms: '10-year fixed',
        notes: 'From First National Bank',
        status: 'active',
      };

      const result = budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);

      expect(result.name).toBe('Full Loan');
      expect(result.sourceType).toBe('credit_line');
      expect(result.totalAmount).toBe(50000);
      expect(result.interestRate).toBe(3.75);
      expect(result.terms).toBe('10-year fixed');
      expect(result.notes).toBe('From First National Bank');
      expect(result.status).toBe('active');
    });

    it('creates source with all source types', () => {
      const types: Array<'bank_loan' | 'credit_line' | 'savings' | 'other'> = [
        'bank_loan',
        'credit_line',
        'savings',
        'other',
      ];

      for (const sourceType of types) {
        const result = budgetSourceService.createBudgetSource(
          db,
          { name: `Source ${sourceType}`, sourceType, totalAmount: 1000 },
          TEST_USER_ID,
        );
        expect(result.sourceType).toBe(sourceType);
      }
    });

    it('trims leading and trailing whitespace from name', () => {
      const data: CreateBudgetSourceRequest = {
        name: '  Trimmed Loan  ',
        sourceType: 'savings',
        totalAmount: 5000,
      };

      const result = budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);
      expect(result.name).toBe('Trimmed Loan');
    });

    it('defaults status to "active" when not provided', () => {
      const data: CreateBudgetSourceRequest = {
        name: 'Default Status',
        sourceType: 'bank_loan',
        totalAmount: 10000,
      };

      const result = budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);
      expect(result.status).toBe('active');
    });

    it('creates source with status "exhausted"', () => {
      const data: CreateBudgetSourceRequest = {
        name: 'Used Up',
        sourceType: 'savings',
        totalAmount: 5000,
        status: 'exhausted',
      };

      const result = budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);
      expect(result.status).toBe('exhausted');
    });

    it('creates source with status "closed"', () => {
      const data: CreateBudgetSourceRequest = {
        name: 'Closed Account',
        sourceType: 'savings',
        totalAmount: 5000,
        status: 'closed',
      };

      const result = budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);
      expect(result.status).toBe('closed');
    });

    it('persists the created source in the database', () => {
      const data: CreateBudgetSourceRequest = {
        name: 'Persisted Loan',
        sourceType: 'bank_loan',
        totalAmount: 100000,
      };

      const created = budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);
      const fetched = budgetSourceService.getBudgetSourceById(db, created.id);

      expect(fetched.id).toBe(created.id);
      expect(fetched.name).toBe('Persisted Loan');
    });

    it('allows interest rate of 0', () => {
      const data: CreateBudgetSourceRequest = {
        name: 'Zero Rate',
        sourceType: 'savings',
        totalAmount: 10000,
        interestRate: 0,
      };

      const result = budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);
      expect(result.interestRate).toBe(0);
    });

    it('allows interest rate of 100', () => {
      const data: CreateBudgetSourceRequest = {
        name: 'Max Rate',
        sourceType: 'bank_loan',
        totalAmount: 10000,
        interestRate: 100,
      };

      const result = budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);
      expect(result.interestRate).toBe(100);
    });

    it('allows interest rate of null (explicitly)', () => {
      const data: CreateBudgetSourceRequest = {
        name: 'Null Rate',
        sourceType: 'savings',
        totalAmount: 10000,
        interestRate: null,
      };

      const result = budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);
      expect(result.interestRate).toBeNull();
    });

    it('creates source with name at exactly 200 characters', () => {
      const name = 'A'.repeat(200);
      const data: CreateBudgetSourceRequest = {
        name,
        sourceType: 'other',
        totalAmount: 1000,
      };

      const result = budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);
      expect(result.name).toBe(name);
    });

    it('allows two sources with the same name (no unique constraint)', () => {
      const data: CreateBudgetSourceRequest = {
        name: 'Duplicate Name',
        sourceType: 'bank_loan',
        totalAmount: 50000,
      };

      const r1 = budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);
      const r2 = budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);

      expect(r1.id).not.toBe(r2.id);
      expect(r1.name).toBe('Duplicate Name');
      expect(r2.name).toBe('Duplicate Name');
    });

    // --- Validation errors ---

    it('throws ValidationError for empty name', () => {
      const data: CreateBudgetSourceRequest = {
        name: '',
        sourceType: 'bank_loan',
        totalAmount: 10000,
      };

      expect(() => {
        budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);
      }).toThrow(ValidationError);
      expect(() => {
        budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);
      }).toThrow('Budget source name must be between 1 and 200 characters');
    });

    it('throws ValidationError for whitespace-only name', () => {
      const data: CreateBudgetSourceRequest = {
        name: '   ',
        sourceType: 'bank_loan',
        totalAmount: 10000,
      };

      expect(() => {
        budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for name exceeding 200 characters', () => {
      const data: CreateBudgetSourceRequest = {
        name: 'A'.repeat(201),
        sourceType: 'bank_loan',
        totalAmount: 10000,
      };

      expect(() => {
        budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);
      }).toThrow(ValidationError);
      expect(() => {
        budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);
      }).toThrow('Budget source name must be between 1 and 200 characters');
    });

    it('throws ValidationError for invalid source type', () => {
      const data = {
        name: 'Bad Type',
        sourceType: 'invalid_type' as 'bank_loan',
        totalAmount: 10000,
      };

      expect(() => {
        budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);
      }).toThrow(ValidationError);
      expect(() => {
        budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);
      }).toThrow('Invalid source type');
    });

    it('throws ValidationError for totalAmount of zero', () => {
      const data: CreateBudgetSourceRequest = {
        name: 'Zero Amount',
        sourceType: 'bank_loan',
        totalAmount: 0,
      };

      expect(() => {
        budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);
      }).toThrow(ValidationError);
      expect(() => {
        budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);
      }).toThrow('Total amount must be a positive number');
    });

    it('throws ValidationError for negative totalAmount', () => {
      const data: CreateBudgetSourceRequest = {
        name: 'Negative Amount',
        sourceType: 'bank_loan',
        totalAmount: -100,
      };

      expect(() => {
        budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for interest rate below 0', () => {
      const data: CreateBudgetSourceRequest = {
        name: 'Bad Rate',
        sourceType: 'bank_loan',
        totalAmount: 10000,
        interestRate: -1,
      };

      expect(() => {
        budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);
      }).toThrow(ValidationError);
      expect(() => {
        budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);
      }).toThrow('Interest rate must be between 0 and 100');
    });

    it('throws ValidationError for interest rate above 100', () => {
      const data: CreateBudgetSourceRequest = {
        name: 'Too High Rate',
        sourceType: 'bank_loan',
        totalAmount: 10000,
        interestRate: 101,
      };

      expect(() => {
        budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for invalid status', () => {
      const data = {
        name: 'Bad Status',
        sourceType: 'bank_loan' as const,
        totalAmount: 10000,
        status: 'invalid_status' as 'active',
      };

      expect(() => {
        budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);
      }).toThrow(ValidationError);
      expect(() => {
        budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);
      }).toThrow('Invalid status');
    });
  });

  // ─── updateBudgetSource() ──────────────────────────────────────────────────

  describe('updateBudgetSource()', () => {
    it('updates name only (partial update)', () => {
      const raw = insertRawSource({
        name: 'Old Name',
        sourceType: 'bank_loan',
        totalAmount: 100000,
      });

      const data: UpdateBudgetSourceRequest = { name: 'New Name' };
      const result = budgetSourceService.updateBudgetSource(db, raw.id, data);

      expect(result.id).toBe(raw.id);
      expect(result.name).toBe('New Name');
      expect(result.sourceType).toBe('bank_loan');
      expect(result.totalAmount).toBe(100000);
    });

    it('updates sourceType only', () => {
      const raw = insertRawSource({
        name: 'Type Update',
        sourceType: 'bank_loan',
        totalAmount: 50000,
      });

      const data: UpdateBudgetSourceRequest = { sourceType: 'credit_line' };
      const result = budgetSourceService.updateBudgetSource(db, raw.id, data);

      expect(result.sourceType).toBe('credit_line');
      expect(result.name).toBe('Type Update');
    });

    it('updates totalAmount only', () => {
      const raw = insertRawSource({
        name: 'Amount Update',
        sourceType: 'savings',
        totalAmount: 5000,
      });

      const data: UpdateBudgetSourceRequest = { totalAmount: 15000 };
      const result = budgetSourceService.updateBudgetSource(db, raw.id, data);

      expect(result.totalAmount).toBe(15000);
      expect(result.availableAmount).toBe(15000);
    });

    it('updates interestRate only', () => {
      const raw = insertRawSource({
        name: 'Rate Update',
        sourceType: 'bank_loan',
        totalAmount: 100000,
        interestRate: 3.0,
      });

      const data: UpdateBudgetSourceRequest = { interestRate: 4.5 };
      const result = budgetSourceService.updateBudgetSource(db, raw.id, data);

      expect(result.interestRate).toBe(4.5);
    });

    it('clears interestRate by setting to null', () => {
      const raw = insertRawSource({
        name: 'Clear Rate',
        sourceType: 'bank_loan',
        totalAmount: 100000,
        interestRate: 3.5,
      });

      const data: UpdateBudgetSourceRequest = { interestRate: null };
      const result = budgetSourceService.updateBudgetSource(db, raw.id, data);

      expect(result.interestRate).toBeNull();
    });

    it('updates terms only', () => {
      const raw = insertRawSource({ name: 'Terms Update', sourceType: 'other', totalAmount: 1000 });

      const data: UpdateBudgetSourceRequest = { terms: '12-month fixed' };
      const result = budgetSourceService.updateBudgetSource(db, raw.id, data);

      expect(result.terms).toBe('12-month fixed');
    });

    it('clears terms by setting to null', () => {
      const raw = insertRawSource({
        name: 'Clear Terms',
        sourceType: 'bank_loan',
        totalAmount: 50000,
        terms: 'Old terms',
      });

      const data: UpdateBudgetSourceRequest = { terms: null };
      const result = budgetSourceService.updateBudgetSource(db, raw.id, data);

      expect(result.terms).toBeNull();
    });

    it('updates notes only', () => {
      const raw = insertRawSource({
        name: 'Notes Update',
        sourceType: 'credit_line',
        totalAmount: 20000,
      });

      const data: UpdateBudgetSourceRequest = { notes: 'Updated notes' };
      const result = budgetSourceService.updateBudgetSource(db, raw.id, data);

      expect(result.notes).toBe('Updated notes');
    });

    it('clears notes by setting to null', () => {
      const raw = insertRawSource({
        name: 'Clear Notes',
        sourceType: 'savings',
        totalAmount: 10000,
        notes: 'Old notes',
      });

      const data: UpdateBudgetSourceRequest = { notes: null };
      const result = budgetSourceService.updateBudgetSource(db, raw.id, data);

      expect(result.notes).toBeNull();
    });

    it('updates status only', () => {
      const raw = insertRawSource({ name: 'Status Update', sourceType: 'other', totalAmount: 500 });

      const data: UpdateBudgetSourceRequest = { status: 'closed' };
      const result = budgetSourceService.updateBudgetSource(db, raw.id, data);

      expect(result.status).toBe('closed');
    });

    it('updates all fields at once', () => {
      const raw = insertRawSource({
        name: 'All Fields',
        sourceType: 'bank_loan',
        totalAmount: 100,
      });

      const data: UpdateBudgetSourceRequest = {
        name: 'Completely Updated',
        sourceType: 'savings',
        totalAmount: 99999,
        interestRate: 2.5,
        terms: 'New terms',
        notes: 'New notes',
        status: 'exhausted',
      };

      const result = budgetSourceService.updateBudgetSource(db, raw.id, data);

      expect(result.name).toBe('Completely Updated');
      expect(result.sourceType).toBe('savings');
      expect(result.totalAmount).toBe(99999);
      expect(result.interestRate).toBe(2.5);
      expect(result.terms).toBe('New terms');
      expect(result.notes).toBe('New notes');
      expect(result.status).toBe('exhausted');
    });

    it('trims whitespace from name on update', () => {
      const raw = insertRawSource({ name: 'Original', sourceType: 'other', totalAmount: 1000 });

      const data: UpdateBudgetSourceRequest = { name: '  Trimmed  ' };
      const result = budgetSourceService.updateBudgetSource(db, raw.id, data);

      expect(result.name).toBe('Trimmed');
    });

    it('sets updatedAt to a new timestamp on update', async () => {
      const raw = insertRawSource({
        name: 'Timestamp Test',
        sourceType: 'savings',
        totalAmount: 100,
      });

      await new Promise((resolve) => setTimeout(resolve, 1));

      const data: UpdateBudgetSourceRequest = { name: 'Updated Timestamp' };
      const result = budgetSourceService.updateBudgetSource(db, raw.id, data);

      expect(result.updatedAt).not.toBe(raw.updatedAt);
    });

    it('allows updating name to the same value', () => {
      const raw = insertRawSource({
        name: 'Same Name',
        sourceType: 'bank_loan',
        totalAmount: 5000,
      });

      const data: UpdateBudgetSourceRequest = { name: 'Same Name' };
      const result = budgetSourceService.updateBudgetSource(db, raw.id, data);

      expect(result.name).toBe('Same Name');
    });

    it('throws NotFoundError when source does not exist', () => {
      const data: UpdateBudgetSourceRequest = { name: 'Updated' };

      expect(() => {
        budgetSourceService.updateBudgetSource(db, 'non-existent-id', data);
      }).toThrow(NotFoundError);
      expect(() => {
        budgetSourceService.updateBudgetSource(db, 'non-existent-id', data);
      }).toThrow('Budget source not found');
    });

    it('throws ValidationError when no fields are provided', () => {
      const raw = insertRawSource({ name: 'No Fields', sourceType: 'other', totalAmount: 1000 });

      const data: UpdateBudgetSourceRequest = {};

      expect(() => {
        budgetSourceService.updateBudgetSource(db, raw.id, data);
      }).toThrow(ValidationError);
      expect(() => {
        budgetSourceService.updateBudgetSource(db, raw.id, data);
      }).toThrow('At least one field must be provided');
    });

    it('throws ValidationError for empty name on update', () => {
      const raw = insertRawSource({
        name: 'Valid Name',
        sourceType: 'bank_loan',
        totalAmount: 1000,
      });

      const data: UpdateBudgetSourceRequest = { name: '' };

      expect(() => {
        budgetSourceService.updateBudgetSource(db, raw.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for whitespace-only name on update', () => {
      const raw = insertRawSource({
        name: 'Valid Name',
        sourceType: 'bank_loan',
        totalAmount: 1000,
      });

      const data: UpdateBudgetSourceRequest = { name: '   ' };

      expect(() => {
        budgetSourceService.updateBudgetSource(db, raw.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for name exceeding 200 characters on update', () => {
      const raw = insertRawSource({
        name: 'Valid Name',
        sourceType: 'bank_loan',
        totalAmount: 1000,
      });

      const data: UpdateBudgetSourceRequest = { name: 'A'.repeat(201) };

      expect(() => {
        budgetSourceService.updateBudgetSource(db, raw.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for invalid source type on update', () => {
      const raw = insertRawSource({ name: 'Valid', sourceType: 'bank_loan', totalAmount: 1000 });

      const data = { sourceType: 'invalid' as 'bank_loan' };

      expect(() => {
        budgetSourceService.updateBudgetSource(db, raw.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for totalAmount of zero on update', () => {
      const raw = insertRawSource({ name: 'Valid', sourceType: 'bank_loan', totalAmount: 1000 });

      const data: UpdateBudgetSourceRequest = { totalAmount: 0 };

      expect(() => {
        budgetSourceService.updateBudgetSource(db, raw.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for negative totalAmount on update', () => {
      const raw = insertRawSource({ name: 'Valid', sourceType: 'bank_loan', totalAmount: 1000 });

      const data: UpdateBudgetSourceRequest = { totalAmount: -500 };

      expect(() => {
        budgetSourceService.updateBudgetSource(db, raw.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for interest rate below 0 on update', () => {
      const raw = insertRawSource({ name: 'Valid', sourceType: 'bank_loan', totalAmount: 1000 });

      const data: UpdateBudgetSourceRequest = { interestRate: -0.1 };

      expect(() => {
        budgetSourceService.updateBudgetSource(db, raw.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for interest rate above 100 on update', () => {
      const raw = insertRawSource({ name: 'Valid', sourceType: 'bank_loan', totalAmount: 1000 });

      const data: UpdateBudgetSourceRequest = { interestRate: 100.1 };

      expect(() => {
        budgetSourceService.updateBudgetSource(db, raw.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for invalid status on update', () => {
      const raw = insertRawSource({ name: 'Valid', sourceType: 'bank_loan', totalAmount: 1000 });

      const data = { status: 'invalid_status' as 'active' };

      expect(() => {
        budgetSourceService.updateBudgetSource(db, raw.id, data);
      }).toThrow(ValidationError);
    });
  });

  // ─── deleteBudgetSource() ──────────────────────────────────────────────────

  describe('deleteBudgetSource()', () => {
    it('deletes a source successfully', () => {
      const raw = insertRawSource({ name: 'To Delete', sourceType: 'other', totalAmount: 500 });

      budgetSourceService.deleteBudgetSource(db, raw.id);

      expect(() => {
        budgetSourceService.getBudgetSourceById(db, raw.id);
      }).toThrow(NotFoundError);
    });

    it('removes source from the list after deletion', () => {
      const raw1 = insertRawSource({ name: 'Delete Me', sourceType: 'savings', totalAmount: 1000 });
      insertRawSource({ name: 'Keep Me', sourceType: 'savings', totalAmount: 2000 });

      const countBefore = budgetSourceService.listBudgetSources(db).length;

      budgetSourceService.deleteBudgetSource(db, raw1.id);

      const result = budgetSourceService.listBudgetSources(db);
      expect(result).toHaveLength(countBefore - 1);
      expect(result.find((s) => s.id === raw1.id)).toBeUndefined();
    });

    it('throws NotFoundError when source does not exist', () => {
      expect(() => {
        budgetSourceService.deleteBudgetSource(db, 'non-existent-id');
      }).toThrow(NotFoundError);
      expect(() => {
        budgetSourceService.deleteBudgetSource(db, 'non-existent-id');
      }).toThrow('Budget source not found');
    });

    it('BudgetSourceInUseError has code BUDGET_SOURCE_IN_USE and statusCode 409', () => {
      // Currently computeUsedAmount always returns 0 (Story 6 not yet done),
      // so this path is unreachable via normal service flow. We test the error class
      // independently to verify its properties.
      const err = new BudgetSourceInUseError('Budget source is in use', { workItemCount: 3 });
      expect(err.code).toBe('BUDGET_SOURCE_IN_USE');
      expect(err.statusCode).toBe(409);
      expect(err.details?.workItemCount).toBe(3);
    });

    it('does not throw BudgetSourceInUseError for a source with 0 usedAmount (Story 6 placeholder)', () => {
      const raw = insertRawSource({
        name: 'Zero Used',
        sourceType: 'bank_loan',
        totalAmount: 100000,
      });

      // Should not throw — workItemCount is always 0 at this stage
      expect(() => {
        budgetSourceService.deleteBudgetSource(db, raw.id);
      }).not.toThrow();
    });
  });
});
