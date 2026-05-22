import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import {
  workItems,
  workItemBudgets,
  householdItems,
  householdItemBudgets,
  invoiceBudgetLines,
} from '../db/schema.js';
import { createBudgetService } from './shared/budgetServiceFactory.js';
import type { ResolvedBudgetRelations } from './shared/budgetServiceFactory.js';
import type {
  WorkItemBudgetLine,
  CreateWorkItemBudgetRequest,
  UpdateWorkItemBudgetRequest,
  InvoiceStatus,
} from '@cornerstone/shared';
import { NotFoundError, ValidationError } from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

function toWorkItemBudgetLine(
  _db: DbType,
  row: typeof workItemBudgets.$inferSelect,
  rel: ResolvedBudgetRelations,
): WorkItemBudgetLine {
  return {
    id: row.id,
    workItemId: row.workItemId!,
    description: row.description,
    plannedAmount: row.plannedAmount,
    confidence: rel.confidence,
    confidenceMargin: rel.confidenceMargin,
    budgetCategory: rel.budgetCategory,
    budgetSource: rel.budgetSource,
    vendor: rel.vendor,
    actualCost: rel.actualCost,
    actualCostPaid: rel.actualCostPaid,
    invoiceCount: rel.invoiceCount,
    invoiceLink: rel.invoiceLink
      ? {
          invoiceBudgetLineId: rel.invoiceLink.invoiceBudgetLineId,
          invoiceId: rel.invoiceLink.invoiceId,
          invoiceNumber: rel.invoiceLink.invoiceNumber,
          invoiceDate: rel.invoiceLink.invoiceDate,
          invoiceStatus: rel.invoiceLink.invoiceStatus as InvoiceStatus,
          itemizedAmount: rel.invoiceLink.itemizedAmount,
          vendorId: rel.invoiceLink.vendorId,
          vendorName: rel.invoiceLink.vendorName,
        }
      : null,
    quantity: row.quantity ?? null,
    unit: row.unit ?? null,
    unitPrice: row.unitPrice ?? null,
    includesVat: row.includesVat ?? true,
    createdBy: rel.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function assertWorkItemExists(db: DbType, workItemId: string): void {
  const item = db.select().from(workItems).where(eq(workItems.id, workItemId)).get();
  if (!item) {
    throw new NotFoundError('Work item not found');
  }
}

function buildInsertValues(
  _db: DbType,
  workItemId: string,
  userId: string,
  data: CreateWorkItemBudgetRequest,
): Record<string, any> {
  return {
    workItemId,
    description: data.description ?? null,
    plannedAmount: data.plannedAmount,
    confidence: data.confidence ?? 'own_estimate',
    budgetCategoryId: data.budgetCategoryId ?? null,
    budgetSourceId: data.budgetSourceId ?? null,
    vendorId: data.vendorId ?? null,
    quantity: data.quantity ?? null,
    unit: data.unit ?? null,
    unitPrice: data.unitPrice ?? null,
    includesVat: data.includesVat ?? true,
    createdBy: userId,
  };
}

const service = createBudgetService({
  budgetTable: workItemBudgets,
  budgetEntityIdColumn: 'workItemId',
  invoiceHandler: {
    budgetIdColumn: 'work_item_budget_id',
    blockDeleteOnInvoices: true,
  },
  toLine: toWorkItemBudgetLine,
  buildInsertValues,
  assertEntityExists: assertWorkItemExists,
});

export function listWorkItemBudgets(db: DbType, workItemId: string): WorkItemBudgetLine[] {
  return service.list(db, workItemId);
}

export function createWorkItemBudget(
  db: DbType,
  workItemId: string,
  userId: string,
  data: CreateWorkItemBudgetRequest,
): WorkItemBudgetLine {
  return service.create(db, workItemId, userId, data);
}

export function updateWorkItemBudget(
  db: DbType,
  workItemId: string,
  budgetId: string,
  data: UpdateWorkItemBudgetRequest,
): WorkItemBudgetLine {
  // Check if this is a move request (cross-table or same-table)
  const hasNewWorkItem = data.newWorkItemId !== undefined && data.newWorkItemId !== null;
  const hasNewHouseholdItem =
    data.newHouseholdItemId !== undefined && data.newHouseholdItemId !== null;

  if (hasNewWorkItem || hasNewHouseholdItem) {
    // Handle move with the cross-table transaction pattern
    return updateAndMoveWorkItemBudget(db, workItemId, budgetId, data);
  }

  // No move - use factory update
  return service.update(db, workItemId, budgetId, data);
}

function updateAndMoveWorkItemBudget(
  db: DbType,
  workItemId: string,
  budgetId: string,
  data: UpdateWorkItemBudgetRequest,
): WorkItemBudgetLine {
  // Validate mutual exclusion of move fields
  const hasNewWorkItem = data.newWorkItemId !== undefined && data.newWorkItemId !== null;
  const hasNewHouseholdItem =
    data.newHouseholdItemId !== undefined && data.newHouseholdItemId !== null;

  if (hasNewWorkItem && hasNewHouseholdItem) {
    throw new ValidationError('Cannot specify both newWorkItemId and newHouseholdItemId');
  }

  // Cross-table moves are not supported for WI/HI PATCH endpoints
  // (it doesn't make logical sense to move a work item budget to a household item from within the work item context)
  if (hasNewHouseholdItem) {
    throw new ValidationError(
      'Cross-table moves from work item budgets are not supported. Use invoice budget line editing for complex moves.',
    );
  }

  // If no move, use factory update
  if (!hasNewWorkItem) {
    return service.update(db, workItemId, budgetId, data);
  }

  // Handle same-table move: WI → WI
  const targetId = data.newWorkItemId!;

  // Verify source work item exists
  const wi = db.select().from(workItems).where(eq(workItems.id, workItemId)).get();
  if (!wi) {
    throw new NotFoundError('Work item not found');
  }

  // Verify the budget line exists and belongs to this work item
  const wib = db.select().from(workItemBudgets).where(eq(workItemBudgets.id, budgetId)).get();
  if (!wib) {
    throw new NotFoundError('Budget line not found');
  }
  if (wib.workItemId !== workItemId) {
    throw new NotFoundError('Budget line not found for this work item');
  }

  // Validate target work item exists
  const targetWi = db.select().from(workItems).where(eq(workItems.id, targetId)).get();
  if (!targetWi) {
    throw new NotFoundError('Target work item not found');
  }

  db.transaction(() => {
    const now = new Date().toISOString();

    // Build update fields for the budget line (non-move fields)
    const updates: Record<string, unknown> = { updatedAt: now, workItemId: targetId };
    if ('description' in data) updates.description = data.description;
    if ('plannedAmount' in data) updates.plannedAmount = data.plannedAmount;
    if ('confidence' in data) updates.confidence = data.confidence;
    if ('budgetCategoryId' in data) updates.budgetCategoryId = data.budgetCategoryId;
    if ('budgetSourceId' in data) updates.budgetSourceId = data.budgetSourceId;
    if ('vendorId' in data) updates.vendorId = data.vendorId;
    if ('quantity' in data) updates.quantity = data.quantity;
    if ('unit' in data) updates.unit = data.unit;
    if ('unitPrice' in data) updates.unitPrice = data.unitPrice;
    if ('includesVat' in data) updates.includesVat = data.includesVat;

    // Update budget line with new parent and field updates
    db.update(workItemBudgets).set(updates).where(eq(workItemBudgets.id, budgetId)).run();
  });

  // Fetch from the new target work item
  return service.list(db, targetId).find((b) => b.id === budgetId)!;
}

export function deleteWorkItemBudget(db: DbType, workItemId: string, budgetId: string): void {
  return service.delete(db, workItemId, budgetId);
}
