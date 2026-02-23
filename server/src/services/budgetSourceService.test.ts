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

  let workItemCounter = 0;

  /**
   * Helper: Insert a work item budget line with a budget_source_id reference.
   * Used for testing computeUsedAmount and deleteBudgetSource blocking.
   * NOTE: Story 5.9 — budget data moved from work_items to work_item_budgets.
   * Returns the budget line ID so callers can attach invoices to it.
   */
  function insertRawWorkItemWithSource(
    sourceId: string,
    plannedAmount: number | null,
  ): { wiId: string; budgetId: string } {
    const wiId = `wi-src-test-${++workItemCounter}`;
    const budgetId = `bud-src-test-${workItemCounter}`;
    const ts = new Date(Date.now() + workItemCounter).toISOString();
    // Create work item first
    db.insert(schema.workItems)
      .values({
        id: wiId,
        title: `Test Work Item ${workItemCounter}`,
        status: 'not_started',
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    // Create budget line referencing the budget source
    db.insert(schema.workItemBudgets)
      .values({
        id: budgetId,
        workItemId: wiId,
        budgetSourceId: sourceId,
        plannedAmount: plannedAmount ?? 0,
        confidence: 'own_estimate',
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return { wiId, budgetId };
  }

  /**
   * Helper: Insert a vendor and a claimed invoice against a budget line.
   * Used for testing computeClaimedAmount.
   */
  function insertClaimedInvoice(budgetLineId: string, amount: number): void {
    const ts = new Date(Date.now() + workItemCounter).toISOString();
    const vendorId = `vendor-claimed-${++workItemCounter}`;
    db.insert(schema.vendors)
      .values({ id: vendorId, name: `Claimed Vendor ${vendorId}`, createdAt: ts, updatedAt: ts })
      .run();
    const invoiceId = `inv-claimed-${workItemCounter}`;
    db.insert(schema.invoices)
      .values({
        id: invoiceId,
        vendorId,
        workItemBudgetId: budgetLineId,
        amount,
        date: '2026-01-01',
        status: 'claimed',
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
  }

  /**
   * Helper: Insert a vendor and a paid invoice against a budget line.
   * Paid invoices do NOT count as claimed for claimedAmount.
   */
  function insertPaidInvoice(budgetLineId: string, amount: number): void {
    const ts = new Date(Date.now() + workItemCounter).toISOString();
    const vendorId = `vendor-paid-${++workItemCounter}`;
    db.insert(schema.vendors)
      .values({ id: vendorId, name: `Paid Vendor ${vendorId}`, createdAt: ts, updatedAt: ts })
      .run();
    const invoiceId = `inv-paid-${workItemCounter}`;
    db.insert(schema.invoices)
      .values({
        id: invoiceId,
        vendorId,
        workItemBudgetId: budgetLineId,
        amount,
        date: '2026-01-01',
        status: 'paid',
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
  }

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    timestampOffset = 0;
    workItemCounter = 0;
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
      // New Story 5.11 fields: no claimed invoices → claimedAmount=0, actualAvailable=totalAmount
      expect(source.claimedAmount).toBe(0);
      // unclaimedAmount: no paid invoices → 0
      expect(source.unclaimedAmount).toBe(0);
      expect(source.actualAvailableAmount).toBe(300000);
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

    it('computes usedAmount as 0 when no work items reference the source', () => {
      insertRawSource({ name: 'Computing Loan', sourceType: 'bank_loan', totalAmount: 50000 });

      const result = budgetSourceService.listBudgetSources(db);
      expect(result[0].usedAmount).toBe(0);
      expect(result[0].availableAmount).toBe(50000);
      // No claimed or paid invoices → both amounts are 0
      expect(result[0].claimedAmount).toBe(0);
      expect(result[0].unclaimedAmount).toBe(0);
      expect(result[0].actualAvailableAmount).toBe(50000);
    });

    it('computes usedAmount as sum of work item actualCost values', () => {
      const raw = insertRawSource({
        name: 'Used Amount Loan',
        sourceType: 'bank_loan',
        totalAmount: 100000,
      });

      // Insert work items that reference this source
      insertRawWorkItemWithSource(raw.id, 10000);
      insertRawWorkItemWithSource(raw.id, 7500.5);

      const result = budgetSourceService.listBudgetSources(db);
      const source = result.find((s) => s.id === raw.id)!;
      expect(source.usedAmount).toBe(17500.5);
      expect(source.availableAmount).toBe(82499.5);
      // No claimed invoices attached
      expect(source.claimedAmount).toBe(0);
      expect(source.actualAvailableAmount).toBe(100000);
    });

    it('ignores work items with null actualCost in usedAmount calculation', () => {
      const raw = insertRawSource({
        name: 'Null Cost Loan',
        sourceType: 'savings',
        totalAmount: 50000,
      });

      // Work item with no actualCost
      insertRawWorkItemWithSource(raw.id, null);

      const result = budgetSourceService.listBudgetSources(db);
      const source = result.find((s) => s.id === raw.id)!;
      expect(source.usedAmount).toBe(0);
    });

    it('does not count work items from other sources', () => {
      const rawA = insertRawSource({
        name: 'Source A',
        sourceType: 'bank_loan',
        totalAmount: 100000,
      });
      const rawB = insertRawSource({
        name: 'Source B',
        sourceType: 'savings',
        totalAmount: 20000,
      });

      insertRawWorkItemWithSource(rawA.id, 5000);
      insertRawWorkItemWithSource(rawB.id, 3000);

      const result = budgetSourceService.listBudgetSources(db);
      const sourceA = result.find((s) => s.id === rawA.id)!;
      const sourceB = result.find((s) => s.id === rawB.id)!;

      expect(sourceA.usedAmount).toBe(5000);
      expect(sourceB.usedAmount).toBe(3000);
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
      // No claimed or paid invoices
      expect(result.claimedAmount).toBe(0);
      expect(result.unclaimedAmount).toBe(0);
      expect(result.actualAvailableAmount).toBe(75000);
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

    it('computes usedAmount from linked work items via getBudgetSourceById', () => {
      const raw = insertRawSource({
        name: 'Get By ID Used',
        sourceType: 'bank_loan',
        totalAmount: 100000,
      });

      insertRawWorkItemWithSource(raw.id, 20000);
      insertRawWorkItemWithSource(raw.id, 5000);

      const result = budgetSourceService.getBudgetSourceById(db, raw.id);
      expect(result.usedAmount).toBe(25000);
      expect(result.availableAmount).toBe(75000);
      // No claimed or paid invoices attached to these budget lines
      expect(result.claimedAmount).toBe(0);
      expect(result.unclaimedAmount).toBe(0);
      expect(result.actualAvailableAmount).toBe(100000);
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
      // Newly created source has no claimed or paid invoices
      expect(result.claimedAmount).toBe(0);
      expect(result.unclaimedAmount).toBe(0);
      expect(result.actualAvailableAmount).toBe(200000);
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
      const err = new BudgetSourceInUseError('Budget source is in use', { budgetLineCount: 3 });
      expect(err.code).toBe('BUDGET_SOURCE_IN_USE');
      expect(err.statusCode).toBe(409);
      expect(err.details?.budgetLineCount).toBe(3);
    });

    it('does not throw BudgetSourceInUseError when no work items reference the source', () => {
      const raw = insertRawSource({
        name: 'Zero Used',
        sourceType: 'bank_loan',
        totalAmount: 100000,
      });

      expect(() => {
        budgetSourceService.deleteBudgetSource(db, raw.id);
      }).not.toThrow();
    });

    it('throws BudgetSourceInUseError when work items reference the source', () => {
      const raw = insertRawSource({
        name: 'In Use Source',
        sourceType: 'bank_loan',
        totalAmount: 200000,
      });

      // Link a work item to this source
      insertRawWorkItemWithSource(raw.id, 25000);

      expect(() => {
        budgetSourceService.deleteBudgetSource(db, raw.id);
      }).toThrow(BudgetSourceInUseError);
    });

    it('BudgetSourceInUseError includes budgetLineCount in details', () => {
      const raw = insertRawSource({
        name: 'Multi-WI Source',
        sourceType: 'credit_line',
        totalAmount: 50000,
      });

      insertRawWorkItemWithSource(raw.id, 1000);
      insertRawWorkItemWithSource(raw.id, 2000);

      let thrownErr: BudgetSourceInUseError | undefined;
      try {
        budgetSourceService.deleteBudgetSource(db, raw.id);
      } catch (err) {
        thrownErr = err as BudgetSourceInUseError;
      }

      expect(thrownErr).toBeDefined();
      expect(thrownErr?.details?.budgetLineCount).toBe(2);
    });

    it('blocks delete even when work item actualCost is null', () => {
      const raw = insertRawSource({
        name: 'Source With Null Cost WI',
        sourceType: 'savings',
        totalAmount: 10000,
      });

      // Work item referencing the source but with no actualCost
      insertRawWorkItemWithSource(raw.id, null);

      expect(() => {
        budgetSourceService.deleteBudgetSource(db, raw.id);
      }).toThrow(BudgetSourceInUseError);
    });
  });

  // ─── claimedAmount and actualAvailableAmount (Story 5.11) ─────────────────

  describe('claimedAmount and actualAvailableAmount', () => {
    it('returns claimedAmount=0 and actualAvailableAmount=totalAmount when no claimed invoices exist', () => {
      const raw = insertRawSource({
        name: 'No Claims Source',
        sourceType: 'bank_loan',
        totalAmount: 80000,
      });

      const result = budgetSourceService.getBudgetSourceById(db, raw.id);

      expect(result.claimedAmount).toBe(0);
      expect(result.actualAvailableAmount).toBe(80000);
    });

    it('sums claimed invoice amounts from budget lines referencing the source', () => {
      const raw = insertRawSource({
        name: 'Claims Source',
        sourceType: 'savings',
        totalAmount: 100000,
      });

      const { budgetId: budgetId1 } = insertRawWorkItemWithSource(raw.id, 20000);
      const { budgetId: budgetId2 } = insertRawWorkItemWithSource(raw.id, 10000);

      insertClaimedInvoice(budgetId1, 8000);
      insertClaimedInvoice(budgetId2, 5000);

      const result = budgetSourceService.getBudgetSourceById(db, raw.id);

      expect(result.claimedAmount).toBe(13000); // 8000 + 5000
      expect(result.actualAvailableAmount).toBe(87000); // 100000 - 13000
    });

    it('actualAvailableAmount = totalAmount - claimedAmount', () => {
      const raw = insertRawSource({
        name: 'Math Check Source',
        sourceType: 'credit_line',
        totalAmount: 50000,
      });

      const { budgetId } = insertRawWorkItemWithSource(raw.id, 30000);
      insertClaimedInvoice(budgetId, 12500);

      const result = budgetSourceService.getBudgetSourceById(db, raw.id);

      expect(result.totalAmount).toBe(50000);
      expect(result.claimedAmount).toBe(12500);
      expect(result.actualAvailableAmount).toBe(37500); // 50000 - 12500
    });

    it('does NOT count paid invoices in claimedAmount (only status=claimed counts)', () => {
      const raw = insertRawSource({
        name: 'Paid Not Claimed Source',
        sourceType: 'bank_loan',
        totalAmount: 60000,
      });

      const { budgetId } = insertRawWorkItemWithSource(raw.id, 25000);
      insertPaidInvoice(budgetId, 9000); // paid — should NOT be counted
      insertClaimedInvoice(budgetId, 3000); // claimed — should be counted

      const result = budgetSourceService.getBudgetSourceById(db, raw.id);

      expect(result.claimedAmount).toBe(3000); // only the claimed invoice
      expect(result.actualAvailableAmount).toBe(57000); // 60000 - 3000
    });

    it('does NOT count claimed invoices from budget lines referencing a different source', () => {
      const rawA = insertRawSource({
        name: 'Source A Claimed',
        sourceType: 'bank_loan',
        totalAmount: 100000,
      });
      const rawB = insertRawSource({
        name: 'Source B Claimed',
        sourceType: 'savings',
        totalAmount: 50000,
      });

      const { budgetId: budgetIdA } = insertRawWorkItemWithSource(rawA.id, 20000);
      insertClaimedInvoice(budgetIdA, 7000); // belongs to source A, not B

      const resultA = budgetSourceService.getBudgetSourceById(db, rawA.id);
      const resultB = budgetSourceService.getBudgetSourceById(db, rawB.id);

      expect(resultA.claimedAmount).toBe(7000);
      expect(resultA.actualAvailableAmount).toBe(93000); // 100000 - 7000
      expect(resultB.claimedAmount).toBe(0);
      expect(resultB.actualAvailableAmount).toBe(50000);
    });

    it('accumulates multiple claimed invoices on the same budget line', () => {
      const raw = insertRawSource({
        name: 'Multi-Claim Source',
        sourceType: 'credit_line',
        totalAmount: 200000,
      });

      const { budgetId } = insertRawWorkItemWithSource(raw.id, 50000);
      insertClaimedInvoice(budgetId, 4000);
      insertClaimedInvoice(budgetId, 6000);
      insertClaimedInvoice(budgetId, 2500);

      const result = budgetSourceService.getBudgetSourceById(db, raw.id);

      expect(result.claimedAmount).toBe(12500); // 4000 + 6000 + 2500
      expect(result.actualAvailableAmount).toBe(187500); // 200000 - 12500
    });

    it('listBudgetSources also returns claimedAmount and actualAvailableAmount', () => {
      const raw = insertRawSource({
        name: 'List Claims Test',
        sourceType: 'savings',
        totalAmount: 40000,
      });

      const { budgetId } = insertRawWorkItemWithSource(raw.id, 15000);
      insertClaimedInvoice(budgetId, 6000);

      const results = budgetSourceService.listBudgetSources(db);
      const source = results.find((s) => s.id === raw.id)!;

      expect(source.claimedAmount).toBe(6000);
      expect(source.actualAvailableAmount).toBe(34000); // 40000 - 6000
    });

    it('createBudgetSource returns claimedAmount=0 and actualAvailableAmount=totalAmount', () => {
      const data: CreateBudgetSourceRequest = {
        name: 'New Source Claimed',
        sourceType: 'other',
        totalAmount: 25000,
      };

      const result = budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);

      expect(result.claimedAmount).toBe(0);
      expect(result.actualAvailableAmount).toBe(25000);
    });

    it('updateBudgetSource reflects updated totalAmount in actualAvailableAmount', () => {
      const raw = insertRawSource({
        name: 'Update Amount Claimed',
        sourceType: 'bank_loan',
        totalAmount: 100000,
      });

      const { budgetId } = insertRawWorkItemWithSource(raw.id, 40000);
      insertClaimedInvoice(budgetId, 15000);

      // Update totalAmount
      const updated = budgetSourceService.updateBudgetSource(db, raw.id, { totalAmount: 120000 });

      expect(updated.claimedAmount).toBe(15000);
      expect(updated.actualAvailableAmount).toBe(105000); // 120000 - 15000
    });

    it('actualAvailableAmount can go negative when claimedAmount exceeds totalAmount', () => {
      // Edge case: claimed invoices may sum to more than the budget source total
      const raw = insertRawSource({
        name: 'Over-Claimed Source',
        sourceType: 'savings',
        totalAmount: 5000,
      });

      const { budgetId } = insertRawWorkItemWithSource(raw.id, 10000);
      insertClaimedInvoice(budgetId, 7000); // more than totalAmount

      const result = budgetSourceService.getBudgetSourceById(db, raw.id);

      expect(result.claimedAmount).toBe(7000);
      expect(result.actualAvailableAmount).toBe(-2000); // 5000 - 7000
    });
  });

  // ─── unclaimedAmount (paid but not claimed invoices) ──────────────────────

  describe('unclaimedAmount', () => {
    it('returns unclaimedAmount=0 when no paid invoices exist', () => {
      const raw = insertRawSource({
        name: 'No Paid Source',
        sourceType: 'bank_loan',
        totalAmount: 80000,
      });

      const result = budgetSourceService.getBudgetSourceById(db, raw.id);

      expect(result.unclaimedAmount).toBe(0);
    });

    it('sums paid invoice amounts from budget lines referencing the source', () => {
      const raw = insertRawSource({
        name: 'Paid Invoices Source',
        sourceType: 'savings',
        totalAmount: 100000,
      });

      const { budgetId: budgetId1 } = insertRawWorkItemWithSource(raw.id, 20000);
      const { budgetId: budgetId2 } = insertRawWorkItemWithSource(raw.id, 10000);

      insertPaidInvoice(budgetId1, 6000);
      insertPaidInvoice(budgetId2, 4000);

      const result = budgetSourceService.getBudgetSourceById(db, raw.id);

      expect(result.unclaimedAmount).toBe(10000); // 6000 + 4000
    });

    it('does NOT count claimed invoices in unclaimedAmount (only status=paid counts)', () => {
      const raw = insertRawSource({
        name: 'Claimed Not Paid Source',
        sourceType: 'bank_loan',
        totalAmount: 60000,
      });

      const { budgetId } = insertRawWorkItemWithSource(raw.id, 25000);
      insertClaimedInvoice(budgetId, 9000); // claimed — should NOT count toward unclaimedAmount
      insertPaidInvoice(budgetId, 3000); // paid — SHOULD count toward unclaimedAmount

      const result = budgetSourceService.getBudgetSourceById(db, raw.id);

      expect(result.unclaimedAmount).toBe(3000); // only the paid invoice
      expect(result.claimedAmount).toBe(9000); // only the claimed invoice
    });

    it('does NOT count paid invoices from budget lines referencing a different source', () => {
      const rawA = insertRawSource({
        name: 'Source A Paid',
        sourceType: 'bank_loan',
        totalAmount: 100000,
      });
      const rawB = insertRawSource({
        name: 'Source B No Paid',
        sourceType: 'savings',
        totalAmount: 50000,
      });

      const { budgetId: budgetIdA } = insertRawWorkItemWithSource(rawA.id, 20000);
      insertPaidInvoice(budgetIdA, 5000); // belongs to source A, not B

      const resultA = budgetSourceService.getBudgetSourceById(db, rawA.id);
      const resultB = budgetSourceService.getBudgetSourceById(db, rawB.id);

      expect(resultA.unclaimedAmount).toBe(5000);
      expect(resultB.unclaimedAmount).toBe(0);
    });

    it('accumulates multiple paid invoices on the same budget line', () => {
      const raw = insertRawSource({
        name: 'Multi-Paid Source',
        sourceType: 'credit_line',
        totalAmount: 200000,
      });

      const { budgetId } = insertRawWorkItemWithSource(raw.id, 50000);
      insertPaidInvoice(budgetId, 3000);
      insertPaidInvoice(budgetId, 7000);
      insertPaidInvoice(budgetId, 1500);

      const result = budgetSourceService.getBudgetSourceById(db, raw.id);

      expect(result.unclaimedAmount).toBe(11500); // 3000 + 7000 + 1500
    });

    it('listBudgetSources also returns unclaimedAmount', () => {
      const raw = insertRawSource({
        name: 'List Paid Test',
        sourceType: 'savings',
        totalAmount: 40000,
      });

      const { budgetId } = insertRawWorkItemWithSource(raw.id, 15000);
      insertPaidInvoice(budgetId, 8000);

      const results = budgetSourceService.listBudgetSources(db);
      const source = results.find((s) => s.id === raw.id)!;

      expect(source.unclaimedAmount).toBe(8000);
    });

    it('createBudgetSource returns unclaimedAmount=0 for a new source', () => {
      const data: CreateBudgetSourceRequest = {
        name: 'New Source Unclaimed',
        sourceType: 'other',
        totalAmount: 25000,
      };

      const result = budgetSourceService.createBudgetSource(db, data, TEST_USER_ID);

      expect(result.unclaimedAmount).toBe(0);
    });

    it('correctly tracks both claimedAmount and unclaimedAmount independently', () => {
      // A source with a mix of claimed and paid invoices across multiple budget lines
      const raw = insertRawSource({
        name: 'Mixed Invoice Source',
        sourceType: 'bank_loan',
        totalAmount: 300000,
      });

      const { budgetId: b1 } = insertRawWorkItemWithSource(raw.id, 50000);
      const { budgetId: b2 } = insertRawWorkItemWithSource(raw.id, 30000);

      insertClaimedInvoice(b1, 12000); // claimed
      insertPaidInvoice(b1, 5000); // paid (unclaimed)
      insertClaimedInvoice(b2, 8000); // claimed
      insertPaidInvoice(b2, 3000); // paid (unclaimed)

      const result = budgetSourceService.getBudgetSourceById(db, raw.id);

      expect(result.claimedAmount).toBe(20000); // 12000 + 8000
      expect(result.unclaimedAmount).toBe(8000); // 5000 + 3000
      // actualAvailableAmount is based on claimedAmount only
      expect(result.actualAvailableAmount).toBe(280000); // 300000 - 20000
    });
  });
});
