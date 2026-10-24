import { eq, and, inArray, asc } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { UndoTransaction } from '../undoService.js';
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
  junctionTableName: string;
  junctionEntityIdColumn: SQLiteColumn;
  junctionEntityIdColumnName: string;
  junctionSubsidyProgramIdColumn: SQLiteColumn;
  junctionSubsidyProgramIdColumnName: string;
  budgetLinesTable: string;
  budgetLinesEntityIdColumn: string;
  entityLabel: string;
  /** Undo subject reported when a restore is refused. */
  subjectType: 'work_item' | 'household_item';
  makeInsertValues: (entityId: string, subsidyProgramId: string) => Record<string, string>;
}

/** A deleted subsidy link, as needed to restore it. */
export interface DeletedSubsidyLinkSnapshot {
  entityId: string;
  subsidyProgramId: string;
}

export interface SubsidyService {
  list: (db: DbType, entityId: string) => SubsidyProgram[];
  link: (db: DbType, entityId: string, subsidyProgramId: string) => SubsidyProgram;
  unlinkWithSnapshot: (
    db: DbType,
    entityId: string,
    subsidyProgramId: string,
  ) => DeletedSubsidyLinkSnapshot;
  restore: (tx: UndoTransaction, snapshot: DeletedSubsidyLinkSnapshot) => void;
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
    maximumAmount: row.maximumAmount ?? null,
    applicableCategories,
    includesNoCategoryItems: row.includesNoCategoryItems === 1,
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

  function unlinkWithSnapshot(
    db: DbType,
    entityId: string,
    subsidyProgramId: string,
  ): DeletedSubsidyLinkSnapshot {
    assertEntityExists(db, entityId);

    return db.transaction((tx) => {
      const where = and(
        eq(config.junctionEntityIdColumn, entityId),
        eq(config.junctionSubsidyProgramIdColumn, subsidyProgramId),
      );
      const existing = tx.select().from(config.junctionTable).where(where).get();
      if (!existing) {
        throw new NotFoundError(
          `Subsidy program is not linked to this ${config.entityLabel.toLowerCase()}`,
        );
      }

      tx.delete(config.junctionTable).where(where).run();
      return { entityId, subsidyProgramId };
    });
  }

  /**
   * Re-insert a deleted subsidy link.
   * @throws ConflictError (details.changed) when the entity or the subsidy program is gone, or
   *   the link exists again
   */
  function restore(tx: UndoTransaction, snapshot: DeletedSubsidyLinkSnapshot): void {
    const { entityId, subsidyProgramId } = snapshot;
    const entity = tx
      .select()
      .from(config.entityTable)
      .where(eq(config.entityIdColumn, entityId))
      .get();
    const program = tx
      .select({ id: subsidyPrograms.id })
      .from(subsidyPrograms)
      .where(eq(subsidyPrograms.id, subsidyProgramId))
      .get();
    const linkedAgain = tx
      .select()
      .from(config.junctionTable)
      .where(
        and(
          eq(config.junctionEntityIdColumn, entityId),
          eq(config.junctionSubsidyProgramIdColumn, subsidyProgramId),
        ),
      )
      .get();
    if (!entity || !program || linkedAgain) {
      throw new ConflictError('The record changed after this action', {
        changed: [{ type: config.subjectType, id: entityId }],
      });
    }

    tx.insert(config.junctionTable)
      .values(config.makeInsertValues(entityId, subsidyProgramId))
      .run();
  }

  return { list, link, unlinkWithSnapshot, restore };
}
