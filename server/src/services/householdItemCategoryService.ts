import { randomUUID } from 'node:crypto';
import { eq, asc, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { householdItemCategories, householdItems } from '../db/schema.js';
import type {
  HouseholdItemCategoryEntity,
  CreateHouseholdItemCategoryRequest,
  UpdateHouseholdItemCategoryRequest,
} from '@cornerstone/shared';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  CategoryInUseError,
} from '../errors/AppError.js';
import { assertSameIdSet, nextSortOrder } from './referenceListOrder.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Convert database household item category row to HouseholdItemCategoryEntity shape.
 */
function toHouseholdItemCategory(
  row: typeof householdItemCategories.$inferSelect,
): HouseholdItemCategoryEntity {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    translationKey: row.translationKey ?? null,
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
 * List all household item categories, sorted by sort_order ascending.
 */
export function listHouseholdItemCategories(db: DbType): HouseholdItemCategoryEntity[] {
  const rows = db
    .select()
    .from(householdItemCategories)
    .orderBy(asc(householdItemCategories.sortOrder), asc(householdItemCategories.name))
    .all();
  return rows.map(toHouseholdItemCategory);
}

/**
 * Get a single household item category by ID.
 * @throws NotFoundError if category does not exist
 */
export function getHouseholdItemCategoryById(db: DbType, id: string): HouseholdItemCategoryEntity {
  const row = db
    .select()
    .from(householdItemCategories)
    .where(eq(householdItemCategories.id, id))
    .get();
  if (!row) {
    throw new NotFoundError('Household item category not found');
  }
  return toHouseholdItemCategory(row);
}

/**
 * Create a new household item category.
 * @throws ValidationError if name is invalid or color format invalid
 * @throws ConflictError if a category with the same name already exists (case-insensitive)
 */
export function createHouseholdItemCategory(
  db: DbType,
  data: CreateHouseholdItemCategoryRequest,
): HouseholdItemCategoryEntity {
  // Validate name
  const trimmedName = data.name.trim();
  if (trimmedName.length === 0 || trimmedName.length > 100) {
    throw new ValidationError('Category name must be between 1 and 100 characters');
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
    .from(householdItemCategories)
    .where(sql`LOWER(${householdItemCategories.name}) = LOWER(${trimmedName})`)
    .get();

  if (existing) {
    throw new ConflictError('A household item category with this name already exists');
  }

  const sortOrder =
    data.sortOrder ??
    nextSortOrder(
      db
        .select({ max: sql<number | null>`MAX(${householdItemCategories.sortOrder})` })
        .from(householdItemCategories)
        .get()?.max,
    );

  // Create category
  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(householdItemCategories)
    .values({
      id,
      name: trimmedName,
      color: data.color ?? null,
      translationKey: null,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return {
    id,
    name: trimmedName,
    color: data.color ?? null,
    translationKey: null,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update a household item category's name, color, and/or sort order.
 * @throws NotFoundError if category does not exist
 * @throws ValidationError if fields are invalid or no fields provided
 * @throws ConflictError if new name conflicts with existing category (case-insensitive)
 */
export function updateHouseholdItemCategory(
  db: DbType,
  id: string,
  data: UpdateHouseholdItemCategoryRequest,
): HouseholdItemCategoryEntity {
  // Check category exists
  const existing = db
    .select()
    .from(householdItemCategories)
    .where(eq(householdItemCategories.id, id))
    .get();
  if (!existing) {
    throw new NotFoundError('Household item category not found');
  }

  // Validate at least one field provided
  if (data.name === undefined && data.color === undefined && data.sortOrder === undefined) {
    throw new ValidationError('At least one field must be provided');
  }

  // Build update object
  const updates: Partial<typeof householdItemCategories.$inferInsert> = {};

  // Validate and add name if provided
  if (data.name !== undefined) {
    const trimmedName = data.name.trim();
    if (trimmedName.length === 0 || trimmedName.length > 100) {
      throw new ValidationError('Category name must be between 1 and 100 characters');
    }

    // Check for duplicate name (case-insensitive), excluding current category
    const duplicate = db
      .select()
      .from(householdItemCategories)
      .where(
        sql`LOWER(${householdItemCategories.name}) = LOWER(${trimmedName}) AND ${householdItemCategories.id} != ${id}`,
      )
      .get();

    if (duplicate) {
      throw new ConflictError('A household item category with this name already exists');
    }

    updates.name = trimmedName;
    // A typed name replaces the built-in one in every locale (#2213): drop the translation key.
    if (trimmedName !== existing.name) {
      updates.translationKey = null;
    }
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
  db.update(householdItemCategories).set(updates).where(eq(householdItemCategories.id, id)).run();

  // Fetch and return updated category
  const updated = db
    .select()
    .from(householdItemCategories)
    .where(eq(householdItemCategories.id, id))
    .get();
  return toHouseholdItemCategory(updated!);
}

/**
 * Delete a household item category.
 * Fails if the category is referenced by any household items.
 * @throws NotFoundError if category does not exist
 * @throws CategoryInUseError if category is referenced by household items
 */
export function deleteHouseholdItemCategory(db: DbType, id: string): void {
  // Check category exists
  const existing = db
    .select()
    .from(householdItemCategories)
    .where(eq(householdItemCategories.id, id))
    .get();
  if (!existing) {
    throw new NotFoundError('Household item category not found');
  }

  // Check for household item references
  const refCount = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(householdItems)
    .where(eq(householdItems.categoryId, id))
    .get();

  const count = refCount?.count ?? 0;
  if (count > 0) {
    throw new CategoryInUseError('Household item category is in use and cannot be deleted', {
      householdItemCount: count,
    });
  }

  // Delete category
  db.delete(householdItemCategories).where(eq(householdItemCategories.id, id)).run();
}

/**
 * Atomically reorder the list: `ids` must be exactly the current set of ids.
 * Writes only rows whose position changed.
 * @throws ReorderSetMismatchError if the id set differs from the current list
 */
export function reorderHouseholdItemCategories(
  db: DbType,
  ids: readonly string[],
): HouseholdItemCategoryEntity[] {
  db.transaction((tx) => {
    const rows = tx
      .select({ id: householdItemCategories.id, sortOrder: householdItemCategories.sortOrder })
      .from(householdItemCategories)
      .all();
    assertSameIdSet(
      rows.map((r) => r.id),
      ids,
    );
    const current = new Map(rows.map((r) => [r.id, r.sortOrder]));
    const now = new Date().toISOString();
    ids.forEach((id, index) => {
      if (current.get(id) === index) return;
      tx.update(householdItemCategories)
        .set({ sortOrder: index, updatedAt: now })
        .where(eq(householdItemCategories.id, id))
        .run();
    });
  });
  return listHouseholdItemCategories(db);
}
