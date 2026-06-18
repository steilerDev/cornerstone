-- Migration 0039: Widen document_links entity_type CHECK constraint
--
-- Story #1744: Attach documents to budget sources and subsidy programs
--
-- SQLite cannot ALTER a CHECK constraint in place. This migration rebuilds
-- the document_links table with two new allowed entity_type values:
--   'budget_source' and 'subsidy_program'
--
-- ROLLBACK: rebuild with original CHECK omitting the two new values, copy rows, drop, rename, recreate indexes.

PRAGMA foreign_keys = OFF;

CREATE TABLE document_links_new (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('work_item', 'household_item', 'invoice', 'budget_source', 'subsidy_program')),
  entity_id TEXT NOT NULL,
  paperless_document_id INTEGER NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

INSERT INTO document_links_new
  SELECT id, entity_type, entity_id, paperless_document_id, created_by, created_at
  FROM document_links;

DROP TABLE document_links;
ALTER TABLE document_links_new RENAME TO document_links;

CREATE UNIQUE INDEX idx_document_links_unique
  ON document_links (entity_type, entity_id, paperless_document_id);
CREATE INDEX idx_document_links_entity
  ON document_links (entity_type, entity_id);
CREATE INDEX idx_document_links_paperless_doc
  ON document_links (paperless_document_id);

PRAGMA foreign_keys = ON;
