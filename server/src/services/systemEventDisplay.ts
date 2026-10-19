/**
 * System event display rules (ADR-040 §6, #2223) — applied at read time, on the server.
 *
 * R1: `milestone_delay` events created after their milestone's `completed_at` are hidden
 *     (`julianday` comparison; a date-only `completed_at` counts as the start of that day).
 * R2: exact repeats collapse: consecutive automatic rows of one subject with identical parameters
 *     become the newest row of the run, plus `repeat { count, firstAt, lastAt }`. The subject key is
 *     `entry_type`, `source_entity_type`, `source_entity_id`, `metadata.depositId` and the R1 flag.
 *     Parameters are compared as `json_remove(metadata, '$.subjectLabel')` text (canonical key
 *     order, ADR-040 §2); legacy rows collapse on identical title and body.
 * R3: nothing is deleted. `showHidden` turns R1 off (R2 still applies).
 *
 * Manual rows (`is_automatic = 0`) are never grouped. Reused by `GET /api/history` (contract 17).
 */

import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { diaryEntries, milestones } from '../db/schema.js';
import type { SystemEventRepeat } from '@cornerstone/shared';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

export interface DisplayQueryOptions {
  /** Filter conditions on `diary_entries` (drizzle columns only, no alias). */
  where: SQL | undefined;
  /** Turn R1 off; rows R1 would hide come back with `hidden: true`. */
  showHidden: boolean;
  page: number;
  pageSize: number;
}

export interface DisplayRow {
  id: string;
  repeat: SystemEventRepeat | null;
  hidden: boolean;
}

interface RawRow {
  id: string;
  cnt: number;
  first_at: string;
  last_at: string;
  is_hidden: number;
}

interface CountRow {
  total_items: number;
  hidden_count: number;
}

/** The shared CTE chain: filtered rows -> R1 flag -> subject/parameter keys -> runs -> groups. */
function buildGroupedCte(where: SQL | undefined): SQL {
  return sql`
    WITH base AS (
      SELECT
        ${diaryEntries.id} AS id,
        ${diaryEntries.entryDate} AS entry_date,
        ${diaryEntries.createdAt} AS created_at,
        ${diaryEntries.isAutomatic} AS is_automatic,
        ${diaryEntries.entryType} AS entry_type,
        ${diaryEntries.sourceEntityType} AS source_entity_type,
        ${diaryEntries.sourceEntityId} AS source_entity_id,
        ${diaryEntries.title} AS title,
        ${diaryEntries.body} AS body,
        CASE WHEN ${diaryEntries.metadata} IS NOT NULL AND json_valid(${diaryEntries.metadata})
          THEN ${diaryEntries.metadata} END AS meta,
        CASE WHEN ${diaryEntries.isAutomatic} = 1
              AND ${diaryEntries.entryType} = 'milestone_delay'
              AND ${diaryEntries.sourceEntityType} = 'milestone'
              AND EXISTS (
                SELECT 1 FROM ${milestones}
                WHERE ${milestones.id} = CAST(${diaryEntries.sourceEntityId} AS INTEGER)
                  AND ${milestones.completedAt} IS NOT NULL
                  AND julianday(${diaryEntries.createdAt}) > julianday(${milestones.completedAt})
              )
          THEN 1 ELSE 0 END AS is_hidden
      FROM ${diaryEntries}
      WHERE ${where ?? sql`1 = 1`}
    ),
    keyed AS (
      SELECT *,
        CASE WHEN is_automatic = 0 THEN 'row|' || id
          ELSE entry_type || '|' || COALESCE(source_entity_type, '') || '|'
            || COALESCE(source_entity_id, '') || '|'
            || COALESCE(json_extract(meta, '$.depositId'), '') || '|' || is_hidden
        END AS subj,
        CASE WHEN meta IS NULL OR json_extract(meta, '$.event') = 'legacy'
          THEN 'legacy|' || COALESCE(title, '') || '|' || body
          ELSE json_remove(meta, '$.subjectLabel')
        END AS pkey
      FROM base
    ),
    runs AS (
      SELECT *,
        CASE WHEN LAG(pkey) OVER w IS pkey THEN 0 ELSE 1 END AS run_start
      FROM keyed
      WINDOW w AS (PARTITION BY subj ORDER BY created_at, id)
    ),
    numbered AS (
      SELECT *,
        SUM(run_start) OVER (
          PARTITION BY subj ORDER BY created_at, id ROWS UNBOUNDED PRECEDING
        ) AS run_no
      FROM runs
    ),
    grouped AS (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY subj, run_no ORDER BY created_at DESC, id DESC) AS rn,
        COUNT(*) OVER (PARTITION BY subj, run_no) AS cnt,
        MIN(created_at) OVER (PARTITION BY subj, run_no) AS first_at,
        MAX(created_at) OVER (PARTITION BY subj, run_no) AS last_at
      FROM numbered
    )
  `;
}

/**
 * Apply R1/R2 to the filtered diary rows. Returns one page of representative rows (the newest of
 * each run) in list order (`entry_date DESC, created_at DESC, id DESC`), plus the counts after R1/R2.
 */
export function listDisplayRows(
  db: DbType,
  opts: DisplayQueryOptions,
): { rows: DisplayRow[]; totalItems: number; hiddenCount: number } {
  const cte = buildGroupedCte(opts.where);
  const showHidden = opts.showHidden ? 1 : 0;
  const offset = (opts.page - 1) * opts.pageSize;

  const counts = db.all<CountRow>(sql`
    ${cte}
    SELECT
      COALESCE(SUM(CASE WHEN is_hidden = 0 OR ${showHidden} = 1 THEN 1 ELSE 0 END), 0) AS total_items,
      COALESCE(SUM(CASE WHEN is_hidden = 1 THEN 1 ELSE 0 END), 0) AS hidden_count
    FROM grouped
    WHERE rn = 1
  `)[0];

  const rawRows = db.all<RawRow>(sql`
    ${cte}
    SELECT id, cnt, first_at, last_at, is_hidden
    FROM grouped
    WHERE rn = 1 AND (is_hidden = 0 OR ${showHidden} = 1)
    ORDER BY entry_date DESC, created_at DESC, id DESC
    LIMIT ${opts.pageSize} OFFSET ${offset}
  `);

  const rows: DisplayRow[] = rawRows.map((r) => ({
    id: r.id,
    repeat: r.cnt > 1 ? { count: r.cnt, firstAt: r.first_at, lastAt: r.last_at } : null,
    hidden: r.is_hidden === 1,
  }));

  return {
    rows,
    totalItems: counts?.total_items ?? 0,
    hiddenCount: counts?.hidden_count ?? 0,
  };
}
