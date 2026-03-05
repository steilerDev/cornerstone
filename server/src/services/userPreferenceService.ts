/**
 * User Preference Service
 *
 * EPIC-09 Story 9.3: User Preferences Infrastructure
 * Manages per-user key-value preferences (theme, dashboard state, etc).
 *
 * All preferences are stored as JSON strings in the value column for flexibility
 * in supporting different data types (strings, arrays, objects, etc).
 */

import { eq, and } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { userPreferences } from '../db/schema.js';
import { NotFoundError } from '../errors/AppError.js';
import type { UserPreference, PreferenceKey } from '@cornerstone/shared';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Map a user_preferences row to a UserPreference response shape.
 */
function toUserPreference(row: typeof userPreferences.$inferSelect): UserPreference {
  return {
    key: row.key as PreferenceKey,
    value: row.value,
    updatedAt: row.updatedAt,
  };
}

/**
 * List all preferences for a given user.
 * Returns empty array if user has no preferences.
 */
export function listPreferences(db: DbType, userId: string): UserPreference[] {
  const rows = db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .all();

  return rows.map(toUserPreference);
}

/**
 * Create or update a user preference (upsert).
 * If the preference already exists for this user+key, update it.
 * Otherwise, create it.
 *
 * @returns The created or updated preference
 */
export function upsertPreference(
  db: DbType,
  userId: string,
  key: PreferenceKey,
  value: string,
): UserPreference {
  const now = new Date().toISOString();

  // Check if preference already exists
  const existing = db
    .select()
    .from(userPreferences)
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, key)))
    .get();

  if (existing) {
    // Update existing preference
    db.update(userPreferences)
      .set({ value, updatedAt: now })
      .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, key)))
      .run();

    const updated = db
      .select()
      .from(userPreferences)
      .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, key)))
      .get()!;

    return toUserPreference(updated);
  }

  // Insert new preference
  db.insert(userPreferences)
    .values({
      userId,
      key,
      value,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const created = db
    .select()
    .from(userPreferences)
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, key)))
    .get()!;

  return toUserPreference(created);
}

/**
 * Delete a user preference by key.
 * Throws NotFoundError if the preference does not exist.
 */
export function deletePreference(db: DbType, userId: string, key: PreferenceKey): void {
  const existing = db
    .select()
    .from(userPreferences)
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, key)))
    .get();

  if (!existing) {
    throw new NotFoundError('Preference not found');
  }

  db.delete(userPreferences)
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, key)))
    .run();
}
