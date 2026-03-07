import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { householdItems, householdItemBudgets, budgetCategories, budgetSources, vendors, users } from '../db/schema.js';
import {
  toUserSummary,
  toBudgetCategory,
  toBudgetSourceSummary,
  toVendorSummary,
} from './shared/converters.js';
import { createBudgetService, getInvoiceAggregates } from './shared/budgetServiceFactory.js';
import type {
  HouseholdItemBudgetLine,
  ConfidenceLevel,
  CreateHouseholdItemBudgetRequest,
  UpdateHouseholdItemBudgetRequest,
} from '@cornerstone/shared';
import { CONFIDENCE_MARGINS as confidenceMargins } from '@cornerstone/shared';
import { NotFoundError } from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

function toHouseholdItemBudgetLine(
  db: DbType,
  row: typeof householdItemBudgets.$inferSelect,
): HouseholdItemBudgetLine {
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
    'household_item_budget_id',
  );

  return {
    id: row.id,
    householdItemId: row.householdItemId,
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
    createdBy: toUserSummary(createdByUser),
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
  entityTable: householdItems,
  budgetTable: householdItemBudgets,
  budgetEntityIdColumn: 'householdItemId',
  entityLabel: 'Household item',
  budgetLabel: 'Budget line',
  entityIdColumnName: 'householdItemId',
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
