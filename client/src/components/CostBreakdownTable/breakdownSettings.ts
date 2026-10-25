import type { BudgetBreakdown, MoneyRange } from '@cornerstone/shared';

/**
 * Settings of the Money › Overview breakdown. Pure data (no React): `unionKeys.ts` iterates the
 * tuples. View, payment basis, estimate and grants are client-only (no refetch); the funding
 * sources are the one setting the server filters by.
 */
export const BREAKDOWN_VIEWS = ['area', 'type', 'category', 'source'] as const;
export const BREAKDOWN_PAYMENTS = ['all', 'paid', 'outstanding'] as const;
export const BREAKDOWN_ESTIMATES = ['low', 'expected', 'high'] as const;

export type BreakdownView = (typeof BREAKDOWN_VIEWS)[number];
export type BreakdownPayment = (typeof BREAKDOWN_PAYMENTS)[number];
export type BreakdownEstimate = (typeof BREAKDOWN_ESTIMATES)[number];

/** Which scenario of a MoneyRange each estimate reads. */
export const ESTIMATE_SCENARIO: Record<BreakdownEstimate, keyof MoneyRange> = {
  low: 'best',
  expected: 'expected',
  high: 'worst',
};

/** URL key of the "Unassigned" funding source (lines without one). */
export const UNASSIGNED_SOURCE_KEY = 'unassigned';

export interface BreakdownSettings {
  readonly view: BreakdownView;
  readonly payment: BreakdownPayment;
  readonly estimate: BreakdownEstimate;
  readonly grants: boolean;
  /** Source ids, plus `unassigned`. */
  readonly deselected: ReadonlySet<string>;
}

/** The funding-source filter rows: every source, then Unassigned when it has lines or is off. */
export function breakdownSourceKeys(
  breakdown: BudgetBreakdown,
  deselected: ReadonlySet<string>,
): string[] {
  const keys = breakdown.sourceOptions.map((option) => option.id);
  if (breakdown.hasUnassignedLines || deselected.has(UNASSIGNED_SOURCE_KEY)) {
    keys.push(UNASSIGNED_SOURCE_KEY);
  }
  return keys;
}

/** True while the total is not the whole project at expected estimates. */
export function isBreakdownFiltered(settings: BreakdownSettings): boolean {
  return (
    settings.payment !== 'all' || settings.estimate !== 'expected' || settings.deselected.size > 0
  );
}
