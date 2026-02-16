-- EPIC-03: Work Items Core CRUD & Properties
-- Creates the work items, tags, notes, subtasks, and dependencies tables.

CREATE TABLE work_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started', 'in_progress', 'completed', 'blocked')),
  start_date TEXT,
  end_date TEXT,
  duration_days INTEGER,
  start_after TEXT,
  start_before TEXT,
  assigned_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_work_items_status ON work_items (status);
CREATE INDEX idx_work_items_assigned_user_id ON work_items (assigned_user_id);
CREATE INDEX idx_work_items_created_at ON work_items (created_at);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  color TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE work_item_tags (
  work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (work_item_id, tag_id)
);

CREATE INDEX idx_work_item_tags_tag_id ON work_item_tags (tag_id);

CREATE TABLE work_item_notes (
  id TEXT PRIMARY KEY,
  work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_work_item_notes_work_item_id ON work_item_notes (work_item_id);

CREATE TABLE work_item_subtasks (
  id TEXT PRIMARY KEY,
  work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_completed INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_work_item_subtasks_work_item_id ON work_item_subtasks (work_item_id);

CREATE TABLE work_item_dependencies (
  predecessor_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  successor_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'finish_to_start' CHECK(dependency_type IN ('finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish')),
  PRIMARY KEY (predecessor_id, successor_id),
  CHECK (predecessor_id != successor_id)
);

CREATE INDEX idx_work_item_dependencies_successor_id ON work_item_dependencies (successor_id);

-- Rollback:
-- DROP INDEX IF EXISTS idx_work_item_dependencies_successor_id;
-- DROP TABLE IF EXISTS work_item_dependencies;
-- DROP INDEX IF EXISTS idx_work_item_subtasks_work_item_id;
-- DROP TABLE IF EXISTS work_item_subtasks;
-- DROP INDEX IF EXISTS idx_work_item_notes_work_item_id;
-- DROP TABLE IF EXISTS work_item_notes;
-- DROP INDEX IF EXISTS idx_work_item_tags_tag_id;
-- DROP TABLE IF EXISTS work_item_tags;
-- DROP TABLE IF EXISTS tags;
-- DROP INDEX IF EXISTS idx_work_items_created_at;
-- DROP INDEX IF EXISTS idx_work_items_assigned_user_id;
-- DROP INDEX IF EXISTS idx_work_items_status;
-- DROP TABLE IF EXISTS work_items;
