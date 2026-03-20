/**
 * User preference types for the preferences API.
 * EPIC-09 Story #470: User Preferences Infrastructure
 */

/** A single user preference key-value pair */
export interface UserPreference {
  key: string;
  value: string;
  updatedAt: string;
}

/**
 * Well-known preference keys.
 * The API accepts any string key, but these are the keys the client uses.
 * Keys use dot-notation namespacing.
 */
export type PreferenceKey =
  | 'dashboard.hiddenCards' // JSON array of card IDs to hide
  | 'theme' // 'light' | 'dark' | 'system'
  | 'locale' // ISO 639-1 language code (e.g., 'en', 'de')
  | `table.${string}.columns`; // JSON array of visible column keys per table page

/**
 * Known dashboard card IDs for the dashboard.hiddenCards preference.
 * Used by the client to identify which cards can be shown/hidden.
 */
export type DashboardCardId =
  | 'budget-summary'
  | 'source-utilization'
  | 'upcoming-milestones'
  | 'work-item-progress'
  | 'critical-path'
  | 'mini-gantt'
  | 'invoice-pipeline'
  | 'subsidy-pipeline'
  | 'quick-actions'
  | 'recent-diary';

/** Request body for PATCH /api/users/me/preferences */
export interface UpsertPreferenceRequest {
  key: string;
  value: string;
}

/** Response body for GET /api/users/me/preferences */
export interface PreferencesResponse {
  preferences: UserPreference[];
}
