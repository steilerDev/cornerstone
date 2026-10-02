/**
 * Backup and restore service.
 *
 * EPIC-19: Backup and Restore Feature
 *
 * Handles creating, listing, deleting, and restoring database backups.
 * Manages automatic scheduled backups and retention policy enforcement.
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import * as tar from 'tar';
import cron, { type ScheduledTask } from 'node-cron';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import type { AppConfig } from '../plugins/config.js';
import type { BackupMeta, BackupSchedulerStatus } from '@cornerstone/shared';
import {
  BackupInProgressError,
  BackupNotFoundError,
  RestoreFailedError,
  BackupFailedError,
} from '../errors/AppError.js';
import { listMigrationFiles } from '../db/migrate.js';
import {
  BACKUP_MANIFEST_FILE,
  BACKUP_SNAPSHOT_PATTERN,
  PRE_RESTORE_PREFIX,
  RESTORE_STAGING_PREFIX,
  RESTORE_STATE_FILE,
  RESTORE_STATE_TMP,
  dbSidecars,
  finalizeSwap,
  isExcludedFromArchive,
  isRestoreReservedEntry,
  rollbackSwap,
  swapIntoDataDir,
  writeRestoreState,
  type RestoreState,
} from './restoreSwap.js';

/**
 * Extract the underlying better-sqlite3 Database instance from a Drizzle ORM wrapper.
 * The Drizzle wrapper augments the Database instance with a $client property.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Schema generic deliberately erased to accept any schema
function getClient(db: BetterSQLite3Database<any>): Database.Database {
  return (db as unknown as { $client: Database.Database }).$client;
}

/**
 * Backup filename format: cornerstone-backup-YYYY-MM-DDTHHMMSSZ.tar.gz
 * Pattern validates UTC timestamp format.
 */
const BACKUP_FILENAME_PATTERN = /^cornerstone-backup-\d{4}-\d{2}-\d{2}T\d{6}Z\.tar\.gz$/;

/**
 * Singleton operation guard to prevent concurrent backups/restores.
 */
let operationInProgress = false;

/**
 * Cron task handle for scheduled backups (if configured).
 */
let cronTask: ScheduledTask | undefined;

/**
 * Generate a backup filename with UTC timestamp.
 * Format: cornerstone-backup-YYYY-MM-DDTHHMMSSZ.tar.gz
 */
export function generateBackupFilename(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');
  return `cornerstone-backup-${year}-${month}-${day}T${hours}${minutes}${seconds}Z.tar.gz`;
}

/**
 * Parse a backup filename to extract the creation timestamp.
 * Returns the ISO 8601 datetime string or null if invalid.
 */
export function parseBackupFilename(filename: string): string | null {
  // Extract timestamp from format: cornerstone-backup-YYYY-MM-DDTHHMMSSZ.tar.gz
  const match = filename.match(
    /cornerstone-backup-(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})(\d{2})Z\.tar\.gz/,
  );
  if (!match) return null;

  const [, year, month, day, hours, minutes, seconds] = match;
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000Z`;
}

/**
 * Validate that a filename matches the backup naming pattern and has no path traversal.
 */
export function validateBackupFilename(filename: string): boolean {
  // Reject if contains path separators (traversal attempt)
  if (filename.includes('/') || filename.includes('\\')) {
    return false;
  }
  return BACKUP_FILENAME_PATTERN.test(filename);
}

/**
 * List all backup archives in the backup directory.
 * Returns array sorted newest-first by creation timestamp.
 */
export async function listBackups(backupDir: string): Promise<BackupMeta[]> {
  try {
    const entries = await fs.readdir(backupDir, { withFileTypes: true });
    const backups: BackupMeta[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !validateBackupFilename(entry.name)) {
        continue;
      }

      const createdAt = parseBackupFilename(entry.name);
      if (!createdAt) continue;

      const filePath = path.join(backupDir, entry.name);
      const stats = await fs.stat(filePath);

      backups.push({
        filename: entry.name,
        createdAt,
        sizeBytes: stats.size,
      });
    }

    // Sort newest-first by creation timestamp
    backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return backups;
  } catch (error) {
    // If directory doesn't exist yet, return empty list
    if ((error as unknown as { code: string }).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Create a backup of the database and associated files.
 *
 * Writes a v2 archive: a consistent snapshot of the live database (via SQLite's backup API),
 * a manifest naming that snapshot, and the rest of the data directory. The live database,
 * its WAL/SHM/journal sidecars, stray snapshots and restore-machinery entries are excluded.
 * Enforces retention policy by deleting oldest archives if count exceeds the limit.
 */
export async function createBackup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Schema generic deliberately erased to accept any schema
  db: BetterSQLite3Database<any>,
  config: AppConfig,
): Promise<BackupMeta> {
  if (operationInProgress) {
    throw new BackupInProgressError();
  }

  operationInProgress = true;
  try {
    // Ensure backup directory exists and is writable
    const probeFile = path.join(config.backupDir, `.write-check-${Date.now()}`);
    try {
      await fs.mkdir(config.backupDir, { recursive: true });
      await fs.writeFile(probeFile, '');
      await fs.unlink(probeFile);
    } catch (probeErr) {
      throw new BackupFailedError(
        'Backup directory could not be created or is not writable',
        probeErr,
      );
    }

    const filename = generateBackupFilename();
    const backupPath = path.join(config.backupDir, filename);
    const dataDir = path.dirname(config.databaseUrl);
    const dbName = path.basename(config.databaseUrl);
    const archiveStem = filename.replace('.tar.gz', '');
    const snapshotName = `${archiveStem}.db`;
    const dbSnapshotPath = path.join(dataDir, snapshotName);
    const manifestPath = path.join(dataDir, BACKUP_MANIFEST_FILE);

    try {
      // Use better-sqlite3's backup API to safely snapshot the live database
      try {
        await getClient(db).backup(dbSnapshotPath);
      } catch (dbErr) {
        throw new BackupFailedError('Database snapshot failed', dbErr);
      }

      try {
        await fs.writeFile(
          manifestPath,
          JSON.stringify({
            formatVersion: 2,
            database: snapshotName,
            createdAt: parseBackupFilename(filename),
          }),
        );
      } catch (manifestErr) {
        throw new BackupFailedError('Backup archive could not be created', manifestErr);
      }

      // Archive the data directory, excluding the live DB, its sidecars and restore artifacts.
      // In create, filter receives cwd-relative paths such as "data/x".
      try {
        await tar.create(
          {
            gzip: true,
            file: backupPath,
            cwd: path.dirname(dataDir),
            filter: (p) => {
              const parts = p.split('/').filter(Boolean);
              return parts.length !== 2 || !isExcludedFromArchive(parts[1]!, dbName, snapshotName);
            },
          },
          [path.basename(dataDir)],
        );
      } catch (tarErr) {
        await fs.unlink(backupPath).catch(() => {});
        throw new BackupFailedError('Backup archive could not be created', tarErr);
      }
    } finally {
      await fs.unlink(dbSnapshotPath).catch(() => {});
      await fs.unlink(manifestPath).catch(() => {});
    }

    // Get metadata for the created backup
    const stats = await fs.stat(backupPath);
    const createdAt = parseBackupFilename(filename);

    const backup: BackupMeta = {
      filename,
      createdAt: createdAt!,
      sizeBytes: stats.size,
    };

    // Enforce retention policy
    if (config.backupRetention) {
      const allBackups = await listBackups(config.backupDir);
      if (allBackups.length > config.backupRetention) {
        // Delete oldest archives to meet retention limit
        const toDelete = allBackups.slice(config.backupRetention);
        for (const oldBackup of toDelete) {
          await fs.unlink(path.join(config.backupDir, oldBackup.filename)).catch(() => {});
        }
      }
    }

    return backup;
  } finally {
    operationInProgress = false;
  }
}

/**
 * Delete a specific backup file.
 */
export async function deleteBackup(backupDir: string, filename: string): Promise<void> {
  if (!validateBackupFilename(filename)) {
    throw new BackupNotFoundError();
  }

  const filePath = path.join(backupDir, filename);

  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as unknown as { code: string }).code === 'ENOENT') {
      throw new BackupNotFoundError();
    }
    throw error;
  }
}

/**
 * Validate a restore request and take the operation lock.
 * Runs before the HTTP reply so 404/409/500 errors reach the client.
 * On success the caller owns the lock and MUST call `executeRestore`, which releases it on failure.
 */
export async function beginRestore(config: AppConfig, filename: string): Promise<void> {
  if (!validateBackupFilename(filename)) {
    throw new BackupNotFoundError();
  }

  if (operationInProgress) {
    throw new BackupInProgressError();
  }

  const backupPath = path.join(config.backupDir, filename);
  try {
    await fs.access(backupPath, fs.constants.R_OK);
  } catch (error) {
    if ((error as unknown as { code: string }).code === 'ENOENT') {
      throw new BackupNotFoundError();
    }
    throw new RestoreFailedError('Backup archive could not be read', error);
  }

  // Re-check after the await: another operation may have started meanwhile
  if (operationInProgress) {
    throw new BackupInProgressError();
  }
  operationInProgress = true;
}

/** Phase A failure carrying the path-free message surfaced as RestoreFailedError. */
class StageError extends Error {
  constructor(
    readonly userMessage: string,
    cause?: unknown,
  ) {
    super(userMessage, { cause });
  }
}

function flushLogger(logger: FastifyBaseLogger): void {
  (logger as { flush?: () => void }).flush?.();
}

/** Remove a staged file together with its SQLite sidecars. */
async function rmDbWithSidecars(dir: string, dbName: string): Promise<void> {
  for (const name of [dbName, ...dbSidecars(dbName)]) {
    await fs.rm(path.join(dir, name), { recursive: true, force: true });
  }
}

/** Extract the archive into staging, rejecting unsafe or oddly shaped entries. */
async function extractToStaging(backupPath: string, staging: string): Promise<void> {
  let root: string | undefined;
  let layoutError = false;
  await tar.extract({
    file: backupPath,
    cwd: staging,
    strip: 1,
    // In extract, filter receives the pre-strip path (e.g. "data/x")
    filter: (p, entry) => {
      // Only a trailing slash (directory entries) is dropped; '.', '..' and empty segments are
      // not normalised, matching tar's strip, which removes exactly the first path component.
      const parts = p.replace(/\/+$/, '').split('/');
      const type = (entry as { type?: string }).type;
      if (root === undefined) root = parts[0];
      if (
        parts.some((seg) => seg === '' || seg === '.' || seg === '..') ||
        parts[0] !== root ||
        type === 'SymbolicLink' ||
        type === 'Link'
      ) {
        layoutError = true;
        return false;
      }
      if (parts.length < 2) {
        // The archive's root directory entry itself is expected; anything else is malformed
        if (type !== 'Directory') layoutError = true;
        return false;
      }
      return true;
    },
  });
  if (layoutError) {
    throw new StageError('Backup archive could not be extracted');
  }
}

/** Pick the snapshot to restore (manifest, then v1 precedence) and normalize it to dbName. */
async function resolveStagedDatabase(
  staging: string,
  dbName: string,
  archiveStem: string,
): Promise<void> {
  const entries = await fs.readdir(staging);
  const snapshots = entries.filter((e) => BACKUP_SNAPSHOT_PATTERN.test(e));
  let chosen: string;

  const manifestPath = path.join(staging, BACKUP_MANIFEST_FILE);
  if (entries.includes(BACKUP_MANIFEST_FILE)) {
    let manifest: { formatVersion?: unknown; database?: unknown };
    try {
      manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
    } catch (e) {
      throw new StageError('Backup manifest is invalid', e);
    }
    const database = manifest?.database;
    if (
      typeof manifest !== 'object' ||
      manifest === null ||
      typeof manifest.formatVersion !== 'number' ||
      typeof database !== 'string' ||
      !BACKUP_SNAPSHOT_PATTERN.test(database) ||
      database.includes('/') ||
      database.includes('\\') ||
      !entries.includes(database)
    ) {
      throw new StageError('Backup manifest is invalid');
    }
    if (manifest.formatVersion > 2) {
      throw new StageError('Backup is from a newer version of Cornerstone');
    }
    chosen = database;
  } else if (entries.includes(`${archiveStem}.db`)) {
    chosen = `${archiveStem}.db`;
  } else if (snapshots.length === 1) {
    chosen = snapshots[0]!;
  } else if (entries.includes(dbName)) {
    chosen = dbName;
  } else {
    throw new StageError('Backup archive contains no database');
  }

  if (chosen !== dbName) {
    await rmDbWithSidecars(staging, dbName);
    await fs.rename(path.join(staging, chosen), path.join(staging, dbName));
  }
  for (const snapshot of snapshots) {
    await fs.rm(path.join(staging, snapshot), { force: true });
  }
  await fs.rm(manifestPath, { force: true });
}

/** Open the staged database read-write, check integrity and migration compatibility. */
function validateStagedDatabase(stagedDb: string): void {
  let v: Database.Database;
  try {
    v = new Database(stagedDb, { fileMustExist: true });
  } catch (e) {
    throw new StageError('Backup database failed the integrity check', e);
  }
  try {
    if (v.pragma('quick_check', { simple: true }) !== 'ok') {
      throw new StageError('Backup database failed the integrity check');
    }
    const hasTable = v
      .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='_migrations'`)
      .get();
    if (!hasTable) {
      throw new StageError('Backup database failed the integrity check');
    }
    const maxApplied = (
      v.prepare('SELECT MAX(name) AS m FROM _migrations').get() as { m: string | null }
    ).m;
    const maxBundled = listMigrationFiles().at(-1) ?? null;
    if (maxApplied !== null && (maxBundled === null || maxApplied > maxBundled)) {
      throw new StageError('Backup is from a newer version of Cornerstone');
    }
  } catch (e) {
    throw e instanceof StageError
      ? e
      : new StageError('Backup database failed the integrity check', e);
  } finally {
    v.close();
  }
}

/**
 * Restore the app data directory from a backup archive, then exit the process.
 *
 * Phase A (async, database still open): extract into a staging directory inside the data
 * volume, resolve and validate the database. Any failure removes staging and rejects with
 * RestoreFailedError; the server keeps serving the old data.
 *
 * Phase B (synchronous): write the restore marker, close the database, move the current
 * contents aside and the staged contents in (the data directory itself is never renamed, as
 * it is typically a volume mount point). On failure the swap is rolled back and the process
 * exits 1; on success it exits 0 so the restarted process opens the restored data.
 *
 * Requires a prior successful `beginRestore`; releases the lock if the restore fails.
 */
export async function executeRestore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Schema generic deliberately erased to accept any schema
  db: BetterSQLite3Database<any>,
  config: AppConfig,
  filename: string,
  logger: FastifyBaseLogger,
): Promise<void> {
  try {
    const backupPath = path.join(config.backupDir, filename);
    const dataDir = path.dirname(config.databaseUrl);
    const dbName = path.basename(config.databaseUrl);
    const archiveStem = filename.replace('.tar.gz', '');
    const ts = Date.now();
    const stagingName = RESTORE_STAGING_PREFIX + ts;
    const preName = PRE_RESTORE_PREFIX + ts;
    const staging = path.join(dataDir, stagingName);

    // Phase A: stage and validate while the database stays open
    try {
      await fs.mkdir(staging);
      await extractToStaging(backupPath, staging);

      for (const entry of await fs.readdir(staging)) {
        if (isRestoreReservedEntry(entry)) {
          await fs.rm(path.join(staging, entry), { recursive: true, force: true });
        }
      }

      await resolveStagedDatabase(staging, dbName, archiveStem);
      validateStagedDatabase(path.join(staging, dbName));
    } catch (error) {
      await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
      if (error instanceof StageError) {
        throw new RestoreFailedError(error.userMessage, error.cause ?? error);
      }
      throw new RestoreFailedError('Backup archive could not be extracted', error);
    }

    // Phase B: swap the contents of the data directory
    const state: RestoreState = {
      phase: 'moving-aside',
      staging: stagingName,
      preRestore: preName,
    };
    try {
      writeRestoreState(dataDir, state);
    } catch (error) {
      // Still Phase A semantics: database open, nothing moved
      await fs.rm(path.join(dataDir, RESTORE_STATE_FILE), { force: true }).catch(() => {});
      await fs.rm(path.join(dataDir, RESTORE_STATE_TMP), { force: true }).catch(() => {});
      await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
      throw new RestoreFailedError('Restore could not be started', error);
    }

    // Marker is durable; from here the restore is committed, so stop scheduled backups
    stopScheduler();
    try {
      getClient(db).close();
      swapIntoDataDir(dataDir, state);
    } catch (swapErr) {
      try {
        rollbackSwap(dataDir, state);
        logger.error(
          { err: swapErr, staging: stagingName, preRestore: preName },
          'Restore failed during the data swap; original data reinstated, exiting',
        );
      } catch (rbErr) {
        logger.error(
          {
            err: swapErr,
            rollbackErr: rbErr,
            staging: stagingName,
            preRestore: preName,
            phase: state.phase,
          },
          'Restore rollback failed; the restore marker was kept and startup recovery will finish the rollback',
        );
      }
      flushLogger(logger);
      process.exit(1);
      return;
    }

    try {
      finalizeSwap(dataDir, state);
    } catch (error) {
      logger.warn({ err: error }, 'Restore cleanup incomplete; startup recovery will finish it');
    }
    logger.info(
      { filename },
      'Restore completed; exiting so the restarted process opens the restored data',
    );
    flushLogger(logger);
    process.exit(0);
    return;
  } finally {
    operationInProgress = false;
  }
}

/**
 * Initialize the automatic backup scheduler if BACKUP_CADENCE is configured.
 *
 * Uses `cron.validateDetailed()` (node-cron 4.4+) to validate the cadence up front,
 * producing field-level error messages instead of relying on `cron.schedule` throwing.
 */
export function initScheduler(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Schema generic deliberately erased to accept any schema
  db: BetterSQLite3Database<any>,
  config: AppConfig,
  logger: FastifyInstance['log'],
): void {
  if (!config.backupCadence) {
    return;
  }

  const validation = cron.validateDetailed(config.backupCadence);
  if (!validation.valid) {
    const fieldErrors = validation.errors
      .map((fieldError) => `${fieldError.field}: ${fieldError.message}`)
      .join('; ');
    logger.error(
      `Invalid BACKUP_CADENCE expression "${config.backupCadence}" — automatic backups disabled. ${fieldErrors}`,
    );
    return;
  }

  try {
    cronTask = cron.schedule(
      config.backupCadence,
      async () => {
        logger.info('Starting scheduled backup...');
        try {
          await createBackup(db, config);
          logger.info('Scheduled backup completed successfully');
        } catch (error) {
          logger.error(error, 'Scheduled backup failed');
          // Rethrow so node-cron's runner records this execution as failed
          // (cronTask.lastRun().error) instead of always reporting success.
          throw error;
        }
      },
      {
        name: 'backup-scheduler',
        logger: {
          info: (message: string) => logger.info(message),
          warn: (message: string) => logger.warn(message),
          error: (message: string | Error, err?: Error) => logger.error(err ?? message),
          debug: (message: string | Error) => logger.debug(message),
        },
      },
    );

    logger.info(`Backup scheduler initialized with cadence: ${config.backupCadence}`);
  } catch (error) {
    logger.error(error, 'Failed to initialize backup scheduler');
  }
}

/**
 * Get the current status of the automatic backup scheduler.
 * Returns `enabled: false` with empty `nextRuns` when no cadence is configured,
 * or the configured cadence failed validation in `initScheduler`.
 */
export function getSchedulerStatus(): BackupSchedulerStatus {
  if (!cronTask) {
    return { enabled: false, lastRun: null, nextRuns: [] };
  }

  const last = cronTask.lastRun();
  const nextRuns = cronTask.getNextRuns(2).map((date) => date.toISOString());

  return {
    enabled: true,
    lastRun: last ? { timestamp: last.date.toISOString(), success: !last.error } : null,
    nextRuns,
  };
}

/**
 * Stop the automatic backup scheduler.
 */
export function stopScheduler(): void {
  if (cronTask) {
    cronTask.stop();
    cronTask = undefined;
  }
}
