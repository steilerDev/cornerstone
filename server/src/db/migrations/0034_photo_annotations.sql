-- Migration 0034: Add annotated_at column to photos table
-- This column stores the ISO timestamp of the last annotation bake.
-- When non-null, annotated.png exists in the photo's directory.
ALTER TABLE photos ADD COLUMN annotated_at TEXT;
