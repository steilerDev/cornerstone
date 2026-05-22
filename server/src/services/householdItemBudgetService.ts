import { eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { householdItems, householdItemBudgets, workItems, workItemBudgets, invoiceBudgetLines } from '../db/schema.js';
import { createBudgetService } from './shared/budgetServiceFactory.js';
import type { ResolvedBudgetRelations } from './shared/budgetServiceFactory.js';
import type {
  HouseholdItemBudgetLine,
  CreateHouseholdItemBudgetRequest,
  UpdateHouseholdItemBudgetRequest,
  InvoiceStatus,
} from '@cornerstone/shared';
import { NotFoundError, ValidationError, BudgetLineAlreadyLinkedError } from '../errors/AppError.js';

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
    quantity: data.quantity ?? null,
    unit: data.unit ?? null,
    unitPrice: data.unitPrice ?? null,
    includesVat: data.includesVat ?? true,
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
  // Check if this is a move request (cross-table or same-table)
  const hasNewHouseholdItem =
    data.newHouseholdItemId !== undefined && data.newHouseholdItemId !== null;
  const hasNewWorkItem = data.newWorkItemId !== undefined && data.newWorkItemId !== null;

  if (hasNewHouseholdItem || hasNewWorkItem) {
    // Handle move with the cross-table transaction pattern
    return updateAndMoveHouseholdItemBudget(db, householdItemId, budgetId, data);
  }

  // No move - filter out budgetCategoryId (always 'bc-household-items' for HI budgets) and use factory update
  const { budgetCategoryId: _ignored, ...safeData } = data;
  return service.update(db, householdItemId, budgetId, safeData);
}

function updateAndMoveHouseholdItemBudget(
  db: DbType,
  householdItemId: string,
  budgetId: string,
  data: UpdateHouseholdItemBudgetRequest,
): HouseholdItemBudgetLine {
  // Validate mutual exclusion of move fields
  const hasNewHouseholdItem =
    data.newHouseholdItemId !== undefined && data.newHouseholdItemId !== null;
  const hasNewWorkItem = data.newWorkItemId !== undefined && data.newWorkItemId !== null;

  if (hasNewHouseholdItem && hasNewWorkItem) {
    throw new ValidationError('Cannot specify both newWorkItemId and newHouseholdItemId');
  }

  // Cross-table moves are not supported for WI/HI PATCH endpoints
  // (it doesn't make logical sense to move a household item budget to a work item from within the household item context)
  if (hasNewWorkItem) {
    throw new ValidationError(
      'Cross-table moves from household item budgets are not supported. Use invoice budget line editing for complex moves.',
    );
  }

  // If no move, use factory update
  if (!hasNewHouseholdItem) {
    const { budgetCategoryId: _ignored, ...safeData } = data;
    return service.update(db, householdItemId, budgetId, safeData);
  }

  // Handle same-table move: HI → HI
  const targetId = data.newHouseholdItemId!;

  // Verify source household item exists
  const hi = db.select().from(householdItems).where(eq(householdItems.id, householdItemId)).get();
  if (!hi) {
    throw new NotFoundError('Household item not found');
  }

  // Verify the budget line exists and belongs to this household item
  const hib = db
    .select()
    .from(householdItemBudgets)
    .where(eq(householdItemBudgets.id, budgetId))
    .get();
  if (!hib) {
    throw new NotFoundError('Budget line not found');
  }
  if (hib.householdItemId !== householdItemId) {
    throw new NotFoundError('Budget line not found for this household item');
  }

  // Validate target household item exists
  const targetHi = db.select().from(householdItems).where(eq(householdItems.id, targetId)).get();
  if (!targetHi) {
    throw new NotFoundError('Target household item not found');
  }

  db.transaction(() => {
    const now = new Date().toISOString();

    // Build update fields for the budget line (non-move fields)
    // Note: budgetCategoryId is always 'bc-household-items' for HI budgets, so ignore any provided value
    const updates: Record<string, unknown> = { updatedAt: now, householdItemId: targetId };
    if ('description' in data) updates.description = data.description;
    if ('plannedAmount' in data) updates.plannedAmount = data.plannedAmount;
    if ('confidence' in data) updates.confidence = data.confidence;
    if ('budgetSourceId' in data) updates.budgetSourceId = data.budgetSourceId;
    if ('vendorId' in data) updates.vendorId = data.vendorId;
    if ('quantity' in data) updates.quantity = data.quantity;
    if ('unit' in data) updates.unit = data.unit;
    if ('unitPrice' in data) updates.unitPrice = data.unitPrice;
    if ('includesVat' in data) updates.includesVat = data.includesVat;

    // Check BUDGET_LINE_ALREADY_LINKED guard: does target HI have any IBLs linking to it?
    const existingLink = db
      .select({ id: invoiceBudgetLines.id })
      .from(invoiceBudgetLines)
      .innerJoin(
        householdItemBudgets,
        eq(householdItemBudgets.id, invoiceBudgetLines.householdItemBudgetId),
      )
      .where(
        sql`${householdItemBudgets.householdItemId} = ${targetId} AND ${invoiceBudgetLines.householdItemBudgetId} IS NOT NULL`,
      )
      .get();

    if (existingLink) {
      throw new BudgetLineAlreadyLinkedError(
        'Target household item already has a linked budget line',
      );
    }

    // Update budget line with new parent and field updates
    db.update(householdItemBudgets).set(updates).where(eq(householdItemBudgets.id, budgetId)).run();
  });

  // Fetch from the new target household item
  return service.list(db, targetId).find((b) => b.id === budgetId)!;
}

export function deleteHouseholdItemBudget(
  db: DbType,
  householdItemId: string,
  budgetId: string,
): void {
  return service.delete(db, householdItemId, budgetId);
}
