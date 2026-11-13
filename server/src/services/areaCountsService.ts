import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { diaryEntries, householdItems, photos, workItems } from '../db/schema.js';
import type { AreaCounts, AreaWithCounts } from '@cornerstone/shared';
import { listAreas } from './areaService.js';
import { getAreaMoneyFigures } from './moneyService.js';
import { DIARY_PHOTO_SCOPE } from './photoSpotService.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/** Direct per-area counts. Areas without rows are absent; callers default to zeros. */
export function loadDirectAreaCounts(db: DbType): Map<string, AreaCounts> {
  const workItemRows = db
    .select({
      areaId: workItems.areaId,
      total: sql<number>`COUNT(*)`,
      open: sql<number>`SUM(CASE WHEN ${workItems.status} <> 'completed' THEN 1 ELSE 0 END)`,
    })
    .from(workItems)
    .where(sql`${workItems.areaId} IS NOT NULL`)
    .groupBy(workItems.areaId)
    .all();

  const householdRows = db
    .select({
      areaId: householdItems.areaId,
      total: sql<number>`COUNT(*)`,
      open: sql<number>`SUM(CASE WHEN ${householdItems.status} <> 'arrived' THEN 1 ELSE 0 END)`,
    })
    .from(householdItems)
    .where(sql`${householdItems.areaId} IS NOT NULL`)
    .groupBy(householdItems.areaId)
    .all();

  const photoRows = db
    .select({
      areaId: photos.areaId,
      total: sql<number>`COUNT(*)`,
      latestDate: sql<string | null>`MAX(${diaryEntries.entryDate})`,
    })
    .from(photos)
    .innerJoin(diaryEntries, sql`${diaryEntries.id} = ${photos.entityId}`)
    .where(sql`${DIARY_PHOTO_SCOPE} AND ${photos.areaId} IS NOT NULL`)
    .groupBy(photos.areaId)
    .all();

  const workItemsByArea = new Map(workItemRows.map((r) => [r.areaId, r]));
  const householdByArea = new Map(householdRows.map((r) => [r.areaId, r]));
  const photosByArea = new Map(photoRows.map((r) => [r.areaId, r]));

  const result = new Map<string, AreaCounts>();
  for (const id of new Set([
    ...workItemsByArea.keys(),
    ...householdByArea.keys(),
    ...photosByArea.keys(),
  ])) {
    if (id === null) continue;
    const wi = workItemsByArea.get(id);
    const hi = householdByArea.get(id);
    const ph = photosByArea.get(id);
    result.set(id, {
      workItems: { total: wi?.total ?? 0, open: wi?.open ?? 0 },
      householdItems: { total: hi?.total ?? 0, open: hi?.open ?? 0 },
      photos: { total: ph?.total ?? 0, latestDate: ph?.latestDate ?? null },
    });
  }
  return result;
}

/**
 * List areas with their direct counts (contract 10, `include=counts`) and Expected cost (#2251,
 * from the money service).
 *
 * Separate from areaService because photoSpotService already imports areaService.
 * Areas without attachments get zero counts and `latestDate: null`.
 */
export function listAreasWithCounts(
  db: DbType,
  search: string | undefined,
  vatRate: number,
): AreaWithCounts[] {
  const areaRows = listAreas(db, search);
  const direct = loadDirectAreaCounts(db);
  const money = getAreaMoneyFigures(db, vatRate);
  return areaRows.map((area) => {
    const m = money.get(area.id);
    const counts: AreaCounts = direct.get(area.id) ?? {
      workItems: { total: 0, open: 0 },
      householdItems: { total: 0, open: 0 },
      photos: { total: 0, latestDate: null },
    };
    return {
      ...area,
      counts,
      expectedCost: { own: m?.ownExpectedCost ?? 0, subtree: m?.expectedCost ?? 0 },
    };
  });
}
