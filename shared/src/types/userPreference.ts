/**
 * User Preference Types
 *
 * EPIC-09 Story 9.3: User Preferences Infrastructure
 * Supports storing per-user preferences for UI customization (theme, dashboard state, etc).
 */

/**
 * Valid preference keys that can be stored.
 * Extensible as new preference features are added.
 */
export type PreferenceKey = 'dashboard.hiddenCards' | 'theme';

/**
 * A single user preference entry.
 */
export interface UserPreference {
  key: PreferenceKey;
  value: string;
  updatedAt: string;
}

/**
 * Response shape for listing user preferences.
 */
export interface UserPreferenceListResponse {
  preferences: UserPreference[];
}

/**
 * Request body for creating or updating a user preference (upsert).
 */
export interface UpsertPreferenceRequest {
  key: PreferenceKey;
  value: string;
}
