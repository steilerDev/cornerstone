/**
 * Tests for systemEventDisplay.ts: display rules R1 (hide milestone delays logged after the
 * milestone was reached) and R2 (collapse exact repeats), paging, and filters (ADR-040 §6, #2223).
 * Real in-memory SQLite with migrations; synthetic data only.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, eq, gte, lte } from 'drizzle-orm';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { diaryEntries } from '../db/schema.js';
import { listDisplayRows } from './systemEventDisplay.js';

type NewEntry = typeof diaryEntries.$inferInsert;

describe('systemEventDisplay', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let seq = 0;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    seq = 0;
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── Fixtures ──────────────────────────────────────────────────────────────

  /** Minute n of 2026-03-10, as an ISO timestamp. */
  function at(minute: number, day = '2026-03-10'): string {
    return `${day}T10:${String(minute).padStart(2, '0')}:00.000Z`;
  }

  function statusMeta(
    to: string,
    extra: Record<string, unknown> = {},
    subjectLabel: string | null = 'INV-T-001',
  ): string {
    return JSON.stringify({
      v: 1,
      event: 'status_changed',
      from: 'pending',
      to,
      subjectLabel,
      ...extra,
    });
  }

  function auto(o: Partial<NewEntry> & { createdAt: string }): string {
    seq += 1;
    const id = o.id ?? `e-${String(seq).padStart(3, '0')}`;
    db.insert(diaryEntries)
      .values({
        id,
        entryType: 'invoice_status',
        entryDate: o.createdAt.slice(0, 10),
        title: null,
        body: '',
        metadata: statusMeta('paid'),
        isAutomatic: true,
        sourceEntityType: 'invoice',
        sourceEntityId: 'inv-1',
        updatedAt: o.createdAt,
        ...o,
      })
      .run();
    return id;
  }

  function manual(o: Partial<NewEntry> & { createdAt: string }): string {
    seq += 1;
    const id = o.id ?? `m-${String(seq).padStart(3, '0')}`;
    db.insert(diaryEntries)
      .values({
        id,
        entryType: 'general_note',
        entryDate: o.createdAt.slice(0, 10),
        title: 'Site note',
        body: 'Same text',
        metadata: null,
        isAutomatic: false,
        updatedAt: o.createdAt,
        ...o,
      })
      .run();
    return id;
  }

  function milestone(id: number, completedAt: string | null): void {
    const now = '2026-03-01T00:00:00.000Z';
    db.insert(schema.milestones)
      .values({
        id,
        title: `Milestone ${id}`,
        targetDate: '2026-03-01',
        isCompleted: completedAt !== null,
        completedAt,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  function delay(
    milestoneId: number,
    createdAt: string,
    projectedDate = '2026-03-14',
    extra: Partial<NewEntry> = {},
  ): string {
    return auto({
      entryType: 'milestone_delay',
      sourceEntityType: 'milestone',
      sourceEntityId: String(milestoneId),
      metadata: JSON.stringify({
        v: 1,
        event: 'milestone_delayed',
        targetDate: '2026-03-01',
        projectedDate,
        delayDays: 13,
        subjectLabel: 'Milestone A',
      }),
      createdAt,
      ...extra,
    });
  }

  function list(
    opts: Partial<{
      where: Parameters<typeof listDisplayRows>[1]['where'];
      showHidden: boolean;
      raw: boolean;
      collapseBatches: boolean;
      page: number;
      pageSize: number;
    }> = {},
  ) {
    return listDisplayRows(db, {
      where: undefined,
      showHidden: false,
      page: 1,
      pageSize: 50,
      ...opts,
    });
  }

  // ─── R2: collapse ──────────────────────────────────────────────────────────

  describe('R2: exact repeats collapse', () => {
    it('three consecutive identical events become the newest row with repeat { count, firstAt, lastAt }', () => {
      auto({ id: 'a', createdAt: at(1) });
      auto({ id: 'b', createdAt: at(2) });
      auto({ id: 'c', createdAt: at(3) });

      const result = list();

      expect(result.rows).toEqual([
        {
          id: 'c',
          batchId: null,
          repeat: { count: 3, firstAt: at(1), lastAt: at(3) },
          hidden: false,
        },
      ]);
      expect(result.totalItems).toBe(1);
      expect(result.hiddenCount).toBe(0);
    });

    it('a single event has no repeat', () => {
      auto({ id: 'a', createdAt: at(1) });
      expect(list().rows).toEqual([{ id: 'a', batchId: null, repeat: null, hidden: false }]);
    });

    it('a different event of the same subject in between splits the run into two', () => {
      auto({ id: 'a', createdAt: at(1) });
      auto({ id: 'b', createdAt: at(2), metadata: statusMeta('claimed') });
      auto({ id: 'c', createdAt: at(3) });

      const result = list();

      expect(result.rows.map((r) => r.id)).toEqual(['c', 'b', 'a']);
      expect(result.rows.every((r) => r.repeat === null)).toBe(true);
      expect(result.totalItems).toBe(3);
    });

    it('a repeat after a different event starts a new run that collapses on its own', () => {
      auto({ id: 'a', createdAt: at(1) });
      auto({ id: 'b', createdAt: at(2), metadata: statusMeta('claimed') });
      auto({ id: 'c', createdAt: at(3) });
      auto({ id: 'd', createdAt: at(4) });

      const result = list();

      expect(result.rows.map((r) => [r.id, r.repeat?.count ?? 1])).toEqual([
        ['d', 2],
        ['b', 1],
        ['a', 1],
      ]);
    });

    it('rows differing only in subjectLabel (renamed) collapse', () => {
      auto({ id: 'a', createdAt: at(1), metadata: statusMeta('paid', {}, 'INV-T-001') });
      auto({ id: 'b', createdAt: at(2), metadata: statusMeta('paid', {}, 'INV-T-001-R') });

      const result = list();

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]!.id).toBe('b');
      expect(result.rows[0]!.repeat?.count).toBe(2);
    });

    it('rows with a different amount do not collapse', () => {
      auto({ id: 'a', createdAt: at(1), metadata: statusMeta('paid', { amount: 100 }) });
      auto({ id: 'b', createdAt: at(2), metadata: statusMeta('paid', { amount: 200 }) });
      expect(list().rows).toHaveLength(2);
    });

    it('two payments of one invoice never collapse into each other (depositId in the subject)', () => {
      const meta = (depositId: string) =>
        statusMeta('paid', { amount: 300, depositEntryType: 'deposit', depositId });
      auto({ id: 'a', createdAt: at(1), metadata: meta('dep-1') });
      auto({ id: 'b', createdAt: at(2), metadata: meta('dep-2') });

      const result = list();

      // Otherwise identical payments of one invoice stay two items
      expect(result.rows.map((r) => [r.id, r.repeat?.count ?? 1])).toEqual([
        ['b', 1],
        ['a', 1],
      ]);
      expect(result.totalItems).toBe(2);

      // Repeats of one payment still collapse among themselves, across the other payment's row
      auto({ id: 'c', createdAt: at(3), metadata: meta('dep-1') });
      auto({ id: 'd', createdAt: at(4), metadata: meta('dep-1') });
      expect(list().rows.map((r) => [r.id, r.repeat?.count ?? 1])).toEqual([
        ['d', 3],
        ['b', 1],
      ]);
    });

    it('different subjects of the same type never collapse', () => {
      auto({ id: 'a', createdAt: at(1), sourceEntityId: 'inv-1' });
      auto({ id: 'b', createdAt: at(2), sourceEntityId: 'inv-2' });
      expect(list().rows).toHaveLength(2);
    });

    it('different entry types with identical metadata never collapse', () => {
      auto({ id: 'a', createdAt: at(1), entryType: 'invoice_status' });
      auto({
        id: 'b',
        createdAt: at(2),
        entryType: 'work_item_status',
        sourceEntityType: 'work_item',
      });
      expect(list().rows).toHaveLength(2);
    });

    it('subject-less automatic rows group by entry type', () => {
      const legacy = JSON.stringify({ v: 1, event: 'legacy' });
      auto({
        id: 'a',
        createdAt: at(1),
        entryType: 'budget_breach',
        title: 'Over budget',
        body: 'Text',
        metadata: legacy,
        sourceEntityType: null,
        sourceEntityId: null,
      });
      auto({
        id: 'b',
        createdAt: at(2),
        entryType: 'budget_breach',
        title: 'Over budget',
        body: 'Text',
        metadata: legacy,
        sourceEntityType: null,
        sourceEntityId: null,
      });
      auto({
        id: 'c',
        createdAt: at(3),
        entryType: 'auto_reschedule',
        title: 'Over budget',
        body: 'Text',
        metadata: legacy,
        sourceEntityType: null,
        sourceEntityId: null,
      });

      const result = list();

      expect(result.rows.map((r) => [r.id, r.repeat?.count ?? 1])).toEqual([
        ['c', 1],
        ['b', 2],
      ]);
    });

    it('legacy rows collapse only on identical title and body', () => {
      const legacy = JSON.stringify({ v: 1, event: 'legacy' });
      const base = { metadata: legacy, entryType: 'work_item_status' as const };
      auto({ id: 'a', createdAt: at(1), title: 'T', body: 'Same', ...base });
      auto({ id: 'b', createdAt: at(2), title: 'T', body: 'Same', ...base });
      auto({ id: 'c', createdAt: at(3), title: 'T', body: 'Different', ...base });
      auto({ id: 'd', createdAt: at(4), title: 'Other', body: 'Different', ...base });

      const result = list();

      expect(result.rows.map((r) => [r.id, r.repeat?.count ?? 1])).toEqual([
        ['d', 1],
        ['c', 1],
        ['b', 2],
      ]);
    });

    it('rows without metadata collapse like legacy rows (title + body)', () => {
      auto({ id: 'a', createdAt: at(1), metadata: null, title: 'T', body: 'B' });
      auto({ id: 'b', createdAt: at(2), metadata: null, title: 'T', body: 'B' });
      expect(list().rows).toEqual([
        {
          id: 'b',
          batchId: null,
          repeat: { count: 2, firstAt: at(1), lastAt: at(2) },
          hidden: false,
        },
      ]);
    });

    it('a legacy row never collapses with a v1 row of the same subject', () => {
      auto({ id: 'a', createdAt: at(1), metadata: JSON.stringify({ v: 1, event: 'legacy' }) });
      auto({ id: 'b', createdAt: at(2) });
      expect(list().rows).toHaveLength(2);
    });

    it('malformed metadata does not throw in raw or batch-collapse mode (json_valid guard)', () => {
      auto({ id: 'bad', createdAt: at(1), metadata: '{not json' });
      auto({ id: 'good', createdAt: at(2), metadata: statusMeta('claimed', { batchId: 'b1' }) });
      for (const opts of [{ raw: true }, { collapseBatches: true }, { showHidden: true }]) {
        let result: ReturnType<typeof list> | undefined;
        expect(() => {
          result = list(opts);
        }).not.toThrow();
        expect(result!.rows.map((r) => r.id).sort()).toEqual(['bad', 'good']);
      }
    });

    it('falls back to zero totals when the count query returns no row', () => {
      const stub = { all: () => [] } as unknown as typeof db;
      const result = listDisplayRows(stub, {
        where: undefined,
        showHidden: false,
        page: 1,
        pageSize: 10,
      });
      expect(result).toEqual({ rows: [], totalItems: 0, hiddenCount: 0 });
    });

    it('malformed metadata does not throw and is treated as a legacy row', () => {
      auto({ id: 'a', createdAt: at(1), metadata: '{not json', title: 'T', body: 'B' });
      auto({ id: 'b', createdAt: at(2), metadata: '{not json', title: 'T', body: 'B' });
      auto({ id: 'c', createdAt: at(3), metadata: '[1', title: 'T', body: 'B' });

      let result: ReturnType<typeof list> | undefined;
      expect(() => {
        result = list();
      }).not.toThrow();
      expect(result!.rows[0]).toMatchObject({ id: 'c' });
      expect(result!.totalItems).toBeGreaterThanOrEqual(1);
    });

    it('manual rows never collapse, even when identical', () => {
      manual({ id: 'm1', createdAt: at(1) });
      manual({ id: 'm2', createdAt: at(2) });
      manual({ id: 'm3', createdAt: at(3) });

      const result = list();

      expect(result.rows.map((r) => r.id)).toEqual(['m3', 'm2', 'm1']);
      expect(result.rows.every((r) => r.repeat === null)).toBe(true);
    });

    it('a manual row between two identical events does not split their run (separate subjects)', () => {
      auto({ id: 'a', createdAt: at(1) });
      manual({ id: 'm', createdAt: at(2) });
      auto({ id: 'b', createdAt: at(3) });

      const result = list();

      expect(result.rows.map((r) => r.id)).toEqual(['b', 'm']);
      expect(result.rows[0]!.repeat?.count).toBe(2);
    });
  });

  // ─── R1: hide ──────────────────────────────────────────────────────────────

  describe('R1: milestone delays logged after the milestone was reached', () => {
    it('hides the late row by default and counts it in hiddenCount, not in totalItems', () => {
      milestone(1, '2026-03-10T10:05:00.000Z');
      delay(1, at(1));
      delay(1, at(10), '2026-03-20', { id: 'late' });

      const result = list();

      expect(result.rows.map((r) => r.id)).not.toContain('late');
      expect(result.rows).toHaveLength(1);
      expect(result.totalItems).toBe(1);
      expect(result.hiddenCount).toBe(1);
    });

    it('showHidden returns it with hidden: true and keeps totals consistent', () => {
      milestone(1, '2026-03-10T10:05:00.000Z');
      delay(1, at(1), '2026-03-14', { id: 'early' });
      delay(1, at(10), '2026-03-20', { id: 'late' });

      const result = list({ showHidden: true });

      expect(result.rows.map((r) => [r.id, r.hidden])).toEqual([
        ['late', true],
        ['early', false],
      ]);
      expect(result.totalItems).toBe(2);
      expect(result.hiddenCount).toBe(1);
    });

    it('a hidden row never collapses with a pre-completion row of identical parameters', () => {
      milestone(1, '2026-03-10T10:05:00.000Z');
      delay(1, at(1), '2026-03-14', { id: 'early' });
      delay(1, at(10), '2026-03-14', { id: 'late' });

      const shown = list({ showHidden: true });

      expect(shown.rows.map((r) => [r.id, r.hidden, r.repeat])).toEqual([
        ['late', true, null],
        ['early', false, null],
      ]);
    });

    it('R2 still applies to hidden rows when showHidden is on', () => {
      milestone(1, '2026-03-10T10:00:00.000Z');
      delay(1, at(10), '2026-03-14', { id: 'l1' });
      delay(1, at(11), '2026-03-14', { id: 'l2' });

      const shown = list({ showHidden: true });

      expect(shown.rows).toEqual([
        {
          id: 'l2',
          batchId: null,
          repeat: { count: 2, firstAt: at(10), lastAt: at(11) },
          hidden: true,
        },
      ]);
      expect(shown.hiddenCount).toBe(1);
    });

    it('hiddenCount counts collapsed rows once', () => {
      milestone(1, '2026-03-10T10:00:00.000Z');
      delay(1, at(10), '2026-03-14');
      delay(1, at(11), '2026-03-14');
      delay(1, at(12), '2026-03-14');
      expect(list().hiddenCount).toBe(1);
    });

    it('a date-only completed_at hides from the start of that day', () => {
      milestone(1, '2026-03-10');
      delay(1, '2026-03-10T00:00:01.000Z', '2026-03-14', { id: 'same-day' });
      delay(1, '2026-03-09T23:59:00.000Z', '2026-03-20', { id: 'day-before' });

      const result = list({ showHidden: true });

      const byId = Object.fromEntries(result.rows.map((r) => [r.id, r.hidden]));
      expect(byId).toEqual({ 'same-day': true, 'day-before': false });
    });

    it('an uncompleted milestone leaves its delays visible', () => {
      milestone(1, null);
      delay(1, at(1));
      expect(list().rows.map((r) => r.hidden)).toEqual([false]);
      expect(list().hiddenCount).toBe(0);
    });

    it('a deleted milestone leaves its delays visible', () => {
      delay(99, at(1));
      const result = list();
      expect(result.rows).toHaveLength(1);
      expect(result.hiddenCount).toBe(0);
    });

    it('a delay created before the milestone was completed stays visible', () => {
      milestone(1, '2026-03-10T10:30:00.000Z');
      delay(1, at(1));
      expect(list().hiddenCount).toBe(0);
      expect(list().rows).toHaveLength(1);
    });

    it('only milestone_delay events of a milestone subject are ever hidden', () => {
      milestone(1, '2026-03-01T00:00:00.000Z');
      auto({ id: 'inv', createdAt: at(1), sourceEntityId: '1' });
      auto({
        id: 'other',
        createdAt: at(2),
        entryType: 'milestone_delay',
        sourceEntityType: 'work_item',
        sourceEntityId: '1',
      });

      const result = list();

      expect(result.hiddenCount).toBe(0);
      expect(result.rows).toHaveLength(2);
    });

    it('manual rows are never hidden', () => {
      milestone(1, '2026-03-01T00:00:00.000Z');
      manual({ id: 'm', createdAt: at(1), sourceEntityType: 'milestone', sourceEntityId: '1' });
      expect(list().rows.map((r) => r.id)).toEqual(['m']);
    });

    it('a non-numeric source id on a milestone event does not throw', () => {
      milestone(1, '2026-03-01T00:00:00.000Z');
      auto({
        id: 'x',
        createdAt: at(1),
        entryType: 'milestone_delay',
        sourceEntityType: 'milestone',
        sourceEntityId: 'not-a-number',
      });
      expect(() => list()).not.toThrow();
      expect(list().rows).toHaveLength(1);
    });
  });

  // ─── Paging and order ──────────────────────────────────────────────────────

  describe('paging and order', () => {
    it('orders by entry_date DESC, created_at DESC, id DESC', () => {
      manual({ id: 'm-old', createdAt: at(5, '2026-03-08') });
      manual({ id: 'm-new', createdAt: at(1, '2026-03-12') });
      manual({ id: 'm-mid-late', createdAt: at(9, '2026-03-10') });
      manual({ id: 'm-mid-early', createdAt: at(2, '2026-03-10') });

      expect(list().rows.map((r) => r.id)).toEqual(['m-new', 'm-mid-late', 'm-mid-early', 'm-old']);
    });

    it('breaks created_at ties by id so paging is total', () => {
      for (const id of ['m-a', 'm-b', 'm-c', 'm-d', 'm-e']) manual({ id, createdAt: at(1) });

      const p1 = list({ pageSize: 2, page: 1 }).rows.map((r) => r.id);
      const p2 = list({ pageSize: 2, page: 2 }).rows.map((r) => r.id);
      const p3 = list({ pageSize: 2, page: 3 }).rows.map((r) => r.id);

      expect(p1).toEqual(['m-e', 'm-d']);
      expect(p2).toEqual(['m-c', 'm-b']);
      expect(p3).toEqual(['m-a']);
    });

    it('pages over collapsed items without duplicates or gaps', () => {
      // 5 collapsed items: A (x2), B, C (x3), D, E
      auto({ id: 'a1', createdAt: at(1), sourceEntityId: 'A' });
      auto({ id: 'a2', createdAt: at(2), sourceEntityId: 'A' });
      auto({ id: 'b1', createdAt: at(3), sourceEntityId: 'B' });
      for (const [i, id] of ['c1', 'c2', 'c3'].entries())
        auto({ id, createdAt: at(4 + i), sourceEntityId: 'C' });
      auto({ id: 'd1', createdAt: at(8), sourceEntityId: 'D' });
      auto({ id: 'e1', createdAt: at(9), sourceEntityId: 'E' });

      const pages = [1, 2, 3].map((page) => list({ pageSize: 2, page }));
      const ids = pages.flatMap((p) => p.rows.map((r) => r.id));

      expect(ids).toEqual(['e1', 'd1', 'c3', 'b1', 'a2']);
      expect(new Set(ids).size).toBe(ids.length);
      expect(pages.map((p) => p.totalItems)).toEqual([5, 5, 5]);
      expect(pages[2]!.rows).toHaveLength(1);
      expect(pages[1]!.rows[0]).toMatchObject({ id: 'c3', repeat: { count: 3 } });
    });

    it('a page past the end is empty but still reports the totals', () => {
      auto({ id: 'a', createdAt: at(1) });
      const result = list({ page: 5, pageSize: 10 });
      expect(result.rows).toEqual([]);
      expect(result.totalItems).toBe(1);
    });

    it('an empty diary returns zero everywhere', () => {
      expect(list()).toEqual({ rows: [], totalItems: 0, hiddenCount: 0 });
    });
  });

  // ─── Filters ───────────────────────────────────────────────────────────────

  describe('filters apply before collapse', () => {
    it('a type filter keeps only that type and collapses within it', () => {
      auto({ id: 'a', createdAt: at(1) });
      auto({ id: 'b', createdAt: at(2) });
      auto({
        id: 'w',
        createdAt: at(3),
        entryType: 'work_item_status',
        sourceEntityType: 'work_item',
      });

      const result = list({ where: eq(diaryEntries.entryType, 'invoice_status') });

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({ id: 'b', repeat: { count: 2 } });
    });

    it('a filter that removes the middle row lets the neighbours collapse', () => {
      auto({ id: 'a', createdAt: at(1) });
      auto({ id: 'x', createdAt: at(2), metadata: statusMeta('claimed') });
      auto({ id: 'c', createdAt: at(3) });

      const result = list({ where: and(eq(diaryEntries.metadata, statusMeta('paid'))) });

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({ id: 'c', repeat: { count: 2 } });
    });

    it('date range and automatic flag filters', () => {
      auto({ id: 'a-old', createdAt: at(1, '2026-03-01') });
      auto({ id: 'a-new', createdAt: at(1, '2026-03-20') });
      manual({ id: 'm-new', createdAt: at(1, '2026-03-20') });

      const result = list({
        where: and(
          eq(diaryEntries.isAutomatic, true),
          gte(diaryEntries.entryDate, '2026-03-10'),
          lte(diaryEntries.entryDate, '2026-03-31'),
        ),
      });

      expect(result.rows.map((r) => r.id)).toEqual(['a-new']);
      expect(result.totalItems).toBe(1);
    });

    it('a status filter applies before the counts', () => {
      manual({ id: 'm-draft', createdAt: at(1), status: 'draft' });
      manual({ id: 'm-saved', createdAt: at(2), status: 'saved' });

      const result = list({ where: eq(diaryEntries.status, 'draft') });

      expect(result.rows.map((r) => r.id)).toEqual(['m-draft']);
      expect(result.totalItems).toBe(1);
    });

    it('hiddenCount respects the filters', () => {
      milestone(1, '2026-03-01T00:00:00.000Z');
      delay(1, at(1));
      auto({ id: 'inv', createdAt: at(2) });

      const result = list({ where: eq(diaryEntries.entryType, 'invoice_status') });

      expect(result.hiddenCount).toBe(0);
      expect(result.rows).toHaveLength(1);
    });
  });

  // ─── Batches and raw mode (#2224) ──────────────────────────────────────────

  describe('batch collapse and raw mode (#2224)', () => {
    function batched(id: string, minute: number, batchId: string, invoiceId: string): string {
      return auto({
        id,
        createdAt: at(minute),
        sourceEntityId: invoiceId,
        metadata: statusMeta('claimed', { batchId }, invoiceId),
      });
    }

    it('rows carry batchId null unless collapseBatches is on', () => {
      batched('b-1', 1, 'batch-1', 'inv-a');
      batched('b-2', 2, 'batch-1', 'inv-b');
      auto({ id: 'plain', createdAt: at(3), sourceEntityId: 'inv-c' });

      const off = list();
      expect(off.rows.map((r) => r.batchId)).toEqual([null, null, null]);
      expect(off.totalItems).toBe(3);
    });

    it('collapseBatches keeps the first event of each batch, with its batchId', () => {
      batched('b-1', 1, 'batch-1', 'inv-a');
      batched('b-2', 2, 'batch-1', 'inv-b');
      batched('c-1', 3, 'batch-2', 'inv-a');
      auto({ id: 'plain', createdAt: at(4), sourceEntityId: 'inv-c' });

      const result = list({ collapseBatches: true });

      expect(result.totalItems).toBe(3);
      expect(result.rows.map((r) => [r.id, r.batchId])).toEqual([
        ['plain', null],
        ['c-1', 'batch-2'],
        ['b-1', 'batch-1'],
      ]);
    });

    it('a batch is never collapsed together with a different entry type that shares a batchId key', () => {
      batched('b-1', 1, 'batch-1', 'inv-a');
      auto({
        id: 'wi',
        createdAt: at(2),
        entryType: 'work_item_status',
        sourceEntityType: 'work_item',
        sourceEntityId: 'wi-1',
        metadata: statusMeta('done', { batchId: 'batch-1' }, 'Task A'),
      });
      const result = list({ collapseBatches: true });
      expect(result.rows.map((r) => r.id).sort()).toEqual(['b-1', 'wi']);
    });

    it('hiddenCount ignores batch collapse for non-batch rows', () => {
      milestone(1, '2026-03-01T00:00:00.000Z');
      delay(1, at(1));
      batched('b-1', 2, 'batch-1', 'inv-a');
      batched('b-2', 3, 'batch-1', 'inv-b');
      const result = list({ collapseBatches: true });
      expect(result.hiddenCount).toBe(1);
      expect(result.totalItems).toBe(1);
    });

    it('raw turns R1, R2 and batch collapse off and returns hidden rows flagged', () => {
      milestone(1, '2026-03-01T00:00:00.000Z');
      delay(1, at(1));
      auto({ id: 'r-1', createdAt: at(2) });
      auto({ id: 'r-2', createdAt: at(3) });
      batched('b-1', 4, 'batch-1', 'inv-a');
      batched('b-2', 5, 'batch-1', 'inv-b');

      const result = list({ raw: true, collapseBatches: true });

      expect(result.rows.map((r) => r.id)).toEqual(
        expect.arrayContaining(['b-1', 'b-2', 'r-1', 'r-2']),
      );
      expect(result.rows).toHaveLength(5);
      expect(result.rows.every((r) => r.repeat === null && r.batchId === null)).toBe(true);
      expect(result.rows.filter((r) => r.hidden)).toHaveLength(1);
      expect(result.totalItems).toBe(5);
      expect(result.hiddenCount).toBe(1);
    });
  });
});
