import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import {
  CONFIDENCE_MARGINS,
  type ConfidenceLevel,
  effectivePlannedAmount,
} from '@cornerstone/shared';
import type {
  BudgetBreakdown,
  BreakdownArea,
  BreakdownWorkItem,
  BreakdownHouseholdItem,
  BreakdownTotals,
  CostDisplay,
  SubsidyAdjustment,
  BudgetSourceSummaryBreakdown,
} from '@cornerstone/shared';
import { getDescendantIds } from './areaService.js';
import {
  computeDepositAwareAggregates,
  type DepositAwareRow,
} from './shared/depositAggregateUtils.js';
import { computeMoney, itemKey, toMajor, zeroScen } from './shared/moneyEngine.js';
import { getBreakdownMoney, loadMoneyInput } from './moneyService.js';

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
 * Grant paybacks come from the money service (ADR-039, #2228): per item the counted
 * (approved/received) grant share, `subsidyPayback` in the worst scenario and
 * `minSubsidyPayback` in the best scenario, computed on the filtered line set.
 *
 * @param db Database instance
 * @param deselectedSources Set of budget source IDs (and/or literal 'unassigned') to exclude
 *   from filtering. Empty set = no filtering (backward compatible, AC #1/#2).
 *   Filter applies BEFORE aggregation and subsidy engine (AC #3/#4/#6/#7).
 *   Per-source projections are ALWAYS unfiltered (architect decision A).
 *   Per-source payback is pro-rata attributed from filtered engine run (architect decision B).
 */
export function getBudgetBreakdown(
  db: DbType,
  vatRate: number,
  deselectedSources: Set<string> = new Set(),
): BudgetBreakdown {
  // ─── Library Adoption Opportunity: SQLite percentile functions ────────────
  //
  // See budgetOverviewService.ts for full details. In the breakdown context,
  // percentile functions could power:
  //
  //   Median cost per area (for heatmap or outlier badges):
  //     SELECT area_id,
  //            percentile_cont(0.5) WITHIN GROUP (ORDER BY planned_amount) AS median_planned
  //     FROM work_item_budgets wib
  //     JOIN work_items wi ON wi.id = wib.work_item_id
  //     GROUP BY wi.area_id
  //
  //   P90 invoice amount per budget category (flagging unusually large invoices):
  //     SELECT wib.budget_category_id,
  //            percentile_disc(0.9) WITHIN GROUP (ORDER BY ibl.itemized_amount) AS p90_amount
  //     FROM invoice_budget_lines ibl
  //     JOIN work_item_budgets wib ON wib.id = ibl.work_item_budget_id
  //     WHERE ibl.work_item_budget_id IS NOT NULL
  //     GROUP BY wib.budget_category_id
  //
  // These are NOT currently implemented (no caller exists). Filed for visibility
  // per issue #1571 (better-sqlite3 12.10.0 library adoption).
  // ─────────────────────────────────────────────────────────────────────────
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
    budgetSourceId: string | null;
    origin: string;
    includesVat: number | null;
  }>(
    sql`SELECT
      wi.id                  AS workItemId,
      wi.title               AS workItemTitle,
      wi.area_id             AS areaId,
      wib.id                 AS budgetLineId,
      wib.description        AS description,
      wib.planned_amount     AS plannedAmount,
      wib.confidence         AS confidence,
      wib.budget_category_id AS budgetCategoryId,
      wib.budget_source_id   AS budgetSourceId,
      wib.origin             AS origin,
      wib.includes_vat       AS includesVat
    FROM work_items wi
    INNER JOIN work_item_budgets wib ON wib.work_item_id = wi.id
    ORDER BY wi.area_id ASC, wi.title ASC`,
  );

  // ── 2. Query B: Invoice aggregates per WI budget line (deposit-aware) ───────
  // Fetch raw rows with invoice_deposits LEFT JOIN for deposit-aware aggregation
  const wiLineDepositRows = db.all<{
    budgetLineId: string;
    ibl_id: string;
    itemized_amount: number;
    invoice_id: string;
    invoice_amount: number;
    invoice_status: string;
    deposit_id: string | null;
    deposit_amount: number | null;
    deposit_status: string | null;
    deposit_entry_type: string | null;
  }>(
    sql`SELECT
      ibl.work_item_budget_id  AS budgetLineId,
      ibl.id                   AS ibl_id,
      ibl.itemized_amount      AS itemized_amount,
      i.id                     AS invoice_id,
      i.amount                 AS invoice_amount,
      i.status                 AS invoice_status,
      id.id                    AS deposit_id,
      id.amount                AS deposit_amount,
      id.status                AS deposit_status,
      id.entry_type            AS deposit_entry_type
    FROM invoice_budget_lines ibl
    INNER JOIN invoices i ON i.id = ibl.invoice_id
    LEFT JOIN invoice_deposits id ON id.invoice_id = i.id
    WHERE ibl.work_item_budget_id IS NOT NULL`,
  );

  // Group by budgetLineId and compute deposit-aware aggregates
  const wiLinesByBudgetLine = new Map<string, DepositAwareRow[]>();
  for (const row of wiLineDepositRows) {
    const key = row.budgetLineId;
    const arr = wiLinesByBudgetLine.get(key) ?? [];
    arr.push(row);
    wiLinesByBudgetLine.set(key, arr);
  }

  const wiLineInvoiceMap = new Map<
    string,
    {
      actualCost: number;
      actualCostPaid: number;
      actualCostPending: number;
      isQuotation: boolean;
    }
  >();

  for (const [budgetLineId, rows] of wiLinesByBudgetLine) {
    const agg = computeDepositAwareAggregates(rows);
    // A budget line is a quotation if ALL linked invoices are quotations
    const isQuotation = rows.every((r) => r.invoice_status === 'quotation');
    wiLineInvoiceMap.set(budgetLineId, {
      actualCost: agg.actualCost,
      actualCostPaid: agg.actualCostPaid,
      actualCostPending: agg.actualCost - agg.actualCostPaid,
      isQuotation,
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
    budgetSourceId: string | null;
    origin: string;
    includesVat: number | null;
  }>(
    sql`SELECT
      hi.id                     AS householdItemId,
      hi.name                   AS itemName,
      hi.area_id                AS areaId,
      hib.id                    AS budgetLineId,
      hib.description           AS description,
      hib.planned_amount        AS plannedAmount,
      hib.confidence            AS confidence,
      hib.budget_category_id    AS budgetCategoryId,
      hib.budget_source_id      AS budgetSourceId,
      hib.origin                AS origin,
      hib.includes_vat          AS includesVat
    FROM household_items hi
    INNER JOIN household_item_budgets hib ON hib.household_item_id = hi.id
    ORDER BY hi.area_id ASC, hi.name ASC`,
  );

  // ── 4. Query D: Invoice aggregates per HI budget line (deposit-aware) ────────
  // Fetch raw rows with invoice_deposits LEFT JOIN for deposit-aware aggregation
  const hiLineDepositRows = db.all<{
    budgetLineId: string;
    ibl_id: string;
    itemized_amount: number;
    invoice_id: string;
    invoice_amount: number;
    invoice_status: string;
    deposit_id: string | null;
    deposit_amount: number | null;
    deposit_status: string | null;
    deposit_entry_type: string | null;
  }>(
    sql`SELECT
      ibl.household_item_budget_id AS budgetLineId,
      ibl.id                       AS ibl_id,
      ibl.itemized_amount          AS itemized_amount,
      i.id                         AS invoice_id,
      i.amount                     AS invoice_amount,
      i.status                     AS invoice_status,
      id.id                        AS deposit_id,
      id.amount                    AS deposit_amount,
      id.status                    AS deposit_status,
      id.entry_type                AS deposit_entry_type
    FROM invoice_budget_lines ibl
    INNER JOIN invoices i ON i.id = ibl.invoice_id
    LEFT JOIN invoice_deposits id ON id.invoice_id = i.id
    WHERE ibl.household_item_budget_id IS NOT NULL`,
  );

  // Group by budgetLineId and compute deposit-aware aggregates
  const hiLinesByBudgetLine = new Map<string, DepositAwareRow[]>();
  for (const row of hiLineDepositRows) {
    const key = row.budgetLineId;
    const arr = hiLinesByBudgetLine.get(key) ?? [];
    arr.push(row);
    hiLinesByBudgetLine.set(key, arr);
  }

  const hiLineInvoiceMap = new Map<
    string,
    {
      actualCost: number;
      actualCostPaid: number;
      actualCostPending: number;
      isQuotation: boolean;
    }
  >();

  for (const [budgetLineId, rows] of hiLinesByBudgetLine) {
    const agg = computeDepositAwareAggregates(rows);
    // A budget line is a quotation if ALL linked invoices are quotations
    const isQuotation = rows.every((r) => r.invoice_status === 'quotation');
    hiLineInvoiceMap.set(budgetLineId, {
      actualCost: agg.actualCost,
      actualCostPaid: agg.actualCostPaid,
      actualCostPending: agg.actualCost - agg.actualCostPaid,
      isQuotation,
    });
  }

  // ── 4.5. Apply source filter to line rows ────────────────────────────────────
  // A line is excluded if its budgetSourceId matches a deselected source UUID,
  // or if its budgetSourceId is null and 'unassigned' is in deselectedSources.
  // Unknown UUIDs in deselectedSources are silently ignored.
  function isLineFiltered(budgetSourceId: string | null): boolean {
    if (budgetSourceId === null) return deselectedSources.has('unassigned');
    return deselectedSources.has(budgetSourceId);
  }

  const filteredWiLineRows = workItemLineRows.filter((r) => !isLineFiltered(r.budgetSourceId));
  const filteredHiLineRows = hiLineRows.filter((r) => !isLineFiltered(r.budgetSourceId));

  // ── 5. Money service runs (ADR-039) ────────────────────────────────────────
  // The engine input is loaded once and run twice: unfiltered (the response's `money`, same as
  // the overview's) and over the filtered line set (legacy grant fields). The filter applies
  // BEFORE the grant engine, so grants are recomputed on the surviving lines, capped and spread.
  const moneyInput = loadMoneyInput(db, vatRate);
  const unfilteredMoney = computeMoney(moneyInput);
  const filteredMoney =
    deselectedSources.size === 0
      ? unfilteredMoney
      : computeMoney(moneyInput, { includeLine: (line) => !isLineFiltered(line.budgetSourceId) });

  // VAT helper: convert stored net amount to effective amount if VAT not included
  // SQLite returns 0/1 for boolean, so includesVat === 0 means false (VAT should be applied)
  const effective = (l: { plannedAmount: number; includesVat: number | null }): number =>
    effectivePlannedAmount(
      { plannedAmount: l.plannedAmount, includesVat: l.includesVat !== 0 },
      vatRate,
    );

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
  function buildAreaBreakdown<TItem>(
    entityItems: Map<string | null, TItem[]>,
    allAreaRows: Array<{
      id: string;
      name: string;
      parentId: string | null;
      color: string | null;
      sortOrder: number;
    }>,
    sumItemTotals: (items: TItem[]) => {
      projectedMin: number;
      projectedMax: number;
      actualCost: number;
      actualCostPaid: number;
      actualCostPending: number;
      subsidyPayback: number;
      rawProjectedMin: number;
      rawProjectedMax: number;
      minSubsidyPayback: number;
    },
  ): { areas: BreakdownArea<TItem>[]; totals: BreakdownTotals } {
    // Build a map of areaId -> area metadata for quick lookup
    const areaMap = new Map<string, (typeof allAreaRows)[0]>();
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
      let rolledActualPaid = 0;
      let rolledActualPending = 0;
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
        rolledActualPaid += totals.actualCostPaid;
        rolledActualPending += totals.actualCostPending;
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
        actualCostPaid: rolledActualPaid,
        actualCostPending: rolledActualPending,
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
        actualCostPaid: unassignedTotals.actualCostPaid,
        actualCostPending: unassignedTotals.actualCostPending,
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
    let totalActualPaid = 0;
    let totalActualPending = 0;
    let totalPayback = 0;
    let totalRawMin = 0;
    let totalRawMax = 0;
    let totalMinPayback = 0;

    for (const items of entityItems.values()) {
      const totals = sumItemTotals(items);
      totalMin += totals.projectedMin;
      totalMax += totals.projectedMax;
      totalActual += totals.actualCost;
      totalActualPaid += totals.actualCostPaid;
      totalActualPending += totals.actualCostPending;
      totalPayback += totals.subsidyPayback;
      totalRawMin += totals.rawProjectedMin;
      totalRawMax += totals.rawProjectedMax;
      totalMinPayback += totals.minSubsidyPayback;
    }

    const totals: BreakdownTotals = {
      projectedMin: totalMin,
      projectedMax: totalMax,
      actualCost: totalActual,
      actualCostPaid: totalActualPaid,
      actualCostPending: totalActualPending,
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

  for (const row of filteredWiLineRows) {
    // Get or create entity entry
    let item = wiEntityData.get(row.workItemId);
    if (!item) {
      item = {
        workItemId: row.workItemId,
        title: row.workItemTitle,
        projectedMin: 0,
        projectedMax: 0,
        actualCost: 0,
        actualCostPaid: 0,
        actualCostPending: 0,
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
    const actualCostPaid = invoiceData?.actualCostPaid ?? 0;
    const actualCostPending = invoiceData?.actualCostPending ?? 0;
    const isQuotation = invoiceData?.isQuotation ?? false;
    const { min, max } = computeLineProjected(
      effective(row),
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
      actualCostPaid,
      actualCostPending,
      hasInvoice: wiLineInvoiceMap.has(row.budgetLineId),
      isQuotation,
      budgetSourceId: row.budgetSourceId ?? null,
      origin: (row.origin === 'auto' ? 'auto' : 'manual') as 'manual' | 'auto',
    });

    item.projectedMin += min;
    item.projectedMax += max;
    item.actualCost += actualCost;
    item.actualCostPaid += actualCostPaid;
    item.actualCostPending += actualCostPending;
    const { min: rawMin, max: rawMax } = computeLineProjected(
      effective(row),
      row.confidence,
      actualCost,
      wiLineInvoiceMap.has(row.budgetLineId),
      isQuotation,
    );
    item.rawProjectedMin += rawMin;
    item.rawProjectedMax += rawMax;
  }

  // Apply subsidy payback and cost display
  for (const item of wiEntityData.values()) {
    const share =
      filteredMoney.items.get(itemKey('work_item', item.workItemId))?.grants ?? zeroScen();
    const subsidyPayback = toMajor(share.worst);
    const minSubsidyPayback = toMajor(share.best);

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
  for (const row of filteredWiLineRows) {
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
  const allAreas = db.all<{
    id: string;
    name: string;
    parentId: string | null;
    color: string | null;
    sortOrder: number;
  }>(
    sql`SELECT id, name, parent_id AS parentId, color, sort_order AS sortOrder
    FROM areas
    ORDER BY sort_order ASC, name ASC`,
  );

  const { areas: wiAreas, totals: wiTotals } = buildAreaBreakdown(
    wiByArea,
    allAreas,
    (items: BreakdownWorkItem[]) => {
      let min = 0,
        max = 0,
        actual = 0,
        actualPaid = 0,
        actualPending = 0,
        payback = 0,
        rawMin = 0,
        rawMax = 0,
        minPayback = 0;
      for (const item of items) {
        min += item.projectedMin;
        max += item.projectedMax;
        actual += item.actualCost;
        actualPaid += item.actualCostPaid;
        actualPending += item.actualCostPending;
        payback += item.subsidyPayback;
        rawMin += item.rawProjectedMin;
        rawMax += item.rawProjectedMax;
        minPayback += item.minSubsidyPayback;
      }
      return {
        projectedMin: min,
        projectedMax: max,
        actualCost: actual,
        actualCostPaid: actualPaid,
        actualCostPending: actualPending,
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

  for (const row of filteredHiLineRows) {
    // Get or create entity entry
    let item = hiEntityData.get(row.householdItemId);
    if (!item) {
      item = {
        householdItemId: row.householdItemId,
        name: row.itemName,
        projectedMin: 0,
        projectedMax: 0,
        actualCost: 0,
        actualCostPaid: 0,
        actualCostPending: 0,
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
    const actualCostPaid = invoiceData?.actualCostPaid ?? 0;
    const actualCostPending = invoiceData?.actualCostPending ?? 0;
    const isQuotation = invoiceData?.isQuotation ?? false;
    const { min, max } = computeLineProjected(
      effective(row),
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
      actualCostPaid,
      actualCostPending,
      hasInvoice: hiLineInvoiceMap.has(row.budgetLineId),
      isQuotation,
      budgetSourceId: row.budgetSourceId ?? null,
      origin: (row.origin === 'auto' ? 'auto' : 'manual') as 'manual' | 'auto',
    });

    item.projectedMin += min;
    item.projectedMax += max;
    item.actualCost += actualCost;
    item.actualCostPaid += actualCostPaid;
    item.actualCostPending += actualCostPending;
    const { min: rawMin, max: rawMax } = computeLineProjected(
      effective(row),
      row.confidence,
      actualCost,
      hiLineInvoiceMap.has(row.budgetLineId),
      isQuotation,
    );
    item.rawProjectedMin += rawMin;
    item.rawProjectedMax += rawMax;
  }

  // Apply subsidy payback and cost display
  for (const item of hiEntityData.values()) {
    const share =
      filteredMoney.items.get(itemKey('household_item', item.householdItemId))?.grants ??
      zeroScen();
    const subsidyPayback = toMajor(share.worst);
    const minSubsidyPayback = toMajor(share.best);

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
  for (const row of filteredHiLineRows) {
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
      let min = 0,
        max = 0,
        actual = 0,
        actualPaid = 0,
        actualPending = 0,
        payback = 0,
        rawMin = 0,
        rawMax = 0,
        minPayback = 0;
      for (const item of items) {
        min += item.projectedMin;
        max += item.projectedMax;
        actual += item.actualCost;
        actualPaid += item.actualCostPaid;
        actualPending += item.actualCostPending;
        payback += item.subsidyPayback;
        rawMin += item.rawProjectedMin;
        rawMax += item.rawProjectedMax;
        minPayback += item.minSubsidyPayback;
      }
      return {
        projectedMin: min,
        projectedMax: max,
        actualCost: actual,
        actualCostPaid: actualPaid,
        actualCostPending: actualPending,
        subsidyPayback: payback,
        rawProjectedMin: rawMin,
        rawProjectedMax: rawMax,
        minSubsidyPayback: minPayback,
      };
    },
  );

  // ── Subsidy adjustments: capped grants of the filtered run (ADR-039) ─────────
  const subsidyAdjustments: SubsidyAdjustment[] = filteredMoney.grants
    .filter((g) => g.capped)
    .map((g) => ({
      subsidyProgramId: g.input.id,
      name: g.input.name,
      maximumAmount: g.input.maximumAmount ?? 0,
      maxPayout: toMajor(g.payout.worst),
      minExcess: toMajor(Math.max(0, g.uncapped.best - g.payout.best)),
      maxExcess: toMajor(g.uncapped.worst - g.payout.worst),
    }));

  // ── Aggregate per-source projectedMin/Max for the budgetSources array ────────
  // Query budget source metadata
  const budgetSourceRows = db.all<{
    id: string;
    name: string;
    totalAmount: number;
  }>(sql`SELECT id, name, total_amount AS totalAmount FROM budget_sources ORDER BY name ASC`);

  const budgetSourceMetaMap = new Map(budgetSourceRows.map((r) => [r.id, r]));

  // ── Accumulate per-source projected totals — ALWAYS UNFILTERED (architect decision A) ──
  // We iterate the original (unfiltered) line rows so deselected sources still reflect
  // their full contribution in the budgetSources[] array.
  const sourceProjectedMap = new Map<
    string,
    {
      name: string;
      totalAmount: number;
      min: number;
      max: number;
      actualCost: number;
      actualCostPaid: number;
      actualCostPending: number;
    }
  >();

  // ── Iterate UNFILTERED WI line rows for per-source projections ──
  for (const row of workItemLineRows) {
    const sid = row.budgetSourceId;
    if (sid === null) continue; // unassigned source handled separately below
    const invoiceData = wiLineInvoiceMap.get(row.budgetLineId);
    const actualCost = invoiceData?.actualCost ?? 0;
    const actualCostPaid = invoiceData?.actualCostPaid ?? 0;
    const actualCostPending = invoiceData?.actualCostPending ?? 0;
    const isQuotation = invoiceData?.isQuotation ?? false;
    const { min, max } = computeLineProjected(
      effective(row),
      row.confidence,
      actualCost,
      wiLineInvoiceMap.has(row.budgetLineId),
      isQuotation,
    );
    const existing = sourceProjectedMap.get(sid);
    if (existing) {
      existing.min += min;
      existing.max += max;
      existing.actualCost += actualCost;
      existing.actualCostPaid += actualCostPaid;
      existing.actualCostPending += actualCostPending;
    } else {
      const meta = budgetSourceMetaMap.get(sid);
      if (meta) {
        sourceProjectedMap.set(sid, {
          name: meta.name,
          totalAmount: meta.totalAmount,
          min,
          max,
          actualCost,
          actualCostPaid,
          actualCostPending,
        });
      }
    }
  }

  // ── Iterate UNFILTERED HI line rows for per-source projections ──
  for (const row of hiLineRows) {
    const sid = row.budgetSourceId;
    if (sid === null) continue;
    const invoiceData = hiLineInvoiceMap.get(row.budgetLineId);
    const actualCost = invoiceData?.actualCost ?? 0;
    const actualCostPaid = invoiceData?.actualCostPaid ?? 0;
    const actualCostPending = invoiceData?.actualCostPending ?? 0;
    const isQuotation = invoiceData?.isQuotation ?? false;
    const { min, max } = computeLineProjected(
      effective(row),
      row.confidence,
      actualCost,
      hiLineInvoiceMap.has(row.budgetLineId),
      isQuotation,
    );
    const existing = sourceProjectedMap.get(sid);
    if (existing) {
      existing.min += min;
      existing.max += max;
      existing.actualCost += actualCost;
      existing.actualCostPaid += actualCostPaid;
      existing.actualCostPending += actualCostPending;
    } else {
      const meta = budgetSourceMetaMap.get(sid);
      if (meta) {
        sourceProjectedMap.set(sid, {
          name: meta.name,
          totalAmount: meta.totalAmount,
          min,
          max,
          actualCost,
          actualCostPaid,
          actualCostPending,
        });
      }
    }
  }

  // ── Compute unassigned projected totals from UNFILTERED rows ──
  let unassignedProjMin = 0;
  let unassignedProjMax = 0;
  let unassignedActualCost = 0;
  let unassignedActualCostPaid = 0;
  let unassignedActualCostPending = 0;
  for (const row of workItemLineRows) {
    if (row.budgetSourceId !== null) continue;
    const invoiceData = wiLineInvoiceMap.get(row.budgetLineId);
    const actualCost = invoiceData?.actualCost ?? 0;
    const actualCostPaid = invoiceData?.actualCostPaid ?? 0;
    const actualCostPending = invoiceData?.actualCostPending ?? 0;
    const isQuotation = invoiceData?.isQuotation ?? false;
    const { min, max } = computeLineProjected(
      effective(row),
      row.confidence,
      actualCost,
      wiLineInvoiceMap.has(row.budgetLineId),
      isQuotation,
    );
    unassignedProjMin += min;
    unassignedProjMax += max;
    unassignedActualCost += actualCost;
    unassignedActualCostPaid += actualCostPaid;
    unassignedActualCostPending += actualCostPending;
  }
  for (const row of hiLineRows) {
    if (row.budgetSourceId !== null) continue;
    const invoiceData = hiLineInvoiceMap.get(row.budgetLineId);
    const actualCost = invoiceData?.actualCost ?? 0;
    const actualCostPaid = invoiceData?.actualCostPaid ?? 0;
    const actualCostPending = invoiceData?.actualCostPending ?? 0;
    const isQuotation = invoiceData?.isQuotation ?? false;
    const { min, max } = computeLineProjected(
      effective(row),
      row.confidence,
      actualCost,
      hiLineInvoiceMap.has(row.budgetLineId),
      isQuotation,
    );
    unassignedProjMin += min;
    unassignedProjMax += max;
    unassignedActualCost += actualCost;
    unassignedActualCostPaid += actualCostPaid;
    unassignedActualCostPending += actualCostPending;
  }
  const hasUnassignedLines = unassignedProjMin > 0 || unassignedProjMax > 0;

  // ── Per-source payback attribution (filtered run) ──
  // Σ best / worst counted line shares of the filtered run, bucketed by the line's budget
  // source ('unassigned' for lines without a source and for item-level shares).
  const sourcePaybackMap = new Map<string, { min: number; max: number }>();
  for (const [sourceKey, share] of filteredMoney.sourceGrants) {
    sourcePaybackMap.set(sourceKey, { min: toMajor(share.best), max: toMajor(share.worst) });
  }

  // ── Build budgetSources array with new shape ──
  // ALL configured sources always included, plus synthetic 'unassigned' when present.
  // projectedMin/Max = unfiltered per-source values (architect decision A).
  // subsidyPaybackMin/Max = pro-rata from filtered engine run (0 for deselected sources
  // since their lines don't feed the filtered engine and therefore don't appear in sourcePaybackMap).
  const budgetSources: BudgetSourceSummaryBreakdown[] = budgetSourceRows.map((r) => {
    const proj = sourceProjectedMap.get(r.id);
    const payback = sourcePaybackMap.get(r.id) ?? { min: 0, max: 0 };
    return {
      id: r.id,
      name: r.name,
      totalAmount: r.totalAmount,
      projectedMin: proj?.min ?? 0,
      projectedMax: proj?.max ?? 0,
      actualCost: proj?.actualCost ?? 0,
      actualCostPaid: proj?.actualCostPaid ?? 0,
      actualCostPending: proj?.actualCostPending ?? 0,
      subsidyPaybackMin: payback.min,
      subsidyPaybackMax: payback.max,
    };
  });

  // Synthetic 'unassigned' entry: always included when any unassigned lines exist
  if (hasUnassignedLines) {
    const unassignedPayback = sourcePaybackMap.get('unassigned') ?? { min: 0, max: 0 };
    budgetSources.unshift({
      id: 'unassigned',
      name: 'Unassigned',
      totalAmount: 0,
      projectedMin: unassignedProjMin,
      projectedMax: unassignedProjMax,
      actualCost: unassignedActualCost,
      actualCostPaid: unassignedActualCostPaid,
      actualCostPending: unassignedActualCostPending,
      subsidyPaybackMin: unassignedPayback.min,
      subsidyPaybackMax: unassignedPayback.max,
    });
  }

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
    budgetSources,
    money: getBreakdownMoney({ result: unfilteredMoney }),
  };
}
