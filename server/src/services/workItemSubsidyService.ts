import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { workItems, workItemSubsidies } from '../db/schema.js';
import { createSubsidyService } from './shared/subsidyServiceFactory.js';
import type { DeletedSubsidyLinkSnapshot } from './shared/subsidyServiceFactory.js';
import type { UndoTransaction } from './undoService.js';
import type { SubsidyProgram } from '@cornerstone/shared';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

const service = createSubsidyService({
  entityTable: workItems,
  entityIdColumn: workItems.id,
  junctionTable: workItemSubsidies,
  junctionTableName: 'work_item_subsidies',
  junctionEntityIdColumn: workItemSubsidies.workItemId,
  junctionEntityIdColumnName: 'work_item_id',
  junctionSubsidyProgramIdColumn: workItemSubsidies.subsidyProgramId,
  junctionSubsidyProgramIdColumnName: 'subsidy_program_id',
  budgetLinesTable: 'work_item_budgets',
  budgetLinesEntityIdColumn: 'work_item_id',
  entityLabel: 'Work item',
  subjectType: 'work_item',
  makeInsertValues: (workItemId, subsidyProgramId) => ({ workItemId, subsidyProgramId }),
});

/**
 * List all subsidy programs linked to a work item.
 * @throws NotFoundError if work item does not exist
 */
export function listWorkItemSubsidies(db: DbType, workItemId: string): SubsidyProgram[] {
  return service.list(db, workItemId);
}

/**
 * Link a subsidy program to a work item.
 * @throws NotFoundError if work item or subsidy program does not exist
 * @throws ConflictError if the subsidy program is already linked to this work item
 */
export function linkSubsidyToWorkItem(
  db: DbType,
  workItemId: string,
  subsidyProgramId: string,
): SubsidyProgram {
  return service.link(db, workItemId, subsidyProgramId);
}

/**
 * Unlink a subsidy program from a work item and return the deleted link for an Undo snapshot.
 * @throws NotFoundError if work item does not exist, or if the link does not exist
 */
export function unlinkSubsidyFromWorkItemWithSnapshot(
  db: DbType,
  workItemId: string,
  subsidyProgramId: string,
): DeletedSubsidyLinkSnapshot {
  return service.unlinkWithSnapshot(db, workItemId, subsidyProgramId);
}

/**
 * Re-insert a deleted work item subsidy link.
 * @throws ConflictError (details.changed) when either side is gone or the link exists again
 */
export function restoreDeletedWorkItemSubsidyLink(
  tx: UndoTransaction,
  snapshot: DeletedSubsidyLinkSnapshot,
): void {
  service.restore(tx, snapshot);
}
