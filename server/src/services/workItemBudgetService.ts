import { randomUUID } from 'node:crypto';
import { eq, and, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import {
  workItems,
  workItemBudgets,
  budgetCategories,
  budgetSources,
  vendors,
  users,
} from '../db/schema.js';
import {
  toUserSummary,
  toBudgetCategory,
  toBudgetSourceSummary,
  toVendorSummary,
} from './shared/converters.js';
import {
  validateConfidence,
  validateDescription,
  validateBudgetCategoryId,
  validateBudgetSourceId,
  validateVendorId,
} from './shared/validators.js';
import type {
  WorkItemBudgetLine,
  BudgetCategory,
  BudgetSourceSummary,
  VendorSummary,
  InvoiceSummary,
  UserSummary,
  ConfidenceLevel,
  CreateWorkItemBudgetRequest,
  UpdateWorkItemBudgetRequest,
} from '@cornerstone/shared';
import { CONFIDENCE_MARGINS as confidenceMargins } from '@cornerstone/shared';
import { NotFoundError, ValidationError, BudgetLineInUseError } from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Aggregate invoice data for a budget line: actualCost, actualCostPaid, invoiceCount.
 */
function getInvoiceAggregates(
  db: DbType,
  budgetId: string,
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
    WHERE work_item_budget_id = ${budgetId}`,
  );

  return {
    actualCost: row?.actualCost ?? 0,
    actualCostPaid: row?.actualCostPaid ?? 0,
    invoiceCount: row?.invoiceCount ?? 0,
  };
}

/**
 * Fetch individual invoices linked to a budget line, ordered by date descending.
 * Includes vendor name via a LEFT JOIN.
 */
function getLinkedInvoices(db: DbType, budgetId: string): InvoiceSummary[] {
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
    WHERE i.work_item_budget_id = ${budgetId}
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

/**
 * Convert a database work_item_budgets row to WorkItemBudgetLine API shape.
 * Joins all related entities (category, source, vendor, createdBy) and computes
 * aggregate invoice fields.
 */
function toWorkItemBudgetLine(
  db: DbType,
  row: typeof workItemBudgets.$inferSelect,
): WorkItemBudgetLine {
  const confidence = row.confidence as ConfidenceLevel;

  // Resolve related entities
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

  // Compute invoice aggregates and fetch individual invoice summaries
  const { actualCost, actualCostPaid, invoiceCount } = getInvoiceAggregates(db, row.id);
  const invoiceList = getLinkedInvoices(db, row.id);

  return {
    id: row.id,
    workItemId: row.workItemId,
    description: row.description,
    plannedAmount: row.plannedAmount,
    confidence,
    confidenceMargin: confidenceMargins[confidence],
    budgetCategory: toBudgetCategory(category),
    budgetSource: toBudgetSourceSummary(source),
    vendor: toVendorSummary(vendor),
    actualCost,
    actualCostPaid,
    invoiceCount,
    invoices: invoiceList,
    createdBy: toUserSummary(createdByUser),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Assert that a work item exists.
 * @throws NotFoundError if work item does not exist
 */
function assertWorkItemExists(db: DbType, workItemId: string): void {
  const item = db.select().from(workItems).where(eq(workItems.id, workItemId)).get();
  if (!item) {
    throw new NotFoundError('Work item not found');
  }
}

/**
 * List all budget lines for a work item, ordered by creation time ascending.
 * @throws NotFoundError if work item does not exist
 */
export function listWorkItemBudgets(db: DbType, workItemId: string): WorkItemBudgetLine[] {
  assertWorkItemExists(db, workItemId);

  const rows = db
    .select()
    .from(workItemBudgets)
    .where(eq(workItemBudgets.workItemId, workItemId))
    .orderBy(workItemBudgets.createdAt)
    .all();

  return rows.map((row) => toWorkItemBudgetLine(db, row));
}

/**
 * Create a new budget line for a work item.
 * @throws NotFoundError if work item does not exist
 * @throws ValidationError if any field is invalid
 */
export function createWorkItemBudget(
  db: DbType,
  workItemId: string,
  userId: string,
  data: CreateWorkItemBudgetRequest,
): WorkItemBudgetLine {
  assertWorkItemExists(db, workItemId);

  // Validate plannedAmount
  if (data.plannedAmount === undefined || data.plannedAmount === null) {
    throw new ValidationError('plannedAmount is required');
  }
  if (data.plannedAmount < 0) {
    throw new ValidationError('plannedAmount must be >= 0');
  }

  // Validate description
  validateDescription(data.description);

  // Validate confidence if provided
  if (data.confidence !== undefined) {
    validateConfidence(data.confidence);
  }

  // Validate FK references
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

  db.insert(workItemBudgets)
    .values({
      id,
      workItemId,
      description: data.description ?? null,
      plannedAmount: data.plannedAmount,
      confidence: data.confidence ?? 'own_estimate',
      budgetCategoryId: data.budgetCategoryId ?? null,
      budgetSourceId: data.budgetSourceId ?? null,
      vendorId: data.vendorId ?? null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const row = db.select().from(workItemBudgets).where(eq(workItemBudgets.id, id)).get()!;
  return toWorkItemBudgetLine(db, row);
}

/**
 * Update a budget line.
 * All fields are optional; only provided fields are updated.
 * @throws NotFoundError if work item or budget line does not exist, or if budget line
 *   does not belong to the given work item
 * @throws ValidationError if any provided field is invalid
 */
export function updateWorkItemBudget(
  db: DbType,
  workItemId: string,
  budgetId: string,
  data: UpdateWorkItemBudgetRequest,
): WorkItemBudgetLine {
  assertWorkItemExists(db, workItemId);

  // Fetch the budget line and verify ownership
  const existing = db
    .select()
    .from(workItemBudgets)
    .where(and(eq(workItemBudgets.id, budgetId), eq(workItemBudgets.workItemId, workItemId)))
    .get();

  if (!existing) {
    throw new NotFoundError('Budget line not found');
  }

  const updates: Partial<typeof workItemBudgets.$inferInsert> = {};

  // description (nullable — null clears it)
  if ('description' in data) {
    validateDescription(data.description);
    updates.description = data.description ?? null;
  }

  // plannedAmount
  if ('plannedAmount' in data) {
    if (data.plannedAmount === undefined || data.plannedAmount === null) {
      throw new ValidationError('plannedAmount cannot be null');
    }
    if (data.plannedAmount < 0) {
      throw new ValidationError('plannedAmount must be >= 0');
    }
    updates.plannedAmount = data.plannedAmount;
  }

  // confidence
  if ('confidence' in data) {
    if (data.confidence === undefined) {
      throw new ValidationError('confidence cannot be undefined if key is provided');
    }
    validateConfidence(data.confidence);
    updates.confidence = data.confidence;
  }

  // budgetCategoryId (nullable — null clears it)
  if ('budgetCategoryId' in data) {
    if (data.budgetCategoryId) {
      validateBudgetCategoryId(db, data.budgetCategoryId);
    }
    updates.budgetCategoryId = data.budgetCategoryId ?? null;
  }

  // budgetSourceId (nullable — null clears it)
  if ('budgetSourceId' in data) {
    if (data.budgetSourceId) {
      validateBudgetSourceId(db, data.budgetSourceId);
    }
    updates.budgetSourceId = data.budgetSourceId ?? null;
  }

  // vendorId (nullable — null clears it)
  if ('vendorId' in data) {
    if (data.vendorId) {
      validateVendorId(db, data.vendorId);
    }
    updates.vendorId = data.vendorId ?? null;
  }

  updates.updatedAt = new Date().toISOString();

  db.update(workItemBudgets).set(updates).where(eq(workItemBudgets.id, budgetId)).run();

  const updated = db.select().from(workItemBudgets).where(eq(workItemBudgets.id, budgetId)).get()!;
  return toWorkItemBudgetLine(db, updated);
}

/**
 * Delete a budget line.
 * Fails if the budget line has any linked invoices.
 * @throws NotFoundError if work item or budget line does not exist, or if budget line
 *   does not belong to the given work item
 * @throws BudgetLineInUseError if the budget line has linked invoices
 */
export function deleteWorkItemBudget(db: DbType, workItemId: string, budgetId: string): void {
  assertWorkItemExists(db, workItemId);

  // Fetch and verify ownership
  const existing = db
    .select()
    .from(workItemBudgets)
    .where(and(eq(workItemBudgets.id, budgetId), eq(workItemBudgets.workItemId, workItemId)))
    .get();

  if (!existing) {
    throw new NotFoundError('Budget line not found');
  }

  // Check for linked invoices
  const invoiceCountRow = db.get<{ count: number }>(
    sql`SELECT COUNT(*) AS count FROM invoices WHERE work_item_budget_id = ${budgetId}`,
  );
  const invoiceCount = invoiceCountRow?.count ?? 0;

  if (invoiceCount > 0) {
    throw new BudgetLineInUseError('Budget line has linked invoices and cannot be deleted', {
      invoiceCount,
    });
  }

  db.delete(workItemBudgets).where(eq(workItemBudgets.id, budgetId)).run();
}
