/**
 * What one company is attached to (contract 13, #2244): tasks assigned to it, household items
 * it supplies, and budget lines that name it. Read-only.
 */

import { eq, asc, sql, isNull } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import {
  vendors,
  workItems,
  householdItems,
  workItemBudgets,
  householdItemBudgets,
} from '../db/schema.js';
import type {
  VendorRelationsResponse,
  VendorRelatedWorkItem,
  VendorRelatedHouseholdItem,
  VendorRelatedBudgetLine,
  WorkItemStatus,
  HouseholdItemStatus,
} from '@cornerstone/shared';
import { NotFoundError } from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Get the work items, household items and budget lines attached to a company.
 * @throws NotFoundError if the vendor does not exist
 */
export function getVendorRelations(db: DbType, vendorId: string): VendorRelationsResponse {
  const vendor = db.select({ id: vendors.id }).from(vendors).where(eq(vendors.id, vendorId)).get();
  if (!vendor) {
    throw new NotFoundError('Vendor not found');
  }

  // Open tasks first (completed last), then by end date (undated last), then title.
  const workItemRows = db
    .select({
      id: workItems.id,
      title: workItems.title,
      status: workItems.status,
      startDate: workItems.startDate,
      endDate: workItems.endDate,
    })
    .from(workItems)
    .where(eq(workItems.assignedVendorId, vendorId))
    .orderBy(
      sql`${workItems.status} = 'completed' ASC`,
      isNull(workItems.endDate),
      asc(workItems.endDate),
      asc(workItems.title),
      asc(workItems.id),
    )
    .all();
  const relatedWorkItems: VendorRelatedWorkItem[] = workItemRows.map((r) => ({
    ...r,
    status: r.status as WorkItemStatus,
  }));

  const deliveryDate = sql`COALESCE(${householdItems.actualDeliveryDate}, ${householdItems.targetDeliveryDate})`;
  const householdRows = db
    .select({
      id: householdItems.id,
      name: householdItems.name,
      status: householdItems.status,
      targetDeliveryDate: householdItems.targetDeliveryDate,
      actualDeliveryDate: householdItems.actualDeliveryDate,
    })
    .from(householdItems)
    .where(eq(householdItems.vendorId, vendorId))
    .orderBy(
      sql`${deliveryDate} IS NULL`,
      asc(deliveryDate),
      asc(householdItems.name),
      asc(householdItems.id),
    )
    .all();
  const relatedHouseholdItems: VendorRelatedHouseholdItem[] = householdRows.map((r) => ({
    ...r,
    status: r.status as HouseholdItemStatus,
  }));

  const workLines = db
    .select({
      id: workItemBudgets.id,
      description: workItemBudgets.description,
      plannedAmount: workItemBudgets.plannedAmount,
      createdAt: workItemBudgets.createdAt,
      parentId: workItems.id,
      parentTitle: workItems.title,
    })
    .from(workItemBudgets)
    .leftJoin(workItems, eq(workItems.id, workItemBudgets.workItemId))
    .where(eq(workItemBudgets.vendorId, vendorId))
    .all()
    .map((r) => ({
      ...r,
      parent:
        r.parentId !== null
          ? { type: 'work_item' as const, id: r.parentId, title: r.parentTitle! }
          : null,
    }));
  const householdLines = db
    .select({
      id: householdItemBudgets.id,
      description: householdItemBudgets.description,
      plannedAmount: householdItemBudgets.plannedAmount,
      createdAt: householdItemBudgets.createdAt,
      parentId: householdItems.id,
      parentTitle: householdItems.name,
    })
    .from(householdItemBudgets)
    .innerJoin(householdItems, eq(householdItems.id, householdItemBudgets.householdItemId))
    .where(eq(householdItemBudgets.vendorId, vendorId))
    .all()
    .map((r) => ({
      ...r,
      parent: { type: 'household_item' as const, id: r.parentId, title: r.parentTitle },
    }));

  // Parent title ASC (orphans last), then created_at, id. Merged in memory: the two line tables
  // are separate; a company's lines are few.
  const relatedBudgetLines: VendorRelatedBudgetLine[] = [...workLines, ...householdLines]
    .sort((a, b) => {
      if (a.parent === null || b.parent === null) {
        if (a.parent !== b.parent) return a.parent === null ? 1 : -1;
      } else if (a.parent.title !== b.parent.title) {
        return a.parent.title < b.parent.title ? -1 : 1;
      }
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
      return a.id < b.id ? -1 : 1; // ids are unique UUIDs
    })
    .map((r) => ({
      id: r.id,
      description: r.description,
      plannedAmount: r.plannedAmount,
      parent: r.parent,
    }));

  return {
    workItems: relatedWorkItems,
    householdItems: relatedHouseholdItems,
    budgetLines: relatedBudgetLines,
  };
}
