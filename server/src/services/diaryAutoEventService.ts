/**
 * Diary Auto Event Service — fire-and-forget event logging.
 *
 * Hooks into business logic services to automatically create diary entries
 * when significant state changes occur (status changes, milestones, etc).
 *
 * All event creation is fire-and-forget: errors are logged but never propagated.
 *
 * EPIC-16: Story 16.3 — Automatic System Event Logging
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { diaryEntries, milestones } from '../db/schema.js';
import { UNDO_WINDOW_MS } from '@cornerstone/shared';
import { createAutomaticDiaryEntry } from './diaryService.js';
import {
  activeCollection,
  dropLedgerEntry,
  getLedgerEntry,
  recordLedgerEntry,
  subjectKey,
} from './statusEventLedger.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Human-readable status labels for automatic diary events.
 */
const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
  pending: 'Pending',
  paid: 'Paid',
  claimed: 'Claimed',
  active: 'Active',
  paused: 'Paused',
  rejected: 'Rejected',
  approved: 'Approved',
  pending_approval: 'Pending Approval',
};

/**
 * Convert a status code to a human-readable label.
 * Falls back to title-casing the status if no label is defined.
 */
function toLabel(status: string): string {
  return (
    STATUS_LABELS[status] || status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/**
 * Safely create a diary entry without propagating errors.
 * Logs warnings for any failures.
 *
 * @param db - Database connection
 * @param enabled - Whether auto-events are enabled globally
 * @param entryType - Automatic entry type
 * @param title - Human-readable summary
 * @param body - Full description
 * @param sourceEntityType - Entity type that triggered the event (e.g., 'work_item')
 * @param sourceEntityId - ID of the entity that triggered the event
 */
function tryCreateDiaryEntry(
  db: DbType,
  enabled: boolean,
  entryType: string,
  title: string,
  body: string,
  sourceEntityType: string | null,
  sourceEntityId: string | null,
): string | null {
  if (!enabled) return null;

  try {
    const entryDate = new Date().toISOString().slice(0, 10);
    const id = createAutomaticDiaryEntry(
      db,
      entryType,
      entryDate,
      title,
      body,
      sourceEntityType,
      sourceEntityId,
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

/**
 * Write (or, for a manual reverse inside the undo window, retract) a status event.
 *
 * W1: from === to writes nothing. W3: when the ledger's latest event for the subject is
 * `to -> from` by the same user inside UNDO_WINDOW_MS, that event is deleted and nothing is
 * written. `writeRow: false` (progress payments moving to pending) runs W1/W3 but never inserts.
 * Fire-and-forget: errors are logged, never propagated.
 */
function recordStatusEvent(
  db: DbType,
  enabled: boolean,
  entryType: string,
  sourceEntityType: string,
  sourceEntityId: string,
  from: string,
  to: string,
  actorUserId: string | null,
  title: string,
  body: string,
  writeRow = true,
): void {
  if (!enabled) return;
  if (from === to) return;

  const key = subjectKey(entryType, sourceEntityType, sourceEntityId);
  const now = Date.now();

  try {
    const latest = getLedgerEntry(key);
    if (
      actorUserId !== null &&
      latest &&
      latest.userId === actorUserId &&
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
      if (row) {
        db.delete(diaryEntries)
          .where(and(eq(diaryEntries.id, latest.eventId), eq(diaryEntries.isAutomatic, true)))
          .run();
        activeCollection()?.retracted.push({
          row: row as unknown as Record<string, unknown>,
          key,
          entry: latest,
        });
      }
      return;
    }
  } catch (err) {
    console.warn('[diaryAutoEvent] status-event retraction failed', {
      entryType,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (!writeRow) return;

  const eventId = tryCreateDiaryEntry(
    db,
    enabled,
    entryType,
    title,
    body,
    sourceEntityType,
    sourceEntityId,
  );
  if (eventId) {
    recordLedgerEntry(key, { eventId, from, to, userId: actorUserId, at: now });
  }
}

/**
 * Log a work item status change to the diary.
 *
 * @param db - Database connection
 * @param enabled - Whether auto-events are enabled
 * @param workItemId - ID of the work item that changed
 * @param workItemTitle - Title of the work item (for reference)
 * @param previousStatus - Previous status value
 * @param newStatus - New status value
 */
export function onWorkItemStatusChanged(
  db: DbType,
  enabled: boolean,
  workItemId: string,
  workItemTitle: string,
  previousStatus: string,
  newStatus: string,
  actorUserId: string | null = null,
): void {
  const previousLabel = toLabel(previousStatus);
  const newLabel = toLabel(newStatus);
  const title = `Status changed from ${previousLabel} to ${newLabel}`;
  const body = `"${workItemTitle}" status changed from ${previousLabel} to ${newLabel}`;

  recordStatusEvent(
    db,
    enabled,
    'work_item_status',
    'work_item',
    workItemId,
    previousStatus,
    newStatus,
    actorUserId,
    title,
    body,
  );
}

/**
 * Log an invoice status change to the diary.
 *
 * @param db - Database connection
 * @param enabled - Whether auto-events are enabled
 * @param invoiceId - ID of the invoice that changed
 * @param invoiceNumber - Invoice number (for reference)
 * @param previousStatus - Previous status value
 * @param newStatus - New status value
 */
export function onInvoiceStatusChanged(
  db: DbType,
  enabled: boolean,
  invoiceId: string,
  invoiceNumber: string,
  previousStatus: string,
  newStatus: string,
  actorUserId: string | null = null,
): void {
  const previousLabel = toLabel(previousStatus);
  const newLabel = toLabel(newStatus);
  const title = `Status changed from ${previousLabel} to ${newLabel}`;
  const body = `${invoiceNumber || 'N/A'} status changed from ${previousLabel} to ${newLabel}`;

  recordStatusEvent(
    db,
    enabled,
    'invoice_status',
    'invoice',
    invoiceId,
    previousStatus,
    newStatus,
    actorUserId,
    title,
    body,
  );
}

/**
 * Log a deposit status change to the diary.
 *
 * @param db - Database connection
 * @param enabled - Whether auto-events are enabled
 * @param depositId - ID of the deposit that changed
 * @param invoiceNumber - Invoice number (for reference)
 * @param previousStatus - Previous status value
 * @param newStatus - New status value
 */
export function onDepositStatusChanged(
  db: DbType,
  enabled: boolean,
  depositId: string,
  invoiceNumber: string,
  previousStatus: string,
  newStatus: string,
  actorUserId: string | null = null,
): void {
  const previousLabel = toLabel(previousStatus);
  const newLabel = toLabel(newStatus);
  const title = `Deposit status changed from ${previousLabel} to ${newLabel}`;
  const body = `Deposit for invoice ${invoiceNumber || 'N/A'} changed from ${previousLabel} to ${newLabel}`;

  // A row is written only for paid / claimed targets (AC-17); a move back to pending still
  // runs W1/W3 so it can retract the event it reverses.
  recordStatusEvent(
    db,
    enabled,
    'invoice_status',
    'invoice_deposit',
    depositId,
    previousStatus,
    newStatus,
    actorUserId,
    title,
    body,
    newStatus === 'paid' || newStatus === 'claimed',
  );
}

/**
 * Read the projected date back from an existing milestone-delay body
 * (`… new projected date YYYY-MM-DD)`). Returns null when the body does not match.
 */
export function parseMilestoneDelayProjectedDate(body: string): string | null {
  const match = /new projected date (\d{4}-\d{2}-\d{2})\)$/.exec(body);
  return match?.[1] ?? null;
}

/**
 * Log a milestone delay detection to the diary (ADR-040 W2).
 *
 * Writes nothing when the milestone is completed, when the projected date is not later than the
 * target date, or when the latest milestone-delay entry of this milestone already names the same
 * projected date. The last check parses the English body until #2223 replaces it with `metadata`.
 *
 * @param db - Database connection
 * @param enabled - Whether auto-events are enabled
 * @param milestoneId - ID of the milestone
 * @param milestoneName - Name of the milestone (for reference)
 * @param targetDate - Target date for the milestone (YYYY-MM-DD)
 * @param projectedDate - Projected date for the milestone (YYYY-MM-DD)
 */
export function onMilestoneDelayed(
  db: DbType,
  enabled: boolean,
  milestoneId: number,
  milestoneName: string,
  targetDate: string,
  projectedDate: string,
): void {
  if (!enabled) return;
  if (projectedDate <= targetDate) return;

  try {
    const milestone = db.select().from(milestones).where(eq(milestones.id, milestoneId)).get();
    if (!milestone || milestone.isCompleted || milestone.completedAt) return;

    const latest = db
      .select({ body: diaryEntries.body })
      .from(diaryEntries)
      .where(
        and(
          eq(diaryEntries.entryType, 'milestone_delay'),
          eq(diaryEntries.isAutomatic, true),
          eq(diaryEntries.sourceEntityType, 'milestone'),
          eq(diaryEntries.sourceEntityId, String(milestoneId)),
        ),
      )
      .orderBy(desc(diaryEntries.createdAt), desc(sql`rowid`))
      .limit(1)
      .get();
    if (latest && parseMilestoneDelayProjectedDate(latest.body) === projectedDate) return;
  } catch (error) {
    console.warn('[diaryAutoEvent] milestone-delay de-dup failed', error);
    return;
  }

  // Calculate delay days
  const target = new Date(targetDate + 'T00:00:00Z');
  const projected = new Date(projectedDate + 'T00:00:00Z');
  const delayDays = Math.round((projected.getTime() - target.getTime()) / (24 * 60 * 60 * 1000));

  const title = 'Milestone delayed beyond target date';
  const body = `${milestoneName} is delayed by ${delayDays} days (Target date ${targetDate}, new projected date ${projectedDate})`;

  tryCreateDiaryEntry(
    db,
    enabled,
    'milestone_delay',
    title,
    body,
    'milestone',
    String(milestoneId),
  );
}

/**
 * Log a budget category overspend detection to the diary.
 *
 * @param db - Database connection
 * @param enabled - Whether auto-events are enabled
 * @param categoryId - ID of the budget category
 * @param categoryName - Name of the category (for reference)
 */
export function onBudgetCategoryOverspend(
  db: DbType,
  enabled: boolean,
  categoryId: string,
  categoryName: string,
): void {
  const title = 'Budget category overspend detected';
  const body = `Category ${categoryName} has exceeded planned amount`;

  tryCreateDiaryEntry(db, enabled, 'budget_breach', title, body, 'budget_source', categoryId);
}

/**
 * Log completion of automatic rescheduling to the diary.
 * Currently suppressed (no-op) — diary entries are created for individual item changes instead.
 *
 * @param db - Database connection
 * @param enabled - Whether auto-events are enabled
 * @param updatedCount - Number of work items that were rescheduled
 */
export function onAutoRescheduleCompleted(
  _db: DbType,
  _enabled: boolean,
  _updatedCount: number,
): void {
  // Suppress auto-reschedule completion events
  return;
}

/**
 * Log a subsidy program application status change to the diary.
 *
 * @param db - Database connection
 * @param enabled - Whether auto-events are enabled
 * @param subsidyId - ID of the subsidy program
 * @param subsidyName - Name of the subsidy program (for reference)
 * @param previousStatus - Previous application status
 * @param newStatus - New application status
 */
export function onSubsidyStatusChanged(
  db: DbType,
  enabled: boolean,
  subsidyId: string,
  subsidyName: string,
  previousStatus: string,
  newStatus: string,
  actorUserId: string | null = null,
): void {
  const previousLabel = toLabel(previousStatus);
  const newLabel = toLabel(newStatus);
  const title = `Application status changed from ${previousLabel} to ${newLabel}`;
  const body = `${subsidyName} application status changed from ${previousLabel} to ${newLabel}`;

  recordStatusEvent(
    db,
    enabled,
    'subsidy_status',
    'subsidy_program',
    subsidyId,
    previousStatus,
    newStatus,
    actorUserId,
    title,
    body,
  );
}

/**
 * Log an invoice creation to the diary.
 *
 * @param db - Database connection
 * @param enabled - Whether auto-events are enabled
 * @param invoiceId - ID of the invoice
 * @param invoiceNumber - Invoice number (for reference)
 * @param vendorName - Name of the vendor (for reference)
 */
export function onInvoiceCreated(
  db: DbType,
  enabled: boolean,
  invoiceId: string,
  invoiceNumber: string,
  vendorName: string,
): void {
  const title = 'Invoice created';
  const body = `${invoiceNumber} created for ${vendorName}`;

  tryCreateDiaryEntry(db, enabled, 'invoice_created', title, body, 'invoice', invoiceId);
}
