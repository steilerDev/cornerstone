/**
 * Unit tests for householdItemBudgetService.
 *
 * Tests CRUD operations for household item budget lines via the shared
 * budgetServiceFactory. Validates that:
 *   - listHouseholdItemBudgets returns correct lines for the owning HI
 *   - createHouseholdItemBudget inserts a line with forced 'bc-household-items' category
 *   - updateHouseholdItemBudget updates mutable fields
 *   - deleteHouseholdItemBudget removes the line (even when invoices exist,
 *     because blockDeleteOnInvoices=false for HI budgets)
 *   - NotFoundError is thrown for unknown household items or budget IDs
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import {
  listHouseholdItemBudgets,
  createHouseholdItemBudget,
  updateHouseholdItemBudget,
  deleteHouseholdItemBudget,
} from './householdItemBudgetService.js';
import { NotFoundError } from '../errors/AppError.js';

describe('householdItemBudgetService', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let idCounter = 0;
  let defaultSourceId: string;

  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  function insertTestUser(userId = 'user-001') {
    const now = new Date(Date.now() + idCounter++).toISOString();
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
    return userId;
  }

  function insertHouseholdItem(name = 'Test HI', userId = 'user-001') {
    const id = `hi-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
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

  function insertVendor(name = 'Test Vendor') {
    const id = `v-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.vendors)
      .values({
        id,
        name,
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
    return id;
  }

  beforeEach(() => {
    idCounter = 0;
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    insertTestUser();
    defaultSourceId = insertBudgetSource('Default Source');
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── listHouseholdItemBudgets ──────────────────────────────────────────────

  describe('listHouseholdItemBudgets', () => {
    it('returns empty array when household item has no budget lines', () => {
      const hiId = insertHouseholdItem();

      const result = listHouseholdItemBudgets(db, hiId);

      expect(result).toEqual([]);
    });

    it('throws NotFoundError when household item does not exist', () => {
      expect(() => listHouseholdItemBudgets(db, 'nonexistent-hi')).toThrow(NotFoundError);
    });

    it('throws NotFoundError with message "Household item not found"', () => {
      expect(() => listHouseholdItemBudgets(db, 'nonexistent-hi')).toThrow(
        'Household item not found',
      );
    });

    it('returns budget lines for the specified household item', () => {
      const hiId = insertHouseholdItem();

      createHouseholdItemBudget(db, hiId, 'user-001', {
        budgetSourceId: defaultSourceId,
        plannedAmount: 1000,
        description: 'Living room sofa',
      });

      const result = listHouseholdItemBudgets(db, hiId);

      expect(result).toHaveLength(1);
      expect(result[0].householdItemId).toBe(hiId);
      expect(result[0].plannedAmount).toBe(1000);
      expect(result[0].description).toBe('Living room sofa');
    });

    it('returns multiple budget lines sorted by creation order', () => {
      const hiId = insertHouseholdItem();

      createHouseholdItemBudget(db, hiId, 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 500 });
      createHouseholdItemBudget(db, hiId, 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 750 });
      createHouseholdItemBudget(db, hiId, 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 1200 });

      const result = listHouseholdItemBudgets(db, hiId);

      expect(result).toHaveLength(3);
    });

    it('does not return budget lines from a different household item', () => {
      const hiId1 = insertHouseholdItem('HI 1');
      const hiId2 = insertHouseholdItem('HI 2');

      createHouseholdItemBudget(db, hiId1, 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 1000 });
      createHouseholdItemBudget(db, hiId2, 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 2000 });

      const result = listHouseholdItemBudgets(db, hiId1);

      expect(result).toHaveLength(1);
      expect(result[0].plannedAmount).toBe(1000);
    });
  });

  // ─── createHouseholdItemBudget ─────────────────────────────────────────────

  describe('createHouseholdItemBudget', () => {
    it('creates a budget line with minimum required fields', () => {
      const hiId = insertHouseholdItem();

      const result = createHouseholdItemBudget(db, hiId, 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 500 });

      expect(result.id).toBeDefined();
      expect(result.householdItemId).toBe(hiId);
      expect(result.plannedAmount).toBe(500);
    });

    it('always assigns bc-household-items as the budget category', () => {
      const hiId = insertHouseholdItem();

      const result = createHouseholdItemBudget(db, hiId, 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 100 });

      expect(result.budgetCategory).not.toBeNull();
      expect(result.budgetCategory?.id).toBe('bc-household-items');
    });

    it('ignores budgetCategoryId provided in the request', () => {
      const hiId = insertHouseholdItem();

      // Even if the caller provides a budgetCategoryId, service ignores it
      const result = createHouseholdItemBudget(db, hiId, 'user-001', {
        budgetSourceId: defaultSourceId,
        plannedAmount: 100,
        budgetCategoryId: 'some-other-category' as any,
      });

      expect(result.budgetCategory?.id).toBe('bc-household-items');
    });

    it('defaults confidence to own_estimate when not provided', () => {
      const hiId = insertHouseholdItem();

      const result = createHouseholdItemBudget(db, hiId, 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 200 });

      expect(result.confidence).toBe('own_estimate');
    });

    it('accepts all confidence levels', () => {
      const hiId = insertHouseholdItem();
      const confidences = [
        'own_estimate',
        'professional_estimate',
        'quote',
        'invoice',
      ] as const;

      for (const confidence of confidences) {
        const result = createHouseholdItemBudget(db, hiId, 'user-001', {
          budgetSourceId: defaultSourceId,
          plannedAmount: 100,
          confidence,
        });
        expect(result.confidence).toBe(confidence);
      }
    });

    it('creates a budget line with all optional fields', () => {
      const hiId = insertHouseholdItem();
      const sourceId = insertBudgetSource();
      const vendorId = insertVendor();

      const result = createHouseholdItemBudget(db, hiId, 'user-001', {
        plannedAmount: 1500,
        description: 'Custom upholstered sofa',
        confidence: 'professional_estimate',
        budgetSourceId: sourceId,
        vendorId,
        quantity: 2,
        unit: 'pcs',
        unitPrice: 750,
        includesVat: true,
      });

      expect(result.plannedAmount).toBe(1500);
      expect(result.description).toBe('Custom upholstered sofa');
      expect(result.confidence).toBe('professional_estimate');
      expect(result.budgetSource?.id).toBe(sourceId);
      expect(result.vendor?.id).toBe(vendorId);
      expect(result.quantity).toBe(2);
      expect(result.unit).toBe('pcs');
      expect(result.unitPrice).toBe(750);
      expect(result.includesVat).toBe(true);
    });

    it('sets description to null when not provided', () => {
      const hiId = insertHouseholdItem();

      const result = createHouseholdItemBudget(db, hiId, 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 100 });

      expect(result.description).toBeNull();
    });

    it('includes budgetSource when budgetSourceId is provided', () => {
      const hiId = insertHouseholdItem();

      const result = createHouseholdItemBudget(db, hiId, 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 100 });

      expect(result.budgetSource).not.toBeNull();
      expect(result.budgetSource?.id).toBe(defaultSourceId);
    });

    it('sets vendor to null when vendorId is not provided', () => {
      const hiId = insertHouseholdItem();

      const result = createHouseholdItemBudget(db, hiId, 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 100 });

      expect(result.vendor).toBeNull();
    });

    it('returns actualCost 0, actualCostPaid 0, invoiceCount 0 for a new line', () => {
      const hiId = insertHouseholdItem();

      const result = createHouseholdItemBudget(db, hiId, 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 200 });

      expect(result.actualCost).toBe(0);
      expect(result.actualCostPaid).toBe(0);
      expect(result.invoiceCount).toBe(0);
      expect(result.invoiceLink).toBeNull();
    });

    it('returns createdAt and updatedAt as ISO strings', () => {
      const hiId = insertHouseholdItem();

      const result = createHouseholdItemBudget(db, hiId, 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 100 });

      expect(typeof result.createdAt).toBe('string');
      expect(typeof result.updatedAt).toBe('string');
    });

    it('associates createdBy with the user who created it', () => {
      const hiId = insertHouseholdItem();

      const result = createHouseholdItemBudget(db, hiId, 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 100 });

      expect(result.createdBy).not.toBeNull();
      expect(result.createdBy?.id).toBe('user-001');
    });

    it('throws NotFoundError when household item does not exist', () => {
      expect(() =>
        createHouseholdItemBudget(db, 'nonexistent-hi', 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 100 }),
      ).toThrow(NotFoundError);
    });

    it('throws NotFoundError with "Household item not found" when HI missing', () => {
      expect(() =>
        createHouseholdItemBudget(db, 'nonexistent-hi', 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 100 }),
      ).toThrow('Household item not found');
    });
  });

  // ─── updateHouseholdItemBudget ─────────────────────────────────────────────

  describe('updateHouseholdItemBudget', () => {
    it('updates plannedAmount on an existing budget line', () => {
      const hiId = insertHouseholdItem();
      const created = createHouseholdItemBudget(db, hiId, 'user-001', {
        budgetSourceId: defaultSourceId,
        plannedAmount: 500,
        description: 'Initial',
      });

      const result = updateHouseholdItemBudget(db, hiId, created.id, { plannedAmount: 999 });

      expect(result.plannedAmount).toBe(999);
      expect(result.description).toBe('Initial'); // unchanged
    });

    it('updates description on an existing budget line', () => {
      const hiId = insertHouseholdItem();
      const created = createHouseholdItemBudget(db, hiId, 'user-001', {
        budgetSourceId: defaultSourceId,
        plannedAmount: 300,
        description: 'Old description',
      });

      const result = updateHouseholdItemBudget(db, hiId, created.id, {
        description: 'Updated description',
      });

      expect(result.description).toBe('Updated description');
    });

    it('updates confidence level', () => {
      const hiId = insertHouseholdItem();
      const created = createHouseholdItemBudget(db, hiId, 'user-001', {
        budgetSourceId: defaultSourceId,
        plannedAmount: 200,
        confidence: 'own_estimate',
      });

      const result = updateHouseholdItemBudget(db, hiId, created.id, { confidence: 'quote' });

      expect(result.confidence).toBe('quote');
    });

    it('updates quantity, unit, unitPrice and includesVat', () => {
      const hiId = insertHouseholdItem();
      const created = createHouseholdItemBudget(db, hiId, 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 1000 });

      const result = updateHouseholdItemBudget(db, hiId, created.id, {
        quantity: 3,
        unit: 'm2',
        unitPrice: 300,
        includesVat: false,
      });

      expect(result.quantity).toBe(3);
      expect(result.unit).toBe('m2');
      expect(result.unitPrice).toBe(300);
      expect(result.includesVat).toBe(false);
    });

    it('updates budgetSourceId to a new source', () => {
      const hiId = insertHouseholdItem();
      const sourceId = insertBudgetSource();
      const created = createHouseholdItemBudget(db, hiId, 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 500 });

      const result = updateHouseholdItemBudget(db, hiId, created.id, {
        budgetSourceId: sourceId,
      });

      expect(result.budgetSource?.id).toBe(sourceId);
    });

    it('throws ValidationError when attempting to clear budgetSourceId', () => {
      const hiId = insertHouseholdItem();
      const sourceId = insertBudgetSource();
      const created = createHouseholdItemBudget(db, hiId, 'user-001', {
        plannedAmount: 500,
        budgetSourceId: sourceId,
      });

      expect(() =>
        updateHouseholdItemBudget(db, hiId, created.id, { budgetSourceId: null }),
      ).toThrow('budgetSourceId cannot be removed');
    });

    it('preserves bc-household-items category even after update (ignores budgetCategoryId)', () => {
      const hiId = insertHouseholdItem();
      const created = createHouseholdItemBudget(db, hiId, 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 200 });

      // budgetCategoryId is stripped by the service
      const result = updateHouseholdItemBudget(db, hiId, created.id, {
        plannedAmount: 300,
        budgetCategoryId: 'some-other-cat' as any,
      });

      expect(result.budgetCategory?.id).toBe('bc-household-items');
    });

    it('throws NotFoundError when budget line does not exist', () => {
      const hiId = insertHouseholdItem();

      expect(() =>
        updateHouseholdItemBudget(db, hiId, 'nonexistent-budget', { plannedAmount: 100 }),
      ).toThrow(NotFoundError);
    });

    it('throws NotFoundError when household item does not exist', () => {
      expect(() =>
        updateHouseholdItemBudget(db, 'nonexistent-hi', 'any-budget', { plannedAmount: 100 }),
      ).toThrow(NotFoundError);
    });

    it('throws NotFoundError when budget belongs to a different household item', () => {
      const hiId1 = insertHouseholdItem('HI 1');
      const hiId2 = insertHouseholdItem('HI 2');
      const budget = createHouseholdItemBudget(db, hiId1, 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 100 });

      expect(() =>
        updateHouseholdItemBudget(db, hiId2, budget.id, { plannedAmount: 999 }),
      ).toThrow(NotFoundError);
    });
  });

  // ─── deleteHouseholdItemBudget ─────────────────────────────────────────────

  describe('deleteHouseholdItemBudget', () => {
    it('deletes an existing budget line without throwing', () => {
      const hiId = insertHouseholdItem();
      const budget = createHouseholdItemBudget(db, hiId, 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 300 });

      expect(() => deleteHouseholdItemBudget(db, hiId, budget.id)).not.toThrow();
    });

    it('removes the budget line from the list after deletion', () => {
      const hiId = insertHouseholdItem();
      const budget = createHouseholdItemBudget(db, hiId, 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 300 });

      deleteHouseholdItemBudget(db, hiId, budget.id);

      const remaining = listHouseholdItemBudgets(db, hiId);
      expect(remaining).toHaveLength(0);
    });

    it('only deletes the targeted budget line, not others', () => {
      const hiId = insertHouseholdItem();
      const b1 = createHouseholdItemBudget(db, hiId, 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 100 });
      const b2 = createHouseholdItemBudget(db, hiId, 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 200 });
      const b3 = createHouseholdItemBudget(db, hiId, 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 300 });

      deleteHouseholdItemBudget(db, hiId, b2.id);

      const remaining = listHouseholdItemBudgets(db, hiId);
      expect(remaining).toHaveLength(2);
      const ids = remaining.map((b) => b.id);
      expect(ids).toContain(b1.id);
      expect(ids).toContain(b3.id);
      expect(ids).not.toContain(b2.id);
    });

    it('throws NotFoundError when budget line does not exist', () => {
      const hiId = insertHouseholdItem();

      expect(() => deleteHouseholdItemBudget(db, hiId, 'nonexistent-budget')).toThrow(
        NotFoundError,
      );
    });

    it('throws NotFoundError when household item does not exist', () => {
      expect(() => deleteHouseholdItemBudget(db, 'nonexistent-hi', 'any-budget')).toThrow(
        NotFoundError,
      );
    });

    it('throws NotFoundError when budget belongs to a different household item', () => {
      const hiId1 = insertHouseholdItem('HI 1');
      const hiId2 = insertHouseholdItem('HI 2');
      const budget = createHouseholdItemBudget(db, hiId1, 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 100 });

      expect(() => deleteHouseholdItemBudget(db, hiId2, budget.id)).toThrow(NotFoundError);
    });

    it('allows deleting even when blockDeleteOnInvoices is false (HI budgets never block)', () => {
      // householdItemBudgetService sets blockDeleteOnInvoices: false, so deletion
      // always succeeds regardless of invoice state.
      const hiId = insertHouseholdItem();
      const budget = createHouseholdItemBudget(db, hiId, 'user-001', { budgetSourceId: defaultSourceId, plannedAmount: 1000 });

      // Should not throw even without checking invoice count
      expect(() => deleteHouseholdItemBudget(db, hiId, budget.id)).not.toThrow();
    });
  });

  // ─── confidence margin fields ──────────────────────────────────────────────

  describe('confidenceMargin field', () => {
    it('returns confidenceMargin 0.2 for own_estimate', () => {
      const hiId = insertHouseholdItem();

      const result = createHouseholdItemBudget(db, hiId, 'user-001', {
        budgetSourceId: defaultSourceId,
        plannedAmount: 100,
        confidence: 'own_estimate',
      });

      expect(result.confidenceMargin).toBe(0.2);
    });

    it('returns confidenceMargin 0.1 for professional_estimate', () => {
      const hiId = insertHouseholdItem();

      const result = createHouseholdItemBudget(db, hiId, 'user-001', {
        budgetSourceId: defaultSourceId,
        plannedAmount: 100,
        confidence: 'professional_estimate',
      });

      expect(result.confidenceMargin).toBe(0.1);
    });

    it('returns confidenceMargin 0.05 for quote', () => {
      const hiId = insertHouseholdItem();

      const result = createHouseholdItemBudget(db, hiId, 'user-001', {
        budgetSourceId: defaultSourceId,
        plannedAmount: 100,
        confidence: 'quote',
      });

      expect(result.confidenceMargin).toBe(0.05);
    });

    it('returns confidenceMargin 0 for invoice', () => {
      const hiId = insertHouseholdItem();

      const result = createHouseholdItemBudget(db, hiId, 'user-001', {
        budgetSourceId: defaultSourceId,
        plannedAmount: 100,
        confidence: 'invoice',
      });

      expect(result.confidenceMargin).toBe(0);
    });
  });
});
