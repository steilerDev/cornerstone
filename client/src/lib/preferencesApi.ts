import { get, patch, del } from './apiClient.js';
import type { UserPreference, UserPreferenceListResponse, UpsertPreferenceRequest } from '@cornerstone/shared';

/**
 * Fetches all preferences for the current user.
 */
export function getPreferences(): Promise<UserPreferenceListResponse> {
  return get<UserPreferenceListResponse>('/users/me/preferences');
}

/**
 * Creates or updates a preference for the current user.
 */
export function upsertPreference(data: UpsertPreferenceRequest): Promise<UserPreference> {
  return patch<UserPreference>('/users/me/preferences', data);
}

/**
 * Deletes a preference for the current user.
 */
export function deletePreference(key: string): Promise<void> {
  return del<void>(`/users/me/preferences/${encodeURIComponent(key)}`);
}
