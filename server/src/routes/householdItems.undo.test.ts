/**
 * Undo of a purchase dependency delete (#2209): DELETE .../dependencies/:type/:id issues an Undo
 * token and POST /api/undo/:token puts the dependency back.
 *
 * Mutation caught: a restore callback that does not re-insert the dependency.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import * as schema from '../db/schema.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';

describe('purchase dependency delete can be undone', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let cookie: string;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-hi-undo-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    app = await buildApp();
    const user = await userService.createLocalUser(
      app.db,
      'member@example.test',
      'Member Person',
      'password',
      'member',
    );
    cookie = `cornerstone_session=${sessionService.createSession(app.db, user.id, 3600)}`;
    const now = new Date().toISOString();
    app.db
      .insert(schema.workItems)
      .values({
        id: 'wi-1',
        title: 'Pour slab',
        status: 'not_started',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    app.db
      .insert(schema.householdItems)
      .values({
        id: 'hi-1',
        name: 'Sofa',
        categoryId: 'hic-furniture',
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = originalEnv;
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  const deps = async () =>
    (
      await app.inject({
        method: 'GET',
        url: '/api/household-items/hi-1/dependencies',
        headers: { cookie },
      })
    ).json<{ dependencies: Array<{ predecessorId: string }> }>().dependencies;

  it('Undo brings back a deleted dependency', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/household-items/hi-1/dependencies',
      headers: { cookie },
      payload: { predecessorType: 'work_item', predecessorId: 'wi-1' },
    });
    expect(created.statusCode).toBe(201);
    const del = await app.inject({
      method: 'DELETE',
      url: '/api/household-items/hi-1/dependencies/work_item/wi-1',
      headers: { cookie },
    });
    expect(del.statusCode).toBe(200);
    expect(await deps()).toHaveLength(0);

    const undo = await app.inject({
      method: 'POST',
      url: `/api/undo/${del.json<{ undo: { token: string } }>().undo.token}`,
      headers: { cookie },
    });

    expect(undo.statusCode).toBe(200);
    expect((await deps()).map((d) => d.predecessorId)).toEqual(['wi-1']);
  });
});
