import { eq, and, isNotNull, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { workItems, workItemBudgets, vendors, users } from '../db/schema.js';
import type { Vendor, UserSummary } from '@cornerstone/shared';
import { NotFoundError, ConflictError } from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Convert database user row to UserSummary shape.
 */
function toUserSummary(user: typeof users.$inferSelect | null | undefined): UserSummary | null {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
  };
}

/**
 * Convert database vendor row to Vendor shape.
 */
function toVendor(db: DbType, row: typeof vendors.$inferSelect): Vendor {
  const createdByUser = row.createdBy
    ? db.select().from(users).where(eq(users.id, row.createdBy)).get()
    : null;

  return {
    id: row.id,
    name: row.name,
    specialty: row.specialty,
    phone: row.phone,
    email: row.email,
    address: row.address,
    notes: row.notes,
    createdBy: toUserSummary(createdByUser),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Ensure a work item exists.
 * @throws NotFoundError if not found
 */
function assertWorkItemExists(db: DbType, workItemId: string): void {
  const item = db.select().from(workItems).where(eq(workItems.id, workItemId)).get();
  if (!item) {
    throw new NotFoundError('Work item not found');
  }
}

/**
 * List all distinct vendors linked to a work item via budget lines.
 * In the Story 5.9 rework, vendor-to-work-item relationships are expressed
 * through work_item_budgets.vendor_id rather than the former work_item_vendors
 * junction table.
 * @throws NotFoundError if work item does not exist
 */
export function listWorkItemVendors(db: DbType, workItemId: string): Vendor[] {
  assertWorkItemExists(db, workItemId);

  const rows = db
    .select({ vendor: vendors })
    .from(workItemBudgets)
    .innerJoin(vendors, eq(vendors.id, workItemBudgets.vendorId))
    .where(and(eq(workItemBudgets.workItemId, workItemId), isNotNull(workItemBudgets.vendorId)))
    .all();

  // Deduplicate vendors (a vendor may appear in multiple budget lines)
  const seen = new Set<string>();
  const unique: Vendor[] = [];
  for (const row of rows) {
    if (!seen.has(row.vendor.id)) {
      seen.add(row.vendor.id);
      unique.push(toVendor(db, row.vendor));
    }
  }
  return unique;
}

/**
 * Link a vendor to a work item by creating a budget line referencing the vendor.
 * NOTE: In the Story 5.9 rework, vendors are linked via budget lines. This
 * endpoint creates a minimal placeholder budget line so that the vendor appears
 * in the work item's vendor list. Use the budget line endpoints for full control.
 * @throws NotFoundError if work item or vendor does not exist
 * @throws ConflictError if the vendor is already linked to this work item
 */
export function linkVendorToWorkItem(db: DbType, workItemId: string, vendorId: string): Vendor {
  assertWorkItemExists(db, workItemId);

  // Validate vendor exists
  const vendor = db.select().from(vendors).where(eq(vendors.id, vendorId)).get();
  if (!vendor) {
    throw new NotFoundError('Vendor not found');
  }

  // Check for existing link (vendor already appears in a budget line for this work item)
  const existing = db
    .select({ id: workItemBudgets.id })
    .from(workItemBudgets)
    .where(and(eq(workItemBudgets.workItemId, workItemId), eq(workItemBudgets.vendorId, vendorId)))
    .get();

  if (existing) {
    throw new ConflictError('Vendor is already linked to this work item');
  }

  // Create a minimal budget line to record the vendor link
  const now = new Date().toISOString();
  db.insert(workItemBudgets)
    .values({
      id: randomUUID(),
      workItemId,
      vendorId,
      plannedAmount: 0,
      confidence: 'own_estimate',
      budgetCategoryId: null,
      budgetSourceId: null,
      description: null,
      createdBy: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return toVendor(db, vendor);
}

/**
 * Unlink a vendor from a work item by removing only placeholder budget lines
 * (those with plannedAmount = 0, no description, no budgetCategoryId, and
 * no budgetSourceId — i.e. created by linkVendorToWorkItem). Budget lines
 * with real data are preserved.
 * @throws NotFoundError if work item does not exist, or if no link exists
 */
export function unlinkVendorFromWorkItem(db: DbType, workItemId: string, vendorId: string): void {
  assertWorkItemExists(db, workItemId);

  const existing = db
    .select({ id: workItemBudgets.id })
    .from(workItemBudgets)
    .where(and(eq(workItemBudgets.workItemId, workItemId), eq(workItemBudgets.vendorId, vendorId)))
    .get();

  if (!existing) {
    throw new NotFoundError('Vendor is not linked to this work item');
  }

  // Only delete placeholder budget lines (no real data)
  db.delete(workItemBudgets)
    .where(
      and(
        eq(workItemBudgets.workItemId, workItemId),
        eq(workItemBudgets.vendorId, vendorId),
        eq(workItemBudgets.plannedAmount, 0),
        isNull(workItemBudgets.description),
        isNull(workItemBudgets.budgetCategoryId),
        isNull(workItemBudgets.budgetSourceId),
      ),
    )
    .run();
}
