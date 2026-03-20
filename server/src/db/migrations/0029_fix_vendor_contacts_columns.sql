-- Migration 0029: Fix vendor_contacts column corruption from migration 0028
--
-- Migration 0028 used SELECT * to backup vendor_contacts, but the column order
-- in the backup table (0026 schema + 0027 ALTER TABLE appends) differed from
-- the column order of the recreated table, causing values to shift.
--
-- Corruption only affects databases that ran the original 0028 before this fix.
-- Detection: if any email column value looks like a datetime string (ISO format
-- from the shifted created_at value), the database is corrupted and needs repair.
--
-- This migration is a no-op on fresh databases (created after 0028 was fixed).

PRAGMA foreign_keys = OFF;

-- Correct the column shift for corrupted databases only.
-- SQLite evaluates all RHS expressions from the original row before applying any SET,
-- so this single UPDATE is safe: each column reads from the original value.
UPDATE vendor_contacts
SET
  role       = first_name,
  phone      = last_name,
  email      = role,
  notes      = phone,
  first_name = created_at,
  last_name  = updated_at,
  created_at = COALESCE(email, datetime('now')),
  updated_at = COALESCE(notes, datetime('now'))
WHERE EXISTS (
  SELECT 1 FROM vendor_contacts vc2
  WHERE vc2.email GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
  LIMIT 1
);

PRAGMA foreign_keys = ON;
