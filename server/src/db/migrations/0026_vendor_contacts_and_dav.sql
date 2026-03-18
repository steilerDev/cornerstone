-- Migration 0026: vendor_contacts sub-entity and DAV token

CREATE TABLE vendor_contacts (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_vendor_contacts_vendor_id ON vendor_contacts(vendor_id);

ALTER TABLE users ADD COLUMN dav_token TEXT;

CREATE UNIQUE INDEX idx_users_dav_token ON users(dav_token)
  WHERE dav_token IS NOT NULL;
