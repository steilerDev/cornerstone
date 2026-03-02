-- Migration 0010: Create household items tables
--
-- EPIC-04: Household Items & Furniture Management
--
-- Creates the household_items entity and all supporting tables:
--   - household_item_tags (M:N with shared tags table)
--   - household_item_notes (comments/notes)
--   - household_item_budgets (budget lines, mirrors work_item_budgets)
--   - household_item_work_items (M:N link to work items for coordination)
--   - household_item_subsidies (M:N with subsidy programs)
--
-- See ADR-016 for design rationale.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS household_item_subsidies;
--   DROP TABLE IF EXISTS household_item_work_items;
--   DROP TABLE IF EXISTS household_item_budgets;
--   DROP TABLE IF EXISTS household_item_notes;
--   DROP TABLE IF EXISTS household_item_tags;
--   DROP TABLE IF EXISTS household_items;

-- ── household_items ─────────────────────────────────────────────────────────

CREATE TABLE household_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK(category IN ('furniture', 'appliances', 'fixtures', 'decor', 'electronics', 'outdoor', 'storage', 'other')),
  status TEXT NOT NULL DEFAULT 'not_ordered'
    CHECK(status IN ('not_ordered', 'ordered', 'in_transit', 'delivered')),
  vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  url TEXT,
  room TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity >= 1),
  order_date TEXT,
  expected_delivery_date TEXT,
  actual_delivery_date TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_household_items_category ON household_items(category);
CREATE INDEX idx_household_items_status ON household_items(status);
CREATE INDEX idx_household_items_room ON household_items(room);
CREATE INDEX idx_household_items_vendor_id ON household_items(vendor_id);
CREATE INDEX idx_household_items_created_at ON household_items(created_at);

-- ── household_item_tags ─────────────────────────────────────────────────────

CREATE TABLE household_item_tags (
  household_item_id TEXT NOT NULL REFERENCES household_items(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (household_item_id, tag_id)
);

CREATE INDEX idx_household_item_tags_tag_id ON household_item_tags(tag_id);

-- ── household_item_notes ────────────────────────────────────────────────────

CREATE TABLE household_item_notes (
  id TEXT PRIMARY KEY,
  household_item_id TEXT NOT NULL REFERENCES household_items(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_household_item_notes_household_item_id ON household_item_notes(household_item_id);

-- ── household_item_budgets ──────────────────────────────────────────────────

CREATE TABLE household_item_budgets (
  id TEXT PRIMARY KEY,
  household_item_id TEXT NOT NULL REFERENCES household_items(id) ON DELETE CASCADE,
  description TEXT,
  planned_amount REAL NOT NULL DEFAULT 0 CHECK(planned_amount >= 0),
  confidence TEXT NOT NULL DEFAULT 'own_estimate'
    CHECK(confidence IN ('own_estimate', 'professional_estimate', 'quote', 'invoice')),
  budget_category_id TEXT REFERENCES budget_categories(id) ON DELETE SET NULL,
  budget_source_id TEXT REFERENCES budget_sources(id) ON DELETE SET NULL,
  vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_household_item_budgets_household_item_id ON household_item_budgets(household_item_id);
CREATE INDEX idx_household_item_budgets_vendor_id ON household_item_budgets(vendor_id);
CREATE INDEX idx_household_item_budgets_budget_category_id ON household_item_budgets(budget_category_id);
CREATE INDEX idx_household_item_budgets_budget_source_id ON household_item_budgets(budget_source_id);

-- ── household_item_work_items ───────────────────────────────────────────────

CREATE TABLE household_item_work_items (
  household_item_id TEXT NOT NULL REFERENCES household_items(id) ON DELETE CASCADE,
  work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  PRIMARY KEY (household_item_id, work_item_id)
);

CREATE INDEX idx_household_item_work_items_work_item_id ON household_item_work_items(work_item_id);

-- ── household_item_subsidies ────────────────────────────────────────────────

CREATE TABLE household_item_subsidies (
  household_item_id TEXT NOT NULL REFERENCES household_items(id) ON DELETE CASCADE,
  subsidy_program_id TEXT NOT NULL REFERENCES subsidy_programs(id) ON DELETE CASCADE,
  PRIMARY KEY (household_item_id, subsidy_program_id)
);

CREATE INDEX idx_household_item_subsidies_subsidy_program_id ON household_item_subsidies(subsidy_program_id);
