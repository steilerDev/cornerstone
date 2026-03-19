-- FK enforcement is handled by the migration runner (PRAGMA is a no-op inside transactions),
-- but included here for documentation of intent.
PRAGMA foreign_keys = OFF;

-- Migration 0028: Areas and Trades rework
-- - Creates trades table with 15 default trades
-- - Migrates vendor specialty values to trades
-- - Recreates vendors table with trade_id FK (removes specialty)
-- - Creates areas table with hierarchical support
-- - Adds area_id and assigned_vendor_id to work_items
-- - Replaces room with area_id on household_items
-- - Drops tag-related tables (tags, work_item_tags, household_item_tags)
-- - Updates budget categories (adds Waste, removes unused categories)

-- Step a: Create trades table with 15 defaults
CREATE TABLE trades (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  color TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_trades_sort_order ON trades(sort_order, name);

INSERT INTO trades (id, name, color, description, sort_order, created_at, updated_at) VALUES
  ('trade-plumbing',          'Plumbing',           '#0EA5E9', 'Water supply, drainage, sanitary installations',    0,  datetime('now'), datetime('now')),
  ('trade-hvac',              'HVAC',               '#8B5CF6', 'Heating, ventilation, air conditioning',            1,  datetime('now'), datetime('now')),
  ('trade-electrical',        'Electrical',         '#F59E0B', 'Wiring, lighting, power systems',                   2,  datetime('now'), datetime('now')),
  ('trade-drywall',           'Drywall',            '#94A3B8', 'Drywall installation and plastering',               3,  datetime('now'), datetime('now')),
  ('trade-carpentry',         'Carpentry',          '#92400E', 'Wood framing, trim, cabinetry',                     4,  datetime('now'), datetime('now')),
  ('trade-masonry',           'Masonry',            '#78716C', 'Brickwork, stonework, concrete',                    5,  datetime('now'), datetime('now')),
  ('trade-painting',          'Painting',           '#EC4899', 'Interior and exterior painting',                    6,  datetime('now'), datetime('now')),
  ('trade-roofing',           'Roofing',            '#EF4444', 'Roof installation and repair',                      7,  datetime('now'), datetime('now')),
  ('trade-flooring',          'Flooring',           '#D97706', 'Floor installation (hardwood, tile, carpet)',        8,  datetime('now'), datetime('now')),
  ('trade-tiling',            'Tiling',             '#06B6D4', 'Wall and floor tiling',                             9,  datetime('now'), datetime('now')),
  ('trade-landscaping',       'Landscaping',        '#22C55E', 'Outdoor landscaping and hardscaping',               10, datetime('now'), datetime('now')),
  ('trade-excavation',        'Excavation',         '#A16207', 'Earthwork, grading, foundation prep',               11, datetime('now'), datetime('now')),
  ('trade-general-contractor','General Contractor', '#6366F1', 'General construction management',                   12, datetime('now'), datetime('now')),
  ('trade-architect-design',  'Architect / Design', '#F97316', 'Architectural and design services',                 13, datetime('now'), datetime('now')),
  ('trade-other',             'Other',              '#6B7280', 'Miscellaneous trades',                              14, datetime('now'), datetime('now'));

-- Step b: Migrate vendor specialty values to trades
INSERT OR IGNORE INTO trades (id, name, color, description, sort_order, created_at, updated_at)
SELECT 'trade-custom-' || lower(hex(randomblob(4))), specialty, '#6B7280', NULL, 100, datetime('now'), datetime('now')
FROM (SELECT DISTINCT trim(specialty) AS specialty FROM vendors WHERE specialty IS NOT NULL AND trim(specialty) != '');

-- Step c: Recreate vendors table (pattern from 0026)
-- Add temporary trade_id column
ALTER TABLE vendors ADD COLUMN trade_id TEXT;

-- Backfill trade_id from specialty by matching trade name
UPDATE vendors SET trade_id = (
  SELECT t.id FROM trades t WHERE lower(trim(t.name)) = lower(trim(vendors.specialty)) LIMIT 1
) WHERE specialty IS NOT NULL AND trim(specialty) != '';

-- Set remaining vendors without a matched trade to 'Other'
UPDATE vendors SET trade_id = 'trade-other' WHERE trade_id IS NULL;

-- Backup vendor_contacts before dropping vendors (FK cascade)
CREATE TEMP TABLE _vendor_contacts_backup AS SELECT * FROM vendor_contacts;

-- Create new vendors table without specialty
CREATE TABLE vendors_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  trade_id TEXT REFERENCES trades(id) ON DELETE SET NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_vendors_new_name ON vendors_new(name);
CREATE INDEX idx_vendors_new_trade_id ON vendors_new(trade_id);

-- Copy data from old vendors to new vendors
INSERT INTO vendors_new (id, name, trade_id, phone, email, address, notes, created_by, created_at, updated_at)
SELECT id, name, trade_id, phone, email, address, notes, created_by, created_at, updated_at FROM vendors;

-- Drop old vendors table and rename
DROP TABLE IF EXISTS vendor_contacts;
DROP TABLE vendors;
ALTER TABLE vendors_new RENAME TO vendors;

-- Recreate vendor_contacts table (from migration 0026 pattern)
CREATE TABLE vendor_contacts (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  role TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_vendor_contacts_vendor_id ON vendor_contacts(vendor_id);

-- Restore vendor_contacts data
INSERT INTO vendor_contacts SELECT * FROM _vendor_contacts_backup;
DROP TABLE _vendor_contacts_backup;

-- Step d: Create areas table
CREATE TABLE areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES areas(id) ON DELETE CASCADE,
  color TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(name, parent_id)
);

CREATE INDEX idx_areas_parent_id ON areas(parent_id);
CREATE INDEX idx_areas_sort_order ON areas(sort_order, name);

-- Step e: Add columns to work_items
ALTER TABLE work_items ADD COLUMN area_id TEXT REFERENCES areas(id) ON DELETE SET NULL;
ALTER TABLE work_items ADD COLUMN assigned_vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL;

CREATE INDEX idx_work_items_area_id ON work_items(area_id);
CREATE INDEX idx_work_items_assigned_vendor_id ON work_items(assigned_vendor_id);

-- Step e2: Enforce mutual exclusivity of assigned_user_id and assigned_vendor_id via triggers
-- SQLite cannot add CHECK constraints via ALTER TABLE, and recreating work_items is too risky
-- (many FK references from other tables). Triggers provide equivalent enforcement.
CREATE TRIGGER trg_work_items_assignment_insert
BEFORE INSERT ON work_items
WHEN NEW.assigned_user_id IS NOT NULL AND NEW.assigned_vendor_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Cannot assign both a user and a vendor to a work item');
END;

CREATE TRIGGER trg_work_items_assignment_update
BEFORE UPDATE ON work_items
WHEN NEW.assigned_user_id IS NOT NULL AND NEW.assigned_vendor_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Cannot assign both a user and a vendor to a work item');
END;

-- Step f: Modify household_items - drop room, add area_id
DROP INDEX IF EXISTS idx_household_items_room;

ALTER TABLE household_items DROP COLUMN room;
ALTER TABLE household_items ADD COLUMN area_id TEXT REFERENCES areas(id) ON DELETE SET NULL;

CREATE INDEX idx_household_items_area_id ON household_items(area_id);

-- Step g: Drop tag tables
DROP TABLE IF EXISTS household_item_tags;
DROP TABLE IF EXISTS work_item_tags;
DROP TABLE IF EXISTS tags;

-- Step h: Update default categories
INSERT OR IGNORE INTO budget_categories (id, name, description, color, sort_order, created_at, updated_at) VALUES
  ('bc-waste', 'Waste', 'Waste removal, disposal, and recycling costs', '#78716C', 10, datetime('now'), datetime('now'));

DELETE FROM budget_categories WHERE id = 'bc-equipment' AND NOT EXISTS (SELECT 1 FROM work_item_budgets WHERE budget_category_id = 'bc-equipment') AND NOT EXISTS (SELECT 1 FROM household_item_budgets WHERE budget_category_id = 'bc-equipment');

DELETE FROM budget_categories WHERE id = 'bc-landscaping' AND NOT EXISTS (SELECT 1 FROM work_item_budgets WHERE budget_category_id = 'bc-landscaping') AND NOT EXISTS (SELECT 1 FROM household_item_budgets WHERE budget_category_id = 'bc-landscaping');

DELETE FROM budget_categories WHERE id = 'bc-utilities' AND NOT EXISTS (SELECT 1 FROM work_item_budgets WHERE budget_category_id = 'bc-utilities') AND NOT EXISTS (SELECT 1 FROM household_item_budgets WHERE budget_category_id = 'bc-utilities');

DELETE FROM budget_categories WHERE id = 'bc-insurance' AND NOT EXISTS (SELECT 1 FROM work_item_budgets WHERE budget_category_id = 'bc-insurance') AND NOT EXISTS (SELECT 1 FROM household_item_budgets WHERE budget_category_id = 'bc-insurance');

DELETE FROM budget_categories WHERE id = 'bc-contingency' AND NOT EXISTS (SELECT 1 FROM work_item_budgets WHERE budget_category_id = 'bc-contingency') AND NOT EXISTS (SELECT 1 FROM household_item_budgets WHERE budget_category_id = 'bc-contingency');

INSERT OR IGNORE INTO household_item_categories (id, name, color, sort_order, created_at, updated_at) VALUES
  ('hic-equipment', 'Equipment', '#06B6D4', 8, datetime('now'), datetime('now'));

DELETE FROM household_item_categories WHERE id = 'hic-outdoor' AND NOT EXISTS (SELECT 1 FROM household_items WHERE category_id = 'hic-outdoor');

DELETE FROM household_item_categories WHERE id = 'hic-storage' AND NOT EXISTS (SELECT 1 FROM household_items WHERE category_id = 'hic-storage');

PRAGMA foreign_keys = ON;

