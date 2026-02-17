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

describe('Work Items Database Schema & Migration', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  /**
   * Creates a fresh in-memory database with migrations applied.
   * Foreign keys are enabled to test CASCADE delete behavior.
   */
  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON'); // Required for CASCADE delete and SET NULL
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
    it('UAT-3.1-01: migration runs successfully', () => {
      // Verify migration 0002 was recorded
      const migrations = sqlite
        .prepare("SELECT name FROM _migrations WHERE name = '0002_create_work_items.sql'")
        .all() as Array<{ name: string }>;

      expect(migrations).toHaveLength(1);
      expect(migrations[0].name).toBe('0002_create_work_items.sql');
    });

    it('UAT-3.1-02: all work item tables exist', () => {
      const tables = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('work_items', 'tags', 'work_item_tags', 'work_item_notes', 'work_item_subtasks', 'work_item_dependencies')",
        )
        .all() as Array<{ name: string }>;

      const tableNames = tables.map((t) => t.name).sort();
      expect(tableNames).toEqual([
        'tags',
        'work_item_dependencies',
        'work_item_notes',
        'work_item_subtasks',
        'work_item_tags',
        'work_items',
      ]);
    });

    it('UAT-3.1-03: work_items table has correct columns', () => {
      const columns = sqlite.prepare("PRAGMA table_info('work_items')").all() as Array<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
        dflt_value: string | null;
      }>;

      const columnNames = columns.map((col) => col.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('title');
      expect(columnNames).toContain('description');
      expect(columnNames).toContain('status');
      expect(columnNames).toContain('start_date');
      expect(columnNames).toContain('end_date');
      expect(columnNames).toContain('duration_days');
      expect(columnNames).toContain('start_after');
      expect(columnNames).toContain('start_before');
      expect(columnNames).toContain('assigned_user_id');
      expect(columnNames).toContain('created_by');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');

      // Verify primary key
      const idCol = columns.find((col) => col.name === 'id');
      expect(idCol?.pk).toBe(1);

      // Verify NOT NULL constraints
      const titleCol = columns.find((col) => col.name === 'title');
      expect(titleCol?.notnull).toBe(1);

      const statusCol = columns.find((col) => col.name === 'status');
      expect(statusCol?.notnull).toBe(1);

      // Verify nullable columns
      const descriptionCol = columns.find((col) => col.name === 'description');
      expect(descriptionCol?.notnull).toBe(0);

      const assignedUserCol = columns.find((col) => col.name === 'assigned_user_id');
      expect(assignedUserCol?.notnull).toBe(0);

      const createdByCol = columns.find((col) => col.name === 'created_by');
      expect(createdByCol?.notnull).toBe(0);
    });

    it('UAT-3.1-04: tags table has correct columns', () => {
      const columns = sqlite.prepare("PRAGMA table_info('tags')").all() as Array<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }>;

      const columnNames = columns.map((col) => col.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('color');
      expect(columnNames).toContain('created_at');

      // Verify primary key
      const idCol = columns.find((col) => col.name === 'id');
      expect(idCol?.pk).toBe(1);

      // Verify NOT NULL constraints
      const nameCol = columns.find((col) => col.name === 'name');
      expect(nameCol?.notnull).toBe(1);

      const createdAtCol = columns.find((col) => col.name === 'created_at');
      expect(createdAtCol?.notnull).toBe(1);

      // Verify color is nullable
      const colorCol = columns.find((col) => col.name === 'color');
      expect(colorCol?.notnull).toBe(0);
    });

    it('UAT-3.1-05: work_item_tags has composite primary key', () => {
      const columns = sqlite.prepare("PRAGMA table_info('work_item_tags')").all() as Array<{
        name: string;
        pk: number;
      }>;

      const pkColumns = columns.filter((col) => col.pk > 0).map((col) => col.name);
      expect(pkColumns).toContain('work_item_id');
      expect(pkColumns).toContain('tag_id');
      expect(pkColumns).toHaveLength(2);
    });

    it('UAT-3.1-06: work_item_notes table has correct columns', () => {
      const columns = sqlite.prepare("PRAGMA table_info('work_item_notes')").all() as Array<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }>;

      const columnNames = columns.map((col) => col.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('work_item_id');
      expect(columnNames).toContain('content');
      expect(columnNames).toContain('created_by');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');

      // Verify primary key
      const idCol = columns.find((col) => col.name === 'id');
      expect(idCol?.pk).toBe(1);

      // Verify NOT NULL constraints
      const workItemIdCol = columns.find((col) => col.name === 'work_item_id');
      expect(workItemIdCol?.notnull).toBe(1);

      const contentCol = columns.find((col) => col.name === 'content');
      expect(contentCol?.notnull).toBe(1);

      // Verify nullable columns
      const createdByCol = columns.find((col) => col.name === 'created_by');
      expect(createdByCol?.notnull).toBe(0);
    });

    it('UAT-3.1-07: work_item_subtasks table has correct columns', () => {
      const columns = sqlite.prepare("PRAGMA table_info('work_item_subtasks')").all() as Array<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
        dflt_value: string | null;
      }>;

      const columnNames = columns.map((col) => col.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('work_item_id');
      expect(columnNames).toContain('title');
      expect(columnNames).toContain('is_completed');
      expect(columnNames).toContain('sort_order');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');

      // Verify primary key
      const idCol = columns.find((col) => col.name === 'id');
      expect(idCol?.pk).toBe(1);

      // Verify NOT NULL constraints
      const titleCol = columns.find((col) => col.name === 'title');
      expect(titleCol?.notnull).toBe(1);

      const isCompletedCol = columns.find((col) => col.name === 'is_completed');
      expect(isCompletedCol?.notnull).toBe(1);
      expect(isCompletedCol?.dflt_value).toBe('0');

      const sortOrderCol = columns.find((col) => col.name === 'sort_order');
      expect(sortOrderCol?.notnull).toBe(1);
      expect(sortOrderCol?.dflt_value).toBe('0');
    });

    it('UAT-3.1-08: work_item_dependencies has correct structure', () => {
      const columns = sqlite.prepare("PRAGMA table_info('work_item_dependencies')").all() as Array<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }>;

      const columnNames = columns.map((col) => col.name);
      expect(columnNames).toContain('predecessor_id');
      expect(columnNames).toContain('successor_id');
      expect(columnNames).toContain('dependency_type');

      // Verify composite primary key
      const pkColumns = columns.filter((col) => col.pk > 0).map((col) => col.name);
      expect(pkColumns).toContain('predecessor_id');
      expect(pkColumns).toContain('successor_id');
      expect(pkColumns).toHaveLength(2);

      // Verify NOT NULL constraints
      const predecessorCol = columns.find((col) => col.name === 'predecessor_id');
      expect(predecessorCol?.notnull).toBe(1);

      const successorCol = columns.find((col) => col.name === 'successor_id');
      expect(successorCol?.notnull).toBe(1);

      const typeCol = columns.find((col) => col.name === 'dependency_type');
      expect(typeCol?.notnull).toBe(1);
    });

    it('UAT-3.1-09: all required indexes exist', () => {
      const indexes = sqlite
        .prepare("SELECT name, tbl_name FROM sqlite_master WHERE type='index'")
        .all() as Array<{ name: string; tbl_name: string }>;

      const indexNames = indexes.map((idx) => idx.name);

      // Work items indexes
      expect(indexNames).toContain('idx_work_items_status');
      expect(indexNames).toContain('idx_work_items_assigned_user_id');
      expect(indexNames).toContain('idx_work_items_created_at');

      // Work item notes index
      expect(indexNames).toContain('idx_work_item_notes_work_item_id');

      // Work item subtasks index
      expect(indexNames).toContain('idx_work_item_subtasks_work_item_id');

      // Work item tags index
      expect(indexNames).toContain('idx_work_item_tags_tag_id');

      // Work item dependencies index
      expect(indexNames).toContain('idx_work_item_dependencies_successor_id');

      // Verify index associations
      const statusIdx = indexes.find((idx) => idx.name === 'idx_work_items_status');
      expect(statusIdx?.tbl_name).toBe('work_items');

      const notesIdx = indexes.find((idx) => idx.name === 'idx_work_item_notes_work_item_id');
      expect(notesIdx?.tbl_name).toBe('work_item_notes');

      const subtasksIdx = indexes.find((idx) => idx.name === 'idx_work_item_subtasks_work_item_id');
      expect(subtasksIdx?.tbl_name).toBe('work_item_subtasks');

      const tagsIdx = indexes.find((idx) => idx.name === 'idx_work_item_tags_tag_id');
      expect(tagsIdx?.tbl_name).toBe('work_item_tags');

      const depsIdx = indexes.find((idx) => idx.name === 'idx_work_item_dependencies_successor_id');
      expect(depsIdx?.tbl_name).toBe('work_item_dependencies');
    });
  });

  describe('Foreign Key Constraints - CASCADE Delete', () => {
    let testUserId: string;

    beforeEach(async () => {
      // Create a test user for foreign key references
      const now = new Date().toISOString();
      testUserId = 'user-workitem-test';

      await db.insert(schema.users).values({
        id: testUserId,
        email: 'workitem@example.com',
        displayName: 'WorkItem Test User',
        role: 'admin',
        authProvider: 'local',
        passwordHash: '$2b$10$hash',
        oidcSubject: null,
        deactivatedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    });

    it('UAT-3.1-10: deleting a work item cascades to notes', async () => {
      const now = new Date().toISOString();
      const workItemId = 'work-item-1';

      // Insert work item
      await db.insert(schema.workItems).values({
        id: workItemId,
        title: 'Test Work Item',
        description: null,
        status: 'not_started',
        startDate: null,
        endDate: null,
        durationDays: null,
        startAfter: null,
        startBefore: null,
        assignedUserId: null,
        createdBy: testUserId,
        createdAt: now,
        updatedAt: now,
      });

      // Insert notes
      await db.insert(schema.workItemNotes).values([
        {
          id: 'note-1',
          workItemId,
          content: 'Note 1',
          createdBy: testUserId,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'note-2',
          workItemId,
          content: 'Note 2',
          createdBy: testUserId,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      // Verify notes exist
      let notes = await db
        .select()
        .from(schema.workItemNotes)
        .where(eq(schema.workItemNotes.workItemId, workItemId));
      expect(notes).toHaveLength(2);

      // Delete work item
      await db.delete(schema.workItems).where(eq(schema.workItems.id, workItemId));

      // Verify notes are CASCADE deleted
      notes = await db
        .select()
        .from(schema.workItemNotes)
        .where(eq(schema.workItemNotes.workItemId, workItemId));
      expect(notes).toHaveLength(0);
    });

    it('UAT-3.1-11: deleting a work item cascades to subtasks', async () => {
      const now = new Date().toISOString();
      const workItemId = 'work-item-2';

      // Insert work item
      await db.insert(schema.workItems).values({
        id: workItemId,
        title: 'Test Work Item',
        description: null,
        status: 'not_started',
        startDate: null,
        endDate: null,
        durationDays: null,
        startAfter: null,
        startBefore: null,
        assignedUserId: null,
        createdBy: testUserId,
        createdAt: now,
        updatedAt: now,
      });

      // Insert subtasks
      await db.insert(schema.workItemSubtasks).values([
        {
          id: 'subtask-1',
          workItemId,
          title: 'Subtask 1',
          isCompleted: false,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'subtask-2',
          workItemId,
          title: 'Subtask 2',
          isCompleted: false,
          sortOrder: 1,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      // Verify subtasks exist
      let subtasks = await db
        .select()
        .from(schema.workItemSubtasks)
        .where(eq(schema.workItemSubtasks.workItemId, workItemId));
      expect(subtasks).toHaveLength(2);

      // Delete work item
      await db.delete(schema.workItems).where(eq(schema.workItems.id, workItemId));

      // Verify subtasks are CASCADE deleted
      subtasks = await db
        .select()
        .from(schema.workItemSubtasks)
        .where(eq(schema.workItemSubtasks.workItemId, workItemId));
      expect(subtasks).toHaveLength(0);
    });

    it('UAT-3.1-12: deleting a work item cascades to tag associations', async () => {
      const now = new Date().toISOString();
      const workItemId = 'work-item-3';

      // Insert work item
      await db.insert(schema.workItems).values({
        id: workItemId,
        title: 'Test Work Item',
        description: null,
        status: 'not_started',
        startDate: null,
        endDate: null,
        durationDays: null,
        startAfter: null,
        startBefore: null,
        assignedUserId: null,
        createdBy: testUserId,
        createdAt: now,
        updatedAt: now,
      });

      // Insert tags
      await db.insert(schema.tags).values([
        { id: 'tag-1', name: 'Tag 1', color: '#ff0000', createdAt: now },
        { id: 'tag-2', name: 'Tag 2', color: '#00ff00', createdAt: now },
      ]);

      // Insert tag associations
      await db.insert(schema.workItemTags).values([
        { workItemId, tagId: 'tag-1' },
        { workItemId, tagId: 'tag-2' },
      ]);

      // Verify associations exist
      let associations = await db
        .select()
        .from(schema.workItemTags)
        .where(eq(schema.workItemTags.workItemId, workItemId));
      expect(associations).toHaveLength(2);

      // Delete work item
      await db.delete(schema.workItems).where(eq(schema.workItems.id, workItemId));

      // Verify associations are CASCADE deleted
      associations = await db
        .select()
        .from(schema.workItemTags)
        .where(eq(schema.workItemTags.workItemId, workItemId));
      expect(associations).toHaveLength(0);

      // Verify tags themselves are NOT deleted
      const tags = await db.select().from(schema.tags);
      expect(tags).toHaveLength(2);
    });

    it('UAT-3.1-13: deleting a work item cascades to dependencies', async () => {
      const now = new Date().toISOString();

      // Insert work items
      await db.insert(schema.workItems).values([
        {
          id: 'work-item-a',
          title: 'Work Item A',
          description: null,
          status: 'not_started',
          startDate: null,
          endDate: null,
          durationDays: null,
          startAfter: null,
          startBefore: null,
          assignedUserId: null,
          createdBy: testUserId,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'work-item-b',
          title: 'Work Item B',
          description: null,
          status: 'not_started',
          startDate: null,
          endDate: null,
          durationDays: null,
          startAfter: null,
          startBefore: null,
          assignedUserId: null,
          createdBy: testUserId,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'work-item-c',
          title: 'Work Item C',
          description: null,
          status: 'not_started',
          startDate: null,
          endDate: null,
          durationDays: null,
          startAfter: null,
          startBefore: null,
          assignedUserId: null,
          createdBy: testUserId,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      // Insert dependencies: A -> B -> C
      await db.insert(schema.workItemDependencies).values([
        {
          predecessorId: 'work-item-a',
          successorId: 'work-item-b',
          dependencyType: 'finish_to_start',
        },
        {
          predecessorId: 'work-item-b',
          successorId: 'work-item-c',
          dependencyType: 'finish_to_start',
        },
      ]);

      // Verify dependencies exist
      let dependencies = await db.select().from(schema.workItemDependencies);
      expect(dependencies).toHaveLength(2);

      // Delete work item B (which is both predecessor and successor)
      await db.delete(schema.workItems).where(eq(schema.workItems.id, 'work-item-b'));

      // Verify both dependencies involving B are CASCADE deleted
      dependencies = await db.select().from(schema.workItemDependencies);
      expect(dependencies).toHaveLength(0);

      // Verify work items A and C are NOT deleted
      const workItems = await db.select().from(schema.workItems);
      expect(workItems).toHaveLength(2);
      expect(workItems.map((wi) => wi.id).sort()).toEqual(['work-item-a', 'work-item-c']);
    });

    it('UAT-3.1-14: deleting a user sets assigned_user_id to NULL', async () => {
      const now = new Date().toISOString();
      const assignedUserId = 'user-assigned-1';

      // Create assigned user
      await db.insert(schema.users).values({
        id: assignedUserId,
        email: 'assigned@example.com',
        displayName: 'Assigned User',
        role: 'member',
        authProvider: 'local',
        passwordHash: '$2b$10$hash',
        oidcSubject: null,
        deactivatedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      // Insert work item assigned to this user
      await db.insert(schema.workItems).values({
        id: 'work-item-4',
        title: 'Assigned Work Item',
        description: null,
        status: 'in_progress',
        startDate: null,
        endDate: null,
        durationDays: null,
        startAfter: null,
        startBefore: null,
        assignedUserId,
        createdBy: testUserId,
        createdAt: now,
        updatedAt: now,
      });

      // Verify work item is assigned
      let workItems = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, 'work-item-4'));
      expect(workItems[0].assignedUserId).toBe(assignedUserId);

      // Delete the assigned user
      await db.delete(schema.users).where(eq(schema.users.id, assignedUserId));

      // Verify assigned_user_id is SET NULL
      workItems = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, 'work-item-4'));
      expect(workItems).toHaveLength(1);
      expect(workItems[0].assignedUserId).toBeNull();
    });

    it('UAT-3.1-15: deleting a user sets created_by to NULL', async () => {
      const now = new Date().toISOString();
      const noteAuthorId = 'user-note-author-1';

      // Create note author user
      await db.insert(schema.users).values({
        id: noteAuthorId,
        email: 'noteauthor@example.com',
        displayName: 'Note Author',
        role: 'member',
        authProvider: 'local',
        passwordHash: '$2b$10$hash',
        oidcSubject: null,
        deactivatedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      // Insert work item
      await db.insert(schema.workItems).values({
        id: 'work-item-5',
        title: 'Work Item with Notes',
        description: null,
        status: 'not_started',
        startDate: null,
        endDate: null,
        durationDays: null,
        startAfter: null,
        startBefore: null,
        assignedUserId: null,
        createdBy: testUserId,
        createdAt: now,
        updatedAt: now,
      });

      // Insert note created by this user
      await db.insert(schema.workItemNotes).values({
        id: 'note-3',
        workItemId: 'work-item-5',
        content: 'Note by author',
        createdBy: noteAuthorId,
        createdAt: now,
        updatedAt: now,
      });

      // Verify note exists with author
      const notesBefore = await db
        .select()
        .from(schema.workItemNotes)
        .where(eq(schema.workItemNotes.id, 'note-3'));
      expect(notesBefore[0].createdBy).toBe(noteAuthorId);

      // Delete the note author - should succeed and set created_by to NULL
      await db.delete(schema.users).where(eq(schema.users.id, noteAuthorId));

      // Verify note still exists but created_by is now NULL
      const notesAfter = await db
        .select()
        .from(schema.workItemNotes)
        .where(eq(schema.workItemNotes.id, 'note-3'));
      expect(notesAfter).toHaveLength(1);
      expect(notesAfter[0].createdBy).toBeNull();
    });

    it('UAT-3.1-16: deleting a tag cascades to work_item_tags', async () => {
      const now = new Date().toISOString();

      // Insert work items
      await db.insert(schema.workItems).values([
        {
          id: 'work-item-6',
          title: 'Work Item 6',
          description: null,
          status: 'not_started',
          startDate: null,
          endDate: null,
          durationDays: null,
          startAfter: null,
          startBefore: null,
          assignedUserId: null,
          createdBy: testUserId,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'work-item-7',
          title: 'Work Item 7',
          description: null,
          status: 'not_started',
          startDate: null,
          endDate: null,
          durationDays: null,
          startAfter: null,
          startBefore: null,
          assignedUserId: null,
          createdBy: testUserId,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      // Insert tag
      await db.insert(schema.tags).values({
        id: 'tag-3',
        name: 'Tag to Delete',
        color: '#0000ff',
        createdAt: now,
      });

      // Associate tag with both work items
      await db.insert(schema.workItemTags).values([
        { workItemId: 'work-item-6', tagId: 'tag-3' },
        { workItemId: 'work-item-7', tagId: 'tag-3' },
      ]);

      // Verify associations exist
      let associations = await db
        .select()
        .from(schema.workItemTags)
        .where(eq(schema.workItemTags.tagId, 'tag-3'));
      expect(associations).toHaveLength(2);

      // Delete the tag
      await db.delete(schema.tags).where(eq(schema.tags.id, 'tag-3'));

      // Verify associations are CASCADE deleted
      associations = await db
        .select()
        .from(schema.workItemTags)
        .where(eq(schema.workItemTags.tagId, 'tag-3'));
      expect(associations).toHaveLength(0);

      // Verify work items themselves are NOT deleted
      const workItems = await db.select().from(schema.workItems);
      expect(workItems.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Check Constraints', () => {
    let testUserId: string;

    beforeEach(async () => {
      // Create a test user for foreign key references
      const now = new Date().toISOString();
      testUserId = 'user-constraint-test';

      await db.insert(schema.users).values({
        id: testUserId,
        email: 'constraint@example.com',
        displayName: 'Constraint Test User',
        role: 'admin',
        authProvider: 'local',
        passwordHash: '$2b$10$hash',
        oidcSubject: null,
        deactivatedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    });

    it('UAT-3.1-17: status CHECK constraint rejects invalid values', () => {
      const now = new Date().toISOString();

      // Attempt to insert work item with invalid status using raw SQL
      let error: Error | undefined;
      try {
        sqlite
          .prepare(
            `INSERT INTO work_items (id, title, status, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            'work-item-invalid-status',
            'Test Work Item',
            'invalid_status',
            testUserId,
            now,
            now,
          );
      } catch (err) {
        error = err as Error;
      }

      expect(error).toBeDefined();
      expect(error?.message).toMatch(/CHECK constraint failed/);
    });

    it('UAT-3.1-18: status CHECK constraint accepts valid values', async () => {
      const now = new Date().toISOString();

      // Insert work items with all valid status values
      await db.insert(schema.workItems).values([
        {
          id: 'work-item-not-started',
          title: 'Not Started',
          description: null,
          status: 'not_started',
          startDate: null,
          endDate: null,
          durationDays: null,
          startAfter: null,
          startBefore: null,
          assignedUserId: null,
          createdBy: testUserId,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'work-item-in-progress',
          title: 'In Progress',
          description: null,
          status: 'in_progress',
          startDate: null,
          endDate: null,
          durationDays: null,
          startAfter: null,
          startBefore: null,
          assignedUserId: null,
          createdBy: testUserId,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'work-item-completed',
          title: 'Completed',
          description: null,
          status: 'completed',
          startDate: null,
          endDate: null,
          durationDays: null,
          startAfter: null,
          startBefore: null,
          assignedUserId: null,
          createdBy: testUserId,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'work-item-blocked',
          title: 'Blocked',
          description: null,
          status: 'blocked',
          startDate: null,
          endDate: null,
          durationDays: null,
          startAfter: null,
          startBefore: null,
          assignedUserId: null,
          createdBy: testUserId,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      // Verify all inserts succeeded
      const workItems = await db.select().from(schema.workItems);
      expect(workItems.length).toBeGreaterThanOrEqual(4);
    });

    it('UAT-3.1-19: dependency type CHECK constraint rejects invalid values', async () => {
      const now = new Date().toISOString();

      // Insert work items
      await db.insert(schema.workItems).values([
        {
          id: 'work-item-dep-a',
          title: 'Work Item A',
          description: null,
          status: 'not_started',
          startDate: null,
          endDate: null,
          durationDays: null,
          startAfter: null,
          startBefore: null,
          assignedUserId: null,
          createdBy: testUserId,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'work-item-dep-b',
          title: 'Work Item B',
          description: null,
          status: 'not_started',
          startDate: null,
          endDate: null,
          durationDays: null,
          startAfter: null,
          startBefore: null,
          assignedUserId: null,
          createdBy: testUserId,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      // Attempt to insert dependency with invalid type using raw SQL
      let error: Error | undefined;
      try {
        sqlite
          .prepare(
            `INSERT INTO work_item_dependencies (predecessor_id, successor_id, dependency_type)
             VALUES (?, ?, ?)`,
          )
          .run('work-item-dep-a', 'work-item-dep-b', 'invalid_type');
      } catch (err) {
        error = err as Error;
      }

      expect(error).toBeDefined();
      expect(error?.message).toMatch(/CHECK constraint failed/);
    });

    it('UAT-3.1-20: dependency type CHECK constraint accepts valid values', async () => {
      const now = new Date().toISOString();

      // Insert work items
      await db.insert(schema.workItems).values([
        {
          id: 'work-item-dep-1',
          title: 'Work Item 1',
          description: null,
          status: 'not_started',
          startDate: null,
          endDate: null,
          durationDays: null,
          startAfter: null,
          startBefore: null,
          assignedUserId: null,
          createdBy: testUserId,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'work-item-dep-2',
          title: 'Work Item 2',
          description: null,
          status: 'not_started',
          startDate: null,
          endDate: null,
          durationDays: null,
          startAfter: null,
          startBefore: null,
          assignedUserId: null,
          createdBy: testUserId,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'work-item-dep-3',
          title: 'Work Item 3',
          description: null,
          status: 'not_started',
          startDate: null,
          endDate: null,
          durationDays: null,
          startAfter: null,
          startBefore: null,
          assignedUserId: null,
          createdBy: testUserId,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'work-item-dep-4',
          title: 'Work Item 4',
          description: null,
          status: 'not_started',
          startDate: null,
          endDate: null,
          durationDays: null,
          startAfter: null,
          startBefore: null,
          assignedUserId: null,
          createdBy: testUserId,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'work-item-dep-5',
          title: 'Work Item 5',
          description: null,
          status: 'not_started',
          startDate: null,
          endDate: null,
          durationDays: null,
          startAfter: null,
          startBefore: null,
          assignedUserId: null,
          createdBy: testUserId,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      // Insert dependencies with all valid types
      await db.insert(schema.workItemDependencies).values([
        {
          predecessorId: 'work-item-dep-1',
          successorId: 'work-item-dep-2',
          dependencyType: 'finish_to_start',
        },
        {
          predecessorId: 'work-item-dep-2',
          successorId: 'work-item-dep-3',
          dependencyType: 'start_to_start',
        },
        {
          predecessorId: 'work-item-dep-3',
          successorId: 'work-item-dep-4',
          dependencyType: 'finish_to_finish',
        },
        {
          predecessorId: 'work-item-dep-4',
          successorId: 'work-item-dep-5',
          dependencyType: 'start_to_finish',
        },
      ]);

      // Verify all inserts succeeded
      const dependencies = await db.select().from(schema.workItemDependencies);
      expect(dependencies.length).toBeGreaterThanOrEqual(4);
    });

    it('UAT-3.1-21: self-reference CHECK constraint prevents loops', async () => {
      const now = new Date().toISOString();

      // Insert work item
      await db.insert(schema.workItems).values({
        id: 'work-item-self-ref',
        title: 'Work Item',
        description: null,
        status: 'not_started',
        startDate: null,
        endDate: null,
        durationDays: null,
        startAfter: null,
        startBefore: null,
        assignedUserId: null,
        createdBy: testUserId,
        createdAt: now,
        updatedAt: now,
      });

      // Attempt to create self-referential dependency using raw SQL
      let error: Error | undefined;
      try {
        sqlite
          .prepare(
            `INSERT INTO work_item_dependencies (predecessor_id, successor_id, dependency_type)
             VALUES (?, ?, ?)`,
          )
          .run('work-item-self-ref', 'work-item-self-ref', 'finish_to_start');
      } catch (err) {
        error = err as Error;
      }

      expect(error).toBeDefined();
      expect(error?.message).toMatch(/CHECK constraint failed/);
    });
  });

  describe('Unique Constraints', () => {
    it('enforces tag name uniqueness', async () => {
      const now = new Date().toISOString();

      // Insert first tag
      await db.insert(schema.tags).values({
        id: 'tag-unique-1',
        name: 'Unique Tag Name',
        color: '#ff0000',
        createdAt: now,
      });

      // Attempt to insert second tag with same name
      let error: Error | undefined;
      try {
        await db.insert(schema.tags).values({
          id: 'tag-unique-2',
          name: 'Unique Tag Name',
          color: '#00ff00',
          createdAt: now,
        });
      } catch (err) {
        error = err as Error;
      }

      expect(error).toBeDefined();
      expect(error?.message).toMatch(/UNIQUE constraint failed/);
    });

    it('allows duplicate work item titles (no uniqueness constraint)', async () => {
      const now = new Date().toISOString();
      const userId = 'user-dup-title-test';

      // Create test user
      await db.insert(schema.users).values({
        id: userId,
        email: 'duptitle@example.com',
        displayName: 'Dup Title Test User',
        role: 'admin',
        authProvider: 'local',
        passwordHash: '$2b$10$hash',
        oidcSubject: null,
        deactivatedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      // Insert two work items with the same title (should succeed)
      await db.insert(schema.workItems).values([
        {
          id: 'work-item-dup-1',
          title: 'Duplicate Title',
          description: null,
          status: 'not_started',
          startDate: null,
          endDate: null,
          durationDays: null,
          startAfter: null,
          startBefore: null,
          assignedUserId: null,
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'work-item-dup-2',
          title: 'Duplicate Title',
          description: null,
          status: 'not_started',
          startDate: null,
          endDate: null,
          durationDays: null,
          startAfter: null,
          startBefore: null,
          assignedUserId: null,
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      // Verify both inserts succeeded
      const workItems = await db.select().from(schema.workItems);
      const duplicateTitles = workItems.filter((wi) => wi.title === 'Duplicate Title');
      expect(duplicateTitles).toHaveLength(2);
    });
  });

  describe('Data Insertion via Drizzle ORM', () => {
    let testUserId: string;

    beforeEach(async () => {
      const now = new Date().toISOString();
      testUserId = 'user-insert-test';

      await db.insert(schema.users).values({
        id: testUserId,
        email: 'insert@example.com',
        displayName: 'Insert Test User',
        role: 'admin',
        authProvider: 'local',
        passwordHash: '$2b$10$hash',
        oidcSubject: null,
        deactivatedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    });

    it('can insert a work item with all fields', async () => {
      const now = new Date().toISOString();
      const workItemId = 'work-item-full';

      await db.insert(schema.workItems).values({
        id: workItemId,
        title: 'Complete Work Item',
        description: 'Full description text',
        status: 'in_progress',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        durationDays: 30,
        startAfter: '2023-12-15',
        startBefore: '2024-01-05',
        assignedUserId: testUserId,
        createdBy: testUserId,
        createdAt: now,
        updatedAt: now,
      });

      const workItems = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, workItemId));
      expect(workItems).toHaveLength(1);
      expect(workItems[0].title).toBe('Complete Work Item');
      expect(workItems[0].description).toBe('Full description text');
      expect(workItems[0].status).toBe('in_progress');
      expect(workItems[0].startDate).toBe('2024-01-01');
      expect(workItems[0].endDate).toBe('2024-01-31');
      expect(workItems[0].durationDays).toBe(30);
      expect(workItems[0].startAfter).toBe('2023-12-15');
      expect(workItems[0].startBefore).toBe('2024-01-05');
      expect(workItems[0].assignedUserId).toBe(testUserId);
      expect(workItems[0].createdBy).toBe(testUserId);
    });

    it('can insert a minimal work item with only required fields', async () => {
      const now = new Date().toISOString();
      const workItemId = 'work-item-minimal';

      await db.insert(schema.workItems).values({
        id: workItemId,
        title: 'Minimal Work Item',
        description: null,
        status: 'not_started',
        startDate: null,
        endDate: null,
        durationDays: null,
        startAfter: null,
        startBefore: null,
        assignedUserId: null,
        createdBy: testUserId,
        createdAt: now,
        updatedAt: now,
      });

      const workItems = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, workItemId));
      expect(workItems).toHaveLength(1);
      expect(workItems[0].title).toBe('Minimal Work Item');
      expect(workItems[0].description).toBeNull();
      expect(workItems[0].status).toBe('not_started');
      expect(workItems[0].assignedUserId).toBeNull();
    });

    it('can insert a tag', async () => {
      const now = new Date().toISOString();
      const tagId = 'tag-insert-test';

      await db.insert(schema.tags).values({
        id: tagId,
        name: 'Test Tag',
        color: '#ff5733',
        createdAt: now,
      });

      const tags = await db.select().from(schema.tags).where(eq(schema.tags.id, tagId));
      expect(tags).toHaveLength(1);
      expect(tags[0].name).toBe('Test Tag');
      expect(tags[0].color).toBe('#ff5733');
    });

    it('can associate tags with work items', async () => {
      const now = new Date().toISOString();
      const workItemId = 'work-item-with-tags';
      const tagIds = ['tag-1', 'tag-2', 'tag-3'];

      // Insert work item
      await db.insert(schema.workItems).values({
        id: workItemId,
        title: 'Work Item with Tags',
        description: null,
        status: 'not_started',
        startDate: null,
        endDate: null,
        durationDays: null,
        startAfter: null,
        startBefore: null,
        assignedUserId: null,
        createdBy: testUserId,
        createdAt: now,
        updatedAt: now,
      });

      // Insert tags
      for (const tagId of tagIds) {
        await db.insert(schema.tags).values({
          id: tagId,
          name: `Tag ${tagId}`,
          color: null,
          createdAt: now,
        });
      }

      // Associate tags
      for (const tagId of tagIds) {
        await db.insert(schema.workItemTags).values({
          workItemId,
          tagId,
        });
      }

      // Verify associations
      const associations = await db
        .select()
        .from(schema.workItemTags)
        .where(eq(schema.workItemTags.workItemId, workItemId));

      expect(associations).toHaveLength(3);
      expect(associations.map((a) => a.tagId).sort()).toEqual(tagIds);
    });

    it('can insert notes on a work item', async () => {
      const now = new Date().toISOString();
      const workItemId = 'work-item-with-notes';

      // Insert work item
      await db.insert(schema.workItems).values({
        id: workItemId,
        title: 'Work Item with Notes',
        description: null,
        status: 'not_started',
        startDate: null,
        endDate: null,
        durationDays: null,
        startAfter: null,
        startBefore: null,
        assignedUserId: null,
        createdBy: testUserId,
        createdAt: now,
        updatedAt: now,
      });

      // Insert notes
      await db.insert(schema.workItemNotes).values([
        {
          id: 'note-a',
          workItemId,
          content: 'First note',
          createdBy: testUserId,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'note-b',
          workItemId,
          content: 'Second note',
          createdBy: testUserId,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      // Verify notes
      const notes = await db
        .select()
        .from(schema.workItemNotes)
        .where(eq(schema.workItemNotes.workItemId, workItemId));

      expect(notes).toHaveLength(2);
      expect(notes.map((n) => n.content).sort()).toEqual(['First note', 'Second note']);
    });

    it('can insert subtasks on a work item', async () => {
      const now = new Date().toISOString();
      const workItemId = 'work-item-with-subtasks';

      // Insert work item
      await db.insert(schema.workItems).values({
        id: workItemId,
        title: 'Work Item with Subtasks',
        description: null,
        status: 'not_started',
        startDate: null,
        endDate: null,
        durationDays: null,
        startAfter: null,
        startBefore: null,
        assignedUserId: null,
        createdBy: testUserId,
        createdAt: now,
        updatedAt: now,
      });

      // Insert subtasks
      await db.insert(schema.workItemSubtasks).values([
        {
          id: 'subtask-a',
          workItemId,
          title: 'First subtask',
          isCompleted: false,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'subtask-b',
          workItemId,
          title: 'Second subtask',
          isCompleted: true,
          sortOrder: 1,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'subtask-c',
          workItemId,
          title: 'Third subtask',
          isCompleted: false,
          sortOrder: 2,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      // Verify subtasks
      const subtasks = await db
        .select()
        .from(schema.workItemSubtasks)
        .where(eq(schema.workItemSubtasks.workItemId, workItemId));

      expect(subtasks).toHaveLength(3);
      expect(subtasks.map((s) => s.sortOrder).sort()).toEqual([0, 1, 2]);
      expect(subtasks.find((s) => s.id === 'subtask-b')?.isCompleted).toBe(true);
    });

    it('can insert dependencies between work items', async () => {
      const now = new Date().toISOString();

      // Insert work items
      const workItemIds = ['work-item-x', 'work-item-y', 'work-item-z'];
      for (const id of workItemIds) {
        await db.insert(schema.workItems).values({
          id,
          title: `Work Item ${id}`,
          description: null,
          status: 'not_started',
          startDate: null,
          endDate: null,
          durationDays: null,
          startAfter: null,
          startBefore: null,
          assignedUserId: null,
          createdBy: testUserId,
          createdAt: now,
          updatedAt: now,
        });
      }

      // Insert dependencies: X -> Y -> Z
      await db.insert(schema.workItemDependencies).values([
        {
          predecessorId: 'work-item-x',
          successorId: 'work-item-y',
          dependencyType: 'finish_to_start',
        },
        {
          predecessorId: 'work-item-y',
          successorId: 'work-item-z',
          dependencyType: 'start_to_start',
        },
      ]);

      // Verify dependencies
      const dependencies = await db.select().from(schema.workItemDependencies);
      expect(dependencies.length).toBeGreaterThanOrEqual(2);

      const dep1 = dependencies.find(
        (d) => d.predecessorId === 'work-item-x' && d.successorId === 'work-item-y',
      );
      expect(dep1).toBeDefined();
      expect(dep1?.dependencyType).toBe('finish_to_start');

      const dep2 = dependencies.find(
        (d) => d.predecessorId === 'work-item-y' && d.successorId === 'work-item-z',
      );
      expect(dep2).toBeDefined();
      expect(dep2?.dependencyType).toBe('start_to_start');
    });
  });
});
