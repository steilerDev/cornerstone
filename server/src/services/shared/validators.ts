/**
 * Shared validator functions and constants for service modules.
 *
 * These validators enforce business logic constraints across multiple service files.
 * They are extracted from duplicate implementations.
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import type * as schemaTypes from '../../db/schema.js';
import { budgetCategories, budgetSources, tags, vendors } from '../../db/schema.js';
import { ValidationError } from '../../errors/AppError.js';
import type { ConfidenceLevel } from '@cornerstone/shared';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/** Valid confidence level values */
export const VALID_CONFIDENCE_LEVELS: ConfidenceLevel[] = [
  'own_estimate',
  'professional_estimate',
  'quote',
  'invoice',
];

/** Maximum description length */
export const MAX_DESCRIPTION_LENGTH = 500;

/**
 * Validate that all tag IDs exist.
 * Throws ValidationError if any tag does not exist.
 */
export function validateTagIds(_db: DbType, tagIds: string[]): void {
  for (const tagId of tagIds) {
    const tag = _db.select().from(tags).where(eq(tags.id, tagId)).get();
    if (!tag) {
      throw new ValidationError(`Tag not found: ${tagId}`);
    }
  }
}

/**
 * Validate that a confidence level value is valid.
 * Throws ValidationError if invalid.
 */
export function validateConfidence(confidence: string): void {
  if (!VALID_CONFIDENCE_LEVELS.includes(confidence as ConfidenceLevel)) {
    throw new ValidationError(`confidence must be one of: ${VALID_CONFIDENCE_LEVELS.join(', ')}`);
  }
}

/**
 * Validate the description field.
 * Throws ValidationError if description exceeds max length.
 */
export function validateDescription(description: string | null | undefined): void {
  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ValidationError(`Description must not exceed ${MAX_DESCRIPTION_LENGTH} characters`);
  }
}

/**
 * Validate that a budget category ID exists.
 * Throws ValidationError if not found.
 */
export function validateBudgetCategoryId(db: DbType, budgetCategoryId: string): void {
  const cat = db
    .select()
    .from(budgetCategories)
    .where(eq(budgetCategories.id, budgetCategoryId))
    .get();
  if (!cat) {
    throw new ValidationError(`Budget category not found: ${budgetCategoryId}`);
  }
}

/**
 * Validate that a budget source ID exists.
 * Throws ValidationError if not found.
 */
export function validateBudgetSourceId(_db: DbType, budgetSourceId: string): void {
  const source = _db.select().from(budgetSources).where(eq(budgetSources.id, budgetSourceId)).get();
  if (!source) {
    throw new ValidationError(`Budget source not found: ${budgetSourceId}`);
  }
}

/**
 * Validate that a vendor ID exists.
 * Throws ValidationError if not found.
 */
export function validateVendorId(db: DbType, vendorId: string): void {
  const vendor = db.select().from(vendors).where(eq(vendors.id, vendorId)).get();
  if (!vendor) {
    throw new ValidationError(`Vendor not found: ${vendorId}`);
  }
}
