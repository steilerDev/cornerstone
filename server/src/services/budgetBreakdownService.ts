import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { CONFIDENCE_MARGINS, type ConfidenceLevel } from '@cornerstone/shared';
import type {
  BudgetBreakdown,
  BreakdownWorkItemCategory,
  BreakdownHouseholdItemCategory,
  BreakdownWorkItem,
  BreakdownHouseholdItem,
  BreakdownTotals,
  CostDisplay,
  SubsidyAdjustment,
} from '@cornerstone/shared';
import { computeSubsidyEffects, applySubsidyCaps } from './shared/subsidyCalculationEngine.js';
import type { LinkedSubsidy, SubsidyCapMeta, PerSubsidyTotals } from './shared/subsidyCalculationEngine.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Get detailed budget breakdown by item and budget line.
 * Expands both work items and household items into per-line details.
 *
 * Groups work items by budget category (with 'Uncategorized' for null category).
 * Groups household items by household item category (with flexible, user-defined categories).
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
  // Track invoice status to determine if line is a quotation
  const wiLineInvoiceRows = db.all<{
    budgetLineId: string;
    actualCost: number;
    invoiceStatus: string;
  }>(
    sql`SELECT
      ibl.work_item_budget_id AS budgetLineId,
      COALESCE(SUM(ibl.itemized_amount), 0) AS actualCost,
      MAX(i.status) AS invoiceStatus
    FROM invoice_budget_lines ibl
    INNER JOIN invoices i ON i.id = ibl.invoice_id
    WHERE ibl.work_item_budget_id IS NOT NULL
    GROUP BY ibl.work_item_budget_id`,
  );

  const wiLineInvoiceMap = new Map<string, { actualCost: number; isQuotation: boolean }>();
  for (const row of wiLineInvoiceRows) {
    wiLineInvoiceMap.set(row.budgetLineId, {
      actualCost: row.actualCost,
      isQuotation: row.invoiceStatus === 'quotation',
    });
  }

  // ── 3. Query C: Household item budget lines with HI category ──────────────
  const hiLineRows = db.all<{
    householdItemId: string;
    itemName: string;
    hiCategoryId: string;
    hiCategoryName: string;
    hiCategoryColor: string | null;
    hiCategorySortOrder: number;
    budgetLineId: string;
    description: string | null;
    plannedAmount: number;
    confidence: string;
    budgetCategoryId: string | null;
  }>(
    sql`SELECT
      hi.id                     AS householdItemId,
      hi.name                   AS itemName,
      hi.category_id            AS hiCategoryId,
      hic.name                  AS hiCategoryName,
      hic.color                 AS hiCategoryColor,
      hic.sort_order            AS hiCategorySortOrder,
      hib.id                    AS budgetLineId,
      hib.description           AS description,
      hib.planned_amount        AS plannedAmount,
      hib.confidence            AS confidence,
      hib.budget_category_id    AS budgetCategoryId
    FROM household_items hi
    INNER JOIN household_item_budgets hib ON hib.household_item_id = hi.id
    INNER JOIN household_item_categories hic ON hi.category_id = hic.id
    ORDER BY hic.sort_order ASC, hic.name ASC, hi.name ASC`,
  );

  // ── 4. Query D: Invoice aggregates per HI budget line ────────────────────
  // Track invoice status to determine if line is a quotation
  const hiLineInvoiceRows = db.all<{
    budgetLineId: string;
    actualCost: number;
    invoiceStatus: string;
  }>(
    sql`SELECT
      ibl.household_item_budget_id AS budgetLineId,
      COALESCE(SUM(ibl.itemized_amount), 0) AS actualCost,
      MAX(i.status) AS invoiceStatus
    FROM invoice_budget_lines ibl
    INNER JOIN invoices i ON i.id = ibl.invoice_id
    WHERE ibl.household_item_budget_id IS NOT NULL
    GROUP BY ibl.household_item_budget_id`,
  );

  const hiLineInvoiceMap = new Map<string, { actualCost: number; isQuotation: boolean }>();
  for (const row of hiLineInvoiceRows) {
    hiLineInvoiceMap.set(row.budgetLineId, {
      actualCost: row.actualCost,
      isQuotation: row.invoiceStatus === 'quotation',
    });
  }

  // ── 5. Queries E/F/G/H: Subsidy data (same pattern as budgetOverviewService) ──
  const subsidyRows = db.all<{
    subsidyId: string;
    name: string;
    reductionType: string;
    reductionValue: number;
    maximumAmount: number | null;
  }>(
    sql`SELECT
      id              AS subsidyId,
      name            AS name,
      reduction_type  AS reductionType,
      reduction_value AS reductionValue,
      maximum_amount  AS maximumAmount
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
    invoiceMap: Map<string, number | { actualCost: number; isQuotation: boolean }>,
    useMinMargin: boolean = false,
  ): number {
    const linkedSubsidyIds = entitySubsidyMap.get(entityId);
    if (!linkedSubsidyIds || linkedSubsidyIds.size === 0) {
      return 0;
    }

    // Build engine inputs from the entity's budget lines
    const engineLines = budgetLines.map((line) => ({
      id: line.id,
      budgetCategoryId: line.budgetCategoryId,
      plannedAmount: line.plannedAmount,
      confidence: line.confidence,
    }));

    const engineSubsidies: LinkedSubsidy[] = [];
    for (const subsidyId of linkedSubsidyIds) {
      const meta = subsidyMeta.get(subsidyId);
      if (!meta) continue;
      engineSubsidies.push({
        subsidyProgramId: subsidyId,
        name: subsidyId,
        reductionType: meta.reductionType as 'percentage' | 'fixed',
        reductionValue: meta.reductionValue,
      });
    }

    if (useMinMargin) {
      // For min margin: create a custom invoice map that adjusts all lines by min margin
      const minInvoiceMap = new Map<string, number>();
      for (const line of budgetLines) {
        const invoiceData = invoiceMap.get(line.id);
        if (invoiceData !== undefined) {
          const cost = typeof invoiceData === 'number' ? invoiceData : invoiceData.actualCost;
          minInvoiceMap.set(line.id, cost);
        } else {
          const margin =
            CONFIDENCE_MARGINS[line.confidence as keyof typeof CONFIDENCE_MARGINS] ??
            CONFIDENCE_MARGINS.own_estimate;
          minInvoiceMap.set(line.id, line.plannedAmount * (1 - margin));
        }
      }
      const { minTotalPayback } = computeSubsidyEffects(
        engineLines,
        engineSubsidies,
        subsidyCategoryMap,
        minInvoiceMap,
      );
      return minTotalPayback;
    } else {
      // For max margin: use the provided invoice map as-is (which uses max margin or actual cost)
      const { maxTotalPayback } = computeSubsidyEffects(
        engineLines,
        engineSubsidies,
        subsidyCategoryMap,
        invoiceMap,
      );
      return maxTotalPayback;
    }
  }

  // ── Helper: Compute costDisplay for an entity ──────────────────────────────
  function computeCostDisplay(
    budgetLines: Array<{ hasInvoice: boolean; isQuotation: boolean }>,
  ): CostDisplay {
    const hasActualInvoice = budgetLines.some((l) => l.hasInvoice && !l.isQuotation);
    const hasQuotationInvoice = budgetLines.some((l) => l.hasInvoice && l.isQuotation);
    const hasNoInvoice = budgetLines.some((l) => !l.hasInvoice);

    // No invoices at all
    if (!hasActualInvoice && !hasQuotationInvoice) return 'projected';
    // All lines have quotation invoices
    if (hasQuotationInvoice && !hasActualInvoice && !hasNoInvoice) return 'quoted';
    // All lines have actual (non-quotation) invoices
    if (hasActualInvoice && !hasQuotationInvoice && !hasNoInvoice) return 'actual';
    // Any mix → mixed
    return 'mixed';
  }

  // ── Helper: Compute projectedMin/Max for a budget line ─────────────────────
  function computeLineProjected(
    plannedAmount: number,
    confidence: string,
    actualCost: number,
    hasInvoice: boolean,
    isQuotation: boolean = false,
  ): { min: number; max: number } {
    if (hasInvoice) {
      if (isQuotation) {
        // Quotation invoices use ±5% margin around itemized amount
        return { min: actualCost * 0.95, max: actualCost * 1.05 };
      }
      // Non-quotation invoices: actual cost is fixed
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

  // ── Generic entity breakdown builder ──────────────────────────────────────────
  interface EntityRow {
    budgetLineId: string;
    description: string | null;
    plannedAmount: number;
    confidence: string;
    budgetCategoryId: string | null;
  }

  interface EntityBreakdownConfig<TRow extends EntityRow, TItem, TCategory> {
    rows: TRow[];
    invoiceMap: Map<string, { actualCost: number; isQuotation: boolean }>;
    getCategoryKey: (row: TRow) => string;
    getCategoryMeta: (row: TRow) => {
      categoryId: string | null;
      categoryName: string;
      categoryColor: string | null;
      categorySortOrder: number | null;
    };
    getEntityKey: (row: TRow) => string;
    getEntityMeta: (row: TRow) => { entityId: string; entityLabel: string };
    buildItem: (
      entityMeta: { entityId: string; entityLabel: string },
      computed: {
        projectedMin: number;
        projectedMax: number;
        actualCost: number;
        subsidyPayback: number;
        rawProjectedMin: number;
        rawProjectedMax: number;
        minSubsidyPayback: number;
        costDisplay: CostDisplay;
        budgetLines: Array<{
          id: string;
          description: string | null;
          plannedAmount: number;
          confidence: ConfidenceLevel;
          actualCost: number;
          hasInvoice: boolean;
          isQuotation: boolean;
        }>;
      },
    ) => TItem;
    buildCategory: (
      categoryMeta: {
        categoryId: string | null;
        categoryName: string;
        categoryColor: string | null;
        categorySortOrder: number | null;
      },
      totals: {
        projectedMin: number;
        projectedMax: number;
        actualCost: number;
        subsidyPayback: number;
        rawProjectedMin: number;
        rawProjectedMax: number;
        minSubsidyPayback: number;
      },
      items: TItem[],
    ) => TCategory;
  }

  function buildEntityBreakdown<TRow extends EntityRow, TItem, TCategory>(
    config: EntityBreakdownConfig<TRow, TItem, TCategory>,
  ): { categories: TCategory[]; totals: BreakdownTotals } {
    // Group rows by category key
    interface Group {
      categoryMeta: {
        categoryId: string | null;
        categoryName: string;
        categoryColor: string | null;
        categorySortOrder: number | null;
      };
      lines: TRow[];
    }

    const groups = new Map<string, Group>();
    for (const line of config.rows) {
      const categoryKey = config.getCategoryKey(line);
      if (!groups.has(categoryKey)) {
        groups.set(categoryKey, {
          categoryMeta: config.getCategoryMeta(line),
          lines: [],
        });
      }
      groups.get(categoryKey)!.lines.push(line);
    }

    // Build per-entity data within each category
    interface ItemData {
      entityId: string;
      entityLabel: string;
      lines: TRow[];
    }

    const itemsByCategory = new Map<string, ItemData[]>();
    for (const [categoryKey, group] of groups) {
      const itemsInCategory = new Map<string, ItemData>();
      for (const line of group.lines) {
        const itemKey = config.getEntityKey(line);
        if (!itemsInCategory.has(itemKey)) {
          const entityMeta = config.getEntityMeta(line);
          itemsInCategory.set(itemKey, {
            entityId: entityMeta.entityId,
            entityLabel: entityMeta.entityLabel,
            lines: [],
          });
        }
        itemsInCategory.get(itemKey)!.lines.push(line);
      }
      itemsByCategory.set(categoryKey, Array.from(itemsInCategory.values()));
    }

    // Build categories with items
    const categories: TCategory[] = [];
    const totals: BreakdownTotals = {
      projectedMin: 0,
      projectedMax: 0,
      actualCost: 0,
      subsidyPayback: 0,
      rawProjectedMin: 0,
      rawProjectedMax: 0,
      minSubsidyPayback: 0,
    };

    const categoryArray = Array.from(groups.values()).sort((a, b) => {
      // Sort by sort_order first, then by name
      if (a.categoryMeta.categorySortOrder !== b.categoryMeta.categorySortOrder) {
        return (
          (a.categoryMeta.categorySortOrder ?? Infinity) -
          (b.categoryMeta.categorySortOrder ?? Infinity)
        );
      }
      return a.categoryMeta.categoryName.localeCompare(b.categoryMeta.categoryName);
    });

    for (const group of categoryArray) {
      const categoryKey = config.getCategoryKey(group.lines[0]);
      const itemsInCategory = itemsByCategory.get(categoryKey) || [];

      const categoryItems: TItem[] = [];
      let categoryMin = 0;
      let categoryMax = 0;
      let categoryActual = 0;
      let categoryPayback = 0;
      let categoryRawMin = 0;
      let categoryRawMax = 0;
      let categoryMinPayback = 0;

      for (const itemData of itemsInCategory) {
        // Build budget lines for this entity
        const itemBudgetLines = itemData.lines.map((line) => {
          const invoiceData = config.invoiceMap.get(line.budgetLineId);
          const actualCost = invoiceData?.actualCost ?? 0;
          const isQuotation = invoiceData?.isQuotation ?? false;
          return {
            id: line.budgetLineId,
            description: line.description,
            plannedAmount: line.plannedAmount,
            confidence: line.confidence as ConfidenceLevel,
            actualCost,
            hasInvoice: config.invoiceMap.has(line.budgetLineId),
            isQuotation,
          };
        });

        // Compute projected min/max for this entity
        let itemMin = 0;
        let itemMax = 0;
        let itemActual = 0;

        for (const budgetLine of itemBudgetLines) {
          const { min, max } = computeLineProjected(
            budgetLine.plannedAmount,
            budgetLine.confidence,
            budgetLine.actualCost,
            budgetLine.hasInvoice,
            budgetLine.isQuotation,
          );
          itemMin += min;
          itemMax += max;
          itemActual += budgetLine.actualCost;
        }

        // Store raw (pre-subsidy) projected costs
        const itemRawMin = itemMin;
        const itemRawMax = itemMax;

        // Apply subsidy reduction to this entity
        const itemSubsidyPayback = computeEntitySubsidyPayback(
          itemData.entityId,
          itemData.lines.map((line) => ({
            id: line.budgetLineId,
            plannedAmount: line.plannedAmount,
            confidence: line.confidence,
            budgetCategoryId: line.budgetCategoryId,
          })),
          config.invoiceMap,
          false, // Use max margin (existing behavior)
        );

        const itemMinSubsidyPayback = computeEntitySubsidyPayback(
          itemData.entityId,
          itemData.lines.map((line) => ({
            id: line.budgetLineId,
            plannedAmount: line.plannedAmount,
            confidence: line.confidence,
            budgetCategoryId: line.budgetCategoryId,
          })),
          config.invoiceMap,
          true, // Use min margin
        );

        // Apply subsidy reduction to entity totals
        const subsidyReduction = itemSubsidyPayback;
        const adjustedMin = Math.max(0, itemMin - subsidyReduction);
        const adjustedMax = Math.max(0, itemMax - subsidyReduction);

        const costDisplay = computeCostDisplay(itemBudgetLines);

        const item = config.buildItem(
          { entityId: itemData.entityId, entityLabel: itemData.entityLabel },
          {
            projectedMin: adjustedMin,
            projectedMax: adjustedMax,
            actualCost: itemActual,
            subsidyPayback: itemSubsidyPayback,
            rawProjectedMin: itemRawMin,
            rawProjectedMax: itemRawMax,
            minSubsidyPayback: itemMinSubsidyPayback,
            costDisplay,
            budgetLines: itemBudgetLines,
          },
        );

        categoryItems.push(item);
        categoryMin += adjustedMin;
        categoryMax += adjustedMax;
        categoryActual += itemActual;
        categoryPayback += itemSubsidyPayback;
        categoryRawMin += itemRawMin;
        categoryRawMax += itemRawMax;
        categoryMinPayback += itemMinSubsidyPayback;
      }

      const category = config.buildCategory(
        group.categoryMeta,
        {
          projectedMin: categoryMin,
          projectedMax: categoryMax,
          actualCost: categoryActual,
          subsidyPayback: categoryPayback,
          rawProjectedMin: categoryRawMin,
          rawProjectedMax: categoryRawMax,
          minSubsidyPayback: categoryMinPayback,
        },
        categoryItems,
      );

      categories.push(category);
      totals.projectedMin += categoryMin;
      totals.projectedMax += categoryMax;
      totals.actualCost += categoryActual;
      totals.subsidyPayback += categoryPayback;
      totals.rawProjectedMin += categoryRawMin;
      totals.rawProjectedMax += categoryRawMax;
      totals.minSubsidyPayback += categoryMinPayback;
    }

    return { categories, totals };
  }

  // ── Build Work Items Breakdown ─────────────────────────────────────────────
  const { categories: wiCategories, totals: wiTotals } = buildEntityBreakdown<
    (typeof workItemLineRows)[number],
    BreakdownWorkItem,
    BreakdownWorkItemCategory
  >({
    rows: workItemLineRows,
    invoiceMap: wiLineInvoiceMap,
    getCategoryKey: (row) => `${row.budgetCategoryId}`,
    getCategoryMeta: (row) => ({
      categoryId: row.budgetCategoryId,
      categoryName: row.budgetCategoryId === null ? 'Uncategorized' : row.categoryName!,
      categoryColor: row.categoryColor,
      categorySortOrder: row.categorySortOrder,
    }),
    getEntityKey: (row) => row.workItemId,
    getEntityMeta: (row) => ({ entityId: row.workItemId, entityLabel: row.workItemTitle }),
    buildItem: (meta, computed) => ({
      workItemId: meta.entityId,
      title: meta.entityLabel,
      ...computed,
    }),
    buildCategory: (catMeta, totals, items) => ({
      categoryId: catMeta.categoryId,
      categoryName: catMeta.categoryName,
      categoryColor: catMeta.categoryColor,
      ...totals,
      items,
    }),
  });

  // ── Build Household Items Breakdown ────────────────────────────────────────
  const { categories: hiCategories, totals: hiTotals } = buildEntityBreakdown<
    (typeof hiLineRows)[number],
    BreakdownHouseholdItem,
    BreakdownHouseholdItemCategory
  >({
    rows: hiLineRows,
    invoiceMap: hiLineInvoiceMap,
    getCategoryKey: (row) => row.hiCategoryId,
    getCategoryMeta: (row) => ({
      categoryId: row.hiCategoryId,
      categoryName: row.hiCategoryName,
      categoryColor: row.hiCategoryColor ?? null,
      categorySortOrder: row.hiCategorySortOrder,
    }),
    getEntityKey: (row) => row.householdItemId,
    getEntityMeta: (row) => ({ entityId: row.householdItemId, entityLabel: row.itemName }),
    buildItem: (meta, computed) => ({
      householdItemId: meta.entityId,
      name: meta.entityLabel,
      ...computed,
    }),
    buildCategory: (catMeta, totals, items) => ({
      hiCategory: catMeta.categoryName,
      ...totals,
      items,
    }),
  });

  // ── Aggregate per-subsidy payback totals for cap enforcement ─────────────────
  // Track per-subsidy totals across all entities (both WI and HI)
  const perSubsidyPayback = new Map<string, { min: number; max: number }>();

  // Re-iterate all entities to collect per-subsidy payback
  const allEntityLines = new Map<string, Array<{
    id: string;
    plannedAmount: number;
    confidence: string;
    budgetCategoryId: string | null;
  }>>();

  for (const row of workItemLineRows) {
    let arr = allEntityLines.get(row.workItemId);
    if (!arr) {
      arr = [];
      allEntityLines.set(row.workItemId, arr);
    }
    arr.push({
      id: row.budgetLineId,
      plannedAmount: row.plannedAmount,
      confidence: row.confidence,
      budgetCategoryId: row.budgetCategoryId,
    });
  }

  for (const row of hiLineRows) {
    let arr = allEntityLines.get(row.householdItemId);
    if (!arr) {
      arr = [];
      allEntityLines.set(row.householdItemId, arr);
    }
    arr.push({
      id: row.budgetLineId,
      plannedAmount: row.plannedAmount,
      confidence: row.confidence,
      budgetCategoryId: row.budgetCategoryId,
    });
  }

  for (const [entityId, linkedSubsidyIds] of entitySubsidyMap) {
    const entityLines = allEntityLines.get(entityId) ?? [];
    const engineLines = entityLines.map((line) => ({
      id: line.id,
      budgetCategoryId: line.budgetCategoryId,
      plannedAmount: line.plannedAmount,
      confidence: line.confidence,
    }));

    const engineSubsidies: LinkedSubsidy[] = [];
    for (const subsidyId of linkedSubsidyIds) {
      const meta = subsidyMeta.get(subsidyId);
      if (!meta) continue;
      engineSubsidies.push({
        subsidyProgramId: subsidyId,
        name: subsidyId,
        reductionType: meta.reductionType as 'percentage' | 'fixed',
        reductionValue: meta.reductionValue,
      });
    }

    // Use combined invoice map for the entity
    const combinedInvoiceMap = new Map<string, number>([...wiLineInvoiceMap, ...hiLineInvoiceMap]);

    const { subsidies: entityEffects } = computeSubsidyEffects(
      engineLines,
      engineSubsidies,
      subsidyCategoryMap,
      combinedInvoiceMap,
    );

    for (const effect of entityEffects) {
      const existing = perSubsidyPayback.get(effect.subsidyProgramId);
      if (existing) {
        existing.min += effect.minPayback;
        existing.max += effect.maxPayback;
      } else {
        perSubsidyPayback.set(effect.subsidyProgramId, {
          min: effect.minPayback,
          max: effect.maxPayback,
        });
      }
    }
  }

  const perSubsidyTotals: PerSubsidyTotals[] = [];
  for (const [subsidyProgramId, totals] of perSubsidyPayback) {
    perSubsidyTotals.push({
      subsidyProgramId,
      uncappedMinPayback: totals.min,
      uncappedMaxPayback: totals.max,
    });
  }

  const subsidyCapMeta: SubsidyCapMeta[] = subsidyRows.map((row) => ({
    subsidyProgramId: row.subsidyId,
    name: row.name,
    reductionType: row.reductionType as 'percentage' | 'fixed',
    reductionValue: row.reductionValue,
    maximumAmount: row.maximumAmount,
  }));

  const capResult = applySubsidyCaps(perSubsidyTotals, subsidyCapMeta);

  const subsidyAdjustments: SubsidyAdjustment[] = capResult.oversubscribedSubsidies.map((s) => ({
    subsidyProgramId: s.subsidyProgramId,
    name: s.name,
    maximumAmount: s.maximumAmount,
    maxPayout: s.maxPayout,
    minExcess: s.minExcess,
    maxExcess: s.maxExcess,
  }));

  return {
    workItems: {
      categories: wiCategories,
      totals: wiTotals,
    },
    householdItems: {
      categories: hiCategories,
      totals: hiTotals,
    },
    subsidyAdjustments,
  };
}
