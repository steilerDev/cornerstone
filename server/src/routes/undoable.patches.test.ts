/**
 * Integration tests for the `undo` field on the seven wrapped PATCH routes (#2209, decision D1):
 * present (top-level, next to the unchanged payload) only when a status column changed,
 * absent otherwise, redeemable exactly once by the same user.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { __resetLedgerForTests } from '../services/statusEventLedger.js';
import { undoStore } from '../services/undoService.js';
import type { FastifyInstance } from 'fastify';
import type { UndoToken } from '@cornerstone/shared';

const TOKEN_SHAPE = /^u_[0-9a-f]{32}$/;

describe('Undo token on PATCH routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let cookie: string;
  let otherCookie: string;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-undoable-patches-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    app = await buildApp();
    undoStore.snapshots.clear();
    __resetLedgerForTests();
    const a = await userService.createLocalUser(
      app.db,
      'a@example.com',
      'A',
      'password-1234',
      'member',
    );
    const b = await userService.createLocalUser(
      app.db,
      'b@example.com',
      'B',
      'password-1234',
      'member',
    );
    cookie = `cornerstone_session=${sessionService.createSession(app.db, a.id, 3600)}`;
    otherCookie = `cornerstone_session=${sessionService.createSession(app.db, b.id, 3600)}`;
  });

  afterEach(async () => {
    if (app) await app.close();
    undoStore.snapshots.clear();
    process.env = originalEnv;
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  async function call<T = Record<string, unknown>>(
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    payload?: unknown,
    as = cookie,
  ): Promise<{ status: number; body: T }> {
    const res = await app.inject({
      method,
      url,
      headers: { cookie: as },
      payload: payload as never,
    });
    return { status: res.statusCode, body: (res.body ? res.json() : {}) as T };
  }

  function expectToken(undo: unknown): UndoToken {
    const u = undo as UndoToken;
    expect(u.token).toMatch(TOKEN_SHAPE);
    expect(Number.isNaN(Date.parse(u.expiresAt))).toBe(false);
    expect(Date.parse(u.expiresAt)).toBeGreaterThan(Date.now());
    return u;
  }

  /** Redeem the token as another user (404, keeps it) and then as the owner (200). */
  async function redeem(undo: UndoToken): Promise<void> {
    expect((await call('POST', `/api/undo/${undo.token}`, undefined, otherCookie)).status).toBe(
      404,
    );
    expect((await call('POST', `/api/undo/${undo.token}`)).status).toBe(200);
    expect((await call('POST', `/api/undo/${undo.token}`)).status).toBe(404);
  }

  it('work items: top-level undo beside the detail fields; absent for a title-only change', async () => {
    const created = (await call<{ id: string }>('POST', '/api/work-items', { title: 'Walls' }))
      .body;
    const quiet = await call<Record<string, unknown>>('PATCH', `/api/work-items/${created.id}`, {
      title: 'Walls 2',
    });
    expect(quiet.status).toBe(200);
    expect('undo' in quiet.body).toBe(false);
    expect(quiet.body.id).toBe(created.id);

    const loud = await call<Record<string, unknown>>('PATCH', `/api/work-items/${created.id}`, {
      status: 'in_progress',
    });
    expect(loud.status).toBe(200);
    expect(loud.body.id).toBe(created.id);
    expect(loud.body.status).toBe('in_progress');
    const undo = expectToken(loud.body.undo);
    await redeem(undo);
    const after = await call<{ status: string }>('GET', `/api/work-items/${created.id}`);
    expect(after.body.status).toBe('not_started');
  });

  it('work items: a failing PATCH returns the error and issues no token', async () => {
    const created = (await call<{ id: string }>('POST', '/api/work-items', { title: 'Walls' }))
      .body;
    const res = await call<{ error: { code: string } }>('PATCH', `/api/work-items/${created.id}`, {
      status: 'in_progress',
      startDate: '2026-09-10',
      endDate: '2026-09-01',
    });
    expect(res.status).toBe(400);
    expect(undoStore.snapshots.size).toBe(0);
  });

  it('household items: { householdItem, undo }', async () => {
    const created = await call<{ householdItem: { id: string } }>('POST', '/api/household-items', {
      name: 'Sofa',
    });
    const id = created.body.householdItem.id;
    const quiet = await call<Record<string, unknown>>('PATCH', `/api/household-items/${id}`, {
      name: 'Sofa 2',
    });
    expect(quiet.status).toBe(200);
    expect(Object.keys(quiet.body)).toEqual(['householdItem']);

    const loud = await call<Record<string, unknown>>('PATCH', `/api/household-items/${id}`, {
      status: 'purchased',
    });
    expect(Object.keys(loud.body).sort()).toEqual(['householdItem', 'undo']);
    await redeem(expectToken(loud.body.undo));
    const after = await call<{ householdItem: { status: string } }>(
      'GET',
      `/api/household-items/${id}`,
    );
    expect(after.body.householdItem.status).toBe('planned');
  });

  it('milestones: top-level undo beside the detail fields', async () => {
    const created = (
      await call<{ id: number }>('POST', '/api/milestones', {
        title: 'Roof',
        targetDate: '2026-09-01',
      })
    ).body;
    const quiet = await call<Record<string, unknown>>('PATCH', `/api/milestones/${created.id}`, {
      title: 'Roof 2',
    });
    expect('undo' in quiet.body).toBe(false);

    const loud = await call<Record<string, unknown>>('PATCH', `/api/milestones/${created.id}`, {
      isCompleted: true,
    });
    expect(loud.body.id).toBe(created.id);
    expect(loud.body.isCompleted).toBe(true);
    await redeem(expectToken(loud.body.undo));
    const after = await call<{ isCompleted: boolean }>('GET', `/api/milestones/${created.id}`);
    expect(after.body.isCompleted).toBe(false);
  });

  it('invoices: { invoice, undo }', async () => {
    const vendor = (
      await call<{ vendor: { id: string } }>('POST', '/api/vendors', { name: 'ACME' })
    ).body.vendor.id;
    const inv = (
      await call<{ invoice: { id: string } }>('POST', `/api/vendors/${vendor}/invoices`, {
        invoiceNumber: 'INV-1',
        amount: 100,
        date: '2026-08-01',
        status: 'pending',
      })
    ).body.invoice.id;
    const quiet = await call<Record<string, unknown>>(
      'PATCH',
      `/api/vendors/${vendor}/invoices/${inv}`,
      {
        notes: 'hello',
      },
    );
    expect(quiet.status).toBe(200);
    expect(Object.keys(quiet.body)).toEqual(['invoice']);

    const loud = await call<Record<string, unknown>>(
      'PATCH',
      `/api/vendors/${vendor}/invoices/${inv}`,
      {
        status: 'paid',
      },
    );
    expect(Object.keys(loud.body).sort()).toEqual(['invoice', 'undo']);
    await redeem(expectToken(loud.body.undo));
    const after = await call<{ invoices: { id: string; status: string }[] }>(
      'GET',
      `/api/vendors/${vendor}/invoices`,
    );
    expect(after.body.invoices.find((i) => i.id === inv)?.status).toBe('pending');
  });

  it('invoice deposits: { deposit, undo }', async () => {
    const vendor = (
      await call<{ vendor: { id: string } }>('POST', '/api/vendors', { name: 'ACME' })
    ).body.vendor.id;
    const inv = (
      await call<{ invoice: { id: string } }>('POST', `/api/vendors/${vendor}/invoices`, {
        invoiceNumber: 'INV-2',
        amount: 1000,
        date: '2026-08-01',
        status: 'pending',
      })
    ).body.invoice.id;
    const dep = await call<{ deposit: { id: string } }>('POST', `/api/invoices/${inv}/deposits`, {
      amount: 300,
      dueDate: '2026-09-01',
    });
    expect(dep.status).toBe(201);
    const id = dep.body.deposit.id;

    const quiet = await call<Record<string, unknown>>(
      'PATCH',
      `/api/invoices/${inv}/deposits/${id}`,
      {
        notes: 'x',
      },
    );
    expect(quiet.status).toBe(200);
    expect(Object.keys(quiet.body)).toEqual(['deposit']);

    const loud = await call<Record<string, unknown>>(
      'PATCH',
      `/api/invoices/${inv}/deposits/${id}`,
      {
        status: 'paid',
        paidDate: '2026-08-05',
      },
    );
    expect(loud.status).toBe(200);
    expect(Object.keys(loud.body).sort()).toEqual(['deposit', 'undo']);
    await redeem(expectToken(loud.body.undo));
    const after = await call<{
      deposits: { id: string; status: string; paidDate: string | null }[];
    }>('GET', `/api/invoices/${inv}/deposits`);
    const row = after.body.deposits.find((d) => d.id === id);
    expect(row?.status).toBe('pending');
    expect(row?.paidDate).toBeNull();
  });

  it('subsidy programs: { subsidyProgram, undo }', async () => {
    const prog = (
      await call<{ subsidyProgram: { id: string } }>('POST', '/api/subsidy-programs', {
        name: 'Grant',
        reductionType: 'percentage',
        reductionValue: 10,
      })
    ).body.subsidyProgram.id;
    const quiet = await call<Record<string, unknown>>('PATCH', `/api/subsidy-programs/${prog}`, {
      name: 'Grant 2',
    });
    expect(Object.keys(quiet.body)).toEqual(['subsidyProgram']);
    const loud = await call<Record<string, unknown>>('PATCH', `/api/subsidy-programs/${prog}`, {
      applicationStatus: 'applied',
    });
    expect(Object.keys(loud.body).sort()).toEqual(['subsidyProgram', 'undo']);
    await redeem(expectToken(loud.body.undo));
    const after = await call<{ subsidyProgram: { applicationStatus: string } }>(
      'GET',
      `/api/subsidy-programs/${prog}`,
    );
    expect(after.body.subsidyProgram.applicationStatus).toBe('eligible');
  });

  it('diary entries: top-level undo only when an issue resolution status changed', async () => {
    const created = (
      await call<{ id: string }>('POST', '/api/diary-entries', {
        entryType: 'issue',
        entryDate: '2026-08-01',
        body: 'Leak',
        metadata: { severity: 'low', resolutionStatus: 'open' },
      })
    ).body;
    const quiet = await call<Record<string, unknown>>('PATCH', `/api/diary-entries/${created.id}`, {
      body: 'Leak in cellar',
    });
    expect(quiet.status).toBe(200);
    expect('undo' in quiet.body).toBe(false);
    expect(quiet.body.id).toBe(created.id);

    const loud = await call<Record<string, unknown>>('PATCH', `/api/diary-entries/${created.id}`, {
      metadata: { severity: 'low', resolutionStatus: 'resolved' },
    });
    expect(loud.status).toBe(200);
    expect(loud.body.id).toBe(created.id);
    await redeem(expectToken(loud.body.undo));
    const after = await call<{ metadata: { resolutionStatus: string } }>(
      'GET',
      `/api/diary-entries/${created.id}`,
    );
    expect(after.body.metadata.resolutionStatus).toBe('open');
  });
});
