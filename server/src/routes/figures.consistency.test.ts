/**
 * Cross-surface consistency of "Holds up" (#2232, EPIC-21 principle 5: one answer per question).
 *
 * The attention rows (Home, the bell) and the Schedule / Calendar tooltips (GET /api/timeline)
 * must show the same `{ count, startingWithin14Days }` for the same task or milestone. Both call
 * `computeHoldsUp`; this test fails when either surface counts on its own again.
 *
 * `Date` is faked to 2026-03-10 09:00 UTC (timers stay real). One synthetic schedule: a late task
 * A, B and C behind it (FS chain), a completed successor E of A, a milestone M (past its target)
 * with contributor A and the required-by task D. All data is invented.
 *
 * Mutations these tests catch:
 *  - the timeline counting direct successors only (A would be 2, not 4);
 *  - the timeline counting a finished successor (E) or passing through it;
 *  - the timeline leaving milestone gates out (A would lose D, M would be 0);
 *  - a different `today` or projection in the two surfaces (startingWithin14Days drifts).
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
import type { AttentionResponse, TimelineResponse } from '@cornerstone/shared';

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

describe('figures consistency: holds up on attention rows and on the timeline', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let cookie: string;
  let milestoneId: number;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-figures-'));
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
    cookie = `cornerstone_session=${sessionService.createSession(app.db, member.id, 604800)}`;
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

  function seed(): void {
    const items: Array<
      [string, string, 'in_progress' | 'not_started' | 'completed', string, string]
    > = [
      ['wi-a', 'Task A', 'in_progress', '2026-02-20', '2026-03-05'],
      ['wi-b', 'Task B', 'not_started', '2026-03-06', '2026-03-12'],
      ['wi-c', 'Task C', 'not_started', '2026-03-13', '2026-03-20'],
      ['wi-d', 'Task D', 'not_started', '2026-03-21', '2026-03-25'],
      ['wi-e', 'Task E', 'completed', '2026-03-06', '2026-03-08'],
      ['wi-far', 'Task Far', 'not_started', '2026-06-01', '2026-06-05'],
    ];
    for (const [id, title, status, startDate, endDate] of items) {
      app.db
        .insert(schema.workItems)
        .values({ id, title, status, startDate, endDate, ...ts })
        .run();
    }
    // wi-far waits 60 days after A, so it starts outside the 14-day window
    for (const [predecessorId, successorId, leadLagDays] of [
      ['wi-a', 'wi-b', 0],
      ['wi-b', 'wi-c', 0],
      ['wi-a', 'wi-e', 0],
      ['wi-a', 'wi-far', 60],
    ] as const) {
      app.db
        .insert(schema.workItemDependencies)
        .values({ predecessorId, successorId, dependencyType: 'finish_to_start', leadLagDays })
        .run();
    }
    const milestone = app.db
      .insert(schema.milestones)
      .values({
        title: 'Roof closed',
        targetDate: '2026-03-01',
        isCompleted: false,
        completedAt: null,
        ...ts,
      })
      .returning({ id: schema.milestones.id })
      .get();
    milestoneId = milestone!.id;
    app.db.insert(schema.milestoneWorkItems).values({ milestoneId, workItemId: 'wi-a' }).run();
    app.db.insert(schema.workItemMilestoneDeps).values({ workItemId: 'wi-d', milestoneId }).run();
  }

  const getJson = async <T>(url: string): Promise<T> => {
    const res = await app.inject({ method: 'GET', url, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    return res.json<T>();
  };

  it('the fixture produces a late-task row and a late-milestone row to compare', async () => {
    const attention = await getJson<AttentionResponse>('/api/attention');
    const keys = attention.rows.map((r) => r.key);
    expect(keys).toContain('N1:work_item:wi-a');
    expect(keys).toContain(`N3:milestone:${milestoneId}`);
  });

  it('every attention row with holds-up shows the timeline count for the same task or milestone', async () => {
    const attention = await getJson<AttentionResponse>('/api/attention');
    const timeline = await getJson<TimelineResponse>('/api/timeline');
    expect(timeline.holdsUp).toBeDefined();

    const compared: string[] = [];
    for (const row of [...attention.rows, ...attention.tidyUp]) {
      if (row.holdsUp === null) continue;
      const params = row.params as { kind?: string };
      if (params.kind === 'group') continue;
      const table =
        row.subject.type === 'work_item'
          ? timeline.holdsUp!.workItems
          : row.subject.type === 'milestone'
            ? timeline.holdsUp!.milestones
            : null;
      if (table === null) continue;
      expect({ key: row.key, holdsUp: table[row.subject.id] }).toEqual({
        key: row.key,
        holdsUp: row.holdsUp,
      });
      compared.push(row.key);
    }

    expect(compared).toContain('N1:work_item:wi-a');
    expect(compared).toContain(`N3:milestone:${milestoneId}`);
  });

  it('pins the shared numbers: A holds up B, C, D (through the gate) and Far (60 days later); E is finished and not counted', async () => {
    const timeline = await getJson<TimelineResponse>('/api/timeline');
    const wi = timeline.holdsUp!.workItems;
    expect(wi['wi-a']).toEqual({ count: 4, startingWithin14Days: 3 });
    expect(wi['wi-b']).toEqual({ count: 1, startingWithin14Days: 1 });
    expect(wi['wi-c']).toEqual({ count: 0, startingWithin14Days: 0 });
    expect(wi['wi-e']).toEqual({ count: 0, startingWithin14Days: 0 });
    expect(timeline.holdsUp!.milestones[String(milestoneId)]).toEqual({
      count: 1,
      startingWithin14Days: 1,
    });
  });

  it('has a timeline entry for every returned work item and milestone', async () => {
    const timeline = await getJson<TimelineResponse>('/api/timeline');
    expect(Object.keys(timeline.holdsUp!.workItems).sort()).toEqual(
      timeline.workItems.map((w) => w.id).sort(),
    );
    expect(Object.keys(timeline.holdsUp!.milestones).sort()).toEqual(
      timeline.milestones.map((m) => String(m.id)).sort(),
    );
  });
});
