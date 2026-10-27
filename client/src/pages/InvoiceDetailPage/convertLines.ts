import type { ConvertQuotationLineUpdate } from '@cornerstone/shared';
import { invoiceLineKey } from '../../components/CostLineTable/costLineRows.js';
import type { CostLineRow } from '../../components/CostLineTable/types.js';
import {
  computeProRataProposal,
  fromCents,
  parseAmount,
  toCents,
} from '../../lib/quotationConversion.js';

/** One cost line of the offer while it is converted. Money in major units. */
export interface ConvertLineState {
  /** The offered amount (`invoice_budget_lines.itemized_amount`). */
  readonly offered: number;
  /** The proposed amount as typed. */
  readonly proposed: string;
  /** True once the user typed into the proposed input. */
  readonly edited: boolean;
  /** Keep the offered amount. */
  readonly keep: boolean;
}

/** Keyed by `lineKey(row)`. */
export type ConvertLines = ReadonlyMap<string, ConvertLineState>;

export type RemainderState = 'none' | 'notYetSplit' | 'over';

/** The `invoice_budget_lines` id of a row: the id the convert request addresses lines by. */
export const lineKey = invoiceLineKey;

/** Fills `proposed` pro rata on every line the user has neither edited nor kept. */
export function applyProposal(
  lines: ConvertLines,
  offerAmount: number,
  finalInput: string,
): ConvertLines {
  const parsed = parseAmount(finalInput);
  if (parsed === null || parsed <= 0) return lines;
  const proposal = computeProRataProposal(
    [...lines].map(([id, line]) => ({ id, itemizedAmount: line.offered })),
    offerAmount,
    parsed,
  );
  const next = new Map<string, ConvertLineState>();
  for (const [key, line] of lines) {
    next.set(
      key,
      !line.edited && !line.keep ? { ...line, proposed: proposal.get(key)!.toFixed(2) } : line,
    );
  }
  return next;
}

export function initialLines(
  rows: readonly CostLineRow[],
  offerAmount: number,
  finalInput: string,
): ConvertLines {
  const lines = new Map<string, ConvertLineState>();
  for (const row of rows) {
    lines.set(lineKey(row), {
      offered: row.gross,
      proposed: row.gross.toFixed(2),
      edited: false,
      keep: false,
    });
  }
  return applyProposal(lines, offerAmount, finalInput);
}

/** What the line becomes: its offered amount when kept, else the typed amount (0 when unusable). */
export function effectiveCents(line: ConvertLineState): number {
  return line.keep ? toCents(line.offered) : toCents(parseAmount(line.proposed) ?? 0);
}

/** Lines that are not kept and hold no amount above 0. */
export function invalidLineKeys(lines: ConvertLines): ReadonlySet<string> {
  const invalid = new Set<string>();
  for (const [key, line] of lines) {
    if (line.keep) continue;
    const value = parseAmount(line.proposed);
    if (value === null || value <= 0) invalid.add(key);
  }
  return invalid;
}

/** Sum of the effective amounts of `keys` (all lines when omitted). */
export function proposedTotalCents(lines: ConvertLines, keys?: readonly string[]): number {
  let sum = 0;
  for (const [key, line] of lines) {
    if (!keys || keys.includes(key)) sum += effectiveCents(line);
  }
  return sum;
}

/** Exact cents, the rule of the server's itemized-sum check. */
export function remainderState(cents: number): RemainderState {
  if (cents === 0) return 'none';
  return cents > 0 ? 'notYetSplit' : 'over';
}

/** The request's line updates: lines that are not kept and whose amount changed. */
export function lineUpdates(lines: ConvertLines): ConvertQuotationLineUpdate[] {
  const updates: ConvertQuotationLineUpdate[] = [];
  for (const [id, line] of lines) {
    if (line.keep) continue;
    const cents = effectiveCents(line);
    if (cents !== toCents(line.offered)) updates.push({ id, itemizedAmount: fromCents(cents) });
  }
  return updates;
}
