import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { eq, isNull, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { users } from '../db/schema.js';
import type { UserResponse } from '@cornerstone/shared';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Convert DB row to UserResponse (never includes password_hash or oidc_subject).
 *
 * @param row - Database user row
 * @returns UserResponse object safe for API responses
 */
export function toUserResponse(row: typeof users.$inferSelect): UserResponse {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    authProvider: row.authProvider,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deactivatedAt: row.deactivatedAt,
  };
}

/**
 * Create a new local authentication user.
 *
 * @param db - Database instance
 * @param email - User email address
 * @param displayName - User display name
 * @param password - Plain text password (will be hashed)
 * @param role - User role (admin or member)
 * @returns The created user row
 */
export async function createLocalUser(
  db: DbType,
  email: string,
  displayName: string,
  password: string,
  role: 'admin' | 'member' = 'member',
): Promise<typeof users.$inferSelect> {
  const now = new Date().toISOString();
  const passwordHash = await argon2.hash(password);
  const id = randomUUID();

  db.insert(users)
    .values({
      id,
      email,
      displayName,
      role,
      authProvider: 'local',
      passwordHash,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  // Return the inserted row
  const row = db.select().from(users).where(eq(users.id, id)).get();
  return row!;
}

/**
 * Verify a password against an argon2 hash.
 *
 * @param hash - The argon2 password hash
 * @param password - The plain text password to verify
 * @returns True if password matches, false otherwise
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

/**
 * Find a user by email address.
 *
 * @param db - Database instance
 * @param email - User email to search for
 * @returns User row or undefined if not found
 */
export function findByEmail(db: DbType, email: string): typeof users.$inferSelect | undefined {
  return db.select().from(users).where(eq(users.email, email)).get();
}

/**
 * Count all users in the system.
 *
 * @param db - Database instance
 * @returns Total user count
 */
export function countUsers(db: DbType): number {
  const result = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(users)
    .get();
  return result?.count ?? 0;
}

/**
 * Count all active (non-deactivated) users in the system.
 *
 * @param db - Database instance
 * @returns Active user count
 */
export function countActiveUsers(db: DbType): number {
  const result = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(users)
    .where(isNull(users.deactivatedAt))
    .get();
  return result?.count ?? 0;
}
