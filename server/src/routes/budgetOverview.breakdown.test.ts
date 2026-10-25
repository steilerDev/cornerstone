/**
 * Route tests of `GET /api/budget/breakdown` (#2237, contract 25): authentication, the
 * `deselectedSources` query parsing, the strict querystring schema (R1), the per-source Paid
 * against the funding-source rails (R2) and the consistency sums with a tagged deposit (R3).
 * The arithmetic is in `services/shared/moneyBreakdown.test.ts`, the AC8 fixture consistency in
 * `services/moneyService.fixture.test.ts`.
 *
 * Mutations these tests catch:
 *  - a repeated `deselectedSources` answering 500 (or 200) instead of 400 VALIDATION_ERROR;
 *  - the parsing keeping spaces or empty entries, or treating an unknown id as an error;
 *  - 'unassigned' not matching lines without a source;
 *  - a tagged deposit attributed to the wrong source: R2 compares with the source rails;
 *  - a view dropping or double-counting a row with a tagged deposit present (R3).
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type {
  BreakdownFigures,
  BudgetBreakdown,
  BudgetBreakdownResponse,
} from '@cornerstone/shared';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { getSourcePaidAndSubmitted } from '../services/budgetSourceService.js';
import { computeProjectMoney } from '../services/moneyService.js';
import { createMoneySeed, type MoneySeed } from '../test/moneyDb.js';
import * as schema from '../db/schema.js';

const cents = (n: number): number => Math.round(n * 100);

const RANGE_FIELDS = ['expectedCost', 'expectedGrants', 'afterGrants', 'notYetPaid'] as const;
const SCENARIOS = ['expected', 'best', 'worst'] as const;

function sumFigures(rows: BreakdownFigures[]): Record<string, number> {
  const out: Record<string, number> = { paid: 0, stillToPay: 0 };
  for (const field of RANGE_FIELDS) for (const scen of SCENARIOS) out[`${field}.${scen}`] = 0;
  for (const row of rows) {
    out['paid'] = out['paid']! + cents(row.paid);
    out['stillToPay'] = out['stillToPay']! + cents(row.stillToPay);
    for (const field of RANGE_FIELDS) {
      for (const scen of SCENARIOS) {
        out[`${field}.${scen}`] = out[`${field}.${scen}`]! + cents(row[field][scen]);
      }
    }
  }
  return out;
}

/** Σ of the top-level rows of every view plus Not yet split, per view. */
function viewSums(b: BudgetBreakdown): Record<string, Record<string, number>> {
  const extra = b.notYetSplit ? [b.notYetSplit] : [];
  return {
    lines: sumFigures([...b.lines.map((l) => l.figures), ...extra]),
    items: sumFigures([
      ...b.items.map((i) => i.figures),
      ...(b.orphanLines ? [b.orphanLines] : []),
      ...extra,
    ]),
    area: sumFigures([
      ...b.byArea.filter((a) => a.parentId === null).map((a) => a.figures),
      ...(b.noArea ? [b.noArea] : []),
      ...extra,
    ]),
    type: sumFigures([b.byType.work_items, b.byType.household_items, ...extra]),
    category: sumFigures([...b.byCategory.map((c) => c.figures), ...extra]),
    source: sumFigures([...b.bySource.map((s) => s.figures), ...extra]),
  };
}

describe('GET /api/budget/breakdown', () => {
  let app: FastifyInstance;
  let seed: MoneySeed;
  let cookie: string;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-budget-breakdown-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    app = await buildApp();
    app.db
      .insert(schema.vendors)
      .values({
        id: 'vendor',
        name: 'Company One',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      .run();
    seed = createMoneySeed(app.db);
    const user = await userService.createLocalUser(
      app.db,
      'member@example.test',
      'Test Member',
      'a-long-test-password-1',
      'member',
    );
    cookie = `cornerstone_session=${sessionService.createSession(app.db, user.id, 3600)}`;
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = originalEnv;
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  async function get(query = '', headers: Record<string, string> = { cookie }) {
    return app.inject({ method: 'GET', url: `/api/budget/breakdown${query}`, headers });
  }
  async function getBreakdown(query = ''): Promise<BudgetBreakdown> {
    const response = await get(query);
    expect(response.statusCode).toBe(200);
    return response.json<BudgetBreakdownResponse>().breakdown;
  }

  /** The T1 fixture: source A funds 660 of a 1,000 record, source B 340, plus a loose line. */
  function seedT1(options: { taggedDeposit?: boolean } = {}): void {
    seed.source('bs-a', 'bank_loan', 50000, 'active', 'Loan Alpha');
    seed.source('bs-b', 'credit_line', 20000, 'active', 'Credit Beta');
    seed.area('ar-1', 'Area North');
    seed.category('bc-1', 'Category One');
    seed.workItem('wi-1', 'ar-1');
    seed.wiLine('lA', 'wi-1', { planned: 660, source: 'bs-a', category: 'bc-1' });
    seed.wiLine('lB', 'wi-1', { planned: 340, source: 'bs-b' });
    seed.wiLine('lU', 'wi-1', { planned: 200, source: null });
    if (options.taggedDeposit) {
      seed.invoice('inv-1', 1000, 'pending');
      seed.deposit('d-1', 'inv-1', 300, 'paid', { sourceId: 'bs-a' });
    } else {
      seed.invoice('inv-1', 1000, 'paid');
    }
    seed.link('inv-1', 'lA', 'work_item', 660);
    seed.link('inv-1', 'lB', 'work_item', 340);
  }

  describe('authentication', () => {
    it('returns 401 UNAUTHORIZED without a session', async () => {
      const response = await get('', {});
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 with an invalid session cookie, also when the filter param is present', async () => {
      expect((await get('', { cookie: 'cornerstone_session=bogus' })).statusCode).toBe(401);
      expect((await get('?deselectedSources=bs-a', {})).statusCode).toBe(401);
    });

    it('returns 200 for an admin too', async () => {
      const admin = await userService.createLocalUser(
        app.db,
        'admin@example.test',
        'Test Admin',
        'a-long-test-password-1',
        'admin',
      );
      const response = await get('', {
        cookie: `cornerstone_session=${sessionService.createSession(app.db, admin.id, 3600)}`,
      });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('response shape', () => {
    it('is { breakdown } with the contract 25 keys', async () => {
      const response = await get();
      const body = response.json<BudgetBreakdownResponse>();
      expect(Object.keys(body)).toEqual(['breakdown']);
      expect(Object.keys(body.breakdown).sort()).toEqual([
        'byArea',
        'byCategory',
        'bySource',
        'byType',
        'hasUnassignedLines',
        'items',
        'lines',
        'noArea',
        'notYetSplit',
        'orphanLines',
        'sourceOptions',
        'total',
      ]);
    });

    it('is empty with zero totals for an empty project', async () => {
      const b = await getBreakdown();
      expect(b.lines).toEqual([]);
      expect(b.noArea).toBeNull();
      expect(b.notYetSplit).toBeNull();
      expect(b.total.expectedCost).toEqual({ expected: 0, best: 0, worst: 0 });
      expect(b.total.paid).toBe(0);
    });

    it('carries the figures of a line, item, area, category and source row', async () => {
      seedT1();
      const b = await getBreakdown();
      const lineA = b.lines.find((l) => l.id === 'lA')!;
      expect(lineA).toMatchObject({
        kind: 'work_item',
        itemId: 'wi-1',
        budgetCategoryId: 'bc-1',
        budgetSourceId: 'bs-a',
        linkStatus: 'paid',
        figures: { paid: 660, stillToPay: 0 },
      });
      expect(Object.keys(lineA.figures).sort()).toEqual([
        'afterGrants',
        'expectedCost',
        'expectedGrants',
        'notYetPaid',
        'paid',
        'stillToPay',
      ]);
      expect(b.items[0]).toMatchObject({ id: 'wi-1', name: 'Task wi-1', areaId: 'ar-1' });
      expect(b.byArea.map((a) => a.areaId)).toEqual(['ar-1']);
      expect(b.byCategory.map((c) => c.budgetCategoryId)).toEqual(['bc-1', null]);
      expect(b.bySource.map((s) => s.budgetSourceId)).toEqual(['bs-b', 'bs-a', null]); // name order: Credit Beta, Loan Alpha
      expect(b.hasUnassignedLines).toBe(true);
    });
  });

  describe('deselectedSources query', () => {
    beforeEach(seedT1);

    const lineIds = (b: BudgetBreakdown) => b.lines.map((l) => l.id).sort();

    it('R1: a repeated deselectedSources parameter is a 400 VALIDATION_ERROR, not a 500', async () => {
      const response = await get('?deselectedSources=bs-a&deselectedSources=bs-b');
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('returns every line without the parameter and with an empty one', async () => {
      expect(lineIds(await getBreakdown())).toEqual(['lA', 'lB', 'lU']);
      expect(lineIds(await getBreakdown('?deselectedSources='))).toEqual(['lA', 'lB', 'lU']);
    });

    it('removes the lines of a deselected source', async () => {
      expect(lineIds(await getBreakdown('?deselectedSources=bs-b'))).toEqual(['lA', 'lU']);
    });

    it("'unassigned' removes the lines without a source", async () => {
      expect(lineIds(await getBreakdown('?deselectedSources=unassigned'))).toEqual(['lA', 'lB']);
    });

    it('takes a comma-separated list and ignores spaces, empty entries and unknown ids', async () => {
      const b = await getBreakdown(
        `?deselectedSources=${encodeURIComponent(' bs-a , ,,nope,unassigned ')}`,
      );
      expect(lineIds(b)).toEqual(['lB']);
    });

    it('keeps the options, the unassigned flag and Not yet split whatever is deselected', async () => {
      const all = await getBreakdown();
      const none = await getBreakdown('?deselectedSources=bs-a,bs-b,unassigned');
      expect(none.lines).toEqual([]);
      expect(none.sourceOptions).toEqual(all.sourceOptions);
      expect(none.hasUnassignedLines).toBe(all.hasUnassignedLines);
      expect(none.notYetSplit).toEqual(all.notYetSplit);
    });
  });

  describe('R2: per-source Paid against the funding-source rails', () => {
    it.each([
      ['a paid record split over two sources', false],
      ['a progress payment tagged to source A', true],
    ])('%s: By funding source Paid equals paid + submitted of the source', async (_n, tagged) => {
      seedT1({ taggedDeposit: tagged });
      const b = await getBreakdown();
      for (const id of ['bs-a', 'bs-b']) {
        const row = b.bySource.find((s) => s.budgetSourceId === id)!;
        const rails = getSourcePaidAndSubmitted(app.db, { id, isDiscretionary: false });
        expect([id, cents(row.figures.paid)]).toEqual([id, cents(rails.paid + rails.submitted)]);
      }
    });
  });

  describe('R3: consistency with a tagged deposit', () => {
    beforeEach(() => seedT1({ taggedDeposit: true }));

    it('gives the deposit to the lines of its source only', async () => {
      const b = await getBreakdown();
      const paid = Object.fromEntries(b.lines.map((l) => [l.id, l.figures.paid]));
      expect(paid).toEqual({ lA: 300, lB: 0, lU: 0 });
      expect(b.notYetSplit?.paid ?? 0).toBe(0);
    });

    it.each([
      ['unfiltered', ''],
      ['with bs-b deselected', '?deselectedSources=bs-b'],
    ])('every view sums to the total %s', async (_n, query) => {
      const b = await getBreakdown(query);
      const total = sumFigures([b.total]);
      for (const [name, sums] of Object.entries(viewSums(b))) {
        expect([name, sums]).toEqual([name, total]);
      }
    });

    it('the unfiltered total equals the Paid and Still to pay of the money service', async () => {
      const b = await getBreakdown();
      const summary = computeProjectMoney(app.db, 0.19).summary;
      expect(b.total.paid).toBe(summary.paid);
      expect(b.total.stillToPay).toBe(summary.stillToPay);
      expect(summary.paid).toBe(300);
      expect(summary.stillToPay).toBe(700);
      for (const view of Object.values(viewSums(b))) {
        expect(view['paid']).toBe(cents(summary.paid));
        expect(view['stillToPay']).toBe(cents(summary.stillToPay));
      }
    });
  });
});
