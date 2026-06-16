import { randomUUID } from 'node:crypto';
import { eq, asc, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { orientations } from '../db/schema.js';
import type {
  CreateOrientationRequest,
  UpdateOrientationRequest,
  OrientationResponse,
} from '@cornerstone/shared';
import { NotFoundError, ValidationError, ConflictError } from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Convert database orientation row to OrientationResponse shape.
 */
function toOrientationResponse(row: typeof orientations.$inferSelect): OrientationResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * List all orientations, sorted by sort_order ascending, then name ascending.
 * Optionally filter by name or description search (case-insensitive).
 */
export function listOrientations(db: DbType, search?: string): OrientationResponse[] {
  const rows = db
    .select()
    .from(orientations)
    .where(
      search
        ? sql`LOWER(${orientations.name}) LIKE LOWER(${`%${search}%`}) OR LOWER(${orientations.description}) LIKE LOWER(${`%${search}%`})`
        : undefined,
    )
    .orderBy(asc(orientations.sortOrder), asc(orientations.name))
    .all();

  return rows.map(toOrientationResponse);
}

/**
 * Get a single orientation by ID.
 * @throws NotFoundError if orientation does not exist
 */
export function getOrientationById(db: DbType, id: string): OrientationResponse {
  const row = db.select().from(orientations).where(eq(orientations.id, id)).get();
  if (!row) {
    throw new NotFoundError('Orientation not found');
  }
  return toOrientationResponse(row);
}

/**
 * Create a new orientation.
 * @throws ValidationError if name is invalid or description too long
 * @throws ConflictError if an orientation with the same name already exists (case-insensitive)
 */
export function createOrientation(db: DbType, data: CreateOrientationRequest): OrientationResponse {
  // Validate name
  const trimmedName = data.name.trim();
  if (trimmedName.length === 0 || trimmedName.length > 200) {
    throw new ValidationError('Orientation name must be between 1 and 200 characters');
  }

  // Validate description length
  if (
    data.description !== undefined &&
    data.description !== null &&
    data.description.length > 2000
  ) {
    throw new ValidationError('Orientation description must be at most 2000 characters');
  }

  // Validate sortOrder
  if (data.sortOrder !== undefined && data.sortOrder < 0) {
    throw new ValidationError('Sort order must be a non-negative integer');
  }

  // Check for duplicate name (case-insensitive)
  const existing = db
    .select()
    .from(orientations)
    .where(sql`LOWER(${orientations.name}) = LOWER(${trimmedName})`)
    .get();

  if (existing) {
    throw new ConflictError('An orientation with this name already exists');
  }

  // Create orientation
  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(orientations)
    .values({
      id,
      name: trimmedName,
      description: data.description ?? null,
      sortOrder: data.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return {
    id,
    name: trimmedName,
    description: data.description ?? null,
    sortOrder: data.sortOrder ?? 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update an orientation's name, description, and/or sort order.
 * @throws NotFoundError if orientation does not exist
 * @throws ValidationError if fields are invalid or no fields provided
 * @throws ConflictError if new name conflicts with existing orientation (case-insensitive)
 */
export function updateOrientation(
  db: DbType,
  id: string,
  data: UpdateOrientationRequest,
): OrientationResponse {
  // Check orientation exists
  const existing = db.select().from(orientations).where(eq(orientations.id, id)).get();
  if (!existing) {
    throw new NotFoundError('Orientation not found');
  }

  // Validate at least one field provided
  if (data.name === undefined && data.description === undefined && data.sortOrder === undefined) {
    throw new ValidationError('At least one field must be provided');
  }

  // Build update object
  const updates: Partial<typeof orientations.$inferInsert> = {};

  // Validate and add name if provided
  if (data.name !== undefined) {
    const trimmedName = data.name.trim();
    if (trimmedName.length === 0 || trimmedName.length > 200) {
      throw new ValidationError('Orientation name must be between 1 and 200 characters');
    }

    // Check for duplicate name (case-insensitive), excluding current orientation
    const duplicate = db
      .select()
      .from(orientations)
      .where(
        sql`LOWER(${orientations.name}) = LOWER(${trimmedName}) AND ${orientations.id} != ${id}`,
      )
      .get();

    if (duplicate) {
      throw new ConflictError('An orientation with this name already exists');
    }

    updates.name = trimmedName;
  }

  // Validate and add description if provided
  if (data.description !== undefined) {
    if (data.description !== null && data.description.length > 2000) {
      throw new ValidationError('Orientation description must be at most 2000 characters');
    }
    updates.description = data.description;
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
  db.update(orientations).set(updates).where(eq(orientations.id, id)).run();

  // Fetch and return updated orientation
  const updated = db.select().from(orientations).where(eq(orientations.id, id)).get();
  return toOrientationResponse(updated!);
}

/**
 * Delete an orientation.
 * Photos that reference this orientation will have their orientation_id set to NULL by the DB FK constraint.
 * @throws NotFoundError if orientation does not exist
 */
export function deleteOrientation(db: DbType, id: string): void {
  // Check orientation exists
  const existing = db.select().from(orientations).where(eq(orientations.id, id)).get();
  if (!existing) {
    throw new NotFoundError('Orientation not found');
  }

  // Delete orientation (DB FK ON DELETE SET NULL will null referencing photos)
  db.delete(orientations).where(eq(orientations.id, id)).run();
}
