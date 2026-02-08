import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from './migrate.js';
import * as schema from './schema.js';
import { eq } from 'drizzle-orm';

describe('User Database Schema & Migration', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  /**
   * Creates a fresh in-memory database with migrations applied.
   * Foreign keys are enabled to test CASCADE delete behavior.
   */
  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON'); // Required for CASCADE delete
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('Migration Structure', () => {
    it('creates users table with correct columns', () => {
      const columns = sqlite.prepare("PRAGMA table_info('users')").all() as Array<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }>;

      const columnNames = columns.map((col) => col.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('email');
      expect(columnNames).toContain('display_name');
      expect(columnNames).toContain('role');
      expect(columnNames).toContain('auth_provider');
      expect(columnNames).toContain('password_hash');
      expect(columnNames).toContain('oidc_subject');
      expect(columnNames).toContain('deactivated_at');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');

      // Verify primary key
      const idCol = columns.find((col) => col.name === 'id');
      expect(idCol?.pk).toBe(1);

      // Verify NOT NULL constraints
      const emailCol = columns.find((col) => col.name === 'email');
      expect(emailCol?.notnull).toBe(1);

      const displayNameCol = columns.find((col) => col.name === 'display_name');
      expect(displayNameCol?.notnull).toBe(1);
    });

    it('creates sessions table with correct columns', () => {
      const columns = sqlite.prepare("PRAGMA table_info('sessions')").all() as Array<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }>;

      const columnNames = columns.map((col) => col.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('user_id');
      expect(columnNames).toContain('expires_at');
      expect(columnNames).toContain('created_at');

      // Verify primary key
      const idCol = columns.find((col) => col.name === 'id');
      expect(idCol?.pk).toBe(1);

      // Verify NOT NULL constraints
      const userIdCol = columns.find((col) => col.name === 'user_id');
      expect(userIdCol?.notnull).toBe(1);

      const expiresAtCol = columns.find((col) => col.name === 'expires_at');
      expect(expiresAtCol?.notnull).toBe(1);
    });

    it('creates required indexes', () => {
      const indexes = sqlite
        .prepare("SELECT name, tbl_name FROM sqlite_master WHERE type='index'")
        .all() as Array<{ name: string; tbl_name: string }>;

      const indexNames = indexes.map((idx) => idx.name);
      expect(indexNames).toContain('idx_users_oidc_lookup');
      expect(indexNames).toContain('idx_sessions_user_id');
      expect(indexNames).toContain('idx_sessions_expires_at');

      // Verify index associations
      const oidcLookupIdx = indexes.find((idx) => idx.name === 'idx_users_oidc_lookup');
      expect(oidcLookupIdx?.tbl_name).toBe('users');

      const userIdIdx = indexes.find((idx) => idx.name === 'idx_sessions_user_id');
      expect(userIdIdx?.tbl_name).toBe('sessions');

      const expiresAtIdx = indexes.find((idx) => idx.name === 'idx_sessions_expires_at');
      expect(expiresAtIdx?.tbl_name).toBe('sessions');
    });
  });

  describe('User Insertion via Drizzle ORM', () => {
    it('can insert a local user (with password_hash, no oidc_subject)', async () => {
      const now = new Date().toISOString();
      const userId = 'user-local-1';

      await db.insert(schema.users).values({
        id: userId,
        email: 'local@example.com',
        displayName: 'Local User',
        role: 'admin',
        authProvider: 'local',
        passwordHash: '$2b$10$hashedpassword',
        oidcSubject: null,
        deactivatedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      const users = await db.select().from(schema.users).where(eq(schema.users.id, userId));
      expect(users).toHaveLength(1);
      expect(users[0].email).toBe('local@example.com');
      expect(users[0].authProvider).toBe('local');
      expect(users[0].passwordHash).toBe('$2b$10$hashedpassword');
      expect(users[0].oidcSubject).toBeNull();
    });

    it('can insert an OIDC user (with oidc_subject, no password_hash)', async () => {
      const now = new Date().toISOString();
      const userId = 'user-oidc-1';

      await db.insert(schema.users).values({
        id: userId,
        email: 'oidc@example.com',
        displayName: 'OIDC User',
        role: 'member',
        authProvider: 'oidc',
        passwordHash: null,
        oidcSubject: 'oidc-provider-subject-123',
        deactivatedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      const users = await db.select().from(schema.users).where(eq(schema.users.id, userId));
      expect(users).toHaveLength(1);
      expect(users[0].email).toBe('oidc@example.com');
      expect(users[0].authProvider).toBe('oidc');
      expect(users[0].oidcSubject).toBe('oidc-provider-subject-123');
      expect(users[0].passwordHash).toBeNull();
    });
  });

  describe('Constraints & Validation', () => {
    it('enforces email uniqueness constraint', async () => {
      const now = new Date().toISOString();

      // Insert first user
      await db.insert(schema.users).values({
        id: 'user-1',
        email: 'duplicate@example.com',
        displayName: 'User One',
        role: 'admin',
        authProvider: 'local',
        passwordHash: '$2b$10$hash1',
        oidcSubject: null,
        deactivatedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      // Verify first insert completed
      const firstUser = await db.select().from(schema.users).where(eq(schema.users.id, 'user-1'));
      expect(firstUser).toHaveLength(1);

      // Attempt to insert second user with same email (should throw)
      let error: Error | undefined;
      try {
        await db.insert(schema.users).values({
          id: 'user-2',
          email: 'duplicate@example.com',
          displayName: 'User Two',
          role: 'member',
          authProvider: 'local',
          passwordHash: '$2b$10$hash2',
          oidcSubject: null,
          deactivatedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      } catch (err) {
        error = err as Error;
      }

      expect(error).toBeDefined();
      expect(error?.message).toMatch(/UNIQUE constraint failed/);
    });

    it('enforces OIDC lookup unique index (duplicate auth_provider + oidc_subject)', async () => {
      const now = new Date().toISOString();

      // Insert first OIDC user
      await db.insert(schema.users).values({
        id: 'user-oidc-1',
        email: 'oidc1@example.com',
        displayName: 'OIDC User 1',
        role: 'admin',
        authProvider: 'oidc',
        passwordHash: null,
        oidcSubject: 'same-oidc-subject',
        deactivatedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      // Verify first insert completed
      const firstUser = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 'user-oidc-1'));
      expect(firstUser).toHaveLength(1);

      // Attempt to insert second OIDC user with same auth_provider + oidc_subject (should throw)
      let error: Error | undefined;
      try {
        await db.insert(schema.users).values({
          id: 'user-oidc-2',
          email: 'oidc2@example.com',
          displayName: 'OIDC User 2',
          role: 'member',
          authProvider: 'oidc',
          passwordHash: null,
          oidcSubject: 'same-oidc-subject',
          deactivatedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      } catch (err) {
        error = err as Error;
      }

      expect(error).toBeDefined();
      expect(error?.message).toMatch(/UNIQUE constraint failed/);
    });

    it('allows multiple users with null oidc_subject (partial unique index)', async () => {
      const now = new Date().toISOString();

      // Insert first local user with null oidc_subject
      await db.insert(schema.users).values({
        id: 'user-local-1',
        email: 'local1@example.com',
        displayName: 'Local User 1',
        role: 'admin',
        authProvider: 'local',
        passwordHash: '$2b$10$hash1',
        oidcSubject: null,
        deactivatedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      // Insert second local user with null oidc_subject (should succeed)
      await db.insert(schema.users).values({
        id: 'user-local-2',
        email: 'local2@example.com',
        displayName: 'Local User 2',
        role: 'member',
        authProvider: 'local',
        passwordHash: '$2b$10$hash2',
        oidcSubject: null,
        deactivatedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      const users = await db.select().from(schema.users);
      expect(users).toHaveLength(2);
    });

    it('enforces role CHECK constraint (valid values)', async () => {
      const now = new Date().toISOString();

      // Test 'admin' role
      await db.insert(schema.users).values({
        id: 'user-admin',
        email: 'admin@example.com',
        displayName: 'Admin User',
        role: 'admin',
        authProvider: 'local',
        passwordHash: '$2b$10$hash',
        oidcSubject: null,
        deactivatedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      // Test 'member' role
      await db.insert(schema.users).values({
        id: 'user-member',
        email: 'member@example.com',
        displayName: 'Member User',
        role: 'member',
        authProvider: 'local',
        passwordHash: '$2b$10$hash',
        oidcSubject: null,
        deactivatedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      const users = await db.select().from(schema.users);
      expect(users).toHaveLength(2);
    });

    it('enforces role CHECK constraint (invalid value)', async () => {
      const now = new Date().toISOString();

      // Attempt to insert invalid role using raw SQL (Drizzle validates enums at runtime)
      let error: Error | undefined;
      try {
        sqlite
          .prepare(
            `INSERT INTO users (id, email, display_name, role, auth_provider, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            'user-invalid',
            'invalid@example.com',
            'Invalid User',
            'superadmin',
            'local',
            now,
            now,
          );
      } catch (err) {
        error = err as Error;
      }

      expect(error).toBeDefined();
      expect(error?.message).toMatch(/CHECK constraint failed/);
    });

    it('enforces auth_provider CHECK constraint (valid values)', async () => {
      const now = new Date().toISOString();

      // Test 'local' provider
      await db.insert(schema.users).values({
        id: 'user-local',
        email: 'local@example.com',
        displayName: 'Local User',
        role: 'admin',
        authProvider: 'local',
        passwordHash: '$2b$10$hash',
        oidcSubject: null,
        deactivatedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      // Test 'oidc' provider
      await db.insert(schema.users).values({
        id: 'user-oidc',
        email: 'oidc@example.com',
        displayName: 'OIDC User',
        role: 'admin',
        authProvider: 'oidc',
        passwordHash: null,
        oidcSubject: 'oidc-sub',
        deactivatedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      const users = await db.select().from(schema.users);
      expect(users).toHaveLength(2);
    });

    it('enforces auth_provider CHECK constraint (invalid value)', async () => {
      const now = new Date().toISOString();

      // Attempt to insert invalid auth_provider using raw SQL
      let error: Error | undefined;
      try {
        sqlite
          .prepare(
            `INSERT INTO users (id, email, display_name, role, auth_provider, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run('user-invalid', 'invalid@example.com', 'Invalid User', 'admin', 'saml', now, now);
      } catch (err) {
        error = err as Error;
      }

      expect(error).toBeDefined();
      expect(error?.message).toMatch(/CHECK constraint failed/);
    });

    it('allows deactivated_at to be null (default)', async () => {
      const now = new Date().toISOString();

      await db.insert(schema.users).values({
        id: 'user-active',
        email: 'active@example.com',
        displayName: 'Active User',
        role: 'member',
        authProvider: 'local',
        passwordHash: '$2b$10$hash',
        oidcSubject: null,
        deactivatedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      const users = await db.select().from(schema.users).where(eq(schema.users.id, 'user-active'));
      expect(users[0].deactivatedAt).toBeNull();
    });

    it('allows deactivated_at to be a timestamp', async () => {
      const now = new Date().toISOString();
      const deactivatedAt = '2024-06-01T10:00:00.000Z';

      await db.insert(schema.users).values({
        id: 'user-deactivated',
        email: 'deactivated@example.com',
        displayName: 'Deactivated User',
        role: 'member',
        authProvider: 'local',
        passwordHash: '$2b$10$hash',
        oidcSubject: null,
        deactivatedAt,
        createdAt: now,
        updatedAt: now,
      });

      const users = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 'user-deactivated'));
      expect(users[0].deactivatedAt).toBe(deactivatedAt);
    });
  });

  describe('Foreign Key & CASCADE Delete', () => {
    it('session references user with CASCADE delete', async () => {
      const now = new Date().toISOString();
      const userId = 'user-cascade-test';

      // Insert user
      await db.insert(schema.users).values({
        id: userId,
        email: 'cascade@example.com',
        displayName: 'Cascade User',
        role: 'admin',
        authProvider: 'local',
        passwordHash: '$2b$10$hash',
        oidcSubject: null,
        deactivatedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      // Insert sessions for the user
      await db.insert(schema.sessions).values({
        id: 'session-1',
        userId,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        createdAt: now,
      });

      await db.insert(schema.sessions).values({
        id: 'session-2',
        userId,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        createdAt: now,
      });

      // Verify sessions exist
      let sessions = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, userId));
      expect(sessions).toHaveLength(2);

      // Delete user
      await db.delete(schema.users).where(eq(schema.users.id, userId));

      // Verify sessions are CASCADE deleted
      sessions = await db.select().from(schema.sessions).where(eq(schema.sessions.userId, userId));
      expect(sessions).toHaveLength(0);
    });
  });

  describe('Query Patterns', () => {
    it('can query only active users (WHERE deactivated_at IS NULL)', async () => {
      const now = new Date().toISOString();

      // Insert active user
      await db.insert(schema.users).values({
        id: 'user-active',
        email: 'active@example.com',
        displayName: 'Active User',
        role: 'admin',
        authProvider: 'local',
        passwordHash: '$2b$10$hash',
        oidcSubject: null,
        deactivatedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      // Insert deactivated user
      await db.insert(schema.users).values({
        id: 'user-inactive',
        email: 'inactive@example.com',
        displayName: 'Inactive User',
        role: 'member',
        authProvider: 'local',
        passwordHash: '$2b$10$hash',
        oidcSubject: null,
        deactivatedAt: '2024-06-01T10:00:00.000Z',
        createdAt: now,
        updatedAt: now,
      });

      // Query only active users
      const activeUsers = sqlite
        .prepare('SELECT id FROM users WHERE deactivated_at IS NULL')
        .all() as Array<{ id: string }>;

      expect(activeUsers).toHaveLength(1);
      expect(activeUsers[0].id).toBe('user-active');
    });

    it('can insert a session and query by user_id', async () => {
      const now = new Date().toISOString();
      const userId = 'user-session-test';

      // Insert user
      await db.insert(schema.users).values({
        id: userId,
        email: 'session@example.com',
        displayName: 'Session User',
        role: 'admin',
        authProvider: 'local',
        passwordHash: '$2b$10$hash',
        oidcSubject: null,
        deactivatedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      // Insert session
      const sessionId = 'session-query-test';
      const expiresAt = new Date(Date.now() + 3600000).toISOString();
      await db.insert(schema.sessions).values({
        id: sessionId,
        userId,
        expiresAt,
        createdAt: now,
      });

      // Query session by user_id
      const sessions = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, userId));

      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe(sessionId);
      expect(sessions[0].userId).toBe(userId);
      expect(sessions[0].expiresAt).toBe(expiresAt);
    });

    it('can query sessions by expires_at index', async () => {
      const now = new Date().toISOString();
      const userId = 'user-expires-test';

      // Insert user
      await db.insert(schema.users).values({
        id: userId,
        email: 'expires@example.com',
        displayName: 'Expires User',
        role: 'admin',
        authProvider: 'local',
        passwordHash: '$2b$10$hash',
        oidcSubject: null,
        deactivatedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      // Insert sessions with different expiration times
      const pastExpiry = new Date(Date.now() - 3600000).toISOString();
      const futureExpiry = new Date(Date.now() + 3600000).toISOString();

      await db.insert(schema.sessions).values({
        id: 'session-expired',
        userId,
        expiresAt: pastExpiry,
        createdAt: now,
      });

      await db.insert(schema.sessions).values({
        id: 'session-active',
        userId,
        expiresAt: futureExpiry,
        createdAt: now,
      });

      // Query expired sessions (expires_at < now)
      const expiredSessions = sqlite
        .prepare('SELECT id FROM sessions WHERE expires_at < ?')
        .all(now) as Array<{ id: string }>;

      expect(expiredSessions).toHaveLength(1);
      expect(expiredSessions[0].id).toBe('session-expired');
    });
  });
});
