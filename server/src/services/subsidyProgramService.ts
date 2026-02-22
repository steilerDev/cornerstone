import { randomUUID } from 'node:crypto';
import { eq, asc, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import {
  subsidyPrograms,
  subsidyProgramCategories,
  budgetCategories,
  workItemSubsidies,
  users,
} from '../db/schema.js';
import type {
  SubsidyProgram,
  SubsidyReductionType,
  SubsidyApplicationStatus,
  CreateSubsidyProgramRequest,
  UpdateSubsidyProgramRequest,
  BudgetCategory,
  UserSummary,
} from '@cornerstone/shared';
import { NotFoundError, ValidationError, SubsidyProgramInUseError } from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

const VALID_REDUCTION_TYPES: SubsidyReductionType[] = ['percentage', 'fixed'];
const VALID_APPLICATION_STATUSES: SubsidyApplicationStatus[] = [
  'eligible',
  'applied',
  'approved',
  'received',
  'rejected',
];

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
 * Load applicable categories for a given subsidy program ID.
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
 * Convert database subsidy program row to SubsidyProgram API shape.
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
 * Validate and resolve category IDs, throwing ValidationError for unknowns.
 */
function validateCategoryIds(db: DbType, categoryIds: string[]): void {
  if (categoryIds.length === 0) return;

  const found = db
    .select({ id: budgetCategories.id })
    .from(budgetCategories)
    .where(inArray(budgetCategories.id, categoryIds))
    .all();

  const foundIds = new Set(found.map((r) => r.id));
  const missing = categoryIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new ValidationError(`Unknown category IDs: ${missing.join(', ')}`);
  }
}

/**
 * Replace all category links for a given subsidy program.
 * Deletes existing links then inserts new ones (within the same transaction context).
 */
function replaceCategoryLinks(db: DbType, subsidyProgramId: string, categoryIds: string[]): void {
  db.delete(subsidyProgramCategories)
    .where(eq(subsidyProgramCategories.subsidyProgramId, subsidyProgramId))
    .run();

  if (categoryIds.length === 0) return;

  const rows = categoryIds.map((categoryId) => ({
    subsidyProgramId,
    budgetCategoryId: categoryId,
  }));
  db.insert(subsidyProgramCategories).values(rows).run();
}

/**
 * List all subsidy programs, sorted by name ascending.
 * Each program includes its applicable categories.
 */
export function listSubsidyPrograms(db: DbType): SubsidyProgram[] {
  const rows = db.select().from(subsidyPrograms).orderBy(asc(subsidyPrograms.name)).all();
  return rows.map((row) => toSubsidyProgram(db, row));
}

/**
 * Get a single subsidy program by ID.
 * @throws NotFoundError if program does not exist
 */
export function getSubsidyProgramById(db: DbType, id: string): SubsidyProgram {
  const row = db.select().from(subsidyPrograms).where(eq(subsidyPrograms.id, id)).get();
  if (!row) {
    throw new NotFoundError('Subsidy program not found');
  }
  return toSubsidyProgram(db, row);
}

/**
 * Create a new subsidy program.
 * @throws ValidationError if required fields are missing or invalid
 * @throws ValidationError if any categoryIds reference unknown budget categories
 */
export function createSubsidyProgram(
  db: DbType,
  data: CreateSubsidyProgramRequest,
  userId: string,
): SubsidyProgram {
  // Validate name
  const trimmedName = data.name.trim();
  if (trimmedName.length === 0 || trimmedName.length > 200) {
    throw new ValidationError('Subsidy program name must be between 1 and 200 characters');
  }

  // Validate reductionType
  if (!VALID_REDUCTION_TYPES.includes(data.reductionType)) {
    throw new ValidationError(
      `Invalid reduction type. Must be one of: ${VALID_REDUCTION_TYPES.join(', ')}`,
    );
  }

  // Validate reductionValue
  if (typeof data.reductionValue !== 'number' || data.reductionValue <= 0) {
    throw new ValidationError('Reduction value must be a positive number');
  }
  if (data.reductionType === 'percentage' && data.reductionValue > 100) {
    throw new ValidationError('Percentage reduction value must not exceed 100');
  }

  // Validate applicationStatus if provided
  if (
    data.applicationStatus !== undefined &&
    !VALID_APPLICATION_STATUSES.includes(data.applicationStatus)
  ) {
    throw new ValidationError(
      `Invalid application status. Must be one of: ${VALID_APPLICATION_STATUSES.join(', ')}`,
    );
  }

  // Validate categoryIds if provided
  const categoryIds = data.categoryIds ?? [];
  if (categoryIds.length > 0) {
    validateCategoryIds(db, categoryIds);
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const applicationStatus = data.applicationStatus ?? 'eligible';

  db.insert(subsidyPrograms)
    .values({
      id,
      name: trimmedName,
      description: data.description ?? null,
      eligibility: data.eligibility ?? null,
      reductionType: data.reductionType,
      reductionValue: data.reductionValue,
      applicationStatus,
      applicationDeadline: data.applicationDeadline ?? null,
      notes: data.notes ?? null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  if (categoryIds.length > 0) {
    replaceCategoryLinks(db, id, categoryIds);
  }

  return getSubsidyProgramById(db, id);
}

/**
 * Update a subsidy program's fields.
 * If categoryIds is provided, replaces all existing category links.
 * @throws NotFoundError if program does not exist
 * @throws ValidationError if fields are invalid
 */
export function updateSubsidyProgram(
  db: DbType,
  id: string,
  data: UpdateSubsidyProgramRequest,
): SubsidyProgram {
  // Check program exists
  const existing = db.select().from(subsidyPrograms).where(eq(subsidyPrograms.id, id)).get();
  if (!existing) {
    throw new NotFoundError('Subsidy program not found');
  }

  // Check at least one field provided
  if (
    data.name === undefined &&
    data.reductionType === undefined &&
    data.reductionValue === undefined &&
    data.description === undefined &&
    data.eligibility === undefined &&
    data.applicationStatus === undefined &&
    data.applicationDeadline === undefined &&
    data.notes === undefined &&
    data.categoryIds === undefined
  ) {
    throw new ValidationError('At least one field must be provided');
  }

  const updates: Partial<typeof subsidyPrograms.$inferInsert> = {};

  // Validate and add name if provided
  if (data.name !== undefined) {
    const trimmedName = data.name.trim();
    if (trimmedName.length === 0 || trimmedName.length > 200) {
      throw new ValidationError('Subsidy program name must be between 1 and 200 characters');
    }
    updates.name = trimmedName;
  }

  // Validate and add reductionType if provided
  if (data.reductionType !== undefined) {
    if (!VALID_REDUCTION_TYPES.includes(data.reductionType)) {
      throw new ValidationError(
        `Invalid reduction type. Must be one of: ${VALID_REDUCTION_TYPES.join(', ')}`,
      );
    }
    updates.reductionType = data.reductionType;
  }

  // Validate and add reductionValue if provided
  if (data.reductionValue !== undefined) {
    if (typeof data.reductionValue !== 'number' || data.reductionValue <= 0) {
      throw new ValidationError('Reduction value must be a positive number');
    }
    const effectiveReductionType = data.reductionType ?? existing.reductionType;
    if (effectiveReductionType === 'percentage' && data.reductionValue > 100) {
      throw new ValidationError('Percentage reduction value must not exceed 100');
    }
    updates.reductionValue = data.reductionValue;
  }

  // Validate and add applicationStatus if provided
  if (data.applicationStatus !== undefined) {
    if (!VALID_APPLICATION_STATUSES.includes(data.applicationStatus)) {
      throw new ValidationError(
        `Invalid application status. Must be one of: ${VALID_APPLICATION_STATUSES.join(', ')}`,
      );
    }
    updates.applicationStatus = data.applicationStatus;
  }

  // Add nullable text fields if provided
  if (data.description !== undefined) {
    updates.description = data.description;
  }
  if (data.eligibility !== undefined) {
    updates.eligibility = data.eligibility;
  }
  if (data.applicationDeadline !== undefined) {
    updates.applicationDeadline = data.applicationDeadline;
  }
  if (data.notes !== undefined) {
    updates.notes = data.notes;
  }

  // Validate categoryIds if provided
  if (data.categoryIds !== undefined) {
    if (data.categoryIds.length > 0) {
      validateCategoryIds(db, data.categoryIds);
    }
  }

  // Set updated timestamp
  const now = new Date().toISOString();
  updates.updatedAt = now;

  // Perform main record update (only if scalar fields changed)
  const scalarKeys = Object.keys(updates).filter((k) => k !== 'updatedAt');
  if (scalarKeys.length > 0 || data.categoryIds === undefined) {
    // Always update updatedAt when any field changes
    db.update(subsidyPrograms).set(updates).where(eq(subsidyPrograms.id, id)).run();
  } else {
    // categoryIds only — still bump updatedAt
    db.update(subsidyPrograms).set({ updatedAt: now }).where(eq(subsidyPrograms.id, id)).run();
  }

  // Replace category links if provided
  if (data.categoryIds !== undefined) {
    replaceCategoryLinks(db, id, data.categoryIds);
  }

  return getSubsidyProgramById(db, id);
}

/**
 * Delete a subsidy program.
 * Fails if any work items reference this program via work_item_subsidies.
 * @throws NotFoundError if program does not exist
 * @throws SubsidyProgramInUseError if referenced by work items
 */
export function deleteSubsidyProgram(db: DbType, id: string): void {
  // Check program exists
  const existing = db.select().from(subsidyPrograms).where(eq(subsidyPrograms.id, id)).get();
  if (!existing) {
    throw new NotFoundError('Subsidy program not found');
  }

  // Check for work item references
  const references = db
    .select({ workItemId: workItemSubsidies.workItemId })
    .from(workItemSubsidies)
    .where(eq(workItemSubsidies.subsidyProgramId, id))
    .all();

  if (references.length > 0) {
    throw new SubsidyProgramInUseError('Subsidy program is in use and cannot be deleted', {
      workItemCount: references.length,
    });
  }

  // Delete program (junction table rows cascade via FK)
  db.delete(subsidyPrograms).where(eq(subsidyPrograms.id, id)).run();
}
