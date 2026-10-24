import { roundMoney } from './money.js';

/** What a merge needs to know about each row it combines. */
export interface MergeSourceLine {
  /** Gross amount of the row as the grid shows it. */
  readonly grossAmount: number;
  /** Extraction score of the row, 0..1 (a row typed by hand counts as 1). */
  readonly certainty: number;
  readonly vendorName?: string | null;
  readonly budgetSourceId?: string | null;
}

export interface AggregatedMergeNumerics {
  /** Sum of the gross amounts. */
  readonly totalAmount: number;
  /** The lowest certainty of the rows. */
  readonly certainty: number;
  /** The company name when every row names the same one. */
  readonly vendorName?: string;
  readonly budgetSourceId?: string | null;
}

/**
 * Aggregates the numbers of the rows to merge. NEVER pass these values to an LLM: this is the
 * code-side aggregation the story requires for accuracy.
 */
export function aggregateMergedLineNumerics(
  sourceLines: readonly MergeSourceLine[],
): AggregatedMergeNumerics {
  const totalAmount = roundMoney(sourceLines.reduce((sum, line) => sum + line.grossAmount, 0));
  const certainty = Math.min(...sourceLines.map((line) => line.certainty));

  const allHaveVendorName = sourceLines.every((line) => !!line.vendorName?.trim());
  const vendorNames = new Set(
    sourceLines
      .map((line) => (line.vendorName ?? '').trim().toLowerCase())
      .filter((name) => name.length > 0),
  );
  const vendorName =
    allHaveVendorName && vendorNames.size === 1 ? sourceLines[0]!.vendorName!.trim() : undefined;

  return { totalAmount, certainty, vendorName, budgetSourceId: sourceLines[0]?.budgetSourceId };
}

/**
 * Distinct category vocabulary for the merge LLM: prefers the distinct category words already
 * extracted for ALL current rows; falls back to the project category display names.
 */
export function buildAvailableCategories(
  extractedCategories: readonly (string | null | undefined)[],
  projectCategoryNames: readonly string[],
): string[] {
  const extracted = Array.from(
    new Set(extractedCategories.filter((word): word is string => !!word && word.trim().length > 0)),
  );
  return extracted.length > 0 ? extracted : [...projectCategoryNames];
}
