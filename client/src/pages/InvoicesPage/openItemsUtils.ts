import type { Invoice, InvoiceDeposit } from '@cornerstone/shared';

/**
 * Pure helpers for the "Show only open items" view (Story #2046).
 * No React imports — safe to unit test in isolation.
 */

/**
 * Local calendar date as YYYY-MM-DD. Matches InvoiceDepositsSection.tsx's convention.
 * Built from local date components, not `toISOString()` (UTC, can be a day off near
 * midnight for CET users).
 */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Strictly before today. Null/empty dueDate is never overdue. */
export function isOverdue(dueDate: string | null, today: string): boolean {
  if (!dueDate) return false;
  return dueDate < today;
}

/** Pending entries only, preserving server order (dueDate, createdAt). */
export function getOpenDeposits(invoice: Invoice): InvoiceDeposit[] {
  return invoice.deposits.filter((d) => d.status === 'pending');
}

/** Listed only because of a pending deposit — its own status is not 'pending'. */
export function isContainerOnly(invoice: Invoice): boolean {
  return invoice.status !== 'pending';
}

/** The invoice itself is overdue. */
export function isInvoiceOverdue(invoice: Invoice, today: string): boolean {
  return invoice.status === 'pending' && isOverdue(invoice.dueDate, today);
}

/** Any pending deposit is overdue (used for the collapsed-parent chip). */
export function hasOverdueOpenDeposit(invoice: Invoice, today: string): boolean {
  return getOpenDeposits(invoice).some((d) => isOverdue(d.dueDate, today));
}

/**
 * "Deposit n/N" ordinal: 1-based position among the invoice's deposit-type
 * entries of ANY status, N = their total count. Returns null for refunds.
 */
export function getDepositOrdinal(
  invoice: Invoice,
  deposit: InvoiceDeposit,
): { index: number; total: number } | null {
  if (deposit.entryType === 'refund') return null;
  const depositEntries = invoice.deposits.filter((d) => d.entryType === 'deposit');
  const index = depositEntries.findIndex((d) => d.id === deposit.id);
  if (index === -1) return null;
  return { index: index + 1, total: depositEntries.length };
}
