/**
 * Schema-validation and size-limit tests for POST /api/budget-lines/batch (Story #2235).
 *
 * Kept apart from budgetLineBatch.test.ts and sharing ONE app (beforeAll): 30+ buildApp()
 * instances in a single Jest worker exhaust the heap. Rejected requests write nothing.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import * as schema from '../db/schema.js';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse } from '@cornerstone/shared';

describe('POST /api/budget-lines/batch validation and limits', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let cookie: string;
  let sourceId: string;
  let taskId: string;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-blb-validation-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    app = await buildApp();
    const user = await userService.createLocalUser(
      app.db,
      'admin@example.com',
      'Admin',
      'password123',
      'admin',
    );
    cookie = `cornerstone_session=${sessionService.createSession(app.db, user.id, 3600)}`;
    const now = new Date().toISOString();
    sourceId = 'bs-validation';
    app.db
      .insert(schema.budgetSources)
      .values({
        id: sourceId,
        name: 'Synthetic savings',
        sourceType: 'savings',
        totalAmount: 100000,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    taskId = 'wi-validation';
    app.db
      .insert(schema.workItems)
      .values({
        id: taskId,
        title: 'Synthetic kitchen task',
        status: 'not_started',
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });

  afterAll(async () => {
    if (app) await app.close();
    process.env = originalEnv;
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  function entry(over: Record<string, unknown> = {}) {
    return {
      kind: 'create',
      targetType: 'work_item',
      targetId: taskId,
      plannedAmount: 100,
      budgetSourceId: sourceId,
      ...over,
    };
  }

  function linkEntry(over: Record<string, unknown> = {}) {
    return {
      kind: 'link',
      budgetLineType: 'work_item',
      budgetLineId: 'wib-synthetic',
      itemizedAmount: 50,
      ...over,
    };
  }

  async function post(payload: object) {
    return app.inject({
      method: 'POST',
      url: '/api/budget-lines/batch',
      headers: { cookie },
      payload,
    });
  }

  function rowCount(): number {
    return app.db.select().from(schema.workItemBudgets).all().length;
  }

  function detailsOf(res: { json: <T>() => T }): string {
    return JSON.stringify(res.json<ApiErrorResponse>().error.details);
  }

  describe('schema validation', () => {
    it('returns 400 for an empty lines array', async () => {
      const res = await post({ lines: [] });
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for more than 200 lines and writes nothing', async () => {
      const before = rowCount();
      const res = await post({ lines: Array.from({ length: 201 }, () => entry()) });
      expect(res.statusCode).toBe(400);
      expect(rowCount()).toBe(before);
    });

    it('returns 400 when lines is missing', async () => {
      expect((await post({})).statusCode).toBe(400);
    });

    it('returns 400 for an unknown kind, pointing at the entry', async () => {
      const res = await post({ lines: [entry(), { ...entry(), kind: 'merge' }] });
      expect(res.statusCode).toBe(400);
      expect(detailsOf(res)).toContain('/lines/1/kind');
    });

    it('returns 400 for a missing kind', async () => {
      const { kind: _kind, ...noKind } = entry();
      expect((await post({ lines: [noKind] })).statusCode).toBe(400);
    });

    it('reports a missing create field at the entry path', async () => {
      const { budgetSourceId: _s, ...noSource } = entry();
      const res = await post({ lines: [entry(), entry(), noSource] });
      expect(res.statusCode).toBe(400);
      expect(detailsOf(res)).toContain('/lines/2');
      expect(detailsOf(res)).toContain('budgetSourceId');
    });

    it('reports a missing link field at the entry path', async () => {
      const { itemizedAmount: _a, ...noAmount } = linkEntry();
      const res = await post({ invoiceId: 'inv-synthetic', lines: [noAmount] });
      expect(res.statusCode).toBe(400);
      expect(detailsOf(res)).toContain('/lines/0');
      expect(detailsOf(res)).toContain('itemizedAmount');
    });

    it('returns 400 for a zero or negative itemized amount on a link entry', async () => {
      for (const amount of [0, -5]) {
        const res = await post({
          invoiceId: 'inv-synthetic',
          lines: [linkEntry({ itemizedAmount: amount })],
        });
        expect(res.statusCode).toBe(400);
        expect(detailsOf(res)).toContain('/lines/0/itemizedAmount');
      }
    });

    it('returns 400 for a negative planned amount', async () => {
      const res = await post({ lines: [entry({ plannedAmount: -1 })] });
      expect(res.statusCode).toBe(400);
      expect(detailsOf(res)).toContain('/lines/0/plannedAmount');
    });

    it('returns 400 for an empty budgetSourceId', async () => {
      expect((await post({ lines: [entry({ budgetSourceId: '' })] })).statusCode).toBe(400);
    });

    it('returns 400 for an invalid target type', async () => {
      expect((await post({ lines: [entry({ targetType: 'invoice' })] })).statusCode).toBe(400);
    });

    it('returns 400 for an empty invoiceId', async () => {
      expect((await post({ invoiceId: '', lines: [entry()] })).statusCode).toBe(400);
    });
  });

  describe('size limits', () => {
    it('returns 413 for a body over 1 MiB and writes nothing', async () => {
      const before = rowCount();
      const res = await post({ lines: [entry()], pad: 'y'.repeat(1024 * 1024 + 10) });
      expect(res.statusCode).toBe(413);
      expect(rowCount()).toBe(before);
    });

    it('accepts the maximum of 200 lines in one batch', async () => {
      const before = rowCount();
      const lines = Array.from({ length: 200 }, (_, i) =>
        entry({ description: `Cabinet part ${i + 1}` }),
      );
      const res = await post({ lines });
      expect(res.statusCode).toBe(201);
      expect(rowCount()).toBe(before + 200);
    });
  });
});
