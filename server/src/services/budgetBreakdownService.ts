import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { CONFIDENCE_MARGINS, type ConfidenceLevel } from '@cornerstone/shared';
import type {
  BudgetBreakdown,
  BreakdownArea,
  BreakdownWorkItem,
  BreakdownHouseholdItem,
  BreakdownTotals,
  CostDisplay,
  SubsidyAdjustment,
} from '@cornerstone/shared';
import { computeSubsidyEffects, applySubsidyCaps } from './shared/subsidyCalculationEngine.js';
import { getDescendantIds } from './areaService.js';
import type {
  LinkedSubsidy,
  SubsidyCapMeta,
  PerSubsidyTotals,
} from './shared/subsidyCalculationEngine.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Get detailed budget breakdown by item and budget line.
 * Expands both work items and household items into per-line details.
 *
 * Groups work items by area hierarchy (with synthetic 'Unassigned' for null area).
 * Groups household items by area hierarchy.
 *
 * For each item:
 * - If all budget lines are invoiced: costDisplay='actual', show actualCost only
 * - If no budget lines are invoiced: costDisplay='projected', show projectedMin–projectedMax
 * - If mixed: costDisplay='mixed', show both
 *
 * Applies subsidy payback per entity using the same logic as budgetOverviewService.
 */
export function getBudgetBreakdown(db: DbType): BudgetBreakdown {
  // ── 1. Query A: Work item budget lines with area assignment ──────────────
  const workItemLineRows = db.all<{
    workItemId: string;
    workItemTitle: string;
    areaId: string | null;
    budgetLineId: string;
    description: string | null;
    plannedAmount: number;
    confidence: string;
    budgetCategoryId: string | null;
  }>(
    sql`SELECT
      wi.id                  AS workItemId,
      wi.title               AS workItemTitle,
      wi.area_id             AS areaId,
      wib.id                 AS budgetLineId,
      wib.description        AS description,
      wib.planned_amount     AS plannedAmount,
      wib.confidence         AS confidence,
      wib.budget_category_id AS budgetCategoryId
    FROM work_items wi
    INNER JOIN work_item_budgets wib ON wib.work_item_id = wi.id
    ORDER BY wi.area_id ASC, wi.title ASC`,
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

  // ── 3. Query C: Household item budget lines with area assignment ──────────────
  const hiLineRows = db.all<{
    householdItemId: string;
    itemName: string;
    areaId: string | null;
    budgetLineId: string;
    description: string | null;
    plannedAmount: number;
    confidence: string;
    budgetCategoryId: string | null;
  }>(
    sql`SELECT
      hi.id                     AS householdItemId,
      hi.name                   AS itemName,
      hi.area_id                AS areaId,
      hib.id                    AS budgetLineId,
      hib.description           AS description,
      hib.planned_amount        AS plannedAmount,
      hib.confidence            AS confidence,
      hib.budget_category_id    AS budgetCategoryId
    FROM household_items hi
    INNER JOIN household_item_budgets hib ON hib.household_item_id = hi.id
    ORDER BY hi.area_id ASC, hi.name ASC`,
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
    invoiceMap: Map<string, { actualCost: number; isQuotation: boolean }>,
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

  // ── Build hierarchical area breakdown ──────────────────────────────────────
  interface EntityData<TItem> {
    items: TItem[];
    projectedMin: number;
    projectedMax: number;
    actualCost: number;
    subsidyPayback: number;
    rawProjectedMin: number;
    rawProjectedMax: number;
    minSubsidyPayback: number;
  }

  function buildAreaBreakdown<TItem>(
    entityItems: Map<string | null, TItem[]>,
    allAreaRows: Array<{ id: string; name: string; parentId: string | null; color: string | null; sortOrder: number }>,
    sumItemTotals: (items: TItem[]) => {
      projectedMin: number;
      projectedMax: number;
      actualCost: number;
      subsidyPayback: number;
      rawProjectedMin: number;
      rawProjectedMax: number;
      minSubsidyPayback: number;
    },
  ): { areas: BreakdownArea<TItem>[]; totals: BreakdownTotals } {
    // Build a map of areaId -> area metadata for quick lookup
    const areaMap = new Map<string, typeof allAreaRows[0]>();
    for (const area of allAreaRows) {
      areaMap.set(area.id, area);
    }

    // Helper: recursively build an area node and its children
    function buildAreaNode(areaId: string): BreakdownArea<TItem> | null {
      const areaMeta = areaMap.get(areaId);
      if (!areaMeta) return null;

      // Get items directly assigned to this area
      const directItems = entityItems.get(areaId) ?? [];

      // Find and build all child areas
      const childAreas: BreakdownArea<TItem>[] = [];
      for (const childId of allAreaRows
        .filter((a) => a.parentId === areaId)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
        .map((a) => a.id)) {
        const childNode = buildAreaNode(childId);
        if (childNode !== null) {
          childAreas.push(childNode);
        }
      }

      // Get all descendant IDs for rolled-up totals
      const descendantIds = getDescendantIds(db, areaId);

      // Compute rolled-up totals across all items in the subtree
      let rolledMin = 0;
      let rolledMax = 0;
      let rolledActual = 0;
      let rolledPayback = 0;
      let rolledRawMin = 0;
      let rolledRawMax = 0;
      let rolledMinPayback = 0;

      for (const descId of descendantIds) {
        const itemsForDescendant = entityItems.get(descId) ?? [];
        const totals = sumItemTotals(itemsForDescendant);
        rolledMin += totals.projectedMin;
        rolledMax += totals.projectedMax;
        rolledActual += totals.actualCost;
        rolledPayback += totals.subsidyPayback;
        rolledRawMin += totals.rawProjectedMin;
        rolledRawMax += totals.rawProjectedMax;
        rolledMinPayback += totals.minSubsidyPayback;
      }

      // Prune: if subtree has zero items, return null
      if (
        directItems.length === 0 &&
        childAreas.length === 0 &&
        rolledMin === 0 &&
        rolledMax === 0 &&
        rolledActual === 0
      ) {
        return null;
      }

      return {
        areaId,
        name: areaMeta.name,
        parentId: areaMeta.parentId,
        color: areaMeta.color,
        projectedMin: rolledMin,
        projectedMax: rolledMax,
        actualCost: rolledActual,
        subsidyPayback: rolledPayback,
        rawProjectedMin: rolledRawMin,
        rawProjectedMax: rolledRawMax,
        minSubsidyPayback: rolledMinPayback,
        items: directItems,
        children: childAreas,
      };
    }

    // Build root nodes and collect them
    const areas: BreakdownArea<TItem>[] = [];
    const rootAreas = allAreaRows
      .filter((a) => a.parentId === null)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

    for (const rootArea of rootAreas) {
      const node = buildAreaNode(rootArea.id);
      if (node !== null) {
        areas.push(node);
      }
    }

    // Create synthetic "Unassigned" node if there are items with null areaId
    const unassignedItems = entityItems.get(null) ?? [];
    if (unassignedItems.length > 0) {
      const unassignedTotals = sumItemTotals(unassignedItems);
      areas.unshift({
        areaId: null,
        name: 'Unassigned',
        parentId: null,
        color: null,
        projectedMin: unassignedTotals.projectedMin,
        projectedMax: unassignedTotals.projectedMax,
        actualCost: unassignedTotals.actualCost,
        subsidyPayback: unassignedTotals.subsidyPayback,
        rawProjectedMin: unassignedTotals.rawProjectedMin,
        rawProjectedMax: unassignedTotals.rawProjectedMax,
        minSubsidyPayback: unassignedTotals.minSubsidyPayback,
        items: unassignedItems,
        children: [],
      });
    }

    // Global totals = sum across ALL items in entityItems
    let totalMin = 0;
    let totalMax = 0;
    let totalActual = 0;
    let totalPayback = 0;
    let totalRawMin = 0;
    let totalRawMax = 0;
    let totalMinPayback = 0;

    for (const items of entityItems.values()) {
      const totals = sumItemTotals(items);
      totalMin += totals.projectedMin;
      totalMax += totals.projectedMax;
      totalActual += totals.actualCost;
      totalPayback += totals.subsidyPayback;
      totalRawMin += totals.rawProjectedMin;
      totalRawMax += totals.rawProjectedMax;
      totalMinPayback += totals.minSubsidyPayback;
    }

    const totals: BreakdownTotals = {
      projectedMin: totalMin,
      projectedMax: totalMax,
      actualCost: totalActual,
      subsidyPayback: totalPayback,
      rawProjectedMin: totalRawMin,
      rawProjectedMax: totalRawMax,
      minSubsidyPayback: totalMinPayback,
    };

    return { areas, totals };
  }

  // ── Build Work Items Breakdown ─────────────────────────────────────────────

  // Group work items by areaId
  const wiByArea = new Map<string | null, BreakdownWorkItem[]>();
  const wiEntityData = new Map<string, BreakdownWorkItem>();

  for (const row of workItemLineRows) {
    // Get or create entity entry
    let item = wiEntityData.get(row.workItemId);
    if (!item) {
      item = {
        workItemId: row.workItemId,
        title: row.workItemTitle,
        projectedMin: 0,
        projectedMax: 0,
        actualCost: 0,
        subsidyPayback: 0,
        rawProjectedMin: 0,
        rawProjectedMax: 0,
        minSubsidyPayback: 0,
        costDisplay: 'projected',
        budgetLines: [],
      };
      wiEntityData.set(row.workItemId, item);
    }

    // Build budget line
    const invoiceData = wiLineInvoiceMap.get(row.budgetLineId);
    const actualCost = invoiceData?.actualCost ?? 0;
    const isQuotation = invoiceData?.isQuotation ?? false;
    const { min, max } = computeLineProjected(
      row.plannedAmount,
      row.confidence,
      actualCost,
      wiLineInvoiceMap.has(row.budgetLineId),
      isQuotation,
    );

    item.budgetLines.push({
      id: row.budgetLineId,
      description: row.description,
      plannedAmount: row.plannedAmount,
      confidence: row.confidence as ConfidenceLevel,
      actualCost,
      hasInvoice: wiLineInvoiceMap.has(row.budgetLineId),
      isQuotation,
    });

    item.projectedMin += min;
    item.projectedMax += max;
    item.actualCost += actualCost;
    item.rawProjectedMin += row.plannedAmount * (1 - (CONFIDENCE_MARGINS[row.confidence as keyof typeof CONFIDENCE_MARGINS] ?? CONFIDENCE_MARGINS.own_estimate));
    item.rawProjectedMax += row.plannedAmount * (1 + (CONFIDENCE_MARGINS[row.confidence as keyof typeof CONFIDENCE_MARGINS] ?? CONFIDENCE_MARGINS.own_estimate));
  }

  // Build budget category map for work items
  const wiBudgetLineCategoryMap = new Map<string, string | null>();
  for (const row of workItemLineRows) {
    wiBudgetLineCategoryMap.set(row.budgetLineId, row.budgetCategoryId);
  }

  // Apply subsidy payback and cost display
  for (const item of wiEntityData.values()) {
    const subsidyPayback = computeEntitySubsidyPayback(
      item.workItemId,
      item.budgetLines.map((bl) => ({
        id: bl.id,
        plannedAmount: bl.plannedAmount,
        confidence: bl.confidence,
        budgetCategoryId: wiBudgetLineCategoryMap.get(bl.id) ?? null,
      })),
      wiLineInvoiceMap,
      false,
    );
    const minSubsidyPayback = computeEntitySubsidyPayback(
      item.workItemId,
      item.budgetLines.map((bl) => ({
        id: bl.id,
        plannedAmount: bl.plannedAmount,
        confidence: bl.confidence,
        budgetCategoryId: wiBudgetLineCategoryMap.get(bl.id) ?? null,
      })),
      wiLineInvoiceMap,
      true,
    );

    item.subsidyPayback = subsidyPayback;
    item.minSubsidyPayback = minSubsidyPayback;
    item.projectedMin = Math.max(0, item.projectedMin - subsidyPayback);
    item.projectedMax = Math.max(0, item.projectedMax - subsidyPayback);
    item.costDisplay = computeCostDisplay(item.budgetLines);
  }

  // Group work items into their assigned area buckets.
  // Dedup by areaId+workItemId so multiple budget-line rows for the same
  // item don't push it multiple times, while still allowing multiple distinct
  // items into the same area.
  const wiAddedToArea = new Set<string>();
  for (const row of workItemLineRows) {
    const item = wiEntityData.get(row.workItemId);
    if (!item) continue;
    const dedupeKey = `${row.areaId ?? 'null'}:${row.workItemId}`;
    if (wiAddedToArea.has(dedupeKey)) continue;
    wiAddedToArea.add(dedupeKey);
    const list = wiByArea.get(row.areaId) ?? [];
    if (!wiByArea.has(row.areaId)) wiByArea.set(row.areaId, list);
    list.push(item);
  }

  // Get all areas
  const allAreas = db.all<{ id: string; name: string; parentId: string | null; color: string | null; sortOrder: number }>(
    sql`SELECT id, name, parent_id AS parentId, color, sort_order AS sortOrder
    FROM areas
    ORDER BY sort_order ASC, name ASC`,
  );

  const { areas: wiAreas, totals: wiTotals } = buildAreaBreakdown(
    wiByArea,
    allAreas,
    (items: BreakdownWorkItem[]) => {
      let min = 0, max = 0, actual = 0, payback = 0, rawMin = 0, rawMax = 0, minPayback = 0;
      for (const item of items) {
        min += item.projectedMin;
        max += item.projectedMax;
        actual += item.actualCost;
        payback += item.subsidyPayback;
        rawMin += item.rawProjectedMin;
        rawMax += item.rawProjectedMax;
        minPayback += item.minSubsidyPayback;
      }
      return {
        projectedMin: min,
        projectedMax: max,
        actualCost: actual,
        subsidyPayback: payback,
        rawProjectedMin: rawMin,
        rawProjectedMax: rawMax,
        minSubsidyPayback: minPayback,
      };
    },
  );

  // ── Build Household Items Breakdown ────────────────────────────────────────

  // Group household items by areaId
  const hiByArea = new Map<string | null, BreakdownHouseholdItem[]>();
  const hiEntityData = new Map<string, BreakdownHouseholdItem>();

  for (const row of hiLineRows) {
    // Get or create entity entry
    let item = hiEntityData.get(row.householdItemId);
    if (!item) {
      item = {
        householdItemId: row.householdItemId,
        name: row.itemName,
        projectedMin: 0,
        projectedMax: 0,
        actualCost: 0,
        subsidyPayback: 0,
        rawProjectedMin: 0,
        rawProjectedMax: 0,
        minSubsidyPayback: 0,
        costDisplay: 'projected',
        budgetLines: [],
      };
      hiEntityData.set(row.householdItemId, item);
    }

    // Build budget line
    const invoiceData = hiLineInvoiceMap.get(row.budgetLineId);
    const actualCost = invoiceData?.actualCost ?? 0;
    const isQuotation = invoiceData?.isQuotation ?? false;
    const { min, max } = computeLineProjected(
      row.plannedAmount,
      row.confidence,
      actualCost,
      hiLineInvoiceMap.has(row.budgetLineId),
      isQuotation,
    );

    item.budgetLines.push({
      id: row.budgetLineId,
      description: row.description,
      plannedAmount: row.plannedAmount,
      confidence: row.confidence as ConfidenceLevel,
      actualCost,
      hasInvoice: hiLineInvoiceMap.has(row.budgetLineId),
      isQuotation,
    });

    item.projectedMin += min;
    item.projectedMax += max;
    item.actualCost += actualCost;
    item.rawProjectedMin += row.plannedAmount * (1 - (CONFIDENCE_MARGINS[row.confidence as keyof typeof CONFIDENCE_MARGINS] ?? CONFIDENCE_MARGINS.own_estimate));
    item.rawProjectedMax += row.plannedAmount * (1 + (CONFIDENCE_MARGINS[row.confidence as keyof typeof CONFIDENCE_MARGINS] ?? CONFIDENCE_MARGINS.own_estimate));
  }

  // Build budget category map for household items
  const hiBudgetLineCategoryMap = new Map<string, string | null>();
  for (const row of hiLineRows) {
    hiBudgetLineCategoryMap.set(row.budgetLineId, row.budgetCategoryId);
  }

  // Apply subsidy payback and cost display
  for (const item of hiEntityData.values()) {
    const subsidyPayback = computeEntitySubsidyPayback(
      item.householdItemId,
      item.budgetLines.map((bl) => ({
        id: bl.id,
        plannedAmount: bl.plannedAmount,
        confidence: bl.confidence,
        budgetCategoryId: hiBudgetLineCategoryMap.get(bl.id) ?? null,
      })),
      hiLineInvoiceMap,
      false,
    );
    const minSubsidyPayback = computeEntitySubsidyPayback(
      item.householdItemId,
      item.budgetLines.map((bl) => ({
        id: bl.id,
        plannedAmount: bl.plannedAmount,
        confidence: bl.confidence,
        budgetCategoryId: hiBudgetLineCategoryMap.get(bl.id) ?? null,
      })),
      hiLineInvoiceMap,
      true,
    );

    item.subsidyPayback = subsidyPayback;
    item.minSubsidyPayback = minSubsidyPayback;
    item.projectedMin = Math.max(0, item.projectedMin - subsidyPayback);
    item.projectedMax = Math.max(0, item.projectedMax - subsidyPayback);
    item.costDisplay = computeCostDisplay(item.budgetLines);
  }

  // Group household items into their assigned area buckets.
  // Dedup by areaId+householdItemId so multiple budget-line rows for the same
  // item don't push it multiple times, while still allowing multiple distinct
  // items into the same area.
  const hiAddedToArea = new Set<string>();
  for (const row of hiLineRows) {
    const item = hiEntityData.get(row.householdItemId);
    if (!item) continue;
    const dedupeKey = `${row.areaId ?? 'null'}:${row.householdItemId}`;
    if (hiAddedToArea.has(dedupeKey)) continue;
    hiAddedToArea.add(dedupeKey);
    const list = hiByArea.get(row.areaId) ?? [];
    if (!hiByArea.has(row.areaId)) hiByArea.set(row.areaId, list);
    list.push(item);
  }

  const { areas: hiAreas, totals: hiTotals } = buildAreaBreakdown(
    hiByArea,
    allAreas,
    (items: BreakdownHouseholdItem[]) => {
      let min = 0, max = 0, actual = 0, payback = 0, rawMin = 0, rawMax = 0, minPayback = 0;
      for (const item of items) {
        min += item.projectedMin;
        max += item.projectedMax;
        actual += item.actualCost;
        payback += item.subsidyPayback;
        rawMin += item.rawProjectedMin;
        rawMax += item.rawProjectedMax;
        minPayback += item.minSubsidyPayback;
      }
      return {
        projectedMin: min,
        projectedMax: max,
        actualCost: actual,
        subsidyPayback: payback,
        rawProjectedMin: rawMin,
        rawProjectedMax: rawMax,
        minSubsidyPayback: minPayback,
      };
    },
  );

  // ── Aggregate per-subsidy payback totals for cap enforcement ─────────────────
  const perSubsidyPayback = new Map<string, { min: number; max: number }>();

  // Re-iterate all entities to collect per-subsidy payback
  const allEntityLines = new Map<
    string,
    Array<{
      id: string;
      plannedAmount: number;
      confidence: string;
      budgetCategoryId: string | null;
    }>
  >();

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

  // Combined invoice map for subsidy effect calculations
  const combinedInvoiceMap = new Map<
    string,
    number | { actualCost: number; isQuotation: boolean }
  >();
  for (const [k, v] of wiLineInvoiceMap) combinedInvoiceMap.set(k, v);
  for (const [k, v] of hiLineInvoiceMap) combinedInvoiceMap.set(k, v);

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
      areas: wiAreas,
      totals: wiTotals,
    },
    householdItems: {
      areas: hiAreas,
      totals: hiTotals,
    },
    subsidyAdjustments,
  };
}
