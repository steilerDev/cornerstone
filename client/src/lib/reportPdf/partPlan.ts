/**
 * Pure planning helpers for the multi-PDF split (#2161). No runtime imports.
 */

export const BYTES_PER_MB = 1_000_000;

export type MaxFileSizeParse =
  | { status: 'empty' }
  | { status: 'valid'; bytes: number }
  | { status: 'invalid'; reason: 'invalid' | 'min' | 'decimals' };

/** Parses the user's maximum-file-size input (MB, `.` or `,` decimal separator, 1 decimal max). */
export function parseMaxFileSizeInput(raw: string): MaxFileSizeParse {
  const trimmed = raw.trim();
  if (trimmed === '') return { status: 'empty' };
  if (!/^\d+([.,]\d*)?$/.test(trimmed)) return { status: 'invalid', reason: 'invalid' };
  const normalized = trimmed.replace(',', '.');
  const fraction = normalized.split('.')[1] ?? '';
  if (fraction.length > 1) return { status: 'invalid', reason: 'decimals' };
  const value = Number(normalized);
  if (!(value >= 1)) return { status: 'invalid', reason: 'min' };
  return { status: 'valid', bytes: Math.round(value * BYTES_PER_MB) };
}

export interface PlanItem {
  key: string;
  size: number;
}

export interface PlanInput {
  items: readonly PlanItem[];
  limitBytes: number;
  part1OverheadBytes: number;
  continuationOverheadBytes: number;
  fixedPartCounts?: readonly number[];
}

export interface PlannedPart {
  itemKeys: string[];
  estimatedBytes: number;
  oversizedItemKey: string | null;
}

export interface PartPlan {
  parts: PlannedPart[]; // always >= 1
  reportExceedsLimit: boolean;
}

interface OpenPart {
  itemKeys: string[];
  est: number;
  isFirst: boolean;
}

/** Ordered greedy bin-packer. Part 1 holds the report pages; others are attachment-only. */
export function planReportParts(input: PlanInput): PartPlan {
  const { items, limitBytes: L, part1OverheadBytes: p1, continuationOverheadBytes: c } = input;
  const parts: PlannedPart[] = [];
  let next = 0;

  const close = (part: OpenPart): void => {
    const only = part.itemKeys.length === 1 ? (part.itemKeys[0] ?? null) : null;
    parts.push({
      itemKeys: part.itemKeys,
      estimatedBytes: part.est,
      oversizedItemKey: !part.isFirst && only !== null && part.est > L ? only : null,
    });
  };

  // 1. Frozen prefix
  const fixed = input.fixedPartCounts ?? [];
  for (let f = 0; f < fixed.length; f++) {
    const want = Math.max(fixed[f] ?? 0, 0);
    const isFirst = f === 0;
    const frozen: OpenPart = { itemKeys: [], est: isFirst ? p1 : c, isFirst };
    for (let i = 0; i < want; i++) {
      const item = items[next];
      if (!item) break;
      next++;
      frozen.itemKeys.push(item.key);
      frozen.est += item.size;
    }
    close(frozen);
  }

  // 2. Part 1
  let open: OpenPart | null = null;
  if (parts.length === 0) {
    const first: OpenPart = { itemKeys: [], est: p1, isFirst: true };
    if (p1 > L) {
      close(first);
    } else {
      open = first;
    }
  }

  // 3. Greedy loop
  while (next < items.length) {
    const item = items[next];
    if (!item) break;
    if (!open) open = { itemKeys: [], est: c, isFirst: false };
    if (open.est + item.size <= L) {
      open.itemKeys.push(item.key);
      open.est += item.size;
      next++;
    } else if (!open.isFirst && open.itemKeys.length === 0) {
      // Oversized singleton: gets its own continuation part.
      open.itemKeys.push(item.key);
      open.est += item.size;
      next++;
      close(open);
      open = null;
    } else {
      close(open);
      open = null;
    }
  }

  // 4. Close the last open part
  if (open) close(open);

  return { parts, reportExceedsLimit: p1 > L };
}

/** `fixedPartCounts` that freezes parts before `partIndex` and moves that part's last item onward. */
export function shiftLastItem(plan: PartPlan, partIndex: number): number[] {
  const counts: number[] = [];
  for (let i = 0; i < partIndex; i++) counts.push(plan.parts[i]?.itemKeys.length ?? 0);
  counts.push(Math.max((plan.parts[partIndex]?.itemKeys.length ?? 0) - 1, 0));
  return counts;
}
