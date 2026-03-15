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
    createAutomaticDiaryEntry(
      db,
      entryType,
      entryDate,
      body,
      metadata,
      sourceEntityType,
      sourceEntityId,
    );
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
  const previousLabel = toLabel(previousStatus);
  const newLabel = toLabel(newStatus);
  const body = `[Work Item] "${workItemTitle}" status changed from ${previousLabel} to ${newLabel}`;
  const metadata: AutoEventMetadata = {
    changeSummary: `Status changed from ${previousLabel} to ${newLabel}`,
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
  const previousLabel = toLabel(previousStatus);
  const newLabel = toLabel(newStatus);
  const body = `[Invoice] ${invoiceNumber || 'N/A'} status changed from ${previousLabel} to ${newLabel}`;
  const metadata: AutoEventMetadata = {
    changeSummary: `Status changed from ${previousLabel} to ${newLabel}`,
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
  // Calculate delay days
  const target = new Date(targetDate + 'T00:00:00Z');
  const projected = new Date(projectedDate + 'T00:00:00Z');
  const delayDays = Math.round((projected.getTime() - target.getTime()) / (24 * 60 * 60 * 1000));

  const body = `Milestone: ${milestoneName} is delayed by ${delayDays} days (Target date ${targetDate}, new projected date ${projectedDate})`;
  const metadata: AutoEventMetadata = {
    changeSummary: 'Milestone delayed beyond target date',
    targetDate,
    projectedDate,
    delayDays,
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

  tryCreateDiaryEntry(db, enabled, 'budget_breach', body, metadata, 'budget_source', categoryId);
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
): void {
  const previousLabel = toLabel(previousStatus);
  const newLabel = toLabel(newStatus);
  const body = `Subsidy: ${subsidyName} application status changed from ${previousLabel} to ${newLabel}`;
  const metadata: AutoEventMetadata = {
    changeSummary: `Application status changed from ${previousLabel} to ${newLabel}`,
    previousValue: previousStatus,
    newValue: newStatus,
  };

  tryCreateDiaryEntry(db, enabled, 'subsidy_status', body, metadata, 'subsidy_program', subsidyId);
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
  const body = `[Invoice] ${invoiceNumber} created for ${vendorName}`;
  const metadata: AutoEventMetadata = {
    changeSummary: 'Invoice created',
  };

  tryCreateDiaryEntry(db, enabled, 'invoice_created', body, metadata, 'invoice', invoiceId);
}
