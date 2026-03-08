import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import {
  invoiceBudgetLines,
  invoices,
  workItemBudgets,
  householdItemBudgets,
  workItems,
  householdItems,
  budgetCategories,
} from '../db/schema.js';
import type {
  InvoiceBudgetLineDetailResponse,
  InvoiceBudgetLineCreateResponse,
  InvoiceBudgetLineListDetailResponse,
  InvoiceBudgetLineSummary,
  ConfidenceLevel,
} from '@cornerstone/shared';
import {
  NotFoundError,
  ValidationError,
  BudgetLineAlreadyLinkedError,
  ItemizedSumExceedsInvoiceError,
} from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

interface CreateInvoiceBudgetLineData {
  workItemBudgetId?: string | null;
  householdItemBudgetId?: string | null;
  itemizedAmount: number;
}

interface UpdateInvoiceBudgetLineData {
  workItemBudgetId?: string | null;
  householdItemBudgetId?: string | null;
  itemizedAmount?: number;
}

/**
 * Resolve the full detail for a single invoice budget line row.
 * Queries the budget line table, category, and parent item.
 */
function resolveDetail(
  db: DbType,
  row: typeof invoiceBudgetLines.$inferSelect,
): InvoiceBudgetLineDetailResponse {
  const budgetLineId = row.workItemBudgetId || row.householdItemBudgetId;
  const budgetLineType = row.workItemBudgetId ? 'work_item' : 'household_item';

  let budgetLineDescription: string | null = null;
  let plannedAmount = 0;
  let confidence: ConfidenceLevel = 'own_estimate';
  let categoryId: string | null = null;
  let parentItemId = '';
  let parentItemTitle = '';

  if (row.workItemBudgetId) {
    const wib = db.select().from(workItemBudgets).where(eq(workItemBudgets.id, row.workItemBudgetId)).get();
    if (!wib) {
      throw new NotFoundError('Work item budget line not found');
    }
    budgetLineDescription = wib.description;
    plannedAmount = wib.plannedAmount;
    confidence = wib.confidence as ConfidenceLevel;
    categoryId = wib.budgetCategoryId;

    const wi = db.select().from(workItems).where(eq(workItems.id, wib.workItemId)).get();
    if (!wi) {
      throw new NotFoundError('Work item not found');
    }
    parentItemId = wi.id;
    parentItemTitle = wi.title;
  } else if (row.householdItemBudgetId) {
    const hib = db.select().from(householdItemBudgets).where(eq(householdItemBudgets.id, row.householdItemBudgetId)).get();
    if (!hib) {
      throw new NotFoundError('Household item budget line not found');
    }
    budgetLineDescription = hib.description;
    plannedAmount = hib.plannedAmount;
    confidence = hib.confidence as ConfidenceLevel;
    categoryId = hib.budgetCategoryId;

    const hi = db.select().from(householdItems).where(eq(householdItems.id, hib.householdItemId)).get();
    if (!hi) {
      throw new NotFoundError('Household item not found');
    }
    parentItemId = hi.id;
    parentItemTitle = hi.name;
  }

  let categoryName: string | null = null;
  let categoryColor: string | null = null;
  if (categoryId) {
    const cat = db.select().from(budgetCategories).where(eq(budgetCategories.id, categoryId)).get();
    if (cat) {
      categoryName = cat.name;
      categoryColor = cat.color;
    }
  }

  return {
    id: row.id,
    invoiceId: row.invoiceId,
    workItemBudgetId: row.workItemBudgetId,
    householdItemBudgetId: row.householdItemBudgetId,
    itemizedAmount: row.itemizedAmount,
    budgetLineDescription,
    plannedAmount,
    confidence,
    categoryId,
    categoryName,
    categoryColor,
    parentItemId,
    parentItemTitle,
    parentItemType: budgetLineType,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Validate input data for creating/updating invoice budget lines.
 * Throws ValidationError if any field is invalid.
 */
function validateData(data: CreateInvoiceBudgetLineData | UpdateInvoiceBudgetLineData): void {
  if ('itemizedAmount' in data && data.itemizedAmount !== undefined) {
    if (data.itemizedAmount <= 0) {
      throw new ValidationError('itemizedAmount must be greater than 0');
    }
  }
}

/**
 * List all invoice budget lines for a given invoice.
 * Returns the lines and the remaining unallocated amount.
 */
export function listInvoiceBudgetLines(
  db: DbType,
  invoiceId: string,
): InvoiceBudgetLineListDetailResponse {
  // Verify invoice exists
  const invoice = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
  if (!invoice) {
    throw new NotFoundError('Invoice not found');
  }

  // Fetch all budget lines
  const rows = db
    .select()
    .from(invoiceBudgetLines)
    .where(eq(invoiceBudgetLines.invoiceId, invoiceId))
    .orderBy(invoiceBudgetLines.createdAt)
    .all();

  // Resolve details for each line
  const budgetLines = rows.map((row) => resolveDetail(db, row));

  // Calculate remaining amount
  const itemizedTotal = rows.reduce((sum, row) => sum + row.itemizedAmount, 0);
  const remainingAmount = invoice.amount - itemizedTotal;

  return {
    budgetLines,
    remainingAmount,
  };
}

/**
 * Create a new invoice budget line.
 * Validates: invoice exists, budget line exists, not already linked to a different invoice,
 * itemized sum would not exceed invoice total.
 */
export function createInvoiceBudgetLine(
  db: DbType,
  invoiceId: string,
  data: CreateInvoiceBudgetLineData,
): InvoiceBudgetLineCreateResponse {
  // Validate input
  validateData(data);

  // Verify invoice exists
  const invoice = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
  if (!invoice) {
    throw new NotFoundError('Invoice not found');
  }

  // Validate XOR: exactly one of workItemBudgetId or householdItemBudgetId
  const hasWorkItem = data.workItemBudgetId !== undefined && data.workItemBudgetId !== null;
  const hasHouseholdItem = data.householdItemBudgetId !== undefined && data.householdItemBudgetId !== null;

  if (!hasWorkItem && !hasHouseholdItem) {
    throw new ValidationError('Either workItemBudgetId or householdItemBudgetId must be provided');
  }
  if (hasWorkItem && hasHouseholdItem) {
    throw new ValidationError('Cannot link to both workItemBudgetId and householdItemBudgetId');
  }

  // Verify the referenced budget line exists
  if (hasWorkItem) {
    const wib = db.select().from(workItemBudgets).where(eq(workItemBudgets.id, data.workItemBudgetId!)).get();
    if (!wib) {
      throw new NotFoundError('Work item budget line not found');
    }

    // Check if already linked to a different invoice
    const existing = db
      .select()
      .from(invoiceBudgetLines)
      .where(eq(invoiceBudgetLines.workItemBudgetId, data.workItemBudgetId!))
      .get();
    if (existing) {
      if (existing.invoiceId === invoiceId) {
        throw new ValidationError('This budget line is already linked to this invoice');
      }
      throw new BudgetLineAlreadyLinkedError(
        'Budget line is already linked to a different invoice',
      );
    }
  } else {
    const hib = db.select().from(householdItemBudgets).where(eq(householdItemBudgets.id, data.householdItemBudgetId!)).get();
    if (!hib) {
      throw new NotFoundError('Household item budget line not found');
    }

    // Check if already linked to a different invoice
    const existing = db
      .select()
      .from(invoiceBudgetLines)
      .where(eq(invoiceBudgetLines.householdItemBudgetId, data.householdItemBudgetId!))
      .get();
    if (existing) {
      if (existing.invoiceId === invoiceId) {
        throw new ValidationError('This budget line is already linked to this invoice');
      }
      throw new BudgetLineAlreadyLinkedError(
        'Budget line is already linked to a different invoice',
      );
    }
  }

  // Check: sum of itemized amounts would not exceed invoice total
  const existingRows = db
    .select()
    .from(invoiceBudgetLines)
    .where(eq(invoiceBudgetLines.invoiceId, invoiceId))
    .all();
  const itemizedTotal = existingRows.reduce((sum, row) => sum + row.itemizedAmount, 0);
  const newTotal = itemizedTotal + data.itemizedAmount;
  if (newTotal > invoice.amount) {
    throw new ItemizedSumExceedsInvoiceError(
      `Sum of itemized amounts (${newTotal}) would exceed invoice total (${invoice.amount})`,
    );
  }

  // Create the line
  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(invoiceBudgetLines)
    .values({
      id,
      invoiceId,
      workItemBudgetId: data.workItemBudgetId ?? null,
      householdItemBudgetId: data.householdItemBudgetId ?? null,
      itemizedAmount: data.itemizedAmount,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const row = db.select().from(invoiceBudgetLines).where(eq(invoiceBudgetLines.id, id)).get()!;
  const budgetLine = resolveDetail(db, row);

  // Calculate remaining amount
  const newRemainingAmount = invoice.amount - newTotal;

  return {
    budgetLine,
    remainingAmount: newRemainingAmount,
  };
}

/**
 * Update an existing invoice budget line.
 * Cannot change the linked budget line (work item or household item).
 * Can only update itemizedAmount.
 */
export function updateInvoiceBudgetLine(
  db: DbType,
  invoiceId: string,
  lineId: string,
  data: UpdateInvoiceBudgetLineData,
): InvoiceBudgetLineCreateResponse {
  // Verify invoice exists
  const invoice = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
  if (!invoice) {
    throw new NotFoundError('Invoice not found');
  }

  // Verify the line exists and belongs to this invoice
  const existing = db.select().from(invoiceBudgetLines).where(eq(invoiceBudgetLines.id, lineId)).get();
  if (!existing) {
    throw new NotFoundError('Invoice budget line not found');
  }
  if (existing.invoiceId !== invoiceId) {
    throw new NotFoundError('Invoice budget line not found in this invoice');
  }

  // Cannot change the linked budget line
  if (data.workItemBudgetId !== undefined || data.householdItemBudgetId !== undefined) {
    throw new ValidationError('Cannot change the linked budget line');
  }

  // Validate input
  validateData(data);

  // If updating itemizedAmount, check it would not exceed invoice total
  let newItemizedAmount = existing.itemizedAmount;
  if (data.itemizedAmount !== undefined) {
    newItemizedAmount = data.itemizedAmount;

    const otherRows = db
      .select()
      .from(invoiceBudgetLines)
      .where(sql`${invoiceBudgetLines.invoiceId} = ${invoiceId} AND ${invoiceBudgetLines.id} != ${lineId}`)
      .all();
    const otherTotal = otherRows.reduce((sum, row) => sum + row.itemizedAmount, 0);
    const newTotal = otherTotal + newItemizedAmount;
    if (newTotal > invoice.amount) {
      throw new ItemizedSumExceedsInvoiceError(
        `Sum of itemized amounts (${newTotal}) would exceed invoice total (${invoice.amount})`,
      );
    }
  }

  // Update
  const now = new Date().toISOString();
  db.update(invoiceBudgetLines)
    .set({
      itemizedAmount: newItemizedAmount,
      updatedAt: now,
    })
    .where(eq(invoiceBudgetLines.id, lineId))
    .run();

  const updated = db.select().from(invoiceBudgetLines).where(eq(invoiceBudgetLines.id, lineId)).get()!;
  const budgetLine = resolveDetail(db, updated);

  // Calculate remaining amount
  const allRows = db
    .select()
    .from(invoiceBudgetLines)
    .where(eq(invoiceBudgetLines.invoiceId, invoiceId))
    .all();
  const itemizedTotal = allRows.reduce((sum, row) => sum + row.itemizedAmount, 0);
  const remainingAmount = invoice.amount - itemizedTotal;

  return {
    budgetLine,
    remainingAmount,
  };
}

/**
 * Delete an invoice budget line.
 */
export function deleteInvoiceBudgetLine(db: DbType, invoiceId: string, lineId: string): void {
  // Verify invoice exists
  const invoice = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
  if (!invoice) {
    throw new NotFoundError('Invoice not found');
  }

  // Verify the line exists and belongs to this invoice
  const existing = db.select().from(invoiceBudgetLines).where(eq(invoiceBudgetLines.id, lineId)).get();
  if (!existing) {
    throw new NotFoundError('Invoice budget line not found');
  }
  if (existing.invoiceId !== invoiceId) {
    throw new NotFoundError('Invoice budget line not found in this invoice');
  }

  // Delete
  db.delete(invoiceBudgetLines).where(eq(invoiceBudgetLines.id, lineId)).run();
}

/**
 * Get budget lines for an invoice for embedding in Invoice response.
 * Returns InvoiceBudgetLineSummary[] and remainingAmount.
 * Used by invoiceService.toInvoice() to populate the budgetLines field.
 */
export function getInvoiceBudgetLinesForInvoice(
  db: DbType,
  invoiceId: string,
  invoiceAmount: number,
): { budgetLines: InvoiceBudgetLineSummary[]; remainingAmount: number } {
  const rows = db.all<{
    id: string;
    work_item_budget_id: string | null;
    household_item_budget_id: string | null;
    itemized_amount: number;
    budget_line_description: string | null;
    planned_amount: number;
    confidence: string;
    category_id: string | null;
    category_name: string | null;
    category_color: string | null;
    item_type: string;
    item_id: string;
    item_name: string;
  }>(
    sql`SELECT
      ibl.id,
      ibl.work_item_budget_id,
      ibl.household_item_budget_id,
      ibl.itemized_amount,
      COALESCE(wib.description, hib.description) AS budget_line_description,
      COALESCE(wib.planned_amount, hib.planned_amount) AS planned_amount,
      COALESCE(wib.confidence, hib.confidence) AS confidence,
      bc.id AS category_id,
      bc.name AS category_name,
      bc.color AS category_color,
      CASE WHEN ibl.work_item_budget_id IS NOT NULL THEN 'work_item' ELSE 'household_item' END AS item_type,
      CASE WHEN ibl.work_item_budget_id IS NOT NULL THEN wi.id ELSE hi.id END AS item_id,
      CASE WHEN ibl.work_item_budget_id IS NOT NULL THEN wi.title ELSE hi.name END AS item_name
    FROM invoice_budget_lines ibl
    LEFT JOIN work_item_budgets wib ON wib.id = ibl.work_item_budget_id
    LEFT JOIN household_item_budgets hib ON hib.id = ibl.household_item_budget_id
    LEFT JOIN work_items wi ON wi.id = wib.work_item_id
    LEFT JOIN household_items hi ON hi.id = hib.household_item_id
    LEFT JOIN budget_categories bc ON bc.id = COALESCE(wib.budget_category_id, hib.budget_category_id)
    WHERE ibl.invoice_id = ${invoiceId}
      AND (ibl.work_item_budget_id IS NOT NULL OR ibl.household_item_budget_id IS NOT NULL)
    ORDER BY ibl.created_at ASC`,
  );

  const budgetLines: InvoiceBudgetLineSummary[] = rows.map((r) => ({
    id: r.id,
    budgetLineId: r.work_item_budget_id || r.household_item_budget_id!,
    budgetLineType: r.item_type as 'work_item' | 'household_item',
    itemName: r.item_name,
    budgetLineDescription: r.budget_line_description,
    categoryName: r.category_name,
    categoryColor: r.category_color,
    plannedAmount: r.planned_amount,
    confidence: r.confidence as ConfidenceLevel,
    itemizedAmount: r.itemized_amount,
  }));

  const itemizedTotal = rows.reduce((sum, r) => sum + r.itemized_amount, 0);
  const remainingAmount = invoiceAmount - itemizedTotal;

  return {
    budgetLines,
    remainingAmount,
  };
}
