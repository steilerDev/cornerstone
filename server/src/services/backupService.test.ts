/**
 * Unit tests for backupService.ts
 *
 * EPIC-19: Backup and Restore Feature
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { writeFileSync, chmodSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { getTasks } from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import type { FastifyInstance } from 'fastify';
import { disposableTempDir, disposableDb } from '../test-helpers/disposables.js';
import type { DisposableTempDir } from '../test-helpers/disposables.js';

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

    it('executeRestore throws RESTORE_FAILED when the temporary extraction directory cannot be created, and releases the lock', async () => {
      using rawDb = disposableDb(join(tempDir.path, 'test.db'));
      const db = drizzle(rawDb);
      const backupDir = join(backupTempDir.path, 'backups');
      mkdirSync(backupDir);
      const filename = 'cornerstone-backup-2026-01-15T020000Z.tar.gz';
      writeFileSync(join(backupDir, filename), 'not a real archive');
      const config = makeConfig({ databaseUrl: join(tempDir.path, 'test.db'), backupDir });

      // Pin Date.now so the temp dir name is predictable, then occupy it with a regular file
      // so mkdir fails with EEXIST.
      jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
      writeFileSync(join(backupTempDir.path, '.restore-1700000000000'), 'x');

      await beginRestore(config, filename);
      const failure = await executeRestore(db, config, filename).catch((e: unknown) => e);
      expect(failure).toMatchObject({ name: 'RestoreFailedError' });
      expectSanitizedFailure(failure, { code: 'RESTORE_FAILED', message: 'Restore failed' }, [
        backupTempDir.path,
        '.restore-1700000000000',
      ]);

      // The lock taken by beginRestore was released by executeRestore's finally
      jest.restoreAllMocks();
      await expect(beginRestore(config, filename)).resolves.toBeUndefined();
      // release again so the module-level lock does not leak into other tests
      jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
      await expect(executeRestore(db, config, filename)).rejects.toMatchObject({
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

      await executeRestore(db, config, created.filename);
      expect(exitSpy).toHaveBeenCalledWith(0);

      // Lock released again after executeRestore
      await expect(beginRestore(config, created.filename)).resolves.toBeUndefined();
      jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
      writeFileSync(join(backupTempDir.path, '.restore-1700000000000'), 'x');
      await expect(executeRestore(db, config, created.filename)).rejects.toMatchObject({
        code: 'RESTORE_FAILED',
      });
    });

    it('executeRestore extracts a real archive over the data directory and then exits the process', async () => {
      using rawDb = disposableDb(join(tempDir.path, 'test.db'));
      const db = drizzle(rawDb);
      const config = makeConfig({
        databaseUrl: join(tempDir.path, 'test.db'),
        backupDir: join(backupTempDir.path, 'backups'),
      });
      const created = await createBackup(db, config);
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

      await beginRestore(config, created.filename);
      await executeRestore(db, config, created.filename);

      expect(exitSpy).toHaveBeenCalledWith(0);
      // The restored data directory exists again and the pre-restore copy was preserved
      expect(existsSync(tempDir.path)).toBe(true);
      expect(existsSync(join(tempDir.path, 'test.db'))).toBe(true);
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
