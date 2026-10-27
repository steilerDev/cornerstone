/**
 * Route tests of the grant page endpoints (#2242): `GET /api/subsidy-programs/:id` (now with
 * `money`), `GET` / `POST /api/subsidy-programs/:id/items` (covered items) and
 * `POST /api/subsidy-programs` with `items`.
 *
 * Mutations these tests catch:
 *  - detail `money` computed apart from the money service / overview;
 *  - a covered share that does not add up to the grant's expected payout;
 *  - POST /:id/items linking part of a request when one item is unknown (not atomic), or failing
 *    on a pair that is already linked (not idempotent), or duplicating a link row;
 *  - create-with-items leaving a grant row (or half the links) behind when an item is unknown;
 *  - `additionalProperties: false` turning into a rejection, or minItems / maxItems / the type
 *    enum not being enforced;
 *  - Undo of a covered-item Remove not re-linking.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type {
  ApiErrorResponse,
  BudgetOverviewResponse,
  GrantCoveredItemsResponse,
  SubsidyProgramDetailResponse,
  SubsidyProgramResponse,
} from '@cornerstone/shared';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { createMoneySeed } from '../test/moneyDb.js';
import type { MoneySeed } from '../test/moneyDb.js';
import * as schema from '../db/schema.js';

describe('Grant page routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let cookie: string;
  let seed: MoneySeed;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-grant-items-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    app = await buildApp();
    const user = await userService.createLocalUser(
      app.db,
      'member@example.test',
      'Test member',
      'a-long-test-password-1',
      'member',
    );
    cookie = `cornerstone_session=${sessionService.createSession(app.db, user.id, 3600)}`;
    seed = createMoneySeed(app.db);
    app.db
      .insert(schema.vendors)
      .values({ id: 'vendor', name: 'Company One', createdAt: 'x', updatedAt: 'x' })
      .run();
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

  const get = (url: string) => app.inject({ method: 'GET', url, headers: { cookie } });
  const post = (url: string, payload: unknown) =>
    app.inject({ method: 'POST', url, headers: { cookie }, payload: payload as object });

  function linkRows(grantId: string): { work: number; household: number } {
    return {
      work: app.db
        .select()
        .from(schema.workItemSubsidies)
        .where(eq(schema.workItemSubsidies.subsidyProgramId, grantId))
        .all().length,
      household: app.db
        .select()
        .from(schema.householdItemSubsidies)
        .where(eq(schema.householdItemSubsidies.subsidyProgramId, grantId))
        .all().length,
    };
  }

  function grantCount(): number {
    return app.db.select().from(schema.subsidyPrograms).all().length;
  }

  /** Two areas, two tasks, two purchases, one 10 % grant covering one task and one purchase. */
  function seedProject(): void {
    seed.area('ar-house', 'House');
    seed.area('ar-kitchen', 'Kitchen', 'ar-house');
    seed.workItem('wi-b', 'ar-kitchen', 'Tiling');
    seed.workItem('wi-a', null, 'Appliance install');
    seed.householdItem('hi-b', null, 'Sink');
    seed.householdItem('hi-a', 'ar-house', 'Oven');
    seed.wiLine('l-a', 'wi-a', { planned: 1000, confidence: 'own_estimate' });
    seed.wiLine('l-b', 'wi-b', { planned: 3000, confidence: 'own_estimate' });
    seed.hiLine('l-ha', 'hi-a', { planned: 2000, confidence: 'own_estimate' });
    seed.grant('sp-1', { value: 10, workItems: ['wi-a', 'wi-b'], householdItems: ['hi-a'] });
  }

  describe('GET /api/subsidy-programs/:id', () => {
    it('serves { subsidyProgram, money } and the money is the financing / overview figure', async () => {
      seedProject();

      const res = await get('/api/subsidy-programs/sp-1');

      expect(res.statusCode).toBe(200);
      const body = res.json<SubsidyProgramDetailResponse>();
      expect(Object.keys(body).sort()).toEqual(['money', 'subsidyProgram']);
      expect(body.subsidyProgram.id).toBe('sp-1');
      expect(body.money.coveredItemCount).toBe(3);
      expect(body.money.counted).toBe(true);
      expect(body.money.expected.expected).toBeGreaterThan(0);

      const overview = (await get('/api/budget/overview')).json<BudgetOverviewResponse>();
      const entry = overview.money.grants.find((g) => g.id === 'sp-1')!;
      expect(body.money.expected).toEqual(entry.expected);
      expect(body.money.eligibleCost).toEqual(entry.eligibleCost);
      expect(body.money.capped).toBe(entry.capped);
    });

    it('a grant without links is all zero with 0 covered items', async () => {
      seed.grant('sp-empty', { value: 25 });

      const body = (
        await get('/api/subsidy-programs/sp-empty')
      ).json<SubsidyProgramDetailResponse>();

      expect(body.money.coveredItemCount).toBe(0);
      expect(body.money.expected).toEqual({ expected: 0, best: 0, worst: 0 });
    });

    it('a rejected grant has a zero, uncounted payout but keeps its covered-item count', async () => {
      seedProject();
      seed.grant('sp-rej', { status: 'rejected', workItems: ['wi-a'] });

      const body = (await get('/api/subsidy-programs/sp-rej')).json<SubsidyProgramDetailResponse>();

      expect(body.money.counted).toBe(false);
      expect(body.money.expected.expected).toBe(0);
      expect(body.money.coveredItemCount).toBe(1);
    });

    it('returns 404 NOT_FOUND for an unknown grant', async () => {
      const res = await get('/api/subsidy-programs/nope');
      expect(res.statusCode).toBe(404);
      expect(res.json<ApiErrorResponse>().error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/subsidy-programs/:id/items', () => {
    it('lists tasks first, then purchases, each by title, with area and computed share', async () => {
      seedProject();

      const res = await get('/api/subsidy-programs/sp-1/items');

      expect(res.statusCode).toBe(200);
      const { items } = res.json<GrantCoveredItemsResponse>();
      expect(items.map((i) => [i.type, i.id, i.title])).toEqual([
        ['work_item', 'wi-a', 'Appliance install'],
        ['work_item', 'wi-b', 'Tiling'],
        ['household_item', 'hi-a', 'Oven'],
      ]);
      expect(items[0]!.area).toBeNull();
      expect(items[1]!.area).toMatchObject({ id: 'ar-kitchen', name: 'Kitchen' });
      expect(items[2]!.area).toMatchObject({ id: 'ar-house', name: 'House' });
    });

    it('the shares add up to the expected payout of the grant, to the cent', async () => {
      seedProject();

      const { items } = (
        await get('/api/subsidy-programs/sp-1/items')
      ).json<GrantCoveredItemsResponse>();
      const detail = (await get('/api/subsidy-programs/sp-1')).json<SubsidyProgramDetailResponse>();

      const cents = items.reduce((sum, item) => sum + Math.round(item.covered * 100), 0);
      expect(cents).toBe(Math.round(detail.money.expected.expected * 100));
      expect(items.every((item) => item.covered > 0)).toBe(true);
    });

    it('a rejected grant lists its linked items with a share of 0', async () => {
      seedProject();
      seed.grant('sp-rej', { status: 'rejected', workItems: ['wi-a'] });

      const { items } = (
        await get('/api/subsidy-programs/sp-rej/items')
      ).json<GrantCoveredItemsResponse>();

      expect(items).toEqual([expect.objectContaining({ id: 'wi-a', covered: 0 })]);
    });

    it('an empty list for a grant without links', async () => {
      seed.grant('sp-empty');
      const res = await get('/api/subsidy-programs/sp-empty/items');
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ items: [] });
    });

    it('returns 404 for an unknown grant and 401 without a session', async () => {
      expect((await get('/api/subsidy-programs/nope/items')).statusCode).toBe(404);
      const anon = await app.inject({ method: 'GET', url: '/api/subsidy-programs/sp-1/items' });
      expect(anon.statusCode).toBe(401);
    });
  });

  describe('POST /api/subsidy-programs/:id/items', () => {
    beforeEach(() => {
      seedProject();
      seed.grant('sp-2', { value: 20 });
    });

    it('links tasks and purchases and answers 201 with the full covered-item list', async () => {
      const res = await post('/api/subsidy-programs/sp-2/items', {
        items: [
          { type: 'work_item', id: 'wi-b' },
          { type: 'household_item', id: 'hi-b' },
        ],
      });

      expect(res.statusCode).toBe(201);
      expect(res.json<GrantCoveredItemsResponse>().items.map((i) => i.id)).toEqual([
        'wi-b',
        'hi-b',
      ]);
      expect(linkRows('sp-2')).toEqual({ work: 1, household: 1 });
    });

    it('is idempotent: repeating a request and overlapping pairs add no duplicate link', async () => {
      const payload = { items: [{ type: 'work_item', id: 'wi-a' }] };
      expect((await post('/api/subsidy-programs/sp-2/items', payload)).statusCode).toBe(201);
      const again = await post('/api/subsidy-programs/sp-2/items', payload);
      expect(again.statusCode).toBe(201);
      expect(linkRows('sp-2')).toEqual({ work: 1, household: 0 });

      const overlap = await post('/api/subsidy-programs/sp-2/items', {
        items: [
          { type: 'work_item', id: 'wi-a' },
          { type: 'work_item', id: 'wi-b' },
        ],
      });
      expect(overlap.json<GrantCoveredItemsResponse>().items).toHaveLength(2);
      expect(linkRows('sp-2')).toEqual({ work: 2, household: 0 });
    });

    it('the same item twice in one request is linked once', async () => {
      const res = await post('/api/subsidy-programs/sp-2/items', {
        items: [
          { type: 'household_item', id: 'hi-b' },
          { type: 'household_item', id: 'hi-b' },
        ],
      });
      expect(res.statusCode).toBe(201);
      expect(linkRows('sp-2')).toEqual({ work: 0, household: 1 });
    });

    it.each([
      [
        'an unknown task',
        [
          { type: 'work_item', id: 'wi-a' },
          { type: 'work_item', id: 'nope' },
        ],
      ],
      [
        'an unknown purchase',
        [
          { type: 'work_item', id: 'wi-a' },
          { type: 'household_item', id: 'nope' },
        ],
      ],
      [
        'a task id given as a purchase',
        [
          { type: 'work_item', id: 'wi-a' },
          { type: 'household_item', id: 'wi-b' },
        ],
      ],
    ])('%s is a 404 and nothing is linked, not even the valid item', async (_name, items) => {
      const res = await post('/api/subsidy-programs/sp-2/items', { items });

      expect(res.statusCode).toBe(404);
      expect(res.json<ApiErrorResponse>().error.code).toBe('NOT_FOUND');
      expect(linkRows('sp-2')).toEqual({ work: 0, household: 0 });
    });

    it('an unknown grant is a 404', async () => {
      const res = await post('/api/subsidy-programs/nope/items', {
        items: [{ type: 'work_item', id: 'wi-a' }],
      });
      expect(res.statusCode).toBe(404);
    });

    it.each([
      ['an empty items array (minItems 1)', { items: [] }],
      ['a missing items array', {}],
      [
        'more than 100 items (maxItems)',
        { items: Array.from({ length: 101 }, (_v, i) => ({ type: 'work_item', id: `w-${i}` })) },
      ],
      ['an unknown item type', { items: [{ type: 'invoice', id: 'wi-a' }] }],
      ['an empty item id', { items: [{ type: 'work_item', id: '' }] }],
      ['an item without an id', { items: [{ type: 'work_item' }] }],
    ])('returns 400 VALIDATION_ERROR for %s', async (_name, payload) => {
      const res = await post('/api/subsidy-programs/sp-2/items', payload);

      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
      expect(linkRows('sp-2')).toEqual({ work: 0, household: 0 });
    });

    it('exactly 100 items is accepted', async () => {
      // 100 unknown ids: the schema accepts, the existence check answers 404 (not 400)
      const res = await post('/api/subsidy-programs/sp-2/items', {
        items: Array.from({ length: 100 }, (_v, i) => ({ type: 'work_item', id: `w-${i}` })),
      });
      expect(res.statusCode).toBe(404);
    });

    it('strips an extra property instead of rejecting the request', async () => {
      const res = await post('/api/subsidy-programs/sp-2/items', {
        items: [{ type: 'work_item', id: 'wi-a', covered: 999 }],
        extra: true,
      });
      expect(res.statusCode).toBe(201);
      expect(linkRows('sp-2')).toEqual({ work: 1, household: 0 });
    });

    it('returns 401 without a session', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/subsidy-programs/sp-2/items',
        payload: { items: [{ type: 'work_item', id: 'wi-a' }] },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/subsidy-programs with items', () => {
    const base = { name: 'New grant', reductionType: 'percentage', reductionValue: 15 };

    beforeEach(() => seedProject());

    it('creates the grant and links its items in one request', async () => {
      const res = await post('/api/subsidy-programs', {
        ...base,
        items: [
          { type: 'work_item', id: 'wi-a' },
          { type: 'household_item', id: 'hi-b' },
        ],
      });

      expect(res.statusCode).toBe(201);
      const id = res.json<SubsidyProgramResponse>().subsidyProgram.id;
      expect(linkRows(id)).toEqual({ work: 1, household: 1 });
      const items = (
        await get(`/api/subsidy-programs/${id}/items`)
      ).json<GrantCoveredItemsResponse>();
      expect(items.items.map((i) => i.id)).toEqual(['wi-a', 'hi-b']);
    });

    it('an unknown item is a 404 and leaves no grant row and no link row behind', async () => {
      const grantsBefore = grantCount();
      const workBefore = app.db.select().from(schema.workItemSubsidies).all().length;
      const householdBefore = app.db.select().from(schema.householdItemSubsidies).all().length;

      const res = await post('/api/subsidy-programs', {
        ...base,
        items: [
          { type: 'work_item', id: 'wi-b' },
          { type: 'household_item', id: 'nope' },
        ],
      });

      expect(res.statusCode).toBe(404);
      expect(grantCount()).toBe(grantsBefore);
      expect(app.db.select().from(schema.workItemSubsidies).all().length).toBe(workBefore);
      expect(app.db.select().from(schema.householdItemSubsidies).all().length).toBe(
        householdBefore,
      );
    });

    it.each([
      ['no items', {}],
      ['an empty items array', { items: [] }],
    ])(
      'with %s creates the grant without links (items are optional on the API)',
      async (_n, extra) => {
        const res = await post('/api/subsidy-programs', { ...base, ...extra });

        expect(res.statusCode).toBe(201);
        expect(linkRows(res.json<SubsidyProgramResponse>().subsidyProgram.id)).toEqual({
          work: 0,
          household: 0,
        });
      },
    );

    it('more than 100 items is a 400 and creates nothing', async () => {
      const before = grantCount();
      const res = await post('/api/subsidy-programs', {
        ...base,
        items: Array.from({ length: 101 }, (_v, i) => ({ type: 'work_item', id: `w-${i}` })),
      });
      expect(res.statusCode).toBe(400);
      expect(grantCount()).toBe(before);
    });

    it('still accepts a legacy fixed reduction on the API (never offered in the UI)', async () => {
      const res = await post('/api/subsidy-programs', {
        name: 'Legacy fixed',
        reductionType: 'fixed',
        reductionValue: 500,
        items: [{ type: 'work_item', id: 'wi-a' }],
      });
      expect(res.statusCode).toBe(201);
      expect(res.json<SubsidyProgramResponse>().subsidyProgram).toMatchObject({
        reductionType: 'fixed',
        reductionValue: 500,
      });
    });
  });

  describe('removing a covered item through the per-kind routes', () => {
    beforeEach(() => seedProject());

    it.each([
      ['task', '/api/work-items/wi-a/subsidies/sp-1', { work: 1, household: 1 }],
      ['purchase', '/api/household-items/hi-a/subsidies/sp-1', { work: 2, household: 0 }],
    ])(
      'unlinking a %s answers { undo } and the Undo re-links it',
      async (_kind, url, afterRemove) => {
        const res = await app.inject({ method: 'DELETE', url, headers: { cookie } });

        expect(res.statusCode).toBe(200);
        const token = res.json<{ undo?: { token: string } }>().undo?.token;
        expect(token).toBeDefined();
        expect(linkRows('sp-1')).toEqual(afterRemove);

        const restored = await app.inject({
          method: 'POST',
          url: `/api/undo/${token}`,
          headers: { cookie },
        });
        expect(restored.statusCode).toBe(200);
        expect(linkRows('sp-1')).toEqual({ work: 2, household: 1 });
        const items = (
          await get('/api/subsidy-programs/sp-1/items')
        ).json<GrantCoveredItemsResponse>();
        expect(items.items).toHaveLength(3);
      },
    );
  });
});
