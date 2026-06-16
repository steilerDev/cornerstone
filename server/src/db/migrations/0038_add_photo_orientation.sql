-- Migration 0038: Add orientation_id FK to photos (nullable, SET NULL on delete)
-- Story #1674: Mobile photo upload — Orientation metadata entity
ALTER TABLE photos ADD COLUMN orientation_id TEXT REFERENCES orientations(id) ON DELETE SET NULL;
CREATE INDEX idx_photos_orientation_id ON photos(orientation_id);
