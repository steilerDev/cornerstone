import type { InvoiceStatus } from '@cornerstone/shared';

/**
 * The derived state of a cost line, shown as a chip. Pure data: `unionKeys.ts` iterates the tuple.
 * The state comes from the line's link to an offer or invoice, never from its Basis (confidence).
 */
export const COST_LINE_STATES = ['estimate', 'offered', 'invoiced', 'paid', 'submitted'] as const;

export type CostLineState = (typeof COST_LINE_STATES)[number];

/** A line links to at most one offer or invoice, so its link status maps one to one (D1). */
const STATE_BY_LINK_STATUS: Record<InvoiceStatus, CostLineState> = {
  quotation: 'offered',
  pending: 'invoiced',
  paid: 'paid',
  claimed: 'submitted',
};

/** State of a line from the status of its linked offer or invoice; no link means Estimate. */
export function deriveCostLineState(linkStatus: InvoiceStatus | null): CostLineState {
  return linkStatus === null ? 'estimate' : STATE_BY_LINK_STATUS[linkStatus];
}
