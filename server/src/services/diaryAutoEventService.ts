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

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { createAutomaticDiaryEntry } from './diaryService.js';
import type { AutoEventMetadata } from '@cornerstone/shared';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Safely create a diary entry without propagating errors.
 * Logs warnings for any failures.
 *
 * @param db - Database connection
 * @param enabled - Whether auto-events are enabled globally
 * @param entryType - Automatic entry type
 * @param body - Human-readable description
 * @param metadata - Type-specific metadata
 * @param sourceEntityType - Entity type that triggered the event (e.g., 'work_item')
 * @param sourceEntityId - ID of the entity that triggered the event
 */
function tryCreateDiaryEntry(
  db: DbType,
  enabled: boolean,
  entryType: string,
  body: string,
  metadata: AutoEventMetadata | null,
  sourceEntityType: string | null,
  sourceEntityId: string | null,
): void {
  if (!enabled) return;

  try {
    const entryDate = new Date().toISOString().slice(0, 10);
    createAutomaticDiaryEntry(db, entryType, entryDate, body, metadata, sourceEntityType, sourceEntityId);
  } catch (err) {
    console.warn('[diaryAutoEvent] Failed to create diary entry', {
      entryType,
      error: err instanceof Error ? err.message : String(err),
    });
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
): void {
  const body = `Work Item: Status changed to ${newStatus}`;
  const metadata: AutoEventMetadata = {
    changeSummary: `Status changed from ${previousStatus} to ${newStatus}`,
    previousValue: previousStatus,
    newValue: newStatus,
  };

  tryCreateDiaryEntry(db, enabled, 'work_item_status', body, metadata, 'work_item', workItemId);
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
): void {
  const body = `Invoice ${invoiceNumber || 'N/A'}: Status changed to ${newStatus}`;
  const metadata: AutoEventMetadata = {
    changeSummary: `Status changed from ${previousStatus} to ${newStatus}`,
    previousValue: previousStatus,
    newValue: newStatus,
  };

  tryCreateDiaryEntry(db, enabled, 'invoice_status', body, metadata, 'invoice', invoiceId);
}

/**
 * Log a milestone delay detection to the diary.
 *
 * @param db - Database connection
 * @param enabled - Whether auto-events are enabled
 * @param milestoneId - ID of the milestone
 * @param milestoneName - Name of the milestone (for reference)
 */
export function onMilestoneDelayed(
  db: DbType,
  enabled: boolean,
  milestoneId: number,
  milestoneName: string,
): void {
  const body = `Milestone: ${milestoneName} is delayed beyond target date`;
  const metadata: AutoEventMetadata = {
    changeSummary: 'Milestone delayed beyond target date',
  };

  tryCreateDiaryEntry(
    db,
    enabled,
    'milestone_delay',
    body,
    metadata,
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
  const body = `Budget: Category ${categoryName} has exceeded planned amount`;
  const metadata: AutoEventMetadata = {
    changeSummary: 'Budget category overspend detected',
  };

  tryCreateDiaryEntry(
    db,
    enabled,
    'budget_breach',
    body,
    metadata,
    'budget_source',
    categoryId,
  );
}

/**
 * Log completion of automatic rescheduling to the diary.
 * Only creates an entry if count > 0 (actual work items were rescheduled).
 *
 * @param db - Database connection
 * @param enabled - Whether auto-events are enabled
 * @param updatedCount - Number of work items that were rescheduled
 */
export function onAutoRescheduleCompleted(
  db: DbType,
  enabled: boolean,
  updatedCount: number,
): void {
  if (updatedCount === 0) return;

  const body = `Schedule: Automatic rescheduling completed, ${updatedCount} work item(s) updated`;
  const metadata: AutoEventMetadata = {
    changeSummary: `${updatedCount} work item(s) automatically rescheduled`,
    itemCount: updatedCount,
  };

  tryCreateDiaryEntry(db, enabled, 'auto_reschedule', body, metadata, null, null);
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
): void {
  const body = `Subsidy: ${subsidyName} application status changed to ${newStatus}`;
  const metadata: AutoEventMetadata = {
    changeSummary: `Application status changed from ${previousStatus} to ${newStatus}`,
    previousValue: previousStatus,
    newValue: newStatus,
  };

  tryCreateDiaryEntry(db, enabled, 'subsidy_status', body, metadata, 'subsidy_program', subsidyId);
}
