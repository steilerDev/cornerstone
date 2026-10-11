import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import {
  foldSearchText,
  searchDigits,
  SEARCH_RESULT_TYPES,
  type SearchAreaRef,
  type SearchGroup,
  type SearchMatchedField,
  type SearchParentRef,
  type SearchResponse,
  type SearchResultItem,
  type SearchResultType,
} from '@cornerstone/shared';
import { toLikeContainsPattern, toLikePrefixPattern } from './shared/likePattern.js';
import { loadAreaMap, resolveAreaAncestors } from './areaService.js';
import type { AreaMapEntry } from './areaService.js';
import { searchPaperlessDocuments } from './paperlessService.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

export interface SearchParams {
  q: string;
  types: readonly SearchResultType[];
  limit: number;
}

export interface PaperlessSearchDeps {
  baseUrl: string;
  token: string;
  filterTag: string | null;
  /** Hard cap for the whole Paperless call. Default 3000 ms. */
  timeoutMs?: number;
  /** Receives only error codes/names, never URLs, queries or tokens. */
  log?: { warn: (obj: Record<string, unknown>, msg: string) => void };
}

const PAPERLESS_DEFAULT_TIMEOUT_MS = 3000;
/** Minimum number of digits in the query before phone digit matching applies. */
const MIN_DIGITS_FOR_PHONE_MATCH = 3;
/** Rank value of a non-matching field; a row matches when its best rank is below it. */
const NO_MATCH_RANK = 9;
/** Row rank when only a non-label field matched (after equals 0, starts with 1, contains 2). */
const OTHER_FIELD_RANK = 3;
const LIKE_ESCAPE = "ESCAPE '\\'";

// ─── Query specs ──────────────────────────────────────────────────────────────
//
// Every spec fragment below is a compile-time constant owned by this file. User input only ever
// reaches SQL as bound parameters (see `buildQuery`). Columns are qualified by table alias by
// hand, because drizzle renders column references unqualified inside subqueries.

interface FieldSpec {
  name: SearchMatchedField;
  /** SQL expression yielding the raw text to fold and match. */
  text: string;
  /** SQL expression yielding digits only, for phone number matching. */
  digits?: string;
}

type AreaMode = 'self' | 'ancestors';

interface QuerySpec {
  type: SearchResultType;
  /** FROM clause including joins. */
  from: string;
  /** Optional fixed WHERE conditions (constants only). */
  where?: string;
  /**
   * Select list. Must alias exactly: id, label, sublabel, status, kind, date, phone, areaId,
   * updatedAt, parentType, parentId, parentLabel.
   */
  select: string;
  fields: FieldSpec[];
  areaMode?: AreaMode;
}

const CONTACTS_OF_VENDOR = 'FROM vendor_contacts vc WHERE vc.vendor_id = v.id';

const SPECS: QuerySpec[] = [
  {
    type: 'work_item',
    from: 'work_items w',
    select: `w.id AS "id", w.title AS "label", NULL AS "sublabel", w.status AS "status",
      NULL AS "kind", NULL AS "date", NULL AS "phone", w.area_id AS "areaId",
      w.updated_at AS "updatedAt", NULL AS "parentType", NULL AS "parentId", NULL AS "parentLabel"`,
    fields: [
      { name: 'title', text: 'w.title' },
      { name: 'description', text: 'w.description' },
    ],
    areaMode: 'self',
  },
  {
    type: 'milestone',
    from: 'milestones m',
    select: `CAST(m.id AS TEXT) AS "id", m.title AS "label", NULL AS "sublabel", NULL AS "status",
      NULL AS "kind", m.target_date AS "date", NULL AS "phone", NULL AS "areaId",
      m.updated_at AS "updatedAt", NULL AS "parentType", NULL AS "parentId", NULL AS "parentLabel"`,
    fields: [
      { name: 'title', text: 'm.title' },
      { name: 'description', text: 'm.description' },
    ],
  },
  {
    type: 'household_item',
    from: 'household_items h',
    select: `h.id AS "id", h.name AS "label", NULL AS "sublabel", h.status AS "status",
      NULL AS "kind", NULL AS "date", NULL AS "phone", h.area_id AS "areaId",
      h.updated_at AS "updatedAt", NULL AS "parentType", NULL AS "parentId", NULL AS "parentLabel"`,
    fields: [
      { name: 'name', text: 'h.name' },
      { name: 'description', text: 'h.description' },
    ],
    areaMode: 'self',
  },
  {
    type: 'invoice',
    from: 'invoices i INNER JOIN vendors v ON v.id = i.vendor_id',
    select: `i.id AS "id", i.invoice_number AS "label", v.name AS "sublabel", i.status AS "status",
      NULL AS "kind", i.date AS "date", NULL AS "phone", NULL AS "areaId",
      i.updated_at AS "updatedAt", NULL AS "parentType", NULL AS "parentId", NULL AS "parentLabel"`,
    fields: [
      { name: 'invoiceNumber', text: 'i.invoice_number' },
      { name: 'notes', text: 'i.notes' },
      { name: 'companyName', text: 'v.name' },
    ],
  },
  {
    type: 'vendor',
    from: 'vendors v LEFT JOIN trades t ON t.id = v.trade_id',
    select: `v.id AS "id", v.name AS "label", t.name AS "sublabel", NULL AS "status",
      NULL AS "kind", NULL AS "date",
      COALESCE(NULLIF(TRIM(v.phone), ''), (
        SELECT vc.phone FROM vendor_contacts vc
        WHERE vc.vendor_id = v.id AND TRIM(COALESCE(vc.phone, '')) <> ''
        ORDER BY vc.created_at ASC, vc.id ASC
        LIMIT 1
      )) AS "phone",
      NULL AS "areaId", v.updated_at AS "updatedAt",
      NULL AS "parentType", NULL AS "parentId", NULL AS "parentLabel"`,
    fields: [
      { name: 'name', text: 'v.name' },
      { name: 'tradeName', text: 't.name' },
      { name: 'phone', text: 'v.phone', digits: 'digits(v.phone)' },
      { name: 'email', text: 'v.email' },
      {
        name: 'contactName',
        text: `(SELECT group_concat(vc.name, char(10)) ${CONTACTS_OF_VENDOR})`,
      },
      {
        name: 'contactPhone',
        text: `(SELECT group_concat(vc.phone, char(10)) ${CONTACTS_OF_VENDOR})`,
        digits: `(SELECT group_concat(digits(vc.phone), ' ') ${CONTACTS_OF_VENDOR})`,
      },
      {
        name: 'contactEmail',
        text: `(SELECT group_concat(vc.email, char(10)) ${CONTACTS_OF_VENDOR})`,
      },
    ],
  },
  {
    type: 'diary_entry',
    from: 'diary_entries d',
    where: "d.status = 'saved' AND d.is_automatic = 0",
    select: `d.id AS "id", d.title AS "label", NULL AS "sublabel", NULL AS "status",
      d.entry_type AS "kind", d.entry_date AS "date", NULL AS "phone", NULL AS "areaId",
      d.updated_at AS "updatedAt", NULL AS "parentType", NULL AS "parentId", NULL AS "parentLabel"`,
    fields: [
      { name: 'title', text: 'd.title' },
      { name: 'body', text: 'd.body' },
    ],
  },
  {
    type: 'area',
    from: 'areas a',
    select: `a.id AS "id", a.name AS "label", NULL AS "sublabel", NULL AS "status",
      NULL AS "kind", NULL AS "date", NULL AS "phone", a.id AS "areaId",
      a.updated_at AS "updatedAt", NULL AS "parentType", NULL AS "parentId", NULL AS "parentLabel"`,
    fields: [
      { name: 'name', text: 'a.name' },
      { name: 'description', text: 'a.description' },
    ],
    areaMode: 'ancestors',
  },
  {
    // Work item budget lines: parent is the work item, else (orphan) the linked invoice.
    type: 'budget_line',
    from: `work_item_budgets b
      LEFT JOIN work_items w ON w.id = b.work_item_id
      LEFT JOIN invoice_budget_lines ibl ON ibl.work_item_budget_id = b.id
      LEFT JOIN invoices i ON i.id = ibl.invoice_id
      LEFT JOIN vendors v ON v.id = i.vendor_id`,
    where: 'b.description IS NOT NULL',
    select: `b.id AS "id", b.description AS "label", NULL AS "sublabel", NULL AS "status",
      NULL AS "kind", NULL AS "date", NULL AS "phone", NULL AS "areaId",
      b.updated_at AS "updatedAt",
      CASE WHEN w.id IS NOT NULL THEN 'work_item' WHEN i.id IS NOT NULL THEN 'invoice' END AS "parentType",
      CASE WHEN w.id IS NOT NULL THEN w.id ELSE i.id END AS "parentId",
      CASE WHEN w.id IS NOT NULL THEN w.title
        ELSE COALESCE(NULLIF(TRIM(i.invoice_number), ''), v.name) END AS "parentLabel"`,
    fields: [{ name: 'description', text: 'b.description' }],
  },
  {
    type: 'budget_line',
    from: `household_item_budgets b
      INNER JOIN household_items h ON h.id = b.household_item_id`,
    where: 'b.description IS NOT NULL',
    select: `b.id AS "id", b.description AS "label", NULL AS "sublabel", NULL AS "status",
      NULL AS "kind", NULL AS "date", NULL AS "phone", NULL AS "areaId",
      b.updated_at AS "updatedAt",
      'household_item' AS "parentType", h.id AS "parentId", h.name AS "parentLabel"`,
    fields: [{ name: 'description', text: 'b.description' }],
  },
];

const BASE_COLUMNS = [
  'id',
  'label',
  'sublabel',
  'status',
  'kind',
  'date',
  'phone',
  'areaId',
  'updatedAt',
  'parentType',
  'parentId',
  'parentLabel',
];

interface Needles {
  folded: string;
  prefix: string;
  contains: string;
  digitsContains: string | null;
}

interface RawRow {
  id: string;
  label: string | null;
  sublabel: string | null;
  status: string | null;
  kind: string | null;
  date: string | null;
  phone: string | null;
  areaId: string | null;
  updatedAt: string;
  parentType: SearchParentRef['type'] | null;
  parentId: string | null;
  parentLabel: string | null;
  rnk: number;
  matchedField: SearchMatchedField;
  total: number;
}

/**
 * Builds the three-level query for one spec:
 *   1. fold each searched column once (and the digits form of phone columns)
 *   2. rank each field: 0 equals, 1 starts with, 2 contains / digit match, 9 no match
 *   3. keep rows where any field matches, window-count the total, order, limit
 *
 * Ranking follows contract 6. `fields[0]` is the label: a row's `rnk` is the label's rank when
 * the label matches (0 equals, 1 starts with, 2 contains), else 3 (matched only through another
 * field). `matchedField` is the first field in array order that matches.
 */
function buildQuery(spec: QuerySpec, needles: Needles, limit: number): SQL {
  const withDigits = needles.digitsContains !== null;
  const raw = (s: string) => sql.raw(s);

  const foldCols = spec.fields.map((f, i) => `fold(${f.text}) AS f${i}`);
  const digitCols = spec.fields
    .map((f, i) => (withDigits && f.digits ? `${f.digits} AS d${i}` : null))
    .filter((c): c is string => c !== null);

  const level1 = sql`SELECT ${raw(spec.select)}, ${raw([...foldCols, ...digitCols].join(', '))}
    FROM ${raw(spec.from)}${spec.where ? sql` WHERE ${raw(spec.where)}` : sql``}`;

  const rankCols = spec.fields.map((f, i) => {
    const digitMatch =
      withDigits && f.digits
        ? sql` WHEN d${raw(String(i))} LIKE ${needles.digitsContains} ${raw(LIKE_ESCAPE)} THEN 2`
        : sql``;
    const col = raw(`f${i}`);
    return sql`CASE WHEN ${col} = ${needles.folded} THEN 0
      WHEN ${col} LIKE ${needles.prefix} ${raw(LIKE_ESCAPE)} THEN 1
      WHEN ${col} LIKE ${needles.contains} ${raw(LIKE_ESCAPE)} THEN 2${digitMatch}
      ELSE ${raw(String(NO_MATCH_RANK))} END AS r${raw(String(i))}`;
  });
  const level2 = sql`SELECT l1.*, ${sql.join(rankCols, sql`, `)} FROM l1`;

  const ranks = spec.fields.map((_, i) => `r${i}`);
  const best = `MIN(${ranks.join(', ')}, ${NO_MATCH_RANK})`;
  const rank = `CASE WHEN r0 < ${NO_MATCH_RANK} THEN r0 ELSE ${OTHER_FIELD_RANK} END`;
  const matchedCase = `CASE ${spec.fields
    .map((f, i) => `WHEN r${i} < ${NO_MATCH_RANK} THEN '${f.name}'`)
    .join(' ')} END`;
  const columns = BASE_COLUMNS.map((c) => `l2."${c}"`).join(', ');

  // MATERIALIZED: stops SQLite from flattening level 1 into level 2, which would re-run the
  // fold() UDF for every use of a folded column (equals, prefix, contains) instead of once per row.
  return sql`WITH l1 AS MATERIALIZED (${level1})
    SELECT ${raw(columns)}, ${raw(rank)} AS "rnk", ${raw(matchedCase)} AS "matchedField",
      COUNT(*) OVER () AS "total"
    FROM (${level2}) l2
    WHERE ${raw(best)} < ${raw(String(NO_MATCH_RANK))}
    ORDER BY "rnk" ASC, l2."updatedAt" DESC, l2."id" ASC
    LIMIT ${limit}`;
}

function runSpec(
  db: DbType,
  spec: QuerySpec,
  needles: Needles,
  limit: number,
): { rows: RawRow[]; total: number } {
  const rows = db.all<RawRow>(buildQuery(spec, needles, limit));
  return { rows, total: rows[0]?.total ?? 0 };
}

// ─── Row mapping ──────────────────────────────────────────────────────────────

function toAreaPath(
  areaId: string | null,
  mode: AreaMode | undefined,
  areaMap: Map<string, AreaMapEntry>,
): SearchAreaRef[] | null {
  if (!mode || areaId === null) return null;
  const path: SearchAreaRef[] = resolveAreaAncestors(areaId, areaMap).map((a) => ({
    id: a.id,
    name: a.name,
  }));
  if (mode === 'self') {
    const own = areaMap.get(areaId);
    if (!own) return null;
    path.push({ id: own.id, name: own.name });
  }
  return path;
}

function toItem(
  row: RawRow,
  mode: AreaMode | undefined,
  areaMap: Map<string, AreaMapEntry>,
): SearchResultItem {
  return {
    id: String(row.id),
    label: row.label,
    sublabel: row.sublabel,
    matchedField: row.matchedField,
    status: row.status,
    kind: row.kind,
    date: row.date,
    phone: row.phone,
    areaPath: toAreaPath(row.areaId, mode, areaMap),
    parent:
      row.parentType && row.parentId
        ? { type: row.parentType, id: row.parentId, label: row.parentLabel }
        : null,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Searches the database groups (everything except Paperless), returned in tuple order.
 * The query is folded first, then LIKE-escaped, then bound as a parameter.
 */
export function searchDatabase(db: DbType, params: SearchParams): SearchGroup[] {
  const trimmed = params.q.trim();
  const folded = foldSearchText(trimmed);
  const requested = SEARCH_RESULT_TYPES.filter(
    (t) => t !== 'paperless_document' && params.types.includes(t),
  );

  if (folded === '') {
    return requested.map((type) => ({ type, total: 0, status: 'ok', items: [] }));
  }

  const qDigits = searchDigits(trimmed);
  const needles: Needles = {
    folded,
    prefix: toLikePrefixPattern(folded),
    contains: toLikeContainsPattern(folded),
    digitsContains:
      qDigits.length >= MIN_DIGITS_FOR_PHONE_MATCH ? toLikeContainsPattern(qDigits) : null,
  };

  let areaMap: Map<string, AreaMapEntry> | null = null;
  const getAreaMap = () => (areaMap ??= loadAreaMap(db));

  return requested.map((type) => {
    const specs = SPECS.filter((s) => s.type === type);
    const results = specs.map((spec) => ({
      spec,
      ...runSpec(db, spec, needles, params.limit),
    }));

    const merged = results
      .flatMap((r) => r.rows.map((row) => ({ row, mode: r.spec.areaMode })))
      .sort(
        (a, b) =>
          a.row.rnk - b.row.rnk ||
          (a.row.updatedAt < b.row.updatedAt ? 1 : a.row.updatedAt > b.row.updatedAt ? -1 : 0) ||
          (a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0),
      )
      .slice(0, params.limit);

    const needsAreas = merged.some((m) => m.mode && m.row.areaId !== null);
    const map = needsAreas ? getAreaMap() : new Map<string, AreaMapEntry>();

    return {
      type,
      total: results.reduce((sum, r) => sum + r.total, 0),
      status: 'ok' as const,
      items: merged.map((m) => toItem(m.row, m.mode, map)),
    };
  });
}

type PaperlessOutcome =
  | { ok: true; value: Awaited<ReturnType<typeof searchPaperlessDocuments>> }
  | { ok: false; error: unknown };

function startPaperlessSearch(
  deps: PaperlessSearchDeps,
  q: string,
  limit: number,
): { promise: Promise<PaperlessOutcome>; cancelTimer: () => void } {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('PAPERLESS_SEARCH_TIMEOUT'));
    }, deps.timeoutMs ?? PAPERLESS_DEFAULT_TIMEOUT_MS);
  });
  const call = searchPaperlessDocuments(
    deps.baseUrl,
    deps.token,
    q,
    limit,
    deps.filterTag,
    controller.signal,
  );
  const promise = Promise.race([call, timeout]).then(
    (value): PaperlessOutcome => ({ ok: true, value }),
    (error: unknown): PaperlessOutcome => ({ ok: false, error }),
  );
  return { promise, cancelTimer: () => clearTimeout(timer) };
}

/** Error code or name only: never the message, which may carry the URL or the query. */
function safeErrorLabel(error: unknown): string {
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    const name = (error as { name?: unknown }).name;
    if (typeof name === 'string') return name;
  }
  return 'UNKNOWN';
}

/**
 * Full search: database groups plus (when `paperless` is non-null and requested) the Paperless
 * group. A Paperless failure or timeout never fails the request: the group is reported as
 * `unavailable`.
 */
export async function search(
  db: DbType,
  params: SearchParams,
  paperless: PaperlessSearchDeps | null,
): Promise<SearchResponse> {
  const q = params.q.trim();
  const wantsPaperless = paperless !== null && params.types.includes('paperless_document');

  // Start Paperless first so it runs while the (synchronous) database queries execute.
  const started =
    wantsPaperless && paperless && q !== ''
      ? startPaperlessSearch(paperless, q, params.limit)
      : null;

  try {
    const groups = searchDatabase(db, params);

    if (wantsPaperless && paperless) {
      if (!started) {
        groups.push({ type: 'paperless_document', total: 0, status: 'ok', items: [] });
      } else {
        const outcome = await started.promise;
        if (outcome.ok) {
          groups.push({
            type: 'paperless_document',
            total: outcome.value.total,
            status: 'ok',
            items: outcome.value.documents.map((doc) => ({
              id: String(doc.id),
              label: doc.title,
              sublabel: null,
              matchedField: 'fullText' as const,
              status: null,
              kind: null,
              date: doc.created,
              phone: null,
              areaPath: null,
              parent: null,
            })),
          });
        } else {
          paperless.log?.warn(
            { errorCode: safeErrorLabel(outcome.error) },
            'Paperless-ngx search unavailable',
          );
          groups.push({ type: 'paperless_document', total: 0, status: 'unavailable', items: [] });
        }
      }
    }

    return { query: q, groups };
  } finally {
    started?.cancelTimer();
  }
}
