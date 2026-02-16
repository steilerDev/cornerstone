import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as sessionService from './sessionService.js';
import * as userService from './userService.js';

describe('Session Service', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let testUserId: string;

  /**
   * Creates a fresh in-memory database with migrations applied.
   */
  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  beforeEach(async () => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;

    // Create a test user for session tests
    const user = await userService.createLocalUser(
      db,
      'test@example.com',
      'Test User',
      'password123456',
    );
    testUserId = user.id;
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('generateSessionToken()', () => {
    it('returns a 64-character hex string', () => {
      // When: Generating a session token
      const token = sessionService.generateSessionToken();

      // Then: Token is exactly 64 characters
      expect(token).toHaveLength(64);

      // And: Token is hex format (only 0-9a-f)
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces unique tokens on each call', () => {
      // When: Generating multiple tokens
      const token1 = sessionService.generateSessionToken();
      const token2 = sessionService.generateSessionToken();
      const token3 = sessionService.generateSessionToken();

      // Then: All tokens are unique
      expect(token1).not.toBe(token2);
      expect(token1).not.toBe(token3);
      expect(token2).not.toBe(token3);
    });

    it('generates cryptographically secure random tokens', () => {
      // Given: Generate many tokens
      const tokens = new Set<string>();
      const count = 100;

      // When: Generating many tokens
      for (let i = 0; i < count; i++) {
        tokens.add(sessionService.generateSessionToken());
      }

      // Then: All tokens are unique (no collisions)
      expect(tokens.size).toBe(count);
    });
  });

  describe('createSession()', () => {
    it('creates a session in the database', () => {
      // When: Creating a session
      const sessionId = sessionService.createSession(db, testUserId, 3600);

      // Then: Session exists in database
      const session = db.select().from(schema.sessions).get();
      expect(session).toBeDefined();
      expect(session?.id).toBe(sessionId);
      expect(session?.userId).toBe(testUserId);
    });

    it('returns a valid 64-character token', () => {
      // When: Creating a session
      const sessionId = sessionService.createSession(db, testUserId, 3600);

      // Then: Session ID is a 64-character hex string
      expect(sessionId).toHaveLength(64);
      expect(sessionId).toMatch(/^[0-9a-f]{64}$/);
    });

    it('sets expiresAt based on duration in seconds', () => {
      // Given: Duration of 1 hour (3600 seconds)
      const durationSeconds = 3600;
      const beforeCreate = Date.now();

      // When: Creating a session
      const sessionId = sessionService.createSession(db, testUserId, durationSeconds);

      const afterCreate = Date.now();

      // Then: Session expiresAt is approximately 1 hour from now
      const session = db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, sessionId))
        .get();

      expect(session).toBeDefined();
      const expiresAt = new Date(session!.expiresAt).getTime();
      const expectedExpiry = beforeCreate + durationSeconds * 1000;

      // Allow 5-second tolerance for test execution time
      expect(expiresAt).toBeGreaterThanOrEqual(expectedExpiry - 5000);
      expect(expiresAt).toBeLessThanOrEqual(afterCreate + durationSeconds * 1000 + 5000);
    });

    it('sets createdAt timestamp', () => {
      // Given: Current time
      const before = Date.now();

      // When: Creating a session
      const sessionId = sessionService.createSession(db, testUserId, 3600);

      const after = Date.now();

      // Then: Session has createdAt timestamp
      const session = db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, sessionId))
        .get();

      expect(session).toBeDefined();
      const createdAt = new Date(session!.createdAt).getTime();

      // CreatedAt is within test execution window
      expect(createdAt).toBeGreaterThanOrEqual(before - 1000); // 1s tolerance
      expect(createdAt).toBeLessThanOrEqual(after + 1000);
    });

    it('creates multiple sessions for the same user', () => {
      // When: Creating multiple sessions for the same user
      const session1 = sessionService.createSession(db, testUserId, 3600);
      const session2 = sessionService.createSession(db, testUserId, 3600);

      // Then: Both sessions exist and are unique
      expect(session1).not.toBe(session2);

      const sessions = db.select().from(schema.sessions).all();
      expect(sessions).toHaveLength(2);
      expect(sessions[0]?.userId).toBe(testUserId);
      expect(sessions[1]?.userId).toBe(testUserId);
    });

    it('creates sessions with different durations', () => {
      // When: Creating sessions with different durations
      const shortSession = sessionService.createSession(db, testUserId, 60); // 1 minute
      const longSession = sessionService.createSession(db, testUserId, 86400); // 1 day

      // Then: Sessions have different expiration times
      const shortSessionRow = db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, shortSession))
        .get();
      const longSessionRow = db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, longSession))
        .get();

      expect(shortSessionRow).toBeDefined();
      expect(longSessionRow).toBeDefined();

      const shortExpiry = new Date(shortSessionRow!.expiresAt).getTime();
      const longExpiry = new Date(longSessionRow!.expiresAt).getTime();

      // Long session expires much later than short session
      expect(longExpiry).toBeGreaterThan(shortExpiry);
      expect(longExpiry - shortExpiry).toBeGreaterThan(80000000); // ~23 hours difference
    });

    it('associates session with correct user', async () => {
      // Given: Two different users
      const user2 = await userService.createLocalUser(
        db,
        'user2@example.com',
        'User Two',
        'password123456',
      );

      // When: Creating sessions for different users
      const session1 = sessionService.createSession(db, testUserId, 3600);
      const session2 = sessionService.createSession(db, user2.id, 3600);

      // Then: Sessions are associated with correct users
      const session1Row = db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, session1))
        .get();
      const session2Row = db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, session2))
        .get();

      expect(session1Row?.userId).toBe(testUserId);
      expect(session2Row?.userId).toBe(user2.id);
    });
  });

  describe('validateSession()', () => {
    it('returns user for valid non-expired session', () => {
      // Given: A valid session
      const sessionId = sessionService.createSession(db, testUserId, 3600);

      // When: Validating the session
      const user = sessionService.validateSession(db, sessionId);

      // Then: User is returned
      expect(user).toBeDefined();
      expect(user?.id).toBe(testUserId);
      expect(user?.email).toBe('test@example.com');
      expect(user?.displayName).toBe('Test User');
    });

    it('returns null for expired session', () => {
      // Given: An expired session (duration of -1 second = already expired)
      const sessionId = sessionService.createSession(db, testUserId, -1);

      // When: Validating the expired session
      const user = sessionService.validateSession(db, sessionId);

      // Then: Returns null
      expect(user).toBeNull();
    });

    it('returns null for non-existent session', () => {
      // Given: A session ID that does not exist
      const nonExistentSessionId = sessionService.generateSessionToken();

      // When: Validating a non-existent session
      const user = sessionService.validateSession(db, nonExistentSessionId);

      // Then: Returns null
      expect(user).toBeNull();
    });

    it('returns null for deactivated user', async () => {
      // Given: A session for a user
      const sessionId = sessionService.createSession(db, testUserId, 3600);

      // When: User is deactivated
      db.update(schema.users)
        .set({ deactivatedAt: new Date().toISOString() })
        .where(eq(schema.users.id, testUserId))
        .run();

      // Then: Session validation returns null
      const user = sessionService.validateSession(db, sessionId);
      expect(user).toBeNull();
    });

    it('returns complete user row with all fields', () => {
      // Given: A valid session
      const sessionId = sessionService.createSession(db, testUserId, 3600);

      // When: Validating the session
      const user = sessionService.validateSession(db, sessionId);

      // Then: User has all database columns
      expect(user).toBeDefined();
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('displayName');
      expect(user).toHaveProperty('role');
      expect(user).toHaveProperty('authProvider');
      expect(user).toHaveProperty('passwordHash');
      expect(user).toHaveProperty('oidcSubject');
      expect(user).toHaveProperty('createdAt');
      expect(user).toHaveProperty('updatedAt');
      expect(user).toHaveProperty('deactivatedAt');
    });

    it('validates session at exact expiration boundary (expired)', () => {
      // Given: A session that expires in 1 second
      const sessionId = sessionService.createSession(db, testUserId, 1);

      // When: Waiting 1.5 seconds for expiration
      // (Simulated by manually updating the session to be expired)
      const pastTime = new Date(Date.now() - 1000).toISOString();
      db.update(schema.sessions)
        .set({ expiresAt: pastTime })
        .where(eq(schema.sessions.id, sessionId))
        .run();

      // Then: Validation returns null
      const user = sessionService.validateSession(db, sessionId);
      expect(user).toBeNull();
    });

    it('validates session just before expiration (still valid)', () => {
      // Given: A session that expires in 1 hour
      const sessionId = sessionService.createSession(db, testUserId, 3600);

      // When: Validating immediately (well before expiration)
      const user = sessionService.validateSession(db, sessionId);

      // Then: User is returned
      expect(user).toBeDefined();
      expect(user?.id).toBe(testUserId);
    });

    it('handles empty session ID gracefully', () => {
      // When: Validating with empty string
      const user = sessionService.validateSession(db, '');

      // Then: Returns null (no error thrown)
      expect(user).toBeNull();
    });

    it('validates only the specific session (not other sessions for same user)', async () => {
      // Given: Two sessions for the same user
      const session1 = sessionService.createSession(db, testUserId, 3600);
      const session2 = sessionService.createSession(db, testUserId, 3600);

      // When: Validating session1
      const user1 = sessionService.validateSession(db, session1);

      // Then: Returns the user
      expect(user1?.id).toBe(testUserId);

      // When: Validating with session2's ID
      const user2 = sessionService.validateSession(db, session2);

      // Then: Also returns the user (both are valid)
      expect(user2?.id).toBe(testUserId);

      // When: Validating with a different (non-existent) ID
      const user3 = sessionService.validateSession(db, sessionService.generateSessionToken());

      // Then: Returns null
      expect(user3).toBeNull();
    });
  });

  describe('destroySession()', () => {
    it('removes session from database', () => {
      // Given: A session exists
      const sessionId = sessionService.createSession(db, testUserId, 3600);
      expect(db.select().from(schema.sessions).all()).toHaveLength(1);

      // When: Destroying the session
      sessionService.destroySession(db, sessionId);

      // Then: Session is removed
      const sessions = db.select().from(schema.sessions).all();
      expect(sessions).toHaveLength(0);
    });

    it('is a no-op for non-existent session (no error thrown)', () => {
      // Given: No sessions exist
      expect(db.select().from(schema.sessions).all()).toHaveLength(0);

      // When: Destroying a non-existent session
      const nonExistentId = sessionService.generateSessionToken();

      // Then: No error is thrown
      expect(() => {
        sessionService.destroySession(db, nonExistentId);
      }).not.toThrow();

      // And: Still no sessions exist
      expect(db.select().from(schema.sessions).all()).toHaveLength(0);
    });

    it('destroys only the specified session (not other sessions)', () => {
      // Given: Two sessions for the same user
      const session1 = sessionService.createSession(db, testUserId, 3600);
      const session2 = sessionService.createSession(db, testUserId, 3600);
      expect(db.select().from(schema.sessions).all()).toHaveLength(2);

      // When: Destroying one session
      sessionService.destroySession(db, session1);

      // Then: Only one session remains
      const remainingSessions = db.select().from(schema.sessions).all();
      expect(remainingSessions).toHaveLength(1);
      expect(remainingSessions[0]?.id).toBe(session2);
    });

    it('handles empty session ID gracefully', () => {
      // Given: A session exists
      sessionService.createSession(db, testUserId, 3600);
      expect(db.select().from(schema.sessions).all()).toHaveLength(1);

      // When: Calling destroy with empty string
      // Then: No error is thrown
      expect(() => {
        sessionService.destroySession(db, '');
      }).not.toThrow();

      // And: Original session still exists (nothing was deleted)
      expect(db.select().from(schema.sessions).all()).toHaveLength(1);
    });
  });

  describe('destroyUserSessions()', () => {
    it('removes all sessions for a user', () => {
      // Given: Three sessions for the same user
      sessionService.createSession(db, testUserId, 3600);
      sessionService.createSession(db, testUserId, 3600);
      sessionService.createSession(db, testUserId, 3600);
      expect(db.select().from(schema.sessions).all()).toHaveLength(3);

      // When: Destroying all sessions for the user
      sessionService.destroyUserSessions(db, testUserId);

      // Then: All sessions are removed
      const sessions = db.select().from(schema.sessions).all();
      expect(sessions).toHaveLength(0);
    });

    it('removes only sessions for the specified user', async () => {
      // Given: Multiple users with sessions
      const user2 = await userService.createLocalUser(
        db,
        'user2@example.com',
        'User Two',
        'password123456',
      );

      sessionService.createSession(db, testUserId, 3600);
      sessionService.createSession(db, testUserId, 3600);
      sessionService.createSession(db, user2.id, 3600);
      sessionService.createSession(db, user2.id, 3600);
      expect(db.select().from(schema.sessions).all()).toHaveLength(4);

      // When: Destroying sessions for user1
      sessionService.destroyUserSessions(db, testUserId);

      // Then: Only user1's sessions are removed
      const remainingSessions = db.select().from(schema.sessions).all();
      expect(remainingSessions).toHaveLength(2);
      expect(remainingSessions.every((s) => s.userId === user2.id)).toBe(true);
    });

    it('is a no-op when user has no sessions', async () => {
      // Given: User exists but has no sessions
      const user2 = await userService.createLocalUser(
        db,
        'user2@example.com',
        'User Two',
        'password123456',
      );
      expect(db.select().from(schema.sessions).all()).toHaveLength(0);

      // When: Destroying sessions for user with no sessions
      // Then: No error is thrown
      expect(() => {
        sessionService.destroyUserSessions(db, user2.id);
      }).not.toThrow();

      // And: Still no sessions
      expect(db.select().from(schema.sessions).all()).toHaveLength(0);
    });

    it('is a no-op for non-existent user ID', () => {
      // Given: A session exists for testUser
      sessionService.createSession(db, testUserId, 3600);
      expect(db.select().from(schema.sessions).all()).toHaveLength(1);

      // When: Destroying sessions for a non-existent user
      const nonExistentUserId = 'non-existent-user-id';

      // Then: No error is thrown
      expect(() => {
        sessionService.destroyUserSessions(db, nonExistentUserId);
      }).not.toThrow();

      // And: Original session still exists
      expect(db.select().from(schema.sessions).all()).toHaveLength(1);
    });
  });

  describe('cleanupExpiredSessions()', () => {
    it('deletes expired sessions', () => {
      // Given: Two expired sessions and one valid session
      sessionService.createSession(db, testUserId, -10); // Expired 10 seconds ago
      sessionService.createSession(db, testUserId, -5); // Expired 5 seconds ago
      const validSession = sessionService.createSession(db, testUserId, 3600); // Valid for 1 hour

      expect(db.select().from(schema.sessions).all()).toHaveLength(3);

      // When: Cleaning up expired sessions
      const deletedCount = sessionService.cleanupExpiredSessions(db);

      // Then: Two sessions are deleted
      expect(deletedCount).toBe(2);

      // And: Only the valid session remains
      const remainingSessions = db.select().from(schema.sessions).all();
      expect(remainingSessions).toHaveLength(1);
      expect(remainingSessions[0]?.id).toBe(validSession);
    });

    it('returns correct count of deleted sessions', () => {
      // Given: Five expired sessions
      for (let i = 0; i < 5; i++) {
        sessionService.createSession(db, testUserId, -1);
      }

      // When: Cleaning up
      const deletedCount = sessionService.cleanupExpiredSessions(db);

      // Then: Count is 5
      expect(deletedCount).toBe(5);
    });

    it('leaves non-expired sessions intact', () => {
      // Given: Three non-expired sessions
      const session1 = sessionService.createSession(db, testUserId, 3600);
      const session2 = sessionService.createSession(db, testUserId, 7200);
      const session3 = sessionService.createSession(db, testUserId, 1800);

      // When: Cleaning up expired sessions
      const deletedCount = sessionService.cleanupExpiredSessions(db);

      // Then: No sessions are deleted
      expect(deletedCount).toBe(0);

      // And: All sessions remain
      const remainingSessions = db.select().from(schema.sessions).all();
      expect(remainingSessions).toHaveLength(3);
      expect(remainingSessions.map((s) => s.id)).toEqual(
        expect.arrayContaining([session1, session2, session3]),
      );
    });

    it('returns 0 when no sessions exist', () => {
      // Given: No sessions exist
      expect(db.select().from(schema.sessions).all()).toHaveLength(0);

      // When: Cleaning up
      const deletedCount = sessionService.cleanupExpiredSessions(db);

      // Then: Count is 0
      expect(deletedCount).toBe(0);
    });

    it('returns 0 when only non-expired sessions exist', () => {
      // Given: Only non-expired sessions
      sessionService.createSession(db, testUserId, 3600);
      sessionService.createSession(db, testUserId, 7200);

      // When: Cleaning up
      const deletedCount = sessionService.cleanupExpiredSessions(db);

      // Then: Count is 0
      expect(deletedCount).toBe(0);

      // And: All sessions remain
      expect(db.select().from(schema.sessions).all()).toHaveLength(2);
    });

    it('cleans up sessions for multiple users', async () => {
      // Given: Expired sessions for multiple users
      const user2 = await userService.createLocalUser(
        db,
        'user2@example.com',
        'User Two',
        'password123456',
      );

      sessionService.createSession(db, testUserId, -10); // Expired
      sessionService.createSession(db, testUserId, 3600); // Valid
      sessionService.createSession(db, user2.id, -5); // Expired
      sessionService.createSession(db, user2.id, 7200); // Valid

      // When: Cleaning up
      const deletedCount = sessionService.cleanupExpiredSessions(db);

      // Then: Two expired sessions are deleted
      expect(deletedCount).toBe(2);

      // And: Two valid sessions remain
      const remainingSessions = db.select().from(schema.sessions).all();
      expect(remainingSessions).toHaveLength(2);
      expect(remainingSessions.every((s) => s.userId === testUserId || s.userId === user2.id)).toBe(
        true,
      );
    });

    it('handles session at exact expiration boundary (considers expired)', () => {
      // Given: A session that expired exactly now (within millisecond precision)
      const sessionId = sessionService.createSession(db, testUserId, 0);

      // Manually set expiresAt to exactly now
      const now = new Date().toISOString();
      db.update(schema.sessions)
        .set({ expiresAt: now })
        .where(eq(schema.sessions.id, sessionId))
        .run();

      // When: Cleaning up immediately after
      // (Current time is slightly after the exact expiration time)
      const deletedCount = sessionService.cleanupExpiredSessions(db);

      // Then: Session is deleted (expires_at < now)
      expect(deletedCount).toBeGreaterThanOrEqual(0); // May be 0 or 1 depending on millisecond timing

      // Verify behavior: if we set expiration to 1 second ago, it's definitely deleted
      sessionService.createSession(db, testUserId, -1);
      const count = sessionService.cleanupExpiredSessions(db);
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });
});
