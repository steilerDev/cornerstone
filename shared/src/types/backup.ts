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
