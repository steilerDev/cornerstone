-- Migration 0014: Rename household_item status values
--
-- Renames lifecycle status values to clearer terminology:
--   not_ordered -> planned
--   ordered     -> purchased
--   in_transit  -> scheduled
--   delivered   -> arrived
--
-- SQLite does not support ALTER TABLE ... MODIFY CONSTRAINT.
-- We must rebuild the table with a new CHECK constraint.

-- Step 1: Rename existing values before rebuilding
UPDATE household_items SET status = 'planned'   WHERE status = 'not_ordered';
UPDATE household_items SET status = 'purchased'  WHERE status = 'ordered';
UPDATE household_items SET status = 'scheduled'  WHERE status = 'in_transit';
UPDATE household_items SET status = 'arrived'    WHERE status = 'delivered';

-- Step 2: Rebuild table with new CHECK constraint
CREATE TABLE household_items_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK(category IN ('furniture', 'appliances', 'fixtures', 'decor', 'electronics', 'outdoor', 'storage', 'other')),
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK(status IN ('planned', 'purchased', 'scheduled', 'arrived')),
  vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  url TEXT,
  room TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity >= 1),
  order_date TEXT,
  expected_delivery_date TEXT,
  actual_delivery_date TEXT,
  earliest_delivery_date TEXT,
  latest_delivery_date TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO household_items_new
  SELECT id, name, description, category, status, vendor_id, url, room,
         quantity, order_date, expected_delivery_date, actual_delivery_date,
         earliest_delivery_date, latest_delivery_date, created_by, created_at, updated_at
  FROM household_items;

DROP TABLE household_items;
ALTER TABLE household_items_new RENAME TO household_items;

-- Step 3: Recreate indexes
CREATE INDEX idx_household_items_category ON household_items(category);
CREATE INDEX idx_household_items_status ON household_items(status);
CREATE INDEX idx_household_items_room ON household_items(room);
CREATE INDEX idx_household_items_vendor_id ON household_items(vendor_id);
CREATE INDEX idx_household_items_created_at ON household_items(created_at);
