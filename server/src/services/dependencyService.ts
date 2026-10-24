import { eq, and, or } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { workItemDependencies, workItems } from '../db/schema.js';
import type {
  CreateDependencyRequest,
  UpdateDependencyRequest,
  DependencyCreatedResponse,
  WorkItemDependenciesResponse,
  DependencyResponse,
} from '@cornerstone/shared';
import {
  NotFoundError,
  ValidationError,
  DuplicateDependencyError,
  CircularDependencyError,
  ConflictError,
} from '../errors/AppError.js';
import { toWorkItemSummary } from './workItemService.js';
import { autoReschedule, computeScheduleProjection } from './schedulingEngine.js';
import { loadAreaMap } from './areaService.js';
import type { UndoTransaction } from './undoService.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Verify a work item exists.
 * @throws NotFoundError if work item does not exist
 */
function ensureWorkItemExists(db: DbType, workItemId: string, context: string): void {
  const workItem = db.select().from(workItems).where(eq(workItems.id, workItemId)).get();
  if (!workItem) {
    throw new NotFoundError(`${context} not found`);
  }
}

/**
 * Detect circular dependencies using depth-first search.
 * Starting from predecessorId, traverse all its predecessors recursively.
 * If successorId is found in the traversal, a cycle would be created.
 *
 * @returns The cycle path if detected, null otherwise
 */
function detectCycle(
  db: Pick<DbType, 'select'>,
  successorId: string,
  predecessorId: string,
): string[] | null {
  const MAX_ITERATIONS = 10000;
  const visited = new Set<string>();
  const path: string[] = [predecessorId];
  let iterations = 0;

  function dfs(currentId: string): boolean {
    // Prevent DoS on pathological graphs
    if (++iterations > MAX_ITERATIONS) {
      return false;
    }

    if (currentId === successorId) {
      path.push(successorId);
      return true; // Cycle detected
    }

    if (visited.has(currentId)) {
      return false;
    }

    visited.add(currentId);

    // Find all predecessors of current (work items that current depends on)
    const predecessors = db
      .select({ predecessorId: workItemDependencies.predecessorId })
      .from(workItemDependencies)
      .where(eq(workItemDependencies.successorId, currentId))
      .all();

    for (const { predecessorId: predId } of predecessors) {
      path.push(predId);
      if (dfs(predId)) {
        return true;
      }
      path.pop();
    }

    return false;
  }

  if (dfs(predecessorId)) {
    return path;
  }

  return null;
}

/**
 * Create a dependency where workItemId is the successor (depends on predecessorId).
 * @throws NotFoundError if either work item does not exist
 * @throws ValidationError if workItemId === predecessorId (self-reference)
 * @throws DuplicateDependencyError if dependency already exists (DUPLICATE_DEPENDENCY)
 * @throws CircularDependencyError if circular dependency would be created (CIRCULAR_DEPENDENCY)
 */
export function createDependency(
  db: DbType,
  workItemId: string,
  data: CreateDependencyRequest,
): DependencyCreatedResponse {
  const { predecessorId, dependencyType = 'finish_to_start', leadLagDays = 0 } = data;

  // Reject self-reference (check before DB queries)
  if (workItemId === predecessorId) {
    throw new ValidationError('A work item cannot depend on itself');
  }

  // Validate both work items exist
  ensureWorkItemExists(db, workItemId, 'Successor work item');
  ensureWorkItemExists(db, predecessorId, 'Predecessor work item');

  // Check for duplicate dependency
  const existing = db
    .select()
    .from(workItemDependencies)
    .where(
      and(
        eq(workItemDependencies.successorId, workItemId),
        eq(workItemDependencies.predecessorId, predecessorId),
      ),
    )
    .get();

  if (existing) {
    throw new DuplicateDependencyError();
  }

  // Perform circular dependency detection
  const cycle = detectCycle(db, workItemId, predecessorId);
  if (cycle) {
    // Fetch work item titles for the cycle path
    const cycleWithTitles = cycle.map((id) => {
      // cycle ids come from the dependency graph, whose endpoints are work items (FK)
      const wi = db
        .select({ title: workItems.title })
        .from(workItems)
        .where(eq(workItems.id, id))
        .get()!;
      return `"${wi.title}"`;
    });

    throw new CircularDependencyError(
      `Circular dependency detected: ${cycleWithTitles.join(' → ')}`,
      { cycle },
    );
  }

  // Create dependency
  db.insert(workItemDependencies)
    .values({
      predecessorId,
      successorId: workItemId,
      dependencyType,
      leadLagDays,
    })
    .run();

  autoReschedule(db);

  return {
    predecessorId,
    successorId: workItemId,
    dependencyType,
    leadLagDays,
  };
}

/**
 * Update a dependency's dependencyType and/or leadLagDays.
 * @throws ValidationError if no fields are provided
 * @throws NotFoundError if the dependency does not exist
 */
export function updateDependency(
  db: DbType,
  workItemId: string,
  predecessorId: string,
  data: UpdateDependencyRequest,
): DependencyCreatedResponse {
  // Ensure at least one field is provided
  if (Object.keys(data).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  // Find the existing dependency
  const dependency = db
    .select()
    .from(workItemDependencies)
    .where(
      and(
        eq(workItemDependencies.successorId, workItemId),
        eq(workItemDependencies.predecessorId, predecessorId),
      ),
    )
    .get();

  if (!dependency) {
    throw new NotFoundError('Dependency not found');
  }

  // Build update data
  const updateData: Partial<typeof workItemDependencies.$inferInsert> = {};
  if ('dependencyType' in data && data.dependencyType !== undefined) {
    updateData.dependencyType = data.dependencyType;
  }
  if ('leadLagDays' in data && data.leadLagDays !== undefined) {
    updateData.leadLagDays = data.leadLagDays;
  }

  // Apply update
  db.update(workItemDependencies)
    .set(updateData)
    .where(
      and(
        eq(workItemDependencies.successorId, workItemId),
        eq(workItemDependencies.predecessorId, predecessorId),
      ),
    )
    .run();

  // Fetch updated row
  const updated = db
    .select()
    .from(workItemDependencies)
    .where(
      and(
        eq(workItemDependencies.successorId, workItemId),
        eq(workItemDependencies.predecessorId, predecessorId),
      ),
    )
    .get()!;

  autoReschedule(db);

  return {
    predecessorId: updated.predecessorId,
    successorId: updated.successorId,
    dependencyType: updated.dependencyType,
    leadLagDays: updated.leadLagDays,
  };
}

/**
 * Get dependencies (predecessors and successors) for a work item.
 * @throws NotFoundError if work item does not exist
 */
export function getDependencies(db: DbType, workItemId: string): WorkItemDependenciesResponse {
  // Ensure work item exists
  ensureWorkItemExists(db, workItemId, 'Work item');

  // Load area map once for all work item summaries
  const areaMap = loadAreaMap(db);
  const projection = computeScheduleProjection(db);

  // Fetch predecessors: work items that this item depends on
  const predecessorRows = db
    .select({
      dependency: workItemDependencies,
      workItem: workItems,
    })
    .from(workItemDependencies)
    .innerJoin(workItems, eq(workItems.id, workItemDependencies.predecessorId))
    .where(eq(workItemDependencies.successorId, workItemId))
    .all();

  const predecessors: DependencyResponse[] = predecessorRows.map((row) => ({
    workItem: toWorkItemSummary(db, row.workItem, areaMap, projection),
    dependencyType: row.dependency.dependencyType,
    leadLagDays: row.dependency.leadLagDays,
  }));

  // Fetch successors: work items that depend on this item
  const successorRows = db
    .select({
      dependency: workItemDependencies,
      workItem: workItems,
    })
    .from(workItemDependencies)
    .innerJoin(workItems, eq(workItems.id, workItemDependencies.successorId))
    .where(eq(workItemDependencies.predecessorId, workItemId))
    .all();

  const successors: DependencyResponse[] = successorRows.map((row) => ({
    workItem: toWorkItemSummary(db, row.workItem, areaMap, projection),
    dependencyType: row.dependency.dependencyType,
    leadLagDays: row.dependency.leadLagDays,
  }));

  return { predecessors, successors };
}

/** A deleted work-item dependency, as needed to restore it. */
export interface DeletedDependencySnapshot {
  row: typeof workItemDependencies.$inferSelect;
}

/**
 * Delete a specific dependency and return the deleted row for an Undo snapshot.
 * The route reschedules after issuing the Undo token.
 * @throws NotFoundError if dependency does not exist
 */
export function deleteDependencyWithSnapshot(
  db: DbType,
  workItemId: string,
  predecessorId: string,
): DeletedDependencySnapshot {
  const where = and(
    eq(workItemDependencies.successorId, workItemId),
    eq(workItemDependencies.predecessorId, predecessorId),
  );
  const row = db.transaction((tx) => {
    const existing = tx.select().from(workItemDependencies).where(where).get();
    if (!existing) {
      throw new NotFoundError('Dependency not found');
    }
    tx.delete(workItemDependencies).where(where).run();
    return existing;
  });

  return { row };
}

/**
 * Re-insert a deleted dependency.
 * @throws ConflictError (details.changed) when either work item is gone, the two items are
 *   linked again (in either direction) or re-adding would create a cycle
 */
export function restoreDeletedDependency(
  tx: UndoTransaction,
  snapshot: DeletedDependencySnapshot,
): void {
  const { row } = snapshot;
  const refuse = (): never => {
    throw new ConflictError('The record changed after this action', {
      changed: [{ type: 'work_item', id: row.successorId }],
    });
  };

  const bothExist =
    tx
      .select({ id: workItems.id })
      .from(workItems)
      .where(eq(workItems.id, row.successorId))
      .get() &&
    tx
      .select({ id: workItems.id })
      .from(workItems)
      .where(eq(workItems.id, row.predecessorId))
      .get();
  if (!bothExist) refuse();

  const linked = tx
    .select({ predecessorId: workItemDependencies.predecessorId })
    .from(workItemDependencies)
    .where(
      or(
        and(
          eq(workItemDependencies.successorId, row.successorId),
          eq(workItemDependencies.predecessorId, row.predecessorId),
        ),
        and(
          eq(workItemDependencies.successorId, row.predecessorId),
          eq(workItemDependencies.predecessorId, row.successorId),
        ),
      ),
    )
    .get();
  if (linked) refuse();

  if (detectCycle(tx, row.successorId, row.predecessorId)) refuse();

  tx.insert(workItemDependencies).values(row).run();
}
