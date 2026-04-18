import { randomUUID } from 'node:crypto';
import { eq, asc, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { areas, workItems, householdItems } from '../db/schema.js';
import type {
  CreateAreaRequest,
  UpdateAreaRequest,
  AreaResponse,
  AreaAncestor,
} from '@cornerstone/shared';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  AreaInUseError,
} from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Convert database area row to AreaResponse shape.
 */
function toAreaResponse(row: typeof areas.$inferSelect): AreaResponse {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    color: row.color,
    description: row.description,
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
 * Collect all descendant IDs of an area using breadth-first search.
 * Includes the area itself.
 */
export function getDescendantIds(db: DbType, areaId: string): string[] {
  const result: string[] = [areaId];
  const queue: string[] = [areaId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = db
      .select({ id: areas.id })
      .from(areas)
      .where(eq(areas.parentId, current))
      .all();

    for (const child of children) {
      result.push(child.id);
      queue.push(child.id);
    }
  }

  return result;
}

/**
 * Check if setting proposedParentId as parent of areaId would create a circular reference.
 */
function hasCircularReference(
  db: DbType,
  areaId: string,
  proposedParentId: string | null,
): boolean {
  if (proposedParentId === null) {
    return false;
  }

  let currentId: string | null = proposedParentId;

  while (currentId !== null) {
    if (currentId === areaId) {
      return true;
    }

    const row = db
      .select({ parentId: areas.parentId })
      .from(areas)
      .where(eq(areas.id, currentId))
      .get();

    if (!row) {
      return false;
    }

    currentId = row.parentId;
  }

  return false;
}

/**
 * Representation of an area used internally for ancestor chain resolution.
 */
export interface AreaMapEntry {
  id: string;
  name: string;
  color: string | null;
  parentId: string | null;
}

/**
 * Load all areas into an in-memory map for efficient ancestor chain resolution.
 * Returns a map of area ID -> AreaMapEntry.
 */
export function loadAreaMap(db: DbType): Map<string, AreaMapEntry> {
  const rows = db
    .select({
      id: areas.id,
      name: areas.name,
      color: areas.color,
      parentId: areas.parentId,
    })
    .from(areas)
    .all();

  const map = new Map<string, AreaMapEntry>();
  for (const row of rows) {
    map.set(row.id, row);
  }
  return map;
}

/**
 * Resolve the ancestor chain for an area using a pre-built area map.
 * Returns ancestors in root-first order (does NOT include the leaf area itself).
 * Uses cycle detection to prevent infinite loops (max depth of 20).
 * Returns a partial chain if an ancestor is not found in the map.
 */
export function resolveAreaAncestors(
  areaId: string,
  areaMap: Map<string, AreaMapEntry>,
): AreaAncestor[] {
  const ancestors: AreaAncestor[] = [];
  const visited = new Set<string>();
  const MAX_DEPTH = 20;

  let currentId: string | null = areaMap.get(areaId)?.parentId ?? null;

  while (currentId !== null && ancestors.length < MAX_DEPTH) {
    if (visited.has(currentId)) break;
    visited.add(currentId);
    const entry = areaMap.get(currentId);
    if (!entry) break;
    ancestors.push({ id: entry.id, name: entry.name, color: entry.color });
    currentId = entry.parentId;
  }

  ancestors.reverse();
  return ancestors;
}

/**
 * Result of parsing an areaId filter query parameter.
 */
export interface AreaFilterResult {
  /** Expanded, deduplicated area IDs (includes descendants of each supplied ID). */
  areaIds: string[];
  /** When true, caller must also include items with area_id IS NULL. */
  includeNull: boolean;
}

/**
 * Parse the areaId filter (single ID, CSV string, or array) into an expanded,
 * deduplicated array of area IDs and a flag for null inclusion.
 *
 * Supports the `__none__` sentinel: when present in the CSV, sets includeNull=true.
 * Empty segments and unknown IDs are silently ignored.
 */
export function resolveAreaFilter(db: DbType, areaId: string | string[]): AreaFilterResult {
  const NONE_SENTINEL = '__none__';
  const raw = Array.isArray(areaId)
    ? areaId
    : areaId
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

  let includeNull = false;
  const expanded = new Set<string>();
  for (const id of raw) {
    if (id === NONE_SENTINEL) {
      includeNull = true;
    } else {
      const exists = db.select({ id: areas.id }).from(areas).where(eq(areas.id, id)).get();
      if (exists) {
        for (const descendant of getDescendantIds(db, id)) {
          expanded.add(descendant);
        }
      }
      // unknown IDs are silently dropped
    }
  }
  return { areaIds: [...expanded], includeNull };
}

/**
 * List all areas, sorted by sort_order ascending, then name ascending.
 * Optionally filter by name search (case-insensitive).
 */
export function listAreas(db: DbType, search?: string): AreaResponse[] {
  const rows = db
    .select()
    .from(areas)
    .where(search ? sql`LOWER(${areas.name}) LIKE LOWER(${`%${search}%`})` : undefined)
    .orderBy(asc(areas.sortOrder), asc(areas.name))
    .all();

  return rows.map(toAreaResponse);
}

/**
 * Get a single area by ID.
 * @throws NotFoundError if area does not exist
 */
export function getAreaById(db: DbType, id: string): AreaResponse {
  const row = db.select().from(areas).where(eq(areas.id, id)).get();
  if (!row) {
    throw new NotFoundError('Area not found');
  }
  return toAreaResponse(row);
}

/**
 * Create a new area.
 * @throws ValidationError if name is invalid, description too long, or color format invalid, or parent doesn't exist
 * @throws ConflictError if sibling with the same name already exists (case-insensitive)
 */
export function createArea(db: DbType, data: CreateAreaRequest): AreaResponse {
  // Validate name
  const trimmedName = data.name.trim();
  if (trimmedName.length === 0 || trimmedName.length > 200) {
    throw new ValidationError('Area name must be between 1 and 200 characters');
  }

  // Validate description length
  if (
    data.description !== undefined &&
    data.description !== null &&
    data.description.length > 2000
  ) {
    throw new ValidationError('Area description must be at most 2000 characters');
  }

  // Validate color format
  if (data.color !== undefined && data.color !== null && !isValidHexColor(data.color)) {
    throw new ValidationError('Color must be a hex color code in format #RRGGBB');
  }

  // Validate sortOrder
  if (data.sortOrder !== undefined && data.sortOrder < 0) {
    throw new ValidationError('Sort order must be a non-negative integer');
  }

  // Validate parentId exists if provided
  if (data.parentId !== undefined && data.parentId !== null) {
    const parent = db.select().from(areas).where(eq(areas.id, data.parentId)).get();
    if (!parent) {
      throw new ValidationError('Parent area does not exist');
    }
  }

  // Check for sibling name conflict (same name + same parentId, case-insensitive)
  // Handle NULL comparison properly: if parentId is null, use IS NULL; otherwise use =
  const existingQuery =
    data.parentId === null || data.parentId === undefined
      ? db
          .select()
          .from(areas)
          .where(sql`LOWER(${areas.name}) = LOWER(${trimmedName}) AND ${areas.parentId} IS NULL`)
      : db
          .select()
          .from(areas)
          .where(
            sql`LOWER(${areas.name}) = LOWER(${trimmedName}) AND ${areas.parentId} = ${data.parentId}`,
          );

  const existing = existingQuery.get();

  if (existing) {
    throw new ConflictError('An area with this name already exists at this level');
  }

  // Create area
  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(areas)
    .values({
      id,
      name: trimmedName,
      parentId: data.parentId ?? null,
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
    parentId: data.parentId ?? null,
    description: data.description ?? null,
    color: data.color ?? null,
    sortOrder: data.sortOrder ?? 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update an area's name, description, color, parentId, and/or sort order.
 * @throws NotFoundError if area does not exist
 * @throws ValidationError if fields are invalid, no fields provided, or would create circular reference
 * @throws ConflictError if new name conflicts with sibling area (case-insensitive)
 */
export function updateArea(db: DbType, id: string, data: UpdateAreaRequest): AreaResponse {
  // Check area exists
  const existing = db.select().from(areas).where(eq(areas.id, id)).get();
  if (!existing) {
    throw new NotFoundError('Area not found');
  }

  // Validate at least one field provided
  if (
    data.name === undefined &&
    data.parentId === undefined &&
    data.description === undefined &&
    data.color === undefined &&
    data.sortOrder === undefined
  ) {
    throw new ValidationError('At least one field must be provided');
  }

  // Build update object
  const updates: Partial<typeof areas.$inferInsert> = {};

  // Validate and add name if provided
  if (data.name !== undefined) {
    const trimmedName = data.name.trim();
    if (trimmedName.length === 0 || trimmedName.length > 200) {
      throw new ValidationError('Area name must be between 1 and 200 characters');
    }

    // Check for duplicate name among siblings, excluding current area
    const parentId = data.parentId !== undefined ? data.parentId : existing.parentId;

    // Handle NULL comparison properly
    const duplicateQuery =
      parentId === null
        ? db
            .select()
            .from(areas)
            .where(
              sql`LOWER(${areas.name}) = LOWER(${trimmedName}) AND ${areas.parentId} IS NULL AND ${areas.id} != ${id}`,
            )
        : db
            .select()
            .from(areas)
            .where(
              sql`LOWER(${areas.name}) = LOWER(${trimmedName}) AND ${areas.parentId} = ${parentId} AND ${areas.id} != ${id}`,
            );

    const duplicate = duplicateQuery.get();

    if (duplicate) {
      throw new ConflictError('An area with this name already exists at this level');
    }

    updates.name = trimmedName;
  }

  // Validate parentId and check circular reference if provided
  if (data.parentId !== undefined) {
    if (data.parentId !== null) {
      // Validate parent exists
      const parent = db.select().from(areas).where(eq(areas.id, data.parentId)).get();
      if (!parent) {
        throw new ValidationError('Parent area does not exist');
      }

      // Check for circular reference
      if (hasCircularReference(db, id, data.parentId)) {
        throw new ValidationError('Setting this parent would create a circular reference');
      }
    }

    updates.parentId = data.parentId;
  }

  // Validate and add description if provided
  if (data.description !== undefined) {
    if (data.description !== null && data.description.length > 2000) {
      throw new ValidationError('Area description must be at most 2000 characters');
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
  db.update(areas).set(updates).where(eq(areas.id, id)).run();

  // Fetch and return updated area
  const updated = db.select().from(areas).where(eq(areas.id, id)).get();
  return toAreaResponse(updated!);
}

/**
 * Delete an area and all its descendants.
 * Fails if any area in the deletion set is referenced by work items or household items.
 * @throws NotFoundError if area does not exist
 * @throws AreaInUseError if area or its descendants are referenced by work items or household items
 */
export function deleteArea(db: DbType, id: string): void {
  // Check area exists
  const existing = db.select().from(areas).where(eq(areas.id, id)).get();
  if (!existing) {
    throw new NotFoundError('Area not found');
  }

  // Collect all descendant IDs (including the area itself)
  const descendantIds = getDescendantIds(db, id);

  // Count work item references
  const workItemCountResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(workItems)
    .where(
      sql`${workItems.areaId} IN (${sql.join(
        descendantIds.map((d) => sql`${d}`),
        sql`, `,
      )})`,
    )
    .get();
  const workItemCount = workItemCountResult?.count ?? 0;

  // Count household item references
  const householdItemCountResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(householdItems)
    .where(
      sql`${householdItems.areaId} IN (${sql.join(
        descendantIds.map((d) => sql`${d}`),
        sql`, `,
      )})`,
    )
    .get();
  const householdItemCount = householdItemCountResult?.count ?? 0;

  if (workItemCount > 0 || householdItemCount > 0) {
    throw new AreaInUseError('Area is in use and cannot be deleted', {
      workItemCount,
      householdItemCount,
    });
  }

  // Delete area (cascade will handle descendants due to CASCADE on parent_id FK)
  db.delete(areas).where(eq(areas.id, id)).run();
}
