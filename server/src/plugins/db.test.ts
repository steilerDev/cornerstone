import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

describe('Database Plugin', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let dbPath: string;
  let originalDatabaseUrl: string | undefined;

  beforeEach(() => {
    // Save original DATABASE_URL
    originalDatabaseUrl = process.env.DATABASE_URL;

    // Create a temporary directory for each test
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-test-'));
    dbPath = join(tempDir, 'test.db');
    process.env.DATABASE_URL = dbPath;
  });

  afterEach(async () => {
    // Close the app if it was created
    if (app) {
      await app.close();
    }

    // Restore original DATABASE_URL
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }

    // Clean up temporary directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('Scenario 1: Server starts successfully and database is accessible', async () => {
    // Given: DATABASE_URL is set (via beforeEach to a temp path)
    // When: The server is started
    app = await buildApp();

    // Then: Server starts without errors and db is available
    expect(app.db).toBeDefined();

    // Verify connection works
    const result = app.db.$client.prepare('SELECT 1 as value').get() as { value: number };
    expect(result).toEqual({ value: 1 });

    // Verify database file was created at the configured path
    expect(existsSync(dbPath)).toBe(true);
  });

  it('Scenario 2: Server starts with custom DATABASE_URL', async () => {
    // Given: DATABASE_URL is set to custom path
    const customDir = join(tempDir, 'custom-data');
    const customDb = join(customDir, 'custom.db');
    process.env.DATABASE_URL = customDb;

    // When: The server is started
    app = await buildApp();

    // Then: Server starts and database is created at custom path
    expect(app.db).toBeDefined();
    expect(existsSync(customDb)).toBe(true);
    expect(existsSync(customDir)).toBe(true);
  });

  it('Scenario 3: Database connection is available to route handlers', async () => {
    // Given: Server has started
    app = await buildApp();

    // When: A route handler accesses fastify.db
    app.get('/test-db', async (request) => {
      const result = request.server.db.$client.prepare('SELECT 42 as value').get() as {
        value: number;
      };
      return { result };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test-db',
    });

    // Then: The handler can execute queries
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ result: { value: 42 } });
  });

  it('Scenario 4: WAL mode is enabled after connection', async () => {
    // Given: Server has started
    app = await buildApp();

    // When: The database connection is inspected
    const result = app.db.$client.pragma('journal_mode', { simple: true }) as string;

    // Then: WAL mode is enabled
    expect(result).toBe('wal');
  });

  it('Scenario 5: Pending migrations run on startup (fresh database)', async () => {
    // Given: Fresh database with test migrations
    const migrationsDir = join(tempDir, 'migrations');
    mkdirSync(migrationsDir, { recursive: true });

    writeFileSync(
      join(migrationsDir, '0001_test_users.sql'),
      'CREATE TABLE test_users (id INTEGER PRIMARY KEY, name TEXT);',
    );
    writeFileSync(
      join(migrationsDir, '0002_test_posts.sql'),
      'CREATE TABLE test_posts (id INTEGER PRIMARY KEY, title TEXT);',
    );

    // Mock the migrations directory by setting environment
    // Note: Since migrations are hardcoded to src/db/migrations, we need to create them there
    const actualMigrationsDir = join(process.cwd(), 'server/src/db/migrations');
    if (!existsSync(actualMigrationsDir)) {
      mkdirSync(actualMigrationsDir, { recursive: true });
    }

    // Create temporary test migrations
    const testMigration1 = join(actualMigrationsDir, 'test_0001_users.sql');
    const testMigration2 = join(actualMigrationsDir, 'test_0002_posts.sql');

    try {
      writeFileSync(testMigration1, 'CREATE TABLE test_users (id INTEGER PRIMARY KEY, name TEXT);');
      writeFileSync(
        testMigration2,
        'CREATE TABLE test_posts (id INTEGER PRIMARY KEY, title TEXT);',
      );

      // When: Server starts
      app = await buildApp();

      // Then: Both migrations are applied
      const migrations = (
        app.db.$client.prepare('SELECT name FROM _migrations ORDER BY name').all() as Array<{
          name: string;
        }>
      ).map((row) => row.name);

      expect(migrations).toContain('test_0001_users.sql');
      expect(migrations).toContain('test_0002_posts.sql');

      // Verify tables exist
      const tables = (
        app.db.$client
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'test_%'")
          .all() as Array<{ name: string }>
      ).map((row) => row.name);

      expect(tables).toContain('test_users');
      expect(tables).toContain('test_posts');
    } finally {
      // Cleanup test migrations
      try {
        rmSync(testMigration1, { force: true });
        rmSync(testMigration2, { force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it('Scenario 6: Only new migrations run on startup (existing database)', async () => {
    // Given: Database with one migration already applied
    const actualMigrationsDir = join(process.cwd(), 'server/src/db/migrations');
    if (!existsSync(actualMigrationsDir)) {
      mkdirSync(actualMigrationsDir, { recursive: true });
    }

    const testMigration1 = join(actualMigrationsDir, 'test_0003_existing.sql');
    const testMigration2 = join(actualMigrationsDir, 'test_0004_new.sql');

    try {
      writeFileSync(
        testMigration1,
        'CREATE TABLE test_existing (id INTEGER PRIMARY KEY, data TEXT);',
      );

      // Start server once to apply first migration
      app = await buildApp();
      await app.close();

      // Create second migration
      writeFileSync(testMigration2, 'CREATE TABLE test_new (id INTEGER PRIMARY KEY, info TEXT);');

      // When: Server starts again
      app = await buildApp();

      // Then: Only the new migration is applied
      const migrations = (
        app.db.$client.prepare('SELECT name FROM _migrations ORDER BY name').all() as Array<{
          name: string;
        }>
      ).map((row) => row.name);

      expect(migrations).toContain('test_0003_existing.sql');
      expect(migrations).toContain('test_0004_new.sql');

      // Verify new table exists
      const tables = (
        app.db.$client
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='test_new'")
          .all() as Array<{ name: string }>
      ).map((row) => row.name);

      expect(tables).toContain('test_new');
    } finally {
      // Cleanup test migrations
      try {
        rmSync(testMigration1, { force: true });
        rmSync(testMigration2, { force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it('Scenario 7: Server fails to start if a migration fails', async () => {
    // Given: A migration with invalid SQL
    const actualMigrationsDir = join(process.cwd(), 'server/src/db/migrations');
    if (!existsSync(actualMigrationsDir)) {
      mkdirSync(actualMigrationsDir, { recursive: true });
    }

    const invalidMigration = join(actualMigrationsDir, 'test_0005_invalid.sql');

    try {
      writeFileSync(invalidMigration, 'CREATE TABLEX invalid_syntax (id INT);');

      // When: Server attempts to start
      // Then: It should throw an error
      await expect(buildApp()).rejects.toThrow();

      // The failed migration should not be recorded
      // (We can't easily verify this in the same test since the app didn't start)
    } finally {
      // Cleanup test migration
      try {
        rmSync(invalidMigration, { force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it('Scenario 8: Database connection closes on server shutdown', async () => {
    // Given: Server is running
    app = await buildApp();

    // Verify connection works
    const beforeClose = app.db.$client.prepare('SELECT 1 as value').get() as { value: number };
    expect(beforeClose).toEqual({ value: 1 });

    // When: Server is shut down
    await app.close();

    // Then: Connection should be closed (subsequent queries should fail)
    // Note: better-sqlite3 throws "The database connection is not open" after close
    expect(() => {
      app.db.$client.prepare('SELECT 1').get();
    }).toThrow();
  });

  it('Scenario 9: Server works when database file already exists (idempotent startup)', async () => {
    // Given: Database file already exists with migrations applied
    app = await buildApp();
    const firstMigrations = (
      app.db.$client.prepare('SELECT name FROM _migrations').all() as Array<{ name: string }>
    ).map((row) => row.name);
    await app.close();

    // When: Server starts again
    app = await buildApp();

    // Then: Server starts successfully, no migrations re-applied
    const secondMigrations = (
      app.db.$client.prepare('SELECT name FROM _migrations').all() as Array<{ name: string }>
    ).map((row) => row.name);

    expect(secondMigrations).toEqual(firstMigrations);

    // WAL mode is still enabled
    const result = app.db.$client.pragma('journal_mode', { simple: true }) as string;
    expect(result).toBe('wal');
  });

  it('Scenario 10: Plugin creates nested parent directories', async () => {
    // Given: DATABASE_URL points to deeply nested path
    const nestedPath = join(tempDir, 'data', 'nested', 'deep', 'db.sqlite');
    process.env.DATABASE_URL = nestedPath;

    // When: Server starts
    app = await buildApp();

    // Then: All parent directories are created
    expect(existsSync(join(tempDir, 'data'))).toBe(true);
    expect(existsSync(join(tempDir, 'data', 'nested'))).toBe(true);
    expect(existsSync(join(tempDir, 'data', 'nested', 'deep'))).toBe(true);
    expect(existsSync(nestedPath)).toBe(true);
  });

  it('Additional Scenario 1: Concurrent requests can access the database', async () => {
    // Given: Server is running with WAL mode
    app = await buildApp();

    // Create a test table
    app.db.$client.exec('CREATE TABLE test_concurrent (id INTEGER PRIMARY KEY, value TEXT)');

    // Add a test route
    app.post('/test-concurrent', async (request) => {
      const { value } = request.body as { value: string };
      const result = request.server.db.$client
        .prepare('INSERT INTO test_concurrent (value) VALUES (?)')
        .run(value);
      return { id: result.lastInsertRowid };
    });

    app.get('/test-concurrent', async (request) => {
      const rows = request.server.db.$client.prepare('SELECT * FROM test_concurrent').all();
      return { rows };
    });

    // When: Multiple requests access the database concurrently
    const writes = await Promise.all([
      app.inject({ method: 'POST', url: '/test-concurrent', payload: { value: 'test1' } }),
      app.inject({ method: 'POST', url: '/test-concurrent', payload: { value: 'test2' } }),
      app.inject({ method: 'POST', url: '/test-concurrent', payload: { value: 'test3' } }),
      app.inject({ method: 'GET', url: '/test-concurrent' }),
    ]);

    // Then: All requests succeed without "database locked" errors
    writes.forEach((response) => {
      expect(response.statusCode).toBe(200);
    });
  });
});
