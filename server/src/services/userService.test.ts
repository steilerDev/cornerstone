import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as userService from './userService.js';

describe('User Service', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

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

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('toUserResponse()', () => {
    it('converts DB row to UserResponse (strips passwordHash and oidcSubject)', () => {
      // Given: A database user row with all fields including sensitive ones
      const dbRow: typeof schema.users.$inferSelect = {
        id: 'user-123',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'admin',
        authProvider: 'local',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hashedpassword',
        oidcSubject: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
        deactivatedAt: null,
      };

      // When: Converting to UserResponse
      const response = userService.toUserResponse(dbRow);

      // Then: Response contains all safe fields
      expect(response).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'admin',
        authProvider: 'local',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
        deactivatedAt: null,
      });

      // And: passwordHash is not included
      expect(response).not.toHaveProperty('passwordHash');

      // And: oidcSubject is not included
      expect(response).not.toHaveProperty('oidcSubject');
    });

    it('strips passwordHash from local auth user', () => {
      // Given: A local auth user with password hash
      const dbRow: typeof schema.users.$inferSelect = {
        id: 'local-user',
        email: 'local@example.com',
        displayName: 'Local User',
        role: 'member',
        authProvider: 'local',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
        oidcSubject: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        deactivatedAt: null,
      };

      // When: Converting to response
      const response = userService.toUserResponse(dbRow);

      // Then: passwordHash is not in response
      expect(response).not.toHaveProperty('passwordHash');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((response as any).passwordHash).toBeUndefined();
    });

    it('strips oidcSubject from OIDC auth user', () => {
      // Given: An OIDC auth user with oidcSubject
      const dbRow: typeof schema.users.$inferSelect = {
        id: 'oidc-user',
        email: 'oidc@example.com',
        displayName: 'OIDC User',
        role: 'member',
        authProvider: 'oidc',
        passwordHash: null,
        oidcSubject: 'oidc-provider-subject-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        deactivatedAt: null,
      };

      // When: Converting to response
      const response = userService.toUserResponse(dbRow);

      // Then: oidcSubject is not in response
      expect(response).not.toHaveProperty('oidcSubject');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((response as any).oidcSubject).toBeUndefined();
    });

    it('includes deactivatedAt when user is deactivated', () => {
      // Given: A deactivated user
      const dbRow: typeof schema.users.$inferSelect = {
        id: 'deactivated-user',
        email: 'deactivated@example.com',
        displayName: 'Deactivated User',
        role: 'member',
        authProvider: 'local',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hash',
        oidcSubject: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        deactivatedAt: '2024-06-01T10:00:00.000Z',
      };

      // When: Converting to response
      const response = userService.toUserResponse(dbRow);

      // Then: deactivatedAt is included
      expect(response.deactivatedAt).toBe('2024-06-01T10:00:00.000Z');
    });
  });

  describe('createLocalUser()', () => {
    it('creates user with hashed password (not plain text)', async () => {
      // Given: User details with plain text password
      const email = 'newuser@example.com';
      const displayName = 'New User';
      const password = 'MySecurePassword123';

      // When: Creating local user
      const user = await userService.createLocalUser(db, email, displayName, password);

      // Then: User is created
      expect(user).toBeDefined();
      expect(user.email).toBe(email);
      expect(user.displayName).toBe(displayName);
      expect(user.authProvider).toBe('local');

      // And: passwordHash is set and NOT equal to plain text password
      expect(user.passwordHash).toBeDefined();
      expect(user.passwordHash).not.toBe(password);

      // And: passwordHash is argon2 format
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it('defaults role to member when not specified', async () => {
      // Given: User details without role parameter
      const user = await userService.createLocalUser(
        db,
        'member@example.com',
        'Member User',
        'password123456',
      );

      // Then: Role defaults to member
      expect(user.role).toBe('member');
    });

    it('creates user with explicit admin role', async () => {
      // Given: User details with admin role
      const user = await userService.createLocalUser(
        db,
        'admin@example.com',
        'Admin User',
        'adminpassword123',
        'admin',
      );

      // Then: Role is admin
      expect(user.role).toBe('admin');
    });

    it('creates user with explicit member role', async () => {
      // Given: User details with explicit member role
      const user = await userService.createLocalUser(
        db,
        'member2@example.com',
        'Member Two',
        'memberpassword123',
        'member',
      );

      // Then: Role is member
      expect(user.role).toBe('member');
    });

    it('sets authProvider to local', async () => {
      // Given: User creation request
      const user = await userService.createLocalUser(
        db,
        'local@example.com',
        'Local',
        'password123456',
      );

      // Then: authProvider is local
      expect(user.authProvider).toBe('local');
    });

    it('sets oidcSubject to null for local users', async () => {
      // Given: Local user creation
      const user = await userService.createLocalUser(
        db,
        'local2@example.com',
        'Local Two',
        'password123456',
      );

      // Then: oidcSubject is null
      expect(user.oidcSubject).toBeNull();
    });

    it('generates unique UUID for user ID', async () => {
      // Given: Two users created
      const user1 = await userService.createLocalUser(
        db,
        'user1@example.com',
        'User One',
        'password123456',
      );
      const user2 = await userService.createLocalUser(
        db,
        'user2@example.com',
        'User Two',
        'password123456',
      );

      // Then: IDs are different UUIDs
      expect(user1.id).not.toBe(user2.id);
      expect(user1.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(user2.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('sets createdAt and updatedAt timestamps', async () => {
      // Given: User creation
      const user = await userService.createLocalUser(
        db,
        'timestamped@example.com',
        'Timestamped User',
        'password123456',
      );

      // Then: Timestamps are set in ISO format
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
      expect(user.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(user.updatedAt).toBe(user.createdAt);
    });

    it('sets deactivatedAt to null by default', async () => {
      // Given: User creation
      const user = await userService.createLocalUser(
        db,
        'active@example.com',
        'Active User',
        'password123456',
      );

      // Then: deactivatedAt is null
      expect(user.deactivatedAt).toBeNull();
    });

    it('returns the complete user row from database', async () => {
      // Given: User creation
      const user = await userService.createLocalUser(
        db,
        'complete@example.com',
        'Complete User',
        'password123456',
        'admin',
      );

      // Then: Returned object has all database columns
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
  });

  describe('verifyPassword()', () => {
    it('returns true for matching password', async () => {
      // Given: User with known password
      const password = 'MySecurePassword123';
      const user = await userService.createLocalUser(
        db,
        'verify@example.com',
        'Verify User',
        password,
      );

      // When: Verifying with correct password
      const isValid = await userService.verifyPassword(user.passwordHash!, password);

      // Then: Verification succeeds
      expect(isValid).toBe(true);
    });

    it('returns false for wrong password', async () => {
      // Given: User with known password
      const password = 'MySecurePassword123';
      const user = await userService.createLocalUser(
        db,
        'verify2@example.com',
        'Verify User Two',
        password,
      );

      // When: Verifying with incorrect password
      const isValid = await userService.verifyPassword(user.passwordHash!, 'WrongPassword456');

      // Then: Verification fails
      expect(isValid).toBe(false);
    });

    it('returns false for empty password against valid hash', async () => {
      // Given: User with password
      const user = await userService.createLocalUser(
        db,
        'verify3@example.com',
        'Verify User Three',
        'MySecurePassword123',
      );

      // When: Verifying with empty string
      const isValid = await userService.verifyPassword(user.passwordHash!, '');

      // Then: Verification fails
      expect(isValid).toBe(false);
    });

    it('handles different passwords for same user', async () => {
      // Given: User with password
      const correctPassword = 'CorrectPassword123';
      const user = await userService.createLocalUser(
        db,
        'verify4@example.com',
        'Verify User Four',
        correctPassword,
      );

      // When: Testing multiple wrong passwords
      const wrongPasswords = [
        'WrongPassword1',
        'DifferentPassword2',
        'AnotherWrong3',
        'correctpassword123', // Wrong case
        'CorrectPassword12', // Missing character
        'CorrectPassword1234', // Extra character
      ];

      // Then: All wrong passwords fail
      for (const wrong of wrongPasswords) {
        const isValid = await userService.verifyPassword(user.passwordHash!, wrong);
        expect(isValid).toBe(false);
      }

      // And: Correct password succeeds
      const correctIsValid = await userService.verifyPassword(user.passwordHash!, correctPassword);
      expect(correctIsValid).toBe(true);
    });
  });

  describe('findByEmail()', () => {
    it('returns user when email exists', async () => {
      // Given: User in database
      const email = 'find@example.com';
      const createdUser = await userService.createLocalUser(
        db,
        email,
        'Find User',
        'password123456',
      );

      // When: Finding by email
      const foundUser = userService.findByEmail(db, email);

      // Then: User is found
      expect(foundUser).toBeDefined();
      expect(foundUser?.id).toBe(createdUser.id);
      expect(foundUser?.email).toBe(email);
    });

    it('returns undefined when email does not exist', () => {
      // Given: Empty database (no users created)
      // When: Finding by non-existent email
      const foundUser = userService.findByEmail(db, 'nonexistent@example.com');

      // Then: No user is found
      expect(foundUser).toBeUndefined();
    });

    it('email lookup is case-sensitive', async () => {
      // Given: User with lowercase email
      await userService.createLocalUser(
        db,
        'lowercase@example.com',
        'Lowercase User',
        'password123456',
      );

      // When: Finding by uppercase email
      const foundUser = userService.findByEmail(db, 'LOWERCASE@EXAMPLE.COM');

      // Then: User is NOT found (case-sensitive)
      expect(foundUser).toBeUndefined();
    });

    it('returns complete user row including passwordHash', async () => {
      // Given: User in database
      const user = await userService.createLocalUser(
        db,
        'complete2@example.com',
        'Complete User Two',
        'password123456',
      );

      // When: Finding by email
      const foundUser = userService.findByEmail(db, 'complete2@example.com');

      // Then: Complete row is returned
      expect(foundUser).toBeDefined();
      expect(foundUser?.passwordHash).toBeDefined();
      expect(foundUser?.passwordHash).toBe(user.passwordHash);
    });

    it('can find deactivated users', async () => {
      // Given: User created and then deactivated (via direct DB update)
      const email = 'deactivated2@example.com';
      const user = await userService.createLocalUser(
        db,
        email,
        'Deactivated Two',
        'password123456',
      );

      // Deactivate user
      db.update(schema.users)
        .set({ deactivatedAt: new Date().toISOString() })
        .where(eq(schema.users.id, user.id))
        .run();

      // When: Finding by email
      const foundUser = userService.findByEmail(db, email);

      // Then: User is still found
      expect(foundUser).toBeDefined();
      expect(foundUser?.deactivatedAt).not.toBeNull();
    });
  });

  describe('countUsers()', () => {
    it('returns 0 for empty database', () => {
      // Given: Empty database (no users created)
      // When: Counting users
      const count = userService.countUsers(db);

      // Then: Count is 0
      expect(count).toBe(0);
    });

    it('returns correct count after inserting users', async () => {
      // Given: Three users in database
      await userService.createLocalUser(db, 'user1@example.com', 'User One', 'password123456');
      await userService.createLocalUser(db, 'user2@example.com', 'User Two', 'password123456');
      await userService.createLocalUser(db, 'user3@example.com', 'User Three', 'password123456');

      // When: Counting users
      const count = userService.countUsers(db);

      // Then: Count is 3
      expect(count).toBe(3);
    });

    it('includes deactivated users in count', async () => {
      // Given: Two active users and one deactivated user
      await userService.createLocalUser(db, 'active1@example.com', 'Active One', 'password123456');
      await userService.createLocalUser(db, 'active2@example.com', 'Active Two', 'password123456');

      const deactivatedUser = await userService.createLocalUser(
        db,
        'deactivated3@example.com',
        'Deactivated Three',
        'password123456',
      );

      // Deactivate one user
      db.update(schema.users)
        .set({ deactivatedAt: new Date().toISOString() })
        .where(eq(schema.users.id, deactivatedUser.id))
        .run();

      // When: Counting all users
      const count = userService.countUsers(db);

      // Then: Count includes deactivated user (3 total)
      expect(count).toBe(3);
    });

    it('increments count after each insert', async () => {
      // Given: Starting count
      expect(userService.countUsers(db)).toBe(0);

      // When: Inserting users one by one
      await userService.createLocalUser(db, 'user1@example.com', 'User One', 'password123456');
      expect(userService.countUsers(db)).toBe(1);

      await userService.createLocalUser(db, 'user2@example.com', 'User Two', 'password123456');
      expect(userService.countUsers(db)).toBe(2);

      await userService.createLocalUser(db, 'user3@example.com', 'User Three', 'password123456');
      expect(userService.countUsers(db)).toBe(3);
    });
  });

  describe('countActiveUsers()', () => {
    it('returns 0 for empty database', () => {
      // Given: Empty database
      // When: Counting active users
      const count = userService.countActiveUsers(db);

      // Then: Count is 0
      expect(count).toBe(0);
    });

    it('returns correct count of active users (excludes deactivated)', async () => {
      // Given: Three active users
      await userService.createLocalUser(db, 'active1@example.com', 'Active One', 'password123456');
      await userService.createLocalUser(db, 'active2@example.com', 'Active Two', 'password123456');
      await userService.createLocalUser(
        db,
        'active3@example.com',
        'Active Three',
        'password123456',
      );

      // When: Counting active users
      const count = userService.countActiveUsers(db);

      // Then: Count is 3
      expect(count).toBe(3);
    });

    it('excludes deactivated users from count', async () => {
      // Given: Two active users and two deactivated users
      await userService.createLocalUser(db, 'active1@example.com', 'Active One', 'password123456');
      await userService.createLocalUser(db, 'active2@example.com', 'Active Two', 'password123456');

      const deactivatedUser1 = await userService.createLocalUser(
        db,
        'deactivated1@example.com',
        'Deactivated One',
        'password123456',
      );
      const deactivatedUser2 = await userService.createLocalUser(
        db,
        'deactivated2@example.com',
        'Deactivated Two',
        'password123456',
      );

      // Deactivate two users
      db.update(schema.users)
        .set({ deactivatedAt: new Date().toISOString() })
        .where(eq(schema.users.id, deactivatedUser1.id))
        .run();
      db.update(schema.users)
        .set({ deactivatedAt: new Date().toISOString() })
        .where(eq(schema.users.id, deactivatedUser2.id))
        .run();

      // When: Counting active users
      const count = userService.countActiveUsers(db);

      // Then: Count is 2 (excludes deactivated)
      expect(count).toBe(2);
    });

    it('counts only users where deactivatedAt IS NULL', async () => {
      // Given: Mix of active and deactivated users
      await userService.createLocalUser(db, 'active@example.com', 'Active', 'password123456');

      const deactivatedUser = await userService.createLocalUser(
        db,
        'deactivated@example.com',
        'Deactivated',
        'password123456',
      );

      // Deactivate one user
      db.update(schema.users)
        .set({ deactivatedAt: '2024-06-01T10:00:00.000Z' })
        .where(eq(schema.users.id, deactivatedUser.id))
        .run();

      // When: Counting active users
      const activeCount = userService.countActiveUsers(db);
      const totalCount = userService.countUsers(db);

      // Then: Active count excludes deactivated user
      expect(activeCount).toBe(1);
      expect(totalCount).toBe(2);
    });
  });

  describe('findByOidcSubject()', () => {
    it('returns user when matching oidc_subject exists', () => {
      // Given: OIDC user in database
      const oidcSubject = 'oidc-provider-sub-123';
      const email = 'oidc@example.com';

      db.insert(schema.users)
        .values({
          id: 'oidc-user-1',
          email,
          displayName: 'OIDC User',
          role: 'member',
          authProvider: 'oidc',
          oidcSubject,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();

      // When: Finding by OIDC subject
      const foundUser = userService.findByOidcSubject(db, oidcSubject);

      // Then: User is found
      expect(foundUser).toBeDefined();
      expect(foundUser?.oidcSubject).toBe(oidcSubject);
      expect(foundUser?.email).toBe(email);
      expect(foundUser?.authProvider).toBe('oidc');
    });

    it('returns undefined when no match', () => {
      // Given: Empty database (no OIDC users)
      // When: Finding by non-existent OIDC subject
      const foundUser = userService.findByOidcSubject(db, 'nonexistent-oidc-sub');

      // Then: No user is found
      expect(foundUser).toBeUndefined();
    });

    it('does not match local users (auth_provider=local)', async () => {
      // Given: Local user in database (no oidcSubject)
      await userService.createLocalUser(db, 'local@example.com', 'Local User', 'password123456');

      // When: Finding by any OIDC subject
      const foundUser = userService.findByOidcSubject(db, 'any-oidc-sub');

      // Then: No user is found
      expect(foundUser).toBeUndefined();
    });

    it('only matches users with auth_provider=oidc', () => {
      // Given: OIDC user and local user in database
      const oidcSubject = 'oidc-sub-456';

      db.insert(schema.users)
        .values({
          id: 'oidc-user-2',
          email: 'oidc2@example.com',
          displayName: 'OIDC User Two',
          role: 'member',
          authProvider: 'oidc',
          oidcSubject,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();

      db.insert(schema.users)
        .values({
          id: 'local-user-2',
          email: 'local2@example.com',
          displayName: 'Local User Two',
          role: 'member',
          authProvider: 'local',
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hash',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();

      // When: Finding by OIDC subject
      const foundUser = userService.findByOidcSubject(db, oidcSubject);

      // Then: Only OIDC user is found
      expect(foundUser).toBeDefined();
      expect(foundUser?.authProvider).toBe('oidc');
      expect(foundUser?.id).toBe('oidc-user-2');
    });
  });

  describe('findOrCreateOidcUser()', () => {
    it('creates a new user when no matching OIDC user exists', () => {
      // Given: Empty database
      const sub = 'new-oidc-sub-123';
      const email = 'newoidc@example.com';
      const displayName = 'New OIDC User';

      // When: Finding or creating OIDC user
      const user = userService.findOrCreateOidcUser(db, sub, email, displayName);

      // Then: User is created
      expect(user).toBeDefined();
      expect(user.oidcSubject).toBe(sub);
      expect(user.email).toBe(email);
      expect(user.displayName).toBe(displayName);
      expect(user.authProvider).toBe('oidc');
      expect(user.role).toBe('member');
      expect(user.passwordHash).toBeNull();
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
      expect(user.deactivatedAt).toBeNull();
    });

    it('returns existing user when OIDC subject matches', () => {
      // Given: Existing OIDC user
      const sub = 'existing-oidc-sub';
      const email = 'existing@example.com';
      const displayName = 'Existing User';

      db.insert(schema.users)
        .values({
          id: 'existing-oidc-user',
          email,
          displayName,
          role: 'admin',
          authProvider: 'oidc',
          oidcSubject: sub,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        })
        .run();

      // When: Finding or creating with same OIDC subject
      const user = userService.findOrCreateOidcUser(
        db,
        sub,
        'different@example.com',
        'Different Name',
      );

      // Then: Existing user is returned (email and displayName not updated)
      expect(user).toBeDefined();
      expect(user.id).toBe('existing-oidc-user');
      expect(user.oidcSubject).toBe(sub);
      expect(user.email).toBe(email); // Original email
      expect(user.displayName).toBe(displayName); // Original displayName
      expect(user.role).toBe('admin'); // Original role
    });

    it('throws ConflictError when email is used by a different user (local)', async () => {
      // Given: Local user with email
      const email = 'conflict@example.com';
      await userService.createLocalUser(db, email, 'Local User', 'password123456');

      // When/Then: Creating OIDC user with same email throws
      expect(() => {
        userService.findOrCreateOidcUser(db, 'new-oidc-sub', email, 'OIDC User');
      }).toThrow(userService.ConflictError);

      expect(() => {
        userService.findOrCreateOidcUser(db, 'new-oidc-sub', email, 'OIDC User');
      }).toThrow('Email already in use by another account');
    });

    it('throws ConflictError when email is used by different OIDC user', () => {
      // Given: Existing OIDC user with email
      const email = 'oidc-conflict@example.com';

      db.insert(schema.users)
        .values({
          id: 'oidc-user-1',
          email,
          displayName: 'OIDC User One',
          role: 'member',
          authProvider: 'oidc',
          oidcSubject: 'oidc-sub-1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();

      // When/Then: Creating different OIDC user with same email throws
      expect(() => {
        userService.findOrCreateOidcUser(db, 'oidc-sub-2', email, 'OIDC User Two');
      }).toThrow(userService.ConflictError);
    });

    it('created user has correct defaults (role=member, authProvider=oidc)', () => {
      // Given: New OIDC user details
      const sub = 'default-test-sub';
      const email = 'defaults@example.com';
      const displayName = 'Defaults User';

      // When: Creating OIDC user
      const user = userService.findOrCreateOidcUser(db, sub, email, displayName);

      // Then: Defaults are applied
      expect(user.role).toBe('member');
      expect(user.authProvider).toBe('oidc');
      expect(user.passwordHash).toBeNull();
      expect(user.oidcSubject).toBe(sub);
      expect(user.deactivatedAt).toBeNull();
    });

    it('generated user ID is a valid UUID', () => {
      // Given: New OIDC user
      const user = userService.findOrCreateOidcUser(
        db,
        'uuid-test-sub',
        'uuid@example.com',
        'UUID User',
      );

      // Then: ID is a valid UUID
      expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('sets timestamps for newly created user', () => {
      // Given: New OIDC user
      const user = userService.findOrCreateOidcUser(
        db,
        'timestamp-test-sub',
        'timestamp@example.com',
        'Timestamp User',
      );

      // Then: Timestamps are set
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
      expect(user.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(user.updatedAt).toBe(user.createdAt);
    });
  });
});
