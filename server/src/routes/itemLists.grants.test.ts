/**
 * GET /api/work-items and GET /api/household-items (#2242, AC6): list rows always carry
 * `grants`; single-item reads (detail) do not.
 *
 * Mutations these tests catch: `grants` missing on a list row, rejected grant listed, `grants`
 * leaking onto the detail response.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { createMoneySeed } from '../test/moneyDb.js';

describe('list rows carry grant chips', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let cookie: string;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-item-grants-test-'));
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
    const seed = createMoneySeed(app.db);
    seed.workItem('wi-1', null, 'Roof');
    seed.workItem('wi-2', null, 'Paint');
    seed.householdItem('hi-1', null, 'Oven');
    seed.grant('sp-a', { value: 15, workItems: ['wi-1'], householdItems: ['hi-1'] });
    seed.grant('sp-rej', { status: 'rejected', workItems: ['wi-1'], householdItems: ['hi-1'] });
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

  it('GET /api/work-items: grants on every row, rejected excluded, [] when none', async () => {
    const res = await get('/api/work-items');
    expect(res.statusCode).toBe(200);
    const items = res.json<{ items: { title: string; grants: unknown[] }[] }>().items;
    expect(items.find((i) => i.title === 'Roof')!.grants).toEqual([
      { id: 'sp-a', name: 'Grant sp-a', reductionType: 'percentage', rate: 15 },
    ]);
    expect(items.find((i) => i.title === 'Paint')!.grants).toEqual([]);
  });

  it('GET /api/household-items: grants on every row, rejected excluded', async () => {
    const res = await get('/api/household-items');
    expect(res.statusCode).toBe(200);
    const items = res.json<{ items: { name: string; grants: unknown[] }[] }>().items;
    expect(items.find((i) => i.name === 'Oven')!.grants).toEqual([
      { id: 'sp-a', name: 'Grant sp-a', reductionType: 'percentage', rate: 15 },
    ]);
  });

  it('the task detail carries grants (the task page strip, #2248); the purchase detail does not', async () => {
    const work = (await get('/api/work-items/wi-1')).json<{
      title: string;
      grants: Array<{ id: string }>;
    }>();
    expect(work.title).toBe('Roof');
    // rejected grants stay out, like on the list rows
    expect(work.grants.map((g) => g.id)).toEqual(['sp-a']);
    const hi = (await get('/api/household-items/hi-1')).json<Record<string, unknown>>();
    expect(JSON.stringify(hi)).not.toContain('"grants"');
  });
});
