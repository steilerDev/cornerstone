/**
 * Route tests of `GET /api/budget/overview` (#2237, contract 25): `{ overview: { subsidySummary },
 * money }`. The breakdown endpoint is in `budgetOverview.breakdown.test.ts`; the cross-consumer
 * consistency in `services/moneyService.fixture.test.ts`.
 *
 * Mutations these tests catch:
 *  - a legacy overview field coming back (the key list is pinned);
 *  - the grant summary and `money` coming from two different computations;
 *  - the endpoint answering without a session.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { BudgetOverviewResponse } from '@cornerstone/shared';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { createMoneySeed } from '../test/moneyDb.js';
import * as schema from '../db/schema.js';

const EXPECTED_SUMMARY_KEYS = [
  'activeSubsidyCount',
  'maxTotalPayback',
  'minTotalPayback',
  'oversubscribedSubsidies',
  'totalReductions',
];
const EXPECTED_MONEY_KEYS = [
  'activeSourceCount',
  'afterGrants',
  'byArea',
  'byType',
  'expectedCost',
  'expectedGrants',
  'fundingTotal',
  'grants',
  'leftToSpend',
  'notYetPaid',
  'notYetSplit',
  'paid',
  'possibleGrants',
  'readyToSubmit',
  'records',
  'sources',
  'stillToPay',
  'stillToPayCount',
];

describe('GET /api/budget/overview', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-budget-overview-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    app = await buildApp();
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

  async function getOverview(cookie: string) {
    return app.inject({ method: 'GET', url: '/api/budget/overview', headers: { cookie } });
  }

  describe('authentication', () => {
    it('returns 401 UNAUTHORIZED without a session', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/budget/overview' });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 with an invalid session cookie', async () => {
      const response = await getOverview('cornerstone_session=not-a-session');
      expect(response.statusCode).toBe(401);
    });

    it.each(['member', 'admin'] as const)('returns 200 for a %s', async (role) => {
      const response = await getOverview(await cookieFor(role));
      expect(response.statusCode).toBe(200);
    });
  });

  describe('response shape', () => {
    it('is { overview: { subsidySummary }, money } and nothing else', async () => {
      const response = await getOverview(await cookieFor('member'));
      const body = response.json<BudgetOverviewResponse>();
      expect(Object.keys(body).sort()).toEqual(['money', 'overview']);
      expect(Object.keys(body.overview)).toEqual(['subsidySummary']);
      expect(Object.keys(body.overview.subsidySummary).sort()).toEqual(EXPECTED_SUMMARY_KEYS);
      expect(Object.keys(body.money).sort()).toEqual(EXPECTED_MONEY_KEYS);
    });

    it('is all zero for an empty project', async () => {
      const body = (await getOverview(await cookieFor('member'))).json<BudgetOverviewResponse>();
      expect(body.overview.subsidySummary).toEqual({
        totalReductions: 0,
        activeSubsidyCount: 0,
        minTotalPayback: 0,
        maxTotalPayback: 0,
        oversubscribedSubsidies: [],
      });
      expect(body.money.expectedCost).toEqual({ expected: 0, best: 0, worst: 0 });
      expect(body.money.paid).toBe(0);
    });
  });

  describe('with data', () => {
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
      seed.source('bs-a', 'bank_loan', 50000);
      seed.workItem('wi-1');
      seed.wiLine('l1', 'wi-1', { planned: 1000, confidence: 'own_estimate', source: 'bs-a' });
      seed.invoice('inv-1', 400, 'paid');
      seed.link('inv-1', 'l1', 'work_item', 400);
      seed.grant('sp-1', { workItems: ['wi-1'], value: 10 });
    });

    it('serves the grant summary and money from one computation (they agree)', async () => {
      const body = (await getOverview(await cookieFor('member'))).json<BudgetOverviewResponse>();
      const s = body.overview.subsidySummary;
      expect(s.totalReductions).toBe(body.money.expectedGrants.expected);
      expect(s.minTotalPayback).toBe(body.money.expectedGrants.best);
      expect(s.maxTotalPayback).toBe(body.money.expectedGrants.worst);
      expect(s.activeSubsidyCount).toBe(1);
      expect(body.money.paid).toBe(400);
      expect(body.money.fundingTotal).toBe(50000);
    });

    it('does not carry the retired project fields on the overview', async () => {
      const body = (await getOverview(await cookieFor('member'))).json<BudgetOverviewResponse>();
      for (const retired of [
        'availableFunds',
        'sourceCount',
        'minPlanned',
        'maxPlanned',
        'actualCost',
        'actualCostPaid',
        'actualCostClaimed',
        'remainingVsMinPlanned',
        'remainingVsMaxPlanned',
        'remainingVsActualCost',
        'remainingVsActualPaid',
        'remainingVsActualClaimed',
        'remainingVsMinPlannedWithPayback',
        'remainingVsMaxPlannedWithPayback',
      ]) {
        expect(body.overview).not.toHaveProperty(retired);
      }
    });
  });
});
