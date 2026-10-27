/**
 * Grant chips of task / purchase list rows (#2242, AC6): one batched query per response.
 * Rejected grants are excluded; chips are ordered by grant name, then id.
 */

import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../../db/schema.js';
import type { ItemGrantChip, SubsidyReductionType } from '@cornerstone/shared';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

export type GrantChipItemKind = 'work_item' | 'household_item';

/** itemId -> chips for the given page of item ids; every id has an entry (`[]` when none). */
export function loadGrantChips(
  db: Pick<DbType, 'all'>,
  kind: GrantChipItemKind,
  itemIds: readonly string[],
): Map<string, ItemGrantChip[]> {
  const result = new Map<string, ItemGrantChip[]>();
  for (const id of itemIds) result.set(id, []);
  if (itemIds.length === 0) return result;

  const table =
    kind === 'work_item' ? sql.raw('work_item_subsidies') : sql.raw('household_item_subsidies');
  const column = kind === 'work_item' ? sql.raw('work_item_id') : sql.raw('household_item_id');
  const rows = db.all<{
    itemId: string;
    id: string;
    name: string;
    reductionType: SubsidyReductionType;
    reductionValue: number;
  }>(
    sql`SELECT
      link.${column}   AS itemId,
      sp.id            AS id,
      sp.name          AS name,
      sp.reduction_type  AS reductionType,
      sp.reduction_value AS reductionValue
    FROM ${table} link
    INNER JOIN subsidy_programs sp ON sp.id = link.subsidy_program_id
    WHERE sp.application_status <> 'rejected'
      AND link.${column} IN (${sql.join(
        itemIds.map((id) => sql`${id}`),
        sql`, `,
      )})
    ORDER BY sp.name ASC, sp.id ASC`,
  );
  for (const row of rows) {
    result.get(row.itemId)!.push({
      id: row.id,
      name: row.name,
      reductionType: row.reductionType,
      rate: row.reductionValue,
    });
  }
  return result;
}
