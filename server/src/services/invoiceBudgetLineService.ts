import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import type { areas } from '../db/schema.js';
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
  AreaSummary,
} from '@cornerstone/shared';
import {
  NotFoundError,
  ValidationError,
  BudgetLineAlreadyLinkedError,
  ItemizedSumExceedsInvoiceError,
} from '../errors/AppError.js';
import { loadAreaMap, resolveAreaAncestors, type AreaMapEntry } from './areaService.js';
import { toAreaSummary } from './shared/converters.js';

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
 * Helper to resolve area summary with ancestors from area map.
 */
function getAreaWithAncestors(
  areaId: string | null,
  areaMap: Map<string, AreaMapEntry>,
): AreaSummary | null {
  if (!areaId) return null;
  const entry = areaMap.get(areaId);
  if (!entry) return null;
  const ancestors = resolveAreaAncestors(areaId, areaMap);
  return toAreaSummary(
    {
      id: entry.id,
      name: entry.name,
      color: entry.color,
      parentId: entry.parentId,
    } as typeof areas.$inferSelect,
    ancestors,
  );
}

/**
 * Resolve the full detail for a single invoice budget line row.
 * Queries the budget line table, category, and parent item.
 * Handles orphan work_item_budget rows (work_item_id IS NULL).
 * Returns budget-line pricing/source/vendor fields for edit form pre-population.
 */
function resolveDetail(
  db: DbType,
  row: typeof invoiceBudgetLines.$inferSelect,
  areaMap: Map<string, AreaMapEntry>,
): InvoiceBudgetLineDetailResponse {
  const budgetLineId = row.workItemBudgetId || row.householdItemBudgetId;
  let budgetLineType: 'work_item' | 'household_item' | 'unassigned' = row.workItemBudgetId
    ? 'work_item'
    : 'household_item';

  let budgetLineDescription: string | null = null;
  let plannedAmount = 0;
  let confidence: ConfidenceLevel = 'own_estimate';
  let categoryId: string | null = null;
  let parentItemId: string | null = null;
  let parentItemTitle: string | null = null;
  let parentItemArea: AreaSummary | null = null;
  let quantity: number | null = null;
  let unit: string | null = null;
  let unitPrice: number | null = null;
  let includesVat = true;
  let vendorId: string | null = null;
  let budgetSourceId: string | null = null;

  if (row.workItemBudgetId) {
    const wib = db
      .select()
      .from(workItemBudgets)
      .where(eq(workItemBudgets.id, row.workItemBudgetId))
      .get();
    if (!wib) {
      throw new NotFoundError('Work item budget line not found');
    }
    budgetLineDescription = wib.description;
    plannedAmount = wib.plannedAmount;
    confidence = wib.confidence as ConfidenceLevel;
    categoryId = wib.budgetCategoryId;
    quantity = wib.quantity;
    unit = wib.unit;
    unitPrice = wib.unitPrice;
    includesVat = wib.includesVat;
    vendorId = wib.vendorId;
    budgetSourceId = wib.budgetSourceId;

    // Check if this is an orphan (unassigned) budget line
    if (wib.workItemId === null) {
      budgetLineType = 'unassigned';
      parentItemId = null;
      parentItemTitle = null;
      parentItemArea = null;
    } else {
      const wi = db.select().from(workItems).where(eq(workItems.id, wib.workItemId)).get();
      if (!wi) {
        throw new NotFoundError('Work item not found');
      }
      parentItemId = wi.id;
      parentItemTitle = wi.title;
      parentItemArea = getAreaWithAncestors(wi.areaId, areaMap);
    }
  } else if (row.householdItemBudgetId) {
    const hib = db
      .select()
      .from(householdItemBudgets)
      .where(eq(householdItemBudgets.id, row.householdItemBudgetId))
      .get();
    if (!hib) {
      throw new NotFoundError('Household item budget line not found');
    }
    budgetLineDescription = hib.description;
    plannedAmount = hib.plannedAmount;
    confidence = hib.confidence as ConfidenceLevel;
    categoryId = hib.budgetCategoryId;
    quantity = hib.quantity;
    unit = hib.unit;
    unitPrice = hib.unitPrice;
    includesVat = hib.includesVat;
    vendorId = hib.vendorId;
    budgetSourceId = hib.budgetSourceId;

    const hi = db
      .select()
      .from(householdItems)
      .where(eq(householdItems.id, hib.householdItemId))
      .get();
    if (!hi) {
      throw new NotFoundError('Household item not found');
    }
    parentItemId = hi.id;
    parentItemTitle = hi.name;
    parentItemArea = null; // Household items always have null area
  }

  let categoryName: string | null = null;
  let categoryColor: string | null = null;
  let categoryTranslationKey: string | null = null;
  if (categoryId) {
    const cat = db.select().from(budgetCategories).where(eq(budgetCategories.id, categoryId)).get();
    if (cat) {
      categoryName = cat.name;
      categoryColor = cat.color;
      categoryTranslationKey = cat.translationKey ?? null;
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
    categoryTranslationKey,
    parentItemId,
    parentItemTitle,
    parentItemType: budgetLineType as 'work_item' | 'household_item' | 'unassigned',
    parentItemArea,
    quantity,
    unit,
    unitPrice,
    includesVat,
    vendorId,
    budgetSourceId,
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

  // Load area map once
  const areaMap = loadAreaMap(db);

  // Resolve details for each line
  const budgetLines = rows.map((row) => resolveDetail(db, row, areaMap));

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
  const hasHouseholdItem =
    data.householdItemBudgetId !== undefined && data.householdItemBudgetId !== null;

  if (!hasWorkItem && !hasHouseholdItem) {
    throw new ValidationError('Either workItemBudgetId or householdItemBudgetId must be provided');
  }
  if (hasWorkItem && hasHouseholdItem) {
    throw new ValidationError('Cannot link to both workItemBudgetId and householdItemBudgetId');
  }

  // Verify the referenced budget line exists
  if (hasWorkItem) {
    const wib = db
      .select()
      .from(workItemBudgets)
      .where(eq(workItemBudgets.id, data.workItemBudgetId!))
      .get();
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
    const hib = db
      .select()
      .from(householdItemBudgets)
      .where(eq(householdItemBudgets.id, data.householdItemBudgetId!))
      .get();
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
  const areaMap = loadAreaMap(db);
  const budgetLine = resolveDetail(db, row, areaMap);

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
  const existing = db
    .select()
    .from(invoiceBudgetLines)
    .where(eq(invoiceBudgetLines.id, lineId))
    .get();
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
      .where(
        sql`${invoiceBudgetLines.invoiceId} = ${invoiceId} AND ${invoiceBudgetLines.id} != ${lineId}`,
      )
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

  const updated = db
    .select()
    .from(invoiceBudgetLines)
    .where(eq(invoiceBudgetLines.id, lineId))
    .get()!;
  const areaMap = loadAreaMap(db);
  const budgetLine = resolveDetail(db, updated, areaMap);

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
  const existing = db
    .select()
    .from(invoiceBudgetLines)
    .where(eq(invoiceBudgetLines.id, lineId))
    .get();
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
    category_translation_key: string | null;
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
      bc.translation_key AS category_translation_key,
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
    categoryTranslationKey: r.category_translation_key ?? null,
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

/**
 * Get the full detail for a single invoice budget line by its ID.
 * Used by assignment and other operations that need to return the full detail.
 */
export function getBudgetLineDetail(
  db: DbType,
  invoiceBudgetLineId: string,
): InvoiceBudgetLineDetailResponse {
  const row = db
    .select()
    .from(invoiceBudgetLines)
    .where(eq(invoiceBudgetLines.id, invoiceBudgetLineId))
    .get();

  if (!row) {
    throw new NotFoundError('Invoice budget line not found');
  }

  const areaMap = loadAreaMap(db);
  return resolveDetail(db, row, areaMap);
}

interface EditAndMoveBudgetLineData {
  itemizedAmount?: number;
  description?: string | null;
  plannedAmount?: number;
  confidence?: ConfidenceLevel;
  budgetCategoryId?: string | null;
  budgetSourceId?: string | null;
  vendorId?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  includesVat?: boolean;
  newWorkItemId?: string | null;
  newHouseholdItemId?: string | null;
}

/**
 * Edit and optionally move an invoice budget line.
 * Handles four scenarios: (1) in-place field edit only, (2) same-table parent move,
 * (3) cross-table parent move, (4) any combination of the above.
 *
 * Validates mutual exclusion of move fields, itemized amount > 0, and itemized sum guard.
 * For cross-table moves, drops subsidy links silently (matching assignToHouseholdItem precedent).
 * Returns the updated invoice budget line detail and remaining amount.
 */
export function editAndMoveBudgetLine(
  db: DbType,
  invoiceId: string,
  lineId: string,
  data: EditAndMoveBudgetLineData,
): InvoiceBudgetLineCreateResponse {
  // Step 1: Validate mutual exclusion of move fields
  const hasNewWorkItem = data.newWorkItemId !== undefined && data.newWorkItemId !== null;
  const hasNewHouseholdItem =
    data.newHouseholdItemId !== undefined && data.newHouseholdItemId !== null;

  if (hasNewWorkItem && hasNewHouseholdItem) {
    throw new ValidationError('Cannot specify both newWorkItemId and newHouseholdItemId');
  }

  // Step 2: Verify invoice exists
  const invoice = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
  if (!invoice) {
    throw new NotFoundError('Invoice not found');
  }

  // Step 3: Verify IBL exists and belongs to this invoice
  const ibl = db.select().from(invoiceBudgetLines).where(eq(invoiceBudgetLines.id, lineId)).get();
  if (!ibl) {
    throw new NotFoundError('Invoice budget line not found');
  }
  if (ibl.invoiceId !== invoiceId) {
    throw new NotFoundError('Invoice budget line not found in this invoice');
  }

  // Step 4: Determine current parent type
  const currentParentType = ibl.workItemBudgetId ? 'work_item' : 'household_item';

  // Step 5: Validate itemized amount if provided
  if (data.itemizedAmount !== undefined) {
    if (data.itemizedAmount <= 0) {
      throw new ValidationError('itemizedAmount must be greater than 0');
    }
  }

  // Step 6: Check itemized sum guard if itemizedAmount is changing
  const newItemizedAmount = data.itemizedAmount ?? ibl.itemizedAmount;
  if (newItemizedAmount !== ibl.itemizedAmount) {
    const otherRows = db
      .select()
      .from(invoiceBudgetLines)
      .where(
        sql`${invoiceBudgetLines.invoiceId} = ${invoiceId} AND ${invoiceBudgetLines.id} != ${lineId}`,
      )
      .all();
    const otherTotal = otherRows.reduce((sum, row) => sum + row.itemizedAmount, 0);
    const newTotal = otherTotal + newItemizedAmount;
    if (newTotal > invoice.amount) {
      throw new ItemizedSumExceedsInvoiceError(
        `Sum of itemized amounts (${newTotal}) would exceed invoice total (${invoice.amount})`,
      );
    }
  }

  // Step 7: Determine move type
  const isMoving = hasNewWorkItem || hasNewHouseholdItem;
  const newParentType = hasNewWorkItem ? 'work_item' : 'household_item';
  const isCrossTable = isMoving && currentParentType !== newParentType;
  const isSameTable = isMoving && currentParentType === newParentType;

  // Step 8: Run everything in a single transaction
  const result = db.transaction(() => {
    const now = new Date().toISOString();

    // Build budget-line field updates (only fields present in data, excluding move fields)
    const budgetLineUpdates: Record<string, unknown> = { updatedAt: now };
    if ('description' in data) budgetLineUpdates.description = data.description;
    if ('plannedAmount' in data) budgetLineUpdates.plannedAmount = data.plannedAmount;
    if ('confidence' in data) budgetLineUpdates.confidence = data.confidence;
    if ('budgetCategoryId' in data) budgetLineUpdates.budgetCategoryId = data.budgetCategoryId;
    if ('budgetSourceId' in data) budgetLineUpdates.budgetSourceId = data.budgetSourceId;
    if ('vendorId' in data) budgetLineUpdates.vendorId = data.vendorId;
    if ('quantity' in data) budgetLineUpdates.quantity = data.quantity;
    if ('unit' in data) budgetLineUpdates.unit = data.unit;
    if ('unitPrice' in data) budgetLineUpdates.unitPrice = data.unitPrice;
    if ('includesVat' in data) budgetLineUpdates.includesVat = data.includesVat;

    if (!isMoving) {
      // Case: no move (in-place edit)
      if (ibl.workItemBudgetId) {
        db.update(workItemBudgets)
          .set(budgetLineUpdates)
          .where(eq(workItemBudgets.id, ibl.workItemBudgetId))
          .run();
      } else if (ibl.householdItemBudgetId) {
        db.update(householdItemBudgets)
          .set(budgetLineUpdates)
          .where(eq(householdItemBudgets.id, ibl.householdItemBudgetId))
          .run();
      }

      // Update IBL itemized amount if provided
      if (data.itemizedAmount !== undefined) {
        db.update(invoiceBudgetLines)
          .set({ itemizedAmount: data.itemizedAmount, updatedAt: now })
          .where(eq(invoiceBudgetLines.id, lineId))
          .run();
      }

      return lineId;
    } else if (isSameTable) {
      // Case: same-table move
      const targetId = hasNewWorkItem ? data.newWorkItemId! : data.newHouseholdItemId!;

      if (currentParentType === 'work_item') {
        // Validate target work item exists
        const wi = db.select().from(workItems).where(eq(workItems.id, targetId)).get();
        if (!wi) {
          throw new NotFoundError('Work item not found');
        }

        // Check BUDGET_LINE_ALREADY_LINKED guard
        const existingLink = db
          .select({ id: invoiceBudgetLines.id })
          .from(invoiceBudgetLines)
          .innerJoin(workItemBudgets, eq(workItemBudgets.id, invoiceBudgetLines.workItemBudgetId))
          .where(
            sql`${invoiceBudgetLines.invoiceId} = ${invoiceId} AND ${workItemBudgets.workItemId} = ${targetId} AND ${invoiceBudgetLines.id} != ${lineId}`,
          )
          .get();

        if (existingLink) {
          throw new BudgetLineAlreadyLinkedError(
            'Target work item already has a linked budget line for this invoice',
          );
        }

        // Apply budget-line field updates and set new parent FK
        budgetLineUpdates.workItemId = targetId;
        db.update(workItemBudgets)
          .set(budgetLineUpdates)
          .where(eq(workItemBudgets.id, ibl.workItemBudgetId!))
          .run();
      } else {
        // Validate target household item exists
        const hi = db.select().from(householdItems).where(eq(householdItems.id, targetId)).get();
        if (!hi) {
          throw new NotFoundError('Household item not found');
        }

        // Check BUDGET_LINE_ALREADY_LINKED guard
        const existingLink = db
          .select({ id: invoiceBudgetLines.id })
          .from(invoiceBudgetLines)
          .innerJoin(
            householdItemBudgets,
            eq(householdItemBudgets.id, invoiceBudgetLines.householdItemBudgetId),
          )
          .where(
            sql`${invoiceBudgetLines.invoiceId} = ${invoiceId} AND ${householdItemBudgets.householdItemId} = ${targetId} AND ${invoiceBudgetLines.id} != ${lineId}`,
          )
          .get();

        if (existingLink) {
          throw new BudgetLineAlreadyLinkedError(
            'Target household item already has a linked budget line for this invoice',
          );
        }

        // Apply budget-line field updates and set new parent FK
        budgetLineUpdates.householdItemId = targetId;
        db.update(householdItemBudgets)
          .set(budgetLineUpdates)
          .where(eq(householdItemBudgets.id, ibl.householdItemBudgetId!))
          .run();
      }

      // Update IBL if itemized amount provided
      if (data.itemizedAmount !== undefined) {
        db.update(invoiceBudgetLines)
          .set({ itemizedAmount: data.itemizedAmount, updatedAt: now })
          .where(eq(invoiceBudgetLines.id, lineId))
          .run();
      }

      return lineId;
    } else {
      // Case: cross-table move (WIB → HIB or HIB → WIB)
      const targetId = hasNewWorkItem ? data.newWorkItemId! : data.newHouseholdItemId!;

      if (currentParentType === 'work_item') {
        // WIB → HIB move
        // Validate target household item exists
        const hi = db.select().from(householdItems).where(eq(householdItems.id, targetId)).get();
        if (!hi) {
          throw new NotFoundError('Household item not found');
        }

        // Check BUDGET_LINE_ALREADY_LINKED guard for destination type
        const existingLink = db
          .select({ id: invoiceBudgetLines.id })
          .from(invoiceBudgetLines)
          .innerJoin(
            householdItemBudgets,
            eq(householdItemBudgets.id, invoiceBudgetLines.householdItemBudgetId),
          )
          .where(
            sql`${invoiceBudgetLines.invoiceId} = ${invoiceId} AND ${householdItemBudgets.householdItemId} = ${targetId}`,
          )
          .get();

        if (existingLink) {
          throw new BudgetLineAlreadyLinkedError(
            'Target household item already has a linked budget line for this invoice',
          );
        }

        // Read the full current budget-line row (WIB)
        const wib = db
          .select()
          .from(workItemBudgets)
          .where(eq(workItemBudgets.id, ibl.workItemBudgetId!))
          .get();

        if (!wib) {
          throw new NotFoundError('Work item budget line not found');
        }

        // Determine budgetCategoryId: use form value if provided, else existing WIB's value or fallback
        const finalCategoryId =
          data.budgetCategoryId !== undefined
            ? data.budgetCategoryId
            : wib.budgetCategoryId || 'bc-household-items';

        // Insert new HIB row
        const newHibId = 'hib-' + randomUUID();
        const newHibDescription = 'description' in data ? data.description : wib.description;
        const newHibPlannedAmount =
          'plannedAmount' in data ? data.plannedAmount : wib.plannedAmount;
        const newHibConfidence = 'confidence' in data ? data.confidence : wib.confidence;
        const newHibBudgetSourceId =
          'budgetSourceId' in data ? data.budgetSourceId : wib.budgetSourceId;
        const newHibVendorId = 'vendorId' in data ? data.vendorId : wib.vendorId;
        const newHibQuantity = 'quantity' in data ? data.quantity : wib.quantity;
        const newHibUnit = 'unit' in data ? data.unit : wib.unit;
        const newHibUnitPrice = 'unitPrice' in data ? data.unitPrice : wib.unitPrice;
        const newHibIncludesVat = 'includesVat' in data ? data.includesVat : wib.includesVat;

        db.insert(householdItemBudgets)
          .values({
            id: newHibId,
            householdItemId: targetId,
            description: newHibDescription,
            plannedAmount: newHibPlannedAmount,
            confidence: newHibConfidence,
            budgetCategoryId: finalCategoryId,
            budgetSourceId: newHibBudgetSourceId,
            vendorId: newHibVendorId,
            quantity: newHibQuantity,
            unit: newHibUnit,
            unitPrice: newHibUnitPrice,
            includesVat: newHibIncludesVat,
            createdBy: wib.createdBy,
            createdAt: wib.createdAt,
            updatedAt: now,
            origin: wib.origin,
          })
          .run();

        // Update IBL: repoint to new HIB
        db.update(invoiceBudgetLines)
          .set({
            workItemBudgetId: null,
            householdItemBudgetId: newHibId,
            itemizedAmount: data.itemizedAmount ?? ibl.itemizedAmount,
            updatedAt: now,
          })
          .where(eq(invoiceBudgetLines.id, lineId))
          .run();

        // Delete old WIB row
        db.delete(workItemBudgets).where(eq(workItemBudgets.id, ibl.workItemBudgetId!)).run();
      } else {
        // HIB → WIB move
        // Validate target work item exists
        const wi = db.select().from(workItems).where(eq(workItems.id, targetId)).get();
        if (!wi) {
          throw new NotFoundError('Work item not found');
        }

        // Check BUDGET_LINE_ALREADY_LINKED guard for destination type
        const existingLink = db
          .select({ id: invoiceBudgetLines.id })
          .from(invoiceBudgetLines)
          .innerJoin(workItemBudgets, eq(workItemBudgets.id, invoiceBudgetLines.workItemBudgetId))
          .where(
            sql`${invoiceBudgetLines.invoiceId} = ${invoiceId} AND ${workItemBudgets.workItemId} = ${targetId}`,
          )
          .get();

        if (existingLink) {
          throw new BudgetLineAlreadyLinkedError(
            'Target work item already has a linked budget line for this invoice',
          );
        }

        // Read the full current budget-line row (HIB)
        const hib = db
          .select()
          .from(householdItemBudgets)
          .where(eq(householdItemBudgets.id, ibl.householdItemBudgetId!))
          .get();

        if (!hib) {
          throw new NotFoundError('Household item budget line not found');
        }

        // Determine budgetCategoryId: use form value if provided, else existing HIB's value
        const finalCategoryId =
          data.budgetCategoryId !== undefined ? data.budgetCategoryId : hib.budgetCategoryId;

        // Insert new WIB row
        const newWibId = 'wib-' + randomUUID();
        const newWibDescription = 'description' in data ? data.description : hib.description;
        const newWibPlannedAmount =
          'plannedAmount' in data ? data.plannedAmount : hib.plannedAmount;
        const newWibConfidence = 'confidence' in data ? data.confidence : hib.confidence;
        const newWibBudgetSourceId =
          'budgetSourceId' in data ? data.budgetSourceId : hib.budgetSourceId;
        const newWibVendorId = 'vendorId' in data ? data.vendorId : hib.vendorId;
        const newWibQuantity = 'quantity' in data ? data.quantity : hib.quantity;
        const newWibUnit = 'unit' in data ? data.unit : hib.unit;
        const newWibUnitPrice = 'unitPrice' in data ? data.unitPrice : hib.unitPrice;
        const newWibIncludesVat = 'includesVat' in data ? data.includesVat : hib.includesVat;

        db.insert(workItemBudgets)
          .values({
            id: newWibId,
            workItemId: targetId,
            description: newWibDescription,
            plannedAmount: newWibPlannedAmount,
            confidence: newWibConfidence,
            budgetCategoryId: finalCategoryId,
            budgetSourceId: newWibBudgetSourceId,
            vendorId: newWibVendorId,
            quantity: newWibQuantity,
            unit: newWibUnit,
            unitPrice: newWibUnitPrice,
            includesVat: newWibIncludesVat,
            createdBy: hib.createdBy,
            createdAt: hib.createdAt,
            updatedAt: now,
            origin: hib.origin,
          })
          .run();

        // Update IBL: repoint to new WIB
        db.update(invoiceBudgetLines)
          .set({
            workItemBudgetId: newWibId,
            householdItemBudgetId: null,
            itemizedAmount: data.itemizedAmount ?? ibl.itemizedAmount,
            updatedAt: now,
          })
          .where(eq(invoiceBudgetLines.id, lineId))
          .run();

        // Delete old HIB row
        db.delete(householdItemBudgets)
          .where(eq(householdItemBudgets.id, ibl.householdItemBudgetId!))
          .run();
      }

      return lineId;
    }
  });

  // Step 9: Fetch fresh IBL detail
  const updated = db
    .select()
    .from(invoiceBudgetLines)
    .where(eq(invoiceBudgetLines.id, result))
    .get()!;
  const areaMap = loadAreaMap(db);
  const budgetLine = resolveDetail(db, updated, areaMap);

  // Step 10: Calculate remaining amount
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
