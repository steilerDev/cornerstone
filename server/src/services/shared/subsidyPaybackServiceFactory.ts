import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../../db/schema.js';
import { CONFIDENCE_MARGINS } from '@cornerstone/shared';
import { NotFoundError } from '../../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;
type ConfidenceLevel = keyof typeof CONFIDENCE_MARGINS;

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

export interface SubsidyPaybackEntry {
  subsidyProgramId: string;
  name: string;
  reductionType: 'percentage' | 'fixed';
  reductionValue: number;
  minPayback: number;
  maxPayback: number;
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
          work_item_budget_id AS workItemBudgetId,
          COALESCE(SUM(amount), 0) AS actualCost
        FROM invoices
        WHERE work_item_budget_id IN (
          SELECT id FROM work_item_budgets WHERE work_item_id = ${entityId}
        )
        GROUP BY work_item_budget_id`,
      );

      for (const row of invoiceRows) {
        invoiceMap.set(row.workItemBudgetId, row.actualCost);
      }
    }

    const budgetLines = budgetLineRows.map((line) => {
      if (config.supportsInvoices && invoiceMap.has(line.id)) {
        const actualCost = invoiceMap.get(line.id) ?? 0;
        return {
          id: line.id,
          budgetCategoryId: line.budgetCategoryId,
          minAmount: actualCost,
          maxAmount: actualCost,
        };
      } else {
        const margin =
          CONFIDENCE_MARGINS[line.confidence as ConfidenceLevel] ?? CONFIDENCE_MARGINS.own_estimate;
        return {
          id: line.id,
          budgetCategoryId: line.budgetCategoryId,
          minAmount: line.plannedAmount * (1 - margin),
          maxAmount: line.plannedAmount * (1 + margin),
        };
      }
    });

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

    const subsidyEntries: SubsidyPaybackEntry[] = [];
    let minTotalPayback = 0;
    let maxTotalPayback = 0;

    for (const subsidy of linkedRows) {
      const applicableCategories = subsidyCategoryMap.get(subsidy.subsidyProgramId);
      const isUniversal = !applicableCategories || applicableCategories.size === 0;
      let minPayback = 0;
      let maxPayback = 0;

      if (subsidy.reductionType === 'percentage') {
        const rate = subsidy.reductionValue / 100;
        for (const line of budgetLines) {
          const categoryMatches =
            isUniversal ||
            (line.budgetCategoryId !== null && applicableCategories!.has(line.budgetCategoryId));
          if (categoryMatches) {
            minPayback += line.minAmount * rate;
            maxPayback += line.maxAmount * rate;
          }
        }
      } else if (subsidy.reductionType === 'fixed') {
        minPayback = subsidy.reductionValue;
        maxPayback = subsidy.reductionValue;
      }

      subsidyEntries.push({
        subsidyProgramId: subsidy.subsidyProgramId,
        name: subsidy.name,
        reductionType: subsidy.reductionType as 'percentage' | 'fixed',
        reductionValue: subsidy.reductionValue,
        minPayback,
        maxPayback,
      });
      minTotalPayback += minPayback;
      maxTotalPayback += maxPayback;
    }

    return {
      [config.entityIdResponseKey]: entityId,
      minTotalPayback,
      maxTotalPayback,
      subsidies: subsidyEntries,
    };
  };
}
