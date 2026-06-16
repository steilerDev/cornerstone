-- Migration 0037: Create orientations table
-- Story #1674: Mobile photo upload — Orientation metadata entity
CREATE TABLE orientations (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_orientations_sort_order ON orientations(sort_order, name);
