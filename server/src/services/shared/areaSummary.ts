/**
 * Area label resolver shared by the attention and Home services: one `loadAreaMap` query, then
 * `AreaSummary` values (with ancestors) resolved in memory and cached per area id.
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../../db/schema.js';
import type { AreaSummary } from '@cornerstone/shared';
import { loadAreaMap, resolveAreaAncestors } from '../areaService.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

export function createAreaResolver(db: DbType): (areaId: string | null) => AreaSummary | null {
  const areaMap = loadAreaMap(db);
  const cache = new Map<string, AreaSummary>();
  return (areaId) => {
    if (areaId === null) return null;
    const cached = cache.get(areaId);
    if (cached) return cached;
    const area = areaMap.get(areaId);
    if (!area) return null;
    const summary: AreaSummary = {
      id: area.id,
      name: area.name,
      color: area.color,
      ancestors: resolveAreaAncestors(areaId, areaMap),
    };
    cache.set(areaId, summary);
    return summary;
  };
}
