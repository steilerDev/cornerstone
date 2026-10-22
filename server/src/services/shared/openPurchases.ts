/**
 * The not-yet-delivered purchases (status != arrived, no actual delivery date) with their dates,
 * area id and assigned company name: one bulk query, shared by the attention service (N10) and
 * the Home agenda (deliveries).
 */

import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../../db/schema.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

export interface OpenPurchaseRow {
  id: string;
  name: string;
  status: string;
  targetDeliveryDate: string | null;
  earliestDeliveryDate: string | null;
  latestDeliveryDate: string | null;
  actualDeliveryDate: string | null;
  areaId: string | null;
  companyName: string | null;
}

export function listOpenPurchases(db: Pick<DbType, 'all'>): OpenPurchaseRow[] {
  return db.all<OpenPurchaseRow>(
    sql`SELECT
      h.id                     AS id,
      h.name                   AS name,
      h.status                 AS status,
      h.target_delivery_date   AS targetDeliveryDate,
      h.earliest_delivery_date AS earliestDeliveryDate,
      h.latest_delivery_date   AS latestDeliveryDate,
      h.actual_delivery_date   AS actualDeliveryDate,
      h.area_id                AS areaId,
      v.name                   AS companyName
    FROM household_items h
    LEFT JOIN vendors v ON v.id = h.vendor_id
    WHERE h.status != 'arrived' AND h.actual_delivery_date IS NULL`,
  );
}
