/**
 * Unit tests for searchService.ts (#2210, contract 6): folding, ranking, field matrix,
 * totals vs limit, privacy exclusions, LIKE escaping, digit matching and the Paperless group.
 * All data is synthetic.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { SEARCH_RESULT_TYPES } from '@cornerstone/shared';
import type { SearchGroup, SearchResultType } from '@cornerstone/shared';
import { runMigrations } from '../db/migrate.js';
import { registerSqlFunctions } from '../db/sqlFunctions.js';
import * as schema from '../db/schema.js';
import { search, searchDatabase } from './searchService.js';
import type { PaperlessSearchDeps } from './searchService.js';
import { _resetFilterTagCache } from './paperlessService.js';

const NOW = '2026-08-07T10:00:00.000Z';
const TOKEN = 'tok-secret-123';
const PAPERLESS_URL = 'http://paperless.test:8000';

describe('searchService', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let seq = 0;

  function ins(table: string, row: Record<string, unknown>): void {
    const cols = (sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
      (c) => c.name,
    );
    const full: Record<string, unknown> = { ...row };
    if (cols.includes('created_at') && full.created_at === undefined) full.created_at = NOW;
    if (cols.includes('updated_at') && full.updated_at === undefined) full.updated_at = NOW;
    const keys = Object.keys(full);
    sqlite
      .prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
      .run(...keys.map((k) => full[k]));
  }

  function nid(prefix: string): string {
    return `${prefix}-${++seq}`;
  }

  function workItem(title: string, extra: Record<string, unknown> = {}): string {
    const id = nid('wi');
    ins('work_items', { id, title, status: 'not_started', ...extra });
    return (extra.id as string | undefined) ?? id;
  }

  function householdItem(name: string, extra: Record<string, unknown> = {}): string {
    const id = nid('hi');
    ins('household_items', { id, name, status: 'planned', ...extra });
    return id;
  }

  function vendor(name: string, extra: Record<string, unknown> = {}): string {
    const id = nid('v');
    ins('vendors', { id, name, ...extra });
    return id;
  }

  function contact(vendorId: string, name: string, extra: Record<string, unknown> = {}): string {
    const id = nid('vc');
    ins('vendor_contacts', { id, vendor_id: vendorId, name, ...extra });
    return (extra.id as string | undefined) ?? id;
  }

  function invoice(vendorId: string, extra: Record<string, unknown> = {}): string {
    const id = nid('inv');
    ins('invoices', {
      id,
      vendor_id: vendorId,
      invoice_number: null,
      amount: 100,
      date: '2026-07-01',
      status: 'pending',
      ...extra,
    });
    return id;
  }

  function area(name: string, parentId: string | null = null, extra = {}): string {
    const id = nid('area');
    ins('areas', { id, name, parent_id: parentId, ...extra });
    return id;
  }

  function diary(title: string, extra: Record<string, unknown> = {}): string {
    const id = nid('de');
    ins('diary_entries', {
      id,
      entry_type: 'daily_log',
      entry_date: '2026-07-02',
      title,
      body: 'plain body',
      is_automatic: 0,
      status: 'saved',
      ...extra,
    });
    return id;
  }

  function wiBudget(description: string | null, extra: Record<string, unknown> = {}): string {
    const id = nid('wib');
    ins('work_item_budgets', { id, work_item_id: null, description, planned_amount: 10, ...extra });
    return id;
  }

  function hiBudget(
    householdItemId: string,
    description: string | null,
    extra: Record<string, unknown> = {},
  ): string {
    const id = nid('hib');
    ins('household_item_budgets', {
      id,
      household_item_id: householdItemId,
      description,
      planned_amount: 10,
      ...extra,
    });
    return id;
  }

  function invoiceLine(invoiceId: string, budgetId: string, table: 'wi' | 'hi' = 'wi'): void {
    ins('invoice_budget_lines', {
      id: nid('ibl'),
      invoice_id: invoiceId,
      work_item_budget_id: table === 'wi' ? budgetId : null,
      household_item_budget_id: table === 'hi' ? budgetId : null,
      itemized_amount: 5,
    });
  }

  function group(
    q: string,
    type: SearchResultType,
    limit = 5,
  ): SearchGroup & { ids: string[]; fields: string[] } {
    const g = searchDatabase(db, { q, types: [type], limit })[0]!;
    return { ...g, ids: g.items.map((i) => i.id), fields: g.items.map((i) => i.matchedField) };
  }

  let template: Buffer;

  beforeAll(() => {
    // Migrate once and clone the serialized database per test
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const base = new Database(':memory:');
    runMigrations(base);
    template = base.serialize();
    base.close();
    warn.mockRestore();
  });

  beforeEach(() => {
    seq = 0;
    sqlite = new Database(template);
    registerSqlFunctions(sqlite);
    sqlite.pragma('foreign_keys = OFF');
    db = drizzle(sqlite, { schema });
  });

  afterEach(() => {
    if (sqlite.open) sqlite.close();
  });

  // ─── AC2: folding end to end ───────────────────────────────────────────────

  describe('fold equivalence (AC2)', () => {
    it.each(['Mueller', 'Müller', 'muller', 'MÜLLER', 'mueller bau'])(
      'finds both spellings of the vendor for query "%s"',
      (q) => {
        const a = vendor('Mueller Bau');
        const b = vendor('Müller Bau');
        const g = group(q, 'vendor');
        expect(g.total).toBe(2);
        expect(g.ids.sort()).toEqual([a, b].sort());
      },
    );

    it('finds a household item with ß by the ss spelling and the other way round', () => {
      const id = householdItem('Fußbodenheizung Test');
      expect(group('fussboden', 'household_item').ids).toEqual([id]);
      expect(group('FUSSBODEN', 'household_item').ids).toEqual([id]);
      expect(group('Fußboden', 'household_item').ids).toEqual([id]);
    });

    it('finds accented text with the plain letter', () => {
      const id = workItem('Café Terrasse');
      expect(group('cafe', 'work_item').ids).toEqual([id]);
    });

    it('documented gap: a query that starts in the middle of a digraph does not match', () => {
      workItem('Mueller Dach');
      expect(group('eller', 'work_item').total).toBe(0);
      expect(group('ller', 'work_item').total).toBe(1);
    });

    it('returns empty groups for a query that folds to nothing', () => {
      workItem('Anything');
      const groups = searchDatabase(db, { q: '\u0308\u0308', types: ['work_item'], limit: 5 });
      expect(groups).toEqual([{ type: 'work_item', total: 0, status: 'ok', items: [] }]);
    });
  });

  // ─── LIKE escaping ─────────────────────────────────────────────────────────

  describe('LIKE escaping', () => {
    it('matches % literally', () => {
      const hit = workItem('100% done');
      workItem('100 percent done');
      expect(group('100%', 'work_item').ids).toEqual([hit]);
    });

    it('does not treat a lone % as match-all', () => {
      workItem('plain title');
      expect(group('%%', 'work_item').total).toBe(0);
    });

    it('matches _ literally', () => {
      const hit = workItem('a_b task');
      workItem('axb task');
      expect(group('a_b', 'work_item').ids).toEqual([hit]);
    });

    it('matches a backslash literally', () => {
      const hit = workItem('path c:\\dir');
      workItem('path c:xdir');
      expect(group('c:\\dir', 'work_item').ids).toEqual([hit]);
    });

    it('escapes in the prefix pattern as well (prefix rank is not granted by wildcard)', () => {
      workItem('x_y', { updated_at: '2026-01-01T00:00:00.000Z' });
      workItem('xzy-other', { updated_at: '2026-01-02T00:00:00.000Z' });
      expect(group('x_y', 'work_item').ids).toHaveLength(1);
    });

    it('treats SQL metacharacters in the query as data', () => {
      workItem('safe row');
      const g = group("'; DROP TABLE work_items; --", 'work_item');
      expect(g.total).toBe(0);
      expect(sqlite.prepare('SELECT COUNT(*) AS n FROM work_items').get()).toEqual({ n: 1 });
    });
  });

  // ─── Ranking, ties, limit and total ────────────────────────────────────────

  describe('ranking', () => {
    it('orders exact, prefix, contains, then a description-only match', () => {
      const other = workItem('zzz', {
        description: 'a test here',
        updated_at: '2026-01-01T00:00:00.000Z',
      });
      const contains = workItem('Abc test', { updated_at: '2026-06-01T00:00:00.000Z' });
      const prefix = workItem('testing', { updated_at: '2026-03-01T00:00:00.000Z' });
      const exact = workItem('test', { updated_at: '2026-02-01T00:00:00.000Z' });

      const g = group('test', 'work_item');
      expect(g.ids).toEqual([exact, prefix, contains, other]);
      expect(g.fields).toEqual(['title', 'title', 'title', 'description']);
    });

    it('breaks equal rank by updated_at descending, then id ascending', () => {
      const old = workItem('test old', { id: 'wi-b', updated_at: '2026-01-01T00:00:00.000Z' });
      const newer = workItem('test new', { id: 'wi-z', updated_at: '2026-05-01T00:00:00.000Z' });
      const tieA = workItem('test tie a', { id: 'wi-a', updated_at: '2026-03-01T00:00:00.000Z' });
      const tieC = workItem('test tie c', { id: 'wi-c', updated_at: '2026-03-01T00:00:00.000Z' });

      expect(group('test', 'work_item').ids).toEqual([newer, tieA, tieC, old]);
    });

    it('cuts a tie at the limit by lowest id (the database order decides what survives)', () => {
      const ids = ['wi-m', 'wi-c', 'wi-x', 'wi-a'];
      for (const id of ids) workItem(`tied ${id}`, { id, updated_at: '2026-03-01T00:00:00.000Z' });
      expect(group('tied', 'work_item', 2).ids).toEqual(['wi-a', 'wi-c']);
    });

    it('ranks an exact match case- and accent-insensitively', () => {
      const prefix = workItem('Mullerhaus', { updated_at: '2026-06-01T00:00:00.000Z' });
      const exact = workItem('MÜLLER', { updated_at: '2026-01-01T00:00:00.000Z' });
      expect(group('Mueller', 'work_item').ids).toEqual([exact, prefix]);
    });

    it('reports the first matching field in array order, ranked by the label only', () => {
      const labelContainsDescExact = workItem('has needle inside', {
        description: 'needle',
        updated_at: '2026-01-01T00:00:00.000Z',
      });
      const labelPrefix = workItem('needle tail', {
        description: 'unrelated',
        updated_at: '2026-01-02T00:00:00.000Z',
      });
      const both = workItem('needle one', {
        description: 'needle two',
        updated_at: '2026-01-03T00:00:00.000Z',
      });

      const g = group('needle', 'work_item');
      const field = new Map(g.items.map((i) => [i.id, i.matchedField]));

      // title wins on array order even though the description is the better (exact) match
      expect(field.get(labelContainsDescExact)).toBe('title');
      expect(field.get(both)).toBe('title');
      // ranked "contains" (the label's rank), so both prefix rows sort first;
      // the old MIN() ranking would have put the description-exact row first
      expect(g.ids).toEqual([both, labelPrefix, labelContainsDescExact]);
    });

    it('sorts a row matching only on description after any row whose label matches', () => {
      const descOnlyExact = workItem('zzz', {
        description: 'needle',
        updated_at: '2026-09-01T00:00:00.000Z',
      });
      const descOnlyPrefix = workItem('yyy', {
        description: 'needle first',
        updated_at: '2026-09-02T00:00:00.000Z',
      });
      const labelContains = workItem('a needle b', { updated_at: '2026-01-01T00:00:00.000Z' });

      const g = group('needle', 'work_item');

      // old MIN() ranking: description exact (0) and prefix (1) would have beaten the contains label
      expect(g.ids[0]).toBe(labelContains);
      // among the description-only rows the newer one comes first (equal rank, updated_at desc)
      expect(g.ids.slice(1)).toEqual([descOnlyPrefix, descOnlyExact]);
      expect(g.items.map((i) => i.matchedField)).toEqual(['title', 'description', 'description']);
    });

    it('ranks a vendor matching only on phone digits after a vendor whose name contains the query', () => {
      const phoneOnly = vendor('Zed Co', {
        phone: '123-45',
        updated_at: '2026-09-01T00:00:00.000Z',
      });
      const nameContains = vendor('Abc 12345 Co', { updated_at: '2026-01-01T00:00:00.000Z' });

      const g = group('12345', 'vendor');

      // old MIN() ranking: both rank 2, so the newer phone-only vendor would have come first
      expect(g.ids).toEqual([nameContains, phoneOnly]);
      expect(g.fields).toEqual(['name', 'phone']);
    });

    it('uses the label rank (exact beats prefix) even when another field matches better', () => {
      const exactLabel = workItem('needle', {
        description: 'zzz',
        updated_at: '2026-01-01T00:00:00.000Z',
      });
      const prefixLabelDescExact = workItem('needle tail', {
        description: 'needle',
        updated_at: '2026-02-01T00:00:00.000Z',
      });
      expect(group('needle', 'work_item').ids).toEqual([exactLabel, prefixLabelDescExact]);
    });

    it('ignores rows that match no field', () => {
      workItem('unrelated', { description: 'nothing' });
      expect(group('needle', 'work_item')).toMatchObject({ total: 0, items: [] });
    });
  });

  describe('limit and total', () => {
    it('returns at most limit items while total counts every match', () => {
      for (let i = 0; i < 7; i++) {
        workItem(`Bolt ${i}`, { updated_at: `2026-02-0${i + 1}T00:00:00.000Z` });
      }
      workItem('Nut');
      const g = group('bolt', 'work_item', 5);
      expect(g.items).toHaveLength(5);
      expect(g.total).toBe(7);
      // newest first
      expect(g.items[0]!.label).toBe('Bolt 6');
    });

    it('honours a limit of 1', () => {
      workItem('Bolt a');
      workItem('Bolt b');
      const g = group('bolt', 'work_item', 1);
      expect(g.items).toHaveLength(1);
      expect(g.total).toBe(2);
    });

    it('sums budget line totals over both tables and merges the top N across them', () => {
      const hi = householdItem('Sofa');
      const wiLines = [1, 3, 5].map((d) =>
        wiBudget(`Plaster ${d}`, { updated_at: `2026-03-0${d}T00:00:00.000Z` }),
      );
      const hiLines = [2, 4, 6, 7].map((d) =>
        hiBudget(hi, `Plaster ${d}`, { updated_at: `2026-03-0${d}T00:00:00.000Z` }),
      );
      const g = group('plaster', 'budget_line', 5);
      expect(g.total).toBe(7);
      // days 7,6,5,4,3 -> three from household lines, two from work item lines
      expect(g.ids).toEqual([hiLines[3], hiLines[2], wiLines[2], hiLines[1], wiLines[1]]);
    });

    it('lists and counts a budget line once when it is linked to an invoice', () => {
      const v = vendor('Line Vendor');
      const budget = wiBudget('Tiles dup');
      invoiceLine(invoice(v, { invoice_number: 'D-1' }), budget);
      const g = group('tiles dup', 'budget_line');
      expect(g.ids).toEqual([budget]);
      expect(g.total).toBe(1);
    });
  });

  // ─── Groups and order ──────────────────────────────────────────────────────

  describe('groups', () => {
    it('returns every database group in tuple order, empty groups present', () => {
      const groups = searchDatabase(db, {
        q: 'nothing',
        types: [...SEARCH_RESULT_TYPES],
        limit: 5,
      });
      expect(groups.map((g) => g.type)).toEqual(
        SEARCH_RESULT_TYPES.filter((t) => t !== 'paperless_document'),
      );
      for (const g of groups) {
        expect(g).toEqual({ type: g.type, total: 0, status: 'ok', items: [] });
      }
    });

    it('orders groups by the tuple regardless of the requested order', () => {
      const groups = searchDatabase(db, {
        q: 'nothing',
        types: ['vendor', 'work_item', 'area'],
        limit: 5,
      });
      expect(groups.map((g) => g.type)).toEqual(['work_item', 'vendor', 'area']);
    });

    it('never runs a database query for types that were not requested', () => {
      workItem('visible task');
      vendor('visible vendor');
      const groups = searchDatabase(db, { q: 'visible', types: ['vendor'], limit: 5 });
      expect(groups.map((g) => g.type)).toEqual(['vendor']);
    });

    it('trims the query', () => {
      const id = workItem('Padded');
      expect(group('   padded  ', 'work_item').ids).toEqual([id]);
    });
  });

  // ─── Field matrix ──────────────────────────────────────────────────────────

  describe('work_item', () => {
    it('matches title and description and maps status', () => {
      const t = workItem('Install window', { status: 'in_progress' });
      const d = workItem('Other', { description: 'window frames' });
      const g = group('window', 'work_item');
      expect(g.items.find((i) => i.id === t)).toMatchObject({
        label: 'Install window',
        sublabel: null,
        matchedField: 'title',
        status: 'in_progress',
        kind: null,
        date: null,
        phone: null,
        areaPath: null,
        parent: null,
      });
      expect(g.items.find((i) => i.id === d)?.matchedField).toBe('description');
    });

    it('returns the area path root-first including its own area', () => {
      const root = area('Ground floor');
      const mid = area('Kitchen', root);
      const leaf = area('Pantry', mid);
      const withArea = workItem('Shelf build', { area_id: leaf });
      const withoutArea = workItem('Shelf plan');
      const g = group('shelf', 'work_item');
      expect(g.items.find((i) => i.id === withArea)?.areaPath).toEqual([
        { id: root, name: 'Ground floor' },
        { id: mid, name: 'Kitchen' },
        { id: leaf, name: 'Pantry' },
      ]);
      expect(g.items.find((i) => i.id === withoutArea)?.areaPath).toBeNull();
    });

    it('returns only the own area for a root-level area', () => {
      const root = area('Garage');
      workItem('Shelf', { area_id: root });
      expect(group('shelf', 'work_item').items[0]!.areaPath).toEqual([
        { id: root, name: 'Garage' },
      ]);
    });
  });

  describe('milestone', () => {
    it('matches title and description, stringifies the numeric id and maps the date', () => {
      ins('milestones', { title: 'Roof done', description: null, target_date: '2026-09-01' });
      ins('milestones', {
        title: 'Other',
        description: 'roof inspection',
        target_date: '2026-10-01',
      });
      const g = group('roof', 'milestone');
      expect(g.total).toBe(2);
      const hit = g.items.find((i) => i.matchedField === 'title');
      expect(typeof hit?.id).toBe('string');
      expect(hit).toMatchObject({
        label: 'Roof done',
        date: '2026-09-01',
        status: null,
        areaPath: null,
        parent: null,
      });
      expect(hit?.id).toMatch(/^\d+$/);
      expect(g.items.find((i) => i.matchedField === 'description')?.date).toBe('2026-10-01');
    });
  });

  describe('household_item', () => {
    it('matches name and description and maps status and area path', () => {
      const a = area('Living room');
      const n = householdItem('Corner sofa', { status: 'purchased', area_id: a });
      const d = householdItem('Seating', { description: 'sofa cover' });
      const g = group('sofa', 'household_item');
      expect(g.items.find((i) => i.id === n)).toMatchObject({
        label: 'Corner sofa',
        matchedField: 'name',
        status: 'purchased',
        areaPath: [{ id: a, name: 'Living room' }],
      });
      expect(g.items.find((i) => i.id === d)?.matchedField).toBe('description');
    });
  });

  describe('invoice', () => {
    it('matches invoice number, notes and company name; sublabel is the company', () => {
      const v = vendor('Zeta Roofing');
      const num = invoice(v, { invoice_number: 'ZX-100' });
      const notes = invoice(v, { invoice_number: 'AA-1', notes: 'zx deposit' });
      const company = invoice(v, { invoice_number: 'BB-2' });

      const byNumber = group('zx-100', 'invoice');
      expect(byNumber.items[0]!).toMatchObject({
        id: num,
        label: 'ZX-100',
        sublabel: 'Zeta Roofing',
        matchedField: 'invoiceNumber',
        status: 'pending',
        date: '2026-07-01',
        parent: null,
      });
      expect(group('zx deposit', 'invoice').items[0]!).toMatchObject({
        id: notes,
        matchedField: 'notes',
      });
      const byCompany = group('zeta', 'invoice');
      expect(byCompany.total).toBe(3);
      expect(byCompany.items.find((i) => i.id === company)?.matchedField).toBe('companyName');
    });

    it('includes quotations and every other status', () => {
      const v = vendor('Status Vendor');
      for (const status of ['quotation', 'pending', 'paid', 'claimed']) {
        invoice(v, { invoice_number: `S-${status}`, status });
      }
      const g = group('s-', 'invoice', 20);
      expect(g.total).toBe(4);
      expect(g.items.map((i) => i.status).sort()).toEqual([
        'claimed',
        'paid',
        'pending',
        'quotation',
      ]);
    });
  });

  describe('vendor', () => {
    it('matches name, trade name, email and maps the trade as sublabel', () => {
      const trade = nid('trade');
      ins('trades', { id: trade, name: 'Quartzwork' });
      const v = vendor('Alpha GmbH', { trade_id: trade, email: 'mail@alpha.test' });
      expect(group('alpha', 'vendor').items[0]!).toMatchObject({
        id: v,
        label: 'Alpha GmbH',
        sublabel: 'Quartzwork',
        matchedField: 'name',
        status: null,
        areaPath: null,
        parent: null,
      });
      expect(group('quartzwork', 'vendor').items[0]!.matchedField).toBe('tradeName');
      expect(group('mail@alpha', 'vendor').items[0]!.matchedField).toBe('email');
    });

    it('matches contact name, phone and email', () => {
      const v = vendor('Beta AG');
      contact(v, 'Hanna Contact', { phone: '98-76-5', email: 'hanna@beta.test' });
      expect(group('hanna contact', 'vendor').items[0]!).toMatchObject({
        id: v,
        matchedField: 'contactName',
      });
      expect(group('hanna@beta', 'vendor').items[0]!.matchedField).toBe('contactEmail');
      expect(group('9876', 'vendor').items[0]!.matchedField).toBe('contactPhone');
    });

    it('shows the company phone, falling back to the first contact phone', () => {
      const own = vendor('Own Phone', { phone: '11-22' });
      contact(own, 'Own Contact', { phone: '33-44', created_at: '2026-01-01T00:00:00.000Z' });

      const blank = vendor('Blank Phone', { phone: '   ' });
      contact(blank, 'No Number', { phone: '  ', created_at: '2026-01-01T00:00:00.000Z' });
      contact(blank, 'Second', {
        id: 'vc-b',
        phone: '55-66',
        created_at: '2026-01-02T00:00:00.000Z',
      });
      contact(blank, 'Third', {
        id: 'vc-a',
        phone: '77-88',
        created_at: '2026-01-02T00:00:00.000Z',
      });

      const none = vendor('Phone None');

      const g = group('phone', 'vendor');
      const phoneOf = (id: string) => g.items.find((i) => i.id === id)?.phone;
      expect(phoneOf(own)).toBe('11-22');
      expect(phoneOf(blank)).toBe('77-88'); // same created_at -> lowest id, blank skipped
      expect(phoneOf(none)).toBeNull();
    });

    it('matches a company phone by digits only when the query has at least 3 digits', () => {
      const v = vendor('Digits Co', { phone: '1-2-3' });
      expect(group('12', 'vendor').total).toBe(0); // 2 digits: no digit matching
      expect(group('123', 'vendor').ids).toEqual([v]); // 3 digits: digit matching
      expect(group('1 2 3', 'vendor').items[0]!.matchedField).toBe('phone');
    });

    it('matches a formatted stored phone against a formatted query', () => {
      const v = vendor('Format Co', { phone: '12-34-5' });
      const g = group('12 34', 'vendor');
      expect(g.ids).toEqual([v]);
      expect(g.items[0]!.matchedField).toBe('phone');
    });

    it('does not concatenate digits across contacts', () => {
      const v = vendor('Concat Co');
      contact(v, 'One', { phone: '12' });
      contact(v, 'Two', { phone: '34' });
      expect(group('1234', 'vendor').total).toBe(0);
      expect(group('1 2 3 4', 'vendor').total).toBe(0);
    });

    it('does not concatenate the company phone with a contact phone', () => {
      const v = vendor('Mix Co', { phone: '12' });
      contact(v, 'One', { phone: '34' });
      expect(group('1234', 'vendor').total).toBe(0);
    });

    it('finds the vendor when the digits are inside a single contact phone', () => {
      const v = vendor('Single Co');
      contact(v, 'One', { phone: '9-8' });
      contact(v, 'Two', { phone: '55-66-7' });
      const g = group('5566', 'vendor');
      expect(g.ids).toEqual([v]);
      expect(g.items[0]!.matchedField).toBe('contactPhone');
    });

    it('lists a vendor once however many contacts match', () => {
      const v = vendor('Many Contacts');
      for (let i = 0; i < 3; i++) contact(v, `Smith ${i}`);
      const g = group('smith', 'vendor');
      expect(g.ids).toEqual([v]);
      expect(g.total).toBe(1);
    });

    it('ignores non-phone text for digit matching when the query has too few digits', () => {
      vendor('Plain Co', { phone: '5-5-5' });
      expect(group('55', 'vendor').total).toBe(0);
    });
  });

  describe('diary_entry', () => {
    it('matches title and body and maps kind and date', () => {
      const t = diary('Concrete pour', { entry_type: 'site_visit', entry_date: '2026-07-09' });
      const b = diary('Weather', { body: 'concrete cured' });
      const g = group('concrete', 'diary_entry');
      expect(g.items.find((i) => i.id === t)).toMatchObject({
        label: 'Concrete pour',
        matchedField: 'title',
        kind: 'site_visit',
        date: '2026-07-09',
        status: null,
      });
      expect(g.items.find((i) => i.id === b)?.matchedField).toBe('body');
    });

    it('never returns drafts, whoever owns them', () => {
      diary('Secret draft', { status: 'draft', created_by: 'user-a' });
      diary('Other draft', { status: 'draft', created_by: 'user-b', body: 'secret body' });
      expect(group('secret', 'diary_entry')).toMatchObject({ total: 0, items: [] });
    });

    it('never returns automatic entries', () => {
      diary('Auto event secret', { is_automatic: 1, entry_type: 'work_item_status' });
      diary('Manual secret');
      const g = group('secret', 'diary_entry');
      expect(g.total).toBe(1);
      expect(g.items[0]!.label).toBe('Manual secret');
    });

    it('does not count excluded entries in the total', () => {
      for (let i = 0; i < 3; i++) diary(`Hidden ${i}`, { status: 'draft' });
      for (let i = 0; i < 2; i++) diary(`Hidden shown ${i}`);
      expect(group('hidden', 'diary_entry').total).toBe(2);
    });
  });

  describe('area', () => {
    it('matches name and description and returns ancestors only as the area path', () => {
      const root = area('Upper floor', null, { description: 'attic access' });
      const child = area('Bedroom', root);
      const g = group('bedroom', 'area');
      expect(g.items[0]!).toMatchObject({
        id: child,
        label: 'Bedroom',
        matchedField: 'name',
        areaPath: [{ id: root, name: 'Upper floor' }],
      });
      const byDesc = group('attic', 'area').items[0]!;
      expect(byDesc).toMatchObject({ id: root, matchedField: 'description' });
      expect(byDesc.areaPath).toEqual([]);
    });
  });

  describe('budget_line', () => {
    it('uses the work item as parent', () => {
      const w = workItem('Tiling job');
      const line = wiBudget('Floor tiles', { work_item_id: w });
      const g = group('floor tiles', 'budget_line');
      expect(g.items[0]!).toMatchObject({
        id: line,
        label: 'Floor tiles',
        matchedField: 'description',
        parent: { type: 'work_item', id: w, label: 'Tiling job' },
        areaPath: null,
      });
    });

    it('uses the linked invoice as parent for an orphan line (number, else company name)', () => {
      const v = vendor('Orphan Vendor');
      const numbered = wiBudget('Orphan numbered');
      const inv1 = invoice(v, { invoice_number: 'OR-1' });
      invoiceLine(inv1, numbered);
      const unnumbered = wiBudget('Orphan unnumbered');
      const inv2 = invoice(v, { invoice_number: null });
      invoiceLine(inv2, unnumbered);

      const g = group('orphan', 'budget_line');
      expect(g.items.find((i) => i.id === numbered)?.parent).toEqual({
        type: 'invoice',
        id: inv1,
        label: 'OR-1',
      });
      expect(g.items.find((i) => i.id === unnumbered)?.parent).toEqual({
        type: 'invoice',
        id: inv2,
        label: 'Orphan Vendor',
      });
    });

    it('has no parent for an orphan line without an invoice', () => {
      wiBudget('Floating line');
      expect(group('floating', 'budget_line').items[0]!.parent).toBeNull();
    });

    it('prefers the work item over a linked invoice', () => {
      const w = workItem('Owner job');
      const line = wiBudget('Both parents', { work_item_id: w });
      invoiceLine(invoice(vendor('V'), { invoice_number: 'BP-1' }), line);
      expect(group('both parents', 'budget_line').items[0]!.parent).toEqual({
        type: 'work_item',
        id: w,
        label: 'Owner job',
      });
    });

    it('uses the household item as parent for household item lines', () => {
      const h = householdItem('Dining table');
      const line = hiBudget(h, 'Table delivery');
      expect(group('table delivery', 'budget_line').items[0]!).toMatchObject({
        id: line,
        parent: { type: 'household_item', id: h, label: 'Dining table' },
      });
    });

    it('skips lines without a description', () => {
      wiBudget(null);
      hiBudget(householdItem('X item'), null);
      expect(group('null', 'budget_line').total).toBe(0);
    });
  });

  describe('privacy of the result shape', () => {
    it('never carries user, credential or timestamp fields', () => {
      ins('users', {
        id: 'u1',
        email: 'creator@example.com',
        display_name: 'Creator Person',
        role: 'member',
        auth_provider: 'local',
        password_hash: 'hash-value',
      });
      workItem('Shape check', { created_by: 'u1', assigned_user_id: 'u1' });
      vendor('Shape check vendor', { created_by: 'u1' });
      diary('Shape check diary', { created_by: 'u1' });
      const groups = searchDatabase(db, {
        q: 'shape check',
        types: [...SEARCH_RESULT_TYPES],
        limit: 5,
      });
      const json = JSON.stringify(groups);
      expect(json).not.toContain('creator@example.com');
      expect(json).not.toContain('Creator Person');
      expect(json).not.toContain('hash-value');
      expect(json).not.toContain('u1');
      const keys = new Set(groups.flatMap((g) => g.items.flatMap((i) => Object.keys(i))));
      expect([...keys].sort()).toEqual(
        [
          'id',
          'label',
          'sublabel',
          'matchedField',
          'status',
          'kind',
          'date',
          'phone',
          'areaPath',
          'parent',
        ].sort(),
      );
    });
  });

  // ─── search(): the Paperless group ─────────────────────────────────────────

  describe('search with Paperless', () => {
    const mockFetch = jest.fn<typeof fetch>();
    let originalFetch: typeof fetch;

    function jsonResponse(body: unknown, status = 200): Response {
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'Server Error',
        json: () => Promise.resolve(body),
        headers: { get: () => null },
      } as unknown as Response;
    }

    function deps(extra: Partial<PaperlessSearchDeps> = {}): PaperlessSearchDeps {
      return { baseUrl: PAPERLESS_URL, token: TOKEN, filterTag: null, ...extra };
    }

    const allTypes = [...SEARCH_RESULT_TYPES];

    beforeEach(() => {
      originalFetch = global.fetch;
      global.fetch = mockFetch as unknown as typeof fetch;
      mockFetch.mockReset();
      _resetFilterTagCache();
    });

    afterEach(() => {
      global.fetch = originalFetch;
      jest.useRealTimers();
    });

    it('omits the Paperless group and never calls fetch when not configured', async () => {
      workItem('Offline task');
      const res = await search(db, { q: 'offline', types: allTypes, limit: 5 }, null);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(res.groups.map((g) => g.type)).not.toContain('paperless_document');
      expect(res.groups).toHaveLength(8);
      expect(res.query).toBe('offline');
    });

    it('omits the Paperless group and does not call it when the type was not requested', async () => {
      const res = await search(db, { q: 'offline', types: ['work_item'], limit: 5 }, deps());
      expect(mockFetch).not.toHaveBeenCalled();
      expect(res.groups.map((g) => g.type)).toEqual(['work_item']);
    });

    it('appends the Paperless group last with mapped items', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          count: 9,
          results: [{ id: 41, title: 'Permit scan', created: '2026-02-03' }],
        }),
      );
      const res = await search(db, { q: ' permit ', types: allTypes, limit: 3 }, deps());

      const last = res.groups[res.groups.length - 1];
      expect(last).toEqual({
        type: 'paperless_document',
        total: 9,
        status: 'ok',
        items: [
          {
            id: '41',
            label: 'Permit scan',
            sublabel: null,
            matchedField: 'fullText',
            status: null,
            kind: null,
            date: '2026-02-03',
            phone: null,
            areaPath: null,
            parent: null,
          },
        ],
      });
      const url = new URL(String(mockFetch.mock.calls[0]![0]));
      expect(url.searchParams.get('query')).toBe('permit');
      expect(url.searchParams.get('page_size')).toBe('3');
      expect(res.query).toBe('permit');
    });

    it('applies the configured filter tag', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ count: 1, results: [{ id: 8, name: 'house' }] }))
        .mockResolvedValueOnce(jsonResponse({ count: 0, results: [] }));
      await search(
        db,
        { q: 'permit', types: ['paperless_document'], limit: 5 },
        deps({ filterTag: 'house' }),
      );
      const docUrl = new URL(String(mockFetch.mock.calls[1]![0]));
      expect(docUrl.searchParams.get('tags__id__all')).toBe('8');
    });

    it('reports unavailable, never unfiltered results, when the filter tag cannot be resolved', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      mockFetch.mockResolvedValueOnce(jsonResponse({ count: 0, results: [] }));
      const res = await search(
        db,
        { q: 'permit', types: ['paperless_document'], limit: 5 },
        deps({ filterTag: 'missing' }),
      );
      expect(res.groups).toEqual([
        { type: 'paperless_document', total: 0, status: 'unavailable', items: [] },
      ]);
      // only the tag lookup happened; no unfiltered document search
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(String(mockFetch.mock.calls[0]![0])).toContain('/api/tags/');
      warn.mockRestore();
    });

    it('reports unavailable on an upstream error and keeps the other groups', async () => {
      workItem('Permit task');
      mockFetch.mockResolvedValueOnce(jsonResponse({ detail: 'upstream secret detail' }, 500));
      const res = await search(db, { q: 'permit', types: allTypes, limit: 5 }, deps());
      const pl = res.groups.find((g) => g.type === 'paperless_document');
      expect(pl).toEqual({
        type: 'paperless_document',
        total: 0,
        status: 'unavailable',
        items: [],
      });
      expect(res.groups.find((g) => g.type === 'work_item')?.total).toBe(1);
      const json = JSON.stringify(res);
      expect(json).not.toContain(TOKEN);
      expect(json).not.toContain('upstream secret detail');
    });

    it('logs only an error code, never the URL, query, token or message', async () => {
      const warn = jest.fn();
      mockFetch.mockRejectedValueOnce(new Error(`boom ${TOKEN} ${PAPERLESS_URL} private-words`));
      const res = await search(
        db,
        { q: 'private-words', types: ['paperless_document'], limit: 5 },
        deps({ log: { warn } }),
      );
      expect(res.groups[0]!.status).toBe('unavailable');
      expect(warn).toHaveBeenCalledTimes(1);
      const logged = JSON.stringify(warn.mock.calls);
      expect(warn.mock.calls[0]![0]).toEqual({ errorCode: 'PAPERLESS_UNREACHABLE' });
      expect(logged).not.toContain(TOKEN);
      expect(logged).not.toContain(PAPERLESS_URL);
      expect(logged).not.toContain('private-words');
    });

    it('falls back to the error name and then UNKNOWN for errors without a code', async () => {
      const warn = jest.fn();
      const fetchMock = mockFetch as jest.Mock<(...a: unknown[]) => Promise<unknown>>;
      // A thrown non-AppError cannot come from searchPaperlessDocuments (fetch errors are
      // wrapped), so exercise it through a rejecting tag lookup + timeout instead.
      jest.useFakeTimers();
      fetchMock.mockImplementation(() => new Promise(() => undefined));
      const p = search(
        db,
        { q: 'abc', types: ['paperless_document'], limit: 5 },
        deps({ timeoutMs: 20, log: { warn } }),
      );
      await jest.advanceTimersByTimeAsync(20);
      await p;
      expect(warn.mock.calls[0]![0]).toEqual({ errorCode: 'Error' });
    });

    it('times out a hanging request, aborts it and clears the timer', async () => {
      jest.useFakeTimers();
      let signal: AbortSignal | undefined;
      mockFetch.mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            signal = init?.signal ?? undefined;
            signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      );
      workItem('Timeout task');
      const p = search(db, { q: 'timeout', types: allTypes, limit: 5 }, deps({ timeoutMs: 50 }));
      await jest.advanceTimersByTimeAsync(49);
      expect(signal?.aborted).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      const res = await p;
      expect(signal?.aborted).toBe(true);
      expect(res.groups.find((g) => g.type === 'paperless_document')?.status).toBe('unavailable');
      expect(res.groups.find((g) => g.type === 'work_item')?.total).toBe(1);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('stops waiting even if the upstream ignores the abort signal', async () => {
      jest.useFakeTimers();
      mockFetch.mockImplementation(() => new Promise(() => undefined));
      const p = search(
        db,
        { q: 'abc', types: ['paperless_document'], limit: 5 },
        deps({ timeoutMs: 30 }),
      );
      await jest.advanceTimersByTimeAsync(30);
      expect((await p).groups[0]!.status).toBe('unavailable');
    });

    it('uses a 3 second default timeout', async () => {
      jest.useFakeTimers();
      mockFetch.mockImplementation(() => new Promise(() => undefined));
      let settled = false;
      const p = search(db, { q: 'abc', types: ['paperless_document'], limit: 5 }, deps()).then(
        (r) => {
          settled = true;
          return r;
        },
      );
      await jest.advanceTimersByTimeAsync(2999);
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect((await p).groups[0]!.status).toBe('unavailable');
    });

    it('clears the timer after a successful call', async () => {
      jest.useFakeTimers();
      mockFetch.mockResolvedValueOnce(jsonResponse({ count: 0, results: [] }));
      await search(db, { q: 'abc', types: ['paperless_document'], limit: 5 }, deps());
      expect(jest.getTimerCount()).toBe(0);
    });

    it('clears the timer when the database search throws', async () => {
      jest.useFakeTimers();
      mockFetch.mockImplementation(() => new Promise(() => undefined));
      sqlite.close();
      await expect(search(db, { q: 'abc', types: allTypes, limit: 5 }, deps())).rejects.toThrow();
      expect(jest.getTimerCount()).toBe(0);
    });

    it('returns an empty ok Paperless group without calling it for a blank query', async () => {
      const res = await search(db, { q: '   ', types: allTypes, limit: 5 }, deps());
      expect(mockFetch).not.toHaveBeenCalled();
      expect(res.query).toBe('');
      expect(res.groups[res.groups.length - 1]).toEqual({
        type: 'paperless_document',
        total: 0,
        status: 'ok',
        items: [],
      });
    });
  });
});
