/**
 * Diary Auto Event Service — the system event writer (ADR-040).
 *
 * Hooks into business logic services to record a system event (an automatic diary entry) when a
 * significant state change occurs. v1 events write no English text: `title` is NULL, `body` is ''
 * and the parameters go to `metadata` in a fixed key order (the display rule R2 compares the JSON
 * text). The client renders every event from its metadata in the UI language.
 *
 * All event creation is fire-and-forget: errors are logged but never propagated.
 * System events are always written; there is no switch (removed in #2223).
 *
 * EPIC-16: Story 16.3 — Automatic System Event Logging; EPIC-21: #2223 (story 2.4)
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { diaryEntries, milestones } from '../db/schema.js';
import { UNDO_WINDOW_MS } from '@cornerstone/shared';
import type {
  AutomaticDiaryEntryType,
  DiarySourceEntityType,
  InvoiceCreatedMetadataV1,
  MilestoneDelayedMetadataV1,
  StatusChangedMetadataV1,
  SystemEventMetadataV1,
} from '@cornerstone/shared';
import { createAutomaticDiaryEntry } from './diaryService.js';
import {
  activeCollection,
  dropLedgerEntry,
  getLedgerEntry,
  recordLedgerEntry,
  subjectKey,
} from './statusEventLedger.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/** Who caused an event, and whether it takes part in A→B→A retraction (W3). */
export interface EventContext {
  /** Stored in `created_by`. null = no acting user (scheduler). */
  userId: string | null;
  /**
   * True only for undoable user actions (the PATCH status routes): such events take part in W3,
   * and their ledger entry records the user. Default false.
   */
  undoable?: boolean;
}

/** Context for events with no acting user. */
export const SYSTEM_CONTEXT: EventContext = { userId: null };

/** An invoice number as stored: null or '' means "no number". */
function toSubjectLabel(invoiceNumber: string | null | undefined): string | null {
  return invoiceNumber ? invoiceNumber : null;
}

/**
 * Safely create a system event row without propagating errors.
 * Logs warnings for any failures.
 */
function tryCreateDiaryEntry(
  db: DbType,
  entryType: AutomaticDiaryEntryType,
  metadata: SystemEventMetadataV1,
  sourceEntityType: DiarySourceEntityType | null,
  sourceEntityId: string | null,
  createdBy: string | null,
): string | null {
  try {
    const entryDate = new Date().toISOString().slice(0, 10);
    const id = createAutomaticDiaryEntry(
      db,
      entryType,
      entryDate,
      metadata,
      sourceEntityType,
      sourceEntityId,
      createdBy,
    );
    activeCollection()?.written.push(id);
    return id;
  } catch (err) {
    console.warn('[diaryAutoEvent] Failed to create diary entry', {
      entryType,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Parameters of one status event (everything except the row's subject). */
interface StatusEventSpec {
  entryType: AutomaticDiaryEntryType;
  /** Subject of the stored row. */
  rowSourceType: DiarySourceEntityType;
  rowSourceId: string;
  /** Subject key of the in-memory W3 ledger (differs from the row's subject for deposits). */
  ledgerSourceType: string;
  ledgerSourceId: string;
  from: string;
  to: string;
  subjectLabel: string | null;
  amount?: number;
  depositEntryType?: 'deposit' | 'refund';
  depositId?: string;
  batchId?: string;
  /** false = run W1/W3 but never insert (progress payments moving to pending). */
  writeRow?: boolean;
}

/** Status event metadata in the canonical key order; undefined keys are omitted. */
function statusMetadata(spec: StatusEventSpec): StatusChangedMetadataV1 {
  return {
    v: 1,
    event: 'status_changed',
    from: spec.from,
    to: spec.to,
    subjectLabel: spec.subjectLabel,
    ...(spec.amount !== undefined && { amount: spec.amount }),
    ...(spec.depositEntryType !== undefined && { depositEntryType: spec.depositEntryType }),
    ...(spec.depositId !== undefined && { depositId: spec.depositId }),
    ...(spec.batchId !== undefined && { batchId: spec.batchId }),
  };
}

/**
 * Write (or, for a manual reverse inside the undo window, retract) a status event.
 *
 * W1: from === to writes nothing. W3: when the ledger's latest event for the subject is
 * `to -> from` by the same user inside UNDO_WINDOW_MS, that event is deleted and nothing is
 * written. Only undoable callers take part, and the stored row's `metadata.from`/`to` must equal
 * the ledger entry. Fire-and-forget: errors are logged, never propagated.
 */
function recordStatusEvent(db: DbType, spec: StatusEventSpec, ctx: EventContext): void {
  const { from, to } = spec;
  if (from === to) return;

  const key = subjectKey(spec.entryType, spec.ledgerSourceType, spec.ledgerSourceId);
  const now = Date.now();
  const undoableUser = ctx.undoable === true && ctx.userId !== null ? ctx.userId : null;

  try {
    const latest = getLedgerEntry(key);
    if (
      undoableUser !== null &&
      latest &&
      latest.userId === undoableUser &&
      latest.from === to &&
      latest.to === from &&
      now - latest.at < UNDO_WINDOW_MS
    ) {
      const row = db
        .select()
        .from(diaryEntries)
        .where(and(eq(diaryEntries.id, latest.eventId), eq(diaryEntries.isAutomatic, true)))
        .get();
      dropLedgerEntry(key);
      const rowMatchesLedger =
        row !== undefined &&
        readMetadataText(db, latest.eventId, '$.from') === latest.from &&
        readMetadataText(db, latest.eventId, '$.to') === latest.to;
      if (row && rowMatchesLedger) {
        db.delete(diaryEntries)
          .where(and(eq(diaryEntries.id, latest.eventId), eq(diaryEntries.isAutomatic, true)))
          .run();
        activeCollection()?.retracted.push({
          row: row as unknown as Record<string, unknown>,
          key,
          entry: latest,
        });
        return;
      }
      // Row missing or its metadata disagrees with the ledger: write normally.
    }
  } catch (err) {
    console.warn('[diaryAutoEvent] status-event retraction failed', {
      entryType: spec.entryType,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (spec.writeRow === false) return;

  const eventId = tryCreateDiaryEntry(
    db,
    spec.entryType,
    statusMetadata(spec),
    spec.rowSourceType,
    spec.rowSourceId,
    ctx.userId,
  );
  if (eventId) {
    recordLedgerEntry(key, { eventId, from, to, userId: undoableUser, at: now });
  }
}

/** Read one scalar of an event row's metadata JSON (`$.from`, `$.to`, …); null when absent. */
function readMetadataText(db: DbType, eventId: string, path: string): string | null {
  const result = db
    .select({ value: sql<string | null>`json_extract(${diaryEntries.metadata}, ${path})` })
    .from(diaryEntries)
    .where(eq(diaryEntries.id, eventId))
    .get();
  return result?.value ?? null;
}

/**
 * Log a work item status change.
 *
 * @param workItemTitle - Title of the work item (snapshot for the event)
 */
export function onWorkItemStatusChanged(
  db: DbType,
  workItemId: string,
  workItemTitle: string,
  previousStatus: string,
  newStatus: string,
  ctx: EventContext = SYSTEM_CONTEXT,
): void {
  recordStatusEvent(
    db,
    {
      entryType: 'work_item_status',
      rowSourceType: 'work_item',
      rowSourceId: workItemId,
      ledgerSourceType: 'work_item',
      ledgerSourceId: workItemId,
      from: previousStatus,
      to: newStatus,
      subjectLabel: workItemTitle,
    },
    ctx,
  );
}

/**
 * Log an invoice status change.
 *
 * @param invoiceNumber - Raw invoice number; null or '' is stored as no label
 * @param extra.amount - Invoice amount after the change (major units)
 * @param extra.batchId - Bank-report batch (W5)
 */
export function onInvoiceStatusChanged(
  db: DbType,
  invoiceId: string,
  invoiceNumber: string | null,
  previousStatus: string,
  newStatus: string,
  ctx: EventContext = SYSTEM_CONTEXT,
  extra: { amount?: number; batchId?: string } = {},
): void {
  recordStatusEvent(
    db,
    {
      entryType: 'invoice_status',
      rowSourceType: 'invoice',
      rowSourceId: invoiceId,
      ledgerSourceType: 'invoice',
      ledgerSourceId: invoiceId,
      from: previousStatus,
      to: newStatus,
      subjectLabel: toSubjectLabel(invoiceNumber),
      amount: extra.amount,
      batchId: extra.batchId,
    },
    ctx,
  );
}

/**
 * Log a deposit (progress payment) status change. The row's subject is the invoice and
 * `metadata.depositId` names the payment (D-16); the W3 ledger key stays per deposit.
 */
export function onDepositStatusChanged(
  db: DbType,
  deposit: { id: string; invoiceId: string; amount: number; entryType: 'deposit' | 'refund' },
  invoiceNumber: string | null,
  previousStatus: string,
  newStatus: string,
  ctx: EventContext = SYSTEM_CONTEXT,
  extra: { batchId?: string } = {},
): void {
  // A row is written only for paid / claimed targets (AC-17); a move back to pending still
  // runs W1/W3 so it can retract the event it reverses.
  recordStatusEvent(
    db,
    {
      entryType: 'invoice_status',
      rowSourceType: 'invoice',
      rowSourceId: deposit.invoiceId,
      ledgerSourceType: 'invoice_deposit',
      ledgerSourceId: deposit.id,
      from: previousStatus,
      to: newStatus,
      subjectLabel: toSubjectLabel(invoiceNumber),
      amount: deposit.amount,
      depositEntryType: deposit.entryType,
      depositId: deposit.id,
      batchId: extra.batchId,
      writeRow: newStatus === 'paid' || newStatus === 'claimed',
    },
    ctx,
  );
}

/**
 * Log a milestone delay detection (ADR-040 W2).
 *
 * Writes nothing when the milestone is completed, when the projected date is not later than the
 * target date, or when the latest milestone-delay event of this milestone already names the same
 * projected date (read from its metadata). Scheduler-originated: `created_by` is NULL.
 *
 * @param targetDate - Target date for the milestone (YYYY-MM-DD)
 * @param projectedDate - Projected date for the milestone (YYYY-MM-DD)
 */
export function onMilestoneDelayed(
  db: DbType,
  milestoneId: number,
  milestoneName: string,
  targetDate: string,
  projectedDate: string,
): void {
  if (projectedDate <= targetDate) return;

  try {
    const milestone = db.select().from(milestones).where(eq(milestones.id, milestoneId)).get();
    if (!milestone || milestone.isCompleted || milestone.completedAt) return;

    const latest = db
      .select({
        projectedDate: sql<
          string | null
        >`json_extract(${diaryEntries.metadata}, '$.projectedDate')`,
      })
      .from(diaryEntries)
      .where(
        and(
          eq(diaryEntries.entryType, 'milestone_delay'),
          eq(diaryEntries.isAutomatic, true),
          eq(diaryEntries.sourceEntityType, 'milestone'),
          eq(diaryEntries.sourceEntityId, String(milestoneId)),
          sql`json_valid(${diaryEntries.metadata})`,
        ),
      )
      .orderBy(desc(diaryEntries.createdAt), desc(sql`rowid`))
      .limit(1)
      .get();
    if (latest && latest.projectedDate === projectedDate) return;
  } catch (error) {
    console.warn('[diaryAutoEvent] milestone-delay de-dup failed', error);
    return;
  }

  // Calculate delay days
  const target = new Date(targetDate + 'T00:00:00Z');
  const projected = new Date(projectedDate + 'T00:00:00Z');
  const delayDays = Math.round((projected.getTime() - target.getTime()) / (24 * 60 * 60 * 1000));

  const metadata: MilestoneDelayedMetadataV1 = {
    v: 1,
    event: 'milestone_delayed',
    targetDate,
    projectedDate,
    delayDays,
    subjectLabel: milestoneName,
  };

  tryCreateDiaryEntry(db, 'milestone_delay', metadata, 'milestone', String(milestoneId), null);
}

/**
 * Log a subsidy program application status change.
 *
 * @param subsidyName - Name of the subsidy program (snapshot for the event)
 */
export function onSubsidyStatusChanged(
  db: DbType,
  subsidyId: string,
  subsidyName: string,
  previousStatus: string,
  newStatus: string,
  ctx: EventContext = SYSTEM_CONTEXT,
): void {
  recordStatusEvent(
    db,
    {
      entryType: 'subsidy_status',
      rowSourceType: 'subsidy_program',
      rowSourceId: subsidyId,
      ledgerSourceType: 'subsidy_program',
      ledgerSourceId: subsidyId,
      from: previousStatus,
      to: newStatus,
      subjectLabel: subsidyName,
    },
    ctx,
  );
}

/**
 * Log an invoice creation. Not undoable: it never takes part in W3.
 */
export function onInvoiceCreated(
  db: DbType,
  invoice: { id: string; invoiceNumber: string | null; amount: number; status: string },
  vendor: { id: string; name: string },
  ctx: EventContext = SYSTEM_CONTEXT,
): void {
  const metadata: InvoiceCreatedMetadataV1 = {
    v: 1,
    event: 'invoice_created',
    subjectLabel: toSubjectLabel(invoice.invoiceNumber),
    vendorId: vendor.id,
    vendorName: vendor.name,
    amount: invoice.amount,
    invoiceStatus: invoice.status,
  };

  tryCreateDiaryEntry(db, 'invoice_created', metadata, 'invoice', invoice.id, ctx.userId);
}
