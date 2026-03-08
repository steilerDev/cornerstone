-- EPIC-09: Create household_item_categories lookup table
-- Story #509: Unified Tags & Categories Management Page
-- Migrates household_items.category from hard-coded enum to foreign key

-- Create household_item_categories lookup table
CREATE TABLE household_item_categories (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Seed the 8 original enum values
INSERT INTO household_item_categories (id, name, color, sort_order, created_at, updated_at) VALUES
  ('hic-furniture',    'Furniture',    '#8B5CF6', 0, datetime('now'), datetime('now')),
  ('hic-appliances',   'Appliances',   '#3B82F6', 1, datetime('now'), datetime('now')),
  ('hic-fixtures',     'Fixtures',     '#06B6D4', 2, datetime('now'), datetime('now')),
  ('hic-decor',        'Decor',        '#EC4899', 3, datetime('now'), datetime('now')),
  ('hic-electronics',  'Electronics',  '#F59E0B', 4, datetime('now'), datetime('now')),
  ('hic-outdoor',      'Outdoor',      '#22C55E', 5, datetime('now'), datetime('now')),
  ('hic-storage',      'Storage',      '#F97316', 6, datetime('now'), datetime('now')),
  ('hic-other',        'Other',        '#6B7280', 7, datetime('now'), datetime('now'));

-- Add new column category_id (nullable initially for migration)
ALTER TABLE household_items ADD COLUMN category_id TEXT REFERENCES household_item_categories(id) ON DELETE RESTRICT;

-- Backfill category_id from category string value
UPDATE household_items SET category_id = 'hic-furniture'   WHERE category = 'furniture';
UPDATE household_items SET category_id = 'hic-appliances'  WHERE category = 'appliances';
UPDATE household_items SET category_id = 'hic-fixtures'    WHERE category = 'fixtures';
UPDATE household_items SET category_id = 'hic-decor'       WHERE category = 'decor';
UPDATE household_items SET category_id = 'hic-electronics' WHERE category = 'electronics';
UPDATE household_items SET category_id = 'hic-outdoor'     WHERE category = 'outdoor';
UPDATE household_items SET category_id = 'hic-storage'     WHERE category = 'storage';
UPDATE household_items SET category_id = 'hic-other'       WHERE category = 'other';

-- Set default for category_id (backfill any nulls to 'hic-other')
UPDATE household_items SET category_id = 'hic-other' WHERE category_id IS NULL;

-- Drop old category column (SQLite 3.35.0+ supports DROP COLUMN)
-- Must drop the index first since SQLite cannot drop a column that has an index
DROP INDEX IF EXISTS idx_household_items_category;
ALTER TABLE household_items DROP COLUMN category;

-- Seed "Household Items" budget category
INSERT INTO budget_categories (id, name, description, color, sort_order, created_at, updated_at) VALUES
  ('bc-household-items', 'Household Items', 'Furniture, appliances, and other household purchases', '#8B5CF6', 10, datetime('now'), datetime('now'));

-- Migrate ALL existing household_item_budgets to bc-household-items
UPDATE household_item_budgets SET budget_category_id = 'bc-household-items';

-- Indexes
CREATE INDEX idx_household_item_categories_sort_order ON household_item_categories(sort_order);
CREATE INDEX idx_household_items_category_id ON household_items(category_id);
