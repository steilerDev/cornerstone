/**
 * Undo of the milestone link deletes (#2209): unlinking a contributing task and removing a
 * dependent task issue an Undo token; POST /api/undo/:token puts the row back and the milestone
 * list shows it again.
 *
 * Mutation caught: a restore callback that does not re-insert the link / dependency row.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { MilestoneDetail } from '@cornerstone/shared';
import { buildApp } from '../app.js';
import * as schema from '../db/schema.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';

describe('milestone link deletes can be undone', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let cookie: string;
  let milestoneId: number;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-milestone-undo-'));
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
    const created = await app.inject({
      method: 'POST',
      url: '/api/milestones',
      headers: { cookie },
      payload: { title: 'Roof closed', targetDate: '2026-06-01' },
    });
    milestoneId = created.json<MilestoneDetail>().id;
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

  const detail = async () =>
    (
      await app.inject({
        method: 'GET',
        url: `/api/milestones/${milestoneId}`,
        headers: { cookie },
      })
    ).json<MilestoneDetail>();

  it('Undo brings back an unlinked contributing task', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/milestones/${milestoneId}/work-items`,
      headers: { cookie },
      payload: { workItemId: 'wi-1' },
    });
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/milestones/${milestoneId}/work-items/wi-1`,
      headers: { cookie },
    });
    expect((await detail()).workItems).toHaveLength(0);

    const undo = await app.inject({
      method: 'POST',
      url: `/api/undo/${del.json<{ undo: { token: string } }>().undo.token}`,
      headers: { cookie },
    });

    expect(undo.statusCode).toBe(200);
    expect((await detail()).workItems.map((w) => w.id)).toEqual(['wi-1']);
  });

  it('removes a dependent task with an Undo token, and Undo brings it back', async () => {
    const added = await app.inject({
      method: 'POST',
      url: `/api/milestones/${milestoneId}/dependents/wi-1`,
      headers: { cookie },
    });
    expect(added.statusCode).toBe(201);
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/milestones/${milestoneId}/dependents/wi-1`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(200);
    expect((await detail()).dependentWorkItems).toHaveLength(0);

    const undo = await app.inject({
      method: 'POST',
      url: `/api/undo/${del.json<{ undo: { token: string } }>().undo.token}`,
      headers: { cookie },
    });

    expect(undo.statusCode).toBe(200);
    expect((await detail()).dependentWorkItems.map((w) => w.id)).toEqual(['wi-1']);
  });
});
