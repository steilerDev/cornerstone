import type { ExtractedLine } from '@cornerstone/shared';
import type { CostLineGridRow } from '../CostLineForm/types.js';

/**
 * What the extraction knows about a grid row of the Split with AI pages. The grid row itself
 * (`CostLineGridRow`) holds everything the user edits; this side data holds what only the commit
 * needs (company name, the extraction score, the raw category word) and, for a merged row, the rows
 * it replaced so "Restore original lines" can bring them back.
 */
export interface AiRowData {
  readonly extracted: ExtractedLine;
  readonly mergeSources?: readonly AiMergeSource[];
}

/** A row replaced by a merge, with its side data. */
export interface AiMergeSource {
  readonly row: CostLineGridRow;
  readonly data: AiRowData | undefined;
}

export type AiRowDataMap = ReadonlyMap<string, AiRowData>;
