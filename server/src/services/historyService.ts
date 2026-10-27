/**
 * History feed (contract 17, ADR-040 §6, #2224).
 *
 * `GET /api/history` lists system events newest first, reusing the display rules of
 * `systemEventDisplay.ts` (R1, R2, plus one row per bank-report batch). Items are the diary's
 * `DiaryEntrySummary`; a submission row also carries `batch`. The service writes no UI text.
 */

import { and, eq, inArray, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { budgetSources, diaryEntries, invoices } from '../db/schema.js';
import { foldSearchText } from '@cornerstone/shared';
import type {
  DiaryEntrySummary,
  HistoryEventType,
  HistoryListResponse,
  HistoryObjectRef,
  HistoryObjectType,
  SystemEventBatchSummary,
} from '@cornerstone/shared';
import { listDisplayRows } from './systemEventDisplay.js';
import { resolveSourceEntity, toDiarySummaries } from './diaryService.js';
import { toLikeContainsPattern } from './shared/likePattern.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/** `HistoryQuery` after route validation. */
export interface ParsedHistoryQuery {
  page?: number;
  pageSize?: number;
  /** Empty = all types. */
  types: HistoryEventType[];
  entityType?: HistoryObjectType;
  entityId?: string;
  batchId?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  includeDiary?: boolean;
  showHidden?: boolean;
  includeHidden?: boolean;
}

/** One metadata field of a valid JSON `metadata` column; NULL when invalid or absent. */
function metaField(field: string): SQL {
  return sql.raw(
    `CASE WHEN json_valid("diary_entries"."metadata") THEN json_extract("diary_entries"."metadata", '$.${field}') END`,
  );
}

const STORED_TYPES: readonly HistoryEventType[] = [
  'work_item_status',
  'invoice_status',
  'subsidy_status',
  'invoice_created',
  'milestone_delay',
  'budget_breach',
  'auto_reschedule',
];

function buildTypeCondition(types: readonly HistoryEventType[]): SQL | undefined {
  if (types.length === 0) return undefined;
  const parts: SQL[] = [];
  const stored = types.filter((t) => STORED_TYPES.includes(t));
  if (stored.length > 0) {
    parts.push(inArray(diaryEntries.entryType, stored as (typeof diaryEntries.entryType._.data)[]));
  }
  if (types.includes('payment')) {
    parts.push(
      sql`(${diaryEntries.entryType} = 'invoice_status' AND ${metaField('to')} = 'paid' AND ${metaField('batchId')} IS NULL)`,
    );
  }
  if (types.includes('submission')) {
    parts.push(
      sql`(${diaryEntries.entryType} = 'invoice_status' AND ${metaField('batchId')} IS NOT NULL)`,
    );
  }
  return or(...parts);
}

function buildSearchCondition(q: string | undefined): SQL | undefined {
  const folded = foldSearchText((q ?? '').trim());
  if (!folded) return undefined;
  const pattern = toLikeContainsPattern(folded);
  return sql`fold(COALESCE(${diaryEntries.title}, '') || ' ' || ${diaryEntries.body} || ' ' || COALESCE(${metaField('subjectLabel')}, '') || ' ' || COALESCE(${metaField('vendorName')}, '')) LIKE ${pattern} ESCAPE '\\'`;
}

interface BatchMember {
  invoiceId: string | null;
  meta: Record<string, unknown>;
}

function parseMeta(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Submitted total of one batch: deposits (refunds negative) where present, else the invoice amount. */
function batchAmount(members: readonly BatchMember[]): number | null {
  const byInvoice = new Map<string, { invoice: unknown; deposits: BatchMember[] }>();
  for (const m of members) {
    if (!m.invoiceId) continue;
    const entry = byInvoice.get(m.invoiceId) ?? { invoice: undefined, deposits: [] };
    if (typeof m.meta.depositId === 'string') {
      entry.deposits.push(m);
    } else if (entry.invoice === undefined) {
      entry.invoice = m.meta.amount;
    }
    byInvoice.set(m.invoiceId, entry);
  }
  let total = 0;
  for (const entry of byInvoice.values()) {
    if (entry.deposits.length > 0) {
      for (const d of entry.deposits) {
        if (typeof d.meta.amount !== 'number') return null;
        total += d.meta.depositEntryType === 'refund' ? -d.meta.amount : d.meta.amount;
      }
    } else {
      if (typeof entry.invoice !== 'number') return null;
      total += entry.invoice;
    }
  }
  return round2(total);
}

function loadBatchSummaries(
  db: DbType,
  batchIds: readonly string[],
): Map<string, SystemEventBatchSummary> {
  const result = new Map<string, SystemEventBatchSummary>();
  if (batchIds.length === 0) return result;

  const rows = db
    .select({
      sourceEntityId: diaryEntries.sourceEntityId,
      metadata: diaryEntries.metadata,
      batchId: sql<string>`${metaField('batchId')}`,
    })
    .from(diaryEntries)
    .where(
      and(
        eq(diaryEntries.isAutomatic, true),
        eq(diaryEntries.entryType, 'invoice_status'),
        sql`${metaField('batchId')} IN (${sql.join(
          batchIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      ),
    )
    .orderBy(diaryEntries.createdAt, diaryEntries.id)
    .all();

  const grouped = new Map<string, BatchMember[]>();
  for (const row of rows) {
    const list = grouped.get(row.batchId) ?? [];
    list.push({ invoiceId: row.sourceEntityId, meta: parseMeta(row.metadata) });
    grouped.set(row.batchId, list);
  }

  for (const [batchId, members] of grouped) {
    // Distinct invoices in first-event order
    const invoiceIds: string[] = [];
    const snapshots = new Map<string, string | null>();
    for (const m of members) {
      if (!m.invoiceId || snapshots.has(m.invoiceId)) continue;
      invoiceIds.push(m.invoiceId);
      snapshots.set(
        m.invoiceId,
        typeof m.meta.subjectLabel === 'string' ? m.meta.subjectLabel : null,
      );
    }
    const invoiceLabels = invoiceIds.slice(0, 3).map((id) => {
      const live = db
        .select({ invoiceNumber: invoices.invoiceNumber })
        .from(invoices)
        .where(eq(invoices.id, id))
        .get();
      return live?.invoiceNumber ?? snapshots.get(id) ?? null;
    });

    const firstSourceId = members
      .map((m) => m.meta.budgetSourceId)
      .find((v): v is string => typeof v === 'string');
    let budgetSourceName: string | null = null;
    let budgetSourceExists: boolean | null = null;
    if (firstSourceId) {
      const source = db
        .select({ name: budgetSources.name })
        .from(budgetSources)
        .where(eq(budgetSources.id, firstSourceId))
        .get();
      budgetSourceName = source?.name ?? null;
      budgetSourceExists = source !== undefined;
    }

    result.set(batchId, {
      batchId,
      invoiceCount: invoiceIds.length,
      amount: batchAmount(members),
      invoiceLabels,
      budgetSourceId: firstSourceId ?? null,
      budgetSourceName,
      budgetSourceExists,
    });
  }
  return result;
}

/**
 * List the History feed: one page of system events (and, with `includeDiary`, people's saved
 * diary entries), newest first, after R1/R2 and bank-report batch collapse.
 */
export function listHistory(db: DbType, query: ParsedHistoryQuery): HistoryListResponse {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));

  const autoConds: (SQL | undefined)[] = [eq(diaryEntries.isAutomatic, true)];
  autoConds.push(buildTypeCondition(query.types));
  if (query.entityType === 'budget_source' && query.entityId) {
    // A funding source's history is its bank-report batches (`metadata.budgetSourceId`), not
    // events whose source entity is the source.
    autoConds.push(
      eq(diaryEntries.entryType, 'invoice_status'),
      sql`${metaField('batchId')} IS NOT NULL`,
      sql`${metaField('budgetSourceId')} = ${query.entityId}`,
    );
  } else if (query.entityType && query.entityId) {
    autoConds.push(
      eq(diaryEntries.sourceEntityType, query.entityType),
      eq(diaryEntries.sourceEntityId, query.entityId),
    );
  }
  if (query.batchId) {
    autoConds.push(sql`${metaField('batchId')} = ${query.batchId}`);
  }
  const auto = and(...autoConds);

  const scope = query.includeDiary
    ? or(auto, and(eq(diaryEntries.isAutomatic, false), eq(diaryEntries.status, 'saved')))
    : auto;

  const common: (SQL | undefined)[] = [scope];
  if (query.dateFrom) common.push(sql`${diaryEntries.entryDate} >= ${query.dateFrom}`);
  if (query.dateTo) common.push(sql`${diaryEntries.entryDate} <= ${query.dateTo}`);
  common.push(buildSearchCondition(query.q));

  const raw = query.includeHidden === true;
  const display = listDisplayRows(db, {
    where: and(...common),
    showHidden: query.showHidden === true,
    raw,
    collapseBatches:
      !raw && (!query.entityType || query.entityType === 'budget_source') && !query.batchId,
    page,
    pageSize,
  });

  const items: DiaryEntrySummary[] = toDiarySummaries(db, display.rows);

  const batchIds = [...new Set(display.rows.flatMap((r) => (r.batchId ? [r.batchId] : [])))];
  const summaries = loadBatchSummaries(db, batchIds);
  const batchByEntryId = new Map(display.rows.map((r) => [r.id, r.batchId]));
  for (const item of items) {
    const batchId = batchByEntryId.get(item.id);
    const summary = batchId ? summaries.get(batchId) : undefined;
    if (summary) item.batch = summary;
  }

  let object: HistoryObjectRef | null = null;
  if (query.entityType && query.entityId) {
    const resolved = resolveSourceEntity(db, query.entityType, query.entityId);
    object = {
      entityType: query.entityType,
      entityId: query.entityId,
      title: resolved.title,
      exists: resolved.exists ?? false,
    };
  }

  return {
    items,
    pagination: {
      page,
      pageSize,
      totalItems: display.totalItems,
      totalPages: Math.ceil(display.totalItems / pageSize),
    },
    hiddenCount: display.hiddenCount,
    object,
  };
}
