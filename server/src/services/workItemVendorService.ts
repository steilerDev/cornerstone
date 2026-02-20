import { eq, and } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { workItems, workItemVendors, vendors, users } from '../db/schema.js';
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
 * List all vendors linked to a work item.
 * @throws NotFoundError if work item does not exist
 */
export function listWorkItemVendors(db: DbType, workItemId: string): Vendor[] {
  assertWorkItemExists(db, workItemId);

  const rows = db
    .select({ vendor: vendors })
    .from(workItemVendors)
    .innerJoin(vendors, eq(vendors.id, workItemVendors.vendorId))
    .where(eq(workItemVendors.workItemId, workItemId))
    .all();

  return rows.map((row) => toVendor(db, row.vendor));
}

/**
 * Link a vendor to a work item.
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

  // Check for existing link
  const existing = db
    .select()
    .from(workItemVendors)
    .where(and(eq(workItemVendors.workItemId, workItemId), eq(workItemVendors.vendorId, vendorId)))
    .get();

  if (existing) {
    throw new ConflictError('Vendor is already linked to this work item');
  }

  // Create the link
  db.insert(workItemVendors).values({ workItemId, vendorId }).run();

  return toVendor(db, vendor);
}

/**
 * Unlink a vendor from a work item.
 * @throws NotFoundError if work item does not exist, or if the link does not exist
 */
export function unlinkVendorFromWorkItem(db: DbType, workItemId: string, vendorId: string): void {
  assertWorkItemExists(db, workItemId);

  const existing = db
    .select()
    .from(workItemVendors)
    .where(and(eq(workItemVendors.workItemId, workItemId), eq(workItemVendors.vendorId, vendorId)))
    .get();

  if (!existing) {
    throw new NotFoundError('Vendor is not linked to this work item');
  }

  db.delete(workItemVendors)
    .where(and(eq(workItemVendors.workItemId, workItemId), eq(workItemVendors.vendorId, vendorId)))
    .run();
}
