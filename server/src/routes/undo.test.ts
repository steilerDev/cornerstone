/**
 * Integration tests for POST /api/undo/:token (#2209, contract 19).
 * Security focus: user-bound single-use tokens, no existence oracle, expiry, auth, input shape.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { __resetLedgerForTests } from '../services/statusEventLedger.js';
import { undoStore } from '../services/undoService.js';
import { UNDO_WINDOW_MS } from '@cornerstone/shared';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse, UndoResponse, WorkItemDetail } from '@cornerstone/shared';
import { diaryEntries, workItems } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const FAKE_EXCEPT_DATE = [
  'nextTick',
  'setImmediate',
  'clearImmediate',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'queueMicrotask',
  'performance',
  'hrtime',
];

describe('Undo Routes', () => {
  const realNow = undoStore.now;
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-undo-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    app = await buildApp();
    undoStore.snapshots.clear();
    // The singleton captured the real Date.now at import time; route it through the (fakeable) global.
    (undoStore as { now: () => number }).now = () => Date.now();
    __resetLedgerForTests();
  });

  afterEach(async () => {
    jest.useRealTimers();
    if (app) await app.close();
    undoStore.snapshots.clear();
    (undoStore as { now: () => number }).now = realNow;
    process.env = originalEnv;
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  async function session(email: string): Promise<{ userId: string; cookie: string }> {
    const user = await userService.createLocalUser(app.db, email, email, 'password-1234', 'member');
    const token = sessionService.createSession(app.db, user.id, 3600);
    return { userId: user.id, cookie: `cornerstone_session=${token}` };
  }

  async function createWorkItem(cookie: string, title = 'Walls'): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/work-items',
      headers: { cookie },
      payload: { title },
    });
    expect(res.statusCode).toBe(201);
    return res.json<WorkItemDetail>().id;
  }

  async function startWorkItem(
    cookie: string,
    id: string,
    status = 'in_progress',
  ): Promise<{ token: string; expiresAt: string }> {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/work-items/${id}`,
      headers: { cookie },
      payload: { status },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ undo?: { token: string; expiresAt: string } }>();
    expect(body.undo).toBeDefined();
    return body.undo!;
  }

  function undo(cookie: string | undefined, token: string) {
    return app.inject({
      method: 'POST',
      url: `/api/undo/${token}`,
      headers: cookie ? { cookie } : {},
    });
  }

  function rowStatus(id: string): string {
    return app.db.select().from(workItems).where(eq(workItems.id, id)).get()!.status;
  }

  describe('200', () => {
    it('restores the change and returns { restored, retractedEventIds }', async () => {
      const { cookie } = await session('a@example.com');
      const id = await createWorkItem(cookie);
      const token = (await startWorkItem(cookie, id)).token;
      expect(rowStatus(id)).toBe('in_progress');

      const res = await undo(cookie, token);

      expect(res.statusCode).toBe(200);
      const body = res.json<UndoResponse>();
      expect(body.restored).toContainEqual({ type: 'work_item', id });
      expect(Array.isArray(body.retractedEventIds)).toBe(true);
      expect(body.retractedEventIds).toHaveLength(1);
      expect(rowStatus(id)).toBe('not_started');
      const events = app.db
        .select()
        .from(diaryEntries)
        .where(eq(diaryEntries.entryType, 'work_item_status'))
        .all();
      expect(events).toHaveLength(0);
    });

    it('restores a rescheduled successor via the real routes', async () => {
      const { cookie } = await session('a@example.com');
      const pred = await app.inject({
        method: 'POST',
        url: '/api/work-items',
        headers: { cookie },
        payload: { title: 'Pred', startDate: '2026-08-10', durationDays: 3 },
      });
      const succ = await app.inject({
        method: 'POST',
        url: '/api/work-items',
        headers: { cookie },
        payload: { title: 'Succ', startDate: '2026-08-13', durationDays: 2 },
      });
      const predId = pred.json<WorkItemDetail>().id;
      const succId = succ.json<WorkItemDetail>().id;
      const dep = await app.inject({
        method: 'POST',
        url: `/api/work-items/${succId}/dependencies`,
        headers: { cookie },
        payload: { predecessorId: predId, dependencyType: 'finish_to_start' },
      });
      expect(dep.statusCode).toBe(201);
      const before = app.db.select().from(workItems).where(eq(workItems.id, succId)).get()!;

      const patch = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${predId}`,
        headers: { cookie },
        payload: {
          status: 'completed',
          actualStartDate: '2026-08-10',
          actualEndDate: '2026-08-25',
        },
      });
      const token = patch.json<{ undo: { token: string } }>().undo.token;
      const moved = app.db.select().from(workItems).where(eq(workItems.id, succId)).get()!;
      expect(moved.startDate).not.toBe(before.startDate);

      const res = await undo(cookie, token);
      expect(res.statusCode).toBe(200);
      const restored = app.db.select().from(workItems).where(eq(workItems.id, succId)).get()!;
      expect(restored.startDate).toBe(before.startDate);
      expect(restored.endDate).toBe(before.endDate);
    });
  });

  describe('single use', () => {
    it('returns 404 NOT_FOUND on the second use and leaves the first result in place', async () => {
      const { cookie } = await session('a@example.com');
      const id = await createWorkItem(cookie);
      const token = (await startWorkItem(cookie, id)).token;
      expect((await undo(cookie, token)).statusCode).toBe(200);

      const second = await undo(cookie, token);

      expect(second.statusCode).toBe(404);
      expect(second.json<ApiErrorResponse>().error.code).toBe('NOT_FOUND');
      expect(rowStatus(id)).toBe('not_started');
    });

    it('consumes the token on a 409 (conflict) as well', async () => {
      const { cookie } = await session('a@example.com');
      const id = await createWorkItem(cookie);
      const token = (await startWorkItem(cookie, id)).token;
      // somebody changes the row afterwards
      await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${id}`,
        headers: { cookie },
        payload: { status: 'completed' },
      });

      const conflict = await undo(cookie, token);
      expect(conflict.statusCode).toBe(409);
      const body = conflict.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.details).toEqual({ changed: [{ type: 'work_item', id }] });
      expect(rowStatus(id)).toBe('completed');

      expect((await undo(cookie, token)).statusCode).toBe(404);
    });
  });

  describe('user binding (security)', () => {
    it('another signed-in user gets 404 and nothing is restored', async () => {
      const a = await session('a@example.com');
      const b = await session('b@example.com');
      const id = await createWorkItem(a.cookie);
      const token = (await startWorkItem(a.cookie, id)).token;

      const res = await undo(b.cookie, token);

      expect(res.statusCode).toBe(404);
      expect(res.json<ApiErrorResponse>().error.code).toBe('NOT_FOUND');
      expect(rowStatus(id)).toBe('in_progress');
    });

    it('a foreign attempt is indistinguishable from an unknown token (no existence oracle)', async () => {
      const a = await session('a@example.com');
      const b = await session('b@example.com');
      const id = await createWorkItem(a.cookie);
      const token = (await startWorkItem(a.cookie, id)).token;

      const foreign = await undo(b.cookie, token);
      const unknown = await undo(b.cookie, `u_${'a'.repeat(32)}`);

      expect(foreign.statusCode).toBe(unknown.statusCode);
      expect(foreign.json<ApiErrorResponse>()).toEqual(unknown.json<ApiErrorResponse>());
    });

    it('a foreign attempt does not burn the owner token', async () => {
      const a = await session('a@example.com');
      const b = await session('b@example.com');
      const id = await createWorkItem(a.cookie);
      const token = (await startWorkItem(a.cookie, id)).token;

      expect((await undo(b.cookie, token)).statusCode).toBe(404);
      const owner = await undo(a.cookie, token);

      expect(owner.statusCode).toBe(200);
      expect(rowStatus(id)).toBe('not_started');
    });
  });

  describe('expiry', () => {
    it('returns 404 once the 30 s window has passed and does not restore', async () => {
      const { cookie } = await session('a@example.com');
      const id = await createWorkItem(cookie);
      const token = (await startWorkItem(cookie, id)).token;

      jest.useFakeTimers({
        now: Date.now() + UNDO_WINDOW_MS + 1,
        doNotFake: FAKE_EXCEPT_DATE as never,
      });
      const res = await undo(cookie, token);

      expect(res.statusCode).toBe(404);
      expect(rowStatus(id)).toBe('in_progress');
    });

    it('still works just inside the window', async () => {
      const { cookie } = await session('a@example.com');
      const id = await createWorkItem(cookie);
      const issued = await startWorkItem(cookie, id);
      const expiresAt = Date.parse(issued.expiresAt);

      jest.useFakeTimers({ now: expiresAt - 1000, doNotFake: FAKE_EXCEPT_DATE as never });
      const res = await undo(cookie, issued.token);

      expect(res.statusCode).toBe(200);
    });
  });

  describe('validation and auth', () => {
    it.each([
      ['an arbitrary string', 'not-a-token'],
      ['a missing prefix', 'a'.repeat(32)],
      ['upper-case hex', `u_${'A'.repeat(32)}`],
      ['too short', `u_${'a'.repeat(31)}`],
      ['too long', `u_${'a'.repeat(33)}`],
      ['non-hex characters', `u_${'g'.repeat(32)}`],
    ])('returns 400 VALIDATION_ERROR for %s', async (_label, token) => {
      const { cookie } = await session('a@example.com');
      const res = await undo(cookie, token);
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 401 UNAUTHORIZED without a session, even for a well-formed token', async () => {
      const res = await undo(undefined, `u_${'a'.repeat(32)}`);
      expect(res.statusCode).toBe(401);
      expect(res.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 without a session for a token that really exists, and does not consume it', async () => {
      const { cookie } = await session('a@example.com');
      const id = await createWorkItem(cookie);
      const token = (await startWorkItem(cookie, id)).token;

      expect((await undo(undefined, token)).statusCode).toBe(401);
      expect(undoStore.snapshots.has(token)).toBe(true);
      expect((await undo(cookie, token)).statusCode).toBe(200);
    });

    it('rejects an invalid session cookie with 401', async () => {
      const res = await undo('cornerstone_session=bogus', `u_${'a'.repeat(32)}`);
      expect(res.statusCode).toBe(401);
    });
  });
});
