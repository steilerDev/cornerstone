import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { householdItems, householdItemSubsidies } from '../db/schema.js';
import { createSubsidyService } from './shared/subsidyServiceFactory.js';
import type { SubsidyProgram } from '@cornerstone/shared';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

const service = createSubsidyService({
  entityTable: householdItems,
  entityIdColumn: householdItems.id,
  junctionTable: householdItemSubsidies,
  junctionEntityIdColumn: householdItemSubsidies.householdItemId,
  junctionSubsidyProgramIdColumn: householdItemSubsidies.subsidyProgramId,
  entityLabel: 'Household item',
  makeInsertValues: (householdItemId, subsidyProgramId) => ({ householdItemId, subsidyProgramId }),
});

/**
 * List all subsidy programs linked to a household item.
 * @throws NotFoundError if household item does not exist
 */
export function listHouseholdItemSubsidies(db: DbType, householdItemId: string): SubsidyProgram[] {
  return service.list(db, householdItemId);
}

/**
 * Link a subsidy program to a household item.
 * @throws NotFoundError if household item or subsidy program does not exist
 * @throws ConflictError if the subsidy program is already linked to this household item
 */
export function linkSubsidyToHouseholdItem(
  db: DbType,
  householdItemId: string,
  subsidyProgramId: string,
): SubsidyProgram {
  return service.link(db, householdItemId, subsidyProgramId);
}

/**
 * Unlink a subsidy program from a household item.
 * @throws NotFoundError if household item does not exist, or if the link does not exist
 */
export function unlinkSubsidyFromHouseholdItem(
  db: DbType,
  householdItemId: string,
  subsidyProgramId: string,
): void {
  return service.unlink(db, householdItemId, subsidyProgramId);
}
