/**
 * Tests for historyService.ts: the History feed (contract 17, ADR-040 §6, #2224).
 * Real in-memory SQLite with migrations and the `fold` SQL function; synthetic data only.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { registerSqlFunctions } from '../db/sqlFunctions.js';
import * as schema from '../db/schema.js';
import { diaryEntries } from '../db/schema.js';
import type { HistoryEventType } from '@cornerstone/shared';
import { listHistory } from './historyService.js';
import type { ParsedHistoryQuery } from './historyService.js';

type NewEntry = typeof diaryEntries.$inferInsert;

describe('historyService.listHistory', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    registerSqlFunctions(sqlite);
    db = drizzle(sqlite, { schema });
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── Fixtures ──────────────────────────────────────────────────────────────

  function at(minute: number, day = '2026-03-10'): string {
    return `${day}T10:${String(minute).padStart(2, '0')}:00.000Z`;
  }

  function list(q: Partial<ParsedHistoryQuery> = {}) {
    return listHistory(db, { types: [], ...q });
  }

  function ids(q: Partial<ParsedHistoryQuery> = {}): string[] {
    return list({ pageSize: 100, ...q }).items.map((i) => i.id);
  }

  function statusMeta(
    to: string,
    extra: Record<string, unknown> = {},
    subjectLabel: string | null = 'T-001',
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

  function auto(o: Partial<NewEntry> & { createdAt: string; id: string }): string {
    db.insert(diaryEntries)
      .values({
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
    return o.id;
  }

  function manual(o: Partial<NewEntry> & { createdAt: string; id: string }): string {
    db.insert(diaryEntries)
      .values({
        entryType: 'daily_log',
        entryDate: o.createdAt.slice(0, 10),
        title: 'Formwork check',
        body: 'Checked the formwork',
        metadata: null,
        status: 'saved',
        isAutomatic: false,
        updatedAt: o.createdAt,
        ...o,
      })
      .run();
    return o.id;
  }

  function insertSource(id: string, name: string): void {
    db.insert(schema.budgetSources)
      .values({
        id,
        name,
        sourceType: 'bank_loan',
        totalAmount: 1000,
        isDiscretionary: false,
        status: 'active',
        createdAt: at(0),
        updatedAt: at(0),
      })
      .run();
  }

  function insertInvoice(id: string, invoiceNumber: string | null): void {
    if (db.select().from(schema.vendors).all().length === 0) {
      db.insert(schema.vendors)
        .values({ id: 'vendor-1', name: 'Company A', createdAt: at(0), updatedAt: at(0) })
        .run();
    }
    db.insert(schema.invoices)
      .values({
        id,
        vendorId: 'vendor-1',
        amount: 100,
        date: '2026-03-01',
        status: 'pending',
        invoiceNumber,
        createdAt: at(0),
        updatedAt: at(0),
      })
      .run();
  }

  /** One bank-report batch event (invoice event, or deposit event when extra has depositId). */
  function batchEvent(
    id: string,
    minute: number,
    batchId: string,
    invoiceId: string | null,
    extra: Record<string, unknown> = {},
    label: string | null = null,
  ): string {
    return auto({
      id,
      createdAt: at(minute),
      sourceEntityId: invoiceId,
      metadata: statusMeta('claimed', { batchId, ...extra }, label),
    });
  }

  // ─── Ordering, paging ──────────────────────────────────────────────────────

  describe('ordering and paging', () => {
    it('lists newest first by entry_date, then created_at, then id', () => {
      auto({ id: 'a-old', createdAt: at(5, '2026-03-08'), sourceEntityId: 'i0' });
      auto({ id: 'a-1', createdAt: at(5), sourceEntityId: 'i1' });
      auto({ id: 'a-2', createdAt: at(5), sourceEntityId: 'i2' });
      auto({ id: 'a-3', createdAt: at(30), sourceEntityId: 'i3' });
      expect(ids()).toEqual(['a-3', 'a-2', 'a-1', 'a-old']);
    });

    it('paginates after collapse and reports totals', () => {
      for (let i = 0; i < 5; i++) {
        auto({ id: `p-${i}`, createdAt: at(i), sourceEntityId: `inv-${i}` });
      }
      batchEvent('b-1', 10, 'batch-1', 'inv-x');
      batchEvent('b-2', 11, 'batch-1', 'inv-y');
      const r = list({ pageSize: 3 });
      expect(r.pagination).toEqual({ page: 1, pageSize: 3, totalItems: 6, totalPages: 2 });
      expect(r.items).toHaveLength(3);
      const r2 = list({ pageSize: 3, page: 2 });
      expect(r2.items).toHaveLength(3);
      expect(r2.pagination.page).toBe(2);
    });

    it('clamps page and pageSize and defaults to 25', () => {
      expect(list().pagination.pageSize).toBe(25);
      expect(list({ pageSize: 500 }).pagination.pageSize).toBe(100);
      expect(list({ pageSize: 0 }).pagination.pageSize).toBe(1);
      expect(list({ page: -4 }).pagination.page).toBe(1);
    });

    it('returns an empty page and a null object when nothing exists', () => {
      const r = list();
      expect(r.items).toEqual([]);
      expect(r.pagination.totalItems).toBe(0);
      expect(r.pagination.totalPages).toBe(0);
      expect(r.hiddenCount).toBe(0);
      expect(r.object).toBeNull();
    });

    it('excludes manual entries unless includeDiary is set', () => {
      auto({ id: 'a-1', createdAt: at(1) });
      manual({ id: 'm-1', createdAt: at(2) });
      expect(ids()).toEqual(['a-1']);
    });
  });

  // ─── Types ─────────────────────────────────────────────────────────────────

  describe('type filter', () => {
    const stored: [HistoryEventType, NewEntry['entryType']][] = [
      ['work_item_status', 'work_item_status'],
      ['invoice_status', 'invoice_status'],
      ['subsidy_status', 'subsidy_status'],
      ['invoice_created', 'invoice_created'],
      ['milestone_delay', 'milestone_delay'],
      ['budget_breach', 'budget_breach'],
      ['auto_reschedule', 'auto_reschedule'],
    ];

    beforeEach(() => {
      stored.forEach(([, entryType], i) => {
        auto({
          id: `t-${entryType}`,
          createdAt: at(i),
          entryType,
          sourceEntityType: null,
          sourceEntityId: null,
          metadata: JSON.stringify({ v: 1, event: 'other', n: i }),
        });
      });
    });

    it.each(stored)('type %s returns only that stored type', (type, entryType) => {
      expect(ids({ types: [type] })).toEqual([`t-${entryType}`]);
    });

    it('a comma list is the union', () => {
      expect(ids({ types: ['budget_breach', 'auto_reschedule'] }).sort()).toEqual([
        't-auto_reschedule',
        't-budget_breach',
      ]);
    });

    it('payment is invoice_status to paid without a batch; submission needs a batch', () => {
      auto({ id: 'pay', createdAt: at(20), metadata: statusMeta('paid'), sourceEntityId: 'i1' });
      auto({
        id: 'claimed-single',
        createdAt: at(21),
        metadata: statusMeta('claimed'),
        sourceEntityId: 'i2',
      });
      batchEvent('sub-1', 22, 'batch-1', 'i3');
      auto({
        id: 'paid-in-batch',
        createdAt: at(23),
        metadata: statusMeta('paid', { batchId: 'batch-2' }),
        sourceEntityId: 'i4',
      });
      expect(ids({ types: ['payment'] })).toEqual(['pay']);
      expect(ids({ types: ['submission'] }).sort()).toEqual(['paid-in-batch', 'sub-1']);
      expect(ids({ types: ['invoice_status'] }).sort()).toEqual(
        ['claimed-single', 'pay', 'paid-in-batch', 'sub-1', 't-invoice_status'].sort(),
      );
      expect(ids({ types: ['payment', 'submission'] }).sort()).toEqual(
        ['pay', 'paid-in-batch', 'sub-1'].sort(),
      );
    });

    it('malformed metadata does not error and matches no derived type', () => {
      auto({ id: 'bad', createdAt: at(30), metadata: '{not json', sourceEntityId: 'i9' });
      expect(ids({ types: ['payment'] })).toEqual([]);
      expect(ids({ types: ['submission'] })).toEqual([]);
      expect(ids({ types: ['invoice_status'] })).toContain('bad');
      expect(() => list({ q: 'x' })).not.toThrow();
      expect(() => list({ includeHidden: true })).not.toThrow();
      expect(() => list({ batchId: 'batch-1' })).not.toThrow();
    });

    it('a JSON scalar in metadata does not error', () => {
      auto({ id: 'scalar', createdAt: at(31), metadata: '42', sourceEntityId: 'i8' });
      expect(() => list({ types: ['payment'] })).not.toThrow();
    });
  });

  // ─── Batches ───────────────────────────────────────────────────────────────

  describe('batch collapse', () => {
    function seedBatch(): void {
      insertSource('src-1', 'Bank A');
      insertInvoice('inv-a', 'T-001');
      insertInvoice('inv-b', 'T-002');
      const x = { budgetSourceId: 'src-1' };
      batchEvent('b-1', 1, 'batch-1', 'inv-a', { amount: 100, ...x }, 'snap-A');
      batchEvent(
        'b-2',
        2,
        'batch-1',
        'inv-a',
        { amount: 50, depositEntryType: 'deposit', depositId: 'd1', ...x },
        'snap-A',
      );
      batchEvent(
        'b-3',
        3,
        'batch-1',
        'inv-a',
        { amount: 20, depositEntryType: 'refund', depositId: 'd2', ...x },
        'snap-A',
      );
      batchEvent('b-4', 4, 'batch-1', 'inv-b', { amount: 200, ...x }, 'snap-B');
    }

    it('collapses a batch to its first event with a computed summary', () => {
      seedBatch();
      const r = list();
      expect(r.items.map((i) => i.id)).toEqual(['b-1']);
      expect(r.pagination.totalItems).toBe(1);
      expect(r.items[0]!.repeat).toBeUndefined();
      expect(r.items[0]!.batch).toEqual({
        batchId: 'batch-1',
        invoiceCount: 2,
        // invoice A: deposit 50 - refund 20 (the invoice amount is not added), invoice B: 200
        amount: 230,
        invoiceLabels: ['T-001', 'T-002'],
        budgetSourceId: 'src-1',
        budgetSourceName: 'Bank A',
        budgetSourceExists: true,
      });
    });

    it('prefers the live invoice number and falls back to the snapshot for a deleted invoice', () => {
      seedBatch();
      sqlite.prepare("UPDATE invoices SET invoice_number = 'T-001-live' WHERE id = 'inv-a'").run();
      sqlite.prepare("DELETE FROM invoices WHERE id = 'inv-b'").run();
      expect(list().items[0]!.batch!.invoiceLabels).toEqual(['T-001-live', 'snap-B']);
    });

    it('uses null for an invoice without any number', () => {
      insertInvoice('inv-n', null);
      batchEvent('n-1', 1, 'batch-n', 'inv-n', { amount: 10 }, null);
      expect(list().items[0]!.batch!.invoiceLabels).toEqual([null]);
    });

    it('limits labels to three but counts every invoice', () => {
      for (const n of ['1', '2', '3', '4']) {
        insertInvoice(`inv-${n}`, `T-00${n}`);
        batchEvent(`m-${n}`, Number(n), 'batch-4', `inv-${n}`, { amount: 10 });
      }
      const batch = list().items[0]!.batch!;
      expect(batch.invoiceCount).toBe(4);
      expect(batch.invoiceLabels).toEqual(['T-001', 'T-002', 'T-003']);
      expect(batch.amount).toBe(40);
    });

    it('amount is null when an invoice event has no amount', () => {
      insertInvoice('inv-a', 'T-001');
      batchEvent('x-1', 1, 'batch-x', 'inv-a', {});
      expect(list().items[0]!.batch!.amount).toBeNull();
    });

    it('amount is null when a deposit event has no amount', () => {
      insertInvoice('inv-a', 'T-001');
      batchEvent('x-1', 1, 'batch-x', 'inv-a', { amount: 5 });
      batchEvent('x-2', 2, 'batch-x', 'inv-a', { depositId: 'd1', depositEntryType: 'deposit' });
      expect(list().items[0]!.batch!.amount).toBeNull();
    });

    it('counts the first invoice event per invoice only and ignores events without an invoice', () => {
      insertInvoice('inv-a', 'T-001');
      batchEvent('x-1', 1, 'batch-x', 'inv-a', { amount: 0.1 });
      batchEvent('x-2', 2, 'batch-x', 'inv-a', { amount: 0.2 });
      batchEvent('x-3', 3, 'batch-x', null, { amount: 5 });
      const batch = list().items[0]!.batch!;
      expect(batch.amount).toBe(0.1);
      expect(batch.invoiceCount).toBe(1);
    });

    it('rounds the total to cents', () => {
      insertInvoice('inv-a', 'T-001');
      insertInvoice('inv-b', 'T-002');
      batchEvent('x-1', 1, 'batch-x', 'inv-a', { amount: 0.1 });
      batchEvent('x-2', 2, 'batch-x', 'inv-b', { amount: 0.2 });
      expect(list().items[0]!.batch!.amount).toBe(0.3);
    });

    it('a batch without budgetSourceId has null source fields', () => {
      insertInvoice('inv-a', 'T-001');
      batchEvent('x-1', 1, 'batch-x', 'inv-a', { amount: 5 });
      const batch = list().items[0]!.batch!;
      expect(batch.budgetSourceId).toBeNull();
      expect(batch.budgetSourceName).toBeNull();
      expect(batch.budgetSourceExists).toBeNull();
    });

    it('a deleted funding source reports exists false and no name', () => {
      insertInvoice('inv-a', 'T-001');
      batchEvent('x-1', 1, 'batch-x', 'inv-a', { amount: 5, budgetSourceId: 'src-gone' });
      const batch = list().items[0]!.batch!;
      expect(batch.budgetSourceId).toBe('src-gone');
      expect(batch.budgetSourceName).toBeNull();
      expect(batch.budgetSourceExists).toBe(false);
    });

    it('two batches give two rows, neither with a repeat', () => {
      insertInvoice('inv-a', 'T-001');
      batchEvent('x-1', 1, 'batch-1', 'inv-a', { amount: 5 });
      batchEvent('x-2', 2, 'batch-1', 'inv-b', { amount: 5 });
      batchEvent('y-1', 3, 'batch-2', 'inv-a', { amount: 5 });
      batchEvent('y-2', 4, 'batch-2', 'inv-b', { amount: 5 });
      const r = list();
      expect(r.items.map((i) => i.id)).toEqual(['y-1', 'x-1']);
      expect(r.items.every((i) => i.repeat === undefined)).toBe(true);
    });

    it('does not collapse with an object filter; members show individually without batch', () => {
      seedBatch();
      const r = list({ entityType: 'invoice', entityId: 'inv-a' });
      expect(r.items.map((i) => i.id).sort()).toEqual(['b-1', 'b-2', 'b-3']);
      expect(r.items.every((i) => i.batch === undefined)).toBe(true);
    });

    it('the batchId filter lists the members uncollapsed', () => {
      seedBatch();
      auto({ id: 'other', createdAt: at(9), sourceEntityId: 'inv-z' });
      const r = list({ batchId: 'batch-1' });
      expect(r.items.map((i) => i.id).sort()).toEqual(['b-1', 'b-2', 'b-3', 'b-4']);
      expect(r.items.every((i) => i.batch === undefined)).toBe(true);
    });
  });

  // ─── Object filter ─────────────────────────────────────────────────────────

  describe('object filter', () => {
    it('keeps only that object and echoes its live title', () => {
      insertInvoice('inv-a', 'T-001');
      auto({ id: 'a', createdAt: at(1), sourceEntityId: 'inv-a' });
      auto({ id: 'b', createdAt: at(2), sourceEntityId: 'inv-b' });
      auto({
        id: 'c',
        createdAt: at(3),
        entryType: 'work_item_status',
        sourceEntityType: 'work_item',
        sourceEntityId: 'inv-a',
        metadata: JSON.stringify({ v: 1, event: 'other' }),
      });
      const r = list({ entityType: 'invoice', entityId: 'inv-a' });
      expect(r.items.map((i) => i.id)).toEqual(['a']);
      expect(r.object).toEqual({
        entityType: 'invoice',
        entityId: 'inv-a',
        title: 'T-001',
        exists: true,
      });
    });

    it('echoes exists false for a deleted object', () => {
      const r = list({ entityType: 'work_item', entityId: 'wi-gone' });
      expect(r.object).toEqual({
        entityType: 'work_item',
        entityId: 'wi-gone',
        title: null,
        exists: false,
      });
    });

    it('echoes a live milestone title', () => {
      db.insert(schema.milestones)
        .values({
          id: 7,
          title: 'Shell complete',
          targetDate: '2026-04-01',
          isCompleted: false,
          createdAt: at(0),
          updatedAt: at(0),
        })
        .run();
      const r = list({ entityType: 'milestone', entityId: '7' });
      expect(r.object).toMatchObject({ title: 'Shell complete', exists: true });
    });
  });

  // ─── Dates and search ──────────────────────────────────────────────────────

  describe('dates and search', () => {
    it('date bounds are inclusive on entry_date', () => {
      auto({ id: 'd8', createdAt: at(1, '2026-03-08'), sourceEntityId: 'i1' });
      auto({ id: 'd9', createdAt: at(1, '2026-03-09'), sourceEntityId: 'i2' });
      auto({ id: 'd10', createdAt: at(1, '2026-03-10'), sourceEntityId: 'i3' });
      auto({ id: 'd11', createdAt: at(1, '2026-03-11'), sourceEntityId: 'i4' });
      expect(ids({ dateFrom: '2026-03-09', dateTo: '2026-03-10' }).sort()).toEqual(['d10', 'd9']);
      expect(ids({ dateFrom: '2026-03-10' }).sort()).toEqual(['d10', 'd11']);
      expect(ids({ dateTo: '2026-03-08' })).toEqual(['d8']);
    });

    it('q matches the v1 subjectLabel, the vendorName and a legacy title', () => {
      auto({ id: 'lbl', createdAt: at(1), metadata: statusMeta('paid', {}, 'ZX-100') });
      auto({
        id: 'ven',
        createdAt: at(2),
        sourceEntityId: 'i2',
        metadata: statusMeta('paid', { vendorName: 'Company Quux' }, 'T-002'),
      });
      auto({
        id: 'leg',
        createdAt: at(3),
        sourceEntityId: 'i3',
        title: 'Legacy plumbing note',
        body: 'old text',
        metadata: null,
      });
      expect(ids({ q: 'zx-100' })).toEqual(['lbl']);
      expect(ids({ q: 'quux' })).toEqual(['ven']);
      expect(ids({ q: 'plumbing' })).toEqual(['leg']);
      expect(ids({ q: 'old text' })).toEqual(['leg']);
      expect(ids({ q: '   ' })).toHaveLength(3);
      expect(ids({ q: undefined })).toHaveLength(3);
    });

    it('q folds umlauts and German digraphs', () => {
      auto({ id: 'u1', createdAt: at(1), metadata: statusMeta('paid', {}, 'Bäder-1') });
      auto({
        id: 'u2',
        createdAt: at(2),
        sourceEntityId: 'i2',
        metadata: statusMeta('paid', {}, 'Baeder-2'),
      });
      expect(ids({ q: 'baeder' }).sort()).toEqual(['u1', 'u2']);
      expect(ids({ q: 'bäder' }).sort()).toEqual(['u1', 'u2']);
    });

    it('escapes LIKE wildcards in q', () => {
      auto({ id: 'pct', createdAt: at(1), metadata: statusMeta('paid', {}, '50% off') });
      auto({
        id: 'und',
        createdAt: at(2),
        sourceEntityId: 'i2',
        metadata: statusMeta('paid', {}, 'a_b'),
      });
      auto({
        id: 'plain',
        createdAt: at(3),
        sourceEntityId: 'i3',
        metadata: statusMeta('paid', {}, 'axb 500'),
      });
      expect(ids({ q: '%' })).toEqual(['pct']);
      expect(ids({ q: '_' })).toEqual(['und']);
    });
  });

  // ─── includeDiary ──────────────────────────────────────────────────────────

  describe('includeDiary', () => {
    beforeEach(() => {
      auto({ id: 'a-1', createdAt: at(1), metadata: statusMeta('paid', {}, 'T-001') });
      manual({ id: 'm-saved', createdAt: at(2), title: 'Roof visit' });
      manual({ id: 'm-draft', createdAt: at(3), status: 'draft', title: 'Roof draft' });
    });

    it('adds saved manual entries and excludes drafts', () => {
      expect(ids({ includeDiary: true })).toEqual(['m-saved', 'a-1']);
    });

    it('type and object filters do not remove manual entries', () => {
      expect(ids({ includeDiary: true, types: ['budget_breach'] })).toEqual(['m-saved']);
      expect(ids({ includeDiary: true, entityType: 'invoice', entityId: 'nope' })).toEqual([
        'm-saved',
      ]);
    });

    it('date and q apply to manual entries', () => {
      manual({ id: 'm-old', createdAt: at(4, '2026-02-01'), title: 'Old visit' });
      expect(ids({ includeDiary: true, dateFrom: '2026-03-01' })).toEqual(['m-saved', 'a-1']);
      expect(ids({ includeDiary: true, q: 'roof' })).toEqual(['m-saved']);
    });

    it('never groups manual entries', () => {
      manual({ id: 'm-same', createdAt: at(5), title: 'Roof visit' });
      expect(ids({ includeDiary: true }).filter((i) => i.startsWith('m-'))).toHaveLength(2);
    });
  });

  // ─── Hidden and raw ────────────────────────────────────────────────────────

  describe('showHidden and includeHidden', () => {
    function seedHiddenDelay(): void {
      db.insert(schema.milestones)
        .values({
          id: 1,
          title: 'Shell',
          targetDate: '2026-03-01',
          isCompleted: true,
          completedAt: '2026-03-10T09:00:00.000Z',
          createdAt: at(0),
          updatedAt: at(0),
        })
        .run();
      auto({
        id: 'delay',
        createdAt: at(5),
        entryType: 'milestone_delay',
        sourceEntityType: 'milestone',
        sourceEntityId: '1',
        metadata: JSON.stringify({ v: 1, event: 'milestone_delayed', subjectLabel: 'Shell' }),
      });
      auto({ id: 'visible', createdAt: at(6) });
    }

    it('hides R1 rows by default but counts them', () => {
      seedHiddenDelay();
      const r = list();
      expect(r.items.map((i) => i.id)).toEqual(['visible']);
      expect(r.hiddenCount).toBe(1);
    });

    it('showHidden returns R1 rows flagged hidden', () => {
      seedHiddenDelay();
      const r = list({ showHidden: true });
      expect(r.items.map((i) => [i.id, i.hidden])).toEqual([
        ['visible', undefined],
        ['delay', true],
      ]);
      expect(r.hiddenCount).toBe(1);
    });

    it('includeHidden returns raw rows: repeats and batches are not collapsed', () => {
      seedHiddenDelay();
      auto({ id: 'r-1', createdAt: at(10), sourceEntityId: 'inv-r' });
      auto({ id: 'r-2', createdAt: at(11), sourceEntityId: 'inv-r' });
      batchEvent('b-1', 12, 'batch-1', 'inv-a', { amount: 5 });
      batchEvent('b-2', 13, 'batch-1', 'inv-b', { amount: 5 });

      const collapsed = ids();
      expect(collapsed).not.toContain('r-1');
      expect(collapsed).toContain('r-2');
      expect(collapsed).not.toContain('b-2');

      const raw = list({ includeHidden: true, pageSize: 100 });
      expect(raw.items.map((i) => i.id)).toEqual(
        expect.arrayContaining(['r-1', 'r-2', 'b-1', 'b-2', 'delay']),
      );
      expect(raw.items.every((i) => i.repeat === undefined && i.batch === undefined)).toBe(true);
      expect(raw.items.find((i) => i.id === 'delay')!.hidden).toBe(true);
      expect(raw.hiddenCount).toBe(1);
    });
  });
  describe('budget_source object (#2242, JRN-035)', () => {
    beforeEach(() => {
      insertSource('src-a', 'Loan Alpha');
      insertSource('src-b', 'Loan Beta');
    });

    it('returns only the submission batches of that source, one collapsed row per batch', () => {
      batchEvent('a-1', 1, 'batch-a', 'inv-1', { amount: 100, budgetSourceId: 'src-a' });
      batchEvent('a-2', 2, 'batch-a', 'inv-2', { amount: 50, budgetSourceId: 'src-a' });
      batchEvent('a-3', 3, 'batch-a2', 'inv-3', { amount: 25, budgetSourceId: 'src-a' });
      batchEvent('b-1', 4, 'batch-b', 'inv-4', { amount: 70, budgetSourceId: 'src-b' });

      const r = list({ entityType: 'budget_source', entityId: 'src-a', pageSize: 100 });

      expect(r.items.map((i) => i.id)).toEqual(['a-3', 'a-1']);
      expect(r.items.find((i) => i.id === 'a-1')!.batch).toMatchObject({
        batchId: 'batch-a',
        invoiceCount: 2,
        amount: 150,
      });
      expect(r.object).toEqual({
        entityType: 'budget_source',
        entityId: 'src-a',
        title: 'Loan Alpha',
        exists: true,
      });
    });

    it('excludes a non-submission invoice event and an event whose source entity is the source', () => {
      batchEvent('a-1', 1, 'batch-a', 'inv-1', { amount: 1, budgetSourceId: 'src-a' });
      // Same metadata field, but not a batch
      auto({
        id: 'no-batch',
        createdAt: at(2),
        metadata: statusMeta('paid', { budgetSourceId: 'src-a' }),
      });
      // A source entity that is the source itself is not what its history shows
      auto({
        id: 'as-source',
        createdAt: at(3),
        sourceEntityType: 'budget_source',
        sourceEntityId: 'src-a',
        metadata: statusMeta('claimed', { batchId: 'batch-x', budgetSourceId: 'src-b' }),
      });
      // A different entry type with a batch id
      auto({
        id: 'other-type',
        createdAt: at(4),
        entryType: 'subsidy_status',
        metadata: statusMeta('claimed', { batchId: 'batch-y', budgetSourceId: 'src-a' }),
      });

      expect(ids({ entityType: 'budget_source', entityId: 'src-a' })).toEqual(['a-1']);
    });

    it('a deleted source resolves to exists=false and no title, and lists nothing', () => {
      const r = list({ entityType: 'budget_source', entityId: 'src-gone' });
      expect(r.items).toEqual([]);
      expect(r.object).toEqual({
        entityType: 'budget_source',
        entityId: 'src-gone',
        title: null,
        exists: false,
      });
    });

    it('a batchId filter still shows the raw members of a batch (no collapse)', () => {
      batchEvent('a-1', 1, 'batch-a', 'inv-1', { amount: 100, budgetSourceId: 'src-a' });
      batchEvent('a-2', 2, 'batch-a', 'inv-2', { amount: 50, budgetSourceId: 'src-a' });

      expect(
        ids({ entityType: 'budget_source', entityId: 'src-a', batchId: 'batch-a' }).sort(),
      ).toEqual(['a-1', 'a-2']);
    });

    it('treats the id as data: a quote in it matches nothing and breaks nothing', () => {
      batchEvent('a-1', 1, 'batch-a', 'inv-1', { amount: 1, budgetSourceId: 'src-a' });
      expect(ids({ entityType: 'budget_source', entityId: "src-a' OR '1'='1" })).toEqual([]);
    });
  });
});
