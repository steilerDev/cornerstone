-- Migration 0015: Household Item Delivery Date Redesign
-- - Drop expected_delivery_date (no longer needed)
-- - Add target_delivery_date (computed by scheduler)
-- - earliest_delivery_date and latest_delivery_date remain but become user-editable constraints

-- Step 1: Add target_delivery_date column
ALTER TABLE household_items ADD COLUMN target_delivery_date TEXT;

-- Step 2: Add is_late column
ALTER TABLE household_items ADD COLUMN is_late INTEGER NOT NULL DEFAULT 0;

-- Step 3: Copy expected_delivery_date values to earliest_delivery_date where earliest is null
-- (preserves user intent - their expected date becomes the earliest constraint)
UPDATE household_items
SET earliest_delivery_date = expected_delivery_date
WHERE expected_delivery_date IS NOT NULL AND earliest_delivery_date IS NULL;

-- Step 4: Set target_delivery_date from earliest_delivery_date for existing items
UPDATE household_items
SET target_delivery_date = earliest_delivery_date
WHERE earliest_delivery_date IS NOT NULL;

-- Step 5: Rebuild table to drop expected_delivery_date
CREATE TABLE household_items_new (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL CHECK(category IN ('furniture', 'appliances', 'fixtures', 'decor', 'electronics', 'outdoor', 'storage', 'other')),
    status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned', 'purchased', 'scheduled', 'arrived')),
    vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
    url TEXT,
    room TEXT,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity >= 1),
    order_date TEXT,
    earliest_delivery_date TEXT,
    latest_delivery_date TEXT,
    target_delivery_date TEXT,
    actual_delivery_date TEXT,
    is_late INTEGER NOT NULL DEFAULT 0,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO household_items_new (id, name, description, category, status, vendor_id, url, room, quantity, order_date, earliest_delivery_date, latest_delivery_date, target_delivery_date, actual_delivery_date, is_late, created_by, created_at, updated_at)
SELECT id, name, description, category, status, vendor_id, url, room, quantity, order_date, earliest_delivery_date, latest_delivery_date, target_delivery_date, actual_delivery_date, is_late, created_by, created_at, updated_at
FROM household_items;

DROP TABLE household_items;
ALTER TABLE household_items_new RENAME TO household_items;

-- Recreate indexes
CREATE INDEX idx_household_items_category ON household_items(category);
CREATE INDEX idx_household_items_status ON household_items(status);
CREATE INDEX idx_household_items_room ON household_items(room);
CREATE INDEX idx_household_items_vendor_id ON household_items(vendor_id);
CREATE INDEX idx_household_items_created_at ON household_items(created_at);
CREATE INDEX idx_household_items_target_delivery ON household_items(target_delivery_date);
