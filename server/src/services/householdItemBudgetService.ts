import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { householdItems, householdItemBudgets } from '../db/schema.js';
import { createBudgetService } from './shared/budgetServiceFactory.js';
import type { ResolvedBudgetRelations } from './shared/budgetServiceFactory.js';
import type {
  HouseholdItemBudgetLine,
  CreateHouseholdItemBudgetRequest,
  UpdateHouseholdItemBudgetRequest,
  InvoiceStatus,
} from '@cornerstone/shared';
import { NotFoundError } from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

function toHouseholdItemBudgetLine(
  _db: DbType,
  row: typeof householdItemBudgets.$inferSelect,
  rel: ResolvedBudgetRelations,
): HouseholdItemBudgetLine {
  return {
    id: row.id,
    householdItemId: row.householdItemId,
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
    createdBy: rel.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function assertHouseholdItemExists(db: DbType, householdItemId: string): void {
  const item = db.select().from(householdItems).where(eq(householdItems.id, householdItemId)).get();
  if (!item) {
    throw new NotFoundError('Household item not found');
  }
}

function buildInsertValues(
  _db: DbType,
  householdItemId: string,
  userId: string,
  data: CreateHouseholdItemBudgetRequest,
): Record<string, any> {
  return {
    householdItemId,
    description: data.description ?? null,
    plannedAmount: data.plannedAmount,
    confidence: data.confidence ?? 'own_estimate',
    budgetCategoryId: 'bc-household-items',
    budgetSourceId: data.budgetSourceId ?? null,
    vendorId: data.vendorId ?? null,
    createdBy: userId,
  };
}

const service = createBudgetService({
  budgetTable: householdItemBudgets,
  budgetEntityIdColumn: 'householdItemId',
  invoiceHandler: {
    budgetIdColumn: 'household_item_budget_id',
    blockDeleteOnInvoices: false,
  },
  toLine: toHouseholdItemBudgetLine,
  buildInsertValues,
  assertEntityExists: assertHouseholdItemExists,
});

export function listHouseholdItemBudgets(
  db: DbType,
  householdItemId: string,
): HouseholdItemBudgetLine[] {
  return service.list(db, householdItemId);
}

export function createHouseholdItemBudget(
  db: DbType,
  householdItemId: string,
  userId: string,
  data: CreateHouseholdItemBudgetRequest,
): HouseholdItemBudgetLine {
  const { budgetCategoryId: _ignored, ...safeData } = data;
  return service.create(db, householdItemId, userId, safeData);
}

export function updateHouseholdItemBudget(
  db: DbType,
  householdItemId: string,
  budgetId: string,
  data: UpdateHouseholdItemBudgetRequest,
): HouseholdItemBudgetLine {
  const { budgetCategoryId: _ignored, ...safeData } = data;
  return service.update(db, householdItemId, budgetId, safeData);
}

export function deleteHouseholdItemBudget(
  db: DbType,
  householdItemId: string,
  budgetId: string,
): void {
  return service.delete(db, householdItemId, budgetId);
}
