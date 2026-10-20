import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../../db/schema.js';
import { NotFoundError } from '../../errors/AppError.js';
import { getItemGrantPayback } from '../moneyService.js';

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

/**
 * Per-item subsidy payback. The values come from the money service (ADR-039): counted grants
 * only in the totals, pro-rata capped shares, invoice-linked lines at face value. The config's
 * table names are constant identifiers used for the 404 lookup only.
 */
export function createSubsidyPaybackService(
  config: SubsidyPaybackConfig,
): (db: DbType, entityId: string, vatRate: number) => unknown {
  const kind = config.entityTable === 'household_items' ? 'household_item' : 'work_item';

  return function getPayback(db: DbType, entityId: string, vatRate: number): unknown {
    const item = db.get<{ id: string }>(
      sql`SELECT id FROM ${sql.raw(config.entityTable)} WHERE id = ${entityId}`,
    );
    if (!item) {
      throw new NotFoundError(`${config.entityLabel} not found`);
    }

    const payback = getItemGrantPayback(db, vatRate, kind, entityId);
    return {
      [config.entityIdResponseKey]: entityId,
      minTotalPayback: payback.minTotalPayback,
      maxTotalPayback: payback.maxTotalPayback,
      expectedTotalPayback: payback.expectedTotalPayback,
      subsidies: payback.subsidies,
    };
  };
}
