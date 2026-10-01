/**
 * Route-level regression tests: the configured VAT_RATE env var is threaded from
 * `fastify.config.vatRate` into the budget overview, budget breakdown and budget source
 * endpoints. A net-stored budget line (includes_vat = 0) of 100 must gross up to 120 at
 * VAT_RATE=0.2 (the previously hardcoded 0.19 default would give 119).
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import * as schema from '../db/schema.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('VAT_RATE is honored by budget routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let idCounter = 0;

  async function startApp(vatRate?: string) {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-budget-vatrate-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    if (vatRate !== undefined) {
      process.env.VAT_RATE = vatRate;
    } else {
      delete process.env.VAT_RATE;
    }
    app = await buildApp();
  }

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    process.env = originalEnv;
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    idCounter = 0;
  });

  async function createCookie(): Promise<string> {
    const user = await userService.createLocalUser(
      app.db,
      'vat-user@example.com',
      'VAT User',
      'password',
      'member',
    );
    return `cornerstone_session=${sessionService.createSession(app.db, user.id, 3600)}`;
  }

  /** Inserts a source and a work item with one NET budget line (plannedAmount=100). */
  function insertNetLine(confidence: 'own_estimate' | 'invoice'): string {
    const now = new Date().toISOString();
    const sourceId = `src-vat-route-${idCounter++}`;
    app.db
      .insert(schema.budgetSources)
      .values({
        id: sourceId,
        name: 'VAT Route Source',
        sourceType: 'bank_loan',
        totalAmount: 100000,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const wiId = `wi-vat-route-${idCounter++}`;
    app.db
      .insert(schema.workItems)
      .values({
        id: wiId,
        title: 'VAT Route WI',
        status: 'not_started',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    app.db
      .insert(schema.workItemBudgets)
      .values({
        id: `bud-vat-route-${idCounter++}`,
        workItemId: wiId,
        budgetSourceId: sourceId,
        plannedAmount: 100,
        confidence,
        includesVat: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return sourceId;
  }

  describe.each([
    ['0.2', 120, 96, 144],
    [undefined, 119, 95.2, 142.8],
  ])('VAT_RATE=%s', (vatRate, gross, min, max) => {
    it('GET /api/budget/overview grosses up the net line before applying the margin', async () => {
      await startApp(vatRate);
      const cookie = await createCookie();
      insertNetLine('own_estimate');

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget/overview',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const { overview } = response.json<Json>();
      expect(overview.minPlanned).toBeCloseTo(min, 5);
      expect(overview.maxPlanned).toBeCloseTo(max, 5);
    });

    it('GET /api/budget/breakdown grosses up item and per-source projections', async () => {
      await startApp(vatRate);
      const cookie = await createCookie();
      const sourceId = insertNetLine('own_estimate');

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget/breakdown',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const { breakdown } = response.json<Json>();
      const item = breakdown.workItems.areas[0].items[0];
      expect(item.projectedMin).toBeCloseTo(min, 5);
      expect(item.projectedMax).toBeCloseTo(max, 5);
      const src = breakdown.budgetSources.find((s: Json) => s.id === sourceId);
      expect(src.projectedMin).toBeCloseTo(min, 5);
      expect(src.projectedMax).toBeCloseTo(max, 5);
    });

    it('GET /api/budget-sources and /api/budget-sources/:id project the grossed-up amount', async () => {
      await startApp(vatRate);
      const cookie = await createCookie();
      const sourceId = insertNetLine('invoice');

      const list = await app.inject({
        method: 'GET',
        url: '/api/budget-sources',
        headers: { cookie },
      });
      expect(list.statusCode).toBe(200);
      const listed = list.json<Json>().budgetSources.find((s: Json) => s.id === sourceId);
      expect(listed.projectedAmount).toBeCloseTo(gross, 5);
      expect(listed.projectedMinAmount).toBeCloseTo(gross, 5);
      expect(listed.projectedMaxAmount).toBeCloseTo(gross, 5);

      const single = await app.inject({
        method: 'GET',
        url: `/api/budget-sources/${sourceId}`,
        headers: { cookie },
      });
      expect(single.statusCode).toBe(200);
      expect(single.json<Json>().budgetSource.projectedAmount).toBeCloseTo(gross, 5);
    });
  });

  it('PATCH /api/budget-sources/:id returns projections computed with the configured rate', async () => {
    await startApp('0.2');
    const cookie = await createCookie();
    const sourceId = insertNetLine('invoice');

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/budget-sources/${sourceId}`,
      headers: { cookie },
      payload: { name: 'Renamed VAT Source' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<Json>().budgetSource.projectedAmount).toBeCloseTo(120, 5);
  });

  it('POST /api/budget-sources responds 201 with the configured rate threaded through', async () => {
    await startApp('0.2');
    const cookie = await createCookie();

    const response = await app.inject({
      method: 'POST',
      url: '/api/budget-sources',
      headers: { cookie },
      payload: { name: 'Created VAT Source', sourceType: 'savings', totalAmount: 1000 },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<Json>().budgetSource.projectedAmount).toBe(0);
  });

  it('GET /api/budget-sources/:id reports a VAT-effective usedAmount for a net non-invoiced line', async () => {
    await startApp('0.2');
    const cookie = await createCookie();
    const sourceId = insertNetLine('invoice');

    const response = await app.inject({
      method: 'GET',
      url: `/api/budget-sources/${sourceId}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const { budgetSource } = response.json<Json>();
    expect(budgetSource.usedAmount).toBeCloseTo(120, 5);
    expect(budgetSource.availableAmount).toBeCloseTo(100000 - 120, 5);
  });

  describe('subsidy payback and household item endpoints', () => {
    /** Inserts a household item with one NET line (100, own_estimate) and a 10% subsidy. */
    function insertNetHouseholdItem(): string {
      const now = new Date().toISOString();
      const hiId = `hi-vat-route-${idCounter++}`;
      app.db
        .insert(schema.householdItems)
        .values({
          id: hiId,
          name: 'VAT Route HI',
          categoryId: 'hic-furniture',
          status: 'planned',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      app.db
        .insert(schema.householdItemBudgets)
        .values({
          id: `hib-vat-route-${idCounter++}`,
          householdItemId: hiId,
          plannedAmount: 100,
          confidence: 'own_estimate',
          includesVat: false,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const subsidyId = `sp-vat-route-${idCounter++}`;
      app.db
        .insert(schema.subsidyPrograms)
        .values({
          id: subsidyId,
          name: 'Ten percent',
          reductionType: 'percentage',
          reductionValue: 10,
          applicationStatus: 'eligible',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      app.db
        .insert(schema.householdItemSubsidies)
        .values({ householdItemId: hiId, subsidyProgramId: subsidyId })
        .run();
      return hiId;
    }

    function insertNetWorkItemWithSubsidy(): string {
      const now = new Date().toISOString();
      const wiId = `wi-vat-route-sub-${idCounter++}`;
      app.db
        .insert(schema.workItems)
        .values({
          id: wiId,
          title: 'Sub WI',
          status: 'not_started',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      app.db
        .insert(schema.workItemBudgets)
        .values({
          id: `wib-vat-route-sub-${idCounter++}`,
          workItemId: wiId,
          plannedAmount: 100,
          confidence: 'own_estimate',
          includesVat: false,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const subsidyId = `sp-vat-route-wi-${idCounter++}`;
      app.db
        .insert(schema.subsidyPrograms)
        .values({
          id: subsidyId,
          name: 'Ten percent WI',
          reductionType: 'percentage',
          reductionValue: 10,
          applicationStatus: 'eligible',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      app.db
        .insert(schema.workItemSubsidies)
        .values({ workItemId: wiId, subsidyProgramId: subsidyId })
        .run();
      return wiId;
    }

    it.each([
      ['0.2', 9.6, 14.4],
      [undefined, 9.52, 14.28],
    ])(
      'GET work-item and household-item subsidy-payback use VAT_RATE=%s (min %s, max %s)',
      async (vatRate, min, max) => {
        await startApp(vatRate);
        const cookie = await createCookie();
        const wiId = insertNetWorkItemWithSubsidy();
        const hiId = insertNetHouseholdItem();

        const wi = await app.inject({
          method: 'GET',
          url: `/api/work-items/${wiId}/subsidy-payback`,
          headers: { cookie },
        });
        const hi = await app.inject({
          method: 'GET',
          url: `/api/household-items/${hiId}/subsidy-payback`,
          headers: { cookie },
        });

        expect(wi.statusCode).toBe(200);
        expect(hi.statusCode).toBe(200);
        for (const body of [wi.json<Json>(), hi.json<Json>()]) {
          const payback = body.subsidyPayback ?? body;
          expect(payback.minTotalPayback).toBeCloseTo(min, 5);
          expect(payback.maxTotalPayback).toBeCloseTo(max, 5);
        }
      },
    );

    it.each([
      ['0.2', 120],
      [undefined, 119],
    ])(
      'GET /api/household-items (list, filter, detail) is VAT-effective at VAT_RATE=%s (net 100 -> %s)',
      async (vatRate, gross) => {
        await startApp(vatRate);
        const cookie = await createCookie();
        const hiId = insertNetHouseholdItem();

        const list = await app.inject({
          method: 'GET',
          url: '/api/household-items',
          headers: { cookie },
        });
        expect(list.statusCode).toBe(200);
        const listBody = list.json<Json>();
        expect(listBody.items[0].totalPlannedAmount).toBeCloseTo(gross, 5);
        expect(listBody.items[0].budgetSummary.subsidyReduction).toBeCloseTo(gross * 0.1, 5);
        expect(listBody.filterMeta.plannedCost.max).toBeCloseTo(gross, 5);

        const included = await app.inject({
          method: 'GET',
          url: `/api/household-items?plannedCostMin=${gross}`,
          headers: { cookie },
        });
        expect(included.json<Json>().items).toHaveLength(1);

        const excluded = await app.inject({
          method: 'GET',
          url: `/api/household-items?plannedCostMin=${gross + 0.01}`,
          headers: { cookie },
        });
        expect(excluded.json<Json>().items).toHaveLength(0);

        const detail = await app.inject({
          method: 'GET',
          url: `/api/household-items/${hiId}`,
          headers: { cookie },
        });
        expect(detail.statusCode).toBe(200);
        const body = detail.json<Json>();
        expect((body.householdItem ?? body).totalPlannedAmount).toBeCloseTo(gross, 5);
      },
    );
  });
});
