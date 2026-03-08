import { randomUUID } from 'node:crypto';
import { eq, and, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type * as schemaTypes from '../../db/schema.js';
import { budgetCategories, budgetSources, vendors, users } from '../../db/schema.js';
import {
  toUserSummary,
  toBudgetCategory,
  toBudgetSourceSummary,
  toVendorSummary,
} from './converters.js';
import {
  validateConfidence,
  validateDescription,
  validateBudgetCategoryId,
  validateBudgetSourceId,
  validateVendorId,
} from './validators.js';
import { CONFIDENCE_MARGINS as confidenceMargins } from '@cornerstone/shared';
import type { ConfidenceLevel } from '@cornerstone/shared';
import { NotFoundError, ValidationError, BudgetLineInUseError } from '../../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

export interface ResolvedBudgetRelations {
  confidence: ConfidenceLevel;
  confidenceMargin: number;
  budgetCategory: ReturnType<typeof toBudgetCategory>;
  budgetSource: ReturnType<typeof toBudgetSourceSummary>;
  vendor: ReturnType<typeof toVendorSummary>;
  actualCost: number;
  actualCostPaid: number;
  invoiceCount: number;
  createdBy: ReturnType<typeof toUserSummary>;
}

export function resolveRelations(
  db: DbType,
  row: {
    id: string;
    confidence: string;
    budgetCategoryId: string | null;
    budgetSourceId: string | null;
    vendorId: string | null;
    createdBy: string | null;
  },
  invoiceBudgetIdColumn?: string,
): ResolvedBudgetRelations {
  const confidence = row.confidence as ConfidenceLevel;
  const category = row.budgetCategoryId
    ? db.select().from(budgetCategories).where(eq(budgetCategories.id, row.budgetCategoryId)).get()
    : null;
  const source = row.budgetSourceId
    ? db.select().from(budgetSources).where(eq(budgetSources.id, row.budgetSourceId)).get()
    : null;
  const vendor = row.vendorId
    ? db.select().from(vendors).where(eq(vendors.id, row.vendorId)).get()
    : null;
  const createdByUser = row.createdBy
    ? db.select().from(users).where(eq(users.id, row.createdBy)).get()
    : null;
  const { actualCost, actualCostPaid, invoiceCount } = invoiceBudgetIdColumn
    ? getInvoiceAggregates(db, row.id, invoiceBudgetIdColumn)
    : { actualCost: 0, actualCostPaid: 0, invoiceCount: 0 };

  return {
    confidence,
    confidenceMargin: confidenceMargins[confidence],
    budgetCategory: toBudgetCategory(category),
    budgetSource: toBudgetSourceSummary(source),
    vendor: toVendorSummary(vendor),
    actualCost,
    actualCostPaid,
    invoiceCount,
    createdBy: toUserSummary(createdByUser),
  };
}

export interface BudgetServiceFactoryConfig<_EntityRow, BudgetLine, _CreateRequest, _UpdateRequest> {
  budgetTable: SQLiteTable;
  budgetEntityIdColumn: string;
  invoiceHandler?: {
    budgetIdColumn: string;
    blockDeleteOnInvoices: boolean;
  };
  toLine: (db: DbType, row: any, relations: ResolvedBudgetRelations) => BudgetLine;
  buildInsertValues: (
    db: DbType,
    entityId: string,
    userId: string,
    data: any,
  ) => Record<string, any>;
  assertEntityExists: (db: DbType, entityId: string) => void;
}

export function getInvoiceAggregates(
  db: DbType,
  budgetId: string,
  invoiceBudgetIdColumn: string,
): { actualCost: number; actualCostPaid: number; invoiceCount: number } {
  const row = db.get<{
    actualCost: number | null;
    actualCostPaid: number | null;
    invoiceCount: number;
  }>(
    sql`SELECT
      COALESCE(SUM(amount), 0) AS actualCost,
      COALESCE(SUM(CASE WHEN status IN ('paid', 'claimed') THEN amount ELSE 0 END), 0) AS actualCostPaid,
      COUNT(*) AS invoiceCount
    FROM invoices
    WHERE ${sql.raw(invoiceBudgetIdColumn)} = ${budgetId}`,
  );

  return {
    actualCost: row?.actualCost ?? 0,
    actualCostPaid: row?.actualCostPaid ?? 0,
    invoiceCount: row?.invoiceCount ?? 0,
  };
}

export function getLinkedInvoices(db: DbType, budgetId: string, invoiceBudgetIdColumn: string) {
  const rows = db.all<{
    id: string;
    vendor_id: string;
    vendor_name: string | null;
    invoice_number: string | null;
    amount: number;
    date: string;
    status: string;
  }>(
    sql`SELECT i.id, i.vendor_id, v.name AS vendor_name, i.invoice_number, i.amount, i.date, i.status
    FROM invoices i LEFT JOIN vendors v ON v.id = i.vendor_id
    WHERE i.${sql.raw(invoiceBudgetIdColumn)} = ${budgetId}
    ORDER BY i.date DESC`,
  );

  return rows.map((r) => ({
    id: r.id,
    vendorId: r.vendor_id,
    vendorName: r.vendor_name,
    invoiceNumber: r.invoice_number,
    amount: r.amount,
    date: r.date,
    status: r.status,
  }));
}

export function createBudgetService<
  EntityRow,
  BudgetLine,
  CreateRequest extends Record<string, any>,
  UpdateRequest extends Record<string, any>,
>(config: BudgetServiceFactoryConfig<EntityRow, BudgetLine, CreateRequest, UpdateRequest>) {
  const table = config.budgetTable as any;
  const findBudgetLine = (db: DbType, entityId: string, budgetId: string) =>
    db
      .select()
      .from(config.budgetTable)
      .where(and(eq(table.id, budgetId), eq(table[config.budgetEntityIdColumn], entityId)))
      .get();
  const toResult = (db: DbType, row: any): BudgetLine =>
    config.toLine(db, row, resolveRelations(db, row as any, config.invoiceHandler?.budgetIdColumn));

  return {
    list(db: DbType, entityId: string): BudgetLine[] {
      config.assertEntityExists(db, entityId);
      const rows = db
        .select()
        .from(config.budgetTable)
        .where(eq(table[config.budgetEntityIdColumn], entityId))
        .orderBy(table.createdAt)
        .all();
      return rows.map((row) => toResult(db, row));
    },

    create(db: DbType, entityId: string, userId: string, data: CreateRequest): BudgetLine {
      config.assertEntityExists(db, entityId);

      if (data.plannedAmount === undefined || data.plannedAmount === null) {
        throw new ValidationError('plannedAmount is required');
      }
      if (data.plannedAmount < 0) {
        throw new ValidationError('plannedAmount must be >= 0');
      }

      validateDescription(data.description);

      if (data.confidence !== undefined) {
        validateConfidence(data.confidence);
      }

      if (data.budgetCategoryId) {
        validateBudgetCategoryId(db, data.budgetCategoryId);
      }
      if (data.budgetSourceId) {
        validateBudgetSourceId(db, data.budgetSourceId);
      }
      if (data.vendorId) {
        validateVendorId(db, data.vendorId);
      }

      const id = randomUUID();
      const now = new Date().toISOString();
      const insertValues = config.buildInsertValues(db, entityId, userId, data);
      insertValues.id = id;
      insertValues.createdAt = now;
      insertValues.updatedAt = now;

      db.insert(config.budgetTable).values(insertValues).run();
      const row = db.select().from(config.budgetTable).where(eq(table.id, id)).get()!;
      return toResult(db, row);
    },

    update(db: DbType, entityId: string, budgetId: string, data: UpdateRequest): BudgetLine {
      config.assertEntityExists(db, entityId);
      const existing = findBudgetLine(db, entityId, budgetId);
      if (!existing) {
        throw new NotFoundError('Budget line not found');
      }

      const updates: Partial<any> = {};

      if ('description' in data) {
        validateDescription(data.description);
        updates.description = data.description ?? null;
      }

      if ('plannedAmount' in data) {
        if (data.plannedAmount === undefined || data.plannedAmount === null) {
          throw new ValidationError('plannedAmount cannot be null');
        }
        if (data.plannedAmount < 0) {
          throw new ValidationError('plannedAmount must be >= 0');
        }
        updates.plannedAmount = data.plannedAmount;
      }

      if ('confidence' in data) {
        if (data.confidence === undefined) {
          throw new ValidationError('confidence cannot be undefined if key is provided');
        }
        validateConfidence(data.confidence);
        updates.confidence = data.confidence;
      }

      if ('budgetCategoryId' in data) {
        if (data.budgetCategoryId) {
          validateBudgetCategoryId(db, data.budgetCategoryId);
        }
        updates.budgetCategoryId = data.budgetCategoryId ?? null;
      }

      if ('budgetSourceId' in data) {
        if (data.budgetSourceId) {
          validateBudgetSourceId(db, data.budgetSourceId);
        }
        updates.budgetSourceId = data.budgetSourceId ?? null;
      }

      if ('vendorId' in data) {
        if (data.vendorId) {
          validateVendorId(db, data.vendorId);
        }
        updates.vendorId = data.vendorId ?? null;
      }

      updates.updatedAt = new Date().toISOString();
      db.update(config.budgetTable).set(updates).where(eq(table.id, budgetId)).run();
      return toResult(
        db,
        db.select().from(config.budgetTable).where(eq(table.id, budgetId)).get()!,
      );
    },

    delete(db: DbType, entityId: string, budgetId: string): void {
      config.assertEntityExists(db, entityId);
      const existing = findBudgetLine(db, entityId, budgetId);
      if (!existing) {
        throw new NotFoundError('Budget line not found');
      }

      if (config.invoiceHandler?.blockDeleteOnInvoices) {
        const invoiceCountRow = db.get<{ count: number }>(
          sql`SELECT COUNT(*) AS count FROM invoices WHERE ${sql.raw(config.invoiceHandler.budgetIdColumn)} = ${budgetId}`,
        );
        const invoiceCount = invoiceCountRow?.count ?? 0;

        if (invoiceCount > 0) {
          throw new BudgetLineInUseError('Budget line has linked invoices and cannot be deleted', {
            invoiceCount,
          });
        }
      }

      db.delete(config.budgetTable).where(eq(table.id, budgetId)).run();
    },
  };
}
