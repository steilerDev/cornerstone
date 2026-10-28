/**
 * Money service (ADR-039, #2228): the one place every money figure comes from.
 *
 * `loadMoneyInput` reads the rows (one query per table, never per item) and hands them to the
 * pure engine (`shared/moneyEngine.ts`, integer cents). This module assembles the API shapes:
 * `MoneySummary` (project level), `BreakdownMoney` (per item), per-item grant payback and the
 * household-item grant map. Funding-source figures reuse the existing Rail A / Rail B helpers
 * and the bank report's draw-down set, so no second definition of "paid" or "ready to submit"
 * exists.
 *
 * Rule: a new money figure is added here (or in the engine), never computed in a route or in
 * another service.
 */

import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import type {
  BreakdownMoney,
  BudgetBreakdown,
  BudgetSourceStatus,
  FinancingGrant,
  FinancingResponse,
  FinancingSource,
  GrantCoveredItem,
  GrantCoveredItemsResponse,
  GrantMoney,
  InvoiceStatus,
  BudgetSourceType,
  MoneyCostFigures,
  MoneyGrantFigures,
  MoneySourceFigures,
  MoneySummary,
  SubsidyApplicationStatus,
  SubsidyPaybackEntry,
  SubsidyReductionType,
} from '@cornerstone/shared';
import { NotFoundError } from '../errors/AppError.js';
import { toCents } from './shared/money.js';
import { getAreaSummary, loadAreaMap } from './areaService.js';
import {
  computeOpenPaymentItems,
  type InvoiceDepositRow,
  type OpenPaymentItem,
  type OpenPaymentRow,
} from './shared/depositAggregateUtils.js';
import {
  computeMoney,
  computePayments,
  itemKey,
  toMajor,
  toMoneyRange,
  toOfferTotals,
  toRecordTotals,
  zeroScen,
  type CostGrantCents,
  type MoneyAreaInput,
  type MoneyGrantInput,
  type MoneyInput,
  type MoneyInvoiceInput,
  type MoneyItemInput,
  type MoneyItemKind,
  type MoneyLineInput,
  type MoneyResult,
  type Scen,
} from './shared/moneyEngine.js';
import { attributePayments, computeBreakdown, type LinkInput } from './shared/moneyBreakdown.js';
import { getSourcePaidAndSubmitted } from './budgetSourceService.js';
import { getDrawDownSet } from './sourceReportService.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

export interface ProjectMoney {
  input: MoneyInput;
  result: MoneyResult;
  summary: MoneySummary;
}

// ─── Input loading ───────────────────────────────────────────────────────────

export interface InvoiceLink extends LinkInput {
  invoiceStatus: InvoiceStatus;
}

/**
 * Every invoice link (`invoice_budget_lines`) with the status of its record, one query. A line
 * has at most one link (unique indexes), so `lineId` identifies the link.
 */
export function loadInvoiceLinks(db: Pick<DbType, 'all'>): InvoiceLink[] {
  const rows = db.all<{
    invoiceId: string;
    lineId: string;
    itemizedAmount: number;
    invoiceStatus: InvoiceStatus;
  }>(
    sql`SELECT
      ibl.invoice_id AS invoiceId,
      COALESCE(ibl.work_item_budget_id, ibl.household_item_budget_id) AS lineId,
      ibl.itemized_amount AS itemizedAmount,
      i.status AS invoiceStatus
    FROM invoice_budget_lines ibl
    INNER JOIN invoices i ON i.id = ibl.invoice_id`,
  );
  return rows.map((row) => ({
    invoiceId: row.invoiceId,
    lineId: row.lineId,
    itemizedCents: toCents(row.itemizedAmount),
    invoiceStatus: row.invoiceStatus,
  }));
}

/**
 * Reads everything the engine needs. One query per table: lines (work-item lines incl. orphans
 * plus household-item lines), invoice links, invoices, grants with categories and item links,
 * areas, items and the active funding total.
 */
export function loadMoneyInput(
  db: DbType,
  vatRate: number,
  links: InvoiceLink[] = loadInvoiceLinks(db),
): MoneyInput {
  // (ii) invoice links: per line itemized cents (at most one link row per line) and per invoice
  const itemizedByLine = new Map<string, number>();
  const itemizedByInvoice = new Map<string, number>();
  for (const link of links) {
    itemizedByLine.set(link.lineId, link.itemizedCents);
    itemizedByInvoice.set(
      link.invoiceId,
      (itemizedByInvoice.get(link.invoiceId) ?? 0) + link.itemizedCents,
    );
  }

  // (i) lines
  const lineRows = db.all<{
    id: string;
    kind: MoneyItemKind;
    itemId: string | null;
    budgetSourceId: string | null;
    budgetCategoryId: string | null;
    confidence: string;
    plannedAmount: number;
    includesVat: number | null;
  }>(
    sql`SELECT
      id                 AS id,
      'work_item'        AS kind,
      work_item_id       AS itemId,
      budget_source_id   AS budgetSourceId,
      budget_category_id AS budgetCategoryId,
      confidence         AS confidence,
      planned_amount     AS plannedAmount,
      includes_vat       AS includesVat
    FROM work_item_budgets
    UNION ALL
    SELECT
      id                 AS id,
      'household_item'   AS kind,
      household_item_id  AS itemId,
      budget_source_id   AS budgetSourceId,
      budget_category_id AS budgetCategoryId,
      confidence         AS confidence,
      planned_amount     AS plannedAmount,
      includes_vat       AS includesVat
    FROM household_item_budgets`,
  );
  const lines: MoneyLineInput[] = lineRows.map((row) => ({
    id: row.id,
    kind: row.kind,
    itemId: row.itemId,
    budgetSourceId: row.budgetSourceId,
    budgetCategoryId: row.budgetCategoryId,
    confidence: row.confidence,
    plannedAmount: row.plannedAmount,
    // A NULL includes_vat counts as gross
    includesVat: row.includesVat !== 0,
    itemizedCents: itemizedByLine.has(row.id) ? itemizedByLine.get(row.id)! : null,
  }));

  // items (area per item)
  const itemRows = db.all<{ kind: MoneyItemKind; id: string; areaId: string | null }>(
    sql`SELECT 'work_item' AS kind, id AS id, area_id AS areaId FROM work_items
    UNION ALL
    SELECT 'household_item' AS kind, id AS id, area_id AS areaId FROM household_items`,
  );
  const items: MoneyItemInput[] = itemRows;

  // (iii) invoices
  const invoiceRows = db.all<{ id: string; amount: number; status: string }>(
    sql`SELECT id AS id, amount AS amount, status AS status FROM invoices`,
  );
  const invoices: MoneyInvoiceInput[] = invoiceRows.map((row) => ({
    id: row.id,
    amount: row.amount,
    status: row.status,
    itemizedCents: itemizedByInvoice.get(row.id) ?? 0,
  }));

  // (iv) grants (non-rejected) with categories and linked items
  const grantRows = db.all<{
    id: string;
    name: string;
    status: SubsidyApplicationStatus;
    reductionType: SubsidyReductionType;
    reductionValue: number;
    maximumAmount: number | null;
    includesNoCategoryItems: number;
  }>(
    sql`SELECT
      id                         AS id,
      name                       AS name,
      application_status         AS status,
      reduction_type             AS reductionType,
      reduction_value            AS reductionValue,
      maximum_amount             AS maximumAmount,
      includes_no_category_items AS includesNoCategoryItems
    FROM subsidy_programs
    WHERE application_status != 'rejected'`,
  );
  const categoryRows = db.all<{ subsidyProgramId: string; budgetCategoryId: string }>(
    sql`SELECT subsidy_program_id AS subsidyProgramId, budget_category_id AS budgetCategoryId
    FROM subsidy_program_categories`,
  );
  const linkItemRows = db.all<{ subsidyProgramId: string; kind: MoneyItemKind; itemId: string }>(
    sql`SELECT subsidy_program_id AS subsidyProgramId, 'work_item' AS kind, work_item_id AS itemId
    FROM work_item_subsidies
    UNION ALL
    SELECT subsidy_program_id AS subsidyProgramId, 'household_item' AS kind, household_item_id AS itemId
    FROM household_item_subsidies`,
  );
  const categoriesByGrant = new Map<string, string[]>();
  for (const row of categoryRows) {
    const list = categoriesByGrant.get(row.subsidyProgramId) ?? [];
    list.push(row.budgetCategoryId);
    categoriesByGrant.set(row.subsidyProgramId, list);
  }
  const itemsByGrant = new Map<string, string[]>();
  for (const row of linkItemRows) {
    const list = itemsByGrant.get(row.subsidyProgramId) ?? [];
    list.push(itemKey(row.kind, row.itemId));
    itemsByGrant.set(row.subsidyProgramId, list);
  }
  const grants: MoneyGrantInput[] = grantRows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    reductionType: row.reductionType,
    reductionValue: row.reductionValue,
    maximumAmount: row.maximumAmount,
    includesNoCategoryItems: row.includesNoCategoryItems === 1,
    categoryIds: categoriesByGrant.get(row.id) ?? [],
    linkedItemKeys: itemsByGrant.get(row.id) ?? [],
  }));

  // (v) areas
  const areas = db.all<MoneyAreaInput>(
    sql`SELECT id AS id, parent_id AS parentId, sort_order AS sortOrder, name AS name FROM areas`,
  );

  // (vi) active funding
  const activeRows = db.all<{ totalAmount: number }>(
    sql`SELECT total_amount AS totalAmount FROM budget_sources WHERE status = 'active'`,
  );
  let fundingTotalCents = 0;
  for (const row of activeRows) fundingTotalCents += toCents(row.totalAmount);

  return {
    vatRate,
    lines,
    items,
    invoices,
    grants,
    areas,
    fundingTotalCents,
    activeSourceCount: activeRows.length,
  };
}

/** A deposit row that also carries the funding source the progress payment is tagged to. */
export interface TaggedDepositRow extends InvoiceDepositRow {
  deposit_budget_source_id: string | null;
}

/** (vii) invoices LEFT JOIN invoice_deposits over ALL invoices, for the payment figures. */
function loadDepositRows(db: DbType): TaggedDepositRow[] {
  return db.all<TaggedDepositRow>(
    sql`SELECT
      i.id         AS invoice_id,
      i.amount     AS invoice_amount,
      i.status     AS invoice_status,
      d.id         AS deposit_id,
      d.amount     AS deposit_amount,
      d.status     AS deposit_status,
      d.entry_type AS deposit_entry_type,
      d.budget_source_id AS deposit_budget_source_id
    FROM invoices i
    LEFT JOIN invoice_deposits d ON d.invoice_id = i.id`,
  );
}

/**
 * Every still-payable amount with its own due date (#2229, attention rules N4-N6): the
 * per-due-date decomposition of "still to pay". One query; Σ amounts = `summary.stillToPay`.
 */
export function listOpenPayments(db: Pick<DbType, 'all'>): OpenPaymentItem[] {
  const rows = db.all<OpenPaymentRow>(
    sql`SELECT
      i.id             AS invoice_id,
      i.amount         AS invoice_amount,
      i.status         AS invoice_status,
      i.date           AS invoice_date,
      i.due_date       AS invoice_due_date,
      i.invoice_number AS invoice_number,
      i.vendor_id      AS vendor_id,
      v.name           AS vendor_name,
      d.id             AS deposit_id,
      d.amount         AS deposit_amount,
      d.status         AS deposit_status,
      d.entry_type     AS deposit_entry_type,
      d.due_date       AS deposit_due_date
    FROM invoices i
    INNER JOIN vendors v ON v.id = i.vendor_id
    LEFT JOIN invoice_deposits d ON d.invoice_id = i.id`,
  );
  return computeOpenPaymentItems(rows);
}

// ─── Assembly ────────────────────────────────────────────────────────────────

function toCostFigures(figures: CostGrantCents): MoneyCostFigures {
  const afterGrants: Scen = {
    expected: figures.cost.expected - figures.grants.expected,
    best: figures.cost.best - figures.grants.best,
    worst: figures.cost.worst - figures.grants.worst,
  };
  return {
    expectedCost: toMoneyRange(figures.cost),
    expectedGrants: toMoneyRange(figures.grants),
    afterGrants: toMoneyRange(afterGrants),
  };
}

const LOAN_TYPES: ReadonlySet<string> = new Set(['bank_loan', 'credit_line']);

/** Ready to submit (ADR-039 §5): the bank report's draw-down set over bank_loan / credit_line sources. */
export function getReadyToSubmit(db: DbType): {
  count: number;
  amount: number;
  bySource: Map<string, { count: number; amount: number }>;
} {
  const rows = db.all<{ id: string; sourceType: string }>(
    sql`SELECT id AS id, source_type AS sourceType FROM budget_sources ORDER BY name ASC, id ASC`,
  );
  const bySource = new Map<string, { count: number; amount: number }>();
  const readyInvoiceIds = new Set<string>();
  let readyCents = 0;
  for (const row of rows) {
    if (!LOAN_TYPES.has(row.sourceType)) continue;
    const drawDown = getDrawDownSet(db, row.id);
    const positive = drawDown.invoices.filter((inv) => inv.amount > 0);
    for (const inv of positive) readyInvoiceIds.add(inv.invoiceId);
    readyCents += toCents(drawDown.totalAmount);
    bySource.set(row.id, { count: positive.length, amount: drawDown.totalAmount });
  }
  return { count: readyInvoiceIds.size, amount: toMajor(readyCents), bySource };
}

function buildSources(
  db: DbType,
  result: MoneyResult,
): { sources: MoneySourceFigures[]; readyToSubmit: { count: number; amount: number } } {
  const rows = db.all<{
    id: string;
    name: string;
    sourceType: BudgetSourceType;
    status: BudgetSourceStatus;
    isDiscretionary: number;
    totalAmount: number;
  }>(
    sql`SELECT
      id               AS id,
      name             AS name,
      source_type      AS sourceType,
      status           AS status,
      is_discretionary AS isDiscretionary,
      total_amount     AS totalAmount
    FROM budget_sources
    ORDER BY name ASC, id ASC`,
  );

  const allocatedBySource = new Map<string, number>();
  for (const line of result.lines) {
    if (line.budgetSourceId === null) continue;
    const cost = result.lineCost.get(line.id)!.expected;
    allocatedBySource.set(
      line.budgetSourceId,
      (allocatedBySource.get(line.budgetSourceId) ?? 0) + cost,
    );
  }

  const readyAll = getReadyToSubmit(db);

  const sources = rows.map((row): MoneySourceFigures => {
    const amountCents = toCents(row.totalAmount);
    const allocatedCents = allocatedBySource.get(row.id) ?? 0;
    const { paid, submitted } = getSourcePaidAndSubmitted(db, {
      id: row.id,
      isDiscretionary: row.isDiscretionary === 1,
    });

    const ready = readyAll.bySource.get(row.id) ?? { count: 0, amount: 0 };

    return {
      id: row.id,
      name: row.name,
      sourceType: row.sourceType,
      status: row.status,
      isDiscretionary: row.isDiscretionary === 1,
      amount: toMajor(amountCents),
      allocated: toMajor(allocatedCents),
      unallocated: toMajor(Math.max(0, amountCents - allocatedCents)),
      overAllocated: toMajor(Math.max(0, allocatedCents - amountCents)),
      paid: toMajor(toCents(paid)),
      submitted: toMajor(toCents(submitted)),
      readyToSubmit: ready,
    };
  });

  return { sources, readyToSubmit: { count: readyAll.count, amount: readyAll.amount } };
}

function buildGrants(result: MoneyResult): MoneyGrantFigures[] {
  return result.grants.map((grant) => ({
    id: grant.input.id,
    name: grant.input.name,
    status: grant.input.status,
    reductionType: grant.input.reductionType,
    rate: grant.input.reductionValue,
    eligibleCostCap: grant.input.maximumAmount,
    eligibleItemCount: grant.eligibleItemCount,
    eligibleCost: toMoneyRange(grant.eligibleCost),
    uncappedPayout: toMoneyRange(grant.uncapped),
    expected: toMoneyRange(grant.payout),
    capped: grant.capped,
    counted: grant.counted,
  }));
}

/** Builds the project-level summary from an engine run. */
function buildSummary(db: DbType, result: MoneyResult): MoneySummary {
  const payments = computePayments(loadDepositRows(db));
  const { sources, readyToSubmit } = buildSources(db, result);

  const notYetPaid: Scen = {
    expected: result.expectedCost.expected - payments.paidCents,
    best: result.expectedCost.best - payments.paidCents,
    worst: result.expectedCost.worst - payments.paidCents,
  };

  return {
    leftToSpend: { ...toMoneyRange(result.leftToSpend), verdict: result.verdict },
    fundingTotal: toMajor(result.fundingTotalCents),
    activeSourceCount: result.activeSourceCount,
    expectedCost: toMoneyRange(result.expectedCost),
    expectedGrants: toMoneyRange(result.expectedGrants),
    possibleGrants: toMoneyRange(result.possibleGrants),
    afterGrants: toMoneyRange(result.afterGrants),
    paid: toMajor(payments.paidCents),
    stillToPay: toMajor(payments.stillToPayCents),
    // Equals listInvoices(...).summary.openPayable.count: computeOpenAmounts is per invoice and
    // offers and invoices are disjoint sets, so the two counts add up exactly.
    stillToPayCount: payments.stillToPayCount,
    notYetPaid: toMoneyRange(notYetPaid),
    notYetSplit: {
      amount: toMajor(result.notYetSplit.amountCents),
      recordCount: result.notYetSplit.recordCount,
    },
    readyToSubmit,
    records: {
      offers: toOfferTotals(payments.offers),
      invoices: toRecordTotals(payments.invoices),
    },
    sources,
    grants: buildGrants(result),
    byType: {
      work_items: toCostFigures(result.byType.work_items),
      household_items: toCostFigures(result.byType.household_items),
    },
    byArea: result.byArea.map((area) => ({ areaId: area.areaId, ...toCostFigures(area) })),
  };
}

/**
 * The unfiltered project run: input, engine result and the API summary. One computation per
 * request; callers that also need legacy grant-derived fields reuse `result`.
 */
export function computeProjectMoney(db: DbType, vatRate: number): ProjectMoney {
  const input = loadMoneyInput(db, vatRate);
  const result = computeMoney(input);
  return { input, result, summary: buildSummary(db, result) };
}

/** Per-item money of the (unfiltered) breakdown. */
export function getBreakdownMoney(project: Pick<ProjectMoney, 'result'>): BreakdownMoney {
  const { result } = project;
  const workItems: Record<string, MoneyCostFigures> = {};
  const householdItems: Record<string, MoneyCostFigures> = {};
  for (const [key, figures] of result.items) {
    if (key.startsWith('work_item:')) {
      workItems[key.slice('work_item:'.length)] = toCostFigures(figures);
    } else {
      householdItems[key.slice('household_item:'.length)] = toCostFigures(figures);
    }
  }
  return {
    workItems,
    householdItems,
    orphanLines: toCostFigures(result.orphan),
    notYetSplit: {
      amount: toMajor(result.notYetSplit.amountCents),
      recordCount: result.notYetSplit.recordCount,
    },
  };
}

/**
 * Money › Overview breakdown (#2237, contract 25). `deselectedSources` (source ids and/or
 * 'unassigned') filters lines out of every row; not-yet-split is not tied to a source and stays.
 * Paid / Still to pay are attributed per line from the unfiltered records, so a line's own figures
 * never depend on the filter; the filter only drops the excluded lines' shares, so a filtered
 * `total` follows the visible rows and is not the project Paid / Still to pay (the headline and
 * facts come from the overview and are never filtered). Unknown ids in the set are ignored.
 */
export function getBudgetBreakdown(
  db: DbType,
  vatRate: number,
  deselectedSources: ReadonlySet<string> = new Set(),
): BudgetBreakdown {
  const links = loadInvoiceLinks(db);
  const input = loadMoneyInput(db, vatRate, links);
  const unfiltered = computeMoney(input);
  const filtered =
    deselectedSources.size === 0
      ? unfiltered
      : computeMoney(input, {
          includeLine: (line) =>
            !(line.budgetSourceId === null
              ? deselectedSources.has('unassigned')
              : deselectedSources.has(line.budgetSourceId)),
        });

  const lineSources = new Map(input.lines.map((l) => [l.id, l.budgetSourceId]));
  const payments = attributePayments(
    input.invoices,
    loadDepositRows(db),
    links,
    unfiltered.notYetSplitByInvoice,
    lineSources,
  );

  const descriptions = db.all<{ id: string; description: string | null }>(
    sql`SELECT id AS id, description AS description FROM work_item_budgets
    UNION ALL
    SELECT id AS id, description AS description FROM household_item_budgets`,
  );
  const lineMeta = new Map<
    string,
    { description: string | null; linkStatus: InvoiceStatus | null }
  >(descriptions.map((row) => [row.id, { description: row.description, linkStatus: null }]));
  for (const link of links) {
    lineMeta.get(link.lineId)!.linkStatus = link.invoiceStatus;
  }

  const names = new Map(
    db
      .all<{ kind: MoneyItemKind; id: string; name: string }>(
        sql`SELECT 'work_item' AS kind, id AS id, title AS name FROM work_items
        UNION ALL
        SELECT 'household_item' AS kind, id AS id, name AS name FROM household_items`,
      )
      .map((row) => [itemKey(row.kind, row.id), row.name]),
  );
  const categories = db.all<{
    id: string;
    name: string;
    translationKey: string | null;
    sortOrder: number;
  }>(
    sql`SELECT id AS id, name AS name, translation_key AS translationKey, sort_order AS sortOrder
    FROM budget_categories`,
  );
  const sources = db.all<{ id: string; name: string; sourceType: BudgetSourceType }>(
    sql`SELECT id AS id, name AS name, source_type AS sourceType
    FROM budget_sources ORDER BY name ASC, id ASC`,
  );

  return computeBreakdown({
    result: filtered,
    payments,
    items: input.items.map((item) => ({
      ...item,
      name: names.get(itemKey(item.kind, item.id))!,
    })),
    areas: input.areas,
    categories,
    sources,
    lineMeta,
    hasUnassignedLines: input.lines.some((line) => line.budgetSourceId === null),
  });
}

// ─── Per item ────────────────────────────────────────────────────────────────

export interface ItemGrantPayback {
  minTotalPayback: number;
  maxTotalPayback: number;
  expectedTotalPayback: number;
  subsidies: SubsidyPaybackEntry[];
}

/**
 * Grant payback of one item: an entry for EVERY non-rejected grant linked to it (ordered by
 * grant name, then id). `minPayback` / `maxPayback` are the best / worst SCENARIO shares, not an
 * ordering: for a capped grant the best-scenario share can exceed the worst-scenario one.
 * `expectedPayback` is the expected-scenario share. Totals sum the `counted` (approved/received)
 * entries only.
 */
export function getItemGrantPayback(
  db: DbType,
  vatRate: number,
  kind: MoneyItemKind,
  itemId: string,
): ItemGrantPayback {
  const result = computeMoney(loadMoneyInput(db, vatRate));
  const key = itemKey(kind, itemId);
  const total = zeroScen();
  const subsidies: SubsidyPaybackEntry[] = [];
  for (const grant of result.grants) {
    if (!grant.itemKeys.includes(key)) continue;
    const share = grant.itemTotals.get(key) ?? zeroScen();
    subsidies.push({
      subsidyProgramId: grant.input.id,
      name: grant.input.name,
      reductionType: grant.input.reductionType,
      reductionValue: grant.input.reductionValue,
      minPayback: toMajor(share.best),
      maxPayback: toMajor(share.worst),
      expectedPayback: toMajor(share.expected),
      counted: grant.counted,
    });
    if (grant.counted) {
      total.expected += share.expected;
      total.best += share.best;
      total.worst += share.worst;
    }
  }
  return {
    minTotalPayback: toMajor(total.best),
    maxTotalPayback: toMajor(total.worst),
    expectedTotalPayback: toMajor(total.expected),
    subsidies,
  };
}

/** householdItemId -> counted grants in the expected scenario (major units). */
export function getExpectedGrantsByHouseholdItem(db: DbType, vatRate: number): Map<string, number> {
  const result = computeMoney(loadMoneyInput(db, vatRate));
  const map = new Map<string, number>();
  for (const [key, figures] of result.items) {
    if (key.startsWith('household_item:')) {
      map.set(key.slice('household_item:'.length), toMajor(figures.grants.expected));
    }
  }
  return map;
}

/** Money of one purchase on the Purchases list (#2246), major units. */
export interface HouseholdItemListMoney {
  /** Engine expected cost. */
  expectedCost: number;
  /** Counted grants, expected scenario. */
  grants: number;
  /** Paid (ADR-039 attribution), summed over the purchase's lines. */
  paid: number;
}

/**
 * householdItemId -> expected cost, counted grants and Paid, from one engine run. Paid follows
 * `getBudgetBreakdown`: payments are attributed per line, then summed into the line's purchase.
 */
export function getHouseholdItemListMoney(
  db: DbType,
  vatRate: number,
): Map<string, HouseholdItemListMoney> {
  const links = loadInvoiceLinks(db);
  const input = loadMoneyInput(db, vatRate, links);
  const result = computeMoney(input);
  const payments = attributePayments(
    input.invoices,
    loadDepositRows(db),
    links,
    result.notYetSplitByInvoice,
    new Map(input.lines.map((l) => [l.id, l.budgetSourceId])),
  );

  const paidCents = new Map<string, number>();
  for (const line of input.lines) {
    if (line.kind === 'household_item') {
      // A purchase line always carries its purchase (only task lines can be orphans, ADR-030).
      const itemId = line.itemId!;
      const linePaid = payments.byLine.get(line.id)?.paid ?? 0;
      paidCents.set(itemId, (paidCents.get(itemId) ?? 0) + linePaid);
    }
  }

  // The engine only holds purchases with a line or a share: seed every purchase with zeros.
  const map = new Map<string, HouseholdItemListMoney>(
    db
      .all<{ id: string }>(sql`SELECT id AS id FROM household_items`)
      .map((row) => [row.id, { expectedCost: 0, grants: 0, paid: 0 }]),
  );
  for (const [key, figures] of result.items) {
    if (key.startsWith('household_item:')) {
      const id = key.slice('household_item:'.length);
      map.set(id, {
        expectedCost: toMajor(figures.cost.expected),
        grants: toMajor(figures.grants.expected),
        // Every purchase the engine holds has a line, and each purchase line seeded paidCents above
        paid: toMajor(paidCents.get(id)!),
      });
    }
  }
  return map;
}

/** workItemId -> expected cost in major units (every task the engine knows; Tasks list #2245). */
export function getExpectedCostByWorkItem(db: DbType, vatRate: number): Map<string, number> {
  const result = computeMoney(loadMoneyInput(db, vatRate));
  const map = new Map<string, number>();
  for (const [key, figures] of result.items) {
    if (key.startsWith('work_item:')) {
      map.set(key.slice('work_item:'.length), toMajor(figures.cost.expected));
    }
  }
  return map;
}

// ─── Financing, funding source and grant pages (#2242) ───────────────────────

/** Linked tasks plus purchases per grant (both link tables, one query). */
function loadCoveredItemCounts(db: Pick<DbType, 'all'>): Map<string, number> {
  const rows = db.all<{ subsidyProgramId: string; itemCount: number }>(
    sql`SELECT subsidy_program_id AS subsidyProgramId, COUNT(*) AS itemCount
    FROM (
      SELECT subsidy_program_id FROM work_item_subsidies
      UNION ALL
      SELECT subsidy_program_id FROM household_item_subsidies
    )
    GROUP BY subsidy_program_id`,
  );
  return new Map(rows.map((row) => [row.subsidyProgramId, row.itemCount]));
}

interface GrantRow {
  id: string;
  name: string;
  status: SubsidyApplicationStatus;
  reductionType: SubsidyReductionType;
  reductionValue: number;
  maximumAmount: number | null;
  applicationDeadline: string | null;
}

/** Every grant (rejected included), by name then id. */
function loadGrantRows(db: Pick<DbType, 'all'>): GrantRow[] {
  return db.all<GrantRow>(
    sql`SELECT
      id                   AS id,
      name                 AS name,
      application_status   AS status,
      reduction_type       AS reductionType,
      reduction_value      AS reductionValue,
      maximum_amount       AS maximumAmount,
      application_deadline AS applicationDeadline
    FROM subsidy_programs
    ORDER BY name ASC, id ASC`,
  );
}

/** The engine's figures of one grant; a rejected grant (not in the engine run) is all zero. */
function grantFigures(
  figures: Map<string, MoneyGrantFigures>,
  id: string,
): Pick<MoneyGrantFigures, 'expected' | 'eligibleCost' | 'capped' | 'counted'> {
  const found = figures.get(id);
  if (found) {
    return {
      expected: found.expected,
      eligibleCost: found.eligibleCost,
      capped: found.capped,
      counted: found.counted,
    };
  }
  return {
    expected: toMoneyRange(zeroScen()),
    eligibleCost: toMoneyRange(zeroScen()),
    capped: false,
    counted: false,
  };
}

/**
 * Money › Financing: every funding source and every grant. Source figures are the
 * `summary.sources` entries (`buildSources`) and grant figures the engine's (`buildGrants`), so
 * they equal the overview's `money.sources` / `money.grants`.
 */
export function getFinancing(db: DbType, vatRate: number): FinancingResponse {
  const project = computeProjectMoney(db, vatRate);
  const rates = new Map(
    db
      .all<{ id: string; interestRate: number | null }>(
        sql`SELECT id AS id, interest_rate AS interestRate FROM budget_sources`,
      )
      .map((row) => [row.id, row.interestRate]),
  );
  const sources: FinancingSource[] = project.summary.sources.map((source) => ({
    ...source,
    interestRate: rates.get(source.id)!,
  }));

  const figures = new Map(project.summary.grants.map((grant) => [grant.id, grant]));
  const counts = loadCoveredItemCounts(db);
  const grants: FinancingGrant[] = loadGrantRows(db).map((row) => {
    const { expected, counted } = grantFigures(figures, row.id);
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      reductionType: row.reductionType,
      rate: row.reductionValue,
      eligibleCostCap: row.maximumAmount,
      deadline: row.applicationDeadline,
      coveredItemCount: counts.get(row.id) ?? 0,
      expected,
      counted,
    };
  });
  return { sources, grants };
}

/** Money of one funding source: the `summary.sources` entry. */
export function getSourceMoney(db: DbType, vatRate: number, id: string): MoneySourceFigures {
  const result = computeMoney(loadMoneyInput(db, vatRate));
  const source = buildSources(db, result).sources.find((entry) => entry.id === id);
  if (!source) {
    throw new NotFoundError('Budget source not found');
  }
  return source;
}

/** Money of one grant, built from the same engine figures as the overview. */
export function getGrantMoney(db: DbType, vatRate: number, id: string): GrantMoney {
  const exists = db.get<{ id: string }>(
    sql`SELECT id AS id FROM subsidy_programs WHERE id = ${id}`,
  );
  if (!exists) {
    throw new NotFoundError('Subsidy program not found');
  }
  const result = computeMoney(loadMoneyInput(db, vatRate));
  const figures = new Map(buildGrants(result).map((grant) => [grant.id, grant]));
  const { expected, eligibleCost, capped, counted } = grantFigures(figures, id);
  return {
    expected,
    eligibleCost,
    capped,
    counted,
    coveredItemCount: loadCoveredItemCounts(db).get(id) ?? 0,
  };
}

/**
 * Every task and purchase linked to a grant, with the grant's engine share for it (expected
 * scenario; 0 for a rejected grant). Tasks first, then purchases, each by title.
 */
export function getGrantCoveredItems(
  db: DbType,
  vatRate: number,
  id: string,
): GrantCoveredItemsResponse {
  const exists = db.get<{ id: string }>(
    sql`SELECT id AS id FROM subsidy_programs WHERE id = ${id}`,
  );
  if (!exists) {
    throw new NotFoundError('Subsidy program not found');
  }
  const result = computeMoney(loadMoneyInput(db, vatRate));
  const grantResult = result.grants.find((grant) => grant.input.id === id);
  const areaMap = loadAreaMap(db);

  const rows = db.all<{
    type: GrantCoveredItem['type'];
    id: string;
    title: string;
    areaId: string | null;
  }>(
    sql`SELECT 'work_item' AS type, wi.id AS id, wi.title AS title, wi.area_id AS areaId
    FROM work_item_subsidies link
    INNER JOIN work_items wi ON wi.id = link.work_item_id
    WHERE link.subsidy_program_id = ${id}
    UNION ALL
    SELECT 'household_item' AS type, hi.id AS id, hi.name AS title, hi.area_id AS areaId
    FROM household_item_subsidies link
    INNER JOIN household_items hi ON hi.id = link.household_item_id
    WHERE link.subsidy_program_id = ${id}
    ORDER BY type DESC, title COLLATE NOCASE ASC, id ASC`,
  );

  const items = rows.map((row): GrantCoveredItem => {
    const share = grantResult?.itemTotals.get(itemKey(row.type, row.id));
    return {
      type: row.type,
      id: row.id,
      title: row.title,
      area: getAreaSummary(row.areaId, areaMap),
      covered: toMajor(share?.expected ?? 0),
    };
  });
  return { items };
}
