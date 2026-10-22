/**
 * Route tests for /api/home (#2230, contract 24): auth, shapes, member vs admin set-up steps, the
 * daily-reschedule path, and agreement of the pulse with the Tasks and Invoices lists. `Date` is
 * faked to T = 2026-03-10 09:00 UTC (timers stay real); all data is synthetic.
 *
 * Mutations these tests catch:
 *  - a missing session check on any of the three endpoints (401);
 *  - /week not running the daily reschedule (a stale purchase late flag survives the GET);
 *  - members receiving the household / backups steps, or admins not receiving them;
 *  - the backup directory path reaching the response or the log;
 *  - the pulse counting tasks or open invoices on a different query than the lists it links to;
 *  - user names, e-mails or ids reaching any response.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import homeRoutes from './home.js';
import * as schema from '../db/schema.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { resetRescheduleTracker } from '../services/schedulingEngine.js';
import { computeProjectMoney } from '../services/moneyService.js';
import { seedAttentionFixture, FIXTURE_USER, type FixtureDb } from '../test/attentionFixture.js';
import {
  HOME_SETUP_STEPS,
  type ApiErrorResponse,
  type HomePulseResponse,
  type HomeSetupResponse,
  type HomeWeekResponse,
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

describe('home routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let backupDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let memberCookie: string;
  let adminCookie: string;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-home-'));
    backupDir = mkdtempSync(join(tmpdir(), 'cornerstone-home-backups-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    process.env.PHOTO_STORAGE_PATH = join(tempDir, 'photos');
    process.env.BACKUP_DIR = backupDir;
    delete process.env.BACKUP_CADENCE;
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
    memberCookie = `cornerstone_session=${sessionService.createSession(app.db, member.id, 604800)}`;
    const admin = await userService.createLocalUser(
      app.db,
      'admin@example.test',
      'Admin Person',
      'password',
      'admin',
    );
    adminCookie = `cornerstone_session=${sessionService.createSession(app.db, admin.id, 604800)}`;
  });

  afterEach(async () => {
    jest.useRealTimers();
    if (app) await app.close();
    process.env = originalEnv;
    for (const dir of [tempDir, backupDir]) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  const get = (url: string, cookie: string | null = memberCookie) =>
    app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });

  const fixtureDb = (): FixtureDb => app.db as unknown as FixtureDb;

  // ─── Auth ───────────────────────────────────────────────────────────────────

  describe('without a session', () => {
    it.each(['/api/home/week', '/api/home/pulse', '/api/home/setup'])(
      'GET %s returns 401 UNAUTHORIZED',
      async (url) => {
        const res = await get(url, null);
        expect(res.statusCode).toBe(401);
        expect(res.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
      },
    );

    it('rejects an invalid session cookie the same way', async () => {
      const res = await get('/api/home/week', 'cornerstone_session=not-a-session');
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── /week ──────────────────────────────────────────────────────────────────

  describe('GET /api/home/week', () => {
    it('returns today, the 21-day range and an empty list for an empty project', async () => {
      const res = await get('/api/home/week');
      expect(res.statusCode).toBe(200);
      expect(res.json<HomeWeekResponse>()).toEqual({
        today: '2026-03-10',
        from: '2026-03-10',
        to: '2026-03-30',
        items: [],
      });
    });

    it('returns the documented item shape for every kind, for a member and an admin alike', async () => {
      seedAttentionFixture(fixtureDb());
      const member = (await get('/api/home/week', memberCookie)).json<HomeWeekResponse>();
      const admin = (await get('/api/home/week', adminCookie)).json<HomeWeekResponse>();
      expect(admin).toEqual(member);
      expect([...new Set(member.items.map((i) => i.kind))].sort()).toEqual([
        'delivery',
        'ends',
        'milestone',
        'payment',
        'starts',
      ]);
      for (const item of member.items) {
        expect(Object.keys(item).sort()).toEqual([
          'amount',
          'companyName',
          'date',
          'heldUpBy',
          'key',
          'kind',
          'link',
          'recordKind',
          'schedule',
          'subject',
        ]);
        expect(item.date >= member.from && item.date <= member.to).toBe(true);
      }
      const starts = member.items.find((i) => i.key === 'starts:work_item:wi-2')!;
      expect(starts.heldUpBy).toEqual({ id: 'wi-1', label: 'Task A' });
      expect(member.items.find((i) => i.key === 'payment:progress_payment:dep-2')).toMatchObject({
        amount: 300,
        recordKind: 'offer',
        link: { route: 'invoice', params: { id: 'off-1' }, query: { payment: 'dep-2' } },
      });
    });

    it('never returns a user name, e-mail or user id', async () => {
      seedAttentionFixture(fixtureDb());
      const body = (await get('/api/home/week')).body;
      for (const secret of [
        FIXTURE_USER.id,
        FIXTURE_USER.email,
        FIXTURE_USER.displayName,
        'member@example.test',
        'admin@example.test',
        'Member Person',
        'Admin Person',
      ]) {
        expect(body).not.toContain(secret);
      }
    });

    it('runs the daily reschedule first: a stored late flag is derived by a single GET', async () => {
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
      const res = await get('/api/home/week');
      expect(res.statusCode).toBe(200);
      const stored = app.db.select().from(schema.householdItems).all();
      expect(stored.find((h) => h.id === 'hi-red')?.isLate).toBe(true);
      expect(stored.find((h) => h.id === 'hi-ok')?.isLate).toBe(false);
      // the on-time purchase is in the window by its latest date (T+20)
      expect(res.json<HomeWeekResponse>().items.map((i) => i.key)).toEqual([
        'delivery:household_item:hi-ok',
      ]);
    });

    it('ignores unknown query parameters (stripped, not rejected)', async () => {
      const res = await get('/api/home/week?foo=bar');
      expect(res.statusCode).toBe(200);
    });
  });

  // ─── /pulse ─────────────────────────────────────────────────────────────────

  describe('GET /api/home/pulse', () => {
    it('returns zeros and no verdict for an empty project', async () => {
      const res = await get('/api/home/pulse');
      expect(res.statusCode).toBe(200);
      expect(res.json<HomePulseResponse>()).toEqual({
        leftToSpend: { expected: 0, best: 0, worst: 0, verdict: null },
        stillToPay: 0,
        stillToPayCount: 0,
        progress: { total: 0, done: 0, inProgress: 0 },
      });
    });

    it('equals the money service for a member and an admin', async () => {
      seedAttentionFixture(fixtureDb());
      const money = computeProjectMoney(app.db, app.config.vatRate).summary;
      for (const cookie of [memberCookie, adminCookie]) {
        const body = (await get('/api/home/pulse', cookie)).json<HomePulseResponse>();
        expect(body.leftToSpend).toEqual(money.leftToSpend);
        expect(body.stillToPay).toBe(money.stillToPay);
        expect(body.stillToPayCount).toBe(money.stillToPayCount);
        expect(Object.keys(body).sort()).toEqual([
          'leftToSpend',
          'progress',
          'stillToPay',
          'stillToPayCount',
        ]);
      }
    });

    it('progress equals the Tasks list totals for all, completed and in progress', async () => {
      seedAttentionFixture(fixtureDb());
      const totalOf = async (query: string): Promise<number> => {
        const res = await get(`/api/work-items?pageSize=1${query}`);
        expect(res.statusCode).toBe(200);
        return res.json<{ pagination: { totalItems: number } }>().pagination.totalItems;
      };
      const pulse = (await get('/api/home/pulse')).json<HomePulseResponse>();
      expect(pulse.progress).toEqual({
        total: await totalOf(''),
        done: await totalOf('&status=completed'),
        inProgress: await totalOf('&status=in_progress'),
      });
      expect(pulse.progress.total).toBeGreaterThan(0);
    });

    it('stillToPay and its count equal the Invoices open-payable summary and the open-only list', async () => {
      seedAttentionFixture(fixtureDb());
      const pulse = (await get('/api/home/pulse')).json<HomePulseResponse>();
      const list = (await get('/api/invoices')).json<{
        summary: { openPayable: { count: number; totalAmount: number } };
      }>();
      expect(pulse.stillToPayCount).toBe(list.summary.openPayable.count);
      expect(pulse.stillToPay).toBe(list.summary.openPayable.totalAmount);
      expect(pulse.stillToPayCount).toBeGreaterThan(0);
      const open = (await get('/api/invoices?openOnly=true&pageSize=100')).json<{
        pagination: { totalItems: number };
      }>();
      expect(open.pagination.totalItems).toBe(pulse.stillToPayCount);
    });
  });

  // ─── /setup ─────────────────────────────────────────────────────────────────

  describe('GET /api/home/setup', () => {
    it('gives a member the six shared steps, all open on an empty project', async () => {
      const res = await get('/api/home/setup', memberCookie);
      expect(res.statusCode).toBe(200);
      expect(res.json<HomeSetupResponse>()).toEqual({
        coreComplete: false,
        steps: [
          { id: 'house', done: false },
          { id: 'areas', done: false },
          { id: 'funding', done: false },
          { id: 'companies', done: false },
          { id: 'tasks', done: false },
          { id: 'firstLog', done: false },
        ],
      });
    });

    it('gives an admin all eight steps in order, with household done (two users) and backups open', async () => {
      const res = await get('/api/home/setup', adminCookie);
      expect(res.statusCode).toBe(200);
      const body = res.json<HomeSetupResponse>();
      expect(body.steps.map((s) => s.id)).toEqual([...HOME_SETUP_STEPS]);
      expect(Object.fromEntries(body.steps.map((s) => [s.id, s.done]))).toEqual({
        house: false,
        areas: false,
        funding: false,
        companies: false,
        tasks: false,
        household: true,
        backups: false,
        firstLog: false,
      });
    });

    it('marks backups done for an admin once an archive exists, and never for the member view', async () => {
      writeFileSync(join(backupDir, 'cornerstone-backup-2026-03-01T100000Z.tar.gz'), 'x');
      const admin = (await get('/api/home/setup', adminCookie)).json<HomeSetupResponse>();
      expect(admin.steps.find((s) => s.id === 'backups')).toEqual({ id: 'backups', done: true });
      const member = (await get('/api/home/setup', memberCookie)).json<HomeSetupResponse>();
      expect(member.steps.map((s) => s.id)).not.toContain('backups');
      expect(member.steps.map((s) => s.id)).not.toContain('household');
    });

    it('reports backups as null (unknown) and never leaks the backup path when the directory cannot be read', async () => {
      const notADirectory = join(backupDir, 'backups-file');
      writeFileSync(notADirectory, 'x');
      // a fresh app: the configured backup path is a regular file
      await app.close();
      process.env.BACKUP_DIR = notADirectory;
      app = await buildApp();
      const admin = await userService.createLocalUser(
        app.db,
        'admin2@example.test',
        'Admin Two',
        'password',
        'admin',
      );
      const cookie = `cornerstone_session=${sessionService.createSession(app.db, admin.id, 604800)}`;
      const res = await get('/api/home/setup', cookie);
      expect(res.statusCode).toBe(200);
      const body = res.json<HomeSetupResponse>();
      expect(body.steps.find((s) => s.id === 'backups')).toEqual({ id: 'backups', done: null });
      expect(res.body).not.toContain(notADirectory);
      expect(res.body).not.toContain('backups-file');
    });

    it('reports the core steps done and coreComplete once the project is set up', async () => {
      const db = fixtureDb();
      seedAttentionFixture(db);
      app.db
        .insert(schema.appSettings)
        .values({ key: 'household_name', value: 'Home A', updatedAt: STAMP })
        .run();
      const body = (await get('/api/home/setup', memberCookie)).json<HomeSetupResponse>();
      expect(Object.fromEntries(body.steps.map((s) => [s.id, s.done]))).toEqual({
        house: true,
        areas: true,
        funding: true,
        companies: true,
        tasks: true,
        firstLog: true,
      });
      expect(body.coreComplete).toBe(true);
    });

    it('never returns user names, e-mails or the backup directory', async () => {
      const res = await get('/api/home/setup', adminCookie);
      for (const secret of ['member@example.test', 'Admin Person', backupDir]) {
        expect(res.body).not.toContain(secret);
      }
    });
  });
  // ─── Defence in depth ───────────────────────────────────────────────────────

  describe('handlers reached without a user (the auth plugin normally stops these first)', () => {
    it.each(['/week', '/pulse', '/setup'])(
      'GET %s throws UnauthorizedError and returns no data',
      async (path) => {
        const bare = Fastify();
        const seen: string[] = [];
        bare.setErrorHandler((error, _request, reply) => {
          seen.push((error as Error).name);
          return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });
        });
        await bare.register(homeRoutes, { prefix: '/api/home' });
        const res = await bare.inject({ method: 'GET', url: `/api/home${path}` });
        expect(res.statusCode).toBe(401);
        expect(seen).toEqual(['UnauthorizedError']);
        await bare.close();
      },
    );
  });
});
