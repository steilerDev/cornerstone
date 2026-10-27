/**
 * Route tests of `GET /api/budget/financing` (#2242): every funding source (money service
 * figures plus the interest rate) and every grant, rejected ones included.
 *
 * Mutations these tests catch:
 *  - a financing figure computed apart from the overview (the two bodies are compared);
 *  - the rejected grant dropped from the list, or still counted;
 *  - a legacy fixed grant losing its stored amount (`rate`), or the amount changing after an
 *    unrelated PATCH;
 *  - a category-only grant paying out although none of its items is linked (AC11);
 *  - the endpoint answering without a session.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type {
  BudgetOverviewResponse,
  FinancingResponse,
  SubsidyProgramDetailResponse,
} from '@cornerstone/shared';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { createMoneySeed } from '../test/moneyDb.js';
import * as schema from '../db/schema.js';

describe('GET /api/budget/financing', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let cookie: string;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-financing-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    app = await buildApp();
    cookie = await cookieFor('member');
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

  async function cookieFor(role: 'admin' | 'member'): Promise<string> {
    const user = await userService.createLocalUser(
      app.db,
      `${role}@example.test`,
      `Test ${role}`,
      'a-long-test-password-1',
      role,
    );
    return `cornerstone_session=${sessionService.createSession(app.db, user.id, 3600)}`;
  }

  async function financing(): Promise<FinancingResponse> {
    const res = await app.inject({
      method: 'GET',
      url: '/api/budget/financing',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    return res.json<FinancingResponse>();
  }

  async function overview(): Promise<BudgetOverviewResponse> {
    const res = await app.inject({
      method: 'GET',
      url: '/api/budget/overview',
      headers: { cookie },
    });
    return res.json<BudgetOverviewResponse>();
  }

  describe('authentication', () => {
    it('returns 401 UNAUTHORIZED without a session', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/budget/financing' });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 with an invalid session cookie', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/budget/financing',
        headers: { cookie: 'cornerstone_session=not-a-session' },
      });
      expect(res.statusCode).toBe(401);
    });

    it.each(['member', 'admin'] as const)('returns 200 for a %s', async (role) => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/budget/financing',
        headers: { cookie: role === 'admin' ? await cookieFor('admin') : cookie },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('an empty project', () => {
    it('lists only the system "Own funds" source and no grants', async () => {
      const body = await financing();
      expect(Object.keys(body).sort()).toEqual(['grants', 'sources']);
      expect(body.grants).toEqual([]);
      expect(body.sources).toHaveLength(1);
      expect(body.sources[0]).toMatchObject({
        id: 'discretionary-system',
        name: 'Own funds',
        interestRate: null,
        amount: 0,
        allocated: 0,
      });
    });
  });

  describe('with sources and grants', () => {
    beforeEach(() => {
      app.db
        .insert(schema.vendors)
        .values({
          id: 'vendor',
          name: 'Company One',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        })
        .run();
      const seed = createMoneySeed(app.db);
      seed.source('bs-a', 'bank_loan', 50000, 'active', 'Loan Alpha');
      seed.source('bs-b', 'savings', 8000, 'closed', 'Savings Beta');
      app.db
        .update(schema.budgetSources)
        .set({ interestRate: 3.5 })
        .where(eq(schema.budgetSources.id, 'bs-a'))
        .run();
      seed.workItem('wi-1');
      seed.workItem('wi-2');
      seed.householdItem('hi-1');
      seed.wiLine('l1', 'wi-1', { planned: 1000, confidence: 'own_estimate', source: 'bs-a' });
      seed.wiLine('l2', 'wi-2', { planned: 2000, confidence: 'own_estimate', source: 'bs-a' });
      seed.hiLine('l3', 'hi-1', { planned: 500, confidence: 'own_estimate', source: 'bs-b' });
      seed.invoice('inv-1', 400, 'paid');
      seed.link('inv-1', 'l1', 'work_item', 400);
      seed.grant('sp-pct', { workItems: ['wi-1', 'wi-2'], householdItems: ['hi-1'], value: 10 });
      seed.grant('sp-rej', { status: 'rejected', workItems: ['wi-1'], value: 50 });
      seed.grant('sp-fixed', { type: 'fixed', value: 250, workItems: ['wi-2'] });
    });

    it('carries every source with the interest rate and every grant, rejected included', async () => {
      const body = await financing();
      expect(body.sources.map((s) => s.name)).toEqual(['Loan Alpha', 'Own funds', 'Savings Beta']);
      expect(body.sources.find((s) => s.id === 'bs-a')?.interestRate).toBe(3.5);
      expect(body.sources.find((s) => s.id === 'bs-b')?.interestRate).toBeNull();
      expect(body.sources.find((s) => s.id === 'bs-b')?.status).toBe('closed');
      expect(body.grants.map((g) => g.id)).toEqual(['sp-fixed', 'sp-pct', 'sp-rej']);
    });

    it('source figures equal the overview money.sources entry by entry', async () => {
      const [body, over] = await Promise.all([financing(), overview()]);
      expect(body.sources.map(({ interestRate: _rate, ...figures }) => figures)).toEqual(
        over.money.sources,
      );
      expect(body.sources.find((s) => s.id === 'bs-a')?.paid).toBe(400);
    });

    it('counted grants equal the overview money.grants payout', async () => {
      const [body, over] = await Promise.all([financing(), overview()]);
      for (const grant of over.money.grants) {
        const row = body.grants.find((g) => g.id === grant.id)!;
        expect(row.expected).toEqual(grant.expected);
        expect(row.counted).toBe(grant.counted);
      }
      expect(body.grants.find((g) => g.id === 'sp-pct')).toMatchObject({
        status: 'approved',
        reductionType: 'percentage',
        rate: 10,
        eligibleCostCap: null,
        deadline: null,
        coveredItemCount: 3,
        counted: true,
      });
    });

    it('a rejected grant pays nothing and is not counted, but its links are counted', async () => {
      const rejected = (await financing()).grants.find((g) => g.id === 'sp-rej')!;
      expect(rejected.status).toBe('rejected');
      expect(rejected.expected).toEqual({ expected: 0, best: 0, worst: 0 });
      expect(rejected.counted).toBe(false);
      expect(rejected.coveredItemCount).toBe(1);
      expect(rejected.rate).toBe(50);
    });

    it('a legacy fixed grant shows its stored amount as the rate; a PATCH of notes loses nothing', async () => {
      const before = (await financing()).grants.find((g) => g.id === 'sp-fixed')!;
      expect(before.reductionType).toBe('fixed');
      expect(before.rate).toBe(250);
      expect(before.expected.expected).toBeGreaterThan(0);

      const patch = await app.inject({
        method: 'PATCH',
        url: '/api/subsidy-programs/sp-fixed',
        headers: { cookie },
        payload: { notes: 'Only a note changed' },
      });
      expect(patch.statusCode).toBe(200);

      const after = (await financing()).grants.find((g) => g.id === 'sp-fixed')!;
      expect(after).toEqual(before);
    });

    it('a category-only grant with no linked item pays 0 on the financing list, its detail and the overview', async () => {
      const seed = createMoneySeed(app.db);
      seed.category('bc-1', 'Windows');
      seed.grant('sp-cat', { categories: ['bc-1'], value: 30 });

      const row = (await financing()).grants.find((g) => g.id === 'sp-cat')!;
      expect(row.expected).toEqual({ expected: 0, best: 0, worst: 0 });
      expect(row.coveredItemCount).toBe(0);

      const detail = await app.inject({
        method: 'GET',
        url: '/api/subsidy-programs/sp-cat',
        headers: { cookie },
      });
      expect(detail.json<SubsidyProgramDetailResponse>().money.expected.expected).toBe(0);

      const entry = (await overview()).money.grants.find((g) => g.id === 'sp-cat');
      expect(entry?.expected.expected ?? 0).toBe(0);
    });
  });
});
