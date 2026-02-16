import { randomUUID, scrypt as scryptCb, randomBytes, timingSafeEqual } from 'node:crypto';
import type { BinaryLike, ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';
import { eq, isNull, sql, and } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { users } from '../db/schema.js';
import type { UserResponse } from '@cornerstone/shared';
import { ConflictError } from '../errors/AppError.js';

// Re-export ConflictError for tests
export { ConflictError };

type DbType = BetterSQLite3Database<typeof schemaTypes>;

const scryptAsync = promisify(scryptCb) as (
  password: BinaryLike,
  salt: BinaryLike,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;
// OpenSSL requires slightly more than 128*N*r; use 128*r*(N+p+2) as safe minimum
const MAX_MEM = 128 * SCRYPT_R * (SCRYPT_N + SCRYPT_P + 2);

/**
 * Hash a password using Node.js crypto.scrypt.
 * Returns a PHC-format string: $scrypt$n=N,r=R,p=P$<base64-salt>$<base64-hash>
 *
 * @param password - Plain text password to hash
 * @returns PHC-format hash string
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const derived = (await scryptAsync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEM,
  })) as Buffer;
  return `$scrypt$n=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

/**
 * Verify a password against a scrypt PHC-format hash using timing-safe comparison.
 *
 * @param hash - The scrypt PHC-format password hash
 * @param password - The plain text password to verify
 * @returns True if password matches, false otherwise
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  const parts = hash.split('$'); // ['', 'scrypt', 'n=...,r=...,p=...', '<salt>', '<hash>']
  if (parts.length !== 5 || parts[1] !== 'scrypt') return false;

  const params = Object.fromEntries(parts[2].split(',').map((p) => p.split('=')));
  const salt = Buffer.from(parts[3], 'base64');
  const expected = Buffer.from(parts[4], 'base64');
  const n = Number(params.n);
  const r = Number(params.r);
  const p = Number(params.p);

  const derived = (await scryptAsync(password, salt, expected.length, {
    N: n,
    r,
    p,
    maxmem: 128 * r * (n + p + 2),
  })) as Buffer;

  return timingSafeEqual(derived, expected);
}

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
  const passwordHash = await hashPassword(password);
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

/**
 * Find a user by OIDC subject.
 *
 * @param db - Database instance
 * @param sub - OIDC subject identifier
 * @returns User row or undefined if not found
 */
export function findByOidcSubject(db: DbType, sub: string): typeof users.$inferSelect | undefined {
  return db
    .select()
    .from(users)
    .where(and(eq(users.authProvider, 'oidc'), eq(users.oidcSubject, sub)))
    .get();
}

/**
 * Find a user by OIDC subject or create a new one.
 *
 * @param db - Database instance
 * @param sub - OIDC subject identifier
 * @param email - User email address
 * @param displayName - User display name
 * @returns The user row (existing or newly created)
 * @throws ConflictError if email is already in use by another account
 */
export function findOrCreateOidcUser(
  db: DbType,
  sub: string,
  email: string,
  displayName: string,
): typeof users.$inferSelect {
  // First, try to find by OIDC subject
  const existingUser = findByOidcSubject(db, sub);
  if (existingUser) {
    return existingUser;
  }

  // Check if email is already used by another user
  const emailUser = findByEmail(db, email);
  if (emailUser) {
    throw new ConflictError('Email already in use by another account', {
      email,
    });
  }

  // Create new OIDC user
  const now = new Date().toISOString();
  const id = randomUUID();

  db.insert(users)
    .values({
      id,
      email,
      displayName,
      role: 'member',
      authProvider: 'oidc',
      oidcSubject: sub,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  // Return the inserted row
  const row = db.select().from(users).where(eq(users.id, id)).get();
  return row!;
}

/**
 * Update a user's display name.
 *
 * @param db - Database instance
 * @param userId - User ID to update
 * @param displayName - New display name
 * @returns The updated user row
 */
export function updateDisplayName(
  db: DbType,
  userId: string,
  displayName: string,
): typeof users.$inferSelect {
  const now = new Date().toISOString();

  db.update(users).set({ displayName, updatedAt: now }).where(eq(users.id, userId)).run();

  const row = db.select().from(users).where(eq(users.id, userId)).get();
  return row!;
}

/**
 * Update a user's password hash.
 *
 * @param db - Database instance
 * @param userId - User ID to update
 * @param newPasswordHash - New password hash (scrypt PHC format)
 */
export function updatePassword(db: DbType, userId: string, newPasswordHash: string): void {
  const now = new Date().toISOString();

  db.update(users)
    .set({ passwordHash: newPasswordHash, updatedAt: now })
    .where(eq(users.id, userId))
    .run();
}

/**
 * List all users, optionally filtered by search term.
 * Search is case-insensitive and matches against email and displayName.
 *
 * @param db - Database instance
 * @param searchTerm - Optional search term to filter users
 * @returns Array of user rows (both active and deactivated)
 */
export function listUsers(db: DbType, searchTerm?: string): (typeof users.$inferSelect)[] {
  if (!searchTerm) {
    return db.select().from(users).all();
  }

  // Case-insensitive search on email and displayName
  const pattern = `%${searchTerm}%`;
  return db
    .select()
    .from(users)
    .where(
      sql`(LOWER(${users.email}) LIKE LOWER(${pattern}) OR LOWER(${users.displayName}) LIKE LOWER(${pattern}))`,
    )
    .all();
}

/**
 * Find a user by ID.
 *
 * @param db - Database instance
 * @param id - User ID to find
 * @returns User row or undefined if not found
 */
export function findById(db: DbType, id: string): typeof users.$inferSelect | undefined {
  return db.select().from(users).where(eq(users.id, id)).get();
}

/**
 * Count active admins (non-deactivated users with role='admin').
 *
 * @param db - Database instance
 * @returns Count of active admin users
 */
export function countActiveAdmins(db: DbType): number {
  const result = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(users)
    .where(and(eq(users.role, 'admin'), isNull(users.deactivatedAt)))
    .get();
  return result?.count ?? 0;
}

/**
 * Update user by ID (admin operation - can change displayName, email, role).
 *
 * @param db - Database instance
 * @param userId - User ID to update
 * @param updates - Fields to update (all optional)
 * @returns The updated user row
 * @throws ConflictError if email is already in use by another user
 */
export function updateUserById(
  db: DbType,
  userId: string,
  updates: { displayName?: string; email?: string; role?: 'admin' | 'member' },
): typeof users.$inferSelect {
  // If changing email, check for conflicts
  if (updates.email) {
    const existingUser = findByEmail(db, updates.email);
    if (existingUser && existingUser.id !== userId) {
      throw new ConflictError('Email already in use', { email: updates.email });
    }
  }

  const now = new Date().toISOString();

  db.update(users)
    .set({ ...updates, updatedAt: now })
    .where(eq(users.id, userId))
    .run();

  const row = db.select().from(users).where(eq(users.id, userId)).get();
  return row!;
}

/**
 * Deactivate user (soft delete - set deactivatedAt).
 *
 * @param db - Database instance
 * @param userId - User ID to deactivate
 */
export function deactivateUser(db: DbType, userId: string): void {
  const now = new Date().toISOString();

  db.update(users).set({ deactivatedAt: now }).where(eq(users.id, userId)).run();
}
