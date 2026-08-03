import { randomUUID } from 'node:crypto';
import { eq, and, sql, inArray } from 'drizzle-orm';
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
import { computeDepositAwareAggregates, type DepositAwareRow } from './depositAggregateUtils.js';
import { CONFIDENCE_MARGINS as confidenceMargins } from '@cornerstone/shared';
import type { ConfidenceLevel } from '@cornerstone/shared';
import { NotFoundError, ValidationError, BudgetLineInUseError } from '../../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

export function getInvoiceLink(
  db: DbType,
  budgetId: string,
  invoiceBudgetIdColumn: string,
): {
  invoiceBudgetLineId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  invoiceStatus: string;
  itemizedAmount: number;
  vendorId: string | null;
  vendorName: string | null;
} | null {
  const row = db.get<{
    ibl_id: string;
    invoice_id: string;
    invoice_number: string | null;
    date: string;
    status: string;
    itemized_amount: number;
    vendor_id: string | null;
    vendor_name: string | null;
  }>(
    sql`SELECT ibl.id AS ibl_id, ibl.invoice_id, i.invoice_number, i.date, i.status, ibl.itemized_amount,
      i.vendor_id, v.name AS vendor_name
    FROM invoice_budget_lines ibl
    INNER JOIN invoices i ON i.id = ibl.invoice_id
    LEFT JOIN vendors v ON v.id = i.vendor_id
    WHERE ibl.${sql.raw(invoiceBudgetIdColumn)} = ${budgetId}
    LIMIT 1`,
  );
  if (!row) return null;
  return {
    invoiceBudgetLineId: row.ibl_id,
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.date,
    invoiceStatus: row.status,
    itemizedAmount: row.itemized_amount,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
  };
}

export interface ResolvedBudgetRelations {
  confidence: ConfidenceLevel;
  confidenceMargin: number;
  budgetCategory: ReturnType<typeof toBudgetCategory>;
  budgetSource: ReturnType<typeof toBudgetSourceSummary>;
  vendor: ReturnType<typeof toVendorSummary>;
  actualCost: number;
  actualCostPaid: number;
  invoiceCount: number;
  invoiceLink: {
    invoiceBudgetLineId: string;
    invoiceId: string;
    invoiceNumber: string | null;
    invoiceDate: string;
    invoiceStatus: string;
    itemizedAmount: number;
    vendorId: string | null;
    vendorName: string | null;
  } | null;
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

  const invoiceLink = invoiceBudgetIdColumn
    ? getInvoiceLink(db, row.id, invoiceBudgetIdColumn)
    : null;

  return {
    confidence,
    confidenceMargin: confidenceMargins[confidence],
    budgetCategory: toBudgetCategory(category),
    budgetSource: toBudgetSourceSummary(source),
    vendor: toVendorSummary(vendor),
    actualCost,
    actualCostPaid,
    invoiceCount,
    invoiceLink,
    createdBy: toUserSummary(createdByUser),
  };
}

export function resolveRelationsBatch(
  db: DbType,
  rows: Array<{
    id: string;
    confidence: string;
    budgetCategoryId: string | null;
    budgetSourceId: string | null;
    vendorId: string | null;
    createdBy: string | null;
  }>,
  invoiceBudgetIdColumn?: string,
): Map<string, ResolvedBudgetRelations> {
  const result = new Map<string, ResolvedBudgetRelations>();

  if (rows.length === 0) {
    return result;
  }

  // Collect unique IDs for each lookup dimension
  const categoryIds = new Set(rows.map((r) => r.budgetCategoryId).filter(Boolean) as string[]);
  const sourceIds = new Set(rows.map((r) => r.budgetSourceId).filter(Boolean) as string[]);
  const vendorIds = new Set(rows.map((r) => r.vendorId).filter(Boolean) as string[]);
  const userIds = new Set(rows.map((r) => r.createdBy).filter(Boolean) as string[]);

  // Bulk-fetch lookup tables
  const categoryMap = new Map<string, typeof budgetCategories.$inferSelect>();
  if (categoryIds.size > 0) {
    const categories = db
      .select()
      .from(budgetCategories)
      .where(inArray(budgetCategories.id, [...categoryIds]))
      .all();
    categories.forEach((cat) => categoryMap.set(cat.id, cat));
  }

  const sourceMap = new Map<string, typeof budgetSources.$inferSelect>();
  if (sourceIds.size > 0) {
    const sources = db
      .select()
      .from(budgetSources)
      .where(inArray(budgetSources.id, [...sourceIds]))
      .all();
    sources.forEach((src) => sourceMap.set(src.id, src));
  }

  const vendorMap = new Map<string, typeof vendors.$inferSelect>();
  if (vendorIds.size > 0) {
    const vendorList = db
      .select()
      .from(vendors)
      .where(inArray(vendors.id, [...vendorIds]))
      .all();
    vendorList.forEach((v) => vendorMap.set(v.id, v));
  }

  const userMap = new Map<string, typeof users.$inferSelect>();
  if (userIds.size > 0) {
    const userList = db
      .select()
      .from(users)
      .where(inArray(users.id, [...userIds]))
      .all();
    userList.forEach((u) => userMap.set(u.id, u));
  }

  // Bulk-fetch invoice aggregates with deposit-aware split
  const invoiceAggregatesMap = new Map<
    string,
    { actualCost: number; actualCostPaid: number; invoiceCount: number }
  >();
  if (invoiceBudgetIdColumn) {
    const budgetIds = rows.map((r) => r.id);
    const idItems = budgetIds.map((id) => sql`${id}`);
    const allRows = db.all<DepositAwareRow & { budget_id: string }>(
      sql`SELECT
        ibl.${sql.raw(invoiceBudgetIdColumn)} AS budget_id,
        ibl.id              AS ibl_id,
        ibl.itemized_amount AS itemized_amount,
        i.id                AS invoice_id,
        i.amount            AS invoice_amount,
        i.status            AS invoice_status,
        d.id                AS deposit_id,
        d.amount            AS deposit_amount,
        d.status            AS deposit_status,
        d.entry_type        AS deposit_entry_type
      FROM invoice_budget_lines ibl
      INNER JOIN invoices i ON i.id = ibl.invoice_id
      LEFT JOIN invoice_deposits d ON d.invoice_id = i.id
      WHERE ibl.${sql.raw(invoiceBudgetIdColumn)} IN (${sql.join(idItems, sql`, `)})`,
    );

    // Group by budget_id, then compute aggregates
    const rowsByBudgetId = new Map<string, DepositAwareRow[]>();
    for (const row of allRows) {
      const rows = rowsByBudgetId.get(row.budget_id) ?? [];
      rows.push(row);
      rowsByBudgetId.set(row.budget_id, rows);
    }

    for (const [budgetId, budgetRows] of rowsByBudgetId) {
      const { actualCost, actualCostPaid, invoiceCount } =
        computeDepositAwareAggregates(budgetRows);
      invoiceAggregatesMap.set(budgetId, {
        actualCost,
        actualCostPaid,
        invoiceCount,
      });
    }
  }

  // Bulk-fetch invoice links (one per budget line)
  const invoiceLinkMap = new Map<
    string,
    {
      invoiceBudgetLineId: string;
      invoiceId: string;
      invoiceNumber: string | null;
      invoiceDate: string;
      invoiceStatus: string;
      itemizedAmount: number;
      vendorId: string | null;
      vendorName: string | null;
    }
  >();
  if (invoiceBudgetIdColumn) {
    const budgetIds = rows.map((r) => r.id);
    const idItems = budgetIds.map((id) => sql`${id}`);
    const invoiceLinkRows = db.all<{
      budget_id: string;
      ibl_id: string;
      invoice_id: string;
      invoice_number: string | null;
      date: string;
      status: string;
      itemized_amount: number;
      vendor_id: string | null;
      vendor_name: string | null;
    }>(
      sql`SELECT
        ibl.${sql.raw(invoiceBudgetIdColumn)} AS budget_id,
        ibl.id AS ibl_id,
        ibl.invoice_id,
        i.invoice_number,
        i.date,
        i.status,
        ibl.itemized_amount,
        i.vendor_id,
        v.name AS vendor_name
      FROM invoice_budget_lines ibl
      INNER JOIN invoices i ON i.id = ibl.invoice_id
      LEFT JOIN vendors v ON v.id = i.vendor_id
      WHERE ibl.${sql.raw(invoiceBudgetIdColumn)} IN (${sql.join(idItems, sql`, `)})
      ORDER BY ibl.${sql.raw(invoiceBudgetIdColumn)}`,
    );
    // Add to map only if not already present (replicate LIMIT 1 per budget line)
    invoiceLinkRows.forEach((row) => {
      if (!invoiceLinkMap.has(row.budget_id)) {
        invoiceLinkMap.set(row.budget_id, {
          invoiceBudgetLineId: row.ibl_id,
          invoiceId: row.invoice_id,
          invoiceNumber: row.invoice_number,
          invoiceDate: row.date,
          invoiceStatus: row.status,
          itemizedAmount: row.itemized_amount,
          vendorId: row.vendor_id,
          vendorName: row.vendor_name,
        });
      }
    });
  }

  // Assemble result map
  rows.forEach((row) => {
    const confidence = row.confidence as ConfidenceLevel;
    const category = categoryMap.get(row.budgetCategoryId ?? '');
    const source = sourceMap.get(row.budgetSourceId ?? '');
    const vendor = vendorMap.get(row.vendorId ?? '');
    const createdByUser = userMap.get(row.createdBy ?? '');
    const invoiceAggregates = invoiceAggregatesMap.get(row.id) ?? {
      actualCost: 0,
      actualCostPaid: 0,
      invoiceCount: 0,
    };
    const invoiceLink = invoiceLinkMap.get(row.id) ?? null;

    result.set(row.id, {
      confidence,
      confidenceMargin: confidenceMargins[confidence],
      budgetCategory: toBudgetCategory(category),
      budgetSource: toBudgetSourceSummary(source),
      vendor: toVendorSummary(vendor),
      actualCost: invoiceAggregates.actualCost,
      actualCostPaid: invoiceAggregates.actualCostPaid,
      invoiceCount: invoiceAggregates.invoiceCount,
      invoiceLink,
      createdBy: toUserSummary(createdByUser),
    });
  });

  return result;
}

export interface BudgetServiceFactoryConfig<
  _EntityRow,
  BudgetLine,
  _CreateRequest,
  _UpdateRequest,
> {
  budgetTable: SQLiteTable;
  budgetEntityIdColumn: string;
  invoiceHandler?: {
    budgetIdColumn: string;
    blockDeleteOnInvoices: boolean;
  };
  toLine: (db: DbType, row: unknown, relations: ResolvedBudgetRelations) => BudgetLine;
  buildInsertValues: (
    db: DbType,
    entityId: string,
    userId: string,
    data: Record<string, unknown>,
  ) => Record<string, unknown>;
  assertEntityExists: (db: DbType, entityId: string) => void;
}

export function getInvoiceAggregates(
  db: DbType,
  budgetId: string,
  invoiceBudgetIdColumn: string,
): { actualCost: number; actualCostPaid: number; invoiceCount: number } {
  // Fetch (ibl, invoice, deposit?) tuples with deposit-aware split
  const rows = db.all<DepositAwareRow>(
    sql`SELECT
      ibl.id              AS ibl_id,
      ibl.itemized_amount AS itemized_amount,
      i.id                AS invoice_id,
      i.amount            AS invoice_amount,
      i.status            AS invoice_status,
      d.id                AS deposit_id,
      d.amount            AS deposit_amount,
      d.status            AS deposit_status,
      d.entry_type        AS deposit_entry_type
    FROM invoice_budget_lines ibl
    INNER JOIN invoices i ON i.id = ibl.invoice_id
    LEFT JOIN invoice_deposits d ON d.invoice_id = i.id
    WHERE ibl.${sql.raw(invoiceBudgetIdColumn)} = ${budgetId}`,
  );

  const { actualCost, actualCostPaid, invoiceCount } = computeDepositAwareAggregates(rows);

  return {
    actualCost,
    actualCostPaid,
    invoiceCount,
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
    FROM invoice_budget_lines ibl
    INNER JOIN invoices i ON i.id = ibl.invoice_id
    LEFT JOIN vendors v ON v.id = i.vendor_id
    WHERE ibl.${sql.raw(invoiceBudgetIdColumn)} = ${budgetId}
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
  CreateRequest extends Record<string, unknown>,
  UpdateRequest extends Record<string, unknown>,
>(config: BudgetServiceFactoryConfig<EntityRow, BudgetLine, CreateRequest, UpdateRequest>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Schema generic deliberately erased to accept any table schema
  const table = config.budgetTable as any;
  const findBudgetLine = (db: DbType, entityId: string, budgetId: string) =>
    db
      .select()
      .from(config.budgetTable)
      .where(and(eq(table.id, budgetId), eq(table[config.budgetEntityIdColumn], entityId)))
      .get();
  const toResult = (db: DbType, row: unknown): BudgetLine =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Rows from dynamic tables have unknown schema
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
      const relationsMap = resolveRelationsBatch(
        db,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows come from a dynamically-selected budget table with no shared static schema
        rows as any,
        config.invoiceHandler?.budgetIdColumn,
      );
      return rows.map((row) => config.toLine(db, row, relationsMap.get(row.id)!));
    },

    create(db: DbType, entityId: string, userId: string, data: CreateRequest): BudgetLine {
      config.assertEntityExists(db, entityId);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CreateRequest generic doesn't preserve property types; all known requests have plannedAmount
      const typedData = data as any;
      if (typedData.plannedAmount === undefined || typedData.plannedAmount === null) {
        throw new ValidationError('plannedAmount is required');
      }
      if (typedData.plannedAmount < 0) {
        throw new ValidationError('plannedAmount must be >= 0');
      }

      validateDescription(typedData.description);

      if (typedData.confidence !== undefined) {
        validateConfidence(typedData.confidence);
      }

      if (typedData.budgetCategoryId) {
        validateBudgetCategoryId(db, typedData.budgetCategoryId);
      }
      if (!typedData.budgetSourceId) {
        throw new ValidationError('budgetSourceId is required');
      }
      validateBudgetSourceId(db, typedData.budgetSourceId);
      if (typedData.vendorId) {
        validateVendorId(db, typedData.vendorId);
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- UpdateRequest generic doesn't preserve property types
      const typedData = data as any;
      const updates: Partial<Record<string, unknown>> = {};

      if ('description' in data) {
        validateDescription(typedData.description);
        updates.description = typedData.description ?? null;
      }

      if ('plannedAmount' in data) {
        if (typedData.plannedAmount === undefined || typedData.plannedAmount === null) {
          throw new ValidationError('plannedAmount cannot be null');
        }
        if (typedData.plannedAmount < 0) {
          throw new ValidationError('plannedAmount must be >= 0');
        }
        updates.plannedAmount = typedData.plannedAmount;
      }

      if ('confidence' in data) {
        if (typedData.confidence === undefined) {
          throw new ValidationError('confidence cannot be undefined if key is provided');
        }
        validateConfidence(typedData.confidence);
        updates.confidence = typedData.confidence;
      }

      if ('budgetCategoryId' in data) {
        if (typedData.budgetCategoryId) {
          validateBudgetCategoryId(db, typedData.budgetCategoryId);
        }
        updates.budgetCategoryId = typedData.budgetCategoryId ?? null;
      }

      if ('budgetSourceId' in data) {
        if (!typedData.budgetSourceId) {
          throw new ValidationError('budgetSourceId cannot be removed');
        }
        validateBudgetSourceId(db, typedData.budgetSourceId);
        updates.budgetSourceId = typedData.budgetSourceId;
      }

      if ('vendorId' in data) {
        if (typedData.vendorId) {
          validateVendorId(db, typedData.vendorId);
        }
        updates.vendorId = typedData.vendorId ?? null;
      }

      if ('quantity' in data) {
        updates.quantity = typedData.quantity ?? null;
      }

      if ('unit' in data) {
        updates.unit = typedData.unit ?? null;
      }

      if ('unitPrice' in data) {
        updates.unitPrice = typedData.unitPrice ?? null;
      }

      if ('includesVat' in data) {
        updates.includesVat = typedData.includesVat ?? true;
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
          sql`SELECT COUNT(*) AS count FROM invoice_budget_lines WHERE ${sql.raw(config.invoiceHandler.budgetIdColumn)} = ${budgetId}`,
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
