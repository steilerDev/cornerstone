import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { workItems, workItemBudgets, budgetCategories, budgetSources, vendors, users } from '../db/schema.js';
import {
  toUserSummary,
  toBudgetCategory,
  toBudgetSourceSummary,
  toVendorSummary,
} from './shared/converters.js';
import { createBudgetService, getLinkedInvoices, getInvoiceAggregates } from './shared/budgetServiceFactory.js';
import type {
  WorkItemBudgetLine,
  ConfidenceLevel,
  CreateWorkItemBudgetRequest,
  UpdateWorkItemBudgetRequest,
} from '@cornerstone/shared';
import { CONFIDENCE_MARGINS as confidenceMargins } from '@cornerstone/shared';
import { NotFoundError } from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

function toWorkItemBudgetLine(db: DbType, row: typeof workItemBudgets.$inferSelect): WorkItemBudgetLine {
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

  const { actualCost, actualCostPaid, invoiceCount } = getInvoiceAggregates(
    db,
    row.id,
    'work_item_budget_id',
  );
  const invoiceList = getLinkedInvoices(db, row.id, 'work_item_budget_id');

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
    createdBy: userId,
  };
}

const service = createBudgetService({
  entityTable: workItems,
  budgetTable: workItemBudgets,
  budgetEntityIdColumn: 'workItemId',
  entityLabel: 'Work item',
  budgetLabel: 'Budget line',
  entityIdColumnName: 'workItemId',
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
