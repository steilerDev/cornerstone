/**
 * Backup/Restore API types
 *
 * EPIC-19: Backup and Restore Feature
 *
 * Manages database and file system snapshots for disaster recovery.
 */

/** Single backup archive metadata */
export interface BackupMeta {
  filename: string;
  createdAt: string; // ISO 8601
  sizeBytes: number;
}

/** Response for creating a backup */
export interface BackupResponse {
  backup: BackupMeta;
}

/** Response for listing all backups */
export interface BackupListResponse {
  backups: BackupMeta[];
}

/** Response when restore is initiated */
export interface RestoreInitiatedResponse {
  message: string;
}

/** Outcome of the automatic backup scheduler's most recent run */
export interface BackupSchedulerLastRun {
  timestamp: string; // ISO 8601 UTC
  success: boolean;
}

/** Automatic backup scheduler status */
export interface BackupSchedulerStatus {
  /** Whether the automatic scheduler is currently active (a valid BACKUP_CADENCE is configured) */
  enabled: boolean;
  /** Outcome of the most recent scheduled run, or null if none has run yet */
  lastRun: BackupSchedulerLastRun | null;
  /** Upcoming scheduled run times (ISO 8601 UTC), ascending order; empty when disabled */
  nextRuns: string[];
}

/** Response for the scheduler status endpoint */
export interface BackupSchedulerStatusResponse {
  scheduler: BackupSchedulerStatus;
}
