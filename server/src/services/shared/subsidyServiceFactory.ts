import { eq, and, inArray, asc } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type * as schemaTypes from '../../db/schema.js';
import {
  subsidyPrograms,
  subsidyProgramCategories,
  budgetCategories,
  users,
} from '../../db/schema.js';
import { toUserSummary, toBudgetCategory } from './converters.js';
import type {
  SubsidyProgram,
  SubsidyReductionType,
  SubsidyApplicationStatus,
  BudgetCategory,
} from '@cornerstone/shared';
import { NotFoundError, ConflictError } from '../../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

export interface SubsidyServiceConfig {
  entityTable: SQLiteTable;
  entityIdColumn: SQLiteColumn;
  junctionTable: SQLiteTable;
  junctionEntityIdColumn: SQLiteColumn;
  junctionSubsidyProgramIdColumn: SQLiteColumn;
  entityLabel: string;
  makeInsertValues: (entityId: string, subsidyProgramId: string) => Record<string, string>;
}

export interface SubsidyService {
  list: (db: DbType, entityId: string) => SubsidyProgram[];
  link: (db: DbType, entityId: string, subsidyProgramId: string) => SubsidyProgram;
  unlink: (db: DbType, entityId: string, subsidyProgramId: string) => void;
}

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

  return categories.map((row) => toBudgetCategory(row)!);
}

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

export function createSubsidyService(config: SubsidyServiceConfig): SubsidyService {
  function assertEntityExists(db: DbType, entityId: string): void {
    const item = db
      .select()
      .from(config.entityTable)
      .where(eq(config.entityIdColumn, entityId))
      .get();
    if (!item) {
      throw new NotFoundError(`${config.entityLabel} not found`);
    }
  }

  function list(db: DbType, entityId: string): SubsidyProgram[] {
    assertEntityExists(db, entityId);

    const rows = db
      .select({ program: subsidyPrograms })
      .from(config.junctionTable)
      .innerJoin(subsidyPrograms, eq(subsidyPrograms.id, config.junctionSubsidyProgramIdColumn))
      .where(eq(config.junctionEntityIdColumn, entityId))
      .all();

    return rows.map((row) => toSubsidyProgram(db, row.program));
  }

  function link(db: DbType, entityId: string, subsidyProgramId: string): SubsidyProgram {
    assertEntityExists(db, entityId);

    const program = db
      .select()
      .from(subsidyPrograms)
      .where(eq(subsidyPrograms.id, subsidyProgramId))
      .get();

    if (!program) {
      throw new NotFoundError('Subsidy program not found');
    }

    const existing = db
      .select()
      .from(config.junctionTable)
      .where(
        and(
          eq(config.junctionEntityIdColumn, entityId),
          eq(config.junctionSubsidyProgramIdColumn, subsidyProgramId),
        ),
      )
      .get();

    if (existing) {
      throw new ConflictError(
        `Subsidy program is already linked to this ${config.entityLabel.toLowerCase()}`,
      );
    }

    const insertValues = config.makeInsertValues(entityId, subsidyProgramId);
    db.insert(config.junctionTable).values(insertValues).run();

    return toSubsidyProgram(db, program);
  }

  function unlink(db: DbType, entityId: string, subsidyProgramId: string): void {
    assertEntityExists(db, entityId);

    const existing = db
      .select()
      .from(config.junctionTable)
      .where(
        and(
          eq(config.junctionEntityIdColumn, entityId),
          eq(config.junctionSubsidyProgramIdColumn, subsidyProgramId),
        ),
      )
      .get();

    if (!existing) {
      throw new NotFoundError(
        `Subsidy program is not linked to this ${config.entityLabel.toLowerCase()}`,
      );
    }

    db.delete(config.junctionTable)
      .where(
        and(
          eq(config.junctionEntityIdColumn, entityId),
          eq(config.junctionSubsidyProgramIdColumn, subsidyProgramId),
        ),
      )
      .run();
  }

  return { list, link, unlink };
}
