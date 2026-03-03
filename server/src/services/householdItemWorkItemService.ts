import { eq, and } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { householdItems, householdItemWorkItems, workItems } from '../db/schema.js';
import type {
  HouseholdItemWorkItemSummary,
  WorkItemLinkedHouseholdItemSummary,
  HouseholdItemCategory,
  HouseholdItemStatus,
} from '@cornerstone/shared';
import { NotFoundError, ConflictError } from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Ensure a household item exists.
 * @throws NotFoundError if not found
 */
function assertHouseholdItemExists(db: DbType, householdItemId: string): void {
  const item = db.select().from(householdItems).where(eq(householdItems.id, householdItemId)).get();
  if (!item) {
    throw new NotFoundError('Household item not found');
  }
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
 * List all work items linked to a household item.
 * @throws NotFoundError if household item does not exist
 */
export function listLinkedWorkItems(
  db: DbType,
  householdItemId: string,
): HouseholdItemWorkItemSummary[] {
  assertHouseholdItemExists(db, householdItemId);

  const rows = db
    .select({ workItem: workItems })
    .from(householdItemWorkItems)
    .innerJoin(workItems, eq(workItems.id, householdItemWorkItems.workItemId))
    .where(eq(householdItemWorkItems.householdItemId, householdItemId))
    .all();

  return rows.map((row) => ({
    id: row.workItem.id,
    title: row.workItem.title,
    status: row.workItem.status,
    startDate: row.workItem.startDate,
    endDate: row.workItem.endDate,
  }));
}

/**
 * Link a work item to a household item.
 * @throws NotFoundError if household item or work item does not exist
 * @throws ConflictError if the work item is already linked to this household item
 */
export function linkWorkItemToHouseholdItem(
  db: DbType,
  householdItemId: string,
  workItemId: string,
): HouseholdItemWorkItemSummary {
  assertHouseholdItemExists(db, householdItemId);
  assertWorkItemExists(db, workItemId);

  // Check for existing link
  const existing = db
    .select()
    .from(householdItemWorkItems)
    .where(
      and(
        eq(householdItemWorkItems.householdItemId, householdItemId),
        eq(householdItemWorkItems.workItemId, workItemId),
      ),
    )
    .get();

  if (existing) {
    throw new ConflictError('Work item is already linked to this household item');
  }

  // Create the link
  db.insert(householdItemWorkItems).values({ householdItemId, workItemId }).run();

  // Fetch and return the work item
  const workItem = db.select().from(workItems).where(eq(workItems.id, workItemId)).get()!;
  return {
    id: workItem.id,
    title: workItem.title,
    status: workItem.status,
    startDate: workItem.startDate,
    endDate: workItem.endDate,
  };
}

/**
 * Unlink a work item from a household item.
 * @throws NotFoundError if household item does not exist, or if the link does not exist
 */
export function unlinkWorkItemFromHouseholdItem(
  db: DbType,
  householdItemId: string,
  workItemId: string,
): void {
  assertHouseholdItemExists(db, householdItemId);

  const existing = db
    .select()
    .from(householdItemWorkItems)
    .where(
      and(
        eq(householdItemWorkItems.householdItemId, householdItemId),
        eq(householdItemWorkItems.workItemId, workItemId),
      ),
    )
    .get();

  if (!existing) {
    throw new NotFoundError('Work item is not linked to this household item');
  }

  db.delete(householdItemWorkItems)
    .where(
      and(
        eq(householdItemWorkItems.householdItemId, householdItemId),
        eq(householdItemWorkItems.workItemId, workItemId),
      ),
    )
    .run();
}

/**
 * List all household items linked to a work item.
 * @throws NotFoundError if work item does not exist
 */
export function listLinkedHouseholdItemsForWorkItem(
  db: DbType,
  workItemId: string,
): WorkItemLinkedHouseholdItemSummary[] {
  assertWorkItemExists(db, workItemId);

  const rows = db
    .select({ householdItem: householdItems })
    .from(householdItemWorkItems)
    .innerJoin(householdItems, eq(householdItems.id, householdItemWorkItems.householdItemId))
    .where(eq(householdItemWorkItems.workItemId, workItemId))
    .all();

  return rows.map((row) => ({
    id: row.householdItem.id,
    name: row.householdItem.name,
    category: row.householdItem.category as HouseholdItemCategory,
    status: row.householdItem.status as HouseholdItemStatus,
    expectedDeliveryDate: row.householdItem.expectedDeliveryDate,
  }));
}
