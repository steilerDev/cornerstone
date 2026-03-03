import { eq, and, inArray, asc } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import {
  householdItems,
  householdItemSubsidies,
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
 * List all subsidy programs linked to a household item.
 * @throws NotFoundError if household item does not exist
 */
export function listHouseholdItemSubsidies(db: DbType, householdItemId: string): SubsidyProgram[] {
  assertHouseholdItemExists(db, householdItemId);

  const rows = db
    .select({ program: subsidyPrograms })
    .from(householdItemSubsidies)
    .innerJoin(subsidyPrograms, eq(subsidyPrograms.id, householdItemSubsidies.subsidyProgramId))
    .where(eq(householdItemSubsidies.householdItemId, householdItemId))
    .all();

  return rows.map((row) => toSubsidyProgram(db, row.program));
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
  assertHouseholdItemExists(db, householdItemId);

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
    .from(householdItemSubsidies)
    .where(
      and(
        eq(householdItemSubsidies.householdItemId, householdItemId),
        eq(householdItemSubsidies.subsidyProgramId, subsidyProgramId),
      ),
    )
    .get();

  if (existing) {
    throw new ConflictError('Subsidy program is already linked to this household item');
  }

  // Create the link
  db.insert(householdItemSubsidies).values({ householdItemId, subsidyProgramId }).run();

  return toSubsidyProgram(db, program);
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
  assertHouseholdItemExists(db, householdItemId);

  const existing = db
    .select()
    .from(householdItemSubsidies)
    .where(
      and(
        eq(householdItemSubsidies.householdItemId, householdItemId),
        eq(householdItemSubsidies.subsidyProgramId, subsidyProgramId),
      ),
    )
    .get();

  if (!existing) {
    throw new NotFoundError('Subsidy program is not linked to this household item');
  }

  db.delete(householdItemSubsidies)
    .where(
      and(
        eq(householdItemSubsidies.householdItemId, householdItemId),
        eq(householdItemSubsidies.subsidyProgramId, subsidyProgramId),
      ),
    )
    .run();
}
