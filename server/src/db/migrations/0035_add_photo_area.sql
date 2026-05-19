ALTER TABLE photos ADD COLUMN area_id TEXT REFERENCES areas(id) ON DELETE SET NULL;
CREATE INDEX idx_photos_area_id ON photos(area_id);
