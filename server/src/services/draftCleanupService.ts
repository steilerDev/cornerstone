/**
 * Diary draft cleanup service.
 *
 * Manages automatic cleanup of orphan diary entry drafts based on retention policy.
 * Provides scheduled cron job for periodic cleanup of drafts older than the configured retention window.
 */

import cron, { type ScheduledTask } from 'node-cron';
import type { FastifyInstance } from 'fastify';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import type { AppConfig } from '../plugins/config.js';
import { findOrphanDraftIds, deleteDiaryEntry } from './diaryService.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Cron task handle for scheduled draft cleanup (if configured).
 */
let cronTask: ScheduledTask | undefined;

/**
 * Run orphan draft cleanup immediately.
 * Finds all drafts older than the retention window and deletes them.
 * Logs progress and any failures.
 */
export async function runOrphanCleanup(
  db: DbType,
  config: AppConfig,
  logger: FastifyInstance['log'],
): Promise<void> {
  const retentionDays = config.diaryDraftRetentionDays;
  if (retentionDays === 0) {
    logger.debug('Draft cleanup disabled (DIARY_DRAFT_RETENTION_DAYS=0)');
    return;
  }

  logger.info({ retentionDays }, 'Running orphan draft cleanup...');

  const ids = findOrphanDraftIds(db, retentionDays);
  if (ids.length === 0) {
    logger.info('No orphan drafts found');
    return;
  }

  let deleted = 0;
  let failed = 0;

  for (const id of ids) {
    try {
      await deleteDiaryEntry(db, id, config.photoStoragePath);
      deleted++;
    } catch (err) {
      logger.warn({ err, draftId: id }, 'Failed to delete orphan draft');
      failed++;
    }
  }

  logger.info({ deleted, failed }, 'Orphan draft cleanup complete');
}

/**
 * Initialize the draft cleanup scheduler.
 * Schedules a daily cleanup job at 3 AM UTC if retention is enabled (> 0 days).
 */
export function initScheduler(db: DbType, config: AppConfig, logger: FastifyInstance['log']): void {
  if (config.diaryDraftRetentionDays === 0) {
    logger.info('Draft cleanup disabled (DIARY_DRAFT_RETENTION_DAYS=0)');
    return;
  }

  try {
    cronTask = cron.schedule('0 3 * * *', async () => {
      try {
        await runOrphanCleanup(db, config, logger);
      } catch (err) {
        logger.error(err, 'Draft cleanup cron job failed');
      }
    });
    logger.info(
      { retentionDays: config.diaryDraftRetentionDays },
      'Draft cleanup scheduler initialized (daily at 3 AM UTC)',
    );
  } catch (err) {
    logger.error(err, 'Failed to initialize draft cleanup scheduler');
  }
}

/**
 * Stop the draft cleanup scheduler.
 * Called during application shutdown to clean up the cron task.
 */
export function stopScheduler(): void {
  if (cronTask) {
    cronTask.stop();
    cronTask = undefined;
  }
}
