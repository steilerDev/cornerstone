import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../../db/migrate.js';
import * as schema from '../../db/schema.js';
import {
  createWorkItemBudget,
  updateWorkItemBudget,
} from '../workItemBudgetService.js';
import {
  createHouseholdItemBudget,
  updateHouseholdItemBudget,
} from '../householdItemBudgetService.js';

// ─── Test database helpers ─────────────────────────────────────────────────────

describe('budgetServiceFactory — unit pricing fields', () => {
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

  // ─── Work item budgets ──────────────────────────────────────────────────────

  describe('work-item budget lines — unit pricing', () => {
    it('persists quantity, unit, unitPrice, includesVat=true on create and returns them', () => {
      const workItemId = insertWorkItem();

      const result = createWorkItemBudget(db, workItemId, 'user-001', {
        plannedAmount: 200,
        quantity: 2,
        unit: 'm²',
        unitPrice: 100,
        includesVat: true,
      });

      expect(result.quantity).toBe(2);
      expect(result.unit).toBe('m²');
      expect(result.unitPrice).toBe(100);
      expect(result.includesVat).toBe(true);
    });

    it('persists includesVat=false correctly', () => {
      const workItemId = insertWorkItem();

      const result = createWorkItemBudget(db, workItemId, 'user-001', {
        plannedAmount: 100,
        quantity: 1,
        unit: 'pcs',
        unitPrice: 100,
        includesVat: false,
      });

      expect(result.includesVat).toBe(false);
    });

    it('returns null for all unit pricing fields when not provided on create', () => {
      const workItemId = insertWorkItem();

      const result = createWorkItemBudget(db, workItemId, 'user-001', {
        plannedAmount: 500,
      });

      expect(result.quantity).toBeNull();
      expect(result.unit).toBeNull();
      expect(result.unitPrice).toBeNull();
      expect(result.includesVat).toBeNull();
    });

    it('updates quantity only, leaving other unit pricing fields unchanged', () => {
      const workItemId = insertWorkItem();

      const created = createWorkItemBudget(db, workItemId, 'user-001', {
        plannedAmount: 300,
        quantity: 2,
        unit: 'kg',
        unitPrice: 150,
        includesVat: true,
      });

      const updated = updateWorkItemBudget(db, workItemId, created.id, {
        quantity: 5,
      });

      expect(updated.quantity).toBe(5);
      expect(updated.unit).toBe('kg');
      expect(updated.unitPrice).toBe(150);
      expect(updated.includesVat).toBe(true);
    });

    it('clears all unit pricing fields when explicitly set to null', () => {
      const workItemId = insertWorkItem();

      const created = createWorkItemBudget(db, workItemId, 'user-001', {
        plannedAmount: 300,
        quantity: 3,
        unit: 'pcs',
        unitPrice: 100,
        includesVat: false,
      });

      const updated = updateWorkItemBudget(db, workItemId, created.id, {
        quantity: null,
        unit: null,
        unitPrice: null,
        includesVat: null,
      });

      expect(updated.quantity).toBeNull();
      expect(updated.unit).toBeNull();
      expect(updated.unitPrice).toBeNull();
      expect(updated.includesVat).toBeNull();
    });

    it('does not touch unit pricing fields when they are absent from update payload', () => {
      const workItemId = insertWorkItem();

      const created = createWorkItemBudget(db, workItemId, 'user-001', {
        plannedAmount: 400,
        quantity: 10,
        unit: 'lm',
        unitPrice: 40,
        includesVat: true,
      });

      // Update only description — unit pricing should be untouched
      const updated = updateWorkItemBudget(db, workItemId, created.id, {
        description: 'Updated description',
      });

      expect(updated.quantity).toBe(10);
      expect(updated.unit).toBe('lm');
      expect(updated.unitPrice).toBe(40);
      expect(updated.includesVat).toBe(true);
    });
  });

  // ─── Household item budgets ─────────────────────────────────────────────────

  describe('household-item budget lines — unit pricing', () => {
    it('persists quantity, unit, unitPrice, includesVat=true on create and returns them', () => {
      const hiId = insertHouseholdItem();

      const result = createHouseholdItemBudget(db, hiId, 'user-001', {
        plannedAmount: 600,
        quantity: 4,
        unit: 'pcs',
        unitPrice: 150,
        includesVat: true,
      });

      expect(result.quantity).toBe(4);
      expect(result.unit).toBe('pcs');
      expect(result.unitPrice).toBe(150);
      expect(result.includesVat).toBe(true);
    });

    it('returns null for all unit pricing fields when not provided on create', () => {
      const hiId = insertHouseholdItem();

      const result = createHouseholdItemBudget(db, hiId, 'user-001', {
        plannedAmount: 250,
      });

      expect(result.quantity).toBeNull();
      expect(result.unit).toBeNull();
      expect(result.unitPrice).toBeNull();
      expect(result.includesVat).toBeNull();
    });

    it('updates quantity only, leaving other unit pricing fields unchanged', () => {
      const hiId = insertHouseholdItem();

      const created = createHouseholdItemBudget(db, hiId, 'user-001', {
        plannedAmount: 800,
        quantity: 2,
        unit: 'm²',
        unitPrice: 400,
        includesVat: false,
      });

      const updated = updateHouseholdItemBudget(db, hiId, created.id, {
        quantity: 6,
      });

      expect(updated.quantity).toBe(6);
      expect(updated.unit).toBe('m²');
      expect(updated.unitPrice).toBe(400);
      expect(updated.includesVat).toBe(false);
    });

    it('clears all unit pricing fields when explicitly set to null', () => {
      const hiId = insertHouseholdItem();

      const created = createHouseholdItemBudget(db, hiId, 'user-001', {
        plannedAmount: 500,
        quantity: 5,
        unit: 'pcs',
        unitPrice: 100,
        includesVat: true,
      });

      const updated = updateHouseholdItemBudget(db, hiId, created.id, {
        quantity: null,
        unit: null,
        unitPrice: null,
        includesVat: null,
      });

      expect(updated.quantity).toBeNull();
      expect(updated.unit).toBeNull();
      expect(updated.unitPrice).toBeNull();
      expect(updated.includesVat).toBeNull();
    });
  });
});
