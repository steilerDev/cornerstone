import { post } from './apiClient.js';
import type { UndoResponse } from '@cornerstone/shared';

/**
 * Restores the snapshot behind an undo token (single use, valid for UNDO_WINDOW_MS).
 * 404: unknown, expired, used or another user's token. 409: a restored row changed since.
 */
export function undoChange(token: string): Promise<UndoResponse> {
  return post<UndoResponse>(`/undo/${encodeURIComponent(token)}`);
}
