/**
 * #2251 contract 10: read-only aggregates behind the Area page. Subtree = getDescendantIds (the
 * list filters' helper). No money figure is computed here (ADR-039, moneyService owns them).
 */

import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { AREA_NOW_AND_NEXT_LIMIT } from '@cornerstone/shared';
import type {
  AreaAncestorContext,
  AreaCostLine,
  AreaNowItem,
  AreaPageChild,
  AreaPageCompany,
  AreaPageSummary,
  HouseholdItemStatus,
  TradeSummary,
  WorkItemStatus,
} from '@cornerstone/shared';
import {
  getAreaById,
  getAreaSummary,
  getDescendantIds,
  listAreas,
  loadAreaMap,
  resolveAreaAncestors,
} from './areaService.js';
import { loadDirectAreaCounts } from './areaCountsService.js';
import { getAreaMoneyFigures } from './moneyService.js';
import {
  loadScheduleGraph,
  projectSchedule,
  shownWorkItemDates,
  workItemProjectionOf,
} from './schedulingEngine.js';
import { isPurchaseLate, purchaseDeliveryDate, purchaseLateDays } from './shared/purchaseLate.js';
import { listWorkItemBudgetsForItems } from './workItemBudgetService.js';
import { listHouseholdItemBudgetsForItems } from './householdItemBudgetService.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

export interface AreaPageOptions {
  vatRate: number;
  /** Injected clock; defaults to the current instant. */
  now?: Date;
}

const labelCollator = new Intl.Collator(undefined, { sensitivity: 'base' });

interface TaskRow {
  id: string;
  title: string;
  status: WorkItemStatus;
  startDate: string | null;
  endDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  areaId: string;
  vendorId: string | null;
  companyName: string | null;
}

interface PurchaseRow {
  id: string;
  name: string;
  status: HouseholdItemStatus;
  targetDeliveryDate: string | null;
  earliestDeliveryDate: string | null;
  latestDeliveryDate: string | null;
  actualDeliveryDate: string | null;
  vendorId: string | null;
  companyName: string | null;
}

interface VendorRow {
  id: string;
  name: string;
  phone: string | null;
  firstContactPhone: string | null;
  tradeId: string | null;
  tradeName: string | null;
  tradeColor: string | null;
  tradeTranslationKey: string | null;
}

function inListOf(ids: readonly string[]) {
  return sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
}

interface NowEntry {
  item: AreaNowItem;
  rank: number;
  date: string | null;
}

function compareNow(a: NowEntry, b: NowEntry): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  if (a.date !== b.date) {
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return a.date < b.date ? -1 : 1;
  }
  const byTitle = labelCollator.compare(a.item.title, b.item.title);
  if (byTitle !== 0) return byTitle;
  return a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0;
}

export function getAreaPageSummary(
  db: DbType,
  areaId: string,
  opts: AreaPageOptions,
): AreaPageSummary {
  const area = getAreaById(db, areaId);
  const today = (opts.now ?? new Date()).toISOString().slice(0, 10);
  const areaMap = loadAreaMap(db);
  const ancestors = resolveAreaAncestors(areaId, areaMap);
  const subtree = getDescendantIds(db, areaId);
  const inList = inListOf(subtree);

  // Tasks
  const taskRows = db.all<TaskRow>(
    sql`SELECT w.id AS id, w.title AS title, w.status AS status, w.start_date AS startDate,
      w.end_date AS endDate, w.actual_start_date AS actualStartDate,
      w.actual_end_date AS actualEndDate, w.area_id AS areaId,
      w.assigned_vendor_id AS vendorId, v.name AS companyName
    FROM work_items w LEFT JOIN vendors v ON v.id = w.assigned_vendor_id
    WHERE w.area_id IN (${inList})`,
  );
  const projection = projectSchedule(loadScheduleGraph(db), today);
  const nowEntries: NowEntry[] = [];
  let taskOpen = 0;
  let taskLate = 0;
  for (const row of taskRows) {
    if (row.status === 'completed') continue;
    taskOpen += 1;
    const fields = workItemProjectionOf(projection, row);
    const shown = shownWorkItemDates(row, fields);
    if (fields.isLate) taskLate += 1;
    nowEntries.push({
      rank: fields.isLate ? 0 : row.status === 'in_progress' ? 1 : 2,
      date: shown.start ?? shown.end,
      item: {
        type: 'work_item',
        id: row.id,
        title: row.title,
        status: row.status,
        isLate: fields.isLate,
        lateDays: fields.isLate ? fields.lateDays : null,
        companyName: row.companyName,
        startDate: shown.start,
        endDate: shown.end,
      },
    });
  }

  // Purchases
  const purchaseRows = db.all<PurchaseRow>(
    sql`SELECT h.id AS id, h.name AS name, h.status AS status,
      h.target_delivery_date AS targetDeliveryDate,
      h.earliest_delivery_date AS earliestDeliveryDate,
      h.latest_delivery_date AS latestDeliveryDate,
      h.actual_delivery_date AS actualDeliveryDate,
      h.vendor_id AS vendorId, v.name AS companyName
    FROM household_items h LEFT JOIN vendors v ON v.id = h.vendor_id
    WHERE h.area_id IN (${inList})`,
  );
  let purchaseOpen = 0;
  for (const row of purchaseRows) {
    if (row.status === 'arrived') continue;
    purchaseOpen += 1;
    const isLate = isPurchaseLate(row, today);
    const deliveryDate = purchaseDeliveryDate(row);
    nowEntries.push({
      rank: isLate ? 0 : row.status === 'purchased' || row.status === 'scheduled' ? 1 : 2,
      date: deliveryDate,
      item: {
        type: 'household_item',
        id: row.id,
        title: row.name,
        status: row.status,
        isLate,
        lateDays: isLate ? purchaseLateDays(row, today) : null,
        companyName: row.companyName,
        deliveryDate,
      },
    });
  }
  const nowAndNext = nowEntries
    .sort(compareNow)
    .slice(0, AREA_NOW_AND_NEXT_LIMIT)
    .map((e) => e.item);

  // Photos (Photos page scope, via the shared direct-count loader)
  const direct = loadDirectAreaCounts(db);
  const photosOf = (ids: readonly string[]) => {
    let total = 0;
    let latestDate: string | null = null;
    for (const id of ids) {
      const ph = direct.get(id)?.photos;
      if (!ph) continue;
      total += ph.total;
      if (ph.latestDate !== null && (latestDate === null || ph.latestDate > latestDate)) {
        latestDate = ph.latestDate;
      }
    }
    return { total, latestDate };
  };

  // Children: each child's own subtree roll-up
  const allAreas = listAreas(db);
  const childrenOf = new Map<string, string[]>();
  for (const a of allAreas) {
    if (a.parentId === null) continue;
    const list = childrenOf.get(a.parentId) ?? [];
    list.push(a.id);
    childrenOf.set(a.parentId, list);
  }
  const subtreeOf = (rootId: string): string[] => {
    const seen = new Set<string>([rootId]);
    const queue = [rootId];
    while (queue.length > 0) {
      for (const c of childrenOf.get(queue.shift()!) ?? []) {
        if (seen.has(c)) continue;
        seen.add(c);
        queue.push(c);
      }
    }
    return [...seen];
  };
  const children: AreaPageChild[] = allAreas
    .filter((a) => a.parentId === areaId)
    .map((child) => {
      const ids = subtreeOf(child.id);
      return {
        id: child.id,
        name: child.name,
        color: child.color,
        photoCount: photosOf(ids).total,
        openTaskCount: ids.reduce((n, id) => n + (direct.get(id)?.workItems.open ?? 0), 0),
      };
    });

  // Ancestor context
  const ancestorContext: AreaAncestorContext[] = [];
  ancestors.forEach((a, depth) => {
    const c = direct.get(a.id);
    if (!c || c.workItems.total + c.householdItems.total === 0) return;
    ancestorContext.push({
      areaId: a.id,
      name: a.name,
      depth,
      workItemCount: c.workItems.total,
      householdItemCount: c.householdItems.total,
    });
  });

  // Companies
  const taskCount = new Map<string, number>();
  const purchaseCount = new Map<string, number>();
  for (const row of taskRows) {
    if (row.vendorId) taskCount.set(row.vendorId, (taskCount.get(row.vendorId) ?? 0) + 1);
  }
  for (const row of purchaseRows) {
    if (row.vendorId) purchaseCount.set(row.vendorId, (purchaseCount.get(row.vendorId) ?? 0) + 1);
  }
  const vendorIds = [...new Set([...taskCount.keys(), ...purchaseCount.keys()])];
  let companies: AreaPageCompany[] = [];
  if (vendorIds.length > 0) {
    const vendorRows = db.all<VendorRow>(
      sql`SELECT v.id AS id, v.name AS name, v.phone AS phone,
        (SELECT vc.phone FROM vendor_contacts vc
          WHERE vc.vendor_id = v.id AND TRIM(COALESCE(vc.phone, '')) <> ''
          ORDER BY vc.created_at ASC, vc.id ASC
          LIMIT 1) AS firstContactPhone,
        t.id AS tradeId, t.name AS tradeName, t.color AS tradeColor,
        t.translation_key AS tradeTranslationKey
      FROM vendors v LEFT JOIN trades t ON t.id = v.trade_id
      WHERE v.id IN (${inListOf(vendorIds)})`,
    );
    companies = vendorRows
      .map((v) => {
        const trade: TradeSummary | null =
          v.tradeId === null
            ? null
            : {
                id: v.tradeId,
                name: v.tradeName!,
                color: v.tradeColor,
                translationKey: v.tradeTranslationKey,
              };
        return {
          id: v.id,
          name: v.name,
          trade,
          phone: v.phone?.trim() ? v.phone : v.firstContactPhone,
          workItemCount: taskCount.get(v.id) ?? 0,
          householdItemCount: purchaseCount.get(v.id) ?? 0,
        };
      })
      .sort((a, b) => labelCollator.compare(a.name, b.name) || (a.id < b.id ? -1 : 1));
  }

  const m = getAreaMoneyFigures(db, opts.vatRate).get(areaId);
  const photos = photosOf(subtree);

  return {
    area: {
      id: area.id,
      name: area.name,
      description: area.description,
      color: area.color,
      parentId: area.parentId,
      ancestors,
    },
    children,
    counts: {
      workItems: { total: taskRows.length, open: taskOpen, late: taskLate },
      householdItems: { total: purchaseRows.length, open: purchaseOpen },
      photos,
      companies: companies.length,
    },
    nowAndNext,
    ancestorContext,
    companies,
    money: { expectedCost: m?.expectedCost ?? 0, paid: m?.paid ?? 0 },
  };
}

export function listAreaCostLines(db: DbType, areaId: string): AreaCostLine[] {
  getAreaById(db, areaId);
  const inList = inListOf(getDescendantIds(db, areaId));
  const areaMap = loadAreaMap(db);

  const tasks = db.all<{ id: string; title: string; areaId: string }>(
    sql`SELECT id AS id, title AS title, area_id AS areaId FROM work_items
    WHERE area_id IN (${inList}) ORDER BY title COLLATE NOCASE, id`,
  );
  const purchases = db.all<{ id: string; title: string; areaId: string }>(
    sql`SELECT id AS id, name AS title, area_id AS areaId FROM household_items
    WHERE area_id IN (${inList}) ORDER BY name COLLATE NOCASE, id`,
  );

  const taskLines = Map.groupBy(
    listWorkItemBudgetsForItems(
      db,
      tasks.map((t) => t.id),
    ),
    (l) => l.workItemId,
  );
  const purchaseLines = Map.groupBy(
    listHouseholdItemBudgetsForItems(
      db,
      purchases.map((p) => p.id),
    ),
    (l) => l.householdItemId,
  );

  const lines: AreaCostLine[] = [];
  for (const row of tasks) {
    for (const line of taskLines.get(row.id) ?? []) {
      lines.push({
        ...line,
        itemType: 'work_item',
        itemId: row.id,
        itemTitle: row.title,
        itemArea: getAreaSummary(row.areaId, areaMap)!,
      });
    }
  }
  for (const row of purchases) {
    for (const line of purchaseLines.get(row.id) ?? []) {
      lines.push({
        ...line,
        itemType: 'household_item',
        itemId: row.id,
        itemTitle: row.title,
        itemArea: getAreaSummary(row.areaId, areaMap)!,
      });
    }
  }
  return lines;
}
