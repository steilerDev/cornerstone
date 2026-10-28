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
  | 'dashboard.hiddenCards' // legacy (read only by migration 0048): JSON array of card IDs to hide
  | 'home.hiddenSections' // JSON array of hideable Home section ids
  | 'home.collapsedSections' // JSON array of collapsed Home section ids (tidy-up only)
  | 'home.movedNoticeSeen' // 'true' once the "what moved where" notice was dismissed
  | 'home.setupDismissed' // 'true' once set-up mode was skipped
  | 'attention.snoozed' // JSON object { "<attention row key>": "YYYY-MM-DD" } (snoozed until, exclusive)
  | 'schedule.view' // JSON { show, zoom, group, areaId, legendOpen, phoneView } (Schedule view, #2247)
  | 'theme' // 'light' | 'dark' | 'system'
  | 'locale'; // ISO 639-1 language code (e.g., 'en', 'de')

/**
 * Known dashboard card IDs for the dashboard.hiddenCards preference.
 * Legacy: read only by migration 0048 (mapped to `home.hiddenSections`).
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

/**
 * Value shape of the `attention.snoozed` preference (JSON-encoded): attention row key ->
 * snoozed-until date (`YYYY-MM-DD`, exclusive: the row shows again on that day).
 */
export type AttentionSnoozedPreference = Record<string, string>;
