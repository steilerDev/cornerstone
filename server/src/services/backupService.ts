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
import type { FastifyInstance } from 'fastify';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type Database from 'better-sqlite3';
import type { AppConfig } from '../plugins/config.js';
import type { BackupMeta, BackupSchedulerStatus } from '@cornerstone/shared';
import {
  BackupInProgressError,
  BackupNotFoundError,
  RestoreFailedError,
  BackupFailedError,
} from '../errors/AppError.js';

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
 * Uses SQLite's backup API to snapshot the live DB, then tars the entire app data directory.
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

    // Use better-sqlite3's backup API to safely snapshot the live database
    const dbSnapshotPath = path.join(dataDir, filename.replace('.tar.gz', '.db'));
    try {
      await getClient(db).backup(dbSnapshotPath);
    } catch (dbErr) {
      // Remove any partial snapshot file
      await fs.unlink(dbSnapshotPath).catch(() => {});
      throw new BackupFailedError('Database snapshot failed', dbErr);
    }

    // Create tar.gz archive of the entire app data directory
    try {
      await tar.create({ gzip: true, file: backupPath, cwd: path.dirname(dataDir) }, [
        path.basename(dataDir),
      ]);
    } catch (tarErr) {
      // Clean up the snapshot DB file and any partial archive on tar failure
      await fs.unlink(dbSnapshotPath).catch(() => {});
      await fs.unlink(backupPath).catch(() => {});
      throw new BackupFailedError('Backup archive could not be created', tarErr);
    }

    // Clean up the temporary backup database file
    await fs.unlink(dbSnapshotPath).catch(() => {});

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

/**
 * Extract the archive and swap the app data directory, then exit the process.
 * Requires a prior successful `beginRestore`; releases the lock if the restore fails.
 */
export async function executeRestore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Schema generic deliberately erased to accept any schema
  db: BetterSQLite3Database<any>,
  config: AppConfig,
  filename: string,
): Promise<void> {
  try {
    const backupPath = path.join(config.backupDir, filename);
    const dataDir = path.dirname(config.databaseUrl);

    // Create temp directory for extraction
    const tempDir = path.join(path.dirname(config.backupDir), `.restore-${Date.now()}`);
    try {
      await fs.mkdir(tempDir, { recursive: true });

      // Extract tar.gz to temp directory
      await tar.extract({ file: backupPath, cwd: tempDir });

      // Close database connection
      getClient(db).close();

      // Replace app data directory contents
      const extractedDataDir = path.join(tempDir, path.basename(dataDir));

      // Rename backup directory to preserve it
      const backupDataDir = dataDir + '.backup-' + Date.now();
      await fs.rename(dataDir, backupDataDir);

      // Move extracted data to the app data directory
      await fs.rename(extractedDataDir, dataDir);

      // Clean up temp directory
      await fs.rm(tempDir, { recursive: true, force: true });

      // Exit process to reinitialize with restored data
      process.exit(0);
    } catch (error) {
      // Clean up temp directory on error
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      throw new RestoreFailedError('Restore failed', error);
    }
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
