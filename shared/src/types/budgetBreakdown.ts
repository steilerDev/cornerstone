/**
 * Money › Overview breakdown (#2237, story 4.5; ADR-039 §5 amended). Every figure comes from the
 * money service (`moneyService.getBudgetBreakdown`), integer cents inside, major units here.
 * The source filter (`deselectedSources`) applies to every row; `notYetSplit` is not tied to a
 * source and is never filtered.
 */
import type { ConfidenceLevel } from './budget.js';
import type { InvoiceStatus } from './invoice.js';
import type { BudgetSourceType } from './budgetSource.js';
import type { MoneyItemType, MoneyRange } from './money.js';

/** Kind of the item a cost line belongs to. */
export type BreakdownItemKind = 'work_item' | 'household_item';

/** The money of one breakdown row (a line, an item, a group or the total). */
export interface BreakdownFigures {
  expectedCost: MoneyRange;
  /** Counted (approved / received) grant shares; `best > worst` is possible (ADR-039 §2). */
  expectedGrants: MoneyRange;
  /** expectedCost − expectedGrants, per scenario */
  afterGrants: MoneyRange;
  /** Attributed Paid (ADR-039 §5, #2237); same in every scenario */
  paid: number;
  /** Attributed Still to pay; same in every scenario */
  stillToPay: number;
  /**
   * expectedCost − paid, per scenario. Never clamped: it can be below 0 (an overpaid record, or a
   * remainder under 1.00; contract 25 rule 5).
   */
  notYetPaid: MoneyRange;
}

export interface BreakdownLine {
  id: string;
  kind: BreakdownItemKind;
  /** null = a task line without a task (orphan, ADR-030) */
  itemId: string | null;
  description: string | null;
  confidence: ConfidenceLevel;
  budgetCategoryId: string | null;
  budgetSourceId: string | null;
  /** Status of the linked offer or invoice; null = not linked (an estimate) */
  linkStatus: InvoiceStatus | null;
  figures: BreakdownFigures;
}

export interface BreakdownItem {
  kind: BreakdownItemKind;
  id: string;
  /** Task title or purchase name */
  name: string;
  /** null = no area, or an area that no longer exists */
  areaId: string | null;
  figures: BreakdownFigures;
}

/** An area with at least one line in its subtree, rolled up (own items + all descendants). */
export interface BreakdownAreaRow {
  areaId: string;
  parentId: string | null;
  name: string;
  figures: BreakdownFigures;
}

export interface BreakdownCategoryRow {
  /** null = lines without a cost category */
  budgetCategoryId: string | null;
  name: string | null;
  translationKey: string | null;
  figures: BreakdownFigures;
}

export interface BreakdownSourceRow {
  /** null = lines without a funding source ("Unassigned") */
  budgetSourceId: string | null;
  name: string | null;
  figures: BreakdownFigures;
}

/** One entry of the funding-source filter (independent of the filter itself). */
export interface BreakdownSourceOption {
  id: string;
  name: string;
  sourceType: BudgetSourceType;
}

export interface BudgetBreakdown {
  /** Every funding source, name ASC, id ASC (all statuses) */
  sourceOptions: BreakdownSourceOption[];
  /** At least one line (unfiltered) has no funding source */
  hasUnassignedLines: boolean;
  /** Lines that took part (after the filter), in item order then description, id (§3.5) */
  lines: BreakdownLine[];
  /** Tasks (title, id) then purchases (name, id) with at least one included line */
  items: BreakdownItem[];
  /** Depth-first tree order by (sort_order, name, id); areas without lines omitted */
  byArea: BreakdownAreaRow[];
  /** Items without an area (or with an unknown one) plus orphan lines; null when none */
  noArea: BreakdownFigures | null;
  /** Orphan task lines (no task); null when none */
  orphanLines: BreakdownFigures | null;
  byType: Record<MoneyItemType, BreakdownFigures>;
  /** Categories with lines (sort_order, name, id), then the null category last */
  byCategory: BreakdownCategoryRow[];
  /** Sources with lines (name, id), then the null source ("Unassigned") last */
  bySource: BreakdownSourceRow[];
  /** Records' unsplit remainders (≥ 1.00) and their payment shares; null when all zero */
  notYetSplit: BreakdownFigures | null;
  /** Σ of every view's top-level rows + notYetSplit */
  total: BreakdownFigures;
}

export interface BudgetBreakdownResponse {
  breakdown: BudgetBreakdown;
}
