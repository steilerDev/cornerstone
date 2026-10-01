import type { InvoiceDeposit } from '@cornerstone/shared';

/**
 * Pure helpers for the quotation-to-final-invoice conversion flow (Story #2107).
 * Money is in major units; all arithmetic runs in integer cents.
 */

export function toCents(v: number): number {
  return Math.round(v * 100);
}

export function fromCents(c: number): number {
  return c / 100;
}

/** Parses a user-entered amount. Returns null for empty or non-numeric input. */
export function parseAmount(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Pro-rata proposal: scales each line by finalAmount / quotedAmount. */
export function computeProRataProposal(
  lines: Array<{ id: string; itemizedAmount: number }>,
  quotedAmount: number,
  finalAmount: number,
): Map<string, number> {
  const result = new Map<string, number>();
  if (lines.length === 0) return result;

  const quotedCents = toCents(quotedAmount);
  if (quotedCents <= 0) {
    for (const line of lines) result.set(line.id, line.itemizedAmount);
    return result;
  }

  const finalCents = toCents(finalAmount);
  let oldSum = 0;
  let largestIndex = 0;
  const proposedCents = lines.map((line, i) => {
    const oldCents = toCents(line.itemizedAmount);
    oldSum += oldCents;
    if (oldCents > toCents(lines[largestIndex]!.itemizedAmount)) largestIndex = i;
    return Math.round((oldCents * finalCents) / quotedCents);
  });

  const baseCents = Math.round((oldSum * finalCents) / quotedCents);
  const proposedSum = proposedCents.reduce((a, b) => a + b, 0);
  proposedCents[largestIndex] = proposedCents[largestIndex]! + (baseCents - proposedSum);

  lines.forEach((line, i) => result.set(line.id, fromCents(proposedCents[i]!)));
  return result;
}

export interface AmountDelta {
  absolute: number;
  /** Percent value (5 means 5%), suitable for formatPercent. */
  percent: number;
  direction: 'increase' | 'decrease' | 'none';
}

export function computeDelta(quoted: number, final: number): AmountDelta {
  const quotedCents = toCents(quoted);
  const finalCents = toCents(final);
  const diff = finalCents - quotedCents;
  if (diff === 0) return { absolute: 0, percent: 0, direction: 'none' };
  const absoluteCents = Math.abs(diff);
  return {
    absolute: fromCents(absoluteCents),
    percent: quotedCents > 0 ? (absoluteCents / quotedCents) * 100 : 0,
    direction: diff > 0 ? 'increase' : 'decrease',
  };
}

export interface DepositTotals {
  depositTotal: number;
  refundTotal: number;
  receivedRefundTotal: number;
  netDeposits: number;
}

export function computeDepositTotals(deposits: InvoiceDeposit[]): DepositTotals {
  let depositCents = 0;
  let refundCents = 0;
  let receivedRefundCents = 0;
  for (const d of deposits) {
    const cents = toCents(d.amount);
    if (d.entryType === 'refund') {
      refundCents += cents;
      if (d.status === 'paid' || d.status === 'claimed') receivedRefundCents += cents;
    } else {
      depositCents += cents;
    }
  }
  return {
    depositTotal: fromCents(depositCents),
    refundTotal: fromCents(refundCents),
    receivedRefundTotal: fromCents(receivedRefundCents),
    netDeposits: fromCents(depositCents - refundCents),
  };
}

/** Mirrors the server's final payment: max(0, final - deposits - received refunds). */
export function computeFinalPayment(finalAmount: number, deposits: InvoiceDeposit[]): number {
  const totals = computeDepositTotals(deposits);
  const cents =
    toCents(finalAmount) - toCents(totals.depositTotal) - toCents(totals.receivedRefundTotal);
  return fromCents(Math.max(0, cents));
}

/** Amount by which net deposits exceed the final amount (0 when not blocked). */
export function computeShortfall(finalAmount: number, deposits: InvoiceDeposit[]): number {
  const { netDeposits } = computeDepositTotals(deposits);
  return fromCents(Math.max(0, toCents(netDeposits) - toCents(finalAmount)));
}

/** Mirrors the server's total-mismatch warning: |extracted - reference| > reference * 1%. */
export function hasTotalMismatch(extractedTotal: number, referenceTotal: number): boolean {
  return Math.abs(extractedTotal - referenceTotal) > referenceTotal * 0.01;
}

/** The single shared non-null budget source across deposit entries, otherwise null. */
export function defaultRefundSourceId(deposits: InvoiceDeposit[]): string | null {
  const ids = new Set<string>();
  for (const d of deposits) {
    if (d.entryType === 'deposit' && d.budgetSourceId) ids.add(d.budgetSourceId);
  }
  return ids.size === 1 ? [...ids][0]! : null;
}
