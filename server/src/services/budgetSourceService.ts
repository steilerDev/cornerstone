import { randomUUID } from 'node:crypto';
import { eq, asc, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import {
  budgetSources,
  workItemBudgets,
  householdItemBudgets,
  invoiceBudgetLines,
  invoices,
  users,
} from '../db/schema.js';
import type {
  BudgetSource,
  BudgetSourceType,
  BudgetSourceStatus,
  CreateBudgetSourceRequest,
  UpdateBudgetSourceRequest,
  UserSummary,
} from '@cornerstone/shared';
import { CONFIDENCE_MARGINS } from '@cornerstone/shared';
import {
  NotFoundError,
  ValidationError,
  BudgetSourceInUseError,
  DiscretionarySourceError,
} from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

const VALID_SOURCE_TYPES: BudgetSourceType[] = ['bank_loan', 'credit_line', 'savings', 'other'];
const VALID_STATUSES: BudgetSourceStatus[] = ['active', 'exhausted', 'closed'];

/**
 * Convert database user row to UserSummary shape.
 */
function toUserSummary(user: typeof users.$inferSelect | null | undefined): UserSummary | null {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
  };
}

/**
 * Convert database budget source row to BudgetSource API shape.
 * usedAmount, claimedAmount, unclaimedAmount, and projectedAmount are provided separately (computed from linked budget lines/invoices).
 */
function toBudgetSource(
  db: DbType,
  row: typeof budgetSources.$inferSelect,
  usedAmount: number,
  claimedAmount: number,
  unclaimedAmount: number,
  projectedAmount: number,
): BudgetSource {
  const createdByUser = row.createdBy
    ? db.select().from(users).where(eq(users.id, row.createdBy)).get()
    : null;

  const availableAmount = row.totalAmount - usedAmount;
  const actualAvailableAmount = row.totalAmount - claimedAmount;
  const paidAmount = claimedAmount + unclaimedAmount;

  return {
    id: row.id,
    name: row.name,
    sourceType: row.sourceType as BudgetSourceType,
    totalAmount: row.totalAmount,
    usedAmount,
    availableAmount,
    claimedAmount,
    unclaimedAmount,
    paidAmount,
    actualAvailableAmount,
    projectedAmount,
    interestRate: row.interestRate,
    terms: row.terms,
    notes: row.notes,
    status: row.status as BudgetSourceStatus,
    isDiscretionary: row.isDiscretionary,
    createdBy: toUserSummary(createdByUser),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Compute the used amount for a budget source.
 * Sums planned_amount from both work_item_budgets and household_item_budgets where budget_source_id matches.
 * Returns 0 if no budget lines reference this source.
 */
function computeUsedAmount(db: DbType, sourceId: string): number {
  const result = db.get<{ total: number }>(
    sql`SELECT COALESCE(SUM(planned_amount), 0) AS total
    FROM (
      SELECT planned_amount FROM ${workItemBudgets} WHERE budget_source_id = ${sourceId}
      UNION ALL
      SELECT planned_amount FROM ${householdItemBudgets} WHERE budget_source_id = ${sourceId}
    )`,
  );
  return result?.total ?? 0;
}

/**
 * Compute the claimed amount for a budget source.
 * Sums invoice amounts where status = 'claimed' and the invoice's budget line
 * references this source (either work item OR household item budget). Returns 0 if no claimed invoices exist.
 */
function computeClaimedAmount(db: DbType, sourceId: string): number {
  // EPIC-15: Join through invoiceBudgetLines junction table; fixed in EPIC-16 to include household items
  const result = db.get<{ total: number }>(
    sql`SELECT COALESCE(SUM(ibl.itemized_amount), 0) AS total
    FROM invoice_budget_lines ibl
    INNER JOIN invoices i ON i.id = ibl.invoice_id
    WHERE i.status = 'claimed'
      AND (
        (ibl.work_item_budget_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM work_item_budgets wib
          WHERE wib.id = ibl.work_item_budget_id AND wib.budget_source_id = ${sourceId}
        ))
        OR
        (ibl.household_item_budget_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM household_item_budgets hib
          WHERE hib.id = ibl.household_item_budget_id AND hib.budget_source_id = ${sourceId}
        ))
      )`,
  );
  return result?.total ?? 0;
}

/**
 * Compute the unclaimed (paid but not claimed) amount for a budget source.
 * Sums invoice amounts where status = 'paid' and the invoice's budget line
 * references this source (either work item OR household item budget). Returns 0 if no paid invoices exist.
 */
function computeUnclaimedAmount(db: DbType, sourceId: string): number {
  // EPIC-15: Join through invoiceBudgetLines junction table; fixed in EPIC-16 to include household items
  const result = db.get<{ total: number }>(
    sql`SELECT COALESCE(SUM(ibl.itemized_amount), 0) AS total
    FROM invoice_budget_lines ibl
    INNER JOIN invoices i ON i.id = ibl.invoice_id
    WHERE i.status = 'paid'
      AND (
        (ibl.work_item_budget_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM work_item_budgets wib
          WHERE wib.id = ibl.work_item_budget_id AND wib.budget_source_id = ${sourceId}
        ))
        OR
        (ibl.household_item_budget_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM household_item_budgets hib
          WHERE hib.id = ibl.household_item_budget_id AND hib.budget_source_id = ${sourceId}
        ))
      )`,
  );
  return result?.total ?? 0;
}

/**
 * Count budget lines referencing a budget source.
 * Counts both work_item_budgets and household_item_budgets rows.
 */
function countBudgetLineReferences(db: DbType, sourceId: string): number {
  const result = db.get<{ count: number }>(
    sql`SELECT COUNT(*) AS count
    FROM (
      SELECT id FROM ${workItemBudgets} WHERE budget_source_id = ${sourceId}
      UNION ALL
      SELECT id FROM ${householdItemBudgets} WHERE budget_source_id = ${sourceId}
    )`,
  );
  return result?.count ?? 0;
}

/**
 * Compute the discretionary invoice amount for a given status.
 * Includes:
 * 1. Unallocated remainder: invoice.amount - SUM(itemized_amount) for invoices with this status
 * 2. Lines with no budget_source: amount allocated to budget lines where source is NULL
 */
function computeDiscretionaryInvoiceAmount(db: DbType, status: string): number {
  // 1. Unallocated remainder: invoice.amount - SUM(itemized_amount) for invoices with this status
  const remainderResult = db.get<{ total: number }>(
    sql`SELECT COALESCE(SUM(remainder), 0) AS total
    FROM (
      SELECT i.amount - COALESCE(SUM(ibl.itemized_amount), 0) AS remainder
      FROM invoices i
      LEFT JOIN invoice_budget_lines ibl ON ibl.invoice_id = i.id
      WHERE i.status = ${status}
      GROUP BY i.id
    )
    WHERE remainder > 0`,
  );

  // 2. Lines with no budget_source: amount allocated to budget lines where source is NULL
  const noSourceResult = db.get<{ total: number }>(
    sql`SELECT COALESCE(SUM(ibl.itemized_amount), 0) AS total
    FROM invoice_budget_lines ibl
    INNER JOIN invoices i ON i.id = ibl.invoice_id
    WHERE i.status = ${status}
      AND (
        (ibl.work_item_budget_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM work_item_budgets wib
          WHERE wib.id = ibl.work_item_budget_id AND wib.budget_source_id IS NULL
        ))
        OR
        (ibl.household_item_budget_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM household_item_budgets hib
          WHERE hib.id = ibl.household_item_budget_id AND hib.budget_source_id IS NULL
        ))
      )`,
  );

  return (remainderResult?.total ?? 0) + (noSourceResult?.total ?? 0);
}

/**
 * Compute the projected amount for a budget source.
 * For non-invoiced lines: planned_amount * (1 + confidence_margin)
 * For invoiced lines: actual cost (sum of itemized amounts)
 */
function computeProjectedAmount(db: DbType, sourceId: string): number {
  const lines = db.all<{
    id: string;
    plannedAmount: number;
    confidence: string;
  }>(
    sql`SELECT id, planned_amount AS plannedAmount, confidence
    FROM work_item_budgets WHERE budget_source_id = ${sourceId}
    UNION ALL
    SELECT id, planned_amount AS plannedAmount, confidence
    FROM household_item_budgets WHERE budget_source_id = ${sourceId}`,
  );

  if (lines.length === 0) return 0;

  let total = 0;
  for (const line of lines) {
    // Check if this line has any invoice allocations
    const inv = db.get<{ total: number }>(
      sql`SELECT COALESCE(SUM(ibl.itemized_amount), 0) AS total
      FROM invoice_budget_lines ibl
      WHERE ibl.work_item_budget_id = ${line.id}
         OR ibl.household_item_budget_id = ${line.id}`,
    );
    const actualCost = inv?.total ?? 0;
    if (actualCost > 0) {
      total += actualCost;
    } else {
      const margin = CONFIDENCE_MARGINS[line.confidence as keyof typeof CONFIDENCE_MARGINS] ?? 0;
      total += line.plannedAmount * (1 + margin);
    }
  }
  return total;
}

/**
 * Get all computed amounts for a budget source in one operation.
 * Handles both regular and discretionary sources differently.
 */
function getSourceAmounts(
  db: DbType,
  row: typeof budgetSources.$inferSelect,
): { usedAmount: number; claimedAmount: number; unclaimedAmount: number; projectedAmount: number } {
  const usedAmount = computeUsedAmount(db, row.id);
  const projectedAmount = computeProjectedAmount(db, row.id);

  if (row.isDiscretionary) {
    const claimedAmount = computeDiscretionaryInvoiceAmount(db, 'claimed');
    const unclaimedAmount = computeDiscretionaryInvoiceAmount(db, 'paid');
    return { usedAmount, claimedAmount, unclaimedAmount, projectedAmount };
  }

  return {
    usedAmount,
    claimedAmount: computeClaimedAmount(db, row.id),
    unclaimedAmount: computeUnclaimedAmount(db, row.id),
    projectedAmount,
  };
}

/**
 * List all budget sources, sorted by isDiscretionary (false first), then by name ascending.
 * Ensures the Discretionary Funding source appears last in the list.
 */
export function listBudgetSources(db: DbType): BudgetSource[] {
  const rows = db
    .select()
    .from(budgetSources)
    .orderBy(asc(budgetSources.isDiscretionary), asc(budgetSources.name))
    .all();

  return rows.map((row) => {
    const amounts = getSourceAmounts(db, row);
    return toBudgetSource(
      db,
      row,
      amounts.usedAmount,
      amounts.claimedAmount,
      amounts.unclaimedAmount,
      amounts.projectedAmount,
    );
  });
}

/**
 * Get a single budget source by ID.
 * @throws NotFoundError if source does not exist
 */
export function getBudgetSourceById(db: DbType, id: string): BudgetSource {
  const row = db.select().from(budgetSources).where(eq(budgetSources.id, id)).get();
  if (!row) {
    throw new NotFoundError('Budget source not found');
  }

  const amounts = getSourceAmounts(db, row);
  return toBudgetSource(
    db,
    row,
    amounts.usedAmount,
    amounts.claimedAmount,
    amounts.unclaimedAmount,
    amounts.projectedAmount,
  );
}

/**
 * Create a new budget source.
 * @throws ValidationError if required fields are missing or invalid
 */
export function createBudgetSource(
  db: DbType,
  data: CreateBudgetSourceRequest,
  userId: string,
): BudgetSource {
  // Validate name
  const trimmedName = data.name.trim();
  if (trimmedName.length === 0 || trimmedName.length > 200) {
    throw new ValidationError('Budget source name must be between 1 and 200 characters');
  }

  // Validate sourceType
  if (!VALID_SOURCE_TYPES.includes(data.sourceType)) {
    throw new ValidationError(
      `Invalid source type. Must be one of: ${VALID_SOURCE_TYPES.join(', ')}`,
    );
  }

  // Validate totalAmount
  if (typeof data.totalAmount !== 'number' || data.totalAmount <= 0) {
    throw new ValidationError('Total amount must be a positive number');
  }

  // Validate interestRate if provided
  if (data.interestRate !== undefined && data.interestRate !== null) {
    if (data.interestRate < 0 || data.interestRate > 100) {
      throw new ValidationError('Interest rate must be between 0 and 100');
    }
  }

  // Validate status if provided
  if (data.status !== undefined && !VALID_STATUSES.includes(data.status)) {
    throw new ValidationError(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const status = data.status ?? 'active';

  db.insert(budgetSources)
    .values({
      id,
      name: trimmedName,
      sourceType: data.sourceType,
      totalAmount: data.totalAmount,
      interestRate: data.interestRate ?? null,
      terms: data.terms ?? null,
      notes: data.notes ?? null,
      status,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return getBudgetSourceById(db, id);
}

/**
 * Update a budget source's fields.
 * @throws NotFoundError if source does not exist
 * @throws ValidationError if fields are invalid or discretionary source constraints violated
 */
export function updateBudgetSource(
  db: DbType,
  id: string,
  data: UpdateBudgetSourceRequest,
): BudgetSource {
  // Check source exists
  const existing = db.select().from(budgetSources).where(eq(budgetSources.id, id)).get();
  if (!existing) {
    throw new NotFoundError('Budget source not found');
  }

  // Validate at least one field provided
  if (
    data.name === undefined &&
    data.sourceType === undefined &&
    data.totalAmount === undefined &&
    data.interestRate === undefined &&
    data.terms === undefined &&
    data.notes === undefined &&
    data.status === undefined
  ) {
    throw new ValidationError('At least one field must be provided');
  }

  // Check discretionary source constraints
  if (existing.isDiscretionary && data.sourceType !== undefined) {
    throw new ValidationError('Cannot change the source type of the Discretionary Funding source');
  }

  const updates: Partial<typeof budgetSources.$inferInsert> = {};

  // Validate and add name if provided
  if (data.name !== undefined) {
    const trimmedName = data.name.trim();
    if (trimmedName.length === 0 || trimmedName.length > 200) {
      throw new ValidationError('Budget source name must be between 1 and 200 characters');
    }
    updates.name = trimmedName;
  }

  // Validate and add sourceType if provided
  if (data.sourceType !== undefined) {
    if (!VALID_SOURCE_TYPES.includes(data.sourceType)) {
      throw new ValidationError(
        `Invalid source type. Must be one of: ${VALID_SOURCE_TYPES.join(', ')}`,
      );
    }
    updates.sourceType = data.sourceType;
  }

  // Validate and add totalAmount if provided
  if (data.totalAmount !== undefined) {
    // Discretionary source: allow 0, others must be > 0
    const minValue = existing.isDiscretionary ? 0 : 0.01;
    if (typeof data.totalAmount !== 'number' || data.totalAmount < minValue) {
      const msg = existing.isDiscretionary
        ? 'Total amount must be a non-negative number'
        : 'Total amount must be a positive number';
      throw new ValidationError(msg);
    }
    updates.totalAmount = data.totalAmount;
  }

  // Validate and add interestRate if provided
  if (data.interestRate !== undefined) {
    if (data.interestRate !== null && (data.interestRate < 0 || data.interestRate > 100)) {
      throw new ValidationError('Interest rate must be between 0 and 100');
    }
    updates.interestRate = data.interestRate;
  }

  // Add terms if provided
  if (data.terms !== undefined) {
    updates.terms = data.terms;
  }

  // Add notes if provided
  if (data.notes !== undefined) {
    updates.notes = data.notes;
  }

  // Validate and add status if provided
  if (data.status !== undefined) {
    if (!VALID_STATUSES.includes(data.status)) {
      throw new ValidationError(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
    }
    updates.status = data.status;
  }

  // Set updated timestamp
  const now = new Date().toISOString();
  updates.updatedAt = now;

  // Perform update
  db.update(budgetSources).set(updates).where(eq(budgetSources.id, id)).run();

  return getBudgetSourceById(db, id);
}

/**
 * Delete a budget source.
 * Fails if any work item or household item budget lines reference this source.
 * Fails if the source is the system Discretionary Funding source.
 * @throws NotFoundError if source does not exist
 * @throws DiscretionarySourceError if attempting to delete the Discretionary Funding source
 * @throws BudgetSourceInUseError if referenced by work items
 */
export function deleteBudgetSource(db: DbType, id: string): void {
  // Check source exists
  const existing = db.select().from(budgetSources).where(eq(budgetSources.id, id)).get();
  if (!existing) {
    throw new NotFoundError('Budget source not found');
  }

  // Check if this is the Discretionary Funding source
  if (existing.isDiscretionary) {
    throw new DiscretionarySourceError();
  }

  // Check for budget line references
  const budgetLineCount = countBudgetLineReferences(db, id);
  if (budgetLineCount > 0) {
    throw new BudgetSourceInUseError('Budget source is in use and cannot be deleted', {
      budgetLineCount,
    });
  }

  // Delete source
  db.delete(budgetSources).where(eq(budgetSources.id, id)).run();
}
