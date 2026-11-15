/**
 * Area page service (#2251, contract 10): `getAreaPageSummary` and `listAreaCostLines` on real
 * in-memory SQLite with migrations, the real scheduling engine and the real money service.
 * T = 2026-03-10, `now` injected. All data is synthetic and every task is dated (an undated task
 * projects from today and is never late).
 *
 * Mutations these tests catch:
 *  - the subtree leaving out descendants or including the area's ancestors or siblings;
 *  - an item counted twice, a company counted once per item instead of once;
 *  - completed tasks or arrived purchases in the open figures or in Now & next;
 *  - Now & next not late-first, not capped at five, or comparing nulls before dates;
 *  - "late" re-implemented (a task or purchase late on the page but not on Home / attention);
 *  - draft-entry photos or other entity photos counted;
 *  - the ancestor context added into the figures, or listed for ancestors without direct items;
 *  - a company phone not falling back to the first contact's phone;
 *  - cost lines of ancestors or siblings, lines of items in the wrong order, a missing 404.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { AREA_NOW_AND_NEXT_LIMIT } from '@cornerstone/shared';
import { NotFoundError } from '../errors/AppError.js';
import { getAttention } from './attentionService.js';
import { getHomeWeek } from './homeService.js';
import { getBudgetBreakdown } from './moneyService.js';
import { listPhotoSpots } from './photoSpotService.js';
import { isPurchaseLate } from './shared/purchaseLate.js';
import { addDaysUtc } from './shared/holdsUp.js';
import { getAreaPageSummary, listAreaCostLines } from './areaPageService.js';

const T = '2026-03-10';
const NOW = new Date('2026-03-10T09:00:00.000Z');
const VAT = 0.19;
const STAMP = '2026-03-01T00:00:00.000Z';
const ts = { createdAt: STAMP, updatedAt: STAMP };
const at = (offset: number): string => addDaysUtc(T, offset);

describe('areaPageService', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── Builders ──────────────────────────────────────────────────────────────

  function area(
    id: string,
    name: string,
    parentId: string | null = null,
    o: Partial<typeof schema.areas.$inferInsert> = {},
  ): void {
    db.insert(schema.areas)
      .values({ id, name, parentId, ...ts, ...o })
      .run();
  }

  function task(id: string, o: Partial<typeof schema.workItems.$inferInsert> = {}): void {
    db.insert(schema.workItems)
      .values({ id, title: `Task ${id}`, status: 'not_started', ...ts, ...o })
      .run();
  }

  function purchase(id: string, o: Partial<typeof schema.householdItems.$inferInsert> = {}): void {
    db.insert(schema.householdItems)
      .values({ id, name: `Purchase ${id}`, categoryId: 'hic-furniture', ...ts, ...o })
      .run();
  }

  function vendor(
    id: string,
    name: string,
    o: Partial<typeof schema.vendors.$inferInsert> = {},
  ): void {
    db.insert(schema.vendors)
      .values({ id, name, ...ts, ...o })
      .run();
  }

  function taskLine(id: string, workItemId: string, plannedAmount: number): void {
    db.insert(schema.workItemBudgets)
      .values({
        id,
        workItemId,
        plannedAmount,
        confidence: 'invoice',
        includesVat: true,
        ...ts,
      })
      .run();
  }

  function purchaseLine(id: string, householdItemId: string, plannedAmount: number): void {
    db.insert(schema.householdItemBudgets)
      .values({
        id,
        householdItemId,
        plannedAmount,
        confidence: 'invoice',
        includesVat: true,
        ...ts,
      })
      .run();
  }

  function diaryEntry(id: string, entryDate: string, status: 'draft' | 'saved' = 'saved'): void {
    db.insert(schema.diaryEntries)
      .values({ id, entryType: 'daily_log', entryDate, body: 'Note', status, ...ts })
      .run();
  }

  function photo(id: string, areaId: string, entityId: string, entityType = 'diary_entry'): void {
    db.insert(schema.photos)
      .values({
        id,
        entityType,
        entityId,
        filename: `${id}.jpg`,
        originalFilename: 'p.jpg',
        mimeType: 'image/jpeg',
        fileSize: 10,
        areaId,
        ...ts,
      })
      .run();
  }

  const summary = (areaId: string) => getAreaPageSummary(db, areaId, { vatRate: VAT, now: NOW });

  /**
   * building > floor > (room B [sort 0], room A [sort 1]); garden is a separate top-level area.
   * Floor subtree: t-room (late, vendor 1), t-floor (open, vendor 1), t-done (completed, vendor 3),
   * h-late (late, vendor 1), h-ok (planned, vendor 2), h-arrived. Building: t-bld, h-bld.
   */
  function seedHouse(): void {
    area('bld', 'House', null, { color: '#112233' });
    area('fl', 'Ground floor', 'bld', { description: 'Living level' });
    area('ra', 'Room A', 'fl', { sortOrder: 1 });
    area('rb', 'Room B', 'fl', { sortOrder: 0, color: '#445566' });
    area('garden', 'Garden');

    db.insert(schema.trades)
      .values({
        id: 'tr-1',
        name: 'Synthetic trade',
        color: '#abcdef',
        translationKey: 'synthetic',
        ...ts,
      })
      .run();
    vendor('ven-1', 'Alpha Build', { phone: '+49 30 1111', tradeId: 'tr-1' });
    vendor('ven-2', 'Beta Paint', { phone: null });
    vendor('ven-3', 'Gamma Tile', { phone: '   ' });
    db.insert(schema.vendorContacts)
      .values({ id: 'vc-2', vendorId: 'ven-2', name: 'Pat', phone: '+49 30 2222', ...ts })
      .run();

    task('t-room', {
      areaId: 'ra',
      status: 'in_progress',
      startDate: at(-10),
      endDate: at(-3),
      assignedVendorId: 'ven-1',
    });
    task('t-floor', {
      areaId: 'fl',
      startDate: at(5),
      endDate: at(8),
      assignedVendorId: 'ven-1',
    });
    task('t-done', {
      areaId: 'ra',
      status: 'completed',
      startDate: at(-20),
      endDate: at(-15),
      assignedVendorId: 'ven-3',
    });
    task('t-bld', { areaId: 'bld', startDate: at(1), endDate: at(2) });
    task('t-garden', { areaId: 'garden', startDate: at(1), endDate: at(2) });

    purchase('h-late', {
      areaId: 'rb',
      status: 'purchased',
      latestDeliveryDate: at(-2),
      vendorId: 'ven-1',
    });
    purchase('h-ok', { areaId: 'ra', targetDeliveryDate: at(30), vendorId: 'ven-2' });
    purchase('h-arrived', { areaId: 'rb', status: 'arrived', actualDeliveryDate: at(-5) });
    purchase('h-bld', { areaId: 'bld' });
    purchase('h-garden', { areaId: 'garden' });
  }

  // ─── Roll-up (S1) ──────────────────────────────────────────────────────────

  describe('roll-up of figures', () => {
    beforeEach(seedHouse);

    it('counts the area and its descendants once, never the ancestor or a sibling area', () => {
      const res = summary('fl');

      expect(res.counts.workItems).toEqual({ total: 3, open: 2, late: 1 });
      expect(res.counts.householdItems).toEqual({ total: 3, open: 2 });
    });

    it('a leaf counts only its own items', () => {
      const res = summary('rb');

      expect(res.counts.workItems).toEqual({ total: 0, open: 0, late: 0 });
      expect(res.counts.householdItems).toEqual({ total: 2, open: 1 });
    });

    it('the top-level area rolls up the whole tree and still excludes other top-level areas', () => {
      const res = summary('bld');

      expect(res.counts.workItems).toEqual({ total: 4, open: 3, late: 1 });
      expect(res.counts.householdItems).toEqual({ total: 4, open: 3 });
    });

    it('lists every item once however deep it sits (no item twice in Now & next)', () => {
      const ids = summary('fl').nowAndNext.map((i) => `${i.type}:${i.id}`);

      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.sort()).toEqual(
        [
          'household_item:h-late',
          'household_item:h-ok',
          'work_item:t-floor',
          'work_item:t-room',
        ].sort(),
      );
    });

    it('reports the area with its ancestors (root first), description and colour', () => {
      const res = summary('fl');

      expect(res.area).toEqual({
        id: 'fl',
        name: 'Ground floor',
        description: 'Living level',
        color: null,
        parentId: 'bld',
        ancestors: [{ id: 'bld', name: 'House', color: '#112233' }],
      });
    });

    it('gives a top-level area no ancestors and no context', () => {
      const res = summary('bld');

      expect(res.area.ancestors).toEqual([]);
      expect(res.ancestorContext).toEqual([]);
    });

    it('throws NotFoundError for an unknown area', () => {
      expect(() => summary('nope')).toThrow(NotFoundError);
    });

    it('defaults the clock to the current instant when none is injected', () => {
      const res = getAreaPageSummary(db, 'fl', { vatRate: VAT });

      // The seeded dates are fixed in 2026-03: from the real clock every dated open item is late
      // or still projected; the call must not throw and must keep the same totals
      expect(res.counts.workItems.total).toBe(3);
    });
  });

  describe('ancestor context', () => {
    beforeEach(seedHouse);

    it('lists exactly the ancestors with direct items, with their direct counts (any status)', () => {
      expect(summary('fl').ancestorContext).toEqual([
        { areaId: 'bld', name: 'House', depth: 0, workItemCount: 1, householdItemCount: 1 },
      ]);
    });

    it('never adds the context counts to the figures', () => {
      const res = summary('fl');

      expect(res.counts.workItems.total).toBe(3);
      expect(res.counts.householdItems.total).toBe(3);
    });

    it('numbers the depth from the top level and skips ancestors without direct items', () => {
      // a task on the floor itself makes the floor an ancestor of the rooms with depth 1
      const res = summary('ra');

      expect(res.ancestorContext).toEqual([
        { areaId: 'bld', name: 'House', depth: 0, workItemCount: 1, householdItemCount: 1 },
        { areaId: 'fl', name: 'Ground floor', depth: 1, workItemCount: 1, householdItemCount: 0 },
      ]);
    });

    it('counts a completed or arrived item booked on the ancestor too (total, not open)', () => {
      task('t-bld-done', {
        areaId: 'bld',
        status: 'completed',
        startDate: at(-9),
        endDate: at(-8),
      });

      expect(summary('fl').ancestorContext[0]!.workItemCount).toBe(2);
    });

    it('is empty when no ancestor has an item', () => {
      area('lone', 'Lone');
      area('lone-room', 'Lone room', 'lone');

      expect(summary('lone-room').ancestorContext).toEqual([]);
    });
  });

  describe('companies', () => {
    beforeEach(seedHouse);

    it('counts a company once across its tasks and purchases, with the split on its row', () => {
      const res = summary('fl');

      expect(res.counts.companies).toBe(3);
      const alpha = res.companies.find((c) => c.id === 'ven-1')!;
      expect(alpha.workItemCount).toBe(2);
      expect(alpha.householdItemCount).toBe(1);
    });

    it('sorts by name and carries the trade summary', () => {
      const res = summary('fl');

      expect(res.companies.map((c) => c.name)).toEqual(['Alpha Build', 'Beta Paint', 'Gamma Tile']);
      expect(res.companies[0]!.trade).toEqual({
        id: 'tr-1',
        name: 'Synthetic trade',
        color: '#abcdef',
        translationKey: 'synthetic',
      });
      expect(res.companies[1]!.trade).toBeNull();
    });

    it('uses the company phone, else the first contact phone, else null (blank = none)', () => {
      const phones = Object.fromEntries(summary('fl').companies.map((c) => [c.id, c.phone]));

      expect(phones).toEqual({ 'ven-1': '+49 30 1111', 'ven-2': '+49 30 2222', 'ven-3': null });
    });

    it('picks the oldest contact with a phone and skips contacts without one', () => {
      db.insert(schema.vendorContacts)
        .values({
          id: 'vc-0',
          vendorId: 'ven-3',
          name: 'No phone',
          phone: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: STAMP,
        })
        .run();
      db.insert(schema.vendorContacts)
        .values({
          id: 'vc-b',
          vendorId: 'ven-3',
          name: 'Second',
          phone: '+49 30 9999',
          createdAt: '2026-02-02T00:00:00.000Z',
          updatedAt: STAMP,
        })
        .run();
      db.insert(schema.vendorContacts)
        .values({
          id: 'vc-a',
          vendorId: 'ven-3',
          name: 'First',
          phone: '+49 30 8888',
          createdAt: '2026-02-01T00:00:00.000Z',
          updatedAt: STAMP,
        })
        .run();

      const gamma = summary('fl').companies.find((c) => c.id === 'ven-3')!;

      expect(gamma.phone).toBe('+49 30 8888');
    });

    it('is an empty list and zero when nothing in the subtree has a company', () => {
      const res = summary('rb').companies;

      expect(res.map((c) => c.id)).toEqual(['ven-1']);
      area('empty', 'Empty');
      expect(summary('empty').companies).toEqual([]);
      expect(summary('empty').counts.companies).toBe(0);
    });
  });

  // ─── Now & next (S2) ───────────────────────────────────────────────────────

  describe('Now & next here', () => {
    it('puts late first, then in progress / purchased / scheduled, then by date with nulls last', () => {
      area('loft', 'Loft');
      // late task and late purchase
      task('t-late', { areaId: 'loft', startDate: at(-8), endDate: at(-4) });
      purchase('h-late', { areaId: 'loft', status: 'purchased', latestDeliveryDate: at(-1) });
      // in progress task (not late), scheduled purchase
      task('t-prog', { areaId: 'loft', status: 'in_progress', startDate: at(-1), endDate: at(4) });
      purchase('h-sched', { areaId: 'loft', status: 'scheduled', latestDeliveryDate: at(2) });
      // planned items by date, one without any date
      task('t-b', { areaId: 'loft', startDate: at(3), endDate: at(4) });
      purchase('h-plan', { areaId: 'loft', targetDeliveryDate: at(1) });
      purchase('h-nodate', { areaId: 'loft' });
      // closed items never listed
      task('t-closed', { areaId: 'loft', status: 'completed', startDate: at(-9), endDate: at(-8) });
      purchase('h-arrived', { areaId: 'loft', status: 'arrived', actualDeliveryDate: at(-3) });

      const res = summary('loft');

      // Both late items rank first. Inside the rank the date decides: the purchase sorts by its
      // planned delivery date (T-1), the late task by its shown start (forecast, today).
      const late = res.nowAndNext.slice(0, 2);
      expect(late.map((i) => i.isLate)).toEqual([true, true]);
      expect(late[1]).toMatchObject({ id: 't-late', startDate: T });
      expect(res.nowAndNext.map((i) => i.id)).toEqual([
        'h-late',
        't-late',
        't-prog',
        'h-sched',
        'h-plan',
      ]);
      expect(res.counts.workItems).toEqual({ total: 4, open: 3, late: 1 });
      expect(res.counts.householdItems).toEqual({ total: 5, open: 4 });
    });

    it('caps at AREA_NOW_AND_NEXT_LIMIT and lists the rest of the open items nowhere', () => {
      area('loft', 'Loft');
      for (let i = 0; i < 8; i++) {
        task(`t-${i}`, { areaId: 'loft', startDate: at(i + 1), endDate: at(i + 2) });
      }

      const res = summary('loft');

      expect(AREA_NOW_AND_NEXT_LIMIT).toBe(5);
      expect(res.nowAndNext.map((i) => i.id)).toEqual(['t-0', 't-1', 't-2', 't-3', 't-4']);
      expect(res.counts.workItems.open).toBe(8);
    });

    it('puts items without a date after dated ones and breaks ties by title then id', () => {
      area('loft', 'Loft');
      purchase('h-z', { areaId: 'loft', name: 'Zeta', targetDeliveryDate: at(5) });
      purchase('h-b2', { areaId: 'loft', name: 'Alpha', targetDeliveryDate: at(5) });
      purchase('h-b1', { areaId: 'loft', name: 'Alpha', targetDeliveryDate: at(5) });
      purchase('h-none', { areaId: 'loft', name: 'Aardvark' });
      purchase('h-early', { areaId: 'loft', name: 'Omega', targetDeliveryDate: at(2) });

      expect(summary('loft').nowAndNext.map((i) => i.id)).toEqual([
        'h-early',
        'h-b1',
        'h-b2',
        'h-z',
        'h-none',
      ]);
    });

    it('purchase deliveryDate falls back latest, earliest, target', () => {
      area('loft', 'Loft');
      purchase('h-1', {
        areaId: 'loft',
        latestDeliveryDate: at(9),
        earliestDeliveryDate: at(7),
        targetDeliveryDate: at(5),
      });
      purchase('h-2', { areaId: 'loft', earliestDeliveryDate: at(7), targetDeliveryDate: at(5) });
      purchase('h-3', { areaId: 'loft', targetDeliveryDate: at(5) });
      purchase('h-4', { areaId: 'loft' });

      const dates = Object.fromEntries(
        summary('loft').nowAndNext.map((i) => [
          i.id,
          i.type === 'household_item' ? i.deliveryDate : 'task',
        ]),
      );

      expect(dates).toEqual({ 'h-1': at(9), 'h-2': at(7), 'h-3': at(5), 'h-4': null });
    });

    it('shapes a task item with shown dates, company and lateness', () => {
      seedHouse();

      const item = summary('ra').nowAndNext.find((i) => i.id === 't-room')!;

      expect(item).toMatchObject({
        type: 'work_item',
        id: 't-room',
        title: 'Task t-room',
        status: 'in_progress',
        isLate: true,
        companyName: 'Alpha Build',
      });
      expect(item.lateDays).toBeGreaterThanOrEqual(1);
    });

    it('shapes a purchase item with exact late days and no lateDays when on time', () => {
      seedHouse();

      const items = summary('fl').nowAndNext;
      const late = items.find((i) => i.id === 'h-late')!;
      const ok = items.find((i) => i.id === 'h-ok')!;

      expect(late).toMatchObject({
        type: 'household_item',
        status: 'purchased',
        isLate: true,
        lateDays: 2,
        deliveryDate: at(-2),
        companyName: 'Alpha Build',
      });
      expect(ok).toMatchObject({ isLate: false, lateDays: null, companyName: 'Beta Paint' });
    });

    it('is empty when the area has no open item', () => {
      area('quiet', 'Quiet');
      task('t-done', { areaId: 'quiet', status: 'completed', startDate: at(-9), endDate: at(-8) });

      const res = summary('quiet');

      expect(res.nowAndNext).toEqual([]);
      expect(res.counts.workItems).toEqual({ total: 1, open: 0, late: 0 });
    });
  });

  // ─── Late parity with Home and attention (S3) ──────────────────────────────

  describe('late equals the Home and attention rules', () => {
    beforeEach(seedHouse);

    it('a task shows the same isLate and lateDays as the Home agenda item for the same task', () => {
      const week = getHomeWeek(db, { now: NOW });
      const homeItems = week.items.filter((i) => i.subject.type === 'work_item' && i.schedule);
      const page = summary('bld').nowAndNext.filter((i) => i.type === 'work_item');

      const compared: string[] = [];
      for (const item of page) {
        const home = homeItems.find((h) => h.subject.id === item.id);
        if (!home) continue;
        expect({ id: item.id, isLate: item.isLate, lateDays: item.lateDays }).toEqual({
          id: item.id,
          isLate: home.schedule!.isLate,
          lateDays: home.schedule!.lateDays,
        });
        compared.push(item.id);
      }
      expect(compared).toEqual(expect.arrayContaining(['t-floor', 't-bld']));
    });

    it('the task the page calls late is the one Home calls late', () => {
      const week = getHomeWeek(db, { now: NOW });
      const homeLate = new Set(
        week.items
          .filter((i) => i.subject.type === 'work_item' && i.schedule?.isLate)
          .map((i) => i.subject.id),
      );
      const pageLate = summary('bld')
        .nowAndNext.filter((i) => i.type === 'work_item' && i.isLate)
        .map((i) => i.id);

      expect(pageLate).toEqual(['t-room']);
      expect([...homeLate]).toContain('t-room');
      expect(homeLate.has('t-floor')).toBe(false);
    });

    it('a purchase isLate equals isPurchaseLate and the N10 attention row isLate', () => {
      const attention = getAttention(db, {
        userId: 'nobody',
        vatRate: VAT,
        includeSnoozed: false,
        now: NOW,
      });
      const n10 = new Map(
        [...attention.rows, ...attention.tidyUp]
          .filter((r) => r.rule === 'N10')
          .map((r) => [r.subject.id, (r.params as { isLate: boolean }).isLate]),
      );

      const items = summary('fl').nowAndNext.filter((i) => i.type === 'household_item');
      expect(items.map((i) => i.id).sort()).toEqual(['h-late', 'h-ok']);
      for (const item of items) {
        const row = sqlite
          .prepare(
            `SELECT status, actual_delivery_date AS actualDeliveryDate,
              earliest_delivery_date AS earliestDeliveryDate,
              latest_delivery_date AS latestDeliveryDate FROM household_items WHERE id = ?`,
          )
          .get(item.id) as Parameters<typeof isPurchaseLate>[0];
        expect(item.isLate).toBe(isPurchaseLate(row, T));
        if (n10.has(item.id)) expect(item.isLate).toBe(n10.get(item.id));
      }
      expect(n10.get('h-late')).toBe(true);
    });

    it('purchase lateDays is exact, null when not late, and 1 for a purchase due yesterday', () => {
      purchase('h-yday', { areaId: 'garden', latestDeliveryDate: at(-1) });
      purchase('h-today', { areaId: 'garden', latestDeliveryDate: at(0) });
      purchase('h-week', { areaId: 'garden', earliestDeliveryDate: at(-7) });

      const byId = Object.fromEntries(summary('garden').nowAndNext.map((i) => [i.id, i]));

      expect(byId['h-yday']!.lateDays).toBe(1);
      expect(byId['h-week']!.lateDays).toBe(7);
      expect(byId['h-today']!.isLate).toBe(false);
      expect(byId['h-today']!.lateDays).toBeNull();
    });

    it('an arrived purchase is never late and never listed', () => {
      purchase('h-arrived-late', {
        areaId: 'garden',
        status: 'arrived',
        latestDeliveryDate: at(-20),
        actualDeliveryDate: at(-3),
      });

      expect(summary('garden').nowAndNext.map((i) => i.id)).not.toContain('h-arrived-late');
    });
  });

  // ─── Children and photos (S4) ──────────────────────────────────────────────

  describe('children and photos', () => {
    beforeEach(() => {
      seedHouse();
      diaryEntry('de-1', '2026-03-01');
      diaryEntry('de-2', '2026-03-05');
      diaryEntry('de-3', '2026-03-09');
      diaryEntry('de-draft', '2026-03-09', 'draft');
      photo('p1', 'ra', 'de-1');
      photo('p2', 'ra', 'de-1');
      photo('p3', 'rb', 'de-2');
      photo('p4', 'bld', 'de-3'); // ancestor: outside the floor
      photo('p5', 'ra', 'de-draft'); // draft entry: outside the Photos page scope
      photo('p6', 'ra', 'de-1', 'work_item'); // not a diary photo
    });

    it('lists the direct children in sort order with subtree roll-ups', () => {
      const res = summary('fl');

      expect(res.children).toEqual([
        { id: 'rb', name: 'Room B', color: '#445566', photoCount: 1, openTaskCount: 0 },
        { id: 'ra', name: 'Room A', color: null, photoCount: 2, openTaskCount: 1 },
      ]);
    });

    it('rolls a child up over its own descendants (grandchildren)', () => {
      const res = summary('bld');

      expect(res.children.map((c) => [c.id, c.photoCount, c.openTaskCount])).toEqual([
        ['fl', 3, 2],
      ]);
    });

    it('counts only saved diary-entry photos and reports the latest entry date', () => {
      expect(summary('fl').counts.photos).toEqual({ total: 3, latestDate: '2026-03-05' });
    });

    it('photos total equals the sum of the Photos page spot counts over the subtree', () => {
      const spots = listPhotoSpots(db).spots;
      const subtree = ['fl', 'ra', 'rb'];
      const sum = spots
        .filter((s) => s.areaId !== null && subtree.includes(s.areaId))
        .reduce((n, s) => n + s.photoCount, 0);

      expect(sum).toBe(3);
      expect(summary('fl').counts.photos.total).toBe(sum);
    });

    it('a leaf has no children and reports zero photos with no date when it has none', () => {
      const res = summary('garden');

      expect(res.children).toEqual([]);
      expect(res.counts.photos).toEqual({ total: 0, latestDate: null });
    });
  });

  // ─── Money (S5 pairs with figures.consistency) ─────────────────────────────

  describe('money', () => {
    beforeEach(() => {
      seedHouse();
      taskLine('l1', 't-room', 100);
      taskLine('l2', 't-floor', 50);
      purchaseLine('l3', 'h-late', 25);
      taskLine('l4', 't-bld', 1000);
    });

    it('takes the subtree figures from the money breakdown byArea, not from its own sums', () => {
      const byArea = getBudgetBreakdown(db, VAT).byArea;
      const fl = byArea.find((r) => r.areaId === 'fl')!;

      expect(summary('fl').money).toEqual({
        expectedCost: fl.figures.expectedCost.expected,
        paid: fl.figures.paid,
      });
      expect(summary('fl').money.expectedCost).toBe(175);
      expect(summary('bld').money.expectedCost).toBe(1175);
    });

    it('gives an area without cost lines zeros', () => {
      expect(summary('garden').money).toEqual({ expectedCost: 0, paid: 0 });
    });
  });

  // ─── Cost lines (S6) ───────────────────────────────────────────────────────

  describe('listAreaCostLines', () => {
    beforeEach(() => {
      seedHouse();
      task('t-a', { areaId: 'fl', title: 'Alpha task' });
      task('t-z', { areaId: 'ra', title: 'zeta task' });
      purchase('h-a', { areaId: 'rb', name: 'Aaa purchase' });
      taskLine('lz', 't-z', 10);
      taskLine('la', 't-a', 20);
      purchaseLine('lh', 'h-a', 30);
      taskLine('lbld', 't-bld', 40);
      taskLine('lgar', 't-garden', 50);
    });

    it('lists the subtree lines only: tasks by title, then purchases by name', () => {
      const lines = listAreaCostLines(db, 'fl');

      expect(lines.map((l) => l.id)).toEqual(['la', 'lz', 'lh']);
      expect(lines.map((l) => [l.itemType, l.itemId, l.itemTitle])).toEqual([
        ['work_item', 't-a', 'Alpha task'],
        ['work_item', 't-z', 'zeta task'],
        ['household_item', 'h-a', 'Aaa purchase'],
      ]);
    });

    it('carries the cost line fields and the item area with its ancestors', () => {
      const [la, lz] = listAreaCostLines(db, 'fl');

      expect(la).toMatchObject({ id: 'la', plannedAmount: 20, workItemId: 't-a' });
      expect(la!.itemArea).toMatchObject({
        id: 'fl',
        name: 'Ground floor',
        ancestors: [{ id: 'bld', name: 'House' }],
      });
      expect(lz!.itemArea).toMatchObject({
        id: 'ra',
        ancestors: [
          { id: 'bld', name: 'House' },
          { id: 'fl', name: 'Ground floor' },
        ],
      });
    });

    it('leaves out items without a line, ancestors and siblings', () => {
      const ids = listAreaCostLines(db, 'fl').map((l) => l.itemId);

      expect(ids).not.toContain('t-bld');
      expect(ids).not.toContain('t-garden');
      expect(ids).not.toContain('t-room');
    });

    it('is empty for an area whose subtree has no line', () => {
      area('quiet', 'Quiet');
      task('t-q', { areaId: 'quiet' });

      expect(listAreaCostLines(db, 'quiet')).toEqual([]);
    });

    it('keeps several lines of one item together in creation order', () => {
      taskLine('la2', 't-a', 5);

      expect(
        listAreaCostLines(db, 'fl')
          .filter((l) => l.itemId === 't-a')
          .map((l) => l.id),
      ).toEqual(['la', 'la2']);
    });

    it('throws NotFoundError for an unknown area', () => {
      expect(() => listAreaCostLines(db, 'nope')).toThrow(NotFoundError);
    });
  });
});
