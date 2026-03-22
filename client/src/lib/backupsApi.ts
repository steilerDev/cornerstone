import { get, post, del } from './apiClient.js';
import type {
  BackupListResponse,
  BackupResponse,
  RestoreInitiatedResponse,
} from '@cornerstone/shared';

/**
 * List all backup archives.
 */
export function listBackups(): Promise<BackupListResponse> {
  return get<BackupListResponse>('/backups');
}

/**
 * Create a new backup archive.
 */
export function createBackup(): Promise<BackupResponse> {
  return post<BackupResponse>('/backups');
}

/**
 * Delete a backup archive by filename.
 */
export function deleteBackup(filename: string): Promise<void> {
  return del<void>(`/backups/${encodeURIComponent(filename)}`);
}

/**
 * Restore a backup archive by filename.
 * Initiates the restore process and restarts the server.
 */
export function restoreBackup(filename: string): Promise<RestoreInitiatedResponse> {
  return post<RestoreInitiatedResponse>(`/backups/${encodeURIComponent(filename)}/restore`);
}
