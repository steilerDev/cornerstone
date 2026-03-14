-- Migration 0019: Create photos table for photo attachments
--
-- EPIC-13 & EPIC-16: Photo Upload Infrastructure
--
-- Creates a table for storing photo attachment metadata for various entities
-- (diary entries, rooms, surfaces, etc.) using entity_type + entity_id polymorphic pattern.
--
-- Actual files stored on disk at {photoStoragePath}/{id}/original.{ext} + thumbnail.webp.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_photos_entity;
--   DROP INDEX IF EXISTS idx_photos_created_at;
--   DROP TABLE IF EXISTS photos;

CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  taken_at TEXT,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Fast lookup: find all photos for a given entity
CREATE INDEX idx_photos_entity
  ON photos (entity_type, entity_id);

-- Fast lookup by creation date
CREATE INDEX idx_photos_created_at
  ON photos (created_at);
