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

  describe('updateDisplayName()', () => {
    it('updates display name and updatedAt timestamp', async () => {
      // Given: User in database
      const user = await userService.createLocalUser(
        db,
        'user@example.com',
        'Old Name',
        'password123456',
      );
      const originalUpdatedAt = user.updatedAt;

      // When: Updating display name
      const updatedUser = userService.updateDisplayName(db, user.id, 'New Name');

      // Then: Display name is updated
      expect(updatedUser.displayName).toBe('New Name');
      expect(updatedUser.id).toBe(user.id);
      expect(updatedUser.email).toBe(user.email);

      // And: updatedAt timestamp is newer
      expect(new Date(updatedUser.updatedAt).getTime()).toBeGreaterThan(
        new Date(originalUpdatedAt).getTime(),
      );
    });

    it('returns the updated user row', async () => {
      // Given: User in database
      const user = await userService.createLocalUser(
        db,
        'user@example.com',
        'Old Name',
        'password123456',
      );

      // When: Updating display name
      const updatedUser = userService.updateDisplayName(db, user.id, 'Updated Name');

      // Then: Returned user matches updated data
      expect(updatedUser).toBeDefined();
      expect(updatedUser.displayName).toBe('Updated Name');
      expect(updatedUser.id).toBe(user.id);
    });

    it('can be verified by re-reading user from DB', async () => {
      // Given: User in database
      const user = await userService.createLocalUser(
        db,
        'user@example.com',
        'Original Name',
        'password123456',
      );

      // When: Updating display name
      userService.updateDisplayName(db, user.id, 'Verified Name');

      // And: Re-reading from database
      const reloadedUser = db.select().from(schema.users).where(eq(schema.users.id, user.id)).get();

      // Then: Update is persisted
      expect(reloadedUser).toBeDefined();
      expect(reloadedUser?.displayName).toBe('Verified Name');
    });

    it('preserves other user fields (email, role, passwordHash)', async () => {
      // Given: User in database
      const user = await userService.createLocalUser(
        db,
        'preserve@example.com',
        'Original Name',
        'password123456',
        'admin',
      );

      // When: Updating display name
      const updatedUser = userService.updateDisplayName(db, user.id, 'New Name');

      // Then: Other fields are preserved
      expect(updatedUser.email).toBe('preserve@example.com');
      expect(updatedUser.role).toBe('admin');
      expect(updatedUser.passwordHash).toBe(user.passwordHash);
      expect(updatedUser.authProvider).toBe('local');
      expect(updatedUser.createdAt).toBe(user.createdAt);
    });

    it('works for OIDC users', () => {
      // Given: OIDC user
      const oidcSubject = 'oidc-sub-789';
      db.insert(schema.users)
        .values({
          id: 'oidc-user-3',
          email: 'oidc@example.com',
          displayName: 'Original OIDC Name',
          role: 'member',
          authProvider: 'oidc',
          oidcSubject,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();

      // When: Updating display name
      const updatedUser = userService.updateDisplayName(db, 'oidc-user-3', 'Updated OIDC Name');

      // Then: Display name is updated
      expect(updatedUser.displayName).toBe('Updated OIDC Name');
      expect(updatedUser.authProvider).toBe('oidc');
      expect(updatedUser.oidcSubject).toBe(oidcSubject);
    });

    it('handles special characters in display name', async () => {
      // Given: User in database
      const user = await userService.createLocalUser(
        db,
        'user@example.com',
        'Plain Name',
        'password123456',
      );

      // When: Updating with special characters
      const specialName = "O'Brien-Smith (Jr.) & Co.";
      const updatedUser = userService.updateDisplayName(db, user.id, specialName);

      // Then: Special characters are preserved
      expect(updatedUser.displayName).toBe(specialName);
    });
  });

  describe('updatePassword()', () => {
    it('updates passwordHash and updatedAt timestamp', async () => {
      // Given: User in database
      const user = await userService.createLocalUser(
        db,
        'user@example.com',
        'Test User',
        'oldpassword123',
      );
      const originalPasswordHash = user.passwordHash!;
      const originalUpdatedAt = user.updatedAt;

      // When: Updating password
      const newPasswordHash = (await userService.verifyPassword(
        originalPasswordHash,
        'oldpassword123',
      ))
        ? await import('argon2').then((argon2) => argon2.default.hash('newpassword123'))
        : '';
      userService.updatePassword(db, user.id, newPasswordHash);

      // Then: Password hash is updated in database
      const updatedUser = db.select().from(schema.users).where(eq(schema.users.id, user.id)).get();
      expect(updatedUser?.passwordHash).toBe(newPasswordHash);
      expect(updatedUser?.passwordHash).not.toBe(originalPasswordHash);

      // And: updatedAt timestamp is newer
      expect(new Date(updatedUser!.updatedAt).getTime()).toBeGreaterThan(
        new Date(originalUpdatedAt).getTime(),
      );
    });

    it('new hash can be verified with argon2.verify', async () => {
      // Given: User in database
      const user = await userService.createLocalUser(
        db,
        'user@example.com',
        'Test User',
        'oldpassword123',
      );

      // When: Updating password with new hash
      const argon2 = await import('argon2');
      const newPasswordHash = await argon2.default.hash('newpassword456');
      userService.updatePassword(db, user.id, newPasswordHash);

      // Then: New password can be verified
      const updatedUser = db.select().from(schema.users).where(eq(schema.users.id, user.id)).get();
      const isValid = await userService.verifyPassword(
        updatedUser!.passwordHash!,
        'newpassword456',
      );
      expect(isValid).toBe(true);

      // And: Old password no longer works
      const isOldValid = await userService.verifyPassword(
        updatedUser!.passwordHash!,
        'oldpassword123',
      );
      expect(isOldValid).toBe(false);
    });

    it('does not return a value (void)', async () => {
      // Given: User in database
      const user = await userService.createLocalUser(
        db,
        'user@example.com',
        'Test User',
        'password123456',
      );

      // When: Updating password
      const argon2 = await import('argon2');
      const newPasswordHash = await argon2.default.hash('newpassword789');
      const result = userService.updatePassword(db, user.id, newPasswordHash);

      // Then: Function returns undefined (void)
      expect(result).toBeUndefined();
    });

    it('preserves other user fields (email, displayName, role)', async () => {
      // Given: User in database
      const user = await userService.createLocalUser(
        db,
        'preserve@example.com',
        'Preserve User',
        'oldpassword123',
        'admin',
      );

      // When: Updating password
      const argon2 = await import('argon2');
      const newPasswordHash = await argon2.default.hash('newpassword999');
      userService.updatePassword(db, user.id, newPasswordHash);

      // Then: Other fields are preserved
      const updatedUser = db.select().from(schema.users).where(eq(schema.users.id, user.id)).get();
      expect(updatedUser?.email).toBe('preserve@example.com');
      expect(updatedUser?.displayName).toBe('Preserve User');
      expect(updatedUser?.role).toBe('admin');
      expect(updatedUser?.authProvider).toBe('local');
      expect(updatedUser?.createdAt).toBe(user.createdAt);
    });

    it('allows multiple password updates', async () => {
      // Given: User in database
      const user = await userService.createLocalUser(
        db,
        'user@example.com',
        'Test User',
        'password1',
      );
      const argon2 = await import('argon2');

      // When: Updating password multiple times
      const hash2 = await argon2.default.hash('password2');
      userService.updatePassword(db, user.id, hash2);

      const hash3 = await argon2.default.hash('password3');
      userService.updatePassword(db, user.id, hash3);

      // Then: Final password is the last one set
      const finalUser = db.select().from(schema.users).where(eq(schema.users.id, user.id)).get();
      const isValid = await userService.verifyPassword(finalUser!.passwordHash!, 'password3');
      expect(isValid).toBe(true);

      const isOldValid = await userService.verifyPassword(finalUser!.passwordHash!, 'password2');
      expect(isOldValid).toBe(false);
    });
  });

  describe('listUsers()', () => {
    it('returns all users when no search term provided', async () => {
      // Given: Multiple users in database
      await userService.createLocalUser(db, 'user1@example.com', 'User One', 'password123456');
      await userService.createLocalUser(db, 'user2@example.com', 'User Two', 'password123456');
      await userService.createLocalUser(db, 'user3@example.com', 'User Three', 'password123456');

      // When: Listing users without search
      const users = userService.listUsers(db);

      // Then: Returns all users
      expect(users).toHaveLength(3);
    });

    it('returns empty array when no users exist', () => {
      // Given: Empty database
      // When: Listing users
      const users = userService.listUsers(db);

      // Then: Returns empty array
      expect(users).toEqual([]);
    });

    it('filters by email (case-insensitive)', async () => {
      // Given: Users with different emails
      await userService.createLocalUser(db, 'alice@example.com', 'Alice', 'password123456');
      await userService.createLocalUser(db, 'bob@example.com', 'Bob', 'password123456');
      await userService.createLocalUser(db, 'charlie@example.com', 'Charlie', 'password123456');

      // When: Searching by email fragment (lowercase)
      const users = userService.listUsers(db, 'alice');

      // Then: Returns matching user
      expect(users).toHaveLength(1);
      expect(users[0].email).toBe('alice@example.com');
    });

    it('filters by displayName (case-insensitive)', async () => {
      // Given: Users with different display names
      await userService.createLocalUser(db, 'user1@example.com', 'John Smith', 'password123456');
      await userService.createLocalUser(db, 'user2@example.com', 'Jane Doe', 'password123456');
      await userService.createLocalUser(db, 'user3@example.com', 'John Doe', 'password123456');

      // When: Searching by display name fragment
      const users = userService.listUsers(db, 'john');

      // Then: Returns matching users
      expect(users.length).toBeGreaterThanOrEqual(2);
      users.forEach((user) => {
        expect(user.displayName.toLowerCase()).toContain('john');
      });
    });

    it('search is case-insensitive (uppercase query)', async () => {
      // Given: User with lowercase email
      await userService.createLocalUser(db, 'lowercase@example.com', 'User', 'password123456');

      // When: Searching with uppercase
      const users = userService.listUsers(db, 'LOWERCASE');

      // Then: Finds user
      expect(users).toHaveLength(1);
      expect(users[0].email).toBe('lowercase@example.com');
    });

    it('search is case-insensitive (mixed case query)', async () => {
      // Given: User with mixed case display name
      await userService.createLocalUser(db, 'user@example.com', 'CamelCase', 'password123456');

      // When: Searching with different case
      const users = userService.listUsers(db, 'camelcase');

      // Then: Finds user
      expect(users).toHaveLength(1);
      expect(users[0].displayName).toBe('CamelCase');
    });

    it('returns empty array when no matches found', async () => {
      // Given: Users in database
      await userService.createLocalUser(db, 'user@example.com', 'User', 'password123456');

      // When: Searching for non-existent term
      const users = userService.listUsers(db, 'nonexistent');

      // Then: Returns empty array
      expect(users).toEqual([]);
    });

    it('includes deactivated users in results', async () => {
      // Given: Active and deactivated users
      await userService.createLocalUser(db, 'active@example.com', 'Active', 'password123456');
      const deactivatedUser = await userService.createLocalUser(
        db,
        'deactivated@example.com',
        'Deactivated',
        'password123456',
      );

      // Deactivate one user
      db.update(schema.users)
        .set({ deactivatedAt: new Date().toISOString() })
        .where(eq(schema.users.id, deactivatedUser.id))
        .run();

      // When: Listing all users
      const users = userService.listUsers(db);

      // Then: Both users are included
      expect(users).toHaveLength(2);
    });

    it('returns complete user rows including passwordHash', async () => {
      // Given: User in database
      const user = await userService.createLocalUser(
        db,
        'user@example.com',
        'User',
        'password123456',
      );

      // When: Listing users
      const users = userService.listUsers(db);

      // Then: Returns complete rows with sensitive fields
      expect(users).toHaveLength(1);
      expect(users[0].passwordHash).toBeDefined();
      expect(users[0].passwordHash).toBe(user.passwordHash);
    });
  });

  describe('findById()', () => {
    it('returns user when ID exists', async () => {
      // Given: User in database
      const user = await userService.createLocalUser(
        db,
        'user@example.com',
        'User',
        'password123456',
      );

      // When: Finding by ID
      const foundUser = userService.findById(db, user.id);

      // Then: User is found
      expect(foundUser).toBeDefined();
      expect(foundUser?.id).toBe(user.id);
      expect(foundUser?.email).toBe(user.email);
    });

    it('returns undefined when ID does not exist', () => {
      // Given: Empty database
      // When: Finding by non-existent ID
      const foundUser = userService.findById(db, 'nonexistent-id');

      // Then: No user is found
      expect(foundUser).toBeUndefined();
    });

    it('returns complete user row including passwordHash', async () => {
      // Given: User in database
      const user = await userService.createLocalUser(
        db,
        'user@example.com',
        'User',
        'password123456',
      );

      // When: Finding by ID
      const foundUser = userService.findById(db, user.id);

      // Then: Complete row is returned
      expect(foundUser).toBeDefined();
      expect(foundUser?.passwordHash).toBeDefined();
      expect(foundUser?.passwordHash).toBe(user.passwordHash);
    });

    it('can find deactivated users', async () => {
      // Given: Deactivated user
      const user = await userService.createLocalUser(
        db,
        'user@example.com',
        'User',
        'password123456',
      );

      db.update(schema.users)
        .set({ deactivatedAt: new Date().toISOString() })
        .where(eq(schema.users.id, user.id))
        .run();

      // When: Finding by ID
      const foundUser = userService.findById(db, user.id);

      // Then: User is found
      expect(foundUser).toBeDefined();
      expect(foundUser?.deactivatedAt).not.toBeNull();
    });

    it('can find OIDC users', () => {
      // Given: OIDC user
      const oidcSubject = 'oidc-sub-123';
      db.insert(schema.users)
        .values({
          id: 'oidc-user',
          email: 'oidc@example.com',
          displayName: 'OIDC User',
          role: 'member',
          authProvider: 'oidc',
          oidcSubject,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();

      // When: Finding by ID
      const foundUser = userService.findById(db, 'oidc-user');

      // Then: User is found
      expect(foundUser).toBeDefined();
      expect(foundUser?.authProvider).toBe('oidc');
      expect(foundUser?.oidcSubject).toBe(oidcSubject);
    });
  });

  describe('countActiveAdmins()', () => {
    it('returns 0 for empty database', () => {
      // Given: Empty database
      // When: Counting active admins
      const count = userService.countActiveAdmins(db);

      // Then: Count is 0
      expect(count).toBe(0);
    });

    it('counts only users with role=admin', async () => {
      // Given: Mix of admins and members
      await userService.createLocalUser(
        db,
        'admin1@example.com',
        'Admin One',
        'password123456',
        'admin',
      );
      await userService.createLocalUser(
        db,
        'admin2@example.com',
        'Admin Two',
        'password123456',
        'admin',
      );
      await userService.createLocalUser(
        db,
        'member@example.com',
        'Member',
        'password123456',
        'member',
      );

      // When: Counting active admins
      const count = userService.countActiveAdmins(db);

      // Then: Count is 2 (only admins)
      expect(count).toBe(2);
    });

    it('excludes deactivated admins from count', async () => {
      // Given: Active and deactivated admins
      await userService.createLocalUser(
        db,
        'admin1@example.com',
        'Admin One',
        'password123456',
        'admin',
      );
      const deactivatedAdmin = await userService.createLocalUser(
        db,
        'admin2@example.com',
        'Admin Two',
        'password123456',
        'admin',
      );

      // Deactivate one admin
      db.update(schema.users)
        .set({ deactivatedAt: new Date().toISOString() })
        .where(eq(schema.users.id, deactivatedAdmin.id))
        .run();

      // When: Counting active admins
      const count = userService.countActiveAdmins(db);

      // Then: Count is 1 (excludes deactivated)
      expect(count).toBe(1);
    });

    it('excludes members from count', async () => {
      // Given: Admins and members
      await userService.createLocalUser(
        db,
        'admin@example.com',
        'Admin',
        'password123456',
        'admin',
      );
      await userService.createLocalUser(
        db,
        'member1@example.com',
        'Member One',
        'password123456',
        'member',
      );
      await userService.createLocalUser(
        db,
        'member2@example.com',
        'Member Two',
        'password123456',
        'member',
      );

      // When: Counting active admins
      const count = userService.countActiveAdmins(db);

      // Then: Count is 1 (only admin)
      expect(count).toBe(1);
    });

    it('counts correctly with multiple active admins', async () => {
      // Given: Three active admins
      await userService.createLocalUser(
        db,
        'admin1@example.com',
        'Admin One',
        'password123456',
        'admin',
      );
      await userService.createLocalUser(
        db,
        'admin2@example.com',
        'Admin Two',
        'password123456',
        'admin',
      );
      await userService.createLocalUser(
        db,
        'admin3@example.com',
        'Admin Three',
        'password123456',
        'admin',
      );

      // When: Counting active admins
      const count = userService.countActiveAdmins(db);

      // Then: Count is 3
      expect(count).toBe(3);
    });

    it('counts correctly after deactivating all admins', async () => {
      // Given: Two admins
      const admin1 = await userService.createLocalUser(
        db,
        'admin1@example.com',
        'Admin One',
        'password123456',
        'admin',
      );
      const admin2 = await userService.createLocalUser(
        db,
        'admin2@example.com',
        'Admin Two',
        'password123456',
        'admin',
      );

      // When: Deactivating both admins
      db.update(schema.users)
        .set({ deactivatedAt: new Date().toISOString() })
        .where(eq(schema.users.id, admin1.id))
        .run();
      db.update(schema.users)
        .set({ deactivatedAt: new Date().toISOString() })
        .where(eq(schema.users.id, admin2.id))
        .run();

      // Then: Count is 0
      const count = userService.countActiveAdmins(db);
      expect(count).toBe(0);
    });
  });

  describe('updateUserById()', () => {
    it('updates displayName successfully', async () => {
      // Given: User in database
      const user = await userService.createLocalUser(
        db,
        'user@example.com',
        'Old Name',
        'password123456',
      );

      // When: Updating display name
      const updatedUser = userService.updateUserById(db, user.id, { displayName: 'New Name' });

      // Then: Display name is updated
      expect(updatedUser.displayName).toBe('New Name');
      expect(updatedUser.id).toBe(user.id);
    });

    it('updates email successfully', async () => {
      // Given: User in database
      const user = await userService.createLocalUser(
        db,
        'old@example.com',
        'User',
        'password123456',
      );

      // When: Updating email
      const updatedUser = userService.updateUserById(db, user.id, { email: 'new@example.com' });

      // Then: Email is updated
      expect(updatedUser.email).toBe('new@example.com');
      expect(updatedUser.id).toBe(user.id);
    });

    it('updates role successfully', async () => {
      // Given: Member user
      const user = await userService.createLocalUser(
        db,
        'user@example.com',
        'User',
        'password123456',
        'member',
      );

      // When: Promoting to admin
      const updatedUser = userService.updateUserById(db, user.id, { role: 'admin' });

      // Then: Role is updated
      expect(updatedUser.role).toBe('admin');
    });

    it('updates multiple fields at once', async () => {
      // Given: User in database
      const user = await userService.createLocalUser(
        db,
        'old@example.com',
        'Old Name',
        'password123456',
        'member',
      );

      // When: Updating multiple fields
      const updatedUser = userService.updateUserById(db, user.id, {
        displayName: 'New Name',
        email: 'new@example.com',
        role: 'admin',
      });

      // Then: All fields are updated
      expect(updatedUser.displayName).toBe('New Name');
      expect(updatedUser.email).toBe('new@example.com');
      expect(updatedUser.role).toBe('admin');
    });

    it('throws ConflictError when email is already in use', async () => {
      // Given: Two users
      const user1 = await userService.createLocalUser(
        db,
        'user1@example.com',
        'User One',
        'password123456',
      );
      await userService.createLocalUser(db, 'user2@example.com', 'User Two', 'password123456');

      // When/Then: Attempting to change user1's email to user2's email throws
      expect(() => {
        userService.updateUserById(db, user1.id, { email: 'user2@example.com' });
      }).toThrow(userService.ConflictError);

      expect(() => {
        userService.updateUserById(db, user1.id, { email: 'user2@example.com' });
      }).toThrow('Email already in use');
    });

    it('allows updating email to same value (no conflict)', async () => {
      // Given: User in database
      const user = await userService.createLocalUser(
        db,
        'user@example.com',
        'User',
        'password123456',
      );

      // When: Updating email to same value
      const updatedUser = userService.updateUserById(db, user.id, { email: 'user@example.com' });

      // Then: Update succeeds without error
      expect(updatedUser.email).toBe('user@example.com');
    });

    it('updates updatedAt timestamp', async () => {
      // Given: User in database
      const user = await userService.createLocalUser(
        db,
        'user@example.com',
        'User',
        'password123456',
      );
      const originalUpdatedAt = user.updatedAt;

      // When: Updating user
      const updatedUser = userService.updateUserById(db, user.id, { displayName: 'Updated' });

      // Then: updatedAt is newer
      expect(new Date(updatedUser.updatedAt).getTime()).toBeGreaterThan(
        new Date(originalUpdatedAt).getTime(),
      );
    });

    it('preserves other fields when updating', async () => {
      // Given: User in database
      const user = await userService.createLocalUser(
        db,
        'user@example.com',
        'User',
        'password123456',
        'admin',
      );

      // When: Updating only display name
      const updatedUser = userService.updateUserById(db, user.id, { displayName: 'New Name' });

      // Then: Other fields are preserved
      expect(updatedUser.email).toBe('user@example.com');
      expect(updatedUser.role).toBe('admin');
      expect(updatedUser.authProvider).toBe('local');
      expect(updatedUser.createdAt).toBe(user.createdAt);
    });

    it('returns the updated user row', async () => {
      // Given: User in database
      const user = await userService.createLocalUser(
        db,
        'user@example.com',
        'User',
        'password123456',
      );

      // When: Updating user
      const updatedUser = userService.updateUserById(db, user.id, { displayName: 'Updated' });

      // Then: Returned user matches updated data
      expect(updatedUser).toBeDefined();
      expect(updatedUser.displayName).toBe('Updated');
      expect(updatedUser.id).toBe(user.id);
    });
  });

  describe('deactivateUser()', () => {
    it('sets deactivatedAt timestamp', async () => {
      // Given: Active user
      const user = await userService.createLocalUser(
        db,
        'user@example.com',
        'User',
        'password123456',
      );
      expect(user.deactivatedAt).toBeNull();

      // When: Deactivating user
      userService.deactivateUser(db, user.id);

      // Then: deactivatedAt is set
      const deactivatedUser = db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, user.id))
        .get();
      expect(deactivatedUser?.deactivatedAt).not.toBeNull();
      expect(deactivatedUser?.deactivatedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });

    it('preserves other user fields', async () => {
      // Given: User in database
      const user = await userService.createLocalUser(
        db,
        'user@example.com',
        'User',
        'password123456',
        'admin',
      );

      // When: Deactivating user
      userService.deactivateUser(db, user.id);

      // Then: Other fields are preserved
      const deactivatedUser = db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, user.id))
        .get();
      expect(deactivatedUser?.email).toBe('user@example.com');
      expect(deactivatedUser?.displayName).toBe('User');
      expect(deactivatedUser?.role).toBe('admin');
      expect(deactivatedUser?.authProvider).toBe('local');
      expect(deactivatedUser?.createdAt).toBe(user.createdAt);
    });

    it('does not return a value (void)', async () => {
      // Given: User in database
      const user = await userService.createLocalUser(
        db,
        'user@example.com',
        'User',
        'password123456',
      );

      // When: Deactivating user
      const result = userService.deactivateUser(db, user.id);

      // Then: Function returns undefined (void)
      expect(result).toBeUndefined();
    });

    it('can deactivate already deactivated user (idempotent)', async () => {
      // Given: Already deactivated user
      const user = await userService.createLocalUser(
        db,
        'user@example.com',
        'User',
        'password123456',
      );

      userService.deactivateUser(db, user.id);
      const firstDeactivation = db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, user.id))
        .get();
      expect(firstDeactivation?.deactivatedAt).toBeDefined();

      // When: Deactivating again
      userService.deactivateUser(db, user.id);

      // Then: No error is thrown (idempotent)
      const secondDeactivation = db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, user.id))
        .get();
      expect(secondDeactivation?.deactivatedAt).toBeDefined();
      // Timestamp may be updated, but that's acceptable
    });

    it('can be verified by re-reading user from DB', async () => {
      // Given: Active user
      const user = await userService.createLocalUser(
        db,
        'user@example.com',
        'User',
        'password123456',
      );

      // When: Deactivating user
      userService.deactivateUser(db, user.id);

      // And: Re-reading from database
      const reloadedUser = db.select().from(schema.users).where(eq(schema.users.id, user.id)).get();

      // Then: Deactivation is persisted
      expect(reloadedUser).toBeDefined();
      expect(reloadedUser?.deactivatedAt).not.toBeNull();
    });

    it('works for OIDC users', () => {
      // Given: OIDC user
      const oidcSubject = 'oidc-sub-456';
      db.insert(schema.users)
        .values({
          id: 'oidc-user',
          email: 'oidc@example.com',
          displayName: 'OIDC User',
          role: 'member',
          authProvider: 'oidc',
          oidcSubject,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();

      // When: Deactivating OIDC user
      userService.deactivateUser(db, 'oidc-user');

      // Then: User is deactivated
      const deactivatedUser = db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 'oidc-user'))
        .get();
      expect(deactivatedUser?.deactivatedAt).not.toBeNull();
      expect(deactivatedUser?.authProvider).toBe('oidc');
    });
  });
});
