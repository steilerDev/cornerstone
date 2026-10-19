/**
 * #2223 (AC6): system events are always written. A deployment that still sets the removed
 * DIARY_AUTO_EVENTS=false gets a startup warning and events anyway.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { __resetLedgerForTests } from '../services/statusEventLedger.js';
import { diaryEntries } from '../db/schema.js';
import type { WorkItemDetail } from '@cornerstone/shared';

describe('system events are always written (#2223)', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-system-events-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    process.env.DIARY_AUTO_EVENTS = 'false';
    app = await buildApp();
    __resetLedgerForTests();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = originalEnv;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('a status PATCH still writes an event with the acting user, with DIARY_AUTO_EVENTS=false', async () => {
    const user = await userService.createLocalUser(
      app.db,
      'user@example.test',
      'Test User',
      'password-1234',
      'member',
    );
    const cookie = `cornerstone_session=${sessionService.createSession(app.db, user.id, 3600)}`;
    const created = await app.inject({
      method: 'POST',
      url: '/api/work-items',
      headers: { cookie },
      payload: { title: 'Task A' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<WorkItemDetail>().id;

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/work-items/${id}`,
      headers: { cookie },
      payload: { status: 'in_progress' },
    });

    expect(patched.statusCode).toBe(200);
    const events = app.db
      .select()
      .from(diaryEntries)
      .all()
      .filter((e) => e.entryType === 'work_item_status');
    expect(events).toHaveLength(1);
    expect(events[0]!.createdBy).toBe(user.id);
    expect(events[0]!.title).toBeNull();
    expect(events[0]!.body).toBe('');
    expect(JSON.parse(events[0]!.metadata!)).toEqual({
      v: 1,
      event: 'status_changed',
      from: 'not_started',
      to: 'in_progress',
      subjectLabel: 'Task A',
    });
  });
});
