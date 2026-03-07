/**
 * Household item work item linking service.
 *
 * EPIC-09: Story 9.1 — Household Item Timeline Dependencies
 *
 * This service maintains a single public function for the reverse view:
 * listing household items that depend on a given work item.
 *
 * For dependency CRUD operations, see householdItemDepService.ts.
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import type { WorkItemLinkedHouseholdItemSummary } from '@cornerstone/shared';
import { listDependentHouseholdItemsForWorkItem as listFromDepService } from './householdItemDepService.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * List all household items that depend on a work item (reverse direction view).
 * Returns household items with delivery date information.
 * Delegates to householdItemDepService for the actual implementation.
 */
export function listDependentHouseholdItemsForWorkItem(
  db: DbType,
  workItemId: string,
): WorkItemLinkedHouseholdItemSummary[] {
  return listFromDepService(db, workItemId);
}
