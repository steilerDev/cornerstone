import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../../db/schema.js';
import { NotFoundError } from '../../errors/AppError.js';
import { computeSubsidyEffects } from './subsidyCalculationEngine.js';
import type { LinkedSubsidy } from './subsidyCalculationEngine.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

export interface SubsidyPaybackConfig {
  entityTable: string;
  junctionTable: string;
  junctionAlias: string;
  junctionEntityIdColumn: string;
  budgetLinesTable: string;
  budgetLinesEntityIdColumn: string;
  supportsInvoices: boolean;
  entityLabel: string;
  entityIdResponseKey: string;
}

export function createSubsidyPaybackService(
  config: SubsidyPaybackConfig,
): (db: DbType, entityId: string) => unknown {
  return function getPayback(db: DbType, entityId: string): unknown {
    const item = db.get<{ id: string }>(
      sql`SELECT id FROM ${sql.raw(config.entityTable)} WHERE id = ${entityId}`,
    );
    if (!item) {
      throw new NotFoundError(`${config.entityLabel} not found`);
    }

    const linkedRows = db.all<{
      subsidyProgramId: string;
      name: string;
      reductionType: string;
      reductionValue: number;
    }>(
      sql`SELECT
        sp.id              AS subsidyProgramId,
        sp.name            AS name,
        sp.reduction_type  AS reductionType,
        sp.reduction_value AS reductionValue
      FROM ${sql.raw(config.junctionTable)} ${sql.raw(config.junctionAlias)}
      INNER JOIN subsidy_programs sp ON sp.id = ${sql.raw(`${config.junctionAlias}.subsidy_program_id`)}
      WHERE ${sql.raw(`${config.junctionAlias}.${config.junctionEntityIdColumn}`)} = ${entityId}
        AND sp.application_status != 'rejected'`,
    );

    if (linkedRows.length === 0) {
      return {
        [config.entityIdResponseKey]: entityId,
        minTotalPayback: 0,
        maxTotalPayback: 0,
        subsidies: [],
      };
    }

    const budgetLineRows = db.all<{
      id: string;
      plannedAmount: number;
      confidence: string;
      budgetCategoryId: string | null;
    }>(
      sql`SELECT
        id                 AS id,
        planned_amount     AS plannedAmount,
        confidence         AS confidence,
        budget_category_id AS budgetCategoryId
      FROM ${sql.raw(config.budgetLinesTable)}
      WHERE ${sql.raw(config.budgetLinesEntityIdColumn)} = ${entityId}`,
    );

    const invoiceMap = new Map<string, number>();
    if (config.supportsInvoices) {
      const invoiceRows = db.all<{ workItemBudgetId: string; actualCost: number }>(
        sql`SELECT
          ibl.work_item_budget_id AS workItemBudgetId,
          COALESCE(SUM(ibl.itemized_amount), 0) AS actualCost
        FROM invoice_budget_lines ibl
        INNER JOIN invoices i ON i.id = ibl.invoice_id
        WHERE ibl.work_item_budget_id IN (
          SELECT id FROM work_item_budgets WHERE work_item_id = ${entityId}
        )
        GROUP BY ibl.work_item_budget_id`,
      );

      for (const row of invoiceRows) {
        invoiceMap.set(row.workItemBudgetId, row.actualCost);
      }
    }

    // Map raw rows to engine input shapes
    const engineBudgetLines = budgetLineRows.map((line) => ({
      id: line.id,
      budgetCategoryId: line.budgetCategoryId,
      plannedAmount: line.plannedAmount,
      confidence: line.confidence,
    }));

    const engineSubsidies: LinkedSubsidy[] = linkedRows.map((row) => ({
      subsidyProgramId: row.subsidyProgramId,
      name: row.name,
      reductionType: row.reductionType as 'percentage' | 'fixed',
      reductionValue: row.reductionValue,
    }));

    const subsidyIds = linkedRows.map((r) => r.subsidyProgramId);
    const inList = subsidyIds.map((id) => sql`${id}`);
    const categoryRows = db.all<{ subsidyProgramId: string; budgetCategoryId: string }>(
      sql`SELECT subsidy_program_id AS subsidyProgramId, budget_category_id AS budgetCategoryId
      FROM subsidy_program_categories
      WHERE subsidy_program_id IN (${sql.join(inList, sql`, `)})`,
    );

    const subsidyCategoryMap = new Map<string, Set<string>>();
    for (const row of categoryRows) {
      let cats = subsidyCategoryMap.get(row.subsidyProgramId);
      if (!cats) {
        cats = new Set<string>();
        subsidyCategoryMap.set(row.subsidyProgramId, cats);
      }
      cats.add(row.budgetCategoryId);
    }

    const { subsidies, minTotalPayback, maxTotalPayback } = computeSubsidyEffects(
      engineBudgetLines,
      engineSubsidies,
      subsidyCategoryMap,
      invoiceMap,
    );

    return {
      [config.entityIdResponseKey]: entityId,
      minTotalPayback,
      maxTotalPayback,
      subsidies,
    };
  };
}
