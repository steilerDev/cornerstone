import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import {
  CONFIDENCE_MARGINS,
  type HouseholdItemCategory,
  type ConfidenceLevel,
} from '@cornerstone/shared';
import type {
  BudgetBreakdown,
  BreakdownWorkItemCategory,
  BreakdownHouseholdItemCategory,
  BreakdownWorkItem,
  BreakdownHouseholdItem,
  BreakdownTotals,
  CostDisplay,
} from '@cornerstone/shared';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

const HI_CATEGORY_ORDER: HouseholdItemCategory[] = [
  'hic-furniture',
  'hic-appliances',
  'hic-fixtures',
  'hic-decor',
  'hic-electronics',
  'hic-outdoor',
  'hic-storage',
  'hic-other',
];

/**
 * Get detailed budget breakdown by item and budget line.
 * Expands both work items and household items into per-line details.
 *
 * Groups work items by budget category (with 'Uncategorized' for null category).
 * Groups household items by HouseholdItemCategory enum.
 *
 * For each item:
 * - If all budget lines are invoiced: costDisplay='actual', show actualCost only
 * - If no budget lines are invoiced: costDisplay='projected', show projectedMin–projectedMax
 * - If mixed: costDisplay='mixed', show both
 *
 * Applies subsidy payback per entity using the same logic as budgetOverviewService.
 */
export function getBudgetBreakdown(db: DbType): BudgetBreakdown {
  // ── 1. Query A: Work item budget lines with category metadata ──────────────
  const workItemLineRows = db.all<{
    workItemId: string;
    workItemTitle: string;
    budgetLineId: string;
    description: string | null;
    plannedAmount: number;
    confidence: string;
    budgetCategoryId: string | null;
    categoryName: string | null;
    categoryColor: string | null;
    categorySortOrder: number | null;
  }>(
    sql`SELECT
      wi.id                  AS workItemId,
      wi.title               AS workItemTitle,
      wib.id                 AS budgetLineId,
      wib.description        AS description,
      wib.planned_amount     AS plannedAmount,
      wib.confidence         AS confidence,
      wib.budget_category_id AS budgetCategoryId,
      bc.name                AS categoryName,
      bc.color               AS categoryColor,
      bc.sort_order          AS categorySortOrder
    FROM work_items wi
    INNER JOIN work_item_budgets wib ON wib.work_item_id = wi.id
    LEFT JOIN budget_categories bc ON bc.id = wib.budget_category_id
    ORDER BY bc.sort_order ASC, bc.name ASC, wi.title ASC`,
  );

  // ── 2. Query B: Invoice aggregates per WI budget line ─────────────────────
  const wiLineInvoiceRows = db.all<{
    budgetLineId: string;
    actualCost: number;
  }>(
    sql`SELECT
      work_item_budget_id AS budgetLineId,
      COALESCE(SUM(amount), 0) AS actualCost
    FROM invoices
    WHERE work_item_budget_id IS NOT NULL
    GROUP BY work_item_budget_id`,
  );

  const wiLineInvoiceMap = new Map<string, number>();
  for (const row of wiLineInvoiceRows) {
    wiLineInvoiceMap.set(row.budgetLineId, row.actualCost);
  }

  // ── 3. Query C: Household item budget lines with HI category ──────────────
  const hiLineRows = db.all<{
    householdItemId: string;
    itemName: string;
    hiCategory: HouseholdItemCategory;
    budgetLineId: string;
    description: string | null;
    plannedAmount: number;
    confidence: string;
    budgetCategoryId: string | null;
  }>(
    sql`SELECT
      hi.id                     AS householdItemId,
      hi.name                   AS itemName,
      hi.category_id            AS hiCategory,
      hib.id                    AS budgetLineId,
      hib.description           AS description,
      hib.planned_amount        AS plannedAmount,
      hib.confidence            AS confidence,
      hib.budget_category_id    AS budgetCategoryId
    FROM household_items hi
    INNER JOIN household_item_budgets hib ON hib.household_item_id = hi.id
    ORDER BY hi.category_id ASC, hi.name ASC`,
  );

  // ── 4. Query D: Invoice aggregates per HI budget line ────────────────────
  const hiLineInvoiceRows = db.all<{
    budgetLineId: string;
    actualCost: number;
  }>(
    sql`SELECT
      household_item_budget_id AS budgetLineId,
      COALESCE(SUM(amount), 0) AS actualCost
    FROM invoices
    WHERE household_item_budget_id IS NOT NULL
    GROUP BY household_item_budget_id`,
  );

  const hiLineInvoiceMap = new Map<string, number>();
  for (const row of hiLineInvoiceRows) {
    hiLineInvoiceMap.set(row.budgetLineId, row.actualCost);
  }

  // ── 5. Queries E/F/G/H: Subsidy data (same pattern as budgetOverviewService) ──
  const subsidyRows = db.all<{
    subsidyId: string;
    reductionType: string;
    reductionValue: number;
  }>(
    sql`SELECT
      id              AS subsidyId,
      reduction_type  AS reductionType,
      reduction_value AS reductionValue
    FROM subsidy_programs
    WHERE application_status != 'rejected'`,
  );

  const subsidyCategoryRows = db.all<{ subsidyId: string; budgetCategoryId: string }>(
    sql`SELECT
      subsidy_program_id  AS subsidyId,
      budget_category_id  AS budgetCategoryId
    FROM subsidy_program_categories`,
  );

  const subsidyCategoryMap = new Map<string, Set<string>>();
  for (const row of subsidyCategoryRows) {
    let cats = subsidyCategoryMap.get(row.subsidyId);
    if (!cats) {
      cats = new Set<string>();
      subsidyCategoryMap.set(row.subsidyId, cats);
    }
    cats.add(row.budgetCategoryId);
  }

  // Entity -> subsidy links (both WI and HI)
  const entitySubsidyRows = db.all<{ entityId: string; subsidyProgramId: string }>(
    sql`SELECT
      wis.work_item_id       AS entityId,
      wis.subsidy_program_id AS subsidyProgramId
    FROM work_item_subsidies wis
    INNER JOIN subsidy_programs sp ON sp.id = wis.subsidy_program_id
    WHERE sp.application_status != 'rejected'
    UNION ALL
    SELECT
      his.household_item_id  AS entityId,
      his.subsidy_program_id AS subsidyProgramId
    FROM household_item_subsidies his
    INNER JOIN subsidy_programs sp ON sp.id = his.subsidy_program_id
    WHERE sp.application_status != 'rejected'`,
  );

  const entitySubsidyMap = new Map<string, Set<string>>();
  for (const row of entitySubsidyRows) {
    let progs = entitySubsidyMap.get(row.entityId);
    if (!progs) {
      progs = new Set<string>();
      entitySubsidyMap.set(row.entityId, progs);
    }
    progs.add(row.subsidyProgramId);
  }

  // Build subsidy metadata map
  const subsidyMeta = new Map<string, { reductionType: string; reductionValue: number }>();
  for (const row of subsidyRows) {
    subsidyMeta.set(row.subsidyId, {
      reductionType: row.reductionType,
      reductionValue: row.reductionValue,
    });
  }

  // ── Helper: Compute per-entity subsidy payback ──────────────────────────────
  function computeEntitySubsidyPayback(
    entityId: string,
    budgetLines: Array<{
      id: string;
      plannedAmount: number;
      confidence: string;
      budgetCategoryId: string | null;
    }>,
    invoiceMap: Map<string, number>,
    useMinMargin: boolean = false,
  ): number {
    const linkedSubsidyIds = entitySubsidyMap.get(entityId);
    if (!linkedSubsidyIds || linkedSubsidyIds.size === 0) {
      return 0;
    }

    // Build effective lines (with actual or margin-adjusted amounts)
    const effectiveLines = budgetLines.map((line) => {
      const lineActualCost = invoiceMap.get(line.id);
      if (lineActualCost !== undefined) {
        return {
          budgetCategoryId: line.budgetCategoryId,
          amount: lineActualCost,
        };
      }
      const margin =
        CONFIDENCE_MARGINS[line.confidence as keyof typeof CONFIDENCE_MARGINS] ??
        CONFIDENCE_MARGINS.own_estimate;
      // Use min margin if useMinMargin=true, max margin otherwise
      const multiplier = useMinMargin ? 1 - margin : 1 + margin;
      return {
        budgetCategoryId: line.budgetCategoryId,
        amount: line.plannedAmount * multiplier,
      };
    });

    let payback = 0;
    const fixedSubsidyLineCountCache = new Map<string, number>();

    for (const subsidyId of linkedSubsidyIds) {
      const meta = subsidyMeta.get(subsidyId);
      if (!meta) continue;

      const applicableCategories = subsidyCategoryMap.get(subsidyId);
      const isUniversal = !applicableCategories || applicableCategories.size === 0;

      if (meta.reductionType === 'percentage') {
        const rate = meta.reductionValue / 100;
        for (const line of effectiveLines) {
          const categoryMatches =
            isUniversal ||
            (line.budgetCategoryId !== null && applicableCategories!.has(line.budgetCategoryId));
          if (categoryMatches) {
            payback += line.amount * rate;
          }
        }
      } else if (meta.reductionType === 'fixed') {
        // Fixed amount: count matching lines for this entity+subsidy and divide
        const cacheKey = `${entityId}:${subsidyId}`;
        let matchingLineCount = fixedSubsidyLineCountCache.get(cacheKey);
        if (matchingLineCount === undefined) {
          matchingLineCount = budgetLines.filter(
            (l) =>
              isUniversal ||
              (l.budgetCategoryId !== null && applicableCategories!.has(l.budgetCategoryId)),
          ).length;
          if (matchingLineCount === 0) matchingLineCount = 1;
          fixedSubsidyLineCountCache.set(cacheKey, matchingLineCount);
        }
        payback += meta.reductionValue / matchingLineCount;
      }
    }

    return payback;
  }

  // ── Helper: Compute costDisplay for an entity ──────────────────────────────
  function computeCostDisplay(budgetLines: Array<{ hasInvoice: boolean }>): CostDisplay {
    const allInvoiced = budgetLines.every((l) => l.hasInvoice);
    const someInvoiced = budgetLines.some((l) => l.hasInvoice);
    if (allInvoiced) return 'actual';
    if (someInvoiced) return 'mixed';
    return 'projected';
  }

  // ── Helper: Compute projectedMin/Max for a budget line ─────────────────────
  function computeLineProjected(
    plannedAmount: number,
    confidence: string,
    actualCost: number,
    hasInvoice: boolean,
  ): { min: number; max: number } {
    if (hasInvoice) {
      return { min: actualCost, max: actualCost };
    }
    const margin =
      CONFIDENCE_MARGINS[confidence as keyof typeof CONFIDENCE_MARGINS] ??
      CONFIDENCE_MARGINS.own_estimate;
    return {
      min: plannedAmount * (1 - margin),
      max: plannedAmount * (1 + margin),
    };
  }

  // ── Build Work Items Breakdown ─────────────────────────────────────────────

  // Group work item lines by (budgetCategoryId, categoryName, categoryColor, categorySortOrder)
  interface WIGroupKey {
    categoryId: string | null;
    categoryName: string;
    categoryColor: string | null;
    categorySortOrder: number | null;
  }

  interface WIGroup {
    key: WIGroupKey;
    lines: typeof workItemLineRows;
  }

  const wiGroups = new Map<string, WIGroup>();
  for (const line of workItemLineRows) {
    const key = `${line.budgetCategoryId}`;
    if (!wiGroups.has(key)) {
      wiGroups.set(key, {
        key: {
          categoryId: line.budgetCategoryId,
          categoryName: line.budgetCategoryId === null ? 'Uncategorized' : line.categoryName!,
          categoryColor: line.categoryColor,
          categorySortOrder: line.categorySortOrder,
        },
        lines: [],
      });
    }
    wiGroups.get(key)!.lines.push(line);
  }

  // Build per-work-item data within each category
  interface WIItemData {
    workItemId: string;
    title: string;
    lines: typeof workItemLineRows;
  }

  const wiWorkItemsByCategory = new Map<string, WIItemData[]>();
  for (const [categoryKey, group] of wiGroups) {
    const itemsInCategory = new Map<string, WIItemData>();
    for (const line of group.lines) {
      const itemKey = line.workItemId;
      if (!itemsInCategory.has(itemKey)) {
        itemsInCategory.set(itemKey, {
          workItemId: line.workItemId,
          title: line.workItemTitle,
          lines: [],
        });
      }
      itemsInCategory.get(itemKey)!.lines.push(line);
    }
    wiWorkItemsByCategory.set(categoryKey, Array.from(itemsInCategory.values()));
  }

  // Build work item categories with items
  const wiCategories: BreakdownWorkItemCategory[] = [];
  const wiTotals: BreakdownTotals = {
    projectedMin: 0,
    projectedMax: 0,
    actualCost: 0,
    subsidyPayback: 0,
    rawProjectedMin: 0,
    rawProjectedMax: 0,
    minSubsidyPayback: 0,
  };

  const wiCategoryArray = Array.from(wiGroups.values()).sort((a, b) => {
    // Sort by sort_order first, then by name
    if (a.key.categorySortOrder !== b.key.categorySortOrder) {
      return (a.key.categorySortOrder ?? Infinity) - (b.key.categorySortOrder ?? Infinity);
    }
    return a.key.categoryName.localeCompare(b.key.categoryName);
  });

  for (const group of wiCategoryArray) {
    const categoryKey = `${group.key.categoryId}`;
    const itemsInCategory = wiWorkItemsByCategory.get(categoryKey) || [];

    const categoryItems: BreakdownWorkItem[] = [];
    let categoryMin = 0;
    let categoryMax = 0;
    let categoryActual = 0;
    let categoryPayback = 0;
    let categoryRawMin = 0;
    let categoryRawMax = 0;
    let categoryMinPayback = 0;

    for (const itemData of itemsInCategory) {
      // Build budget lines for this work item
      const itemBudgetLines = itemData.lines.map((line) => {
        const actualCost = wiLineInvoiceMap.get(line.budgetLineId) ?? 0;
        return {
          id: line.budgetLineId,
          description: line.description,
          plannedAmount: line.plannedAmount,
          confidence: line.confidence as ConfidenceLevel,
          actualCost,
          hasInvoice: wiLineInvoiceMap.has(line.budgetLineId),
        };
      });

      // Compute projected min/max for this item
      let itemMin = 0;
      let itemMax = 0;
      let itemActual = 0;

      for (const budgetLine of itemBudgetLines) {
        const { min, max } = computeLineProjected(
          budgetLine.plannedAmount,
          budgetLine.confidence,
          budgetLine.actualCost,
          budgetLine.hasInvoice,
        );
        itemMin += min;
        itemMax += max;
        itemActual += budgetLine.actualCost;
      }

      // Store raw (pre-subsidy) projected costs
      const itemRawMin = itemMin;
      const itemRawMax = itemMax;

      // Apply subsidy reduction to this item
      const itemSubsidyPayback = computeEntitySubsidyPayback(
        itemData.workItemId,
        itemData.lines.map((line) => ({
          id: line.budgetLineId,
          plannedAmount: line.plannedAmount,
          confidence: line.confidence,
          budgetCategoryId: line.budgetCategoryId,
        })),
        wiLineInvoiceMap,
        false, // Use max margin (existing behavior)
      );

      const itemMinSubsidyPayback = computeEntitySubsidyPayback(
        itemData.workItemId,
        itemData.lines.map((line) => ({
          id: line.budgetLineId,
          plannedAmount: line.plannedAmount,
          confidence: line.confidence,
          budgetCategoryId: line.budgetCategoryId,
        })),
        wiLineInvoiceMap,
        true, // Use min margin
      );

      // Apply subsidy reduction to item totals
      const subsidyReduction = itemSubsidyPayback;
      const adjustedMin = Math.max(0, itemMin - subsidyReduction);
      const adjustedMax = Math.max(0, itemMax - subsidyReduction);

      const costDisplay = computeCostDisplay(itemBudgetLines);

      const item: BreakdownWorkItem = {
        workItemId: itemData.workItemId,
        title: itemData.title,
        projectedMin: adjustedMin,
        projectedMax: adjustedMax,
        actualCost: itemActual,
        subsidyPayback: itemSubsidyPayback,
        rawProjectedMin: itemRawMin,
        rawProjectedMax: itemRawMax,
        minSubsidyPayback: itemMinSubsidyPayback,
        costDisplay,
        budgetLines: itemBudgetLines,
      };

      categoryItems.push(item);
      categoryMin += adjustedMin;
      categoryMax += adjustedMax;
      categoryActual += itemActual;
      categoryPayback += itemSubsidyPayback;
      categoryRawMin += itemRawMin;
      categoryRawMax += itemRawMax;
      categoryMinPayback += itemMinSubsidyPayback;
    }

    const category: BreakdownWorkItemCategory = {
      categoryId: group.key.categoryId,
      categoryName: group.key.categoryName,
      categoryColor: group.key.categoryColor,
      projectedMin: categoryMin,
      projectedMax: categoryMax,
      actualCost: categoryActual,
      subsidyPayback: categoryPayback,
      rawProjectedMin: categoryRawMin,
      rawProjectedMax: categoryRawMax,
      minSubsidyPayback: categoryMinPayback,
      items: categoryItems,
    };

    wiCategories.push(category);
    wiTotals.projectedMin += categoryMin;
    wiTotals.projectedMax += categoryMax;
    wiTotals.actualCost += categoryActual;
    wiTotals.subsidyPayback += categoryPayback;
    wiTotals.rawProjectedMin += categoryRawMin;
    wiTotals.rawProjectedMax += categoryRawMax;
    wiTotals.minSubsidyPayback += categoryMinPayback;
  }

  // ── Build Household Items Breakdown ────────────────────────────────────────

  // Group HI lines by category
  interface HIGroup {
    category: HouseholdItemCategory;
    lines: typeof hiLineRows;
  }

  const hiGroups = new Map<HouseholdItemCategory, HIGroup>();
  for (const line of hiLineRows) {
    if (!hiGroups.has(line.hiCategory)) {
      hiGroups.set(line.hiCategory, {
        category: line.hiCategory,
        lines: [],
      });
    }
    hiGroups.get(line.hiCategory)!.lines.push(line);
  }

  // Build per-household-item data within each category
  interface HIItemData {
    householdItemId: string;
    name: string;
    lines: typeof hiLineRows;
  }

  const hiItemsByCategory = new Map<HouseholdItemCategory, HIItemData[]>();
  for (const [category, group] of hiGroups) {
    const itemsInCategory = new Map<string, HIItemData>();
    for (const line of group.lines) {
      const itemKey = line.householdItemId;
      if (!itemsInCategory.has(itemKey)) {
        itemsInCategory.set(itemKey, {
          householdItemId: line.householdItemId,
          name: line.itemName,
          lines: [],
        });
      }
      itemsInCategory.get(itemKey)!.lines.push(line);
    }
    hiItemsByCategory.set(category, Array.from(itemsInCategory.values()));
  }

  // Build household item categories with items (only include categories with items)
  const hiCategories: BreakdownHouseholdItemCategory[] = [];
  const hiTotals: BreakdownTotals = {
    projectedMin: 0,
    projectedMax: 0,
    actualCost: 0,
    subsidyPayback: 0,
    rawProjectedMin: 0,
    rawProjectedMax: 0,
    minSubsidyPayback: 0,
  };

  for (const category of HI_CATEGORY_ORDER) {
    if (!hiGroups.has(category)) {
      continue; // Skip categories with no items
    }

    const itemsInCategory = hiItemsByCategory.get(category) || [];

    const categoryItems: BreakdownHouseholdItem[] = [];
    let categoryMin = 0;
    let categoryMax = 0;
    let categoryActual = 0;
    let categoryPayback = 0;
    let categoryRawMin = 0;
    let categoryRawMax = 0;
    let categoryMinPayback = 0;

    for (const itemData of itemsInCategory) {
      // Build budget lines for this household item
      const itemBudgetLines = itemData.lines.map((line) => {
        const actualCost = hiLineInvoiceMap.get(line.budgetLineId) ?? 0;
        return {
          id: line.budgetLineId,
          description: line.description,
          plannedAmount: line.plannedAmount,
          confidence: line.confidence as ConfidenceLevel,
          actualCost,
          hasInvoice: hiLineInvoiceMap.has(line.budgetLineId),
        };
      });

      // Compute projected min/max for this item
      let itemMin = 0;
      let itemMax = 0;
      let itemActual = 0;

      for (const budgetLine of itemBudgetLines) {
        const { min, max } = computeLineProjected(
          budgetLine.plannedAmount,
          budgetLine.confidence,
          budgetLine.actualCost,
          budgetLine.hasInvoice,
        );
        itemMin += min;
        itemMax += max;
        itemActual += budgetLine.actualCost;
      }

      // Store raw (pre-subsidy) projected costs
      const itemRawMin = itemMin;
      const itemRawMax = itemMax;

      // Apply subsidy reduction to this item
      const itemSubsidyPayback = computeEntitySubsidyPayback(
        itemData.householdItemId,
        itemData.lines.map((line) => ({
          id: line.budgetLineId,
          plannedAmount: line.plannedAmount,
          confidence: line.confidence,
          budgetCategoryId: line.budgetCategoryId,
        })),
        hiLineInvoiceMap,
        false, // Use max margin (existing behavior)
      );

      const itemMinSubsidyPayback = computeEntitySubsidyPayback(
        itemData.householdItemId,
        itemData.lines.map((line) => ({
          id: line.budgetLineId,
          plannedAmount: line.plannedAmount,
          confidence: line.confidence,
          budgetCategoryId: line.budgetCategoryId,
        })),
        hiLineInvoiceMap,
        true, // Use min margin
      );

      // Apply subsidy reduction to item totals
      const subsidyReduction = itemSubsidyPayback;
      const adjustedMin = Math.max(0, itemMin - subsidyReduction);
      const adjustedMax = Math.max(0, itemMax - subsidyReduction);

      const costDisplay = computeCostDisplay(itemBudgetLines);

      const item: BreakdownHouseholdItem = {
        householdItemId: itemData.householdItemId,
        name: itemData.name,
        projectedMin: adjustedMin,
        projectedMax: adjustedMax,
        actualCost: itemActual,
        subsidyPayback: itemSubsidyPayback,
        rawProjectedMin: itemRawMin,
        rawProjectedMax: itemRawMax,
        minSubsidyPayback: itemMinSubsidyPayback,
        costDisplay,
        budgetLines: itemBudgetLines,
      };

      categoryItems.push(item);
      categoryMin += adjustedMin;
      categoryMax += adjustedMax;
      categoryActual += itemActual;
      categoryPayback += itemSubsidyPayback;
      categoryRawMin += itemRawMin;
      categoryRawMax += itemRawMax;
      categoryMinPayback += itemMinSubsidyPayback;
    }

    const hiCategory: BreakdownHouseholdItemCategory = {
      hiCategory: category,
      projectedMin: categoryMin,
      projectedMax: categoryMax,
      actualCost: categoryActual,
      subsidyPayback: categoryPayback,
      rawProjectedMin: categoryRawMin,
      rawProjectedMax: categoryRawMax,
      minSubsidyPayback: categoryMinPayback,
      items: categoryItems,
    };

    hiCategories.push(hiCategory);
    hiTotals.projectedMin += categoryMin;
    hiTotals.projectedMax += categoryMax;
    hiTotals.actualCost += categoryActual;
    hiTotals.subsidyPayback += categoryPayback;
    hiTotals.rawProjectedMin += categoryRawMin;
    hiTotals.rawProjectedMax += categoryRawMax;
    hiTotals.minSubsidyPayback += categoryMinPayback;
  }

  return {
    workItems: {
      categories: wiCategories,
      totals: wiTotals,
    },
    householdItems: {
      categories: hiCategories,
      totals: hiTotals,
    },
  };
}
