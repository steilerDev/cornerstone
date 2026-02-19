import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { tags } from '../db/schema.js';
import type { CreateTagRequest, UpdateTagRequest, TagResponse } from '@cornerstone/shared';
import { NotFoundError, ValidationError, ConflictError } from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Convert database tag row to TagResponse shape.
 */
function toTagResponse(tag: typeof tags.$inferSelect): TagResponse {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    createdAt: tag.createdAt,
  };
}

/**
 * Validate hex color format (#RRGGBB).
 */
function isValidHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

/**
 * List all tags, sorted alphabetically by name.
 */
export function listTags(db: DbType): TagResponse[] {
  const tagRows = db
    .select()
    .from(tags)
    .orderBy(sql`LOWER(${tags.name})`)
    .all();
  return tagRows.map(toTagResponse);
}

/**
 * Get a single tag by ID.
 * @throws NotFoundError if tag does not exist
 */
export function getTagById(db: DbType, id: string): TagResponse {
  const tag = db.select().from(tags).where(eq(tags.id, id)).get();
  if (!tag) {
    throw new NotFoundError('Tag not found');
  }
  return toTagResponse(tag);
}

/**
 * Create a new tag.
 * @throws ValidationError if name is invalid or color format is invalid
 * @throws ConflictError if a tag with the same name already exists (case-insensitive)
 */
export function createTag(db: DbType, data: CreateTagRequest): TagResponse {
  // Validate name
  const trimmedName = data.name.trim();
  if (trimmedName.length === 0 || trimmedName.length > 50) {
    throw new ValidationError('Tag name must be between 1 and 50 characters');
  }

  // Validate color format if provided
  if (data.color !== undefined && data.color !== null && !isValidHexColor(data.color)) {
    throw new ValidationError('Color must be a hex color code in format #RRGGBB');
  }

  // Check for duplicate name (case-insensitive)
  const existing = db
    .select()
    .from(tags)
    .where(sql`LOWER(${tags.name}) = LOWER(${trimmedName})`)
    .get();

  if (existing) {
    throw new ConflictError('A tag with this name already exists');
  }

  // Create tag
  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(tags)
    .values({
      id,
      name: trimmedName,
      color: data.color ?? null,
      createdAt: now,
    })
    .run();

  return {
    id,
    name: trimmedName,
    color: data.color ?? null,
    createdAt: now,
  };
}

/**
 * Update a tag's name and/or color.
 * @throws NotFoundError if tag does not exist
 * @throws ValidationError if fields are invalid or no fields provided
 * @throws ConflictError if new name conflicts with existing tag (case-insensitive)
 */
export function updateTag(db: DbType, id: string, data: UpdateTagRequest): TagResponse {
  // Check tag exists
  const existing = db.select().from(tags).where(eq(tags.id, id)).get();
  if (!existing) {
    throw new NotFoundError('Tag not found');
  }

  // Validate at least one field provided
  if (data.name === undefined && data.color === undefined) {
    throw new ValidationError('At least one field must be provided');
  }

  // Build update object
  const updates: Partial<typeof tags.$inferInsert> = {};

  // Validate and add name if provided
  if (data.name !== undefined) {
    const trimmedName = data.name.trim();
    if (trimmedName.length === 0 || trimmedName.length > 50) {
      throw new ValidationError('Tag name must be between 1 and 50 characters');
    }

    // Check for duplicate name (case-insensitive), excluding current tag
    const duplicate = db
      .select()
      .from(tags)
      .where(sql`LOWER(${tags.name}) = LOWER(${trimmedName}) AND ${tags.id} != ${id}`)
      .get();

    if (duplicate) {
      throw new ConflictError('A tag with this name already exists');
    }

    updates.name = trimmedName;
  }

  // Validate and add color if provided
  if (data.color !== undefined) {
    if (data.color !== null && !isValidHexColor(data.color)) {
      throw new ValidationError('Color must be a hex color code in format #RRGGBB');
    }
    updates.color = data.color;
  }

  // Perform update
  db.update(tags).set(updates).where(eq(tags.id, id)).run();

  // Fetch and return updated tag
  const updated = db.select().from(tags).where(eq(tags.id, id)).get();
  return toTagResponse(updated!);
}

/**
 * Delete a tag.
 * Cascade removes the tag from all work items that reference it (FK constraint handles this).
 * @throws NotFoundError if tag does not exist
 */
export function deleteTag(db: DbType, id: string): void {
  const existing = db.select().from(tags).where(eq(tags.id, id)).get();
  if (!existing) {
    throw new NotFoundError('Tag not found');
  }

  // Delete tag (cascade removes from work_item_tags)
  db.delete(tags).where(eq(tags.id, id)).run();
}
