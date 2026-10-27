import type { BudgetSourceStatus, BudgetSourceType } from '@cornerstone/shared';

/** Which kind of primary leads the header of a funding source of this type. */
export type FundingSourcePrimaryKind = 'bankReport' | 'status';

/**
 * Loans and credit lines lead with Prepare bank report; every other type leads with the next
 * status move, and with Log once there is none.
 */
export const FUNDING_SOURCE_PRIMARY_KIND: Readonly<
  Record<BudgetSourceType, FundingSourcePrimaryKind>
> = {
  bank_loan: 'bankReport',
  credit_line: 'bankReport',
  savings: 'status',
  other: 'status',
  discretionary: 'status',
};

export type FundingSourcePrimary =
  | { readonly kind: 'bankReport' }
  | { readonly kind: 'status'; readonly to: BudgetSourceStatus }
  | { readonly kind: 'log' };

/** The header's one primary; `forwardTo` is the first forward status move, or null at the end. */
export function fundingSourcePrimary(
  type: BudgetSourceType,
  forwardTo: BudgetSourceStatus | null,
): FundingSourcePrimary {
  if (FUNDING_SOURCE_PRIMARY_KIND[type] === 'bankReport') return { kind: 'bankReport' };
  return forwardTo === null ? { kind: 'log' } : { kind: 'status', to: forwardTo };
}
