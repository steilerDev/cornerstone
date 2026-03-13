import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { workItems, workItemSubsidies } from '../db/schema.js';
import { createSubsidyService } from './shared/subsidyServiceFactory.js';
import type { SubsidyProgram } from '@cornerstone/shared';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

const service = createSubsidyService({
  entityTable: workItems,
  entityIdColumn: workItems.id,
  junctionTable: workItemSubsidies,
  junctionEntityIdColumn: workItemSubsidies.workItemId,
  junctionSubsidyProgramIdColumn: workItemSubsidies.subsidyProgramId,
  budgetLinesTable: 'work_item_budgets',
  budgetLinesEntityIdColumn: 'work_item_id',
  entityLabel: 'Work item',
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
 * Unlink a subsidy program from a work item.
 * @throws NotFoundError if work item does not exist, or if the link does not exist
 */
export function unlinkSubsidyFromWorkItem(
  db: DbType,
  workItemId: string,
  subsidyProgramId: string,
): void {
  return service.unlink(db, workItemId, subsidyProgramId);
}
