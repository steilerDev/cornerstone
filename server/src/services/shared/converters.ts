/**
 * Shared converter functions for service modules.
 *
 * These converters transform database rows into API response shapes.
 * They are extracted from duplicate implementations across multiple service files.
 */

import type { budgetCategories, budgetSources, tags, users, vendors } from '../../db/schema.js';
import type {
  BudgetCategory,
  BudgetSourceSummary,
  TagResponse,
  UserSummary,
  VendorSummary,
} from '@cornerstone/shared';

/**
 * Convert a database user row to UserSummary shape.
 * Returns null if user is null or undefined.
 */
export function toUserSummary(
  user: typeof users.$inferSelect | null | undefined,
): UserSummary | null {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
  };
}

/**
 * Convert a database budget category row to BudgetCategory shape.
 * Returns null if category is null or undefined.
 */
export function toBudgetCategory(
  category: typeof budgetCategories.$inferSelect | null | undefined,
): BudgetCategory | null {
  if (!category) return null;
  return {
    id: category.id,
    name: category.name,
    description: category.description,
    color: category.color,
    sortOrder: category.sortOrder,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

/**
 * Convert a database budget source row to BudgetSourceSummary shape.
 * Returns null if source is null or undefined.
 */
export function toBudgetSourceSummary(
  source: typeof budgetSources.$inferSelect | null | undefined,
): BudgetSourceSummary | null {
  if (!source) return null;
  return {
    id: source.id,
    name: source.name,
    sourceType: source.sourceType,
  };
}

/**
 * Convert a database vendor row to VendorSummary shape.
 * Returns null if vendor is null or undefined.
 */
export function toVendorSummary(
  vendor: typeof vendors.$inferSelect | null | undefined,
): VendorSummary | null {
  if (!vendor) return null;
  return {
    id: vendor.id,
    name: vendor.name,
    specialty: vendor.specialty,
  };
}

/**
 * Convert a database tag row to TagResponse shape.
 */
export function toTagResponse(tag: typeof tags.$inferSelect): TagResponse {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
  };
}
