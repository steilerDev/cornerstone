import { randomUUID } from 'node:crypto';
import { eq, asc, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { trades, vendors } from '../db/schema.js';
import type { CreateTradeRequest, UpdateTradeRequest, TradeResponse } from '@cornerstone/shared';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  TradeInUseError,
} from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Convert database trade row to TradeResponse shape.
 */
function toTradeResponse(row: typeof trades.$inferSelect): TradeResponse {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    description: row.description,
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
 * List all trades, sorted by sort_order ascending, then name ascending.
 * Optionally filter by name search (case-insensitive).
 */
export function listTrades(db: DbType, search?: string): TradeResponse[] {
  const rows = db
    .select()
    .from(trades)
    .where(search ? sql`LOWER(${trades.name}) LIKE LOWER(${`%${search}%`})` : undefined)
    .orderBy(asc(trades.sortOrder), asc(trades.name))
    .all();

  return rows.map(toTradeResponse);
}

/**
 * Get a single trade by ID.
 * @throws NotFoundError if trade does not exist
 */
export function getTradeById(db: DbType, id: string): TradeResponse {
  const row = db.select().from(trades).where(eq(trades.id, id)).get();
  if (!row) {
    throw new NotFoundError('Trade not found');
  }
  return toTradeResponse(row);
}

/**
 * Create a new trade.
 * @throws ValidationError if name is invalid, description too long, or color format invalid
 * @throws ConflictError if a trade with the same name already exists (case-insensitive)
 */
export function createTrade(db: DbType, data: CreateTradeRequest): TradeResponse {
  // Validate name
  const trimmedName = data.name.trim();
  if (trimmedName.length === 0 || trimmedName.length > 200) {
    throw new ValidationError('Trade name must be between 1 and 200 characters');
  }

  // Validate description length
  if (
    data.description !== undefined &&
    data.description !== null &&
    data.description.length > 2000
  ) {
    throw new ValidationError('Trade description must be at most 2000 characters');
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
    .from(trades)
    .where(sql`LOWER(${trades.name}) = LOWER(${trimmedName})`)
    .get();

  if (existing) {
    throw new ConflictError('A trade with this name already exists');
  }

  // Create trade
  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(trades)
    .values({
      id,
      name: trimmedName,
      description: data.description ?? null,
      color: data.color ?? null,
      translationKey: null,
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
    translationKey: null,
    sortOrder: data.sortOrder ?? 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update a trade's name, description, color, and/or sort order.
 * @throws NotFoundError if trade does not exist
 * @throws ValidationError if fields are invalid or no fields provided
 * @throws ConflictError if new name conflicts with existing trade (case-insensitive)
 */
export function updateTrade(db: DbType, id: string, data: UpdateTradeRequest): TradeResponse {
  // Check trade exists
  const existing = db.select().from(trades).where(eq(trades.id, id)).get();
  if (!existing) {
    throw new NotFoundError('Trade not found');
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
  const updates: Partial<typeof trades.$inferInsert> = {};

  // Validate and add name if provided
  if (data.name !== undefined) {
    const trimmedName = data.name.trim();
    if (trimmedName.length === 0 || trimmedName.length > 200) {
      throw new ValidationError('Trade name must be between 1 and 200 characters');
    }

    // Check for duplicate name (case-insensitive), excluding current trade
    const duplicate = db
      .select()
      .from(trades)
      .where(sql`LOWER(${trades.name}) = LOWER(${trimmedName}) AND ${trades.id} != ${id}`)
      .get();

    if (duplicate) {
      throw new ConflictError('A trade with this name already exists');
    }

    updates.name = trimmedName;
  }

  // Validate and add description if provided
  if (data.description !== undefined) {
    if (data.description !== null && data.description.length > 2000) {
      throw new ValidationError('Trade description must be at most 2000 characters');
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
  db.update(trades).set(updates).where(eq(trades.id, id)).run();

  // Fetch and return updated trade
  const updated = db.select().from(trades).where(eq(trades.id, id)).get();
  return toTradeResponse(updated!);
}

/**
 * Delete a trade.
 * Fails if the trade is referenced by any vendors.
 * @throws NotFoundError if trade does not exist
 * @throws TradeInUseError if trade is referenced by vendors
 */
export function deleteTrade(db: DbType, id: string): void {
  // Check trade exists
  const existing = db.select().from(trades).where(eq(trades.id, id)).get();
  if (!existing) {
    throw new NotFoundError('Trade not found');
  }

  // Check for vendor references
  const vendorCountResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(vendors)
    .where(eq(vendors.tradeId, id))
    .get();
  const vendorCount = vendorCountResult?.count ?? 0;

  if (vendorCount > 0) {
    throw new TradeInUseError('Trade is in use and cannot be deleted', {
      vendorCount,
    });
  }

  // Delete trade
  db.delete(trades).where(eq(trades.id, id)).run();
}
