PRAGMA foreign_keys = OFF;

-- 1. Recreate budget_sources to add is_discretionary column and 'discretionary' to source_type CHECK
CREATE TABLE budget_sources_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('bank_loan', 'credit_line', 'savings', 'other', 'discretionary')),
  total_amount REAL NOT NULL,
  interest_rate REAL,
  terms TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'exhausted', 'closed')),
  is_discretionary INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO budget_sources_new
  SELECT id, name, source_type, total_amount, interest_rate, terms, notes, status,
         0, created_by, created_at, updated_at
  FROM budget_sources;

DROP TABLE budget_sources;
ALTER TABLE budget_sources_new RENAME TO budget_sources;

-- 2. Seed the Discretionary Funding system row
INSERT INTO budget_sources (id, name, source_type, total_amount, is_discretionary, status, created_at, updated_at)
SELECT
  'discretionary-system',
  'Discretionary Funding',
  'discretionary',
  0,
  1,
  'active',
  datetime('now'),
  datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM budget_sources WHERE is_discretionary = 1
);

PRAGMA foreign_keys = ON;
