-- Migration 0027: Split vendor_contacts name into first_name/last_name

ALTER TABLE vendor_contacts ADD COLUMN first_name TEXT;
ALTER TABLE vendor_contacts ADD COLUMN last_name TEXT;

-- Migrate existing data: put existing name into last_name
UPDATE vendor_contacts SET last_name = name WHERE name IS NOT NULL;
