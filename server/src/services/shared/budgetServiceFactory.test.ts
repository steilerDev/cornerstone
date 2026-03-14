import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../../db/migrate.js';
import * as schema from '../../db/schema.js';
import { NotFoundError, ValidationError, BudgetLineInUseError } from '../../errors/AppError.js';
import {
  listWorkItemBudgets,
  createWorkItemBudget,
  updateWorkItemBudget,
  deleteWorkItemBudget,
} from '../workItemBudgetService.js';
import {
  listHouseholdItemBudgets,
  createHouseholdItemBudget,
  updateHouseholdItemBudget,
  deleteHouseholdItemBudget,
} from '../householdItemBudgetService.js';
import { resolveRelationsBatch } from './budgetServiceFactory.js';
import { eq } from 'drizzle-orm';

// ─── Test database helpers ─────────────────────────────────────────────────────

describe('budgetServiceFactory — createBudgetService()', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let idCounter = 0;

  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  function insertTestUser(id = 'user-001') {
    const now = new Date().toISOString();
    db.insert(schema.users)
      .values({
        id,
        email: `${id}@example.com`,
        displayName: 'Test User',
        role: 'member',
        authProvider: 'local',
        passwordHash: 'hashed',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertWorkItem(title = 'Test Work Item', userId = 'user-001') {
    const id = `wi-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.workItems)
      .values({
        id,
        title,
        status: 'not_started',
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertHouseholdItem(name = 'Test Household Item', userId = 'user-001') {
    const id = `hi-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    // hic-furniture is seeded by migration 0016
    db.insert(schema.householdItems)
      .values({
        id,
        name,
        categoryId: 'hic-furniture',
        status: 'planned',
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertBudgetCategory(name = 'Test Category') {
    const id = `bc-test-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.budgetCategories)
      .values({
        id,
        name,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertBudgetSource(name = 'Test Source', userId = 'user-001') {
    const id = `bs-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.budgetSources)
      .values({
        id,
        name,
        sourceType: 'savings',
        totalAmount: 50000,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertVendor(name = 'Test Vendor', userId = 'user-001') {
    const id = `v-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.vendors)
      .values({
        id,
        name,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertInvoiceForWorkItemBudget(
    workItemBudgetId: string,
    vendorId: string,
    opts: { amount?: number; status?: 'pending' | 'paid' | 'claimed' } = {},
  ) {
    const id = `inv-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    const amount = opts.amount ?? 100;
    db.insert(schema.invoices)
      .values({
        id,
        vendorId,
        amount,
        date: '2025-01-01',
        status: opts.status ?? 'pending',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.invoiceBudgetLines)
      .values({
        id: randomUUID(),
        invoiceId: id,
        workItemBudgetId,
        itemizedAmount: amount,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertInvoiceForHouseholdItemBudget(
    householdItemBudgetId: string,
    vendorId: string,
    opts: { amount?: number; status?: 'pending' | 'paid' | 'claimed' } = {},
  ) {
    const id = `inv-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    const amount = opts.amount ?? 100;
    db.insert(schema.invoices)
      .values({
        id,
        vendorId,
        amount,
        date: '2025-01-01',
        status: opts.status ?? 'pending',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.invoiceBudgetLines)
      .values({
        id: randomUUID(),
        invoiceId: id,
        householdItemBudgetId,
        itemizedAmount: amount,
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
    idCounter = 0;
    insertTestUser();
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── Factory shape ─────────────────────────────────────────────────────────

  describe('factory shape', () => {
    it('returns service object with list, create, update, delete methods (work-item config)', () => {
      // Test via the exported wrapper functions that delegate to the factory service
      expect(typeof listWorkItemBudgets).toBe('function');
      expect(typeof createWorkItemBudget).toBe('function');
      expect(typeof updateWorkItemBudget).toBe('function');
      expect(typeof deleteWorkItemBudget).toBe('function');
    });

    it('returns service object with list, create, update, delete methods (household-item config)', () => {
      expect(typeof listHouseholdItemBudgets).toBe('function');
      expect(typeof createHouseholdItemBudget).toBe('function');
      expect(typeof updateHouseholdItemBudget).toBe('function');
      expect(typeof deleteHouseholdItemBudget).toBe('function');
    });

    it('two factory instances created with different configs are independent', () => {
      const workItemId = insertWorkItem();
      const hiId = insertHouseholdItem();

      createWorkItemBudget(db, workItemId, 'user-001', {
        plannedAmount: 500,
        budgetSourceId: 'discretionary-system',
      });

      expect(listWorkItemBudgets(db, workItemId)).toHaveLength(1);
      expect(listHouseholdItemBudgets(db, hiId)).toHaveLength(0);
    });
  });

  // ─── list() ───────────────────────────────────────────────────────────────

  describe('list()', () => {
    describe('work-item configuration', () => {
      it('returns empty array when no budget lines exist', () => {
        const workItemId = insertWorkItem();
        expect(listWorkItemBudgets(db, workItemId)).toEqual([]);
      });

      it('returns all budget lines ordered by createdAt', () => {
        const workItemId = insertWorkItem();
        // Insert two lines — the factory orders by createdAt ASC
        const line1 = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 100,
          description: 'First line',
          budgetSourceId: 'discretionary-system',
        });
        const line2 = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 200,
          description: 'Second line',
          budgetSourceId: 'discretionary-system',
        });

        const result = listWorkItemBudgets(db, workItemId);

        expect(result).toHaveLength(2);
        expect(result[0].id).toBe(line1.id);
        expect(result[1].id).toBe(line2.id);
      });

      it('throws NotFoundError for missing work item', () => {
        expect(() => {
          listWorkItemBudgets(db, 'non-existent-wi');
        }).toThrow(NotFoundError);

        expect(() => {
          listWorkItemBudgets(db, 'non-existent-wi');
        }).toThrow('Work item not found');
      });

      it('does not return budget lines from other work items', () => {
        const workItemId1 = insertWorkItem('Item 1');
        const workItemId2 = insertWorkItem('Item 2');

        createWorkItemBudget(db, workItemId2, 'user-001', {
          plannedAmount: 999,
          budgetSourceId: 'discretionary-system',
        });

        expect(listWorkItemBudgets(db, workItemId1)).toHaveLength(0);
      });

      it('returns invoice aggregates for each budget line', () => {
        const workItemId = insertWorkItem();
        const vendorId = insertVendor();

        // Each budget line can only link to ONE invoice (partial UNIQUE index on work_item_budget_id)
        // Use two separate budget lines — each with its own invoice
        const lineA = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 300,
          description: 'Line A (paid)',
          budgetSourceId: 'discretionary-system',
        });
        const lineB = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 200,
          description: 'Line B (pending)',
          budgetSourceId: 'discretionary-system',
        });
        insertInvoiceForWorkItemBudget(lineA.id, vendorId, { amount: 150, status: 'paid' });
        insertInvoiceForWorkItemBudget(lineB.id, vendorId, { amount: 75, status: 'pending' });

        const result = listWorkItemBudgets(db, workItemId);

        expect(result).toHaveLength(2);
        // Line A: 1 paid invoice
        const resultA = result.find((r) => r.id === lineA.id)!;
        expect(resultA.invoiceCount).toBe(1);
        expect(resultA.actualCost).toBe(150);
        expect(resultA.actualCostPaid).toBe(150);
        // Line B: 1 pending invoice
        const resultB = result.find((r) => r.id === lineB.id)!;
        expect(resultB.invoiceCount).toBe(1);
        expect(resultB.actualCost).toBe(75);
        expect(resultB.actualCostPaid).toBe(0); // pending does not count
      });
    });

    describe('household-item configuration', () => {
      it('returns empty array when no budget lines exist', () => {
        const hiId = insertHouseholdItem();
        expect(listHouseholdItemBudgets(db, hiId)).toEqual([]);
      });

      it('throws NotFoundError for missing household item', () => {
        expect(() => {
          listHouseholdItemBudgets(db, 'non-existent-hi');
        }).toThrow(NotFoundError);

        expect(() => {
          listHouseholdItemBudgets(db, 'non-existent-hi');
        }).toThrow('Household item not found');
      });

      it('does not return budget lines from other household items', () => {
        const hiId1 = insertHouseholdItem('Sofa');
        const hiId2 = insertHouseholdItem('Fridge');

        createHouseholdItemBudget(db, hiId2, 'user-001', {
          plannedAmount: 800,
          budgetSourceId: 'discretionary-system',
        });

        expect(listHouseholdItemBudgets(db, hiId1)).toHaveLength(0);
      });

      it('does NOT include an invoices list on household item budget lines', () => {
        const hiId = insertHouseholdItem();
        createHouseholdItemBudget(db, hiId, 'user-001', {
          plannedAmount: 300,
          budgetSourceId: 'discretionary-system',
        });

        const result = listHouseholdItemBudgets(db, hiId);

        expect(result).toHaveLength(1);
        // HI budget lines don't expose an invoices array
        expect((result[0] as any).invoices).toBeUndefined();
      });

      it('returns invoice aggregates from household_item_budget_id column', () => {
        const hiId = insertHouseholdItem();
        const vendorId = insertVendor();

        const line = createHouseholdItemBudget(db, hiId, 'user-001', {
          plannedAmount: 400,
          budgetSourceId: 'discretionary-system',
        });
        insertInvoiceForHouseholdItemBudget(line.id, vendorId, { amount: 200, status: 'claimed' });

        const result = listHouseholdItemBudgets(db, hiId);

        expect(result[0].invoiceCount).toBe(1);
        expect(result[0].actualCost).toBe(200);
        expect(result[0].actualCostPaid).toBe(200); // claimed counts as paid
      });
    });
  });

  // ─── create() ─────────────────────────────────────────────────────────────

  describe('create()', () => {
    describe('work-item configuration', () => {
      it('creates a budget line and returns it with all relations resolved', () => {
        const workItemId = insertWorkItem('Foundation Work');
        const categoryId = insertBudgetCategory('Structural');
        const sourceId = insertBudgetSource('Savings');
        const vendorId = insertVendor('Contractor Co.');

        const result = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 15000,
          description: 'Concrete foundation pour',
          confidence: 'professional_estimate',
          budgetCategoryId: categoryId,
          budgetSourceId: sourceId,
          vendorId,
        });

        expect(result.id).toBeDefined();
        expect(result.workItemId).toBe(workItemId);
        expect(result.plannedAmount).toBe(15000);
        expect(result.description).toBe('Concrete foundation pour');
        expect(result.confidence).toBe('professional_estimate');
        expect(result.confidenceMargin).toBe(0.1); // professional_estimate = ±10%
        expect(result.budgetCategory?.id).toBe(categoryId);
        expect(result.budgetSource?.id).toBe(sourceId);
        expect(result.vendor?.id).toBe(vendorId);
        expect(result.createdBy?.id).toBe('user-001');
        expect(result.actualCost).toBe(0);
        expect(result.actualCostPaid).toBe(0);
        expect(result.invoiceCount).toBe(0);
        expect(result.invoiceLink).toBeNull();
        expect(result.createdAt).toBeDefined();
        expect(result.updatedAt).toBeDefined();
      });

      it('defaults confidence to own_estimate when not provided', () => {
        const workItemId = insertWorkItem();

        const result = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 500,
          budgetSourceId: 'discretionary-system',
        });

        expect(result.confidence).toBe('own_estimate');
        expect(result.confidenceMargin).toBe(0.2); // own_estimate = ±20%
      });

      it('creates with null optional fields when not provided', () => {
        const workItemId = insertWorkItem();

        const result = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 100,
          budgetSourceId: 'discretionary-system',
        });

        expect(result.description).toBeNull();
        expect(result.budgetCategory).toBeNull();
        expect(result.budgetSource).not.toBeNull(); // discretionary-system is always present
        expect(result.vendor).toBeNull();
      });

      it('accepts plannedAmount of 0', () => {
        const workItemId = insertWorkItem();

        const result = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 0,
          budgetSourceId: 'discretionary-system',
        });

        expect(result.plannedAmount).toBe(0);
      });

      it('throws ValidationError when plannedAmount is negative', () => {
        const workItemId = insertWorkItem();

        expect(() => {
          createWorkItemBudget(db, workItemId, 'user-001', { plannedAmount: -1 });
        }).toThrow(ValidationError);

        expect(() => {
          createWorkItemBudget(db, workItemId, 'user-001', { plannedAmount: -1 });
        }).toThrow('plannedAmount must be >= 0');
      });

      it('throws ValidationError when plannedAmount is missing', () => {
        const workItemId = insertWorkItem();

        expect(() => {
          createWorkItemBudget(db, workItemId, 'user-001', {
            plannedAmount: null as unknown as number,
          });
        }).toThrow(ValidationError);
      });

      it('throws ValidationError when description exceeds 500 characters', () => {
        const workItemId = insertWorkItem();

        expect(() => {
          createWorkItemBudget(db, workItemId, 'user-001', {
            plannedAmount: 100,
            description: 'x'.repeat(501),
          });
        }).toThrow(ValidationError);

        expect(() => {
          createWorkItemBudget(db, workItemId, 'user-001', {
            plannedAmount: 100,
            description: 'x'.repeat(501),
          });
        }).toThrow('Description must not exceed 500 characters');
      });

      it('accepts description at exactly 500 characters', () => {
        const workItemId = insertWorkItem();

        const result = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 100,
          description: 'x'.repeat(500),
          budgetSourceId: 'discretionary-system',
        });

        expect(result.description).toBe('x'.repeat(500));
      });

      it('throws ValidationError when budgetCategoryId does not exist', () => {
        const workItemId = insertWorkItem();

        expect(() => {
          createWorkItemBudget(db, workItemId, 'user-001', {
            plannedAmount: 100,
            budgetCategoryId: 'non-existent-category',
          });
        }).toThrow(ValidationError);

        expect(() => {
          createWorkItemBudget(db, workItemId, 'user-001', {
            plannedAmount: 100,
            budgetCategoryId: 'non-existent-category',
          });
        }).toThrow('Budget category not found');
      });

      it('throws ValidationError when budgetSourceId does not exist', () => {
        const workItemId = insertWorkItem();

        expect(() => {
          createWorkItemBudget(db, workItemId, 'user-001', {
            plannedAmount: 100,
            budgetSourceId: 'non-existent-source',
          });
        }).toThrow(ValidationError);
      });

      it('throws ValidationError when budgetSourceId is missing', () => {
        const workItemId = insertWorkItem();

        expect(() => {
          createWorkItemBudget(db, workItemId, 'user-001', {
            plannedAmount: 100,
          });
        }).toThrow(ValidationError);

        expect(() => {
          createWorkItemBudget(db, workItemId, 'user-001', {
            plannedAmount: 100,
          });
        }).toThrow('budgetSourceId is required');
      });

      it('throws ValidationError when budgetSourceId is explicitly null', () => {
        const workItemId = insertWorkItem();

        expect(() => {
          createWorkItemBudget(db, workItemId, 'user-001', {
            plannedAmount: 100,
            budgetSourceId: null as unknown as string,
          });
        }).toThrow(ValidationError);

        expect(() => {
          createWorkItemBudget(db, workItemId, 'user-001', {
            plannedAmount: 100,
            budgetSourceId: null as unknown as string,
          });
        }).toThrow('budgetSourceId is required');
      });

      it('throws ValidationError when budgetSourceId is empty string', () => {
        const workItemId = insertWorkItem();

        expect(() => {
          createWorkItemBudget(db, workItemId, 'user-001', {
            plannedAmount: 100,
            budgetSourceId: '',
          });
        }).toThrow(ValidationError);

        expect(() => {
          createWorkItemBudget(db, workItemId, 'user-001', {
            plannedAmount: 100,
            budgetSourceId: '',
          });
        }).toThrow('budgetSourceId is required');
      });

      it('succeeds with valid budgetSourceId and returns line with budgetSource resolved', () => {
        const workItemId = insertWorkItem();
        const sourceId = insertBudgetSource('Primary Funding');

        const result = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 1500,
          budgetSourceId: sourceId,
        });

        expect(result.budgetSource).not.toBeNull();
        expect(result.budgetSource?.id).toBe(sourceId);
        expect(result.budgetSource?.name).toBe('Primary Funding');
      });

      it('throws ValidationError when vendorId does not exist', () => {
        const workItemId = insertWorkItem();

        expect(() => {
          createWorkItemBudget(db, workItemId, 'user-001', {
            plannedAmount: 100,
            vendorId: 'non-existent-vendor',
          });
        }).toThrow(ValidationError);
      });

      it('throws ValidationError for invalid confidence level', () => {
        const workItemId = insertWorkItem();

        expect(() => {
          createWorkItemBudget(db, workItemId, 'user-001', {
            plannedAmount: 100,
            confidence: 'invalid_level' as any,
          });
        }).toThrow(ValidationError);
      });

      it('throws NotFoundError for missing work item', () => {
        expect(() => {
          createWorkItemBudget(db, 'non-existent-wi', 'user-001', { plannedAmount: 100 });
        }).toThrow(NotFoundError);

        expect(() => {
          createWorkItemBudget(db, 'non-existent-wi', 'user-001', { plannedAmount: 100 });
        }).toThrow('Work item not found');
      });

      it('includes invoiceLink field (null) when no invoices linked', () => {
        const workItemId = insertWorkItem();

        const result = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 100,
          budgetSourceId: 'discretionary-system',
        });

        expect(result.invoiceLink).toBeNull();
      });
    });

    describe('household-item configuration', () => {
      it('always assigns budgetCategoryId to bc-household-items regardless of input', () => {
        const hiId = insertHouseholdItem();
        const otherCategoryId = insertBudgetCategory('Structural');

        // Client sends a different budgetCategoryId — it should be stripped
        const result = createHouseholdItemBudget(db, hiId, 'user-001', {
          plannedAmount: 500,
          budgetCategoryId: otherCategoryId,
          budgetSourceId: 'discretionary-system',
        });

        expect(result.budgetCategory?.id).toBe('bc-household-items');
      });

      it('auto-assigns bc-household-items even when budgetCategoryId is not provided', () => {
        const hiId = insertHouseholdItem();

        const result = createHouseholdItemBudget(db, hiId, 'user-001', {
          plannedAmount: 500,
          budgetSourceId: 'discretionary-system',
        });

        expect(result.budgetCategory?.id).toBe('bc-household-items');
      });

      it('creates a budget line with all allowed fields', () => {
        const hiId = insertHouseholdItem('Sofa');
        const sourceId = insertBudgetSource('Home Equity');
        const vendorId = insertVendor('IKEA');

        const result = createHouseholdItemBudget(db, hiId, 'user-001', {
          plannedAmount: 1200,
          description: 'Large sectional sofa',
          confidence: 'quote',
          budgetSourceId: sourceId,
          vendorId,
        });

        expect(result.householdItemId).toBe(hiId);
        expect(result.plannedAmount).toBe(1200);
        expect(result.description).toBe('Large sectional sofa');
        expect(result.confidence).toBe('quote');
        expect(result.budgetSource?.id).toBe(sourceId);
        expect(result.vendor?.id).toBe(vendorId);
        expect(result.budgetCategory?.id).toBe('bc-household-items');
      });

      it('throws ValidationError when budgetSourceId is missing', () => {
        const hiId = insertHouseholdItem();

        expect(() => {
          createHouseholdItemBudget(db, hiId, 'user-001', {
            plannedAmount: 100,
          });
        }).toThrow(ValidationError);

        expect(() => {
          createHouseholdItemBudget(db, hiId, 'user-001', {
            plannedAmount: 100,
          });
        }).toThrow('budgetSourceId is required');
      });

      it('throws ValidationError when budgetSourceId is explicitly null', () => {
        const hiId = insertHouseholdItem();

        expect(() => {
          createHouseholdItemBudget(db, hiId, 'user-001', {
            plannedAmount: 100,
            budgetSourceId: null as unknown as string,
          });
        }).toThrow(ValidationError);

        expect(() => {
          createHouseholdItemBudget(db, hiId, 'user-001', {
            plannedAmount: 100,
            budgetSourceId: null as unknown as string,
          });
        }).toThrow('budgetSourceId is required');
      });

      it('throws ValidationError when budgetSourceId is empty string', () => {
        const hiId = insertHouseholdItem();

        expect(() => {
          createHouseholdItemBudget(db, hiId, 'user-001', {
            plannedAmount: 100,
            budgetSourceId: '',
          });
        }).toThrow(ValidationError);

        expect(() => {
          createHouseholdItemBudget(db, hiId, 'user-001', {
            plannedAmount: 100,
            budgetSourceId: '',
          });
        }).toThrow('budgetSourceId is required');
      });

      it('throws ValidationError when budgetSourceId does not exist', () => {
        const hiId = insertHouseholdItem();

        expect(() => {
          createHouseholdItemBudget(db, hiId, 'user-001', {
            plannedAmount: 100,
            budgetSourceId: 'non-existent-source',
          });
        }).toThrow(ValidationError);
      });

      it('succeeds with valid budgetSourceId and returns line with budgetSource resolved', () => {
        const hiId = insertHouseholdItem();
        const sourceId = insertBudgetSource('Grant Program');

        const result = createHouseholdItemBudget(db, hiId, 'user-001', {
          plannedAmount: 800,
          budgetSourceId: sourceId,
        });

        expect(result.budgetSource).not.toBeNull();
        expect(result.budgetSource?.id).toBe(sourceId);
        expect(result.budgetSource?.name).toBe('Grant Program');
      });

      it('throws NotFoundError for missing household item', () => {
        expect(() => {
          createHouseholdItemBudget(db, 'non-existent-hi', 'user-001', { plannedAmount: 100 });
        }).toThrow(NotFoundError);

        expect(() => {
          createHouseholdItemBudget(db, 'non-existent-hi', 'user-001', { plannedAmount: 100 });
        }).toThrow('Household item not found');
      });

      it('does NOT include invoices field on household item budget lines', () => {
        const hiId = insertHouseholdItem();

        const result = createHouseholdItemBudget(db, hiId, 'user-001', {
          plannedAmount: 200,
          budgetSourceId: 'discretionary-system',
        });

        expect((result as any).invoices).toBeUndefined();
      });
    });
  });

  // ─── update() ─────────────────────────────────────────────────────────────

  describe('update()', () => {
    describe('work-item configuration', () => {
      it('updates individual fields (description)', () => {
        const workItemId = insertWorkItem();
        const line = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 500,
          description: 'Original description',
          budgetSourceId: 'discretionary-system',
        });

        const updated = updateWorkItemBudget(db, workItemId, line.id, {
          description: 'Updated description',
        });

        expect(updated.description).toBe('Updated description');
        expect(updated.plannedAmount).toBe(500); // unchanged
      });

      it('updates plannedAmount', () => {
        const workItemId = insertWorkItem();
        const line = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 500,
          budgetSourceId: 'discretionary-system',
        });

        const updated = updateWorkItemBudget(db, workItemId, line.id, { plannedAmount: 750 });

        expect(updated.plannedAmount).toBe(750);
      });

      it('updates confidence level', () => {
        const workItemId = insertWorkItem();
        const line = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 500,
          confidence: 'own_estimate',
          budgetSourceId: 'discretionary-system',
        });

        const updated = updateWorkItemBudget(db, workItemId, line.id, {
          confidence: 'invoice',
        });

        expect(updated.confidence).toBe('invoice');
        expect(updated.confidenceMargin).toBe(0); // invoice = ±0%
      });

      it('clears nullable fields with null', () => {
        const workItemId = insertWorkItem();
        const categoryId = insertBudgetCategory();
        const line = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 500,
          description: 'Some description',
          budgetCategoryId: categoryId,
          budgetSourceId: 'discretionary-system',
        });

        const updated = updateWorkItemBudget(db, workItemId, line.id, {
          description: null,
          budgetCategoryId: null,
        });

        expect(updated.description).toBeNull();
        expect(updated.budgetCategory).toBeNull();
      });

      it('updates budgetCategoryId, budgetSourceId, vendorId', () => {
        const workItemId = insertWorkItem();
        const line = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 100,
          budgetSourceId: 'discretionary-system',
        });
        const categoryId = insertBudgetCategory('Electrical');
        const sourceId = insertBudgetSource('Loan');
        const vendorId = insertVendor('Sparks Inc.');

        const updated = updateWorkItemBudget(db, workItemId, line.id, {
          budgetCategoryId: categoryId,
          budgetSourceId: sourceId,
          vendorId,
        });

        expect(updated.budgetCategory?.id).toBe(categoryId);
        expect(updated.budgetSource?.id).toBe(sourceId);
        expect(updated.vendor?.id).toBe(vendorId);
      });

      it('throws NotFoundError for missing budget line', () => {
        const workItemId = insertWorkItem();

        expect(() => {
          updateWorkItemBudget(db, workItemId, 'non-existent-budget', { plannedAmount: 500 });
        }).toThrow(NotFoundError);

        expect(() => {
          updateWorkItemBudget(db, workItemId, 'non-existent-budget', { plannedAmount: 500 });
        }).toThrow('Budget line not found');
      });

      it('throws NotFoundError for missing work item', () => {
        expect(() => {
          updateWorkItemBudget(db, 'non-existent-wi', 'some-budget', { plannedAmount: 500 });
        }).toThrow(NotFoundError);
      });

      it('throws ValidationError when updating plannedAmount to negative', () => {
        const workItemId = insertWorkItem();
        const line = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 500,
          budgetSourceId: 'discretionary-system',
        });

        expect(() => {
          updateWorkItemBudget(db, workItemId, line.id, { plannedAmount: -50 });
        }).toThrow(ValidationError);
      });

      it('throws ValidationError when updating description beyond 500 characters', () => {
        const workItemId = insertWorkItem();
        const line = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 100,
          budgetSourceId: 'discretionary-system',
        });

        expect(() => {
          updateWorkItemBudget(db, workItemId, line.id, { description: 'x'.repeat(501) });
        }).toThrow(ValidationError);
      });

      it('throws ValidationError for invalid confidence in update', () => {
        const workItemId = insertWorkItem();
        const line = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 100,
          budgetSourceId: 'discretionary-system',
        });

        expect(() => {
          updateWorkItemBudget(db, workItemId, line.id, { confidence: 'bad_level' as any });
        }).toThrow(ValidationError);
      });

      it('throws ValidationError when updating budgetCategoryId to non-existent', () => {
        const workItemId = insertWorkItem();
        const line = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 100,
          budgetSourceId: 'discretionary-system',
        });

        expect(() => {
          updateWorkItemBudget(db, workItemId, line.id, {
            budgetCategoryId: 'non-existent-cat',
          });
        }).toThrow(ValidationError);
      });

      it('throws ValidationError when attempting to remove budgetSourceId (set to null)', () => {
        const workItemId = insertWorkItem();
        const sourceId = insertBudgetSource('Original Source');
        const line = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 100,
          budgetSourceId: sourceId,
        });

        expect(() => {
          updateWorkItemBudget(db, workItemId, line.id, {
            budgetSourceId: null as unknown as string,
          });
        }).toThrow(ValidationError);

        expect(() => {
          updateWorkItemBudget(db, workItemId, line.id, {
            budgetSourceId: null as unknown as string,
          });
        }).toThrow('budgetSourceId cannot be removed');
      });

      it('throws ValidationError when attempting to set budgetSourceId to empty string', () => {
        const workItemId = insertWorkItem();
        const sourceId = insertBudgetSource('Original Source');
        const line = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 100,
          budgetSourceId: sourceId,
        });

        expect(() => {
          updateWorkItemBudget(db, workItemId, line.id, {
            budgetSourceId: '',
          });
        }).toThrow(ValidationError);

        expect(() => {
          updateWorkItemBudget(db, workItemId, line.id, {
            budgetSourceId: '',
          });
        }).toThrow('budgetSourceId cannot be removed');
      });

      it('throws ValidationError when updating budgetSourceId to non-existent', () => {
        const workItemId = insertWorkItem();
        const sourceId = insertBudgetSource('Original Source');
        const line = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 100,
          budgetSourceId: sourceId,
        });

        expect(() => {
          updateWorkItemBudget(db, workItemId, line.id, {
            budgetSourceId: 'non-existent-source',
          });
        }).toThrow(ValidationError);
      });

      it('allows changing budgetSourceId to a different valid source', () => {
        const workItemId = insertWorkItem();
        const sourceId1 = insertBudgetSource('Source 1');
        const sourceId2 = insertBudgetSource('Source 2');
        const line = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 100,
          budgetSourceId: sourceId1,
        });

        const updated = updateWorkItemBudget(db, workItemId, line.id, {
          budgetSourceId: sourceId2,
        });

        expect(updated.budgetSource?.id).toBe(sourceId2);
        expect(updated.budgetSource?.name).toBe('Source 2');
      });

      it('cannot update a budget line belonging to a different work item', () => {
        const workItemId1 = insertWorkItem('Item 1');
        const workItemId2 = insertWorkItem('Item 2');
        const line = createWorkItemBudget(db, workItemId1, 'user-001', {
          plannedAmount: 100,
          budgetSourceId: 'discretionary-system',
        });

        // Attempt to update line using workItemId2 — should fail as NotFoundError
        expect(() => {
          updateWorkItemBudget(db, workItemId2, line.id, { plannedAmount: 999 });
        }).toThrow(NotFoundError);
      });
    });

    describe('household-item configuration', () => {
      it('updates description', () => {
        const hiId = insertHouseholdItem();
        const line = createHouseholdItemBudget(db, hiId, 'user-001', {
          plannedAmount: 300,
          description: 'Old description',
          budgetSourceId: 'discretionary-system',
        });

        const updated = updateHouseholdItemBudget(db, hiId, line.id, {
          description: 'New description',
        });

        expect(updated.description).toBe('New description');
      });

      it('does NOT update budgetCategoryId even if present in request', () => {
        const hiId = insertHouseholdItem();
        const otherCategoryId = insertBudgetCategory('Plumbing');
        const line = createHouseholdItemBudget(db, hiId, 'user-001', {
          plannedAmount: 200,
          budgetSourceId: 'discretionary-system',
        });

        // bc-household-items should remain even after an update with a different category
        const updated = updateHouseholdItemBudget(db, hiId, line.id, {
          description: 'Updated',
          budgetCategoryId: otherCategoryId,
        } as any);

        // budgetCategoryId from the request is stripped — bc-household-items stays
        expect(updated.budgetCategory?.id).toBe('bc-household-items');
      });

      it('throws NotFoundError for missing household item in update', () => {
        expect(() => {
          updateHouseholdItemBudget(db, 'non-existent-hi', 'some-budget', { plannedAmount: 100 });
        }).toThrow(NotFoundError);
      });

      it('throws NotFoundError for missing budget line in update', () => {
        const hiId = insertHouseholdItem();

        expect(() => {
          updateHouseholdItemBudget(db, hiId, 'non-existent-budget', { plannedAmount: 100 });
        }).toThrow(NotFoundError);
      });

      it('throws ValidationError when attempting to remove budgetSourceId (set to null)', () => {
        const hiId = insertHouseholdItem();
        const sourceId = insertBudgetSource('Original Source');
        const line = createHouseholdItemBudget(db, hiId, 'user-001', {
          plannedAmount: 100,
          budgetSourceId: sourceId,
        });

        expect(() => {
          updateHouseholdItemBudget(db, hiId, line.id, {
            budgetSourceId: null as unknown as string,
          });
        }).toThrow(ValidationError);

        expect(() => {
          updateHouseholdItemBudget(db, hiId, line.id, {
            budgetSourceId: null as unknown as string,
          });
        }).toThrow('budgetSourceId cannot be removed');
      });

      it('throws ValidationError when attempting to set budgetSourceId to empty string', () => {
        const hiId = insertHouseholdItem();
        const sourceId = insertBudgetSource('Original Source');
        const line = createHouseholdItemBudget(db, hiId, 'user-001', {
          plannedAmount: 100,
          budgetSourceId: sourceId,
        });

        expect(() => {
          updateHouseholdItemBudget(db, hiId, line.id, {
            budgetSourceId: '',
          });
        }).toThrow(ValidationError);

        expect(() => {
          updateHouseholdItemBudget(db, hiId, line.id, {
            budgetSourceId: '',
          });
        }).toThrow('budgetSourceId cannot be removed');
      });

      it('throws ValidationError when updating budgetSourceId to non-existent', () => {
        const hiId = insertHouseholdItem();
        const sourceId = insertBudgetSource('Original Source');
        const line = createHouseholdItemBudget(db, hiId, 'user-001', {
          plannedAmount: 100,
          budgetSourceId: sourceId,
        });

        expect(() => {
          updateHouseholdItemBudget(db, hiId, line.id, {
            budgetSourceId: 'non-existent-source',
          });
        }).toThrow(ValidationError);
      });

      it('allows changing budgetSourceId to a different valid source', () => {
        const hiId = insertHouseholdItem();
        const sourceId1 = insertBudgetSource('Source 1');
        const sourceId2 = insertBudgetSource('Source 2');
        const line = createHouseholdItemBudget(db, hiId, 'user-001', {
          plannedAmount: 100,
          budgetSourceId: sourceId1,
        });

        const updated = updateHouseholdItemBudget(db, hiId, line.id, {
          budgetSourceId: sourceId2,
        });

        expect(updated.budgetSource?.id).toBe(sourceId2);
        expect(updated.budgetSource?.name).toBe('Source 2');
      });
    });
  });

  // ─── delete() ─────────────────────────────────────────────────────────────

  describe('delete()', () => {
    describe('work-item configuration (blockDeleteOnInvoices: true)', () => {
      it('deletes a budget line successfully', () => {
        const workItemId = insertWorkItem();
        const line = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 500,
          budgetSourceId: 'discretionary-system',
        });

        deleteWorkItemBudget(db, workItemId, line.id);

        expect(listWorkItemBudgets(db, workItemId)).toHaveLength(0);
      });

      it('throws NotFoundError for missing work item', () => {
        expect(() => {
          deleteWorkItemBudget(db, 'non-existent-wi', 'some-budget');
        }).toThrow(NotFoundError);
      });

      it('throws NotFoundError for missing budget line', () => {
        const workItemId = insertWorkItem();

        expect(() => {
          deleteWorkItemBudget(db, workItemId, 'non-existent-budget');
        }).toThrow(NotFoundError);

        expect(() => {
          deleteWorkItemBudget(db, workItemId, 'non-existent-budget');
        }).toThrow('Budget line not found');
      });

      it('throws BudgetLineInUseError when invoices are linked', () => {
        const workItemId = insertWorkItem();
        const vendorId = insertVendor();
        const line = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 500,
          budgetSourceId: 'discretionary-system',
        });
        insertInvoiceForWorkItemBudget(line.id, vendorId);

        expect(() => {
          deleteWorkItemBudget(db, workItemId, line.id);
        }).toThrow(BudgetLineInUseError);

        expect(() => {
          deleteWorkItemBudget(db, workItemId, line.id);
        }).toThrow('Budget line has linked invoices and cannot be deleted');
      });

      it('throws BudgetLineInUseError with invoiceCount detail', () => {
        const workItemId = insertWorkItem();
        const vendorId = insertVendor();
        const line = createWorkItemBudget(db, workItemId, 'user-001', {
          plannedAmount: 500,
          budgetSourceId: 'discretionary-system',
        });
        // Each budget line can only link to ONE invoice (partial UNIQUE index on work_item_budget_id)
        insertInvoiceForWorkItemBudget(line.id, vendorId);

        let caughtError: BudgetLineInUseError | undefined;
        try {
          deleteWorkItemBudget(db, workItemId, line.id);
        } catch (err) {
          caughtError = err as BudgetLineInUseError;
        }

        expect(caughtError).toBeDefined();
        expect(caughtError).toBeInstanceOf(BudgetLineInUseError);
        expect(caughtError?.details?.invoiceCount).toBe(1);
      });

      it('cannot delete a budget line belonging to a different work item', () => {
        const workItemId1 = insertWorkItem('Item 1');
        const workItemId2 = insertWorkItem('Item 2');
        const line = createWorkItemBudget(db, workItemId1, 'user-001', {
          plannedAmount: 100,
          budgetSourceId: 'discretionary-system',
        });

        expect(() => {
          deleteWorkItemBudget(db, workItemId2, line.id);
        }).toThrow(NotFoundError);
      });
    });

    describe('household-item configuration (blockDeleteOnInvoices: false)', () => {
      it('deletes successfully even when invoices are linked', () => {
        const hiId = insertHouseholdItem();
        const vendorId = insertVendor();
        const line = createHouseholdItemBudget(db, hiId, 'user-001', {
          plannedAmount: 300,
          budgetSourceId: 'discretionary-system',
        });
        insertInvoiceForHouseholdItemBudget(line.id, vendorId);

        // Should NOT throw — HI budget deletion is allowed even with linked invoices
        expect(() => {
          deleteHouseholdItemBudget(db, hiId, line.id);
        }).not.toThrow();

        expect(listHouseholdItemBudgets(db, hiId)).toHaveLength(0);
      });

      it('deletes a budget line with no invoices successfully', () => {
        const hiId = insertHouseholdItem();
        const line = createHouseholdItemBudget(db, hiId, 'user-001', {
          plannedAmount: 300,
          budgetSourceId: 'discretionary-system',
        });

        deleteHouseholdItemBudget(db, hiId, line.id);

        expect(listHouseholdItemBudgets(db, hiId)).toHaveLength(0);
      });

      it('throws NotFoundError for missing household item', () => {
        expect(() => {
          deleteHouseholdItemBudget(db, 'non-existent-hi', 'some-budget');
        }).toThrow(NotFoundError);
      });

      it('throws NotFoundError for missing budget line', () => {
        const hiId = insertHouseholdItem();

        expect(() => {
          deleteHouseholdItemBudget(db, hiId, 'non-existent-budget');
        }).toThrow(NotFoundError);
      });
    });
  });

  // ─── Invoice aggregates (getInvoiceAggregates) ────────────────────────────

  describe('invoice aggregates', () => {
    it('actualCostPaid includes only paid and claimed invoices, not pending', () => {
      const workItemId = insertWorkItem();
      const vendorId = insertVendor();
      // Each budget line can only link to ONE invoice (partial UNIQUE index on work_item_budget_id).
      // Use three separate budget lines — one per invoice status.
      const linePending = createWorkItemBudget(db, workItemId, 'user-001', {
        plannedAmount: 300,
        description: 'Pending line',
        budgetSourceId: 'discretionary-system',
      });
      const linePaid = createWorkItemBudget(db, workItemId, 'user-001', {
        plannedAmount: 500,
        description: 'Paid line',
        budgetSourceId: 'discretionary-system',
      });
      const lineClaimed = createWorkItemBudget(db, workItemId, 'user-001', {
        plannedAmount: 700,
        description: 'Claimed line',
        budgetSourceId: 'discretionary-system',
      });

      insertInvoiceForWorkItemBudget(linePending.id, vendorId, { amount: 100, status: 'pending' });
      insertInvoiceForWorkItemBudget(linePaid.id, vendorId, { amount: 200, status: 'paid' });
      insertInvoiceForWorkItemBudget(lineClaimed.id, vendorId, { amount: 300, status: 'claimed' });

      const result = listWorkItemBudgets(db, workItemId);

      // Verify across all three lines: total actualCost and actualCostPaid
      const totalActualCost = result.reduce((sum, r) => sum + r.actualCost, 0);
      const totalActualCostPaid = result.reduce((sum, r) => sum + r.actualCostPaid, 0);
      const totalInvoiceCount = result.reduce((sum, r) => sum + r.invoiceCount, 0);

      expect(totalActualCost).toBe(600); // all three: 100+200+300
      expect(totalActualCostPaid).toBe(500); // only paid + claimed: 200+300
      expect(totalInvoiceCount).toBe(3);
    });

    it('returns 0 for all aggregates when no invoices are linked', () => {
      const workItemId = insertWorkItem();
      const line = createWorkItemBudget(db, workItemId, 'user-001', {
        plannedAmount: 500,
        budgetSourceId: 'discretionary-system',
      });

      // Confirm it's not null — already returned from create
      expect(line.actualCost).toBe(0);
      expect(line.actualCostPaid).toBe(0);
      expect(line.invoiceCount).toBe(0);
    });

    it('work item budget includes invoiceLink when invoice is linked', () => {
      const workItemId = insertWorkItem();
      const vendorId = insertVendor('Concrete Co.');
      const line = createWorkItemBudget(db, workItemId, 'user-001', {
        plannedAmount: 500,
        budgetSourceId: 'discretionary-system',
      });
      insertInvoiceForWorkItemBudget(line.id, vendorId, { amount: 250, status: 'paid' });

      const result = listWorkItemBudgets(db, workItemId);

      expect(result[0].invoiceLink).not.toBeNull();
      expect(result[0].invoiceLink?.itemizedAmount).toBe(250);
      expect(result[0].invoiceLink?.invoiceStatus).toBe('paid');
      expect(result[0].invoiceCount).toBe(1);
    });
  });

  // ─── Confidence margins ────────────────────────────────────────────────────

  describe('confidence margins', () => {
    it('own_estimate has 20% margin', () => {
      const workItemId = insertWorkItem();
      const result = createWorkItemBudget(db, workItemId, 'user-001', {
        plannedAmount: 100,
        confidence: 'own_estimate',
        budgetSourceId: 'discretionary-system',
      });
      expect(result.confidenceMargin).toBe(0.2);
    });

    it('professional_estimate has 10% margin', () => {
      const workItemId = insertWorkItem();
      const result = createWorkItemBudget(db, workItemId, 'user-001', {
        plannedAmount: 100,
        confidence: 'professional_estimate',
        budgetSourceId: 'discretionary-system',
      });
      expect(result.confidenceMargin).toBe(0.1);
    });

    it('quote has 5% margin', () => {
      const workItemId = insertWorkItem();
      const result = createWorkItemBudget(db, workItemId, 'user-001', {
        plannedAmount: 100,
        confidence: 'quote',
        budgetSourceId: 'discretionary-system',
      });
      expect(result.confidenceMargin).toBe(0.05);
    });

    it('invoice has 0% margin', () => {
      const workItemId = insertWorkItem();
      const result = createWorkItemBudget(db, workItemId, 'user-001', {
        plannedAmount: 100,
        confidence: 'invoice',
        budgetSourceId: 'discretionary-system',
      });
      expect(result.confidenceMargin).toBe(0);
    });
  });
});

// ─── resolveRelationsBatch() unit tests ────────────────────────────────────────

describe('resolveRelationsBatch()', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let idCounter = 0;

  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    console.warn = () => undefined; // suppress migration logs
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  function insertTestUser(id = 'user-001') {
    const now = new Date().toISOString();
    db.insert(schema.users)
      .values({
        id,
        email: `${id}@example.com`,
        displayName: 'Test User',
        role: 'member',
        authProvider: 'local',
        passwordHash: 'hashed',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertWorkItem(title = 'Test Work Item', userId = 'user-001') {
    const id = `wi-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.workItems)
      .values({
        id,
        title,
        status: 'not_started',
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertBudgetCategory(name = 'Test Category') {
    const id = `bc-test-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.budgetCategories).values({ id, name, createdAt: now, updatedAt: now }).run();
    return id;
  }

  function insertBudgetSource(name = 'Test Source', userId = 'user-001') {
    const id = `bs-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.budgetSources)
      .values({
        id,
        name,
        sourceType: 'savings',
        totalAmount: 10000,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertVendor(name = 'Test Vendor', userId = 'user-001') {
    const id = `v-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.vendors)
      .values({ id, name, createdBy: userId, createdAt: now, updatedAt: now })
      .run();
    return id;
  }

  function insertWorkItemBudgetLine(opts: {
    workItemId: string;
    confidence?: string;
    budgetCategoryId?: string | null;
    budgetSourceId?: string | null;
    vendorId?: string | null;
    createdBy?: string | null;
    plannedAmount?: number;
  }) {
    const id = `wib-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.workItemBudgets)
      .values({
        id,
        workItemId: opts.workItemId,
        plannedAmount: opts.plannedAmount ?? 100,
        confidence: (opts.confidence ?? 'own_estimate') as any,
        budgetCategoryId: opts.budgetCategoryId ?? null,
        budgetSourceId: opts.budgetSourceId ?? null,
        vendorId: opts.vendorId ?? null,
        createdBy: opts.createdBy ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return db.select().from(schema.workItemBudgets).where(eq(schema.workItemBudgets.id, id)).get()!;
  }

  function insertInvoiceLinkedToWorkItemBudget(
    workItemBudgetId: string,
    vendorId: string,
    opts: { amount?: number; status?: 'pending' | 'paid' | 'claimed'; invoiceNumber?: string } = {},
  ) {
    const invoiceId = `inv-${++idCounter}`;
    const iblId = `ibl-${++idCounter}`;
    const amount = opts.amount ?? 100;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.invoices)
      .values({
        id: invoiceId,
        vendorId,
        invoiceNumber: opts.invoiceNumber ?? null,
        amount,
        date: '2025-06-01',
        status: opts.status ?? 'pending',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.invoiceBudgetLines)
      .values({
        id: iblId,
        invoiceId,
        workItemBudgetId,
        itemizedAmount: amount,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return { invoiceId, iblId };
  }

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    idCounter = 0;
    insertTestUser();
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── Empty input ──────────────────────────────────────────────────────────

  it('returns empty Map for empty rows array', () => {
    const result = resolveRelationsBatch(db, [], 'work_item_budget_id');
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it('returns empty Map when called without invoiceBudgetIdColumn and empty rows', () => {
    const result = resolveRelationsBatch(db, []);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  // ─── Single row, all relations populated ─────────────────────────────────

  it('returns correct relations for single row with all relations populated', () => {
    const userId = insertTestUser('user-002');
    const categoryId = insertBudgetCategory('Electrical');
    const sourceId = insertBudgetSource('Savings', userId);
    const vendorId = insertVendor('Sparks Inc.', userId);
    const workItemId = insertWorkItem('Foundation', userId);

    const row = insertWorkItemBudgetLine({
      workItemId,
      confidence: 'professional_estimate',
      budgetCategoryId: categoryId,
      budgetSourceId: sourceId,
      vendorId,
      createdBy: userId,
      plannedAmount: 5000,
    });

    const { invoiceId: _invoiceId, iblId } = insertInvoiceLinkedToWorkItemBudget(row.id, vendorId, {
      amount: 1200,
      status: 'paid',
      invoiceNumber: 'INV-001',
    });

    const result = resolveRelationsBatch(db, [row], 'work_item_budget_id');

    expect(result.size).toBe(1);
    const entry = result.get(row.id)!;
    expect(entry).toBeDefined();

    // Confidence
    expect(entry.confidence).toBe('professional_estimate');
    expect(entry.confidenceMargin).toBe(0.1);

    // Relations
    expect(entry.budgetCategory).not.toBeNull();
    expect(entry.budgetCategory?.id).toBe(categoryId);
    expect(entry.budgetCategory?.name).toBe('Electrical');

    expect(entry.budgetSource).not.toBeNull();
    expect(entry.budgetSource?.id).toBe(sourceId);

    expect(entry.vendor).not.toBeNull();
    expect(entry.vendor?.id).toBe(vendorId);

    expect(entry.createdBy).not.toBeNull();
    expect(entry.createdBy?.id).toBe(userId);

    // Invoice aggregates
    expect(entry.actualCost).toBe(1200);
    expect(entry.actualCostPaid).toBe(1200); // paid invoice
    expect(entry.invoiceCount).toBe(1);

    // Invoice link
    expect(entry.invoiceLink).not.toBeNull();
    expect(entry.invoiceLink?.invoiceBudgetLineId).toBe(iblId);
    expect(entry.invoiceLink?.itemizedAmount).toBe(1200);
    expect(entry.invoiceLink?.invoiceStatus).toBe('paid');
    expect(entry.invoiceLink?.invoiceNumber).toBe('INV-001');
  });

  // ─── Single row, all nullable fields null ─────────────────────────────────

  it('returns null for all nullable relations when row has no FK values', () => {
    const workItemId = insertWorkItem();
    // Insert directly with null FK columns; no createdBy user either
    const row = insertWorkItemBudgetLine({
      workItemId,
      confidence: 'own_estimate',
      budgetCategoryId: null,
      budgetSourceId: null,
      vendorId: null,
      createdBy: null,
    });

    const result = resolveRelationsBatch(db, [row], 'work_item_budget_id');

    expect(result.size).toBe(1);
    const entry = result.get(row.id)!;
    expect(entry.budgetCategory).toBeNull();
    expect(entry.budgetSource).toBeNull();
    expect(entry.vendor).toBeNull();
    expect(entry.createdBy).toBeNull();
    expect(entry.actualCost).toBe(0);
    expect(entry.actualCostPaid).toBe(0);
    expect(entry.invoiceCount).toBe(0);
    expect(entry.invoiceLink).toBeNull();
  });

  // ─── Two rows sharing the same category ───────────────────────────────────

  it('two rows sharing the same category both get the correct category data', () => {
    const workItemId = insertWorkItem();
    const categoryId = insertBudgetCategory('Plumbing');

    const row1 = insertWorkItemBudgetLine({ workItemId, budgetCategoryId: categoryId });
    const row2 = insertWorkItemBudgetLine({ workItemId, budgetCategoryId: categoryId });

    const result = resolveRelationsBatch(db, [row1, row2], 'work_item_budget_id');

    expect(result.size).toBe(2);
    const entry1 = result.get(row1.id)!;
    const entry2 = result.get(row2.id)!;
    expect(entry1.budgetCategory?.id).toBe(categoryId);
    expect(entry1.budgetCategory?.name).toBe('Plumbing');
    expect(entry2.budgetCategory?.id).toBe(categoryId);
    expect(entry2.budgetCategory?.name).toBe('Plumbing');
  });

  // ─── Invoice aggregates zero when no invoices ─────────────────────────────

  it('invoice aggregates are zero for rows with no linked invoices', () => {
    const workItemId = insertWorkItem();
    const row = insertWorkItemBudgetLine({ workItemId });

    const result = resolveRelationsBatch(db, [row], 'work_item_budget_id');

    const entry = result.get(row.id)!;
    expect(entry.actualCost).toBe(0);
    expect(entry.actualCostPaid).toBe(0);
    expect(entry.invoiceCount).toBe(0);
    expect(entry.invoiceLink).toBeNull();
  });

  // ─── No invoiceBudgetIdColumn argument ────────────────────────────────────

  it('returns zero invoice aggregates and null invoiceLink when invoiceBudgetIdColumn is omitted', () => {
    const workItemId = insertWorkItem();
    const vendorId = insertVendor();
    const row = insertWorkItemBudgetLine({ workItemId });
    // Insert an invoice linked to this budget line — it must NOT appear in results
    insertInvoiceLinkedToWorkItemBudget(row.id, vendorId, { amount: 500, status: 'paid' });

    // Call WITHOUT the column arg
    const result = resolveRelationsBatch(db, [row]);

    const entry = result.get(row.id)!;
    expect(entry.actualCost).toBe(0);
    expect(entry.actualCostPaid).toBe(0);
    expect(entry.invoiceCount).toBe(0);
    expect(entry.invoiceLink).toBeNull();
  });

  // ─── Multiple rows with different relations ────────────────────────────────

  it('handles multiple rows with different category assignments including null', () => {
    const workItemId = insertWorkItem();
    const categoryA = insertBudgetCategory('Category A');
    const categoryB = insertBudgetCategory('Category B');

    const rowWithCatA = insertWorkItemBudgetLine({ workItemId, budgetCategoryId: categoryA });
    const rowWithCatB = insertWorkItemBudgetLine({ workItemId, budgetCategoryId: categoryB });
    const rowNoCat = insertWorkItemBudgetLine({ workItemId, budgetCategoryId: null });

    const result = resolveRelationsBatch(
      db,
      [rowWithCatA, rowWithCatB, rowNoCat],
      'work_item_budget_id',
    );

    expect(result.size).toBe(3);
    expect(result.get(rowWithCatA.id)?.budgetCategory?.id).toBe(categoryA);
    expect(result.get(rowWithCatA.id)?.budgetCategory?.name).toBe('Category A');
    expect(result.get(rowWithCatB.id)?.budgetCategory?.id).toBe(categoryB);
    expect(result.get(rowWithCatB.id)?.budgetCategory?.name).toBe('Category B');
    expect(result.get(rowNoCat.id)?.budgetCategory).toBeNull();
  });

  // ─── Invoice aggregates per-row correctness ───────────────────────────────

  it('computes per-row actualCostPaid correctly across different invoice statuses', () => {
    const workItemId = insertWorkItem();
    const vendorId = insertVendor();

    const rowPending = insertWorkItemBudgetLine({ workItemId, plannedAmount: 300 });
    const rowPaid = insertWorkItemBudgetLine({ workItemId, plannedAmount: 500 });
    const rowClaimed = insertWorkItemBudgetLine({ workItemId, plannedAmount: 700 });

    insertInvoiceLinkedToWorkItemBudget(rowPending.id, vendorId, {
      amount: 100,
      status: 'pending',
    });
    insertInvoiceLinkedToWorkItemBudget(rowPaid.id, vendorId, { amount: 200, status: 'paid' });
    insertInvoiceLinkedToWorkItemBudget(rowClaimed.id, vendorId, {
      amount: 300,
      status: 'claimed',
    });

    const result = resolveRelationsBatch(
      db,
      [rowPending, rowPaid, rowClaimed],
      'work_item_budget_id',
    );

    const entryPending = result.get(rowPending.id)!;
    expect(entryPending.actualCost).toBe(100);
    expect(entryPending.actualCostPaid).toBe(0); // pending does not count
    expect(entryPending.invoiceCount).toBe(1);

    const entryPaid = result.get(rowPaid.id)!;
    expect(entryPaid.actualCost).toBe(200);
    expect(entryPaid.actualCostPaid).toBe(200); // paid counts
    expect(entryPaid.invoiceCount).toBe(1);

    const entryClaimed = result.get(rowClaimed.id)!;
    expect(entryClaimed.actualCost).toBe(300);
    expect(entryClaimed.actualCostPaid).toBe(300); // claimed counts
    expect(entryClaimed.invoiceCount).toBe(1);
  });

  // ─── list() regression: correct data for 5 budget lines ──────────────────

  it('list() returns correct data for 5 budget lines with distinct relations (batch path)', () => {
    const workItemId = insertWorkItem();
    const vendorId = insertVendor('Multi Vendor');

    // Insert 5 lines each with a distinct category
    const lines: Array<{ line: ReturnType<typeof createWorkItemBudget>; catId: string }> = [];
    for (let i = 0; i < 5; i++) {
      const catId = insertBudgetCategory(`Cat ${i}`);
      const line = createWorkItemBudget(db, workItemId, 'user-001', {
        plannedAmount: (i + 1) * 100,
        budgetCategoryId: catId,
        budgetSourceId: 'discretionary-system',
      });
      lines.push({ line, catId });
    }

    // Link one invoice to the first line
    insertInvoiceLinkedToWorkItemBudget(lines[0].line.id, vendorId, {
      amount: 50,
      status: 'paid',
    });

    const result = listWorkItemBudgets(db, workItemId);

    expect(result).toHaveLength(5);

    // Verify each line has its own correct category
    for (let i = 0; i < 5; i++) {
      const resultLine = result.find((r) => r.id === lines[i].line.id)!;
      expect(resultLine).toBeDefined();
      expect(resultLine.plannedAmount).toBe((i + 1) * 100);
      expect(resultLine.budgetCategory?.id).toBe(lines[i].catId);
    }

    // Verify invoice aggregates on the first line
    const firstResult = result.find((r) => r.id === lines[0].line.id)!;
    expect(firstResult.actualCost).toBe(50);
    expect(firstResult.actualCostPaid).toBe(50);
    expect(firstResult.invoiceCount).toBe(1);
    expect(firstResult.invoiceLink).not.toBeNull();

    // Verify zero aggregates on lines 2-5
    for (let i = 1; i < 5; i++) {
      const r = result.find((res) => res.id === lines[i].line.id)!;
      expect(r.actualCost).toBe(0);
      expect(r.invoiceLink).toBeNull();
    }
  });

  it('list() returns empty array for work item with no budget lines (batch handles zero rows)', () => {
    const workItemId = insertWorkItem();
    const result = listWorkItemBudgets(db, workItemId);
    expect(result).toEqual([]);
  });
});
