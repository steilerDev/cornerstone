-- Migration 0043: App-wide settings table
-- Story #1877: Household name & address app setting
-- No existing app-wide (non-per-user) settings mechanism exists — user_preferences
-- is per-user. This generalizes that key-value pattern to app scope. Lazily
-- populated: no rows are seeded here; reads return null until first write.
-- ROLLBACK: DROP TABLE app_settings;
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);
