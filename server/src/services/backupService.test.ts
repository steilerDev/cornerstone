/**
 * Unit tests for backupService.ts
 *
 * EPIC-19: Backup and Restore Feature
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs, {
  writeFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  linkSync,
} from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import * as tar from 'tar';
import { gzipSync } from 'node:zlib';
import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { getTasks } from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import type { FastifyInstance } from 'fastify';
import { disposableTempDir, disposableDb } from '../test-helpers/disposables.js';
import type { DisposableTempDir, DisposableDatabase } from '../test-helpers/disposables.js';
import type { FastifyBaseLogger } from 'fastify';
import { listMigrationFiles } from '../db/migrate.js';
import {
  BACKUP_MANIFEST_FILE,
  RESTORE_STATE_FILE,
  readRestoreState,
  recoverInterruptedRestore,
} from './restoreSwap.js';

// ─── Import service functions ───────────────────────────────────────────────

import {
  generateBackupFilename,
  parseBackupFilename,
  validateBackupFilename,
  listBackups,
  deleteBackup,
  createBackup,
  beginRestore,
  executeRestore,
  initScheduler,
  getSchedulerStatus,
  stopScheduler,
  restoreLimits,
  RESTORE_MAX_ENTRIES,
  RESTORE_FREE_SPACE_MARGIN_BYTES,
  PER_ENTRY_OVERHEAD_BYTES,
} from './backupService.js';

import type { AppConfig } from '../plugins/config.js';

// ─── AppConfig factory ───────────────────────────────────────────────────────

const makeConfig = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  port: 3000,
  host: '0.0.0.0',
  databaseUrl: '/app/data/cornerstone.db',
  logLevel: 'fatal',
  nodeEnv: 'test',
  sessionDuration: 3600,
  secureCookies: false,
  trustProxy: false,
  oidcEnabled: false,
  oidcJitProvisioning: false,
  oidcIssuer: undefined,
  oidcClientId: undefined,
  oidcClientSecret: undefined,
  paperlessEnabled: false,
  paperlessUrl: undefined,
  paperlessApiToken: undefined,
  paperlessExternalUrl: undefined,
  paperlessFilterTag: undefined,
  externalUrl: undefined,
  photoStoragePath: '/app/data/photos',
  photoMaxFileSizeMb: 20,
  diaryAutoEvents: false,
  diaryDraftRetentionDays: 30,
  currency: 'EUR',
  vatRate: 0.19,
  backupDir: '/tmp/test-backups',
  backupCadence: undefined,
  backupRetention: undefined,
  llmBaseUrl: undefined,
  llmApiKey: undefined,
  llmModel: undefined,
  llmRequestTimeoutMs: 30000,
  llmMaxTokens: 16384,
  llmProvider: 'generic',
  autoItemizeEnabled: false,
  llmEnabled: false,
  authRateLimitMax: 20,
  authRateLimitWindow: '15 minutes',
  ...overrides,
});

// ─── Logger mock ─────────────────────────────────────────────────────────────

const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn(),
} as unknown as FastifyInstance['log'];

/**
 * Finds the most recently registered node-cron task named 'backup-scheduler'.
 * initScheduler() never destroys previous tasks (only stop()s them), so multiple
 * tasks with this name may accumulate in node-cron's internal registry across
 * tests in this file — the most recently added one is the currently active one.
 */
function getRegisteredSchedulerTask(): ScheduledTask | undefined {
  const matches = [...getTasks().values()].filter((t) => t.name === 'backup-scheduler');
  return matches[matches.length - 1];
}

/**
 * Asserts a service failure carries only the fixed, client-safe message: no `details`, the original
 * error attached as `cause`, and none of the given sensitive fragments (paths, raw FS text) leaked.
 */
function expectSanitizedFailure(
  error: unknown,
  expected: { code: string; message: string },
  forbidden: string[],
): void {
  expect(error).toMatchObject({ code: expected.code, statusCode: 500, message: expected.message });
  const appError = error as Error & { details?: unknown; cause?: unknown };
  expect(appError.details).toBeUndefined();
  expect(appError).toHaveProperty('cause');
  // Jest's VM realm can make fs errors fail `instanceof Error`, so check the shape instead
  expect(appError.cause).toMatchObject({ message: expect.any(String) });
  for (const fragment of forbidden) {
    expect(appError.message).not.toContain(fragment);
  }
  expect(appError.message).not.toMatch(/ENOTDIR|ENOENT|EEXIST|EACCES|EISDIR|disk full/);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('backupService', () => {
  // ─── generateBackupFilename ───────────────────────────────────────────────

  describe('generateBackupFilename()', () => {
    it('returns a string matching the expected filename pattern', () => {
      const filename = generateBackupFilename();
      expect(filename).toMatch(/^cornerstone-backup-\d{4}-\d{2}-\d{2}T\d{6}Z\.tar\.gz$/);
    });

    it('generates a filename with the current UTC year', () => {
      const before = new Date();
      const filename = generateBackupFilename();
      const after = new Date();

      const yearMatch = filename.match(/cornerstone-backup-(\d{4})-/);
      expect(yearMatch).not.toBeNull();
      const year = parseInt(yearMatch![1]!, 10);

      // The year must be either the before or after year (handles midnight boundary)
      expect([before.getUTCFullYear(), after.getUTCFullYear()]).toContain(year);
    });

    it('includes month and day in the filename', () => {
      const filename = generateBackupFilename();
      // Format: cornerstone-backup-YYYY-MM-DDTHHMMSSZ.tar.gz
      const match = filename.match(/cornerstone-backup-\d{4}-(\d{2})-(\d{2})T/);
      expect(match).not.toBeNull();
      const month = parseInt(match![1]!, 10);
      const day = parseInt(match![2]!, 10);
      expect(month).toBeGreaterThanOrEqual(1);
      expect(month).toBeLessThanOrEqual(12);
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(31);
    });
  });

  // ─── parseBackupFilename ──────────────────────────────────────────────────

  describe('parseBackupFilename()', () => {
    it('parses a valid filename and returns an ISO 8601 datetime string', () => {
      const result = parseBackupFilename('cornerstone-backup-2026-03-22T020000Z.tar.gz');
      expect(result).toBe('2026-03-22T02:00:00.000Z');
    });

    it('parses a filename with non-zero minutes and seconds', () => {
      const result = parseBackupFilename('cornerstone-backup-2026-12-31T235959Z.tar.gz');
      expect(result).toBe('2026-12-31T23:59:59.000Z');
    });

    it('parses a midnight filename correctly', () => {
      const result = parseBackupFilename('cornerstone-backup-2026-01-01T000000Z.tar.gz');
      expect(result).toBe('2026-01-01T00:00:00.000Z');
    });

    it('returns null for a path traversal attempt (../../etc/passwd)', () => {
      const result = parseBackupFilename('../../etc/passwd');
      expect(result).toBeNull();
    });

    it('returns null for a random non-matching filename (random-file.txt)', () => {
      const result = parseBackupFilename('random-file.txt');
      expect(result).toBeNull();
    });

    it('returns null for an empty string', () => {
      const result = parseBackupFilename('');
      expect(result).toBeNull();
    });

    it('returns null for a filename with wrong prefix', () => {
      const result = parseBackupFilename('backup-2026-03-22T020000Z.tar.gz');
      expect(result).toBeNull();
    });

    it('returns null for a filename with too few timestamp digits', () => {
      // Missing seconds portion (4 chars instead of 6)
      const result = parseBackupFilename('cornerstone-backup-2026-03-22T0200Z.tar.gz');
      expect(result).toBeNull();
    });

    it('returns null for a filename with wrong extension', () => {
      const result = parseBackupFilename('cornerstone-backup-2026-03-22T020000Z.tar');
      expect(result).toBeNull();
    });
  });

  // ─── validateBackupFilename ───────────────────────────────────────────────

  describe('validateBackupFilename()', () => {
    it('accepts a valid backup filename', () => {
      expect(validateBackupFilename('cornerstone-backup-2026-03-22T020000Z.tar.gz')).toBe(true);
    });

    it('accepts another valid backup filename with different timestamp', () => {
      expect(validateBackupFilename('cornerstone-backup-2026-12-31T235959Z.tar.gz')).toBe(true);
    });

    it('accepts a midnight backup filename', () => {
      expect(validateBackupFilename('cornerstone-backup-2026-01-01T000000Z.tar.gz')).toBe(true);
    });

    it('rejects a filename containing a forward slash (path traversal)', () => {
      expect(validateBackupFilename('../etc/passwd')).toBe(false);
    });

    it('rejects a filename containing a forward slash in middle', () => {
      expect(validateBackupFilename('cornerstone-backup-2026-03-22T020000Z/malicious.tar.gz')).toBe(
        false,
      );
    });

    it('rejects a filename containing a backslash (path traversal)', () => {
      expect(validateBackupFilename('..\\etc\\passwd')).toBe(false);
    });

    it('rejects a random non-backup filename', () => {
      expect(validateBackupFilename('random-file.txt')).toBe(false);
    });

    it('rejects an empty string', () => {
      expect(validateBackupFilename('')).toBe(false);
    });

    it('rejects a filename with wrong extension', () => {
      expect(validateBackupFilename('cornerstone-backup-2026-03-22T020000Z.tar')).toBe(false);
    });

    it('rejects a filename with wrong prefix', () => {
      expect(validateBackupFilename('backup-2026-03-22T020000Z.tar.gz')).toBe(false);
    });

    it('rejects a filename with extra characters appended', () => {
      expect(validateBackupFilename('cornerstone-backup-2026-03-22T020000Z.tar.gz.bak')).toBe(
        false,
      );
    });
  });

  // ─── listBackups ──────────────────────────────────────────────────────────

  describe('listBackups()', () => {
    let tempDir: DisposableTempDir;

    beforeEach(() => {
      tempDir = disposableTempDir('cornerstone-backup-list-test-');
    });

    afterEach(() => {
      tempDir[Symbol.dispose]();
    });

    it('returns empty array for an empty directory', async () => {
      const result = await listBackups(tempDir.path);
      expect(result).toEqual([]);
    });

    it('returns empty array when the directory does not exist (ENOENT)', async () => {
      const result = await listBackups(join(tempDir.path, 'nonexistent-dir'));
      expect(result).toEqual([]);
    });

    it('returns backup files sorted newest-first by timestamp', async () => {
      const olderFilename = 'cornerstone-backup-2026-01-01T000000Z.tar.gz';
      const newerFilename = 'cornerstone-backup-2026-06-15T120000Z.tar.gz';
      writeFileSync(join(tempDir.path, olderFilename), 'older content');
      writeFileSync(join(tempDir.path, newerFilename), 'newer content');

      const result = await listBackups(tempDir.path);

      expect(result).toHaveLength(2);
      expect(result[0]!.filename).toBe(newerFilename);
      expect(result[1]!.filename).toBe(olderFilename);
    });

    it('returns correct BackupMeta shape for a backup file', async () => {
      const filename = 'cornerstone-backup-2026-03-22T020000Z.tar.gz';
      writeFileSync(join(tempDir.path, filename), 'test content');

      const result = await listBackups(tempDir.path);

      expect(result).toHaveLength(1);
      expect(result[0]!.filename).toBe(filename);
      expect(result[0]!.createdAt).toBe('2026-03-22T02:00:00.000Z');
      expect(typeof result[0]!.sizeBytes).toBe('number');
      expect(result[0]!.sizeBytes).toBeGreaterThan(0);
    });

    it('ignores non-backup files in the directory', async () => {
      writeFileSync(join(tempDir.path, 'README.txt'), 'readme');
      writeFileSync(join(tempDir.path, 'some-other-archive.tar.gz'), 'other');
      writeFileSync(join(tempDir.path, 'cornerstone-backup-2026-03-22T020000Z.tar.gz'), 'backup');

      const result = await listBackups(tempDir.path);

      expect(result).toHaveLength(1);
      expect(result[0]!.filename).toBe('cornerstone-backup-2026-03-22T020000Z.tar.gz');
    });

    it('handles multiple backup files with correct sort order', async () => {
      const files = [
        'cornerstone-backup-2026-01-15T100000Z.tar.gz',
        'cornerstone-backup-2026-03-01T080000Z.tar.gz',
        'cornerstone-backup-2026-02-10T150000Z.tar.gz',
      ];
      for (const f of files) {
        writeFileSync(join(tempDir.path, f), 'content');
      }

      const result = await listBackups(tempDir.path);

      expect(result).toHaveLength(3);
      // Sorted newest-first
      expect(result[0]!.filename).toBe('cornerstone-backup-2026-03-01T080000Z.tar.gz');
      expect(result[1]!.filename).toBe('cornerstone-backup-2026-02-10T150000Z.tar.gz');
      expect(result[2]!.filename).toBe('cornerstone-backup-2026-01-15T100000Z.tar.gz');
    });
  });

  // ─── deleteBackup ─────────────────────────────────────────────────────────

  describe('deleteBackup()', () => {
    let tempDir: DisposableTempDir;

    beforeEach(() => {
      tempDir = disposableTempDir('cornerstone-backup-delete-test-');
    });

    afterEach(() => {
      tempDir[Symbol.dispose]();
    });

    it('deletes an existing backup file successfully', async () => {
      const filename = 'cornerstone-backup-2026-03-22T020000Z.tar.gz';
      writeFileSync(join(tempDir.path, filename), 'backup content');

      await expect(deleteBackup(tempDir.path, filename)).resolves.toBeUndefined();

      // Verify the file was actually removed
      const remaining = await listBackups(tempDir.path);
      expect(remaining).toHaveLength(0);
    });

    it('throws BackupNotFoundError (code BACKUP_NOT_FOUND) when file does not exist', async () => {
      await expect(
        deleteBackup(tempDir.path, 'cornerstone-backup-2099-01-01T000000Z.tar.gz'),
      ).rejects.toMatchObject({
        code: 'BACKUP_NOT_FOUND',
      });
    });

    it('throws BackupNotFoundError for path traversal filename (../../etc/passwd)', async () => {
      await expect(deleteBackup(tempDir.path, '../../etc/passwd')).rejects.toMatchObject({
        code: 'BACKUP_NOT_FOUND',
      });
    });

    it('throws BackupNotFoundError for filename with backslash', async () => {
      await expect(
        deleteBackup(tempDir.path, 'cornerstone-backup-2026\\T000000Z.tar.gz'),
      ).rejects.toMatchObject({
        code: 'BACKUP_NOT_FOUND',
      });
    });

    it('throws BackupNotFoundError for a random non-backup filename', async () => {
      writeFileSync(join(tempDir.path, 'random-file.txt'), 'content');
      await expect(deleteBackup(tempDir.path, 'random-file.txt')).rejects.toMatchObject({
        code: 'BACKUP_NOT_FOUND',
      });
    });

    it('only deletes the targeted file, leaving others intact', async () => {
      const file1 = 'cornerstone-backup-2026-01-01T000000Z.tar.gz';
      const file2 = 'cornerstone-backup-2026-06-01T000000Z.tar.gz';
      writeFileSync(join(tempDir.path, file1), 'content1');
      writeFileSync(join(tempDir.path, file2), 'content2');

      await deleteBackup(tempDir.path, file1);

      const remaining = await listBackups(tempDir.path);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.filename).toBe(file2);
    });
  });

  // ─── createBackup — execution path ───────────────────────────────────────

  describe('createBackup() — execution path', () => {
    let tempDir: DisposableTempDir;
    let backupTempDir: DisposableTempDir;

    beforeEach(() => {
      // App data directory (DB lives here) — separate from backup directory
      tempDir = disposableTempDir('cornerstone-backup-exec-appdata-');
      // Backup directory MUST be outside the app data directory (config validation)
      backupTempDir = disposableTempDir('cornerstone-backup-exec-backups-');
    });

    afterEach(() => {
      // Restore writable permissions before cleanup (in case a test made the dir read-only)
      try {
        chmodSync(backupTempDir.path, 0o755);
      } catch {
        // ignore
      }
      tempDir[Symbol.dispose]();
      backupTempDir[Symbol.dispose]();
    });

    it('createBackup succeeds with a real DB and real tar: returns valid BackupMeta and writes the .tar.gz file', async () => {
      using rawDb = disposableDb(join(tempDir.path, 'test.db'));
      const db = drizzle(rawDb);

      const config = makeConfig({
        databaseUrl: join(tempDir.path, 'test.db'),
        backupDir: backupTempDir.path,
        backupRetention: undefined,
      });

      const result = await createBackup(db, config);

      // Returned BackupMeta must be well-formed
      expect(result.filename).toMatch(/^cornerstone-backup-\d{4}-\d{2}-\d{2}T\d{6}Z\.tar\.gz$/);
      expect(result.createdAt).toBeTruthy();
      expect(typeof result.createdAt).toBe('string');
      expect(result.sizeBytes).toBeGreaterThan(0);

      // The archive file must exist on disk
      const archivePath = join(backupTempDir.path, result.filename);
      expect(existsSync(archivePath)).toBe(true);
    });

    it('createBackup throws BackupFailedError (code BACKUP_FAILED) when backup directory is not writable', async () => {
      // chmod does not restrict root — skip this test when running as root
      if (process.getuid?.() === 0) {
        return;
      }

      using rawDb = disposableDb(join(tempDir.path, 'test.db'));
      const db = drizzle(rawDb);

      // Make the backup directory read-only
      chmodSync(backupTempDir.path, 0o444);

      const config = makeConfig({
        databaseUrl: join(tempDir.path, 'test.db'),
        backupDir: backupTempDir.path,
      });

      await expect(createBackup(db, config)).rejects.toMatchObject({
        code: 'BACKUP_FAILED',
      });
    });

    it('createBackup throws BackupFailedError (code BACKUP_FAILED) when db.backup() throws', async () => {
      // Create a mock db whose $client.backup throws a SqliteError-like object
      const mockBackup = jest
        .fn<() => Promise<void>>()
        .mockRejectedValue(Object.assign(new Error('disk I/O error'), { code: 'SQLITE_IOERR' }));
      const db = {
        $client: {
          backup: mockBackup,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mock db structure for error testing
      } as any;

      const config = makeConfig({
        databaseUrl: join(tempDir.path, 'test.db'),
        backupDir: backupTempDir.path,
      });

      await expect(createBackup(db, config)).rejects.toMatchObject({
        code: 'BACKUP_FAILED',
      });
    });

    it('createBackup enforces retention policy and deletes oldest backups when limit is exceeded', async () => {
      using rawDb = disposableDb(join(tempDir.path, 'test.db'));
      const db = drizzle(rawDb);

      const config = makeConfig({
        databaseUrl: join(tempDir.path, 'test.db'),
        backupDir: backupTempDir.path,
        backupRetention: 2,
      });

      // Pre-seed two older backup stubs with valid filenames
      const stub1 = 'cornerstone-backup-2026-01-01T000000Z.tar.gz';
      const stub2 = 'cornerstone-backup-2026-01-02T000000Z.tar.gz';
      writeFileSync(join(backupTempDir.path, stub1), 'stub content 1');
      writeFileSync(join(backupTempDir.path, stub2), 'stub content 2');

      // Third backup created for real — this should push total to 3, triggering retention
      await createBackup(db, config);

      // After retention enforcement, only 2 files should remain
      const remaining = await listBackups(backupTempDir.path);
      expect(remaining).toHaveLength(2);

      // The two oldest stubs should have been deleted; only the 2 newest remain
      const filenames = remaining.map((b) => b.filename);
      expect(filenames).not.toContain(stub1);
    });
  });

  // ─── initScheduler / getSchedulerStatus / stopScheduler ──────────────────

  // ─── Directory failures (real filesystem, no internal mocks) ──────────────

  describe('backup directory failures', () => {
    let tempDir: DisposableTempDir;
    let backupTempDir: DisposableTempDir;

    beforeEach(() => {
      tempDir = disposableTempDir('cornerstone-backup-dirfail-appdata-');
      backupTempDir = disposableTempDir('cornerstone-backup-dirfail-backups-');
    });

    afterEach(() => {
      jest.restoreAllMocks();
      tempDir[Symbol.dispose]();
      backupTempDir[Symbol.dispose]();
    });

    /** A path whose parent is a regular file, so mkdir/stat on it fail with ENOTDIR. */
    function pathUnderRegularFile(): string {
      const blocker = join(backupTempDir.path, 'not-a-directory');
      writeFileSync(blocker, 'x');
      return join(blocker, 'backups');
    }

    it('createBackup maps an uncreatable backup directory to BACKUP_FAILED and releases the operation lock', async () => {
      using rawDb = disposableDb(join(tempDir.path, 'test.db'));
      const db = drizzle(rawDb);
      const config = makeConfig({
        databaseUrl: join(tempDir.path, 'test.db'),
        backupDir: pathUnderRegularFile(),
      });

      const failure = await createBackup(db, config).catch((e: unknown) => e);
      expect(failure).toMatchObject({ name: 'BackupFailedError' });
      expectSanitizedFailure(
        failure,
        {
          code: 'BACKUP_FAILED',
          message: 'Backup directory could not be created or is not writable',
        },
        [config.backupDir, backupTempDir.path],
      );

      // A second call must fail the same way, never with BACKUP_IN_PROGRESS (lock released)
      await expect(createBackup(db, config)).rejects.toMatchObject({
        code: 'BACKUP_FAILED',
        statusCode: 500,
      });
    });

    it('beginRestore throws RESTORE_FAILED when the backup path cannot be stat-ed for a reason other than ENOENT', async () => {
      const config = makeConfig({
        databaseUrl: join(tempDir.path, 'test.db'),
        backupDir: pathUnderRegularFile(),
      });

      const failure = await beginRestore(
        config,
        'cornerstone-backup-2026-01-15T020000Z.tar.gz',
      ).catch((e: unknown) => e);
      expect(failure).toMatchObject({ name: 'RestoreFailedError' });
      expectSanitizedFailure(
        failure,
        { code: 'RESTORE_FAILED', message: 'Backup archive could not be read' },
        [config.backupDir, backupTempDir.path],
      );

      // The lock was never taken: a backup into a usable directory is not rejected as in progress
      using rawDb = disposableDb(join(tempDir.path, 'test.db'));
      await expect(
        createBackup(
          drizzle(rawDb),
          makeConfig({ databaseUrl: join(tempDir.path, 'test.db'), backupDir: backupTempDir.path }),
        ),
      ).resolves.toMatchObject({ filename: expect.stringMatching(/\.tar\.gz$/) });
    });

    // chmod cannot make a file unreadable for root, so this case only runs unprivileged
    (process.getuid?.() === 0 ? it.skip : it)(
      'beginRestore throws RESTORE_FAILED for an unreadable archive and leaves the lock free',
      async () => {
        const backupDir = join(backupTempDir.path, 'backups');
        mkdirSync(backupDir);
        const filename = 'cornerstone-backup-2026-01-15T020000Z.tar.gz';
        const archivePath = join(backupDir, filename);
        writeFileSync(archivePath, 'archive');
        chmodSync(archivePath, 0o000);
        const config = makeConfig({ databaseUrl: join(tempDir.path, 'test.db'), backupDir });

        try {
          const failure = await beginRestore(config, filename).catch((e: unknown) => e);
          expectSanitizedFailure(
            failure,
            { code: 'RESTORE_FAILED', message: 'Backup archive could not be read' },
            [backupDir, filename],
          );
        } finally {
          chmodSync(archivePath, 0o644);
        }

        // The lock was never taken: a backup is not rejected as in progress
        using rawDb = disposableDb(join(tempDir.path, 'test.db'));
        await expect(createBackup(drizzle(rawDb), config)).resolves.toMatchObject({
          filename: expect.stringMatching(/\.tar\.gz$/),
        });
      },
    );

    it('beginRestore still throws BACKUP_NOT_FOUND when the archive is simply missing (ENOENT)', async () => {
      const config = makeConfig({
        databaseUrl: join(tempDir.path, 'test.db'),
        backupDir: backupTempDir.path,
      });

      await expect(
        beginRestore(config, 'cornerstone-backup-2026-01-15T020000Z.tar.gz'),
      ).rejects.toMatchObject({
        code: 'BACKUP_NOT_FOUND',
        statusCode: 404,
        message: 'Backup not found',
        details: undefined,
      });
    });

    it('executeRestore throws RESTORE_FAILED when the staging directory cannot be created, and releases the lock', async () => {
      using rawDb = disposableDb(join(tempDir.path, 'test.db'));
      const db = drizzle(rawDb);
      const backupDir = join(backupTempDir.path, 'backups');
      mkdirSync(backupDir);
      const filename = 'cornerstone-backup-2026-01-15T020000Z.tar.gz';
      writeFileSync(join(backupDir, filename), 'not a real archive');
      const config = makeConfig({ databaseUrl: join(tempDir.path, 'test.db'), backupDir });

      // Pin Date.now so the staging name is predictable, then occupy it with a regular file
      // inside the data directory so the (non-recursive) mkdir fails with EEXIST.
      jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
      writeFileSync(join(tempDir.path, '.restore-staging-1700000000000'), 'x');
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

      await beginRestore(config, filename);
      const failure = await executeRestore(db, config, filename, mockLogger).catch(
        (e: unknown) => e,
      );
      expect(failure).toMatchObject({ name: 'RestoreFailedError' });
      expectSanitizedFailure(
        failure,
        { code: 'RESTORE_FAILED', message: 'Backup archive could not be extracted' },
        [backupTempDir.path, tempDir.path, '.restore-staging-1700000000000'],
      );
      expect(exitSpy).not.toHaveBeenCalled();

      // The lock taken by beginRestore was released by executeRestore's finally
      jest.restoreAllMocks();
      await expect(beginRestore(config, filename)).resolves.toBeUndefined();
      // release again so the module-level lock does not leak into other tests
      jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
      writeFileSync(join(tempDir.path, '.restore-staging-1700000000000'), 'x');
      await expect(executeRestore(db, config, filename, mockLogger)).rejects.toMatchObject({
        code: 'RESTORE_FAILED',
      });
    });
  });

  describe('deleteBackup / listBackups non-ENOENT filesystem errors', () => {
    let dir: DisposableTempDir;
    beforeEach(() => {
      dir = disposableTempDir('cornerstone-backup-fserr-');
    });
    afterEach(() => {
      dir[Symbol.dispose]();
    });

    it('deleteBackup rethrows a non-ENOENT unlink error instead of reporting not-found', async () => {
      const filename = 'cornerstone-backup-2026-01-15T020000Z.tar.gz';
      // A directory with the archive's name: unlink fails with EISDIR/EPERM, not ENOENT
      mkdirSync(join(dir.path, filename));
      const result = await deleteBackup(dir.path, filename).catch((e: unknown) => e);

      expect(result).toBeDefined();
      expect((result as { code?: string }).code).not.toBe('BACKUP_NOT_FOUND');
    });

    it('listBackups rethrows a non-ENOENT readdir error', async () => {
      const blocker = join(dir.path, 'file');
      writeFileSync(blocker, 'x');
      await expect(listBackups(join(blocker, 'sub'))).rejects.toBeDefined();
    });
  });

  describe('operation guard and restore flow (real filesystem)', () => {
    let tempDir: DisposableTempDir;
    let backupTempDir: DisposableTempDir;

    beforeEach(() => {
      tempDir = disposableTempDir('cornerstone-backup-restore-appdata-');
      backupTempDir = disposableTempDir('cornerstone-backup-restore-backups-');
    });

    afterEach(() => {
      jest.restoreAllMocks();
      tempDir[Symbol.dispose]();
      backupTempDir[Symbol.dispose]();
    });

    it('createBackup maps a tar failure to BACKUP_FAILED and removes the temporary DB snapshot', async () => {
      using rawDb = disposableDb(join(tempDir.path, 'test.db'));
      const db = drizzle(rawDb);
      const config = makeConfig({
        databaseUrl: join(tempDir.path, 'test.db'),
        backupDir: backupTempDir.path,
      });

      // Freeze only Date so the archive filename is predictable, then occupy the archive
      // path with a directory so tar cannot create the file.
      jest.useFakeTimers({
        now: new Date('2026-01-15T02:00:00.000Z'),
        doNotFake: [
          'nextTick',
          'setImmediate',
          'clearImmediate',
          'setInterval',
          'clearInterval',
          'setTimeout',
          'clearTimeout',
          'queueMicrotask',
          'hrtime',
          'performance',
        ],
      });
      try {
        mkdirSync(join(backupTempDir.path, 'cornerstone-backup-2026-01-15T020000Z.tar.gz'));

        const failure = await createBackup(db, config).catch((e: unknown) => e);
        expect(failure).toMatchObject({ name: 'BackupFailedError' });
        expectSanitizedFailure(
          failure,
          { code: 'BACKUP_FAILED', message: 'Backup archive could not be created' },
          [backupTempDir.path, tempDir.path],
        );
      } finally {
        jest.useRealTimers();
      }

      // The temporary snapshot DB must not be left behind in the data directory
      expect(existsSync(join(tempDir.path, 'cornerstone-backup-2026-01-15T020000Z.db'))).toBe(
        false,
      );
      expect(readdirSync(tempDir.path).filter((f) => f.endsWith('.db'))).toEqual(['test.db']);
      // Guards: the manifest cleanup being skipped when tar fails (finally must cover it)
      expect(existsSync(join(tempDir.path, BACKUP_MANIFEST_FILE))).toBe(false);
      // No archive is listed (the occupying directory is not a file)
      expect(await listBackups(backupTempDir.path)).toEqual([]);
    });

    it('createBackup removes a partial database snapshot when the snapshot fails, leaving no archive behind', async () => {
      using rawDb = disposableDb(join(tempDir.path, 'test.db'));
      const db = drizzle(rawDb);
      const config = makeConfig({
        databaseUrl: join(tempDir.path, 'test.db'),
        backupDir: backupTempDir.path,
      });
      // Simulate SQLite writing a partial snapshot file and then failing
      jest.spyOn(rawDb, 'backup').mockImplementation(((destination: string) => {
        writeFileSync(destination, 'partial snapshot');
        return Promise.reject(new Error('disk full'));
      }) as never);

      const failure = await createBackup(db, config).catch((e: unknown) => e);
      expect(failure).toMatchObject({ name: 'BackupFailedError' });
      expectSanitizedFailure(
        failure,
        { code: 'BACKUP_FAILED', message: 'Database snapshot failed' },
        [backupTempDir.path, tempDir.path],
      );
      expect((failure as Error).cause).toMatchObject({ message: 'disk full' });

      expect(await listBackups(backupTempDir.path)).toEqual([]);
      expect(readdirSync(backupTempDir.path)).toEqual([]);
      expect(readdirSync(tempDir.path).filter((f) => f.endsWith('.db'))).toEqual(['test.db']);
    });

    // chmod cannot make a file unreadable for root, so this real-failure case only runs unprivileged
    (process.getuid?.() === 0 ? it.skip : it)(
      'createBackup removes the partial archive and snapshot when tar fails midway',
      async () => {
        using rawDb = disposableDb(join(tempDir.path, 'test.db'));
        const db = drizzle(rawDb);
        const config = makeConfig({
          databaseUrl: join(tempDir.path, 'test.db'),
          backupDir: backupTempDir.path,
        });
        const unreadable = join(tempDir.path, 'unreadable.bin');
        writeFileSync(unreadable, 'secret');
        chmodSync(unreadable, 0o000);

        try {
          const failure = await createBackup(db, config).catch((e: unknown) => e);
          expectSanitizedFailure(
            failure,
            { code: 'BACKUP_FAILED', message: 'Backup archive could not be created' },
            [backupTempDir.path, tempDir.path, 'unreadable.bin'],
          );
        } finally {
          chmodSync(unreadable, 0o644);
        }

        expect(readdirSync(backupTempDir.path)).toEqual([]);
        expect(await listBackups(backupTempDir.path)).toEqual([]);
        expect(readdirSync(tempDir.path).filter((f) => f.endsWith('.db'))).toEqual(['test.db']);
      },
    );

    it('rejects a concurrent backup and restore with BACKUP_IN_PROGRESS (409) while a backup runs', async () => {
      using rawDb = disposableDb(join(tempDir.path, 'test.db'));
      const db = drizzle(rawDb);
      const config = makeConfig({
        databaseUrl: join(tempDir.path, 'test.db'),
        backupDir: backupTempDir.path,
      });

      const first = createBackup(db, config);
      await expect(createBackup(db, config)).rejects.toMatchObject({
        code: 'BACKUP_IN_PROGRESS',
        statusCode: 409,
      });
      await expect(
        beginRestore(config, 'cornerstone-backup-2026-01-15T020000Z.tar.gz'),
      ).rejects.toMatchObject({ code: 'BACKUP_IN_PROGRESS', statusCode: 409 });

      await expect(first).resolves.toMatchObject({ filename: expect.stringMatching(/\.tar\.gz$/) });
    });

    it('beginRestore rejects an invalid filename with BACKUP_NOT_FOUND (404) without touching the filesystem', async () => {
      const config = makeConfig({
        databaseUrl: join(tempDir.path, 'test.db'),
        backupDir: backupTempDir.path,
      });

      await expect(beginRestore(config, '../../etc/passwd')).rejects.toMatchObject({
        code: 'BACKUP_NOT_FOUND',
        statusCode: 404,
      });
    });

    it('beginRestore rejects with BACKUP_IN_PROGRESS when a backup takes the lock while it awaits the stat', async () => {
      using rawDb = disposableDb(join(tempDir.path, 'test.db'));
      const db = drizzle(rawDb);
      const config = makeConfig({
        databaseUrl: join(tempDir.path, 'test.db'),
        backupDir: join(backupTempDir.path, 'backups'),
      });
      const existing = await createBackup(db, config);

      // beginRestore passes the first lock check, then suspends on fs.stat; createBackup
      // takes the lock synchronously in between, so the re-check after the await must fire.
      const restore = beginRestore(config, existing.filename);
      const backup = createBackup(db, config);

      await expect(restore).rejects.toMatchObject({ code: 'BACKUP_IN_PROGRESS', statusCode: 409 });
      await expect(backup).resolves.toMatchObject({
        filename: expect.stringMatching(/\.tar\.gz$/),
      });
    });

    it('beginRestore takes the lock on success: backups and further restores are rejected until executeRestore finishes', async () => {
      using rawDb = disposableDb(join(tempDir.path, 'test.db'));
      // A restorable database carries a _migrations table (an empty one passes validation)
      rawDb.exec('CREATE TABLE _migrations (name TEXT PRIMARY KEY)');
      const db = drizzle(rawDb);
      const config = makeConfig({
        databaseUrl: join(tempDir.path, 'test.db'),
        backupDir: join(backupTempDir.path, 'backups'),
      });
      const created = await createBackup(db, config);
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

      await beginRestore(config, created.filename);

      await expect(createBackup(db, config)).rejects.toMatchObject({
        code: 'BACKUP_IN_PROGRESS',
        statusCode: 409,
      });
      await expect(beginRestore(config, created.filename)).rejects.toMatchObject({
        code: 'BACKUP_IN_PROGRESS',
        statusCode: 409,
      });

      await executeRestore(db, config, created.filename, mockLogger);
      expect(exitSpy).toHaveBeenCalledWith(0);

      // Lock released again after executeRestore
      await expect(beginRestore(config, created.filename)).resolves.toBeUndefined();
      jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
      writeFileSync(join(tempDir.path, '.restore-staging-1700000000000'), 'x');
      await expect(executeRestore(db, config, created.filename, mockLogger)).rejects.toMatchObject({
        code: 'RESTORE_FAILED',
      });
    });
  });

  describe('scheduler (initScheduler / getSchedulerStatus / stopScheduler)', () => {
    beforeEach(() => {
      (mockLogger.debug as jest.Mock).mockClear();
      (mockLogger.info as jest.Mock).mockClear();
      (mockLogger.warn as jest.Mock).mockClear();
      (mockLogger.error as jest.Mock).mockClear();
    });

    afterEach(() => {
      // Guarantee module-level singleton state doesn't leak between tests
      stopScheduler();
    });

    it('a valid cadence enables the scheduler and reports two upcoming run times', () => {
      const config = makeConfig({ backupCadence: '0 2 * * *' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- callback never invoked in this test
      const db = {} as any;

      initScheduler(db, config, mockLogger);

      const status = getSchedulerStatus();
      expect(status.enabled).toBe(true);
      expect(status.nextRuns).toHaveLength(2);
      for (const iso of status.nextRuns) {
        expect(new Date(iso).toISOString()).toBe(iso);
      }
    });

    it('an invalid cadence logs a field-level error and leaves the scheduler disabled', () => {
      const config = makeConfig({ backupCadence: '70 * * * *' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- callback never invoked in this test
      const db = {} as any;

      expect(() => initScheduler(db, config, mockLogger)).not.toThrow();

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      const [message] = (mockLogger.error as jest.Mock).mock.calls[0] as [string];
      expect(message).toContain('Invalid BACKUP_CADENCE expression "70 * * * *"');
      expect(message).toContain('minute');

      expect(getSchedulerStatus()).toEqual({ enabled: false, lastRun: null, nextRuns: [] });
    });

    it('no cadence configured returns the disabled shape without logging an error', () => {
      const config = makeConfig({ backupCadence: undefined });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- initScheduler returns before touching db
      const db = {} as any;

      initScheduler(db, config, mockLogger);

      expect(getSchedulerStatus()).toEqual({ enabled: false, lastRun: null, nextRuns: [] });
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('reports lastRun as null immediately after the scheduler starts (never run yet)', () => {
      const config = makeConfig({ backupCadence: '0 2 * * *' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- callback never invoked in this test
      const db = {} as any;

      initScheduler(db, config, mockLogger);

      expect(getSchedulerStatus().lastRun).toBeNull();
    });

    it('stopScheduler stops the cron task and getSchedulerStatus reports disabled', () => {
      const config = makeConfig({ backupCadence: '0 2 * * *' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- callback never invoked in this test
      const db = {} as any;

      initScheduler(db, config, mockLogger);
      expect(getSchedulerStatus().enabled).toBe(true);

      stopScheduler();

      expect(getSchedulerStatus()).toEqual({ enabled: false, lastRun: null, nextRuns: [] });
    });

    it('stopScheduler is a no-op when no scheduler is running', () => {
      expect(() => stopScheduler()).not.toThrow();
      expect(getSchedulerStatus()).toEqual({ enabled: false, lastRun: null, nextRuns: [] });
    });

    // ─── Scheduled run outcomes (real node-cron task, manually invoked) ────
    //
    // node-cron's ScheduledTask.execute() runs the scheduled callback immediately
    // (bypassing the cron heartbeat) and records the outcome via lastRun(), which
    // is exactly what getSchedulerStatus() reads. This exercises the real
    // integration rather than a mocked one.

    describe('scheduled run outcomes', () => {
      let tempDir: DisposableTempDir;
      let backupTempDir: DisposableTempDir;

      beforeEach(() => {
        tempDir = disposableTempDir('cornerstone-backup-scheduler-appdata-');
        backupTempDir = disposableTempDir('cornerstone-backup-scheduler-backups-');
      });

      afterEach(() => {
        tempDir[Symbol.dispose]();
        backupTempDir[Symbol.dispose]();
      });

      it('a successful scheduled run records lastRun.success = true with an ISO timestamp', async () => {
        using rawDb = disposableDb(join(tempDir.path, 'test.db'));
        const db = drizzle(rawDb);

        const config = makeConfig({
          databaseUrl: join(tempDir.path, 'test.db'),
          backupDir: backupTempDir.path,
          backupCadence: '0 2 * * *',
        });

        initScheduler(db, config, mockLogger);
        const task = getRegisteredSchedulerTask();
        expect(task).toBeDefined();

        await expect(task!.execute()).resolves.toBeUndefined();

        const status = getSchedulerStatus();
        expect(status.lastRun).not.toBeNull();
        expect(status.lastRun!.success).toBe(true);
        expect(status.lastRun!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      });

      it('a failed scheduled run records lastRun.success = false and rethrows so node-cron records the failure', async () => {
        using rawDb = disposableDb(join(tempDir.path, 'test.db'));
        const db = drizzle(rawDb);

        const config = makeConfig({
          databaseUrl: join(tempDir.path, 'test.db'),
          backupDir: backupTempDir.path,
          backupCadence: '0 2 * * *',
        });

        initScheduler(db, config, mockLogger);

        // Force the next createBackup() call (invoked by the scheduled callback) to
        // fail without mocking internals: config is captured by reference in the
        // scheduled closure, so pointing backupDir at a regular file after
        // initScheduler() makes the directory creation fail on the next invocation.
        const blocker = join(tempDir.path, 'not-a-directory');
        writeFileSync(blocker, 'x');
        config.backupDir = join(blocker, 'backups');

        const task = getRegisteredSchedulerTask();
        expect(task).toBeDefined();

        await expect(task!.execute()).rejects.toThrow();

        const status = getSchedulerStatus();
        expect(status.lastRun).not.toBeNull();
        expect(status.lastRun!.success).toBe(false);
        expect(status.lastRun!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        expect(mockLogger.error).toHaveBeenCalled();
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// v2 archive format and in-place restore (real filesystem, real SQLite files)
// ═══════════════════════════════════════════════════════════════════════════

const DB_NAME = 'cornerstone.db';
const V1_STEM = 'cornerstone-backup-2026-01-15T020000Z';
const V1_ARCHIVE = `${V1_STEM}.tar.gz`;

interface Env {
  dataDir: string;
  backupDir: string;
  dbPath: string;
  config: AppConfig;
}

function makeEnv(appData: DisposableTempDir, backups: DisposableTempDir): Env {
  const dbPath = join(appData.path, DB_NAME);
  const backupDir = join(backups.path, 'backups');
  return {
    dataDir: appData.path,
    backupDir,
    dbPath,
    config: makeConfig({ databaseUrl: dbPath, backupDir }),
  };
}

function makeLogger() {
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    flush: jest.fn(),
  };
  return { logger, asFastify: logger as unknown as FastifyBaseLogger };
}

interface SchemaOptions {
  /** Create the _migrations table (default true). */
  migrations?: boolean;
  /** Migration names recorded as applied. */
  applied?: string[];
}

function initSchema(db: BetterSqlite3.Database, items: string[], opts: SchemaOptions = {}): void {
  db.exec('CREATE TABLE items (v TEXT NOT NULL)');
  if (opts.migrations !== false) {
    db.exec(
      `CREATE TABLE _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    );
    for (const name of opts.applied ?? []) {
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(name);
    }
  }
  for (const v of items) db.prepare('INSERT INTO items (v) VALUES (?)').run(v);
}

/** Open a new SQLite file DB with the schema and rows. The caller closes it. */
function buildDbFile(
  file: string,
  items: string[],
  opts: SchemaOptions & { wal?: boolean } = {},
): BetterSqlite3.Database {
  mkdirSync(dirname(file), { recursive: true });
  const db = new BetterSqlite3(file);
  if (opts.wal) {
    db.pragma('journal_mode = WAL');
    // Keep the most recent commits only in the -wal file
    db.pragma('wal_autocheckpoint = 0');
  }
  initSchema(db, items, opts);
  return db;
}

/** The live application database (rollback-journal mode, so closing it never changes the file). */
function seedLive(env: Env, items: string[], opts: SchemaOptions = {}): DisposableDatabase {
  const rawDb = disposableDb(env.dbPath);
  initSchema(rawDb, items, opts);
  return rawDb;
}

function readItems(file: string): string[] {
  const db = new BetterSqlite3(file);
  try {
    return (db.prepare('SELECT v FROM items ORDER BY rowid').all() as { v: string }[]).map(
      (r) => r.v,
    );
  } finally {
    db.close();
  }
}

function put(root: string, rel: string, content: string | Buffer): void {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

/** Recursive name -> content map ('<dir>' for directories); detects any byte-level difference. */
function snapshotTree(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (rel: string): void => {
    for (const name of readdirSync(join(root, rel)).sort()) {
      const childRel = join(rel, name);
      const full = join(root, childRel);
      if (statSync(full).isDirectory()) {
        out[childRel] = '<dir>';
        walk(childRel);
      } else {
        out[childRel] = readFileSync(full).toString('base64');
      }
    }
  };
  walk('');
  return out;
}

/** Build a hand-made archive (v1 or malformed) from a temp tree; `populate` gets the tree root. */
async function buildArchive(
  env: Env,
  archiveName: string,
  populate: (treeRoot: string) => void,
  paths: string[] = ['data'],
  preservePaths = false,
): Promise<void> {
  using tree = disposableTempDir('cornerstone-archive-tree-');
  populate(tree.path);
  mkdirSync(env.backupDir, { recursive: true });
  await tar.create(
    { gzip: true, file: join(env.backupDir, archiveName), cwd: tree.path, preservePaths },
    paths,
  );
}

async function listArchive(file: string): Promise<string[]> {
  const names: string[] = [];
  await tar.list({ file, onReadEntry: (entry) => void names.push(entry.path) });
  return names;
}

async function extractArchive(file: string, dest: string): Promise<void> {
  mkdirSync(dest, { recursive: true });
  await tar.extract({ file, cwd: dest, strip: 1 });
}

/** Throw on the n-th rename matching `pred` (rules fire once); everything else passes through. */
function injectRenameFailures(
  rules: Array<(src: string, dest: string) => boolean>,
): jest.SpiedFunction<typeof fs.renameSync> {
  const real = fs.renameSync.bind(fs);
  const fired = rules.map(() => false);
  return jest.spyOn(fs, 'renameSync').mockImplementation(((src: string, dest: string) => {
    for (let i = 0; i < rules.length; i++) {
      if (!fired[i] && rules[i]!(String(src), String(dest))) {
        fired[i] = true;
        throw Object.assign(new Error('injected rename failure'), { code: 'EIO' });
      }
    }
    return real(src, dest);
  }) as typeof fs.renameSync);
}

/** Rule: the n-th rename of the swap that moves an ORIGINAL aside into .pre-restore-*. */
const movingAside = (n: number) => {
  let count = 0;
  return (_src: string, dest: string) =>
    dest.includes('.pre-restore-') && !dest.endsWith(RESTORE_STATE_FILE) && ++count === n;
};
/** Rule: the n-th rename that moves a STAGED entry into the data dir. */
const movingIn = (n: number) => {
  let count = 0;
  return (src: string) => src.includes('.restore-staging-') && ++count === n;
};
/** Rule: the n-th rename of the rollback that moves an original back out of .pre-restore-*. */
const movingBack = (n: number) => {
  let count = 0;
  return (src: string, dest: string) =>
    src.includes('.pre-restore-') && !dest.includes('.pre-restore-') && ++count === n;
};

describe('createBackup() v2 archive', () => {
  let appData: DisposableTempDir;
  let backups: DisposableTempDir;
  let env: Env;

  beforeEach(() => {
    appData = disposableTempDir('cornerstone-v2-appdata-');
    backups = disposableTempDir('cornerstone-v2-backups-');
    env = makeEnv(appData, backups);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    appData[Symbol.dispose]();
    backups[Symbol.dispose]();
  });

  it('archives exactly the snapshot, the manifest and user content: never the live db, sidecars or restore leftovers', async () => {
    // WAL mode so real -wal/-shm sidecars exist next to the live database
    const live = buildDbFile(env.dbPath, ['one'], { wal: true });
    try {
      put(env.dataDir, 'photos/a.jpg', 'photo');
      put(env.dataDir, 'notes.txt', 'notes');
      put(env.dataDir, `${DB_NAME}-journal`, 'journal');
      // Pre-seeded strays that must never be archived
      put(env.dataDir, 'cornerstone-backup-old.db', 'stray snapshot');
      put(env.dataDir, '.restore-staging-1/x', 'staged');
      put(env.dataDir, '.pre-restore-1/y', 'pre');
      put(env.dataDir, '.restore-state.json', '{}');
      put(env.dataDir, 'lost+found/z', 'lf');
      expect(existsSync(`${env.dbPath}-wal`)).toBe(true);
      expect(existsSync(`${env.dbPath}-shm`)).toBe(true);

      const created = await createBackup(drizzle(live), env.config);
      const stem = created.filename.replace('.tar.gz', '');

      const names = await listArchive(join(env.backupDir, created.filename));
      const root = basename(env.dataDir);
      // Every entry sits under the archive root
      expect(names.every((n) => n === `${root}/` || n.startsWith(`${root}/`))).toBe(true);
      const tops = [
        ...new Set(
          names.map((n) => n.slice(root.length + 1).split('/')[0]!).filter((n) => n !== ''),
        ),
      ].sort();
      // Guards: any of the live db, -wal, -shm, -journal, stray snapshot, staging dir, pre-restore
      // dir, marker or lost+found leaking into the archive (set equality fails on every one)
      expect(tops).toEqual([BACKUP_MANIFEST_FILE, `${stem}.db`, 'notes.txt', 'photos'].sort());
      // Subtrees of excluded dirs are excluded as well, and user content is complete
      expect(names).toContain(`${root}/photos/a.jpg`);
      expect(names.some((n) => n.includes('.restore-staging-1'))).toBe(false);
      expect(names.some((n) => n.includes('.pre-restore-1'))).toBe(false);
      expect(names.some((n) => n.includes('lost+found'))).toBe(false);

      // Manifest body
      const extracted = join(backups.path, 'extracted');
      await extractArchive(join(env.backupDir, created.filename), extracted);
      expect(JSON.parse(readFileSync(join(extracted, BACKUP_MANIFEST_FILE), 'utf-8'))).toEqual({
        formatVersion: 2,
        database: `${stem}.db`,
        createdAt: parseBackupFilename(created.filename),
      });
    } finally {
      live.close();
    }
  });

  it('captures a row that exists only in the live -wal file (consistent snapshot, not a file copy)', async () => {
    const live = buildDbFile(env.dbPath, ['checkpointed'], { wal: true });
    try {
      // wal_autocheckpoint = 0: this row lives only in the -wal file
      live.prepare('INSERT INTO items (v) VALUES (?)').run('wal-only');
      expect(readItems(env.dbPath)).toContain('wal-only');

      const created = await createBackup(drizzle(live), env.config);
      const stem = created.filename.replace('.tar.gz', '');
      const extracted = join(backups.path, 'extracted');
      await extractArchive(join(env.backupDir, created.filename), extracted);

      // Guards: archiving the bare live .db file (it lacks the WAL-only row) instead of a snapshot
      expect(readItems(join(extracted, `${stem}.db`))).toEqual(['checkpointed', 'wal-only']);
      expect(existsSync(join(extracted, DB_NAME))).toBe(false);
    } finally {
      live.close();
    }
  });

  it('leaves neither the snapshot nor the manifest in the data dir after success', async () => {
    using live = seedLive(env, ['x']);
    await createBackup(drizzle(live), env.config);
    // Guards: a missing unlink of the snapshot or the manifest in the finally block
    expect(readdirSync(env.dataDir)).toEqual([DB_NAME]);
  });

  it('archives a nested directory whose name looks reserved (the filter applies to the top level only)', async () => {
    using live = seedLive(env, ['x']);
    put(env.dataDir, 'photos/.pre-restore-x/keep.txt', 'nested');
    put(env.dataDir, 'photos/lost+found/keep2.txt', 'nested2');
    put(env.dataDir, 'photos/cornerstone-backup-nested.db', 'nested snapshot');
    put(env.dataDir, `photos/${DB_NAME}`, 'nested live-named file');

    const created = await createBackup(drizzle(live), env.config);

    const names = await listArchive(join(env.backupDir, created.filename));
    const root = basename(env.dataDir);
    // Guards: applying the exclusion predicate at every depth (would drop user photos)
    expect(names).toContain(`${root}/photos/.pre-restore-x/keep.txt`);
    expect(names).toContain(`${root}/photos/lost+found/keep2.txt`);
    expect(names).toContain(`${root}/photos/cornerstone-backup-nested.db`);
    expect(names).toContain(`${root}/photos/${DB_NAME}`);
  });

  const itNonRoot = process.getuid?.() === 0 ? it.skip : it;

  itNonRoot(
    'creates the archive 0600, its snapshot and manifest entries 0600, and a new backup dir 0700',
    async () => {
      using live = seedLive(env, ['x']);
      expect(existsSync(env.backupDir)).toBe(false);

      const created = await createBackup(drizzle(live), env.config);

      const archive = join(env.backupDir, created.filename);
      // Guards: default 0666 & ~umask (0644) on any of these
      expect(statSync(archive).mode & 0o777).toBe(0o600);
      expect(statSync(env.backupDir).mode & 0o777).toBe(0o700);
      const stem = created.filename.replace('.tar.gz', '');
      const modes: Record<string, number> = {};
      await tar.list({
        file: archive,
        onReadEntry: (entry) => {
          modes[entry.path.split('/').slice(1).join('/')] = (entry.mode ?? 0) & 0o777;
        },
      });
      expect(modes[`${stem}.db`]).toBe(0o600);
      expect(modes[BACKUP_MANIFEST_FILE]).toBe(0o600);
    },
  );

  it('maps a manifest write failure to BACKUP_FAILED and still removes the snapshot', async () => {
    using live = seedLive(env, ['x']);
    const realWrite = fs.promises.writeFile.bind(fs.promises);
    jest.spyOn(fs.promises, 'writeFile').mockImplementation(((file: string, data: string) => {
      if (String(file).endsWith(BACKUP_MANIFEST_FILE)) {
        return Promise.reject(Object.assign(new Error('EACCES: disk full'), { code: 'EACCES' }));
      }
      return realWrite(file, data);
    }) as never);

    const failure = await createBackup(drizzle(live), env.config).catch((e: unknown) => e);

    expect(failure).toMatchObject({ name: 'BackupFailedError' });
    expectSanitizedFailure(
      failure,
      { code: 'BACKUP_FAILED', message: 'Backup archive could not be created' },
      [env.dataDir, env.backupDir, BACKUP_MANIFEST_FILE],
    );
    // Guards: skipping cleanup (snapshot left behind) or tarring without a manifest
    expect(readdirSync(env.dataDir)).toEqual([DB_NAME]);
    expect(await listBackups(env.backupDir)).toEqual([]);
  });
});

describe('executeRestore() in place', () => {
  let appData: DisposableTempDir;
  let backups: DisposableTempDir;
  let env: Env;
  let exitSpy: jest.SpiedFunction<typeof process.exit>;

  beforeEach(() => {
    appData = disposableTempDir('cornerstone-restore-appdata-');
    backups = disposableTempDir('cornerstone-restore-backups-');
    env = makeEnv(appData, backups);
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    stopScheduler();
    restoreLimits.maxEntries = RESTORE_MAX_ENTRIES;
    restoreLimits.freeSpaceMarginBytes = RESTORE_FREE_SPACE_MARGIN_BYTES;
    // Tests may chmod directories read-only
    for (const dir of [appData.path, backups.path, dirname(env.backupDir)]) {
      try {
        chmodSync(dir, 0o755);
      } catch {
        // ignore
      }
    }
    appData[Symbol.dispose]();
    backups[Symbol.dispose]();
  });

  /** begin + execute, as the route does. */
  async function restore(
    db: ReturnType<typeof drizzle>,
    filename: string,
    logger: FastifyBaseLogger = makeLogger().asFastify,
  ): Promise<void> {
    await beginRestore(env.config, filename);
    await executeRestore(db, env.config, filename, logger);
  }

  /** State A: DB ['A'] + photos/a.jpg, then a v2 backup. Returns the live DB and the filename. */
  async function backupStateA(): Promise<{ rawDb: DisposableDatabase; filename: string }> {
    const rawDb = seedLive(env, ['A']);
    put(env.dataDir, 'photos/a.jpg', 'photo-a');
    const created = await createBackup(drizzle(rawDb), env.config);
    return { rawDb, filename: created.filename };
  }

  function mutateToStateB(rawDb: DisposableDatabase): void {
    rawDb.prepare('INSERT INTO items (v) VALUES (?)').run('B');
    put(env.dataDir, 'photos/b.jpg', 'photo-b');
    put(env.dataDir, 'extra.txt', 'extra');
  }

  // ─── Scenario 5, 6, 7: round trip, mount point, read-only parent ────────────

  it('round trip: restores state A completely and leaves no restore artifacts behind', async () => {
    const { rawDb, filename } = await backupStateA();
    using _db = rawDb;
    mutateToStateB(rawDb);
    const scheduler = makeLogger();
    initScheduler(drizzle(rawDb), makeConfig({ backupCadence: '0 2 * * *' }), mockLogger);
    expect(getSchedulerStatus().enabled).toBe(true);
    const { logger, asFastify } = makeLogger();
    void scheduler;

    await restore(drizzle(rawDb), filename, asFastify);

    expect(exitSpy).toHaveBeenCalledTimes(1);
    // Guards: a success path that exits non-zero (a rollback exits 1)
    expect(exitSpy).toHaveBeenCalledWith(0);
    // Guards: not stopping the scheduler before the swap (a stale cron would write into the new data)
    expect(getSchedulerStatus().enabled).toBe(false);
    // Exact directory listing: no .restore-*, .pre-restore-*, cornerstone-backup-*.db, manifest,
    // sidecars, extra.txt
    expect(readdirSync(env.dataDir).sort()).toEqual([DB_NAME, 'photos']);
    // Guards: merging instead of replacing (b.jpg would survive), or not restoring photos
    expect(readdirSync(join(env.dataDir, 'photos'))).toEqual(['a.jpg']);
    expect(readFileSync(join(env.dataDir, 'photos/a.jpg'), 'utf-8')).toBe('photo-a');
    // Guards: restoring the pre-restore db (it holds B)
    expect(readItems(env.dbPath)).toEqual(['A']);
    expect(logger.info).toHaveBeenCalledWith(
      { filename },
      'Restore completed; exiting so the restarted process opens the restored data',
    );
    // Guards: flushing the logger after exit/never (the last lines would be lost)
    expect(logger.flush).toHaveBeenCalledTimes(1);
    expect(logger.flush.mock.invocationCallOrder[0]!).toBeLessThan(
      exitSpy.mock.invocationCallOrder[0]!,
    );
  });

  it('closes the database before the swap and releases the operation lock afterwards', async () => {
    const { rawDb, filename } = await backupStateA();
    using _db = rawDb;
    expect(rawDb.open).toBe(true);

    await restore(drizzle(rawDb), filename);

    // Guards: swapping files under an open connection
    expect(rawDb.open).toBe(false);
    // Guards: a leaked operation lock (a backup of the restored data must be possible again)
    using reopened = disposableDb(env.dbPath);
    await expect(createBackup(drizzle(reopened), env.config)).resolves.toMatchObject({
      filename: expect.stringMatching(/\.tar\.gz$/),
    });
  });

  it('never renames the data directory itself and keeps its inode (it is a Docker VOLUME mount point)', async () => {
    const { rawDb, filename } = await backupStateA();
    using _db = rawDb;
    mutateToStateB(rawDb);
    const inoBefore = statSync(env.dataDir).ino;
    const syncRename = jest.spyOn(fs, 'renameSync');
    const asyncRename = jest.spyOn(fs.promises, 'rename');

    await restore(drizzle(rawDb), filename);

    expect(exitSpy).toHaveBeenCalledWith(0);
    // Guards: executeRestore renaming/recreating dataDir (EBUSY on a mount point, and a new inode)
    expect(statSync(env.dataDir).ino).toBe(inoBefore);
    const root = resolve(env.dataDir);
    const calls = [...syncRename.mock.calls, ...asyncRename.mock.calls].map(
      ([src, dest]) => [resolve(String(src)), resolve(String(dest))] as const,
    );
    // Non-vacuous: both the sync swap and the async normalization really renamed things
    expect(syncRename.mock.calls.length).toBeGreaterThan(0);
    expect(asyncRename.mock.calls.length).toBeGreaterThan(0);
    for (const [src, dest] of calls) {
      expect(src).not.toBe(root);
      expect(dest).not.toBe(root);
    }
  });

  it('restores when the backup directory parent is read-only (staging lives in the data volume, not beside the backups)', async () => {
    if (process.getuid?.() === 0) return; // chmod does not restrict root
    const { rawDb, filename } = await backupStateA();
    using _db = rawDb;
    mutateToStateB(rawDb);
    // The old implementation staged under dirname(backupDir), which is not writable here
    chmodSync(dirname(env.backupDir), 0o555);

    await restore(drizzle(rawDb), filename);

    // Guards: staging (or any write) under dirname(backupDir): EACCES -> RESTORE_FAILED, no exit
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(readItems(env.dbPath)).toEqual(['A']);
  });

  it('ignores reserved and manifest entries smuggled into an archive (lost+found, marker, staging, pre-restore)', async () => {
    const rawDb = seedLive(env, ['live']);
    using _db = rawDb;
    put(env.dataDir, 'lost+found/keep', 'original lost+found');
    await buildArchive(env, V1_ARCHIVE, (root) => {
      buildDbFile(join(root, 'data', DB_NAME), ['from-archive']).close();
      put(root, 'data/photos/a.jpg', 'photo');
      put(root, 'data/lost+found/injected', 'x');
      put(root, `data/${RESTORE_STATE_FILE}`, '{"phase":"swapped"}');
      put(root, 'data/.restore-staging-9/x', 'x');
      put(root, 'data/.pre-restore-9/x', 'x');
    });

    await restore(drizzle(rawDb), V1_ARCHIVE);

    // Guards: dropping the defensive reserved-entry removal (staged lost+found would collide with the
    // kept one and roll the restore back; a staged marker would hijack startup recovery)
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(readdirSync(env.dataDir).sort()).toEqual([DB_NAME, 'lost+found', 'photos']);
    expect(readdirSync(join(env.dataDir, 'lost+found'))).toEqual(['keep']);
    expect(readItems(env.dbPath)).toEqual(['from-archive']);
  });

  /** Phase A rejection with the data dir untouched and the database still open. */
  async function expectLayoutRejection(archivePaths: string[], populate: (root: string) => void) {
    const rawDb = seedLive(env, ['live']);
    using _db = rawDb;
    await buildArchive(env, V1_ARCHIVE, populate, archivePaths, true);
    const before = snapshotTree(env.dataDir);

    await beginRestore(env.config, V1_ARCHIVE);
    const failure = await executeRestore(
      drizzle(rawDb),
      env.config,
      V1_ARCHIVE,
      makeLogger().asFastify,
    ).catch((e: unknown) => e);

    expect(failure).toMatchObject({
      code: 'RESTORE_FAILED',
      message: 'Backup archive could not be extracted',
    });
    expect(exitSpy).not.toHaveBeenCalled();
    expect(snapshotTree(env.dataDir)).toEqual(before);
    expect(rawDb.open).toBe(true);
  }

  it('rejects "./"-prefixed archive paths as a layout error (no "." normalisation)', async () => {
    await expectLayoutRejection(['./data'], (root) => {
      buildDbFile(join(root, 'data', DB_NAME), ['dot-prefixed']).close();
    });
    const names = await listArchive(join(env.backupDir, V1_ARCHIVE));
    // Non-vacuous: the archive really carries "./" entries
    // Guards: normalising "." away (the restore would then fail with "no database" or succeed)
    expect(names).toEqual(['./data/', `./data/${DB_NAME}`]);
  });

  it('rejects an archive entry containing a ".." segment as a layout error', async () => {
    await expectLayoutRejection(['data', 'data/../escape.txt'], (root) => {
      buildDbFile(join(root, 'data', DB_NAME), ['x']).close();
      put(root, 'escape.txt', 'x');
    });
    const names = await listArchive(join(env.backupDir, V1_ARCHIVE));
    // Guards: letting ".." segments through the filter (path traversal out of staging)
    expect(names.some((n) => n.split('/').includes('..'))).toBe(true);
  });

  // ─── Scenario 8: v1 compatibility ────────────────────────────────────────

  describe('v1 archives (no manifest)', () => {
    it('prefers <archiveStem>.db over the live database and leaves no stale -wal behind', async () => {
      const rawDb = seedLive(env, ['current']);
      using _db = rawDb;
      await buildArchive(env, V1_ARCHIVE, (root) => {
        // A live DB with a stale -wal, as v1 archives captured them
        const liveInArchive = buildDbFile(join(root, 'data', DB_NAME), ['live'], { wal: true });
        liveInArchive.prepare('INSERT INTO items (v) VALUES (?)').run('live-wal-only');
        fs.copyFileSync(join(root, 'data', DB_NAME), join(root, 'data', `${DB_NAME}.copy`));
        fs.copyFileSync(
          join(root, 'data', `${DB_NAME}-wal`),
          join(root, 'data', `${DB_NAME}-wal.copy`),
        );
        liveInArchive.close();
        // Replace the (checkpointed on close) live files with the captured db + wal pair
        fs.renameSync(join(root, 'data', `${DB_NAME}.copy`), join(root, 'data', DB_NAME));
        fs.renameSync(
          join(root, 'data', `${DB_NAME}-wal.copy`),
          join(root, 'data', `${DB_NAME}-wal`),
        );
        buildDbFile(join(root, 'data', `${V1_STEM}.db`), ['snapshot']).close();
        put(root, 'data/photos/v1.jpg', 'v1');
      });

      await restore(drizzle(rawDb), V1_ARCHIVE);

      expect(exitSpy).toHaveBeenCalledWith(0);
      // Guards: restoring the live DB instead of the snapshot
      expect(readdirSync(env.dataDir).sort()).toEqual([DB_NAME, 'photos']);
      // (a surviving archive -wal would make the replaced database corrupt or stale)
      expect(readItems(env.dbPath)).toEqual(['snapshot']);
    });

    it('uses the single snapshot of a renamed archive, whatever its timestamp', async () => {
      const rawDb = seedLive(env, ['current']);
      using _db = rawDb;
      await buildArchive(env, V1_ARCHIVE, (root) => {
        buildDbFile(join(root, 'data', 'cornerstone-backup-2025-12-31T010101Z.db'), [
          'renamed-snapshot',
        ]).close();
        put(root, 'data/photos/v1.jpg', 'v1');
      });

      await restore(drizzle(rawDb), V1_ARCHIVE);

      // Guards: requiring the snapshot name to equal the archive stem
      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(readItems(env.dbPath)).toEqual(['renamed-snapshot']);
      expect(readdirSync(env.dataDir).sort()).toEqual([DB_NAME, 'photos']);
    });

    it('falls back to the live database when several unrelated snapshots exist and none matches the archive', async () => {
      const rawDb = seedLive(env, ['current']);
      using _db = rawDb;
      await buildArchive(env, V1_ARCHIVE, (root) => {
        buildDbFile(join(root, 'data', DB_NAME), ['live-in-archive']).close();
        buildDbFile(join(root, 'data', 'cornerstone-backup-a.db'), ['a']).close();
        buildDbFile(join(root, 'data', 'cornerstone-backup-b.db'), ['b']).close();
      });

      await restore(drizzle(rawDb), V1_ARCHIVE);

      // Guards: picking an arbitrary snapshot when the choice is ambiguous; leaving strays behind
      expect(readItems(env.dbPath)).toEqual(['live-in-archive']);
      expect(readdirSync(env.dataDir)).toEqual([DB_NAME]);
    });

    it('restores the live database including a row that exists only in its -wal file', async () => {
      const rawDb = seedLive(env, ['current']);
      using _db = rawDb;
      await buildArchive(env, V1_ARCHIVE, (root) => {
        const src = buildDbFile(join(root, 'data', 'src', DB_NAME), ['base'], { wal: true });
        // Move the base data into the main file, then add a row that stays WAL-only
        src.pragma('wal_checkpoint(TRUNCATE)');
        src.prepare('INSERT INTO items (v) VALUES (?)').run('wal-only');
        fs.copyFileSync(join(root, 'data', 'src', DB_NAME), join(root, 'data', DB_NAME));
        fs.copyFileSync(
          join(root, 'data', 'src', `${DB_NAME}-wal`),
          join(root, 'data', `${DB_NAME}-wal`),
        );
        src.close();
        fs.rmSync(join(root, 'data', 'src'), { recursive: true });
        // The archived main file alone must NOT contain the row
        expect(readItemsMainFileOnly(join(root, 'data', DB_NAME))).toEqual(['base']);
      });

      await restore(drizzle(rawDb), V1_ARCHIVE);

      // Guards: deleting the sidecars (or validating read-only), which loses the committed WAL-only row
      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(readItems(env.dbPath)).toEqual(['base', 'wal-only']);
      expect(readdirSync(env.dataDir)).toEqual([DB_NAME]);
    });

    it('accepts a backup whose applied migrations are older than the bundled ones', async () => {
      const rawDb = seedLive(env, ['current']);
      using _db = rawDb;
      const oldest = listMigrationFiles()[0]!;
      await buildArchive(env, V1_ARCHIVE, (root) => {
        buildDbFile(join(root, 'data', DB_NAME), ['old'], { applied: [oldest] }).close();
      });

      await restore(drizzle(rawDb), V1_ARCHIVE);

      // Guards: rejecting everything that is not exactly the newest bundled migration
      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(readItems(env.dbPath)).toEqual(['old']);
    });

    it('accepts a backup whose newest applied migration equals the newest bundled one', async () => {
      const rawDb = seedLive(env, ['current']);
      using _db = rawDb;
      const newest = listMigrationFiles().at(-1)!;
      await buildArchive(env, V1_ARCHIVE, (root) => {
        buildDbFile(join(root, 'data', DB_NAME), ['same'], { applied: [newest] }).close();
      });

      await restore(drizzle(rawDb), V1_ARCHIVE);

      // Guards: an off-by-one `>=` in the newer-version comparison
      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(readItems(env.dbPath)).toEqual(['same']);
    });
  });

  // ─── v2 manifest semantics ─────────────────────────────────────────────────

  describe('v2 manifest', () => {
    it('restores the database named by the manifest, not <archiveStem>.db', async () => {
      const rawDb = seedLive(env, ['current']);
      using _db = rawDb;
      await buildArchive(env, V1_ARCHIVE, (root) => {
        buildDbFile(join(root, 'data', `${V1_STEM}.db`), ['by-stem']).close();
        buildDbFile(join(root, 'data', 'cornerstone-backup-chosen.db'), ['by-manifest']).close();
        put(
          root,
          `data/${BACKUP_MANIFEST_FILE}`,
          JSON.stringify({ formatVersion: 2, database: 'cornerstone-backup-chosen.db' }),
        );
      });

      await restore(drizzle(rawDb), V1_ARCHIVE);

      // Guards: ignoring the manifest in favour of the stem heuristic
      expect(readItems(env.dbPath)).toEqual(['by-manifest']);
      expect(readdirSync(env.dataDir)).toEqual([DB_NAME]);
    });

    it('accepts formatVersion 1 and 2 (boundary of the newer-version check)', async () => {
      for (const formatVersion of [1, 2]) {
        const sub = disposableTempDir('cornerstone-fv-');
        const subBackups = disposableTempDir('cornerstone-fv-backups-');
        try {
          const e = makeEnv(sub, subBackups);
          const rawDb = disposableDb(e.dbPath);
          initSchema(rawDb, ['current']);
          await buildArchive(e, V1_ARCHIVE, (root) => {
            buildDbFile(join(root, 'data', `${V1_STEM}.db`), [`fv${formatVersion}`]).close();
            put(
              root,
              `data/${BACKUP_MANIFEST_FILE}`,
              JSON.stringify({ formatVersion, database: `${V1_STEM}.db` }),
            );
          });
          await beginRestore(e.config, V1_ARCHIVE);
          await executeRestore(drizzle(rawDb), e.config, V1_ARCHIVE, makeLogger().asFastify);
          // Guards: rejecting formatVersion <= 2 (an off-by-one `>= 2`)
          expect(readItems(e.dbPath)).toEqual([`fv${formatVersion}`]);
          rawDb[Symbol.dispose]();
        } finally {
          sub[Symbol.dispose]();
          subBackups[Symbol.dispose]();
        }
      }
      expect(exitSpy).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Scenario 9, 17: Phase A failures ─────────────────────────────────────

  describe('Phase A failures (database stays open, data untouched, lock released)', () => {
    /** Runs a restore that must fail in Phase A and asserts every invariant of that phase. */
    async function expectPhaseAFailure(
      build: () => Promise<void> | void,
      message: string,
      beforeFollowUp: () => void = () => {},
    ): Promise<void> {
      const rawDb = seedLive(env, ['live']);
      using _db = rawDb;
      put(env.dataDir, 'photos/live.jpg', 'live photo');
      put(env.dataDir, 'lost+found/keep', 'lf');
      await build();
      const before = snapshotTree(env.dataDir);
      const { logger, asFastify } = makeLogger();
      const db = drizzle(rawDb);

      await beginRestore(env.config, V1_ARCHIVE);
      const failure = await executeRestore(db, env.config, V1_ARCHIVE, asFastify).catch(
        (e: unknown) => e,
      );

      expect(failure).toMatchObject({ name: 'RestoreFailedError' });
      // Guards: a different/leaky message (exact text, no paths or raw fs errors)
      expectSanitizedFailure(failure, { code: 'RESTORE_FAILED', message }, [
        env.dataDir,
        env.backupDir,
        basename(env.dataDir),
      ]);
      // Guards: exiting (or swapping) despite a Phase A failure
      expect(exitSpy).not.toHaveBeenCalled();
      // Guards: any mutation of the data dir, including a leftover staging dir or marker
      expect(snapshotTree(env.dataDir)).toEqual(before);
      // Guards: closing the database before validation succeeded
      expect(rawDb.open).toBe(true);
      expect(rawDb.prepare('SELECT 1 AS x').get()).toEqual({ x: 1 });
      expect(logger.error).not.toHaveBeenCalled();
      // Guards: leaking the operation lock on a Phase A failure
      beforeFollowUp();
      await expect(createBackup(db, env.config)).resolves.toMatchObject({
        filename: expect.stringMatching(/\.tar\.gz$/),
      });
    }

    const validDb = (root: string, items = ['x']) =>
      buildDbFile(join(root, 'data', DB_NAME), items).close();

    it('rejects a non-SQLite database file (integrity check)', async () => {
      await expectPhaseAFailure(
        () =>
          buildArchive(env, V1_ARCHIVE, (root) => {
            put(root, `data/${DB_NAME}`, 'this is definitely not sqlite');
          }),
        'Backup database failed the integrity check',
      );
    });

    it('rejects an archive without any database', async () => {
      await expectPhaseAFailure(
        () =>
          buildArchive(env, V1_ARCHIVE, (root) => {
            put(root, 'data/photos/x.jpg', 'x');
          }),
        'Backup archive contains no database',
      );
    });

    it('rejects a database without a _migrations table', async () => {
      await expectPhaseAFailure(
        () =>
          buildArchive(env, V1_ARCHIVE, (root) => {
            buildDbFile(join(root, 'data', DB_NAME), ['x'], { migrations: false }).close();
          }),
        'Backup database failed the integrity check',
      );
    });

    it('rejects a database from a newer version (9999_future.sql applied)', async () => {
      await expectPhaseAFailure(
        () =>
          buildArchive(env, V1_ARCHIVE, (root) => {
            buildDbFile(join(root, 'data', DB_NAME), ['x'], {
              applied: ['9999_future.sql'],
            }).close();
          }),
        'Backup is from a newer version of Cornerstone',
      );
    });

    it('rejects a manifest with formatVersion 3 even when the database itself is valid', async () => {
      await expectPhaseAFailure(
        () =>
          buildArchive(env, V1_ARCHIVE, (root) => {
            buildDbFile(join(root, 'data', `${V1_STEM}.db`), ['x']).close();
            put(
              root,
              `data/${BACKUP_MANIFEST_FILE}`,
              JSON.stringify({ formatVersion: 3, database: `${V1_STEM}.db` }),
            );
          }),
        'Backup is from a newer version of Cornerstone',
      );
    });

    it('rejects a manifest that points at a missing file (no fallback to other candidates)', async () => {
      await expectPhaseAFailure(
        () =>
          buildArchive(env, V1_ARCHIVE, (root) => {
            validDb(root);
            put(
              root,
              `data/${BACKUP_MANIFEST_FILE}`,
              JSON.stringify({ formatVersion: 2, database: 'cornerstone-backup-missing.db' }),
            );
          }),
        'Backup manifest is invalid',
      );
    });

    it.each([
      ['not JSON', '{oops'],
      ['JSON null', 'null'],
      ['a JSON number (not an object)', '5'],
      ['a JSON string', '"cornerstone-backup-x.db"'],
      ['an array', '[]'],
      [
        'formatVersion as a string',
        JSON.stringify({ formatVersion: '2', database: `${V1_STEM}.db` }),
      ],
      ['no formatVersion', JSON.stringify({ database: `${V1_STEM}.db` })],
      ['database that is not a string', JSON.stringify({ formatVersion: 2, database: 7 })],
      ['database that is missing', JSON.stringify({ formatVersion: 2 })],
      [
        'database that does not match the snapshot pattern',
        JSON.stringify({ formatVersion: 2, database: DB_NAME }),
      ],
      [
        'database containing a path separator',
        JSON.stringify({ formatVersion: 2, database: 'cornerstone-backup-../escape.db' }),
      ],
      [
        'database containing a backslash',
        JSON.stringify({ formatVersion: 2, database: 'cornerstone-backup-..\\escape.db' }),
      ],
    ])('rejects a malformed manifest: %s', async (_label, manifest) => {
      await expectPhaseAFailure(
        () =>
          buildArchive(env, V1_ARCHIVE, (root) => {
            // A perfectly restorable database is present: only the manifest decides
            buildDbFile(join(root, 'data', `${V1_STEM}.db`), ['x']).close();
            validDb(root);
            put(root, `data/${BACKUP_MANIFEST_FILE}`, manifest);
          }),
        'Backup manifest is invalid',
      );
    });

    it('does not fall back to the live database when the <archiveStem>.db snapshot is corrupt', async () => {
      await expectPhaseAFailure(
        () =>
          buildArchive(env, V1_ARCHIVE, (root) => {
            put(root, `data/${V1_STEM}.db`, 'corrupt snapshot');
            validDb(root, ['valid live db']);
          }),
        'Backup database failed the integrity check',
      );
    });

    it('rejects an archive with two top-level directories (the filter sees pre-strip paths)', async () => {
      await expectPhaseAFailure(
        () =>
          buildArchive(
            env,
            V1_ARCHIVE,
            (root) => {
              validDb(root);
              put(root, 'other/x.txt', 'x');
            },
            ['data', 'other'],
          ),
        'Backup archive could not be extracted',
      );
    });

    it('rejects an archive whose first top-level directory is not the root of the rest', async () => {
      // Order matters: `other` is first, so `data` entries differ from the recorded root
      await expectPhaseAFailure(
        () =>
          buildArchive(
            env,
            V1_ARCHIVE,
            (root) => {
              validDb(root);
              put(root, 'other/x.txt', 'x');
            },
            ['other', 'data'],
          ),
        'Backup archive could not be extracted',
      );
    });

    it('rejects an archive whose only entry is a single-segment regular file', async () => {
      await expectPhaseAFailure(
        () =>
          buildArchive(env, V1_ARCHIVE, (root) => {
            // A regular FILE named like the archive root: first segment == root, no second segment
            put(root, 'data', 'i am a file, not the root directory');
          }),
        // Guards: skipping every single-segment entry silently (it would report "no database")
        'Backup archive could not be extracted',
      );
    });

    it('rejects an archive containing a symbolic link', async () => {
      await expectPhaseAFailure(
        () =>
          buildArchive(env, V1_ARCHIVE, (root) => {
            validDb(root);
            symlinkSync('/etc/passwd', join(root, 'data', 'link'));
          }),
        'Backup archive could not be extracted',
      );
    });

    it('rejects an archive containing a hard link', async () => {
      await expectPhaseAFailure(
        () =>
          buildArchive(env, V1_ARCHIVE, (root) => {
            validDb(root);
            put(root, 'data/a.txt', 'a');
            linkSync(join(root, 'data', 'a.txt'), join(root, 'data', 'b.txt'));
          }),
        'Backup archive could not be extracted',
      );
    });

    it('rejects a file that is not an archive at all, in the pre-pass (no free-space check, nothing extracted)', async () => {
      const statfsSpy = jest.spyOn(fs.promises, 'statfs');
      await expectPhaseAFailure(() => {
        mkdirSync(env.backupDir, { recursive: true });
        writeFileSync(join(env.backupDir, V1_ARCHIVE), 'not a real archive');
      }, 'Backup archive could not be extracted');
      // Guards: a pre-pass that lets zero-entry input through (it would reach statfs and extraction)
      expect(statfsSpy).not.toHaveBeenCalled();
    });

    it('rejects a valid but empty tar (zero entries) in the pre-pass', async () => {
      const statfsSpy = jest.spyOn(fs.promises, 'statfs');
      await expectPhaseAFailure(() => {
        mkdirSync(env.backupDir, { recursive: true });
        // An empty tar is just the two zero-filled end-of-archive blocks
        writeFileSync(join(env.backupDir, V1_ARCHIVE), gzipSync(Buffer.alloc(1024)));
      }, 'Backup archive could not be extracted');
      // Guards: dropping the `count === 0` rejection (the empty archive would otherwise fail later
      // with "contains no database", after statfs and extraction)
      expect(statfsSpy).not.toHaveBeenCalled();
    });

    /** Count and declared byte size of the archive, as the pre-pass computes them. */
    async function archiveTotals(file: string): Promise<{ count: number; bytes: number }> {
      let count = 0;
      let bytes = 0;
      await tar.list({
        file,
        onReadEntry: (entry) => {
          count += 1;
          bytes += entry.size ?? 0;
        },
      });
      return { count, bytes };
    }

    it('rejects with "Not enough free disk space" when required is one byte more than available', async () => {
      restoreLimits.freeSpaceMarginBytes = 5;
      await expectPhaseAFailure(async () => {
        await buildArchive(env, V1_ARCHIVE, (root) => {
          validDb(root);
          put(root, 'data/photos/a.jpg', 'x'.repeat(10_000));
        });
        const { count, bytes } = await archiveTotals(join(env.backupDir, V1_ARCHIVE));
        const required = bytes + count * PER_ENTRY_OVERHEAD_BYTES + 5;
        expect(bytes).toBeGreaterThan(10_000); // the size term is really non-zero
        jest
          .spyOn(fs.promises, 'statfs')
          .mockResolvedValue({ bavail: required - 1, bsize: 1 } as never);
      }, 'Not enough free disk space to restore this backup');
      // Guards: required dropping the entries' size, the per-entry overhead or the margin
      // (each lowers `required` below available, so the restore would go ahead and exit)
    });

    it('rejects when the volume has no free blocks at all', async () => {
      await expectPhaseAFailure(async () => {
        await buildArchive(env, V1_ARCHIVE, (root) => validDb(root));
        jest.spyOn(fs.promises, 'statfs').mockResolvedValue({ bavail: 0, bsize: 4096 } as never);
      }, 'Not enough free disk space to restore this backup');
    });

    it('rejects an archive with more entries than the cap, with the extraction message', async () => {
      await expectPhaseAFailure(async () => {
        await buildArchive(env, V1_ARCHIVE, (root) => {
          validDb(root);
          put(root, 'data/a.txt', 'a');
          put(root, 'data/b.txt', 'b');
        });
        const { count } = await archiveTotals(join(env.backupDir, V1_ARCHIVE));
        expect(count).toBeGreaterThan(3);
        restoreLimits.maxEntries = count - 1;
      }, 'Backup archive could not be extracted');
      // Guards: ignoring the cap (the archive is otherwise perfectly restorable)
    });

    it('rejects when the staging directory cannot be created because the data dir is read-only', async () => {
      if (process.getuid?.() === 0) return; // chmod does not restrict root
      await expectPhaseAFailure(
        async () => {
          await buildArchive(env, V1_ARCHIVE, (root) => validDb(root));
          chmodSync(env.dataDir, 0o555);
        },
        'Backup archive could not be extracted',
        () => chmodSync(env.dataDir, 0o755),
      );
    });
  });

  it('keeps the scheduler running and the database open when the restore marker cannot be written, and reports "could not be started"', async () => {
    const { rawDb, filename } = await backupStateA();
    using _db = rawDb;
    mutateToStateB(rawDb);
    initScheduler(drizzle(rawDb), makeConfig({ backupCadence: '0 2 * * *' }), mockLogger);
    expect(getSchedulerStatus().enabled).toBe(true);
    const before = snapshotTree(env.dataDir);
    jest.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
      throw Object.assign(new Error('ENOSPC: no space left'), { code: 'ENOSPC' });
    });

    await beginRestore(env.config, filename);
    const failure = await executeRestore(
      drizzle(rawDb),
      env.config,
      filename,
      makeLogger().asFastify,
    ).catch((e: unknown) => e);

    expect(failure).toMatchObject({ name: 'RestoreFailedError' });
    expectSanitizedFailure(
      failure,
      { code: 'RESTORE_FAILED', message: 'Restore could not be started' },
      [env.dataDir, env.backupDir],
    );
    expect(exitSpy).not.toHaveBeenCalled();
    // Guards: stopping the scheduler before the marker is durably written (the server keeps
    // running on the old data, so its backups must keep running too)
    expect(getSchedulerStatus().enabled).toBe(true);
    // Guards: leaving a marker, tmp file or staging directory behind
    expect(snapshotTree(env.dataDir)).toEqual(before);
    expect(rawDb.open).toBe(true);
    expect(rawDb.prepare('SELECT 1 AS x').get()).toEqual({ x: 1 });
    // Lock released
    await expect(createBackup(drizzle(rawDb), env.config)).resolves.toBeDefined();
  });

  it('keeps the scheduler running when Phase A rejects the archive', async () => {
    const rawDb = seedLive(env, ['live']);
    using _db = rawDb;
    initScheduler(drizzle(rawDb), makeConfig({ backupCadence: '0 2 * * *' }), mockLogger);
    await buildArchive(env, V1_ARCHIVE, (root) => {
      put(root, 'data/photos/x.jpg', 'no database here');
    });

    await beginRestore(env.config, V1_ARCHIVE);
    await expect(
      executeRestore(drizzle(rawDb), env.config, V1_ARCHIVE, makeLogger().asFastify),
    ).rejects.toMatchObject({ code: 'RESTORE_FAILED' });

    // Guards: stopping the scheduler before Phase A succeeded
    expect(getSchedulerStatus().enabled).toBe(true);
  });

  describe('pre-pass boundaries (restores that must still succeed)', () => {
    it('restores when required equals available exactly (required === available passes)', async () => {
      const { rawDb, filename } = await backupStateA();
      using _db = rawDb;
      restoreLimits.freeSpaceMarginBytes = 5;
      let count = 0;
      let bytes = 0;
      await tar.list({
        file: join(env.backupDir, filename),
        onReadEntry: (entry) => {
          count += 1;
          bytes += entry.size ?? 0;
        },
      });
      const statfsSpy = jest.spyOn(fs.promises, 'statfs').mockResolvedValue({
        bavail: bytes + count * PER_ENTRY_OVERHEAD_BYTES + 5,
        bsize: 1,
      } as never);

      await restore(drizzle(rawDb), filename);

      // Guards: an off-by-one `>=` in the free-space comparison
      expect(statfsSpy).toHaveBeenCalledWith(env.dataDir);
      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(readItems(env.dbPath)).toEqual(['A']);
    });

    it('restores when the entry count equals the cap exactly', async () => {
      const { rawDb, filename } = await backupStateA();
      using _db = rawDb;
      const names = await listArchive(join(env.backupDir, filename));
      restoreLimits.maxEntries = names.length;

      await restore(drizzle(rawDb), filename);

      // Guards: an off-by-one `>=` in the entry cap
      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(readItems(env.dbPath)).toEqual(['A']);
    });
  });

  describe('file modes', () => {
    const itNonRoot = process.getuid?.() === 0 ? it.skip : it;

    itNonRoot(
      'creates the swap directories with mode 0700 (captured while the swap runs)',
      async () => {
        const { rawDb, filename } = await backupStateA();
        using _db = rawDb;
        let stagingMode: number | undefined;
        let preMode: number | undefined;
        const real = fs.renameSync.bind(fs);
        jest.spyOn(fs, 'renameSync').mockImplementation(((src: string, dest: string) => {
          if (preMode === undefined && String(dest).includes('.pre-restore-')) {
            const names = readdirSync(env.dataDir);
            const staging = names.find((n) => n.startsWith('.restore-staging-'))!;
            const pre = names.find((n) => n.startsWith('.pre-restore-'))!;
            stagingMode = statSync(join(env.dataDir, staging)).mode & 0o777;
            preMode = statSync(join(env.dataDir, pre)).mode & 0o777;
          }
          return real(src, dest);
        }) as typeof fs.renameSync);

        await restore(drizzle(rawDb), filename);

        // Guards: default 0777 & ~umask (typically 0755) for staging or pre-restore
        expect(stagingMode).toBe(0o700);
        expect(preMode).toBe(0o700);
      },
    );
  });

  // ─── Scenarios 11-13: Phase B rollback, end to end ─────────────────────────

  describe('Phase B swap failures', () => {
    it('rolls back to byte-identical data and exits 1 when a rename fails while moving originals aside', async () => {
      const { rawDb, filename } = await backupStateA();
      using _db = rawDb;
      mutateToStateB(rawDb);
      const before = snapshotTree(env.dataDir);
      const { logger, asFastify } = makeLogger();
      injectRenameFailures([movingAside(2)]);

      await restore(drizzle(rawDb), filename, asFastify);

      // Guards: exiting 0 after a failed swap (would restart onto half-moved data)
      expect(exitSpy).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(1);
      // Guards: any residue (restored entries, staging, pre-restore, marker) or lost originals
      expect(snapshotTree(env.dataDir)).toEqual(before);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.objectContaining({ message: 'injected rename failure' }),
        }),
        'Restore failed during the data swap; original data reinstated, exiting',
      );
      expect(logger.flush).toHaveBeenCalledTimes(1);
      expect(logger.flush.mock.invocationCallOrder[0]!).toBeLessThan(
        exitSpy.mock.invocationCallOrder[0]!,
      );
    });

    it('rolls back to byte-identical data and exits 1 when a rename fails while moving restored entries in', async () => {
      const { rawDb, filename } = await backupStateA();
      using _db = rawDb;
      mutateToStateB(rawDb);
      const before = snapshotTree(env.dataDir);
      injectRenameFailures([movingIn(2)]);

      await restore(drizzle(rawDb), filename);

      expect(exitSpy).toHaveBeenCalledWith(1);
      // Guards: restored entries (A's db, a.jpg) left mixed into B's tree after the rollback
      expect(snapshotTree(env.dataDir)).toEqual(before);
      expect(readFileSync(join(env.dataDir, 'extra.txt'), 'utf-8')).toBe('extra');
      expect(readItems(env.dbPath)).toEqual(['A', 'B']);
    });

    it('keeps the marker when the rollback itself fails and startup recovery then reinstates every original', async () => {
      const { rawDb, filename } = await backupStateA();
      using _db = rawDb;
      mutateToStateB(rawDb);
      const before = snapshotTree(env.dataDir);
      const { logger, asFastify } = makeLogger();
      // Swap fails while moving in; the rollback then fails on its first move-back
      injectRenameFailures([movingIn(2), movingBack(1)]);

      await restore(drizzle(rawDb), filename, asFastify);

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.objectContaining({ message: 'injected rename failure' }),
          rollbackErr: expect.objectContaining({ message: 'injected rename failure' }),
          // The rollback flips the marker to moving-aside once restored entries are deleted
          phase: 'moving-aside',
        }),
        'Restore rollback failed; the restore marker was kept and startup recovery will finish the rollback',
      );
      // Guards: deleting the marker although the rollback did not complete
      const marker = JSON.parse(readFileSync(join(env.dataDir, RESTORE_STATE_FILE), 'utf-8'));
      expect(marker.phase).toBe('moving-aside');
      expect(logger.error).not.toHaveBeenCalledWith(
        expect.anything(),
        'Restore failed during the data swap; original data reinstated, exiting',
      );

      jest.restoreAllMocks();
      recoverInterruptedRestore(env.dataDir, DB_NAME, makeLogger().asFastify);

      // Guards: recovery leaving originals in pre-restore, or deleting any of them
      expect(snapshotTree(env.dataDir)).toEqual(before);
    });

    it('rolls back in-process (byte-identical, exit 1) when only the swapped marker flip fails', async () => {
      const { rawDb, filename } = await backupStateA();
      using _db = rawDb;
      mutateToStateB(rawDb);
      const before = snapshotTree(env.dataDir);
      const { logger, asFastify } = makeLogger();
      // tmp -> marker renames: 1 = initial marker, 2 = moving-in flip, 3 = swapped flip (fails)
      const real = fs.renameSync.bind(fs);
      let markerRenames = 0;
      jest.spyOn(fs, 'renameSync').mockImplementation(((src: string, dest: string) => {
        if (String(src).endsWith('.restore-state.json.tmp') && ++markerRenames === 3) {
          throw Object.assign(new Error('injected marker rename failure'), { code: 'EIO' });
        }
        return real(src, dest);
      }) as typeof fs.renameSync);

      await restore(drizzle(rawDb), filename, asFastify);

      // Non-vacuous: the failing flip was reached, i.e. all staged entries were already moved in
      expect(markerRenames).toBeGreaterThanOrEqual(3);
      expect(exitSpy).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(1);
      // Guards: marking the phase 'swapped' in memory before the marker is durable, which makes
      // rollbackSwap throw "Cannot roll back a completed swap" and strands a full swap on restart
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.objectContaining({ message: 'injected marker rename failure' }),
        }),
        'Restore failed during the data swap; original data reinstated, exiting',
      );
      expect(logger.error).not.toHaveBeenCalledWith(
        expect.anything(),
        'Restore rollback failed; the restore marker was kept and startup recovery will finish the rollback',
      );
      // Byte-identical: no marker, staging, pre-restore or restored entry remains
      expect(snapshotTree(env.dataDir)).toEqual(before);
    });

    it('does not lose originals when the rollback fails after reinstating one of them (data-loss regression)', async () => {
      const { rawDb, filename } = await backupStateA();
      using _db = rawDb;
      mutateToStateB(rawDb);
      const before = snapshotTree(env.dataDir);
      // Swap fails while moving in; rollback reinstates the first original, then fails on the second
      injectRenameFailures([movingIn(2), movingBack(2)]);

      await restore(drizzle(rawDb), filename);
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(readRestoreState(env.dataDir)?.phase).toBe('moving-aside');

      jest.restoreAllMocks();
      recoverInterruptedRestore(env.dataDir, DB_NAME, makeLogger().asFastify);

      // Guards: the marker staying at moving-in, so recovery re-deleted the reinstated original
      expect(snapshotTree(env.dataDir)).toEqual(before);
    });

    it('still exits 0 when the post-swap cleanup fails, and startup recovery finishes the cleanup', async () => {
      const { rawDb, filename } = await backupStateA();
      using _db = rawDb;
      mutateToStateB(rawDb);
      const { logger, asFastify } = makeLogger();
      const realRm = fs.rmSync.bind(fs);
      jest.spyOn(fs, 'rmSync').mockImplementation(((p: string, o?: fs.RmOptions) => {
        if (String(p).includes('.pre-restore-')) throw new Error('EBUSY');
        return realRm(p, o);
      }) as typeof fs.rmSync);

      await restore(drizzle(rawDb), filename, asFastify);

      // Guards: treating a cleanup failure as a failed restore (it must not roll back or exit 1)
      expect(exitSpy).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(logger.warn).toHaveBeenCalledWith(
        { err: expect.objectContaining({ message: 'EBUSY' }) },
        'Restore cleanup incomplete; startup recovery will finish it',
      );
      // Marker is deleted last, so it is still there with phase swapped
      expect(readRestoreState(env.dataDir)?.phase).toBe('swapped');
      expect(readItems(env.dbPath)).toEqual(['A']);

      jest.restoreAllMocks();
      recoverInterruptedRestore(env.dataDir, DB_NAME, makeLogger().asFastify);

      // Guards: recovery rolling back a swapped restore
      expect(readdirSync(env.dataDir).sort()).toEqual([DB_NAME, 'photos']);
      expect(readItems(env.dbPath)).toEqual(['A']);
    });
  });
});

/** Items of a WAL database's MAIN file only (a copy without its -wal), to prove the row is WAL-only. */
function readItemsMainFileOnly(file: string): string[] {
  const dir = disposableTempDir('cornerstone-mainonly-');
  try {
    const copy = join(dir.path, 'copy.db');
    fs.copyFileSync(file, copy);
    return readItems(copy);
  } finally {
    dir[Symbol.dispose]();
  }
}
