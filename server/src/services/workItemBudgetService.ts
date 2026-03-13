import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { workItems, workItemBudgets } from '../db/schema.js';
import { createBudgetService } from './shared/budgetServiceFactory.js';
import type { ResolvedBudgetRelations } from './shared/budgetServiceFactory.js';
import type {
  WorkItemBudgetLine,
  CreateWorkItemBudgetRequest,
  UpdateWorkItemBudgetRequest,
  InvoiceStatus,
} from '@cornerstone/shared';
import { NotFoundError } from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

function toWorkItemBudgetLine(
  _db: DbType,
  row: typeof workItemBudgets.$inferSelect,
  rel: ResolvedBudgetRelations,
): WorkItemBudgetLine {
  return {
    id: row.id,
    workItemId: row.workItemId,
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
        }
      : null,
    quantity: row.quantity ?? null,
    unit: row.unit ?? null,
    unitPrice: row.unitPrice ?? null,
    includesVat: row.includesVat ?? null,
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
    includesVat: data.includesVat ?? null,
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
  return service.update(db, workItemId, budgetId, data);
}

export function deleteWorkItemBudget(db: DbType, workItemId: string, budgetId: string): void {
  return service.delete(db, workItemId, budgetId);
}
