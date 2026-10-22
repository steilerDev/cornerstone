import { get, post, del } from './apiClient.js';
import type { AttentionNotNowResponse, AttentionResponse } from '@cornerstone/shared';

/** The attention rows; `includeSnoozed` also returns the rows hidden by "Not now". */
export function getAttention(options?: { includeSnoozed?: boolean }): Promise<AttentionResponse> {
  return get<AttentionResponse>(
    options?.includeSnoozed ? '/attention?includeSnoozed=true' : '/attention',
  );
}

/** Hides a row for 7 days ("Not now"). */
export function notNow(key: string): Promise<AttentionNotNowResponse> {
  return post<AttentionNotNowResponse>('/attention/not-now', { key });
}

/** Shows a hidden row again (Undo of "Not now", "Show again"). */
export function undoNotNow(key: string): Promise<void> {
  return del<void>(`/attention/not-now/${encodeURIComponent(key)}`);
}
