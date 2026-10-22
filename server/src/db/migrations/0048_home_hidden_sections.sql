-- Migration 0048: Home hidden sections (#2230, EPIC-21 contract 18)
--
-- Data only: maps each user's legacy `dashboard.hiddenCards` preference (a JSON array of old
-- dashboard card ids) to the new `home.hiddenSections` preference (a JSON array of Home section
-- ids). A section is hidden only if EVERY old card that maps into it was hidden:
--   this-week        <- upcoming-milestones, critical-path, mini-gantt
--   pulse            <- budget-summary, work-item-progress, invoice-pipeline
--   latest-from-site <- recent-diary
-- Needs attention and Tidy up are never hidden by this migration.
--
-- Non-destructive: `dashboard.hiddenCards` is never modified or deleted.
-- Idempotent: users who already have a `home.hiddenSections` row are skipped, and a row is only
-- inserted when at least one section is hidden.
-- Safe on malformed values: json_valid / json_type guards inside CASE (SQLite does not promise
-- short-circuit evaluation of OR/AND, and json_* raises on malformed JSON).
-- The value is written exactly as JSON.stringify would write it, in HOME_HIDEABLE_SECTION_IDS
-- order: ["tidy-up","this-week","pulse","latest-from-site"] filtered.

CREATE TEMP TABLE IF NOT EXISTS home_hidden_calc (
  user_id TEXT PRIMARY KEY,
  this_week INTEGER NOT NULL,
  pulse INTEGER NOT NULL,
  latest INTEGER NOT NULL
);
DELETE FROM home_hidden_calc;

INSERT INTO home_hidden_calc (user_id, this_week, pulse, latest)
SELECT
  p.user_id,
  (SELECT COUNT(DISTINCT j.value) FROM json_each(p.value) j
     WHERE j.type = 'text' AND j.value IN ('upcoming-milestones', 'critical-path', 'mini-gantt')) = 3,
  (SELECT COUNT(DISTINCT j.value) FROM json_each(p.value) j
     WHERE j.type = 'text' AND j.value IN ('budget-summary', 'work-item-progress', 'invoice-pipeline')) = 3,
  (SELECT COUNT(*) FROM json_each(p.value) j
     WHERE j.type = 'text' AND j.value = 'recent-diary') > 0
FROM user_preferences p
WHERE p.key = 'dashboard.hiddenCards'
  AND (CASE WHEN json_valid(p.value) THEN json_type(p.value) = 'array' ELSE 0 END) = 1
  AND NOT EXISTS (
    SELECT 1 FROM user_preferences h
    WHERE h.user_id = p.user_id AND h.key = 'home.hiddenSections'
  );

INSERT INTO user_preferences (user_id, key, value, created_at, updated_at)
SELECT
  c.user_id,
  'home.hiddenSections',
  '[' || (
    CASE WHEN c.this_week = 1 THEN '"this-week"' ELSE '' END ||
    CASE WHEN c.pulse = 1 THEN (CASE WHEN c.this_week = 1 THEN ',' ELSE '' END) || '"pulse"' ELSE '' END ||
    CASE WHEN c.latest = 1 THEN (CASE WHEN c.this_week = 1 OR c.pulse = 1 THEN ',' ELSE '' END) || '"latest-from-site"' ELSE '' END
  ) || ']',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM home_hidden_calc c
WHERE c.this_week = 1 OR c.pulse = 1 OR c.latest = 1;

DROP TABLE home_hidden_calc;
