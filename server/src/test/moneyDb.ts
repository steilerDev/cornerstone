/**
 * Seed helpers for DB-level money tests (#2237, test-only): a fresh in-memory database with the
 * real migrations plus small builders for areas, items, budget lines, records, links, deposits and
 * grants. Invented names and round amounts only.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';

export type MoneyTestDb = BetterSQLite3Database<typeof schema>;

export type LineConfidence = 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';
export type SourceKind = 'bank_loan' | 'credit_line' | 'savings' | 'other';
export type RecordStatus = 'quotation' | 'pending' | 'paid' | 'claimed';
export type DepositStatus = 'pending' | 'paid' | 'claimed';

export interface LineOpts {
  planned?: number;
  confidence?: LineConfidence;
  includesVat?: boolean;
  source?: string | null;
  category?: string | null;
  description?: string | null;
}

export interface GrantOpts {
  status?: 'eligible' | 'applied' | 'approved' | 'received' | 'rejected';
  type?: 'percentage' | 'fixed';
  value?: number;
  cap?: number | null;
  workItems?: string[];
  householdItems?: string[];
  categories?: string[];
  noCategory?: boolean;
}

const NOW = '2026-01-01T00:00:00.000Z';
const ts = { createdAt: NOW, updatedAt: NOW };

export interface MoneySeed {
  area(areaId: string, name: string, parentId?: string | null, sortOrder?: number): string;
  category(categoryId: string, name: string, sortOrder?: number): string;
  source(
    sourceId: string,
    kind: SourceKind,
    totalAmount: number,
    status?: 'active' | 'exhausted' | 'closed',
    name?: string,
  ): string;
  workItem(itemId: string, areaId?: string | null, title?: string): string;
  householdItem(itemId: string, areaId?: string | null, name?: string): string;
  wiLine(lineId: string, workItemId: string | null, opts?: LineOpts): string;
  hiLine(lineId: string, householdItemId: string, opts?: LineOpts): string;
  invoice(invoiceId: string, amount: number, status?: RecordStatus): string;
  link(
    invoiceId: string,
    lineId: string,
    kind: 'work_item' | 'household_item',
    itemizedAmount: number,
  ): void;
  deposit(
    depositId: string,
    invoiceId: string,
    amount: number,
    status: DepositStatus,
    opts?: { entryType?: 'deposit' | 'refund'; sourceId?: string | null },
  ): void;
  grant(grantId: string, opts?: GrantOpts): void;
}

/** The seed builders on an existing database (the route tests use the app's own database). */
export function createMoneySeed(db: MoneyTestDb): MoneySeed {
  return {
    area(areaId, name, parentId = null, sortOrder = 0) {
      db.insert(schema.areas)
        .values({ id: areaId, name, parentId, sortOrder, ...ts })
        .run();
      return areaId;
    },
    category(categoryId, name, sortOrder = 0) {
      db.insert(schema.budgetCategories)
        .values({ id: categoryId, name, sortOrder, ...ts })
        .run();
      return categoryId;
    },
    source(sourceId, kind, totalAmount, status = 'active', name = `Source ${sourceId}`) {
      db.insert(schema.budgetSources)
        .values({ id: sourceId, name, sourceType: kind, totalAmount, status, ...ts })
        .run();
      return sourceId;
    },
    workItem(itemId, areaId = null, title = `Task ${itemId}`) {
      db.insert(schema.workItems)
        .values({ id: itemId, title, status: 'not_started', areaId, ...ts })
        .run();
      return itemId;
    },
    householdItem(itemId, areaId = null, name = `Purchase ${itemId}`) {
      db.insert(schema.householdItems)
        .values({ id: itemId, name, categoryId: 'hic-furniture', areaId, ...ts })
        .run();
      return itemId;
    },
    wiLine(lineId, workItemId, opts = {}) {
      db.insert(schema.workItemBudgets)
        .values({
          id: lineId,
          workItemId,
          plannedAmount: opts.planned ?? 1000,
          confidence: opts.confidence ?? 'invoice',
          includesVat: opts.includesVat ?? true,
          budgetSourceId: opts.source ?? null,
          budgetCategoryId: opts.category ?? null,
          description: opts.description ?? null,
          ...ts,
        })
        .run();
      return lineId;
    },
    hiLine(lineId, householdItemId, opts = {}) {
      db.insert(schema.householdItemBudgets)
        .values({
          id: lineId,
          householdItemId,
          plannedAmount: opts.planned ?? 1000,
          confidence: opts.confidence ?? 'invoice',
          includesVat: opts.includesVat ?? true,
          budgetSourceId: opts.source ?? null,
          budgetCategoryId: opts.category ?? null,
          description: opts.description ?? null,
          ...ts,
        })
        .run();
      return lineId;
    },
    invoice(invoiceId, amount, status = 'pending') {
      db.insert(schema.invoices)
        .values({ id: invoiceId, vendorId: 'vendor', amount, status, date: '2026-01-10', ...ts })
        .run();
      return invoiceId;
    },
    link(invoiceId, lineId, kind, itemizedAmount) {
      db.insert(schema.invoiceBudgetLines)
        .values({
          id: `ibl-${invoiceId}-${lineId}`,
          invoiceId,
          workItemBudgetId: kind === 'work_item' ? lineId : null,
          householdItemBudgetId: kind === 'household_item' ? lineId : null,
          itemizedAmount,
          ...ts,
        })
        .run();
    },
    deposit(depositId, invoiceId, amount, status, opts = {}) {
      db.insert(schema.invoiceDeposits)
        .values({
          id: depositId,
          invoiceId,
          amount,
          status,
          entryType: opts.entryType ?? 'deposit',
          budgetSourceId: opts.sourceId ?? null,
          dueDate: '2026-02-01',
          ...ts,
        })
        .run();
    },
    grant(grantId, opts = {}) {
      db.insert(schema.subsidyPrograms)
        .values({
          id: grantId,
          name: `Grant ${grantId}`,
          reductionType: opts.type ?? 'percentage',
          reductionValue: opts.value ?? 10,
          maximumAmount: opts.cap ?? null,
          applicationStatus: opts.status ?? 'approved',
          includesNoCategoryItems: opts.noCategory ? 1 : 0,
          ...ts,
        })
        .run();
      for (const budgetCategoryId of opts.categories ?? []) {
        db.insert(schema.subsidyProgramCategories)
          .values({ subsidyProgramId: grantId, budgetCategoryId })
          .run();
      }
      for (const workItemId of opts.workItems ?? []) {
        db.insert(schema.workItemSubsidies).values({ workItemId, subsidyProgramId: grantId }).run();
      }
      for (const householdItemId of opts.householdItems ?? []) {
        db.insert(schema.householdItemSubsidies)
          .values({ householdItemId, subsidyProgramId: grantId })
          .run();
      }
    },
  };
}

export function openMoneyDb(): { sqlite: Database.Database; db: MoneyTestDb; seed: MoneySeed } {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  runMigrations(sqlite);
  const db = drizzle(sqlite, { schema });
  db.insert(schema.vendors)
    .values({ id: 'vendor', name: 'Company One', ...ts })
    .run();
  return { sqlite, db, seed: createMoneySeed(db) };
}
