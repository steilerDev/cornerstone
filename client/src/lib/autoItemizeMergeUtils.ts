import type { LineWithInclude } from '../components/autoItemize/types.js';
import { effectiveLineAmount } from './budgetConstants.js';

export interface AggregatedMergeNumerics {
  totalAmount: number;
  includesVat: true;
  quantity?: number;
  unit?: string;
  confidence: number;
  vendorName?: string;
  budgetSourceId?: string | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Aggregates numeric fields of selected source lines into the merged line's numerics.
 * NEVER pass these numeric values to an LLM — this is the code-side aggregation the
 * story requires for accuracy.
 */
export function aggregateMergedLineNumerics(
  sourceLines: LineWithInclude[],
): AggregatedMergeNumerics {
  const grossAmounts = sourceLines.map((l) =>
    effectiveLineAmount({ amount: l.totalAmount ?? 0, includesVat: l.includesVat }),
  );
  const totalAmount = round2(grossAmounts.reduce((sum, a) => sum + a, 0));

  const allHaveQuantityAndUnit = sourceLines.every((l) => l.quantity != null && l.unit != null);
  const distinctUnits = new Set(
    sourceLines.map((l) => (l.unit ?? '').trim().toLowerCase()).filter((u) => u.length > 0),
  );
  const uniformUnit = allHaveQuantityAndUnit && distinctUnits.size === 1;
  const quantity = uniformUnit
    ? round2(sourceLines.reduce((sum, l) => sum + (l.quantity ?? 0), 0))
    : undefined;
  const unit = uniformUnit ? (sourceLines[0]?.unit ?? undefined) : undefined;

  const confidence = Math.min(...sourceLines.map((l) => l.confidence));

  const allHaveVendorName = sourceLines.every((l) => !!l.vendorName?.trim());
  const vendorNames = new Set(
    sourceLines.map((l) => (l.vendorName ?? '').trim().toLowerCase()).filter((v) => v.length > 0),
  );
  const vendorName =
    allHaveVendorName && vendorNames.size === 1
      ? sourceLines.find((l) => l.vendorName)?.vendorName
      : undefined;

  const budgetSourceId = sourceLines[0]?.budgetSourceId;

  return { totalAmount, includesVat: true, quantity, unit, confidence, vendorName, budgetSourceId };
}

/**
 * Distinct category vocabulary for the merge LLM: prefers distinct already-extracted
 * category strings across ALL current lines; falls back to project category display names.
 */
export function buildAvailableCategories(
  allLines: LineWithInclude[],
  projectCategoryNames: string[],
): string[] {
  const extracted = Array.from(
    new Set(allLines.map((l) => l.category).filter((c): c is string => !!c && c.trim().length > 0)),
  );
  return extracted.length > 0 ? extracted : projectCategoryNames;
}
