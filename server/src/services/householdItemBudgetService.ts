import { randomUUID } from 'node:crypto';
import { eq, and, sql, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import {
  householdItems,
  householdItemBudgets,
  budgetCategories,
  budgetSources,
  vendors,
  users,
  invoices,
} from '../db/schema.js';
import type {
  HouseholdItemBudgetLine,
  BudgetCategory,
  BudgetSourceSummary,
  VendorSummary,
  UserSummary,
  ConfidenceLevel,
  CreateHouseholdItemBudgetRequest,
  UpdateHouseholdItemBudgetRequest,
} from '@cornerstone/shared';
import { CONFIDENCE_MARGINS as confidenceMargins } from '@cornerstone/shared';
import { NotFoundError, ValidationError } from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/** Valid confidence level values */
const VALID_CONFIDENCE_LEVELS: ConfidenceLevel[] = [
  'own_estimate',
  'professional_estimate',
  'quote',
  'invoice',
];

/** Maximum description length */
const MAX_DESCRIPTION_LENGTH = 500;

/**
 * Convert a database user row to UserSummary shape.
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
 * Convert a database budget category row to BudgetCategory shape.
 */
function toBudgetCategory(
  category: typeof budgetCategories.$inferSelect | null | undefined,
): BudgetCategory | null {
  if (!category) return null;
  return {
    id: category.id,
    name: category.name,
    description: category.description,
    color: category.color,
    sortOrder: category.sortOrder,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

/**
 * Convert a database budget source row to BudgetSourceSummary shape.
 */
function toBudgetSourceSummary(
  source: typeof budgetSources.$inferSelect | null | undefined,
): BudgetSourceSummary | null {
  if (!source) return null;
  return {
    id: source.id,
    name: source.name,
    sourceType: source.sourceType,
  };
}

/**
 * Convert a database vendor row to VendorSummary shape.
 */
function toVendorSummary(
  vendor: typeof vendors.$inferSelect | null | undefined,
): VendorSummary | null {
  if (!vendor) return null;
  return {
    id: vendor.id,
    name: vendor.name,
    specialty: vendor.specialty,
  };
}

/**
 * Get total actual amount from invoices linked to a household item budget line.
 */
function getActualCostForBudget(db: DbType, budgetId: string): number {
  const result = db
    .select({ total: sql<number>`COALESCE(SUM(${invoices.amount}), 0)` })
    .from(invoices)
    .where(eq(invoices.householdItemBudgetId, budgetId))
    .get();
  return result?.total ?? 0;
}

/**
 * Get total actual paid amount from invoices linked to a household item budget line
 * (invoices with status 'paid' or 'claimed').
 */
function getActualCostPaidForBudget(db: DbType, budgetId: string): number {
  const result = db
    .select({ total: sql<number>`COALESCE(SUM(${invoices.amount}), 0)` })
    .from(invoices)
    .where(
      and(
        eq(invoices.householdItemBudgetId, budgetId),
        inArray(invoices.status, ['paid', 'claimed']),
      ),
    )
    .get();
  return result?.total ?? 0;
}

/**
 * Get count of invoices linked to a household item budget line.
 */
function getInvoiceCountForBudget(db: DbType, budgetId: string): number {
  const result = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(invoices)
    .where(eq(invoices.householdItemBudgetId, budgetId))
    .get();
  return result?.count ?? 0;
}

/**
 * Convert a database household_item_budgets row to HouseholdItemBudgetLine API shape.
 * Joins all related entities (category, source, vendor, createdBy).
 * Computes actualCost, actualCostPaid, and invoiceCount from linked invoices.
 */
function toHouseholdItemBudgetLine(
  db: DbType,
  row: typeof householdItemBudgets.$inferSelect,
): HouseholdItemBudgetLine {
  const confidence = row.confidence as ConfidenceLevel;

  // Resolve related entities
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
    actualCost: getActualCostForBudget(db, row.id),
    actualCostPaid: getActualCostPaidForBudget(db, row.id),
    invoiceCount: getInvoiceCountForBudget(db, row.id),
    createdBy: toUserSummary(createdByUser),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Assert that a household item exists.
 * @throws NotFoundError if household item does not exist
 */
function assertHouseholdItemExists(db: DbType, householdItemId: string): void {
  const item = db.select().from(householdItems).where(eq(householdItems.id, householdItemId)).get();
  if (!item) {
    throw new NotFoundError('Household item not found');
  }
}

/**
 * Validate the description field.
 * @throws ValidationError if description exceeds max length
 */
function validateDescription(description: string | null | undefined): void {
  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ValidationError(`Description must not exceed ${MAX_DESCRIPTION_LENGTH} characters`);
  }
}

/**
 * Validate that a confidence level value is valid.
 * @throws ValidationError if invalid
 */
function validateConfidence(confidence: string): void {
  if (!VALID_CONFIDENCE_LEVELS.includes(confidence as ConfidenceLevel)) {
    throw new ValidationError(`confidence must be one of: ${VALID_CONFIDENCE_LEVELS.join(', ')}`);
  }
}

/**
 * Validate that a budget category ID exists.
 * @throws ValidationError if not found
 */
function validateBudgetCategoryId(db: DbType, budgetCategoryId: string): void {
  const cat = db
    .select()
    .from(budgetCategories)
    .where(eq(budgetCategories.id, budgetCategoryId))
    .get();
  if (!cat) {
    throw new ValidationError(`Budget category not found: ${budgetCategoryId}`);
  }
}

/**
 * Validate that a budget source ID exists.
 * @throws ValidationError if not found
 */
function validateBudgetSourceId(db: DbType, budgetSourceId: string): void {
  const source = db.select().from(budgetSources).where(eq(budgetSources.id, budgetSourceId)).get();
  if (!source) {
    throw new ValidationError(`Budget source not found: ${budgetSourceId}`);
  }
}

/**
 * Validate that a vendor ID exists.
 * @throws ValidationError if not found
 */
function validateVendorId(db: DbType, vendorId: string): void {
  const vendor = db.select().from(vendors).where(eq(vendors.id, vendorId)).get();
  if (!vendor) {
    throw new ValidationError(`Vendor not found: ${vendorId}`);
  }
}

/**
 * List all budget lines for a household item, ordered by creation time ascending.
 * @throws NotFoundError if household item does not exist
 */
export function listHouseholdItemBudgets(
  db: DbType,
  householdItemId: string,
): HouseholdItemBudgetLine[] {
  assertHouseholdItemExists(db, householdItemId);

  const rows = db
    .select()
    .from(householdItemBudgets)
    .where(eq(householdItemBudgets.householdItemId, householdItemId))
    .orderBy(householdItemBudgets.createdAt)
    .all();

  return rows.map((row) => toHouseholdItemBudgetLine(db, row));
}

/**
 * Create a new budget line for a household item.
 * Budget category is automatically set to 'bc-household-items'; any user-supplied budgetCategoryId is ignored.
 * @throws NotFoundError if household item does not exist
 * @throws ValidationError if any field is invalid
 */
export function createHouseholdItemBudget(
  db: DbType,
  householdItemId: string,
  userId: string,
  data: CreateHouseholdItemBudgetRequest,
): HouseholdItemBudgetLine {
  assertHouseholdItemExists(db, householdItemId);

  // Validate plannedAmount
  if (data.plannedAmount === undefined || data.plannedAmount === null) {
    throw new ValidationError('plannedAmount is required');
  }
  if (data.plannedAmount < 0) {
    throw new ValidationError('plannedAmount must be >= 0');
  }

  // Validate description
  validateDescription(data.description);

  // Validate confidence if provided
  if (data.confidence !== undefined) {
    validateConfidence(data.confidence);
  }

  // Validate FK references (budgetCategoryId is auto-assigned, so don't validate user input)
  if (data.budgetSourceId) {
    validateBudgetSourceId(db, data.budgetSourceId);
  }
  if (data.vendorId) {
    validateVendorId(db, data.vendorId);
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  // Force budgetCategoryId to 'bc-household-items'; ignore any user-supplied value
  const effectiveBudgetCategoryId = 'bc-household-items';

  db.insert(householdItemBudgets)
    .values({
      id,
      householdItemId,
      description: data.description ?? null,
      plannedAmount: data.plannedAmount,
      confidence: data.confidence ?? 'own_estimate',
      budgetCategoryId: effectiveBudgetCategoryId,
      budgetSourceId: data.budgetSourceId ?? null,
      vendorId: data.vendorId ?? null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const row = db.select().from(householdItemBudgets).where(eq(householdItemBudgets.id, id)).get()!;
  return toHouseholdItemBudgetLine(db, row);
}

/**
 * Update a budget line.
 * All fields are optional; only provided fields are updated.
 * Budget category is always 'bc-household-items'; any user-supplied budgetCategoryId is ignored.
 * @throws NotFoundError if household item or budget line does not exist, or if budget line
 *   does not belong to the given household item
 * @throws ValidationError if any provided field is invalid
 */
export function updateHouseholdItemBudget(
  db: DbType,
  householdItemId: string,
  budgetId: string,
  data: UpdateHouseholdItemBudgetRequest,
): HouseholdItemBudgetLine {
  assertHouseholdItemExists(db, householdItemId);

  // Fetch the budget line and verify ownership
  const existing = db
    .select()
    .from(householdItemBudgets)
    .where(
      and(
        eq(householdItemBudgets.id, budgetId),
        eq(householdItemBudgets.householdItemId, householdItemId),
      ),
    )
    .get();

  if (!existing) {
    throw new NotFoundError('Budget line not found');
  }

  const updates: Partial<typeof householdItemBudgets.$inferInsert> = {};

  // description (nullable — null clears it)
  if ('description' in data) {
    validateDescription(data.description);
    updates.description = data.description ?? null;
  }

  // plannedAmount
  if ('plannedAmount' in data) {
    if (data.plannedAmount === undefined || data.plannedAmount === null) {
      throw new ValidationError('plannedAmount cannot be null');
    }
    if (data.plannedAmount < 0) {
      throw new ValidationError('plannedAmount must be >= 0');
    }
    updates.plannedAmount = data.plannedAmount;
  }

  // confidence
  if ('confidence' in data) {
    if (data.confidence === undefined) {
      throw new ValidationError('confidence cannot be undefined if key is provided');
    }
    validateConfidence(data.confidence);
    updates.confidence = data.confidence;
  }

  // budgetCategoryId is always 'bc-household-items'; ignore any user-supplied value
  // (no update to budgetCategoryId is applied)

  // budgetSourceId (nullable — null clears it)
  if ('budgetSourceId' in data) {
    if (data.budgetSourceId) {
      validateBudgetSourceId(db, data.budgetSourceId);
    }
    updates.budgetSourceId = data.budgetSourceId ?? null;
  }

  // vendorId (nullable — null clears it)
  if ('vendorId' in data) {
    if (data.vendorId) {
      validateVendorId(db, data.vendorId);
    }
    updates.vendorId = data.vendorId ?? null;
  }

  updates.updatedAt = new Date().toISOString();

  db.update(householdItemBudgets).set(updates).where(eq(householdItemBudgets.id, budgetId)).run();

  const updated = db
    .select()
    .from(householdItemBudgets)
    .where(eq(householdItemBudgets.id, budgetId))
    .get()!;
  return toHouseholdItemBudgetLine(db, updated);
}

/**
 * Delete a budget line.
 * @throws NotFoundError if household item or budget line does not exist, or if budget line
 *   does not belong to the given household item
 */
export function deleteHouseholdItemBudget(
  db: DbType,
  householdItemId: string,
  budgetId: string,
): void {
  assertHouseholdItemExists(db, householdItemId);

  // Fetch and verify ownership
  const existing = db
    .select()
    .from(householdItemBudgets)
    .where(
      and(
        eq(householdItemBudgets.id, budgetId),
        eq(householdItemBudgets.householdItemId, householdItemId),
      ),
    )
    .get();

  if (!existing) {
    throw new NotFoundError('Budget line not found');
  }

  db.delete(householdItemBudgets).where(eq(householdItemBudgets.id, budgetId)).run();
}
