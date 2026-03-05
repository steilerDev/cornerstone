/**
 * User preference types for per-user UI settings.
 */

/** Well-known preference keys (extensible -- unknown keys are accepted) */
export type PreferenceKey = 'dashboard.hiddenCards' | 'theme';

/** A single user preference as returned by the API */
export interface UserPreference {
  key: string;
  value: string;
  updatedAt: string;
}

/** Request body for upserting a preference */
export interface UpsertPreferenceRequest {
  key: string;
  value: string;
}

/** Response shape for GET /api/users/me/preferences */
export interface UserPreferencesResponse {
  preferences: UserPreference[];
}
