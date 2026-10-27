import type { BudgetSource, InvoiceBudgetLineDetailResponse } from '@cornerstone/shared';

export interface InvoiceSource {
  readonly id: string;
  readonly name: string;
  /** Sum of the itemized amounts of the lines paid from this source. */
  readonly itemized: number;
}

/**
 * The distinct funding sources of an offer or invoice's cost lines (lines without a source are
 * skipped), largest itemized sum first; ties keep the order of first appearance. A source that
 * is not (yet) in `budgetSources` is left out.
 */
export function invoiceSources(
  lines: readonly InvoiceBudgetLineDetailResponse[],
  budgetSources: readonly BudgetSource[],
): readonly InvoiceSource[] {
  const names = new Map(budgetSources.map((source) => [source.id, source.name]));
  const sums = new Map<string, number>();
  for (const line of lines) {
    if (line.budgetSourceId === null) continue;
    sums.set(line.budgetSourceId, (sums.get(line.budgetSourceId) ?? 0) + line.itemizedAmount);
  }
  const result: InvoiceSource[] = [];
  for (const [id, itemized] of sums) {
    const name = names.get(id);
    if (name !== undefined) result.push({ id, name, itemized });
  }
  return result.sort((a, b) => b.itemized - a.itemized);
}
