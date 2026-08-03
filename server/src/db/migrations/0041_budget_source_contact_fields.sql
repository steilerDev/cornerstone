-- Migration 0041: Add contact fields to budget_sources
-- Story #1877: Source contact fields for the Bank Report Wizard
-- Both nullable, no backfill — existing sources default to null.
-- ROLLBACK: ALTER TABLE budget_sources DROP COLUMN reference; ALTER TABLE budget_sources DROP COLUMN contact_address;
ALTER TABLE budget_sources ADD COLUMN reference TEXT;
ALTER TABLE budget_sources ADD COLUMN contact_address TEXT;
