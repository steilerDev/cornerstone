/**
 * Unit tests for backupService.ts
 *
 * EPIC-19: Backup and Restore Feature
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { writeFileSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/better-sqlite3';
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
  currency: 'EUR',
  backupEnabled: true,
  backupDir: '/tmp/test-backups',
  backupCadence: undefined,
  backupRetention: undefined,
  ...overrides,
});

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

  // ─── createBackup — operation guard ──────────────────────────────────────

  describe('createBackup() — guard conditions', () => {
    it('throws BackupNotConfiguredError (code BACKUP_NOT_CONFIGURED) when backupEnabled is false', async () => {
      const db = {} as any;
      const config = makeConfig({ backupEnabled: false });

      await expect(createBackup(db, config)).rejects.toMatchObject({
        code: 'BACKUP_NOT_CONFIGURED',
      });
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
        backupEnabled: true,
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
        backupEnabled: true,
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
      } as any;

      const config = makeConfig({
        databaseUrl: join(tempDir.path, 'test.db'),
        backupDir: backupTempDir.path,
        backupEnabled: true,
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
        backupEnabled: true,
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
});
