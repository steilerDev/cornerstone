/**
 * User preferences service — CRUD for user_preferences table.
 *
 * EPIC-09 Story #470: User Preferences Infrastructure
 *
 * Manages key-value user preferences (theme, dashboard card visibility, etc.).
 * Each user can have multiple preferences identified by a unique (userId, key) pair.
 */

import { eq, and } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { userPreferences } from '../db/schema.js';
import type { UserPreference } from '@cornerstone/shared';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Map a user_preferences row to a UserPreference shape.
 */
function toUserPreference(row: typeof userPreferences.$inferSelect): UserPreference {
  return {
    key: row.key,
    value: row.value,
    updatedAt: row.updatedAt,
  };
}

/**
 * List all preferences for a user.
 *
 * @returns array of UserPreference objects (empty array if user has no preferences)
 */
export function listPreferences(db: DbType, userId: string): UserPreference[] {
  const rows = db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).all();

  return rows.map(toUserPreference);
}

/**
 * Insert or update a preference for a user.
 * If the (userId, key) pair already exists, updates the value and updatedAt.
 * Otherwise, creates a new preference.
 *
 * @returns the created or updated UserPreference
 */
export function upsertPreference(
  db: DbType,
  userId: string,
  key: string,
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
      .set({
        value,
        updatedAt: now,
      })
      .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, key)))
      .run();
  } else {
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
  }

  // Fetch and return the updated row
  const row = db
    .select()
    .from(userPreferences)
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, key)))
    .get()!;

  return toUserPreference(row);
}

/**
 * Delete a preference for a user by key.
 *
 * @returns true if the preference was found and deleted, false if not found
 */
export function deletePreference(db: DbType, userId: string, key: string): boolean {
  const existing = db
    .select()
    .from(userPreferences)
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, key)))
    .get();

  if (!existing) {
    return false;
  }

  db.delete(userPreferences)
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, key)))
    .run();

  return true;
}
