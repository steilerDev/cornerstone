import { patch } from './apiClient.js';
import type {
  HouseholdItemDetail,
  HouseholdItemStatus,
  Invoice,
  InvoiceDeposit,
  InvoiceDepositStatus,
  InvoiceStatus,
  MilestoneCompletionState,
  MilestoneSummary,
  UndoToken,
  UpdateDepositRequest,
  UpdateHouseholdItemRequest,
  UpdateInvoiceRequest,
  UpdateMilestoneRequest,
  UpdateWorkItemRequest,
  WorkItemDetail,
  WorkItemStatus,
} from '@cornerstone/shared';

/** A status PATCH result: the updated record plus the undo token when one was issued. */
export interface StatusChangeResult<R> {
  readonly record: R;
  readonly undo: UndoToken | null;
}

// ── Request builders (the date is the actual date chosen in the StatusMenu date step) ──────

export function workItemStatusBody(to: WorkItemStatus, date: string | null): UpdateWorkItemRequest {
  if (to === 'in_progress' && date) return { status: to, actualStartDate: date };
  if (to === 'completed' && date) return { status: to, actualEndDate: date };
  return { status: to };
}

export function householdItemStatusBody(
  to: HouseholdItemStatus,
  date: string | null,
): UpdateHouseholdItemRequest {
  if (to === 'arrived' && date) return { status: to, actualDeliveryDate: date };
  return { status: to };
}

export function milestoneStatusBody(
  to: MilestoneCompletionState,
  date: string | null,
): UpdateMilestoneRequest {
  if (to === 'reached') {
    return date ? { isCompleted: true, completedAt: date } : { isCompleted: true };
  }
  return { isCompleted: false };
}

export function invoiceStatusBody(to: InvoiceStatus): UpdateInvoiceRequest {
  return { status: to };
}

export function depositStatusBody(
  from: InvoiceDepositStatus,
  to: InvoiceDepositStatus,
  date: string | null,
): UpdateDepositRequest {
  if (to === 'paid' && from === 'pending' && date) return { status: to, paidDate: date };
  if (to === 'claimed' && date) {
    return from === 'pending'
      ? { status: to, paidDate: date, claimedDate: date }
      : { status: to, claimedDate: date };
  }
  return { status: to };
}

// ── Requests (unwrap per contract 11: bare + undo, or wrapped + sibling undo) ──────────────

function splitBare<R extends object>(body: R & { undo?: UndoToken }): StatusChangeResult<R> {
  const { undo, ...record } = body;
  return { record: record as unknown as R, undo: undo ?? null };
}

export async function changeWorkItemStatus(
  id: string,
  body: UpdateWorkItemRequest,
): Promise<StatusChangeResult<WorkItemDetail>> {
  return splitBare(await patch<WorkItemDetail & { undo?: UndoToken }>(`/work-items/${id}`, body));
}

export async function changeHouseholdItemStatus(
  id: string,
  body: UpdateHouseholdItemRequest,
): Promise<StatusChangeResult<HouseholdItemDetail>> {
  const r = await patch<{ householdItem: HouseholdItemDetail; undo?: UndoToken }>(
    `/household-items/${id}`,
    body,
  );
  return { record: r.householdItem, undo: r.undo ?? null };
}

export async function changeMilestoneStatus(
  id: number,
  body: UpdateMilestoneRequest,
): Promise<StatusChangeResult<MilestoneSummary>> {
  return splitBare(await patch<MilestoneSummary & { undo?: UndoToken }>(`/milestones/${id}`, body));
}

export async function changeInvoiceStatus(
  vendorId: string,
  id: string,
  body: UpdateInvoiceRequest,
): Promise<StatusChangeResult<Invoice>> {
  const r = await patch<{ invoice: Invoice; undo?: UndoToken }>(
    `/vendors/${vendorId}/invoices/${id}`,
    body,
  );
  return { record: r.invoice, undo: r.undo ?? null };
}

export async function changeDepositStatus(
  invoiceId: string,
  depositId: string,
  body: UpdateDepositRequest,
): Promise<StatusChangeResult<InvoiceDeposit>> {
  const r = await patch<{ deposit: InvoiceDeposit; undo?: UndoToken }>(
    `/invoices/${invoiceId}/deposits/${depositId}`,
    body,
  );
  return { record: r.deposit, undo: r.undo ?? null };
}
