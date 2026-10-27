/**
 * Attention service on the synthetic fixture (#2229): real in-memory SQLite with migrations,
 * the real scheduling engine and the real money service. T = 2026-03-10, `now` injected.
 *
 * Mutations these tests catch:
 *  - a rule predicate drifting from the QA table (any row appearing or missing in the exact key sets);
 *  - the service computing its own Late / holds-up / ready-to-submit / not-yet-split / still-to-pay
 *    instead of the shared definitions (the consistency blocks compare with no tolerance);
 *  - photos, system events or drafts of the automatic kind producing rows (AC4);
 *  - a user's name, e-mail or id reaching a response (AC10);
 *  - ordering: first row is the one that holds up the most work; the full list obeys the comparator;
 *  - the critical line drifting from the former Critical Path card rule;
 *  - Not-now not applied per user, snoozedCount / count / includeSnoozed mismatches;
 *  - "today" taken from the local clock instead of the UTC instant.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import {
  ATTENTION_RULES,
  type AttentionResponse,
  type AttentionRow,
  type AttentionParams,
} from '@cornerstone/shared';
import {
  EXPECTED_H2_KEYS,
  EXPECTED_ROW_KEYS,
  EXPECTED_TIDY_KEYS,
  FIXTURE_NOW,
  FIXTURE_TODAY,
  FIXTURE_USER,
  seedAttentionFixture,
  type FixtureDb,
} from '../test/attentionFixture.js';
import { getAttention } from './attentionService.js';
import { snooze } from './attentionSnoozeService.js';
import { computeProjectMoney, listOpenPayments } from './moneyService.js';
import { getDrawDownSet, getSourceReport } from './sourceReportService.js';
import {
  computeScheduleProjection,
  loadScheduleGraph,
  projectSchedule,
} from './schedulingEngine.js';
import { getTimeline } from './timelineService.js';
import { buildScheduleIndex, computeHoldsUp } from './shared/holdsUp.js';

const VAT = 0.19;

describe('attentionService on the synthetic fixture', () => {
  let sqlite: Database.Database;
  let db: FixtureDb;

  function attention(
    o: { includeSnoozed?: boolean; now?: string; userId?: string } = {},
  ): AttentionResponse {
    return getAttention(db, {
      userId: o.userId ?? FIXTURE_USER.id,
      vatRate: VAT,
      includeSnoozed: o.includeSnoozed ?? false,
      now: new Date(o.now ?? FIXTURE_NOW),
    });
  }

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    seedAttentionFixture(db);
  });

  afterEach(() => {
    jest.useRealTimers();
    sqlite.close();
  });

  const row = (res: AttentionResponse, key: string): AttentionRow => {
    const found = [...res.rows, ...res.tidyUp].find((r) => r.key === key);
    if (!found) throw new Error(`missing row ${key}`);
    return found;
  };

  // ─── Exact key sets ─────────────────────────────────────────────────────────

  describe('which rows exist', () => {
    it('rows are exactly the positive records of the fixture (every negative produces nothing)', () => {
      const res = attention();
      expect(res.today).toBe(FIXTURE_TODAY);
      expect(res.rows.map((r) => r.key).sort()).toEqual([...EXPECTED_ROW_KEYS].sort());
    });

    it('tidyUp is exactly H1, H2 and H4 of the fixture', () => {
      const res = attention();
      expect(res.tidyUp.map((r) => r.key).sort()).toEqual([...EXPECTED_TIDY_KEYS].sort());
      expect(res.tidyUp.every((r) => r.tier === 'tidy' && r.severity === 'none')).toBe(true);
      expect(res.tidyUp.every((r) => r.holdsUp === null)).toBe(true);
    });

    it('standing holds only the over-allocated source and no row duplicates it', () => {
      const res = attention();
      expect(res.standing.map((s) => s.key)).toEqual(['S1:budget_source:src-small']);
      expect([...res.rows, ...res.tidyUp].some((r) => r.subject.id === 'src-small')).toBe(false);
    });

    it('names no negative record in rows (spot checks per rule)', () => {
      const keys = attention().rows.map((r) => r.key);
      for (const absent of [
        'wi-2',
        'wi-3',
        'wi-4',
        'wi-5',
        'wi-8',
        'wi-undated',
        'wi-f2',
        'wi-9',
        'wi-6',
        'wi-6b',
        'inv-3',
        'inv-6',
        'inv-7',
        'inv-9',
        'inv-10',
        'off-2',
        'off-4',
        'hi-4',
        'hi-5',
        'hi-6',
        'gr-3',
        'gr-4',
        'gr-5',
        'd-resolved',
        'd-draft-issue',
        'd-auto',
        'src-own',
        'src-credit',
        'src-small',
      ]) {
        expect(keys.filter((k) => k.endsWith(`:${absent}`))).toEqual([]);
      }
      expect(keys).not.toContain('N3:milestone:1');
      expect(keys).not.toContain('N3:milestone:4');
      expect(keys).not.toContain('N3:milestone:5');
    });

    it('never contains H3, N7, or any photo / system-event row (AC4)', () => {
      const res = attention();
      expect(
        db
          .select()
          .from(schema.photos)
          .all()
          .map((p) => p.id)
          .sort(),
      ).toEqual(['photo-area', 'photo-none']);
      const all = [...res.rows, ...res.tidyUp];
      for (const r of all) {
        expect(r.rule).not.toBe('H3');
        expect(r.rule).not.toBe('N7');
        expect(r.subject.type).not.toMatch(/photo/);
        expect(r.key).not.toMatch(/photo/);
        expect(r.subject.id).not.toBe('dr-auto');
      }
      expect(JSON.stringify(res)).not.toMatch(/photo/i);
      expect(all.every((r) => (ATTENTION_RULES as readonly string[]).includes(r.rule))).toBe(true);
    });
  });

  // ─── Row details ────────────────────────────────────────────────────────────

  describe('row details', () => {
    it('N1: late in-progress task with area, company, holds-up through a milestone gate', () => {
      expect(row(attention(), 'N1:work_item:wi-1')).toEqual({
        key: 'N1:work_item:wi-1',
        rule: 'N1',
        tier: 'late',
        severity: 'red',
        subject: {
          type: 'work_item',
          id: 'wi-1',
          label: 'Task A',
          area: {
            id: 'a-2',
            name: 'Ground floor',
            color: null,
            ancestors: [{ id: 'a-1', name: 'Building', color: null }],
          },
        },
        date: '2026-03-05',
        amount: null,
        holdsUp: { count: 3, startingWithin14Days: 2 },
        params: {
          rule: 'N1',
          plannedEndDate: '2026-03-05',
          projectedEndDate: '2026-03-10',
          daysLate: 5,
          companyName: 'Company A',
        },
        actions: ['mark_done', 'reschedule'],
        link: { route: 'workItem', params: { id: 'wi-1' }, query: {} },
        snoozedUntil: null,
      });
    });

    it('N2: individual late-to-start rows, the 4-task group, and the folded task', () => {
      const res = attention();
      expect(row(res, 'N2:work_item:wi-7')).toMatchObject({
        date: '2026-03-07',
        params: {
          rule: 'N2',
          kind: 'task',
          plannedStartDate: '2026-03-07',
          projectedStartDate: '2026-03-10',
          daysLate: 3,
          companyName: null,
        },
        actions: ['start', 'reschedule'],
        link: { route: 'workItem', params: { id: 'wi-7' }, query: {} },
      });
      expect(row(res, 'N2:work_item:wi-d').params).toMatchObject({ daysLate: 1 });
      expect(row(res, 'N2:work_item:wi-f1').holdsUp).toEqual({
        count: 1,
        startingWithin14Days: 1,
      });
      const group = row(res, 'N2:group:2026-03-02');
      expect(group.subject).toEqual({ type: 'group', id: '2026-03-02', label: null, area: null });
      expect(group.link).toEqual({ route: 'workItems', params: {}, query: {} });
      const params = group.params as Extract<AttentionParams, { rule: 'N2'; kind: 'group' }>;
      expect(params.items.map((i) => i.id)).toEqual(['wi-g1', 'wi-g2', 'wi-g3', 'wi-g4']);
      expect(params.items.every((i) => i.daysLate === 8)).toBe(true);
      // wi-h1..h3 (3 on 03-03) stay separate
      for (const n of [1, 2, 3]) expect(row(res, `N2:work_item:wi-h${n}`)).toBeDefined();
      expect(res.rows.some((r) => r.key === 'N2:work_item:wi-f2')).toBe(false);
    });

    it('N3: a past target and a forecast after the target, with holds-up of the waiting task', () => {
      const res = attention();
      expect(row(res, 'N3:milestone:2')).toMatchObject({
        subject: { type: 'milestone', id: '2', label: 'Milestone 2' },
        date: '2026-03-01',
        holdsUp: { count: 1, startingWithin14Days: 1 },
        params: {
          rule: 'N3',
          targetDate: '2026-03-01',
          projectedDate: null,
          daysAfterTarget: null,
          daysSinceTarget: 9,
        },
        actions: ['change_target', 'open'],
        link: { route: 'milestone', params: { id: '2' }, query: {} },
      });
      expect(row(res, 'N3:milestone:3').params).toEqual({
        rule: 'N3',
        targetDate: '2026-03-19',
        projectedDate: '2026-03-20',
        daysAfterTarget: 1,
        daysSinceTarget: null,
      });
    });

    it('N4/N5/N6 params carry the company id (the vendor id) next to the name (#2230)', () => {
      const res = attention();
      expect(row(res, 'N4:invoice:inv-1').params).toMatchObject({
        companyId: 'v-a',
        companyName: 'Company A',
      });
      // a different company on the same rule
      expect(row(res, 'N4:progress_payment:dep-1').params).toMatchObject({
        companyId: 'v-b',
        companyName: 'Company B',
      });
      expect(row(res, 'N5:invoice:inv-2').params).toMatchObject({ companyId: 'v-a' });
      expect(row(res, 'N5:progress_payment:dep-2').params).toMatchObject({ companyId: 'v-a' });
      expect(row(res, 'N6:invoice:inv-5').params).toMatchObject({ companyId: 'v-a' });
    });

    it('N4/N5/N6: final and progress payments, offers included', () => {
      const res = attention();
      expect(row(res, 'N4:invoice:inv-1')).toMatchObject({
        tier: 'overdue',
        severity: 'red',
        date: '2026-03-01',
        amount: 1000,
        params: {
          paymentKind: 'final',
          recordKind: 'invoice',
          invoiceNumber: 'NR-inv-1',
          companyName: 'Company A',
          dueInDays: -9,
          daysOpen: 18,
        },
        link: { route: 'invoice', params: { id: 'inv-1' }, query: {} },
        actions: ['mark_paid'],
      });
      expect(row(res, 'N4:progress_payment:dep-1')).toMatchObject({
        date: '2026-03-05',
        amount: 400,
        subject: { type: 'progress_payment', id: 'dep-1' },
        params: { paymentKind: 'progress', invoiceId: 'inv-4', companyName: 'Company B' },
        link: { route: 'invoice', params: { id: 'inv-4' }, query: { payment: 'dep-1' } },
      });
      expect(row(res, 'N5:invoice:inv-2')).toMatchObject({ amount: 800, date: '2026-03-17' });
      expect(row(res, 'N5:invoice:inv-2b')).toMatchObject({ amount: 600, date: '2026-03-10' });
      expect(row(res, 'N5:progress_payment:dep-2')).toMatchObject({
        amount: 300,
        params: { recordKind: 'offer', paymentKind: 'progress', invoiceId: 'off-1' },
        link: { route: 'invoice', params: { id: 'off-1' }, query: { payment: 'dep-2' } },
      });
      expect(row(res, 'N6:invoice:inv-5')).toMatchObject({
        tier: 'due',
        severity: 'amber',
        date: '2026-02-08',
        amount: 700,
        params: { dueDate: null, dueInDays: null, daysOpen: 30 },
      });
      // inv-4: final residual 2100 with no due date and a recent invoice date: no N6
      expect(res.rows.some((r) => r.key === 'N6:invoice:inv-4')).toBe(false);
    });

    it('N8: one row for the loan with the ready-to-submit amount and count', () => {
      expect(row(attention(), 'N8:budget_source:src-loan')).toMatchObject({
        tier: 'ready',
        severity: 'amber',
        date: null,
        amount: 5000,
        params: { rule: 'N8', sourceType: 'bank_loan', count: 1 },
        actions: ['prepare_bank_report'],
        link: { route: 'bankReport', params: {}, query: { sourceId: 'src-loan' } },
      });
    });

    it('N9: offers due within 7 days or past due', () => {
      const res = attention();
      expect(row(res, 'N9:invoice:off-1')).toMatchObject({
        date: '2026-03-12',
        amount: 2000,
        params: { rule: 'N9', dueInDays: 2, companyName: 'Company A' },
        actions: ['open', 'convert'],
      });
      expect(row(res, 'N9:invoice:off-3').params).toMatchObject({ dueInDays: -9 });
    });

    it('N10: late purchase is red with area and company; due ones are amber', () => {
      const res = attention();
      expect(row(res, 'N10:household_item:hi-1')).toMatchObject({
        tier: 'late',
        severity: 'red',
        date: '2026-03-05',
        subject: { label: 'Purchase hi-1', area: { id: 'a-2' } },
        params: { isLate: true, dueInDays: -5, status: 'purchased', companyName: 'Company B' },
        link: { route: 'householdItem', params: { id: 'hi-1' }, query: {} },
      });
      expect(row(res, 'N10:household_item:hi-2')).toMatchObject({ tier: 'due', severity: 'amber' });
      expect(row(res, 'N10:household_item:hi-3')).toMatchObject({
        tier: 'due',
        date: '2026-03-17',
      });
    });

    it('N11: eligible deadline T+14 and applied deadline T; link to the grant page', () => {
      const res = attention();
      expect(row(res, 'N11:subsidy_program:gr-1')).toMatchObject({
        date: '2026-03-24',
        params: { status: 'eligible', deadline: '2026-03-24', dueInDays: 14 },
        link: { route: 'grant', params: { id: 'gr-1' }, query: {} },
      });
      expect(row(res, 'N11:subsidy_program:gr-2').params).toMatchObject({
        status: 'applied',
        dueInDays: 0,
      });
    });

    it('N12: open, in progress, and missing or malformed metadata reported as open', () => {
      const res = attention();
      expect(row(res, 'N12:diary_entry:d-open').params).toEqual({
        rule: 'N12',
        resolutionStatus: 'open',
        severity: 'high',
        entryDate: '2026-03-02',
      });
      expect(row(res, 'N12:diary_entry:d-prog').params).toMatchObject({
        resolutionStatus: 'in_progress',
        severity: 'low',
      });
      expect(row(res, 'N12:diary_entry:d-none').params).toMatchObject({
        resolutionStatus: 'open',
        severity: 'medium',
      });
      expect(row(res, 'N12:diary_entry:d-bad').params).toMatchObject({
        resolutionStatus: 'open',
        severity: null,
      });
      expect(row(res, 'N12:diary_entry:d-open').link).toEqual({
        route: 'diaryEntry',
        params: { id: 'd-open' },
        query: {},
      });
    });

    it('an unknown severity string in the metadata is reported as null', () => {
      db.insert(schema.diaryEntries)
        .values({
          id: 'd-odd',
          entryType: 'issue',
          entryDate: '2026-03-03',
          title: 'Defect odd',
          body: '',
          metadata: JSON.stringify({ severity: 'catastrophic', resolutionStatus: 'open' }),
          status: 'saved',
          isAutomatic: false,
          createdAt: '2026-03-03T00:00:00.000Z',
          updatedAt: '2026-03-03T00:00:00.000Z',
        })
        .run();
      expect(row(attention(), 'N12:diary_entry:d-odd').params).toMatchObject({ severity: null });
    });

    it('H1/H2/H4: unfinished logs older than 24 h, not-fully-split records, ended-not-done tasks', () => {
      const res = attention();
      expect(row(res, 'H1:diary_entry:dr-old')).toMatchObject({
        date: '2026-03-08',
        params: { rule: 'H1', entryType: 'daily_log', updatedAt: '2026-03-08T10:00:00.000Z' },
        actions: ['continue', 'discard'],
        link: { route: 'diaryEntryEdit', params: { id: 'dr-old' }, query: {} },
      });
      expect(row(res, 'H1:diary_entry:d-draft-issue').params).toMatchObject({ entryType: 'issue' });
      expect(row(res, 'H4:work_item:wi-6')).toMatchObject({
        date: '2026-03-08',
        params: { rule: 'H4', actualEndDate: '2026-03-08' },
        actions: ['mark_done'],
      });
      expect(row(res, 'H2:invoice:inv-9')).toMatchObject({
        amount: 500,
        params: { recordKind: 'invoice', invoiceAmount: 500, companyName: 'Company A' },
        actions: ['split'],
      });
      expect(row(res, 'H2:invoice:off-1').params).toMatchObject({ recordKind: 'offer' });
    });

    it('H1: every manual entry type of a stale draft is a row; a draft with an unexpected type is skipped', () => {
      const stale = '2026-03-08T10:00:00.000Z';
      const insert = (id: string, entryType: string) =>
        sqlite
          .prepare(
            `INSERT INTO diary_entries
               (id, entry_type, entry_date, body, status, is_automatic, created_at, updated_at)
             VALUES (?, ?, '2026-03-08', '', 'draft', 0, ?, ?)`,
          )
          .run(id, entryType, stale, stale);
      insert('dr-visit', 'site_visit');
      insert('dr-note', 'general_note');
      // a non-manual type on a person's draft (e.g. a system-event type) is not a Tidy-up row
      insert('dr-odd', 'invoice_status');
      const res = attention();
      expect(row(res, 'H1:diary_entry:dr-visit').params).toMatchObject({ entryType: 'site_visit' });
      expect(row(res, 'H1:diary_entry:dr-note').params).toMatchObject({
        entryType: 'general_note',
      });
      expect(res.tidyUp.some((r) => r.key === 'H1:diary_entry:dr-odd')).toBe(false);
    });

    it('S1: the over-allocated source is a standing row with its figures', () => {
      expect(attention().standing).toEqual([
        {
          key: 'S1:budget_source:src-small',
          rule: 'S1',
          subject: { type: 'budget_source', id: 'src-small', label: 'Loan B', area: null },
          amount: 4900,
          params: { rule: 'S1', allocated: 5000, sourceAmount: 100 },
          link: { route: 'financing', params: {}, query: {} },
        },
      ]);
    });
  });

  // ─── Consistency with the shared definitions (no tolerance) ─────────────────

  describe('consistency with the shared definitions', () => {
    it('N1/N2 isLate and daysLate equal the schedule projection; every late task has a row or is folded', () => {
      const res = attention();
      const projection = computeScheduleProjection(db, FIXTURE_TODAY);
      const tasks = db.select().from(schema.workItems).all();
      const folded = new Set<string>();
      for (const t of tasks) {
        const fields = projection.workItems.get(t.id)!;
        const key =
          t.status === 'in_progress'
            ? `N1:work_item:${t.id}`
            : t.status === 'not_started'
              ? `N2:work_item:${t.id}`
              : null;
        if (key === null) continue;
        const asRow = res.rows.find((r) => r.key === key);
        const inGroup = res.rows.some(
          (r) =>
            r.params.rule === 'N2' &&
            r.params.kind === 'group' &&
            r.params.items.some((i) => i.id === t.id),
        );
        if (fields.isLate && (asRow || inGroup)) {
          if (asRow) {
            expect((asRow.params as { daysLate: number }).daysLate).toBe(fields.lateDays);
          } else {
            const group = res.rows.find(
              (r) => r.params.rule === 'N2' && r.params.kind === 'group',
            )!;
            const item = (group.params as Extract<AttentionParams, { kind: 'group' }>).items.find(
              (i) => i.id === t.id,
            )!;
            expect(item.daysLate).toBe(fields.lateDays);
          }
        } else if (fields.isLate) {
          folded.add(t.id);
        } else {
          expect(asRow).toBeUndefined();
          expect(inGroup).toBe(false);
        }
      }
      expect([...folded]).toEqual(['wi-f2']);
    });

    it('holds-up on the rows is the shared function', () => {
      const res = attention();
      const graph = loadScheduleGraph(db);
      const projection = projectSchedule(graph, FIXTURE_TODAY);
      const index = buildScheduleIndex(graph);
      const ctx = { today: FIXTURE_TODAY, projection };
      for (const [key, node] of [
        ['N1:work_item:wi-1', 'wi-1'],
        ['N2:work_item:wi-f1', 'wi-f1'],
        ['N2:work_item:wi-7', 'wi-7'],
        ['N3:milestone:2', 'milestone:2'],
        ['N3:milestone:3', 'milestone:3'],
      ] as const) {
        const { ids, ...expected } = computeHoldsUp(index, node, ctx);
        expect(ids.size).toBe(expected.count);
        expect(row(res, key).holdsUp).toEqual(expected);
      }
    });

    it('N8 equals the money service figure and the bank report draw-down set', async () => {
      const res = attention();
      const money = computeProjectMoney(db, VAT).summary.sources.find((s) => s.id === 'src-loan')!;
      const n8 = row(res, 'N8:budget_source:src-loan');
      expect(n8.amount).toBe(money.readyToSubmit.amount);
      expect((n8.params as { count: number }).count).toBe(money.readyToSubmit.count);
      const drawDown = getDrawDownSet(db, 'src-loan');
      expect(n8.amount).toBe(drawDown.totalAmount);
      expect((n8.params as { count: number }).count).toBe(drawDown.invoices.length);
      const report = await getSourceReport(db, 'claim', 'src-loan', { paperlessEnabled: false });
      expect(n8.amount).toBe(report.totalAmount);
      // savings and credit-line sources without a draw-down set produce no row
      for (const id of ['src-own', 'src-credit']) {
        expect(res.rows.some((r) => r.key === `N8:budget_source:${id}`)).toBe(false);
      }
    });

    it('H2 rows sum to the money service Not yet split and match its record count', () => {
      const res = attention();
      const h2 = res.tidyUp.filter((r) => r.rule === 'H2');
      const summary = computeProjectMoney(db, VAT).summary;
      expect(h2.map((r) => r.key).sort()).toEqual([...EXPECTED_H2_KEYS].sort());
      const cents = h2.reduce((sum, r) => sum + Math.round(r.amount! * 100), 0);
      expect(cents).toBe(Math.round(summary.notYetSplit.amount * 100));
      expect(h2).toHaveLength(summary.notYetSplit.recordCount);
    });

    it('N4+N5+N6 amounts plus the open items without a row equal Still to pay', () => {
      const res = attention();
      const summary = computeProjectMoney(db, VAT).summary;
      const items = listOpenPayments(db);
      const total = items.reduce((sum, i) => sum + Math.round(i.amount * 100), 0);
      expect(total).toBe(Math.round(summary.stillToPay * 100));

      const paymentRows = res.rows.filter((r) => ['N4', 'N5', 'N6'].includes(r.rule));
      const inRows = paymentRows.reduce((sum, r) => sum + Math.round(r.amount! * 100), 0);
      const shown = new Set(
        paymentRows.map((r) =>
          r.subject.type === 'progress_payment'
            ? `progress:${r.subject.id}`
            : `final:${r.subject.id}`,
        ),
      );
      const rest = items
        .filter(
          (i) =>
            !shown.has(i.kind === 'progress' ? `progress:${i.depositId}` : `final:${i.invoiceId}`),
        )
        .reduce((sum, i) => sum + Math.round(i.amount * 100), 0);
      expect(inRows + rest).toBe(total);
      expect(paymentRows).toHaveLength(6);
      // the final item of inv-4 (2100) and the other quiet invoices are the "rest"
      expect(rest).toBeGreaterThanOrEqual(210000);
    });

    it('S1 amounts equal the money service over-allocation', () => {
      const res = attention();
      const over = computeProjectMoney(db, VAT).summary.sources.filter((s) => s.overAllocated > 0);
      expect(res.standing.map((s) => [s.subject.id, s.amount]).sort()).toEqual(
        over.map((s) => [s.id, s.overAllocated]).sort(),
      );
    });

    it('the critical line equals the Critical Path card rule recomputed from the timeline', () => {
      jest.useFakeTimers({
        now: new Date(FIXTURE_NOW),
        doNotFake: [
          'hrtime',
          'nextTick',
          'performance',
          'queueMicrotask',
          'requestAnimationFrame',
          'cancelAnimationFrame',
          'requestIdleCallback',
          'cancelIdleCallback',
          'setImmediate',
          'clearImmediate',
          'setInterval',
          'clearInterval',
          'setTimeout',
          'clearTimeout',
        ],
      });
      const timeline = getTimeline(db);
      const candidates = timeline.workItems
        .filter((w) => timeline.criticalPath.includes(w.id) && w.status !== 'completed')
        .map((w) => ({ w, end: w.actualEndDate ?? w.projectedEndDate }))
        .filter((c) => c.end !== null)
        .sort((a, b) => a.end!.localeCompare(b.end!));
      const next = candidates[0]!;
      const line = attention().criticalLine!;
      expect(line.workItemId).toBe(next.w.id);
      expect(line.mustEndBy).toBe(next.end);
      expect(line.criticalCount).toBe(timeline.criticalPath.length);
      const daysLeft = Math.round(
        (Date.parse(`${next.end}T00:00:00Z`) - Date.parse(`${FIXTURE_TODAY}T00:00:00Z`)) / 86400000,
      );
      expect(line.daysLeft).toBe(daysLeft);
      expect(line.level).toBe(
        daysLeft < 0
          ? 'overdue'
          : daysLeft < 7
            ? 'critical'
            : daysLeft <= 14
              ? 'warning'
              : 'on_track',
      );
      expect(line).toMatchObject({ workItemId: 'wi-d', mustEndBy: '2026-03-20', level: 'warning' });
    });
  });

  it('critical line tie: two critical tasks with the same end give the first in stored order, as the card does', () => {
    const tieSqlite = new Database(':memory:');
    tieSqlite.pragma('foreign_keys = ON');
    runMigrations(tieSqlite);
    const tieDb = drizzle(tieSqlite, { schema });
    for (const [id, title] of [
      ['wi-zz', 'Task Zed'],
      ['wi-aa', 'Task Alpha'],
    ] as const) {
      tieDb
        .insert(schema.workItems)
        .values({
          id,
          title,
          status: 'in_progress',
          startDate: '2026-03-01',
          endDate: '2026-03-25',
          durationDays: 24,
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z',
        })
        .run();
    }
    jest.useFakeTimers({
      now: new Date(FIXTURE_NOW),
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    });
    const timeline = getTimeline(tieDb);
    const tied = timeline.workItems
      .filter(
        (w) =>
          timeline.criticalPath.includes(w.id) &&
          w.status !== 'completed' &&
          (w.actualEndDate ?? w.projectedEndDate) === '2026-03-25',
      )
      .map((w) => w.id);
    expect(tied).toEqual(expect.arrayContaining(['wi-zz', 'wi-aa']));
    // the card keeps the first of equal ends in timeline order; so must the attention line
    const line = getAttention(tieDb, {
      userId: 'nobody',
      vatRate: VAT,
      includeSnoozed: false,
      now: new Date(FIXTURE_NOW),
    }).criticalLine!;
    tieSqlite.close();
    const cardPick = timeline.workItems
      .filter((w) => timeline.criticalPath.includes(w.id) && w.status !== 'completed')
      .map((w) => ({ id: w.id, end: w.actualEndDate ?? w.projectedEndDate }))
      .filter((c) => c.end !== null)
      .sort((a, b) => a.end!.localeCompare(b.end!))[0]!;
    expect(line.workItemId).toBe(cardPick.id);
    if (cardPick.end === '2026-03-25') expect(line.workItemId).toBe(tied[0]);
  });

  // ─── Ordering, count, catch up ──────────────────────────────────────────────

  describe('ordering and totals', () => {
    it('puts the row that holds up the most work first and obeys the comparator throughout', () => {
      const res = attention();
      expect(res.rows[0]!.key).toBe('N1:work_item:wi-1');
      const rank = (rule: string) => ATTENTION_RULES.indexOf(rule as never);
      const cmpDate = (a: string | null, b: string | null) =>
        a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1;
      for (let i = 1; i < res.rows.length; i++) {
        const a = res.rows[i - 1]!;
        const b = res.rows[i]!;
        const order =
          (a.severity === 'red' ? 0 : 1) - (b.severity === 'red' ? 0 : 1) ||
          (b.holdsUp?.count ?? 0) - (a.holdsUp?.count ?? 0) ||
          cmpDate(a.date, b.date) ||
          rank(a.rule) - rank(b.rule) ||
          (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
        expect(order).toBeLessThan(0);
      }
      // reds first, then ambers
      const severities = res.rows.map((r) => r.severity);
      expect(severities.indexOf('amber')).toBe(severities.lastIndexOf('red') + 1);
    });

    it('count is every unsnoozed needs-attention row: tidyUp and standing excluded, a group counts 1', () => {
      const res = attention();
      expect(res.count).toBe(EXPECTED_ROW_KEYS.length);
      expect(res.tidyUp.length).toBeGreaterThan(0);
      expect(res.standing).toHaveLength(1);
      expect(res.snoozedCount).toBe(0);
    });

    it('catchUp counts N1 rows, N2 rows and the members of the N2 group', () => {
      // wi-1 + wi-7 + wi-d + wi-f1 + wi-h1..h3 + wi-g1..g4
      expect(attention().catchUp).toEqual({ lateTaskCount: 11 });
    });

    it('tidyUp is ordered by date ascending then rule order then key', () => {
      const res = attention();
      const rank = (rule: string) => ATTENTION_RULES.indexOf(rule as never);
      for (let i = 1; i < res.tidyUp.length; i++) {
        const a = res.tidyUp[i - 1]!;
        const b = res.tidyUp[i]!;
        const order =
          (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0) ||
          rank(a.rule) - rank(b.rule) ||
          (a.key < b.key ? -1 : 1);
        expect(order).toBeLessThan(0);
      }
    });
  });

  // ─── Facts, not blame ───────────────────────────────────────────────────────

  describe('facts, not blame (AC10)', () => {
    it('no user name, e-mail or id reaches the response, although a task is assigned to a user', () => {
      const assigned = db
        .select()
        .from(schema.workItems)
        .all()
        .find((w) => w.id === 'wi-5');
      expect(assigned?.assignedUserId).toBe(FIXTURE_USER.id);
      const json = JSON.stringify(attention({ includeSnoozed: true }));
      expect(json).not.toContain(FIXTURE_USER.displayName);
      expect(json).not.toContain(FIXTURE_USER.email);
      expect(json).not.toContain(FIXTURE_USER.id);
      for (const word of ['assignedUser', 'createdBy', 'userId', 'responsible', 'owner']) {
        expect(json).not.toContain(`"${word}"`);
      }
    });

    it('the company appears as a record attribute only', () => {
      const res = attention();
      const withCompany = [...res.rows, ...res.tidyUp].filter((r) =>
        JSON.stringify(r.params).includes('Company'),
      );
      expect(withCompany.length).toBeGreaterThan(0);
      for (const r of withCompany) {
        for (const [key, value] of Object.entries(r.params)) {
          if (typeof value === 'string' && value.startsWith('Company')) {
            expect(key).toBe('companyName');
          }
        }
      }
    });
  });

  // ─── Clock ──────────────────────────────────────────────────────────────────

  describe('today', () => {
    it('is the UTC date of the injected instant, also late in the evening', () => {
      expect(attention({ now: '2026-03-10T23:59:59.999Z' }).today).toBe('2026-03-10');
      expect(attention({ now: '2026-03-11T00:00:00.000Z' }).today).toBe('2026-03-11');
    });

    it('moves a payment due today from N5 to N4 the next day (a new key shows again)', () => {
      const next = attention({ now: '2026-03-11T08:00:00.000Z' });
      const keys = next.rows.map((r) => r.key);
      expect(keys).toContain('N4:invoice:inv-2b');
      expect(keys).not.toContain('N5:invoice:inv-2b');
    });

    it('uses the current instant when none is injected', () => {
      jest.useFakeTimers({
        now: new Date('2026-03-10T09:00:00.000Z'),
        doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout', 'queueMicrotask'],
      });
      const res = getAttention(db, {
        userId: FIXTURE_USER.id,
        vatRate: VAT,
        includeSnoozed: false,
      });
      expect(res.today).toBe('2026-03-10');
      expect(res.rows.map((r) => r.key).sort()).toEqual([...EXPECTED_ROW_KEYS].sort());
    });
  });

  // ─── Not now ────────────────────────────────────────────────────────────────

  describe('Not now', () => {
    it('hides a snoozed row, counts it in snoozedCount and returns it with includeSnoozed', () => {
      snooze(db, FIXTURE_USER.id, 'N4:invoice:inv-1', FIXTURE_TODAY);
      const hidden = attention();
      expect(hidden.rows.some((r) => r.key === 'N4:invoice:inv-1')).toBe(false);
      expect(hidden.count).toBe(EXPECTED_ROW_KEYS.length - 1);
      expect(hidden.snoozedCount).toBe(1);

      const shown = attention({ includeSnoozed: true });
      expect(row(shown, 'N4:invoice:inv-1').snoozedUntil).toBe('2026-03-17');
      expect(shown.rows).toHaveLength(EXPECTED_ROW_KEYS.length);
      expect(shown.count).toBe(EXPECTED_ROW_KEYS.length - 1);
      expect(shown.snoozedCount).toBe(1);
    });

    it('shows the row again from the day the snooze ends (7 days later) and not the day before', () => {
      snooze(db, FIXTURE_USER.id, 'N4:invoice:inv-1', FIXTURE_TODAY);
      expect(
        attention({ now: '2026-03-16T08:00:00.000Z' }).rows.some(
          (r) => r.key === 'N4:invoice:inv-1',
        ),
      ).toBe(false);
      expect(
        attention({ now: '2026-03-17T00:00:00.000Z' }).rows.some(
          (r) => r.key === 'N4:invoice:inv-1',
        ),
      ).toBe(true);
    });

    it('is per user: another user still sees the row and an unchanged count', () => {
      db.insert(schema.users)
        .values({
          id: 'user-other',
          email: 'other.person@example.test',
          displayName: 'Other Person',
          role: 'member',
          authProvider: 'local',
          passwordHash: 'hashed',
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z',
        })
        .run();
      snooze(db, FIXTURE_USER.id, 'N4:invoice:inv-1', FIXTURE_TODAY);
      const other = attention({ userId: 'user-other' });
      expect(other.rows.some((r) => r.key === 'N4:invoice:inv-1')).toBe(true);
      expect(other.count).toBe(EXPECTED_ROW_KEYS.length);
      expect(other.snoozedCount).toBe(0);
    });

    it('snoozing the group hides it and its members and leaves them out of catchUp', () => {
      snooze(db, FIXTURE_USER.id, 'N2:group:2026-03-02', FIXTURE_TODAY);
      const res = attention();
      expect(res.rows.some((r) => r.key.startsWith('N2:group'))).toBe(false);
      expect(res.rows.some((r) => r.key.startsWith('N2:work_item:wi-g'))).toBe(false);
      expect(res.snoozedCount).toBe(1);
      expect(res.catchUp).toEqual({ lateTaskCount: 7 });
    });

    it('snoozing a tidy-up row hides it from tidyUp and counts it in snoozedCount only', () => {
      snooze(db, FIXTURE_USER.id, 'H4:work_item:wi-6', FIXTURE_TODAY);
      const res = attention();
      expect(res.tidyUp.some((r) => r.key === 'H4:work_item:wi-6')).toBe(false);
      expect(res.snoozedCount).toBe(1);
      expect(res.count).toBe(EXPECTED_ROW_KEYS.length);
    });

    it('a corrupt stored snooze value never breaks the response', () => {
      db.insert(schema.userPreferences)
        .values({
          userId: FIXTURE_USER.id,
          key: 'attention.snoozed',
          value: '{broken',
          createdAt: FIXTURE_NOW,
          updatedAt: FIXTURE_NOW,
        })
        .run();
      expect(attention().count).toBe(EXPECTED_ROW_KEYS.length);
    });
  });

  it('a dangling area reference (foreign keys off) resolves to no area instead of failing', () => {
    sqlite.pragma('foreign_keys = OFF');
    sqlite.prepare("UPDATE household_items SET area_id = 'ghost-area' WHERE id = 'hi-1'").run();
    sqlite.pragma('foreign_keys = ON');
    expect(row(attention(), 'N10:household_item:hi-1').subject.area).toBeNull();
  });

  // ─── Empty project ──────────────────────────────────────────────────────────

  it('an empty project returns the documented empty shape', () => {
    const empty = new Database(':memory:');
    empty.pragma('foreign_keys = ON');
    runMigrations(empty);
    const emptyDb = drizzle(empty, { schema });
    const res = getAttention(emptyDb, {
      userId: 'nobody',
      vatRate: VAT,
      includeSnoozed: false,
      now: new Date(FIXTURE_NOW),
    });
    empty.close();
    expect(res).toEqual({
      today: FIXTURE_TODAY,
      count: 0,
      snoozedCount: 0,
      rows: [],
      tidyUp: [],
      standing: [],
      criticalLine: null,
      catchUp: null,
    });
  });
});
