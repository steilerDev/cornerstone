import { get, patch, del } from './apiClient.js';
import type {
  UserPreference,
  UpsertPreferenceRequest,
  PreferencesResponse,
} from '@cornerstone/shared';

/**
 * Lists all user preferences for the authenticated user.
 */
export function listPreferences(): Promise<UserPreference[]> {
  return get<PreferencesResponse>('/users/me/preferences').then((r) => r.preferences);
}

/**
 * Upserts a user preference (creates or updates).
 */
export function upsertPreference(key: string, value: string): Promise<UserPreference> {
  return patch<{ preference: UserPreference }>('/users/me/preferences', {
    key,
    value,
  } satisfies UpsertPreferenceRequest).then((r) => r.preference);
}

/**
 * Deletes a user preference by key.
 */
export function deletePreference(key: string): Promise<void> {
  return del<void>(`/users/me/preferences/${encodeURIComponent(key)}`);
}
