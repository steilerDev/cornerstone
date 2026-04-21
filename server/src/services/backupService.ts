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
import type { BackupMeta } from '@cornerstone/shared';
import {
  BackupNotConfiguredError,
  BackupInProgressError,
  BackupNotFoundError,
  RestoreFailedError,
  BackupFailedError,
} from '../errors/AppError.js';

/**
 * Extract the underlying better-sqlite3 Database instance from a Drizzle ORM wrapper.
 * The Drizzle wrapper augments the Database instance with a $client property.
 */
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
  db: BetterSQLite3Database<any>,
  config: AppConfig,
): Promise<BackupMeta> {
  if (!config.backupEnabled) {
    throw new BackupNotConfiguredError();
  }

  if (operationInProgress) {
    throw new BackupInProgressError();
  }

  operationInProgress = true;
  try {
    // Ensure backup directory exists
    await fs.mkdir(config.backupDir, { recursive: true });

    // Verify backup directory is writable
    const probeFile = path.join(config.backupDir, `.write-check-${Date.now()}`);
    try {
      await fs.writeFile(probeFile, '');
      await fs.unlink(probeFile);
    } catch (probeErr) {
      throw new BackupFailedError(
        `Backup directory is not writable: ${(probeErr as Error).message}`,
        { backupDir: config.backupDir },
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
      throw new BackupFailedError(`Database backup failed: ${(dbErr as Error).message}`, {
        code: (dbErr as { code?: string }).code,
      });
    }

    // Create tar.gz archive of the entire app data directory
    try {
      await tar.create({ gzip: true, file: backupPath, cwd: path.dirname(dataDir) }, [
        path.basename(dataDir),
      ]);
    } catch (tarErr) {
      // Clean up the snapshot DB file on tar failure
      await fs.unlink(dbSnapshotPath).catch(() => {});
      throw new BackupFailedError(`Backup archive creation failed: ${(tarErr as Error).message}`);
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
    throw new BackupNotFoundError(filename);
  }

  const filePath = path.join(backupDir, filename);

  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as unknown as { code: string }).code === 'ENOENT') {
      throw new BackupNotFoundError(filename);
    }
    throw error;
  }
}

/**
 * Restore the database and app data from a backup archive.
 * Closes the DB connection, extracts the archive to replace app data directory, then exits.
 */
export async function restoreBackup(
  db: BetterSQLite3Database<any>,
  config: AppConfig,
  filename: string,
): Promise<void> {
  if (!config.backupEnabled) {
    throw new BackupNotConfiguredError();
  }

  if (operationInProgress) {
    throw new BackupInProgressError();
  }

  if (!validateBackupFilename(filename)) {
    throw new BackupNotFoundError(filename);
  }

  operationInProgress = true;

  try {
    const backupPath = path.join(config.backupDir, filename);
    const dataDir = path.dirname(config.databaseUrl);

    // Verify backup exists
    try {
      await fs.stat(backupPath);
    } catch (error) {
      if ((error as unknown as { code: string }).code === 'ENOENT') {
        throw new BackupNotFoundError(filename);
      }
      throw error;
    }

    // Create temp directory for extraction
    const tempDir = path.join(path.dirname(config.backupDir), `.restore-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    try {
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
      throw new RestoreFailedError(
        error instanceof Error ? error.message : 'Unknown error during restore',
      );
    }
  } finally {
    operationInProgress = false;
  }
}

/**
 * Initialize the automatic backup scheduler if BACKUP_CADENCE is configured.
 */
export function initScheduler(
  db: BetterSQLite3Database<any>,
  config: AppConfig,
  logger: FastifyInstance['log'],
): void {
  if (!config.backupCadence || !config.backupEnabled) {
    return;
  }

  try {
    // Validate cron expression (will throw if invalid)
    cronTask = cron.schedule(config.backupCadence, async () => {
      try {
        logger.info('Starting scheduled backup...');
        await createBackup(db, config);
        logger.info('Scheduled backup completed successfully');
      } catch (error) {
        logger.error(error, 'Scheduled backup failed');
      }
    });

    logger.info(`Backup scheduler initialized with cadence: ${config.backupCadence}`);
  } catch (error) {
    logger.error(error, 'Failed to initialize backup scheduler');
  }
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
