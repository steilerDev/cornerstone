/**
 * Attention service (#2229, EPIC-21 contract 1): reads everything the rules need with a
 * constant number of bulk queries (never per row), then hands it to the pure rule engine
 * (`shared/attentionRules.ts`).
 *
 * One schedule graph load + projection and one money computation per request. System events
 * are never read (`is_automatic = 0` everywhere) and photos are not read at all. Only the
 * assigned company's name is selected for tasks, never a user.
 */

import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { DIARY_ISSUE_SEVERITIES, MANUAL_DIARY_ENTRY_TYPES } from '@cornerstone/shared';
import type {
  AreaSummary,
  AttentionResponse,
  DiaryIssueSeverity,
  ManualDiaryEntryType,
} from '@cornerstone/shared';
import { loadAreaMap, resolveAreaAncestors } from './areaService.js';
import { readSnoozes } from './attentionSnoozeService.js';
import { computeProjectMoney, listOpenPayments } from './moneyService.js';
import { loadScheduleGraph, projectSchedule } from './schedulingEngine.js';
import {
  computeAttention,
  type AttentionDefect,
  type AttentionDraft,
  type AttentionGrant,
  type AttentionInvoiceInfo,
  type AttentionPurchase,
  type AttentionWorkItemInfo,
} from './shared/attentionRules.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

export interface GetAttentionOptions {
  userId: string;
  vatRate: number;
  includeSnoozed: boolean;
  /** Injected clock; defaults to the current instant. */
  now?: Date;
}

function severityOf(value: unknown): DiaryIssueSeverity | null {
  return typeof value === 'string' && (DIARY_ISSUE_SEVERITIES as readonly string[]).includes(value)
    ? (value as DiaryIssueSeverity)
    : null;
}

function isManualEntryType(value: unknown): value is ManualDiaryEntryType {
  return (
    typeof value === 'string' && (MANUAL_DIARY_ENTRY_TYPES as readonly string[]).includes(value)
  );
}

export function getAttention(db: DbType, opts: GetAttentionOptions): AttentionResponse {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);

  const graph = loadScheduleGraph(db);
  const projection = projectSchedule(graph, today);

  // Areas: one query, resolved in memory
  const areaMap = loadAreaMap(db);
  const areaCache = new Map<string, AreaSummary>();
  const areaOf = (areaId: string | null): AreaSummary | null => {
    if (areaId === null) return null;
    const cached = areaCache.get(areaId);
    if (cached) return cached;
    const area = areaMap.get(areaId);
    if (!area) return null;
    const summary: AreaSummary = {
      id: area.id,
      name: area.name,
      color: area.color,
      ancestors: resolveAreaAncestors(areaId, areaMap),
    };
    areaCache.set(areaId, summary);
    return summary;
  };

  // Tasks (title, status, planned dates, assigned company)
  const workItemRows = db.all<{
    id: string;
    title: string;
    status: string;
    startDate: string | null;
    endDate: string | null;
    actualEndDate: string | null;
    areaId: string | null;
    companyName: string | null;
  }>(
    sql`SELECT
      w.id              AS id,
      w.title           AS title,
      w.status          AS status,
      w.start_date      AS startDate,
      w.end_date        AS endDate,
      w.actual_end_date AS actualEndDate,
      w.area_id         AS areaId,
      v.name            AS companyName
    FROM work_items w
    LEFT JOIN vendors v ON v.id = w.assigned_vendor_id
    ORDER BY w.rowid`,
  );
  const workItems = new Map<string, AttentionWorkItemInfo>();
  for (const row of workItemRows) {
    workItems.set(row.id, {
      title: row.title,
      status: row.status,
      startDate: row.startDate,
      endDate: row.endDate,
      actualEndDate: row.actualEndDate,
      area: areaOf(row.areaId),
      companyName: row.companyName,
    });
  }

  // Money: sources (N8, S1), unsplit remainders (H2), open payments (N4-N6)
  const money = computeProjectMoney(db, opts.vatRate);
  const openPayments = listOpenPayments(db);

  // Invoices and offers (N9, H2 labels)
  const invoiceRows = db.all<{
    id: string;
    invoiceNumber: string | null;
    status: string;
    amount: number;
    date: string;
    dueDate: string | null;
    companyName: string;
  }>(
    sql`SELECT
      i.id             AS id,
      i.invoice_number AS invoiceNumber,
      i.status         AS status,
      i.amount         AS amount,
      i.date           AS date,
      i.due_date       AS dueDate,
      v.name           AS companyName
    FROM invoices i
    INNER JOIN vendors v ON v.id = i.vendor_id`,
  );
  const invoices = new Map<string, AttentionInvoiceInfo>();
  for (const row of invoiceRows) {
    invoices.set(row.id, {
      status: row.status,
      invoiceNumber: row.invoiceNumber,
      companyName: row.companyName,
      amount: row.amount,
      date: row.date,
      dueDate: row.dueDate,
    });
  }

  // Purchases not yet delivered (N10, date-based: the daily reschedule gives that day's delivery dates)
  const purchaseRows = db.all<{
    id: string;
    name: string;
    status: string;
    targetDeliveryDate: string | null;
    earliestDeliveryDate: string | null;
    latestDeliveryDate: string | null;
    actualDeliveryDate: string | null;
    areaId: string | null;
    companyName: string | null;
  }>(
    sql`SELECT
      h.id                     AS id,
      h.name                   AS name,
      h.status                 AS status,
      h.target_delivery_date   AS targetDeliveryDate,
      h.earliest_delivery_date AS earliestDeliveryDate,
      h.latest_delivery_date   AS latestDeliveryDate,
      h.actual_delivery_date   AS actualDeliveryDate,
      h.area_id                AS areaId,
      v.name                   AS companyName
    FROM household_items h
    LEFT JOIN vendors v ON v.id = h.vendor_id
    WHERE h.status != 'arrived' AND h.actual_delivery_date IS NULL`,
  );
  const purchases: AttentionPurchase[] = purchaseRows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    targetDeliveryDate: row.targetDeliveryDate,
    earliestDeliveryDate: row.earliestDeliveryDate,
    latestDeliveryDate: row.latestDeliveryDate,
    actualDeliveryDate: row.actualDeliveryDate,
    companyName: row.companyName,
    area: areaOf(row.areaId),
  }));

  // Grants with an open application and a deadline (N11)
  const grants = db.all<AttentionGrant>(
    sql`SELECT
      id                   AS id,
      name                 AS name,
      application_status   AS status,
      application_deadline AS deadline
    FROM subsidy_programs
    WHERE application_status IN ('eligible', 'applied') AND application_deadline IS NOT NULL`,
  );

  // Open defects (N12): people's saved issue entries only, metadata read behind json_valid
  const defectRows = db.all<{
    id: string;
    title: string | null;
    entryDate: string;
    resolutionStatus: unknown;
    severity: unknown;
  }>(
    sql`SELECT
      id         AS id,
      title      AS title,
      entry_date AS entryDate,
      CASE WHEN json_valid(metadata) THEN json_extract(metadata, '$.resolutionStatus') END
                 AS resolutionStatus,
      CASE WHEN json_valid(metadata) THEN json_extract(metadata, '$.severity') END
                 AS severity
    FROM diary_entries
    WHERE entry_type = 'issue' AND status = 'saved' AND is_automatic = 0`,
  );
  const defects: AttentionDefect[] = defectRows.map((row) => ({
    id: row.id,
    title: row.title,
    entryDate: row.entryDate,
    resolutionStatus: typeof row.resolutionStatus === 'string' ? row.resolutionStatus : null,
    severity: severityOf(row.severity),
  }));

  // Unfinished logs (H1): people's drafts
  const draftRows = db.all<Omit<AttentionDraft, 'entryType'> & { entryType: string }>(
    sql`SELECT
      id         AS id,
      title      AS title,
      entry_type AS entryType,
      entry_date AS entryDate,
      updated_at AS updatedAt
    FROM diary_entries
    WHERE status = 'draft' AND is_automatic = 0`,
  );
  // A draft with an unexpected entry type is skipped (like an unknown severity is dropped)
  const drafts: AttentionDraft[] = [];
  for (const row of draftRows) {
    if (isManualEntryType(row.entryType)) drafts.push({ ...row, entryType: row.entryType });
  }

  return computeAttention({
    today,
    now: nowIso,
    graph,
    projection,
    workItems,
    openPayments,
    invoices,
    notYetSplitByInvoice: money.result.notYetSplitByInvoice,
    sources: money.summary.sources,
    purchases,
    grants,
    defects,
    drafts,
    snoozes: readSnoozes(db, opts.userId),
    includeSnoozed: opts.includeSnoozed,
  });
}
