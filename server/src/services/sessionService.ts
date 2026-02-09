import { randomBytes } from 'node:crypto';
import { eq, lt, gt, and, isNull } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { sessions, users } from '../db/schema.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Generate a cryptographically secure 256-bit session token (hex string).
 *
 * @returns A random 64-character hex string (32 bytes = 256 bits)
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Create a new session for a user.
 *
 * @param db - Database instance
 * @param userId - User ID to create session for
 * @param durationSeconds - Session duration in seconds
 * @returns The session ID (token)
 */
export function createSession(db: DbType, userId: string, durationSeconds: number): string {
  const id = generateSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationSeconds * 1000);

  db.insert(sessions)
    .values({
      id,
      userId,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
    })
    .run();

  return id;
}

/**
 * Validate a session token and return the associated user.
 * Returns null if the session is invalid, expired, or the user is deactivated.
 *
 * @param db - Database instance
 * @param sessionId - Session token to validate
 * @returns User row if valid, null otherwise
 */
export function validateSession(db: DbType, sessionId: string): typeof users.$inferSelect | null {
  const now = new Date().toISOString();

  // Join sessions with users, checking:
  // - Session exists and has not expired
  // - User is not deactivated
  const result = db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      authProvider: users.authProvider,
      passwordHash: users.passwordHash,
      oidcSubject: users.oidcSubject,
      deactivatedAt: users.deactivatedAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(eq(sessions.id, sessionId), gt(sessions.expiresAt, now), isNull(users.deactivatedAt)),
    )
    .get();

  return result ?? null;
}

/**
 * Destroy a session by ID.
 *
 * @param db - Database instance
 * @param sessionId - Session ID to destroy
 */
export function destroySession(db: DbType, sessionId: string): void {
  db.delete(sessions).where(eq(sessions.id, sessionId)).run();
}

/**
 * Destroy all sessions for a user.
 *
 * @param db - Database instance
 * @param userId - User ID whose sessions should be destroyed
 */
export function destroyUserSessions(db: DbType, userId: string): void {
  db.delete(sessions).where(eq(sessions.userId, userId)).run();
}

/**
 * Clean up expired sessions from the database.
 *
 * @param db - Database instance
 * @returns Number of sessions deleted
 */
export function cleanupExpiredSessions(db: DbType): number {
  const now = new Date().toISOString();
  const result = db.delete(sessions).where(lt(sessions.expiresAt, now)).run();
  return result.changes;
}
