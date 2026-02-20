import { randomUUID } from 'node:crypto';
import { eq, asc, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { budgetSources, workItems, users } from '../db/schema.js';
import type {
  BudgetSource,
  BudgetSourceType,
  BudgetSourceStatus,
  CreateBudgetSourceRequest,
  UpdateBudgetSourceRequest,
  UserSummary,
} from '@cornerstone/shared';
import { NotFoundError, ValidationError, BudgetSourceInUseError } from '../errors/AppError.js';

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
 * usedAmount is provided separately (computed from work_items once FK exists).
 */
function toBudgetSource(
  db: DbType,
  row: typeof budgetSources.$inferSelect,
  usedAmount: number,
): BudgetSource {
  const createdByUser = row.createdBy
    ? db.select().from(users).where(eq(users.id, row.createdBy)).get()
    : null;

  const availableAmount = row.totalAmount - usedAmount;

  return {
    id: row.id,
    name: row.name,
    sourceType: row.sourceType as BudgetSourceType,
    totalAmount: row.totalAmount,
    usedAmount,
    availableAmount,
    interestRate: row.interestRate,
    terms: row.terms,
    notes: row.notes,
    status: row.status as BudgetSourceStatus,
    createdBy: toUserSummary(createdByUser),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Compute the used amount for a budget source.
 * Sums actual_cost from work_items where budget_source_id matches.
 * Returns 0 if no work items reference this source.
 */
function computeUsedAmount(db: DbType, sourceId: string): number {
  const result = db
    .select({ total: sql<number>`COALESCE(SUM(${workItems.actualCost}), 0)` })
    .from(workItems)
    .where(eq(workItems.budgetSourceId, sourceId))
    .get();
  return result?.total ?? 0;
}

/**
 * Count work items referencing a budget source.
 */
function countWorkItemReferences(db: DbType, sourceId: string): number {
  const result = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(workItems)
    .where(eq(workItems.budgetSourceId, sourceId))
    .get();
  return result?.count ?? 0;
}

/**
 * List all budget sources, sorted by name ascending.
 */
export function listBudgetSources(db: DbType): BudgetSource[] {
  const rows = db.select().from(budgetSources).orderBy(asc(budgetSources.name)).all();
  return rows.map((row) => toBudgetSource(db, row, computeUsedAmount(db, row.id)));
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
  return toBudgetSource(db, row, computeUsedAmount(db, id));
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
 * @throws ValidationError if fields are invalid
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
    if (typeof data.totalAmount !== 'number' || data.totalAmount <= 0) {
      throw new ValidationError('Total amount must be a positive number');
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
 * Fails if any work items reference this source (once budget_source_id is added to work_items).
 * @throws NotFoundError if source does not exist
 * @throws BudgetSourceInUseError if referenced by work items
 */
export function deleteBudgetSource(db: DbType, id: string): void {
  // Check source exists
  const existing = db.select().from(budgetSources).where(eq(budgetSources.id, id)).get();
  if (!existing) {
    throw new NotFoundError('Budget source not found');
  }

  // Check for work item references
  const workItemCount = countWorkItemReferences(db, id);
  if (workItemCount > 0) {
    throw new BudgetSourceInUseError('Budget source is in use and cannot be deleted', {
      workItemCount,
    });
  }

  // Delete source
  db.delete(budgetSources).where(eq(budgetSources.id, id)).run();
}
