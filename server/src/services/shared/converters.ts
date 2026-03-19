/**
 * Shared converter functions for service modules.
 *
 * These converters transform database rows into API response shapes.
 * They are extracted from duplicate implementations across multiple service files.
 */

import type { budgetCategories, budgetSources, users, vendors, areas } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { trades } from '../../db/schema.js';
import type * as schemaTypes from '../../db/schema.js';
import type {
  BudgetCategory,
  BudgetSourceSummary,
  UserSummary,
  VendorSummary,
  AreaSummary,
  TradeSummary,
} from '@cornerstone/shared';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

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
 *
 * Note: This version does NOT resolve the trade. Use toVendorSummaryWithTrade
 * when you need the trade resolved from the database.
 */
export function toVendorSummary(
  vendor: typeof vendors.$inferSelect | null | undefined,
): VendorSummary | null {
  if (!vendor) return null;
  return {
    id: vendor.id,
    name: vendor.name,
    trade: null, // Use toVendorSummaryWithTrade for resolved trade
  };
}

/**
 * Convert a database area row to AreaSummary shape.
 * Returns null if area is null or undefined.
 */
export function toAreaSummary(
  area: typeof areas.$inferSelect | null | undefined,
): AreaSummary | null {
  if (!area) return null;
  return {
    id: area.id,
    name: area.name,
    color: area.color,
  };
}

/**
 * Convert a database trade row to TradeSummary shape.
 * Returns null if trade is null or undefined.
 */
function toTradeSummary(
  trade: typeof trades.$inferSelect | null | undefined,
): TradeSummary | null {
  if (!trade) return null;
  return {
    id: trade.id,
    name: trade.name,
    color: trade.color,
  };
}

/**
 * Convert a database vendor row to VendorSummary shape with trade resolved from database.
 * Returns null if vendor is null or undefined.
 * Resolves the trade by looking it up in the trades table if vendorId has a tradeId.
 */
export function toVendorSummaryWithTrade(
  db: DbType,
  vendor: typeof vendors.$inferSelect | null | undefined,
): VendorSummary | null {
  if (!vendor) return null;

  let trade: TradeSummary | null = null;
  if (vendor.tradeId) {
    const tradeRow = db.select().from(trades).where(eq(trades.id, vendor.tradeId)).get();
    trade = toTradeSummary(tradeRow ?? null);
  }

  return {
    id: vendor.id,
    name: vendor.name,
    trade,
  };
}