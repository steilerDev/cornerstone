/**
 * System event metadata (version 1) for automatic diary entries (ADR-040 §2, #2223).
 *
 * v1 events write no English text: `title` is NULL and `body` is ''. The client renders every v1
 * event from this metadata in the UI language. Key order is canonical (the display rule R2
 * compares the JSON text): the writer and migration 0047 must agree on it.
 */

export interface StatusChangedMetadataV1 {
  v: 1;
  event: 'status_changed';
  /** Stored value; null only on backfilled first-release grant rows. */
  from: string | null;
  to: string;
  /** Snapshot of the subject's name; null = invoice without a number. */
  subjectLabel: string | null;
  /** Invoice and deposit events (major units, as stored). */
  amount?: number;
  /** Deposit events only. */
  depositEntryType?: 'deposit' | 'refund';
  /** Deposit events (the row's source entity is the invoice). */
  depositId?: string;
  /** Bank-report submission (W5). */
  batchId?: string;
  /** Bank-report submission (W5): the funding source the batch was submitted for (#2224). */
  budgetSourceId?: string;
  /** Revert submission (#2243): the submission batchId this event reverts. */
  revertOf?: string;
}

export interface MilestoneDelayedMetadataV1 {
  v: 1;
  event: 'milestone_delayed';
  targetDate: string;
  projectedDate: string;
  delayDays: number;
  subjectLabel: string;
}

export interface InvoiceCreatedMetadataV1 {
  v: 1;
  event: 'invoice_created';
  subjectLabel: string | null;
  vendorId: string | null;
  vendorName: string | null;
  amount?: number;
  /** 'quotation' marks an offer. */
  invoiceStatus?: string;
}

export interface LegacyEventMetadataV1 {
  v: 1;
  event: 'legacy';
  depositId?: string;
}

export type SystemEventMetadataV1 =
  | StatusChangedMetadataV1
  | MilestoneDelayedMetadataV1
  | InvoiceCreatedMetadataV1
  | LegacyEventMetadataV1;

export type SystemEventMetadata = SystemEventMetadataV1;

/** Display rule R2: a run of exact repeats collapsed into the newest row. */
export interface SystemEventRepeat {
  count: number;
  firstAt: string;
  lastAt: string;
}

/** History only: a bank-report submission collapsed into one row (ADR-040 §6, #2224). */
export interface SystemEventBatchSummary {
  batchId: string;
  /** Distinct invoices in the batch. */
  invoiceCount: number;
  /** Submitted total (see listHistory); null when an amount is missing. */
  amount: number | null;
  /** First three invoices: live number, else the snapshot label; null = no number. */
  invoiceLabels: (string | null)[];
  budgetSourceId: string | null;
  budgetSourceName: string | null;
  /** null when the batch names no source (written before #2224). */
  budgetSourceExists: boolean | null;
  /** 'revert' when the batch's events carry `revertOf` (a Revert submission). */
  kind: 'submission' | 'revert';
  /** submission: a revert batch names this batch in `revertOf`. revert: always false. */
  reverted: boolean;
  /** Distinct invoices by status before the submission (submission: event `from`; revert: event `to`). */
  invoicesFrom: { pending: number; paid: number };
  /** Progress-payment and refund events in the batch. */
  progressPaymentCount: number;
}
