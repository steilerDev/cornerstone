import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import {
  workItemBudgets,
  householdItemBudgets,
  invoiceBudgetLines,
  workItems,
  householdItems,
} from '../db/schema.js';
import type { BudgetLineAssignRequest, InvoiceBudgetLineDetailResponse } from '@cornerstone/shared';
import {
  NotFoundError,
  BudgetLineAlreadyAssignedError,
  ValidationError,
} from '../errors/AppError.js';
import * as invoiceBudgetLineService from './invoiceBudgetLineService.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Assign an orphan (unassigned) work_item_budget line to a parent item.
 * Supports two assignment paths:
 *   1. work_item: Update the work_item_id field on the budget line
 *   2. household_item: Create a new household_item_budget line, repoint the invoice link, delete the orphan
 *
 * Returns the full detail of the reassigned invoice budget line.
 */
export function assignBudgetLine(
  db: DbType,
  budgetLineId: string,
  body: BudgetLineAssignRequest,
  _userId: string,
): InvoiceBudgetLineDetailResponse {
  // Look up the work_item_budget row
  const wib = db.select().from(workItemBudgets).where(eq(workItemBudgets.id, budgetLineId)).get();

  if (!wib) {
    throw new NotFoundError('Work item budget line not found');
  }

  // Check it's an orphan (unassigned)
  if (wib.workItemId !== null) {
    throw new BudgetLineAlreadyAssignedError('This budget line is already assigned.');
  }

  // Route by targetType
  if (body.targetType === 'work_item') {
    return assignToWorkItem(db, wib, body);
  } else if (body.targetType === 'household_item') {
    return assignToHouseholdItem(db, wib, body);
  }

  throw new ValidationError('Invalid targetType');
}

/**
 * Assign the orphan work_item_budget to a work item.
 * Validates the target work item exists, updates work_item_id, optionally updates budgetCategoryId.
 * Returns the full detail of the invoice budget line linked to this budget line.
 */
function assignToWorkItem(
  db: DbType,
  wib: typeof workItemBudgets.$inferSelect,
  body: BudgetLineAssignRequest,
): InvoiceBudgetLineDetailResponse {
  // Validate target work item exists
  const wi = db.select().from(workItems).where(eq(workItems.id, body.targetId)).get();
  if (!wi) {
    throw new NotFoundError('Work item not found');
  }

  // Update the budget line
  const now = new Date().toISOString();
  db.update(workItemBudgets)
    .set({
      workItemId: body.targetId,
      budgetCategoryId: body.budgetCategoryId ?? wib.budgetCategoryId,
      updatedAt: now,
    })
    .where(eq(workItemBudgets.id, wib.id))
    .run();

  // Fetch the linked invoice_budget_line to get its IBL ID, then return full detail
  const ibl = db
    .select()
    .from(invoiceBudgetLines)
    .where(eq(invoiceBudgetLines.workItemBudgetId, wib.id))
    .get();

  if (!ibl) {
    throw new NotFoundError('Invoice budget line not found');
  }

  return invoiceBudgetLineService.getBudgetLineDetail(db, ibl.id);
}

/**
 * Assign the orphan work_item_budget to a household item.
 * Creates a new household_item_budget line, repoints the invoice link, deletes the orphan work_item_budget.
 * Always assigns to 'bc-household-items' category.
 * Returns the full detail of the invoice budget line now linked to the new household_item_budget.
 */
function assignToHouseholdItem(
  db: DbType,
  wib: typeof workItemBudgets.$inferSelect,
  body: BudgetLineAssignRequest,
): InvoiceBudgetLineDetailResponse {
  // Validate target household item exists
  const hi = db.select().from(householdItems).where(eq(householdItems.id, body.targetId)).get();
  if (!hi) {
    throw new NotFoundError('Household item not found');
  }

  // Run in transaction for atomicity
  const result = db.transaction(() => {
    const now = new Date().toISOString();

    // Step 1: Create the new household_item_budget line with all fields from the orphan
    const newHibId = 'hib-' + randomUUID();
    db.insert(householdItemBudgets)
      .values({
        id: newHibId,
        householdItemId: body.targetId,
        description: wib.description,
        plannedAmount: wib.plannedAmount,
        confidence: wib.confidence,
        budgetCategoryId: 'bc-household-items', // Always use household items category
        budgetSourceId: wib.budgetSourceId,
        vendorId: wib.vendorId,
        quantity: wib.quantity,
        unit: wib.unit,
        unitPrice: wib.unitPrice,
        includesVat: wib.includesVat,
        createdBy: wib.createdBy,
        createdAt: wib.createdAt,
        updatedAt: now,
        origin: wib.origin,
      })
      .run();

    // Step 2: Fetch the invoice_budget_line linked to this work_item_budget
    const ibl = db
      .select()
      .from(invoiceBudgetLines)
      .where(eq(invoiceBudgetLines.workItemBudgetId, wib.id))
      .get();

    if (!ibl) {
      throw new NotFoundError('Invoice budget line not found');
    }

    // Step 3: Repoint the invoice_budget_line to the new household_item_budget
    db.update(invoiceBudgetLines)
      .set({
        workItemBudgetId: null,
        householdItemBudgetId: newHibId,
        updatedAt: now,
      })
      .where(eq(invoiceBudgetLines.id, ibl.id))
      .run();

    // Step 4: Delete the orphan work_item_budget
    db.delete(workItemBudgets).where(eq(workItemBudgets.id, wib.id)).run();

    // Return the IBL ID for fetching the final detail
    return ibl.id;
  });

  // Fetch and return the full detail of the reassigned invoice budget line
  return invoiceBudgetLineService.getBudgetLineDetail(db, result);
}

/**
 * Internal helper to fetch the full detail of an invoice budget line.
 * Pulled into this service to avoid circular imports.
 */
export function getBudgetLineDetail(
  db: DbType,
  invoiceBudgetLineId: string,
): InvoiceBudgetLineDetailResponse {
  return invoiceBudgetLineService.getBudgetLineDetail(db, invoiceBudgetLineId);
}
