import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { users } from '../db/schema.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Get the current DAV token status for a user.
 * Returns { hasToken: boolean, createdAt?: string }
 */
export function getTokenStatus(
  db: DbType,
  userId: string,
): { hasToken: boolean; createdAt?: string } {
  const row = db
    .select({ davToken: users.davToken, updatedAt: users.updatedAt })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  if (!row) return { hasToken: false };

  return row.davToken
    ? { hasToken: true, createdAt: row.updatedAt }
    : { hasToken: false };
}

/**
 * Generate or replace the DAV token for a user.
 * Returns the new plaintext token.
 */
export function generateToken(db: DbType, userId: string): string {
  const token = randomBytes(32).toString('hex');
  const now = new Date().toISOString();
  db.update(users)
    .set({ davToken: token, updatedAt: now })
    .where(eq(users.id, userId))
    .run();
  return token;
}

/**
 * Revoke the DAV token for a user.
 */
export function revokeToken(db: DbType, userId: string): void {
  const now = new Date().toISOString();
  db.update(users)
    .set({ davToken: null, updatedAt: now })
    .where(eq(users.id, userId))
    .run();
}

/**
 * Validate a DAV token and return the associated user's ID and email.
 * Returns { userId, email } or null if token is invalid or does not exist.
 */
export function validateToken(
  db: DbType,
  token: string,
): { userId: string; email: string } | null {
  const row = db
    .select({ id: users.id, email: users.email, davToken: users.davToken })
    .from(users)
    .where(eq(users.davToken, token))
    .get();

  if (!row || !row.davToken) return null;

  return { userId: row.id, email: row.email };
}
