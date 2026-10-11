/**
 * Delete Impact Service — counts what a successful DELETE would also change (EPIC-21 story 1.3,
 * contract 19).
 *
 * Every count mirrors a cascade, set-null or explicit cleanup the matching delete service
 * performs on success (verified against `schema.ts` `onDelete` and the delete functions).
 * Anything that makes the DELETE fail with 409 is not an effect. Read-only; parameterized
 * queries only; zero counts are omitted; the effect order is fixed per type.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type {
  DeleteImpactEffect,
  DeleteImpactEntityType,
  DeleteImpactKind,
  DeleteImpactResponse,
} from '@cornerstone/shared';
import type * as schemaTypes from '../db/schema.js';
import {
  areas,
  budgetSources,
  diaryEntries,
  documentLinks,
  householdItemBudgets,
  householdItemDeps,
  householdItemNotes,
  householdItemSubsidies,
  householdItems,
  invoiceBudgetLines,
  invoiceDeposits,
  invoices,
  milestoneWorkItems,
  milestones,
  orientations,
  photos,
  subsidyPrograms,
  vendorContacts,
  vendors,
  workItemBudgets,
  workItemDependencies,
  workItemMilestoneDeps,
  workItemNotes,
  workItemSubsidies,
  workItemSubtasks,
  workItems,
} from '../db/schema.js';
import { NotFoundError } from '../errors/AppError.js';
import { getDescendantIds } from './areaService.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

function count(db: DbType, table: SQLiteTable, where: SQL | undefined): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(table)
    .where(where)
    .get();
  return row?.n ?? 0;
}

class Effects {
  private readonly list: DeleteImpactEffect[] = [];

  add(kind: DeleteImpactKind, n: number): void {
    if (n > 0) this.list.push({ kind, count: n });
  }

  result(): DeleteImpactEffect[] {
    return this.list;
  }
}

function linkCount(db: DbType, entityType: string, id: string): number {
  return count(
    db,
    documentLinks,
    and(eq(documentLinks.entityType, entityType as 'work_item'), eq(documentLinks.entityId, id)),
  );
}

function assertExists(db: DbType, table: SQLiteTable, where: SQL, message: string): void {
  if (count(db, table, where) === 0) throw new NotFoundError(message);
}

/**
 * Compute the effects of deleting an entity.
 * @throws NotFoundError when the entity does not exist (milestone ids must be integers)
 */
export function getDeleteImpact(
  db: DbType,
  entityType: DeleteImpactEntityType,
  id: string,
): DeleteImpactResponse {
  const effects = new Effects();

  switch (entityType) {
    case 'area': {
      assertExists(db, areas, eq(areas.id, id), 'Area not found');
      const ids = getDescendantIds(db, id);
      effects.add('childAreas', ids.length - 1);
      effects.add('photosLoseArea', count(db, photos, inArray(photos.areaId, ids)));
      break;
    }
    case 'orientation': {
      assertExists(db, orientations, eq(orientations.id, id), 'Orientation not found');
      effects.add('photosLoseOrientation', count(db, photos, eq(photos.orientationId, id)));
      break;
    }
    case 'vendor': {
      assertExists(db, vendors, eq(vendors.id, id), 'Vendor not found');
      effects.add('contacts', count(db, vendorContacts, eq(vendorContacts.vendorId, id)));
      effects.add('tasksUnassigned', count(db, workItems, eq(workItems.assignedVendorId, id)));
      effects.add(
        'purchasesUnassigned',
        count(db, householdItems, eq(householdItems.vendorId, id)),
      );
      effects.add(
        'costLinesUnassigned',
        count(db, householdItemBudgets, eq(householdItemBudgets.vendorId, id)),
      );
      break;
    }
    case 'invoice': {
      assertExists(db, invoices, eq(invoices.id, id), 'Invoice not found');
      effects.add(
        'progressPayments',
        count(db, invoiceDeposits, eq(invoiceDeposits.invoiceId, id)),
      );
      effects.add(
        'costLinesUnlinked',
        count(db, invoiceBudgetLines, eq(invoiceBudgetLines.invoiceId, id)),
      );
      effects.add('documentLinks', linkCount(db, 'invoice', id));
      break;
    }
    case 'subsidy_program': {
      assertExists(db, subsidyPrograms, eq(subsidyPrograms.id, id), 'Subsidy program not found');
      effects.add(
        'purchasesUnlinked',
        count(db, householdItemSubsidies, eq(householdItemSubsidies.subsidyProgramId, id)),
      );
      effects.add('documentLinks', linkCount(db, 'subsidy_program', id));
      break;
    }
    case 'budget_source': {
      assertExists(db, budgetSources, eq(budgetSources.id, id), 'Budget source not found');
      effects.add(
        'progressPaymentsUnassigned',
        count(db, invoiceDeposits, eq(invoiceDeposits.budgetSourceId, id)),
      );
      effects.add('documentLinks', linkCount(db, 'budget_source', id));
      break;
    }
    case 'milestone': {
      const milestoneId = Number(id);
      if (!Number.isInteger(milestoneId)) throw new NotFoundError('Milestone not found');
      assertExists(db, milestones, eq(milestones.id, milestoneId), 'Milestone not found');
      effects.add(
        'tasksUnlinked',
        count(db, milestoneWorkItems, eq(milestoneWorkItems.milestoneId, milestoneId)),
      );
      effects.add(
        'dependencies',
        count(db, workItemMilestoneDeps, eq(workItemMilestoneDeps.milestoneId, milestoneId)),
      );
      effects.add(
        'purchaseDependencies',
        count(
          db,
          householdItemDeps,
          and(
            eq(householdItemDeps.predecessorType, 'milestone'),
            eq(householdItemDeps.predecessorId, String(milestoneId)),
          ),
        ),
      );
      break;
    }
    case 'work_item': {
      assertExists(db, workItems, eq(workItems.id, id), 'Work item not found');
      const budgetIds = db
        .select({ id: workItemBudgets.id })
        .from(workItemBudgets)
        .where(eq(workItemBudgets.workItemId, id));
      effects.add('costLines', count(db, workItemBudgets, eq(workItemBudgets.workItemId, id)));
      effects.add(
        'invoiceLinks',
        count(db, invoiceBudgetLines, inArray(invoiceBudgetLines.workItemBudgetId, budgetIds)),
      );
      effects.add('subtasks', count(db, workItemSubtasks, eq(workItemSubtasks.workItemId, id)));
      effects.add('notes', count(db, workItemNotes, eq(workItemNotes.workItemId, id)));
      effects.add(
        'taskDependencies',
        count(
          db,
          workItemDependencies,
          sql`${workItemDependencies.predecessorId} = ${id} OR ${workItemDependencies.successorId} = ${id}`,
        ),
      );
      effects.add(
        'milestoneLinks',
        count(db, milestoneWorkItems, eq(milestoneWorkItems.workItemId, id)),
      );
      effects.add(
        'milestoneWaits',
        count(db, workItemMilestoneDeps, eq(workItemMilestoneDeps.workItemId, id)),
      );
      effects.add(
        'purchaseDependencies',
        count(
          db,
          householdItemDeps,
          and(
            eq(householdItemDeps.predecessorType, 'work_item'),
            eq(householdItemDeps.predecessorId, id),
          ),
        ),
      );
      effects.add('grantLinks', count(db, workItemSubsidies, eq(workItemSubsidies.workItemId, id)));
      effects.add('documentLinks', linkCount(db, 'work_item', id));
      break;
    }
    case 'household_item': {
      assertExists(db, householdItems, eq(householdItems.id, id), 'Household item not found');
      const budgetIds = db
        .select({ id: householdItemBudgets.id })
        .from(householdItemBudgets)
        .where(eq(householdItemBudgets.householdItemId, id));
      effects.add(
        'costLines',
        count(db, householdItemBudgets, eq(householdItemBudgets.householdItemId, id)),
      );
      effects.add(
        'invoiceLinks',
        count(db, invoiceBudgetLines, inArray(invoiceBudgetLines.householdItemBudgetId, budgetIds)),
      );
      effects.add(
        'notes',
        count(db, householdItemNotes, eq(householdItemNotes.householdItemId, id)),
      );
      effects.add(
        'taskDependencies',
        count(db, householdItemDeps, eq(householdItemDeps.householdItemId, id)),
      );
      effects.add(
        'grantLinks',
        count(db, householdItemSubsidies, eq(householdItemSubsidies.householdItemId, id)),
      );
      effects.add('documentLinks', linkCount(db, 'household_item', id));
      break;
    }
    case 'diary_entry': {
      assertExists(db, diaryEntries, eq(diaryEntries.id, id), 'Diary entry not found');
      effects.add(
        'photos',
        count(db, photos, and(eq(photos.entityType, 'diary_entry'), eq(photos.entityId, id))),
      );
      break;
    }
  }

  return { entityType, id, effects: effects.result() };
}
