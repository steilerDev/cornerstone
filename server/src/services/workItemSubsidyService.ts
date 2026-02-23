import { eq, and, inArray, asc } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import {
  workItems,
  workItemSubsidies,
  subsidyPrograms,
  subsidyProgramCategories,
  budgetCategories,
  users,
} from '../db/schema.js';
import type {
  SubsidyProgram,
  SubsidyReductionType,
  SubsidyApplicationStatus,
  BudgetCategory,
  UserSummary,
} from '@cornerstone/shared';
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
 * Convert database budget category row to BudgetCategory shape.
 */
function toBudgetCategory(row: typeof budgetCategories.$inferSelect): BudgetCategory {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    color: row.color ?? null,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Load applicable categories for a given subsidy program.
 */
function loadApplicableCategories(db: DbType, subsidyProgramId: string): BudgetCategory[] {
  const links = db
    .select()
    .from(subsidyProgramCategories)
    .where(eq(subsidyProgramCategories.subsidyProgramId, subsidyProgramId))
    .all();

  if (links.length === 0) return [];

  const categoryIds = links.map((l) => l.budgetCategoryId);
  const categories = db
    .select()
    .from(budgetCategories)
    .where(inArray(budgetCategories.id, categoryIds))
    .orderBy(asc(budgetCategories.sortOrder), asc(budgetCategories.name))
    .all();

  return categories.map(toBudgetCategory);
}

/**
 * Convert database subsidy program row to SubsidyProgram shape.
 */
function toSubsidyProgram(db: DbType, row: typeof subsidyPrograms.$inferSelect): SubsidyProgram {
  const createdByUser = row.createdBy
    ? db.select().from(users).where(eq(users.id, row.createdBy)).get()
    : null;

  const applicableCategories = loadApplicableCategories(db, row.id);

  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    eligibility: row.eligibility ?? null,
    reductionType: row.reductionType as SubsidyReductionType,
    reductionValue: row.reductionValue,
    applicationStatus: row.applicationStatus as SubsidyApplicationStatus,
    applicationDeadline: row.applicationDeadline ?? null,
    notes: row.notes ?? null,
    applicableCategories,
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
 * List all subsidy programs linked to a work item.
 * @throws NotFoundError if work item does not exist
 */
export function listWorkItemSubsidies(db: DbType, workItemId: string): SubsidyProgram[] {
  assertWorkItemExists(db, workItemId);

  const rows = db
    .select({ program: subsidyPrograms })
    .from(workItemSubsidies)
    .innerJoin(subsidyPrograms, eq(subsidyPrograms.id, workItemSubsidies.subsidyProgramId))
    .where(eq(workItemSubsidies.workItemId, workItemId))
    .all();

  return rows.map((row) => toSubsidyProgram(db, row.program));
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
  assertWorkItemExists(db, workItemId);

  // Validate subsidy program exists
  const program = db
    .select()
    .from(subsidyPrograms)
    .where(eq(subsidyPrograms.id, subsidyProgramId))
    .get();

  if (!program) {
    throw new NotFoundError('Subsidy program not found');
  }

  // Check for existing link
  const existing = db
    .select()
    .from(workItemSubsidies)
    .where(
      and(
        eq(workItemSubsidies.workItemId, workItemId),
        eq(workItemSubsidies.subsidyProgramId, subsidyProgramId),
      ),
    )
    .get();

  if (existing) {
    throw new ConflictError('Subsidy program is already linked to this work item');
  }

  // Create the link
  db.insert(workItemSubsidies).values({ workItemId, subsidyProgramId }).run();

  return toSubsidyProgram(db, program);
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
  assertWorkItemExists(db, workItemId);

  const existing = db
    .select()
    .from(workItemSubsidies)
    .where(
      and(
        eq(workItemSubsidies.workItemId, workItemId),
        eq(workItemSubsidies.subsidyProgramId, subsidyProgramId),
      ),
    )
    .get();

  if (!existing) {
    throw new NotFoundError('Subsidy program is not linked to this work item');
  }

  db.delete(workItemSubsidies)
    .where(
      and(
        eq(workItemSubsidies.workItemId, workItemId),
        eq(workItemSubsidies.subsidyProgramId, subsidyProgramId),
      ),
    )
    .run();
}
