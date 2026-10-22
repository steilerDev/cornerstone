/**
 * Route tests for /api/attention (#2229, contract 1): auth, validation, shapes, Not now per user,
 * and the daily-reschedule path. `Date` is faked to T = 2026-03-10 09:00 UTC (timers stay real);
 * all data is synthetic.
 *
 * Mutations these tests catch:
 *  - a missing session check on any of the three endpoints (401);
 *  - the user id taken from input instead of the session (per-user isolation);
 *  - a bad key / missing key accepted (400), a valid key rejected;
 *  - DELETE not idempotent, POST/DELETE status codes (200 / 204);
 *  - GET not running the daily reschedule (a stale purchase late flag would still produce a row);
 *  - member and admin receiving different bodies.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import * as schema from '../db/schema.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { resetRescheduleTracker } from '../services/schedulingEngine.js';
import type {
  ApiErrorResponse,
  AttentionNotNowResponse,
  AttentionResponse,
} from '@cornerstone/shared';

const NOW = '2026-03-10T09:00:00.000Z';
const STAMP = '2026-03-01T00:00:00.000Z';
const ts = { createdAt: STAMP, updatedAt: STAMP };

const FAKE_DATE_ONLY = [
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
] as const;

describe('attention routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let memberId: string;
  let memberCookie: string;
  let adminCookie: string;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-attention-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    process.env.PHOTO_STORAGE_PATH = join(tempDir, 'photos');
    app = await buildApp();

    jest.useFakeTimers({ now: new Date(NOW), doNotFake: [...FAKE_DATE_ONLY] });
    resetRescheduleTracker();

    const member = await userService.createLocalUser(
      app.db,
      'member@example.test',
      'Member Person',
      'password',
      'member',
    );
    memberId = member.id;
    memberCookie = `cornerstone_session=${sessionService.createSession(app.db, member.id, 604800)}`;
    const admin = await userService.createLocalUser(
      app.db,
      'admin@example.test',
      'Admin Person',
      'password',
      'admin',
    );
    adminCookie = `cornerstone_session=${sessionService.createSession(app.db, admin.id, 604800)}`;

    seed();
  });

  afterEach(async () => {
    jest.useRealTimers();
    if (app) await app.close();
    process.env = originalEnv;
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  /** A late task (N1), an overdue invoice (N4), an old draft (H1). */
  function seed(): void {
    app.db
      .insert(schema.vendors)
      .values({ id: 'v-a', name: 'Company A', ...ts })
      .run();
    app.db
      .insert(schema.workItems)
      .values({
        id: 'wi-1',
        title: 'Task A',
        status: 'in_progress',
        startDate: '2026-02-20',
        endDate: '2026-03-05',
        ...ts,
      })
      .run();
    app.db
      .insert(schema.invoices)
      .values({
        id: 'inv-1',
        vendorId: 'v-a',
        invoiceNumber: 'NR-1',
        amount: 1000,
        status: 'pending',
        date: '2026-02-20',
        dueDate: '2026-03-01',
        ...ts,
      })
      .run();
    app.db
      .insert(schema.diaryEntries)
      .values({
        id: 'dr-old',
        entryType: 'daily_log',
        entryDate: '2026-03-08',
        body: '',
        status: 'draft',
        isAutomatic: false,
        createdAt: '2026-03-08T10:00:00.000Z',
        updatedAt: '2026-03-08T10:00:00.000Z',
      })
      .run();
  }

  const get = (url = '/api/attention', cookie: string | null = memberCookie) =>
    app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });

  const postNotNow = (payload: unknown, cookie: string | null = memberCookie) =>
    app.inject({
      method: 'POST',
      url: '/api/attention/not-now',
      headers: cookie
        ? { cookie, 'content-type': 'application/json' }
        : { 'content-type': 'application/json' },
      payload: JSON.stringify(payload),
    });

  const del = (key: string, cookie: string | null = memberCookie) =>
    app.inject({
      method: 'DELETE',
      url: `/api/attention/not-now/${encodeURIComponent(key)}`,
      headers: cookie ? { cookie } : {},
    });

  // ─── Auth ───────────────────────────────────────────────────────────────────

  describe('without a session', () => {
    it('GET /api/attention returns 401 UNAUTHORIZED', async () => {
      const res = await get('/api/attention', null);
      expect(res.statusCode).toBe(401);
      expect(res.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
    });

    it('POST /api/attention/not-now returns 401 UNAUTHORIZED', async () => {
      const res = await postNotNow({ key: 'N4:invoice:inv-1' }, null);
      expect(res.statusCode).toBe(401);
      expect(res.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
    });

    it('DELETE /api/attention/not-now/:key returns 401 UNAUTHORIZED', async () => {
      const res = await del('N4:invoice:inv-1', null);
      expect(res.statusCode).toBe(401);
      expect(res.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
    });
  });

  // ─── GET ────────────────────────────────────────────────────────────────────

  describe('GET /api/attention', () => {
    it('returns the documented shape with the seeded rows', async () => {
      const res = await get();
      expect(res.statusCode).toBe(200);
      const body = res.json<AttentionResponse>();
      expect(Object.keys(body).sort()).toEqual([
        'catchUp',
        'count',
        'criticalLine',
        'rows',
        'snoozedCount',
        'standing',
        'tidyUp',
        'today',
      ]);
      expect(body.today).toBe('2026-03-10');
      expect(body.rows.map((r) => r.key).sort()).toEqual(['N1:work_item:wi-1', 'N4:invoice:inv-1']);
      expect(body.count).toBe(2);
      expect(body.snoozedCount).toBe(0);
      expect(body.tidyUp.map((r) => r.key)).toEqual(
        expect.arrayContaining(['H1:diary_entry:dr-old', 'H2:invoice:inv-1']),
      );
      expect(body.standing).toEqual([]);
      expect(body.catchUp).toBeNull();
    });

    it('member and admin receive identical bodies', async () => {
      const member = (await get('/api/attention', memberCookie)).json<AttentionResponse>();
      const admin = (await get('/api/attention', adminCookie)).json<AttentionResponse>();
      expect(admin).toEqual(member);
    });

    it('strips unknown query parameters instead of rejecting them', async () => {
      const res = await get('/api/attention?foo=bar&includeSnoozed=false');
      expect(res.statusCode).toBe(200);
    });

    it('rejects a non-boolean includeSnoozed with 400 VALIDATION_ERROR', async () => {
      const res = await get('/api/attention?includeSnoozed=maybe');
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });

    it('includeSnoozed=true returns snoozed rows flagged; the default hides them', async () => {
      await postNotNow({ key: 'N4:invoice:inv-1' });
      const hidden = (await get()).json<AttentionResponse>();
      expect(hidden.rows.map((r) => r.key)).toEqual(['N1:work_item:wi-1']);
      expect(hidden.count).toBe(1);
      expect(hidden.snoozedCount).toBe(1);

      const shown = (await get('/api/attention?includeSnoozed=true')).json<AttentionResponse>();
      const row = shown.rows.find((r) => r.key === 'N4:invoice:inv-1');
      expect(row?.snoozedUntil).toBe('2026-03-17');
      expect(shown.count).toBe(1);
      expect(shown.snoozedCount).toBe(1);

      const off = (await get('/api/attention?includeSnoozed=false')).json<AttentionResponse>();
      expect(off.rows.map((r) => r.key)).toEqual(['N1:work_item:wi-1']);
    });

    it('runs the daily reschedule first: the stored late flag is derived before the rules run, and a past latest date is red after a single GET', async () => {
      app.db
        .insert(schema.householdItems)
        .values({
          id: 'hi-red',
          name: 'Purchase Red',
          categoryId: 'hic-furniture',
          status: 'purchased',
          latestDeliveryDate: '2026-03-08',
          isLate: false,
          ...ts,
        })
        .run();
      app.db
        .insert(schema.householdItems)
        .values({
          id: 'hi-ok',
          name: 'Purchase Ok',
          categoryId: 'hic-furniture',
          status: 'planned',
          latestDeliveryDate: '2026-03-30',
          isLate: true,
          ...ts,
        })
        .run();
      const body = (await get()).json<AttentionResponse>();
      const stored = app.db.select().from(schema.householdItems).all();
      expect(stored.find((h) => h.id === 'hi-red')?.isLate).toBe(true);
      expect(stored.find((h) => h.id === 'hi-ok')?.isLate).toBe(false);
      expect(body.rows.find((r) => r.key === 'N10:household_item:hi-red')).toMatchObject({
        tier: 'late',
        severity: 'red',
        date: '2026-03-08',
        params: { rule: 'N10', isLate: true, dueInDays: -2 },
      });
      expect(body.rows.some((r) => r.key === 'N10:household_item:hi-ok')).toBe(false);
    });

    it('an earliest date in the past with no latest date is red as well', async () => {
      app.db
        .insert(schema.householdItems)
        .values({
          id: 'hi-early',
          name: 'Purchase Early',
          categoryId: 'hic-furniture',
          status: 'planned',
          earliestDeliveryDate: '2026-03-01',
          ...ts,
        })
        .run();
      const body = (await get()).json<AttentionResponse>();
      expect(body.rows.find((r) => r.key === 'N10:household_item:hi-early')).toMatchObject({
        tier: 'late',
        date: '2026-03-01',
      });
    });

    it('a snooze stored with until = today is shown (the snooze ended)', async () => {
      app.db
        .insert(schema.userPreferences)
        .values({
          userId: memberId,
          key: 'attention.snoozed',
          value: JSON.stringify({ 'N4:invoice:inv-1': '2026-03-10' }),
          ...ts,
        })
        .run();
      const body = (await get()).json<AttentionResponse>();
      expect(body.rows.map((r) => r.key)).toContain('N4:invoice:inv-1');
      expect(body.snoozedCount).toBe(0);
    });

    it('a snooze stored until tomorrow still hides the row', async () => {
      app.db
        .insert(schema.userPreferences)
        .values({
          userId: memberId,
          key: 'attention.snoozed',
          value: JSON.stringify({ 'N4:invoice:inv-1': '2026-03-11' }),
          ...ts,
        })
        .run();
      const body = (await get()).json<AttentionResponse>();
      expect(body.rows.map((r) => r.key)).not.toContain('N4:invoice:inv-1');
      expect(body.snoozedCount).toBe(1);
    });

    it('a corrupt stored snooze value never produces a 500', async () => {
      app.db
        .insert(schema.userPreferences)
        .values({ userId: memberId, key: 'attention.snoozed', value: '{broken', ...ts })
        .run();
      expect((await get()).statusCode).toBe(200);
    });
  });

  // ─── POST /not-now ──────────────────────────────────────────────────────────

  describe('POST /api/attention/not-now', () => {
    it('returns 200 with the key and today + 7 days', async () => {
      const res = await postNotNow({ key: 'N4:invoice:inv-1' });
      expect(res.statusCode).toBe(200);
      expect(res.json<AttentionNotNowResponse>()).toEqual({
        key: 'N4:invoice:inv-1',
        snoozedUntil: '2026-03-17',
      });
    });

    it('accepts a key that is not currently a row (no existence oracle)', async () => {
      const res = await postNotNow({ key: 'N12:diary_entry:never-existed' });
      expect(res.statusCode).toBe(200);
    });

    it('re-snoozing resets to today + 7', async () => {
      await postNotNow({ key: 'N4:invoice:inv-1' });
      jest.setSystemTime(new Date('2026-03-12T09:00:00.000Z'));
      const res = await postNotNow({ key: 'N4:invoice:inv-1' });
      expect(res.json<AttentionNotNowResponse>().snoozedUntil).toBe('2026-03-19');
    });

    it.each([
      ['a missing key', {}],
      ['an empty key', { key: '' }],
      ['a non-string key', { key: 5 }],
      ['H3 (does not exist)', { key: 'H3:diary_entry:d-1' }],
      ['N7 (does not exist)', { key: 'N7:invoice:inv-1' }],
      ['S1 (standing, not snoozable)', { key: 'S1:budget_source:src-1' }],
      ['an unknown subject type', { key: 'N1:photo:p-1' }],
      ['a slash in the id', { key: 'N1:work_item:a/b' }],
      ['a 65-character id', { key: `N1:work_item:${'a'.repeat(65)}` }],
      ['free text', { key: 'hello' }],
    ])('rejects %s with 400 VALIDATION_ERROR', async (_label, payload) => {
      const res = await postNotNow(payload);
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });

    it('ignores extra body fields (stripped, not rejected) and never takes a user id from input', async () => {
      const res = await postNotNow({ key: 'N4:invoice:inv-1', userId: 'someone-else', extra: 1 });
      expect(res.statusCode).toBe(200);
      const prefs = app.db.select().from(schema.userPreferences).all();
      expect(prefs).toHaveLength(1);
      expect(prefs[0]!.userId).toBe(memberId);
      expect(JSON.parse(prefs[0]!.value)).toEqual({ 'N4:invoice:inv-1': '2026-03-17' });
    });

    it('is per user: member and admin snoozes are separate preference rows', async () => {
      await postNotNow({ key: 'N4:invoice:inv-1' }, memberCookie);
      const adminBody = (await get('/api/attention', adminCookie)).json<AttentionResponse>();
      expect(adminBody.rows.map((r) => r.key)).toContain('N4:invoice:inv-1');
      expect(adminBody.count).toBe(2);
      expect(adminBody.snoozedCount).toBe(0);

      await postNotNow({ key: 'N1:work_item:wi-1' }, adminCookie);
      const memberBody = (await get('/api/attention', memberCookie)).json<AttentionResponse>();
      expect(memberBody.rows.map((r) => r.key)).toEqual(['N1:work_item:wi-1']);
      expect(app.db.select().from(schema.userPreferences).all()).toHaveLength(2);
    });
  });

  // ─── DELETE /not-now/:key ───────────────────────────────────────────────────

  describe('DELETE /api/attention/not-now/:key', () => {
    it('returns 204 and the row shows again (the Undo)', async () => {
      await postNotNow({ key: 'N4:invoice:inv-1' });
      const res = await del('N4:invoice:inv-1');
      expect(res.statusCode).toBe(204);
      expect(res.body).toBe('');
      const body = (await get()).json<AttentionResponse>();
      expect(body.rows.map((r) => r.key)).toContain('N4:invoice:inv-1');
      expect(body.snoozedCount).toBe(0);
    });

    it('is idempotent: 204 again, and 204 for a key that was never snoozed', async () => {
      await postNotNow({ key: 'N4:invoice:inv-1' });
      expect((await del('N4:invoice:inv-1')).statusCode).toBe(204);
      expect((await del('N4:invoice:inv-1')).statusCode).toBe(204);
      expect((await del('N9:invoice:never')).statusCode).toBe(204);
    });

    it('removes the preference row when the last snooze goes', async () => {
      await postNotNow({ key: 'N4:invoice:inv-1' });
      await del('N4:invoice:inv-1');
      expect(app.db.select().from(schema.userPreferences).all()).toEqual([]);
    });

    it("never touches another user's snooze", async () => {
      await postNotNow({ key: 'N4:invoice:inv-1' }, memberCookie);
      await postNotNow({ key: 'N4:invoice:inv-1' }, adminCookie);
      await del('N4:invoice:inv-1', memberCookie);
      const adminBody = (await get('/api/attention', adminCookie)).json<AttentionResponse>();
      expect(adminBody.snoozedCount).toBe(1);
    });

    it.each(['H3:diary_entry:d-1', 'N1:work_item:a b', 'hello', 'N1:photo:p-1'])(
      'rejects the key %s with 400 VALIDATION_ERROR',
      async (key) => {
        const res = await del(key);
        expect(res.statusCode).toBe(400);
        expect(res.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
      },
    );
  });
});
