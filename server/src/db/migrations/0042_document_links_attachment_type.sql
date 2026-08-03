-- Migration 0042: Add attachment_type to document_links
-- Story #1877: Document attachment typing (quotation/deposit/invoice)
-- Nullable, NO backfill — all existing links remain untagged (null).
-- Meaningful only for entity_type='invoice'; enforced at the application layer.
-- ROLLBACK: ALTER TABLE document_links DROP COLUMN attachment_type;
ALTER TABLE document_links
  ADD COLUMN attachment_type TEXT
  CHECK(attachment_type IN ('quotation', 'deposit', 'invoice') OR attachment_type IS NULL);
