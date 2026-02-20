import { randomUUID } from 'node:crypto';
import { eq, asc, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { budgetCategories, subsidyProgramCategories } from '../db/schema.js';
import type {
  BudgetCategory,
  CreateBudgetCategoryRequest,
  UpdateBudgetCategoryRequest,
} from '@cornerstone/shared';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  CategoryInUseError,
} from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Convert database budget category row to BudgetCategory shape.
 */
function toBudgetCategory(row: typeof budgetCategories.$inferSelect): BudgetCategory {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Validate hex color format (#RRGGBB).
 */
function isValidHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

/**
 * List all budget categories, sorted by sort_order ascending.
 */
export function listBudgetCategories(db: DbType): BudgetCategory[] {
  const rows = db.select().from(budgetCategories).orderBy(asc(budgetCategories.sortOrder)).all();
  return rows.map(toBudgetCategory);
}

/**
 * Get a single budget category by ID.
 * @throws NotFoundError if category does not exist
 */
export function getBudgetCategoryById(db: DbType, id: string): BudgetCategory {
  const row = db.select().from(budgetCategories).where(eq(budgetCategories.id, id)).get();
  if (!row) {
    throw new NotFoundError('Budget category not found');
  }
  return toBudgetCategory(row);
}

/**
 * Create a new budget category.
 * @throws ValidationError if name is invalid, description too long, or color format invalid
 * @throws ConflictError if a category with the same name already exists (case-insensitive)
 */
export function createBudgetCategory(
  db: DbType,
  data: CreateBudgetCategoryRequest,
): BudgetCategory {
  // Validate name
  const trimmedName = data.name.trim();
  if (trimmedName.length === 0 || trimmedName.length > 100) {
    throw new ValidationError('Budget category name must be between 1 and 100 characters');
  }

  // Validate description length
  if (
    data.description !== undefined &&
    data.description !== null &&
    data.description.length > 500
  ) {
    throw new ValidationError('Budget category description must be at most 500 characters');
  }

  // Validate color format
  if (data.color !== undefined && data.color !== null && !isValidHexColor(data.color)) {
    throw new ValidationError('Color must be a hex color code in format #RRGGBB');
  }

  // Validate sortOrder
  if (data.sortOrder !== undefined && data.sortOrder < 0) {
    throw new ValidationError('Sort order must be a non-negative integer');
  }

  // Check for duplicate name (case-insensitive)
  const existing = db
    .select()
    .from(budgetCategories)
    .where(sql`LOWER(${budgetCategories.name}) = LOWER(${trimmedName})`)
    .get();

  if (existing) {
    throw new ConflictError('A budget category with this name already exists');
  }

  // Create category
  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(budgetCategories)
    .values({
      id,
      name: trimmedName,
      description: data.description ?? null,
      color: data.color ?? null,
      sortOrder: data.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return {
    id,
    name: trimmedName,
    description: data.description ?? null,
    color: data.color ?? null,
    sortOrder: data.sortOrder ?? 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update a budget category's name, description, color, and/or sort order.
 * @throws NotFoundError if category does not exist
 * @throws ValidationError if fields are invalid or no fields provided
 * @throws ConflictError if new name conflicts with existing category (case-insensitive)
 */
export function updateBudgetCategory(
  db: DbType,
  id: string,
  data: UpdateBudgetCategoryRequest,
): BudgetCategory {
  // Check category exists
  const existing = db.select().from(budgetCategories).where(eq(budgetCategories.id, id)).get();
  if (!existing) {
    throw new NotFoundError('Budget category not found');
  }

  // Validate at least one field provided
  if (
    data.name === undefined &&
    data.description === undefined &&
    data.color === undefined &&
    data.sortOrder === undefined
  ) {
    throw new ValidationError('At least one field must be provided');
  }

  // Build update object
  const updates: Partial<typeof budgetCategories.$inferInsert> = {};

  // Validate and add name if provided
  if (data.name !== undefined) {
    const trimmedName = data.name.trim();
    if (trimmedName.length === 0 || trimmedName.length > 100) {
      throw new ValidationError('Budget category name must be between 1 and 100 characters');
    }

    // Check for duplicate name (case-insensitive), excluding current category
    const duplicate = db
      .select()
      .from(budgetCategories)
      .where(
        sql`LOWER(${budgetCategories.name}) = LOWER(${trimmedName}) AND ${budgetCategories.id} != ${id}`,
      )
      .get();

    if (duplicate) {
      throw new ConflictError('A budget category with this name already exists');
    }

    updates.name = trimmedName;
  }

  // Validate and add description if provided
  if (data.description !== undefined) {
    if (data.description !== null && data.description.length > 500) {
      throw new ValidationError('Budget category description must be at most 500 characters');
    }
    updates.description = data.description;
  }

  // Validate and add color if provided
  if (data.color !== undefined) {
    if (data.color !== null && !isValidHexColor(data.color)) {
      throw new ValidationError('Color must be a hex color code in format #RRGGBB');
    }
    updates.color = data.color;
  }

  // Validate and add sortOrder if provided
  if (data.sortOrder !== undefined) {
    if (data.sortOrder < 0) {
      throw new ValidationError('Sort order must be a non-negative integer');
    }
    updates.sortOrder = data.sortOrder;
  }

  // Set updated timestamp
  const now = new Date().toISOString();
  updates.updatedAt = now;

  // Perform update
  db.update(budgetCategories).set(updates).where(eq(budgetCategories.id, id)).run();

  // Fetch and return updated category
  const updated = db.select().from(budgetCategories).where(eq(budgetCategories.id, id)).get();
  return toBudgetCategory(updated!);
}

/**
 * Delete a budget category.
 * Fails if the category is referenced by any subsidy programs.
 * (Work item references will be checked here once the budget_category_id FK is added to work_items.)
 * @throws NotFoundError if category does not exist
 * @throws CategoryInUseError if category is referenced by subsidy programs or work items
 */
export function deleteBudgetCategory(db: DbType, id: string): void {
  // Check category exists
  const existing = db.select().from(budgetCategories).where(eq(budgetCategories.id, id)).get();
  if (!existing) {
    throw new NotFoundError('Budget category not found');
  }

  // Check for subsidy program references
  const subsidyRefs = db
    .select()
    .from(subsidyProgramCategories)
    .where(eq(subsidyProgramCategories.budgetCategoryId, id))
    .all();

  // Work item references will be added when budget_category_id FK is added to work_items (later story)
  const workItemCount = 0;

  if (subsidyRefs.length > 0 || workItemCount > 0) {
    throw new CategoryInUseError('Budget category is in use and cannot be deleted', {
      subsidyProgramCount: subsidyRefs.length,
      workItemCount,
    });
  }

  // Delete category
  db.delete(budgetCategories).where(eq(budgetCategories.id, id)).run();
}
