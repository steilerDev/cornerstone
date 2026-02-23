-- EPIC-05: Budget Management
-- Creates all budget-related tables: categories, vendors, invoices,
-- budget sources, subsidy programs, and junction tables.

-- Budget categories for organizing construction costs
CREATE TABLE budget_categories (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed default budget categories
INSERT INTO budget_categories (id, name, description, color, sort_order, created_at, updated_at) VALUES
  ('bc-materials',   'Materials',   'Raw materials and building supplies',                  '#3B82F6', 0, datetime('now'), datetime('now')),
  ('bc-labor',       'Labor',       'Contractor and worker labor costs',                    '#EF4444', 1, datetime('now'), datetime('now')),
  ('bc-permits',     'Permits',     'Building permits and regulatory fees',                 '#F59E0B', 2, datetime('now'), datetime('now')),
  ('bc-design',      'Design',      'Architectural and design services',                    '#8B5CF6', 3, datetime('now'), datetime('now')),
  ('bc-equipment',   'Equipment',   'Tools and equipment rental or purchase',               '#06B6D4', 4, datetime('now'), datetime('now')),
  ('bc-landscaping', 'Landscaping', 'Outdoor landscaping and hardscaping',                  '#22C55E', 5, datetime('now'), datetime('now')),
  ('bc-utilities',   'Utilities',   'Utility connections and installations',                '#F97316', 6, datetime('now'), datetime('now')),
  ('bc-insurance',   'Insurance',   'Construction and builder risk insurance',              '#6366F1', 7, datetime('now'), datetime('now')),
  ('bc-contingency', 'Contingency', 'Reserve funds for unexpected costs',                   '#EC4899', 8, datetime('now'), datetime('now')),
  ('bc-other',       'Other',       'Miscellaneous costs not covered by other categories', '#6B7280', 9, datetime('now'), datetime('now'));

-- Vendor/contractor database
CREATE TABLE vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  specialty TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_vendors_name ON vendors (name);

-- Invoice tracking per vendor
CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  invoice_number TEXT,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'overdue')),
  notes TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_invoices_vendor_id ON invoices (vendor_id);
CREATE INDEX idx_invoices_status ON invoices (status);
CREATE INDEX idx_invoices_date ON invoices (date);

-- Financing sources (bank loans, credit lines, savings, etc.)
CREATE TABLE budget_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('bank_loan', 'credit_line', 'savings', 'other')),
  total_amount REAL NOT NULL,
  interest_rate REAL,
  terms TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'exhausted', 'closed')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Subsidy/incentive programs
CREATE TABLE subsidy_programs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  eligibility TEXT,
  reduction_type TEXT NOT NULL CHECK(reduction_type IN ('percentage', 'fixed')),
  reduction_value REAL NOT NULL,
  application_status TEXT NOT NULL DEFAULT 'eligible' CHECK(application_status IN ('eligible', 'applied', 'approved', 'received', 'rejected')),
  application_deadline TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Junction: subsidy programs <-> budget categories (M:N)
CREATE TABLE subsidy_program_categories (
  subsidy_program_id TEXT NOT NULL REFERENCES subsidy_programs(id) ON DELETE CASCADE,
  budget_category_id TEXT NOT NULL REFERENCES budget_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (subsidy_program_id, budget_category_id)
);

-- Junction: work items <-> vendors (M:N)
CREATE TABLE work_item_vendors (
  work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  PRIMARY KEY (work_item_id, vendor_id)
);

CREATE INDEX idx_work_item_vendors_vendor_id ON work_item_vendors (vendor_id);

-- Junction: work items <-> subsidy programs (M:N)
CREATE TABLE work_item_subsidies (
  work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  subsidy_program_id TEXT NOT NULL REFERENCES subsidy_programs(id) ON DELETE CASCADE,
  PRIMARY KEY (work_item_id, subsidy_program_id)
);

CREATE INDEX idx_work_item_subsidies_subsidy_program_id ON work_item_subsidies (subsidy_program_id);

-- Rollback:
-- DROP INDEX IF EXISTS idx_work_item_subsidies_subsidy_program_id;
-- DROP TABLE IF EXISTS work_item_subsidies;
-- DROP INDEX IF EXISTS idx_work_item_vendors_vendor_id;
-- DROP TABLE IF EXISTS work_item_vendors;
-- DROP TABLE IF EXISTS subsidy_program_categories;
-- DROP TABLE IF EXISTS subsidy_programs;
-- DROP TABLE IF EXISTS budget_sources;
-- DROP INDEX IF EXISTS idx_invoices_date;
-- DROP INDEX IF EXISTS idx_invoices_status;
-- DROP INDEX IF EXISTS idx_invoices_vendor_id;
-- DROP TABLE IF EXISTS invoices;
-- DROP INDEX IF EXISTS idx_vendors_name;
-- DROP TABLE IF EXISTS vendors;
-- DROP TABLE IF EXISTS budget_categories;
