-- Migration 0009: Create document_links table for Paperless-ngx integration
--
-- EPIC-08: Paperless-ngx Document Integration
--
-- Creates a single polymorphic table for linking Paperless-ngx documents to
-- various entities (work items, household items, invoices). Uses entity_type
-- discriminator + entity_id pattern instead of separate junction tables.
--
-- See ADR-015 for design rationale.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_document_links_entity;
--   DROP INDEX IF EXISTS idx_document_links_paperless_doc;
--   DROP TABLE IF EXISTS document_links;

CREATE TABLE document_links (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('work_item', 'household_item', 'invoice')),
  entity_id TEXT NOT NULL,
  paperless_document_id INTEGER NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

-- Composite unique constraint: prevent duplicate links
CREATE UNIQUE INDEX idx_document_links_unique
  ON document_links (entity_type, entity_id, paperless_document_id);

-- Fast lookup: find all documents for a given entity
CREATE INDEX idx_document_links_entity
  ON document_links (entity_type, entity_id);

-- Reverse lookup: find all entities linked to a given Paperless-ngx document
CREATE INDEX idx_document_links_paperless_doc
  ON document_links (paperless_document_id);
