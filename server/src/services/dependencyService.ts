import { eq, and } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { workItemDependencies, workItems } from '../db/schema.js';
import type {
  CreateDependencyRequest,
  DependencyCreatedResponse,
  WorkItemDependenciesResponse,
  DependencyResponse,
} from '@cornerstone/shared';
import { NotFoundError, ValidationError, ConflictError } from '../errors/AppError.js';
import { toWorkItemSummary } from './workItemService.js';

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
function detectCycle(db: DbType, successorId: string, predecessorId: string): string[] | null {
  const visited = new Set<string>();
  const path: string[] = [predecessorId];

  function dfs(currentId: string): boolean {
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
 * @throws ConflictError if dependency already exists (DUPLICATE_DEPENDENCY)
 * @throws ConflictError if circular dependency would be created (CIRCULAR_DEPENDENCY)
 */
export function createDependency(
  db: DbType,
  workItemId: string,
  data: CreateDependencyRequest,
): DependencyCreatedResponse {
  const { predecessorId, dependencyType = 'finish_to_start' } = data;

  // Validate both work items exist
  ensureWorkItemExists(db, workItemId, 'Successor work item');
  ensureWorkItemExists(db, predecessorId, 'Predecessor work item');

  // Reject self-reference
  if (workItemId === predecessorId) {
    throw new ValidationError('A work item cannot depend on itself');
  }

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
    throw new ConflictError('Dependency already exists', { code: 'DUPLICATE_DEPENDENCY' });
  }

  // Perform circular dependency detection
  const cycle = detectCycle(db, workItemId, predecessorId);
  if (cycle) {
    // Fetch work item titles for the cycle path
    const cycleWithTitles = cycle.map((id) => {
      const wi = db
        .select({ title: workItems.title })
        .from(workItems)
        .where(eq(workItems.id, id))
        .get();
      return wi ? `"${wi.title}"` : id;
    });

    throw new ConflictError(`Circular dependency detected: ${cycleWithTitles.join(' → ')}`, {
      code: 'CIRCULAR_DEPENDENCY',
      cyclePath: cycle,
    });
  }

  // Create dependency
  db.insert(workItemDependencies)
    .values({
      predecessorId,
      successorId: workItemId,
      dependencyType,
    })
    .run();

  return {
    predecessorId,
    successorId: workItemId,
    dependencyType,
  };
}

/**
 * Get dependencies (predecessors and successors) for a work item.
 * @throws NotFoundError if work item does not exist
 */
export function getDependencies(db: DbType, workItemId: string): WorkItemDependenciesResponse {
  // Ensure work item exists
  ensureWorkItemExists(db, workItemId, 'Work item');

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
    workItem: toWorkItemSummary(db, row.workItem),
    dependencyType: row.dependency.dependencyType,
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
    workItem: toWorkItemSummary(db, row.workItem),
    dependencyType: row.dependency.dependencyType,
  }));

  return { predecessors, successors };
}

/**
 * Delete a specific dependency.
 * @throws NotFoundError if dependency does not exist
 */
export function deleteDependency(db: DbType, workItemId: string, predecessorId: string): void {
  // Check if dependency exists
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

  // Delete the dependency
  db.delete(workItemDependencies)
    .where(
      and(
        eq(workItemDependencies.successorId, workItemId),
        eq(workItemDependencies.predecessorId, predecessorId),
      ),
    )
    .run();
}
