/**
 * End-to-end (real services, real undo store) tests for the 12 undoable relation unlink
 * routes (#2236, contract 11 "Relation unlink snapshots"): every DELETE answers
 * `200 { undo }`, `POST /api/undo/:token` re-inserts the row with all original columns, a
 * conflicting restore refuses with 409 `CONFLICT` naming the subject, and the six scheduling
 * routes re-run autoReschedule once after a successful restore only.
 * All data is synthetic.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse, UndoResponse, UndoableDeleteResponse } from '@cornerstone/shared';
import { UNDO_WINDOW_MS } from '@cornerstone/shared';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { undoStore } from '../services/undoService.js';
import { autoReschedule } from '../services/schedulingEngine.js';
import * as schema from '../db/schema.js';

const TS = '2026-01-02T03:04:05.000Z';
const TS_UPDATED = '2026-01-03T04:05:06.000Z';

describe('Relation unlink Undo (real flow)', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let cookie: string;
  let userId: string;
  let seq = 0;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-relation-undo-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    app = await buildApp();
    undoStore.snapshots.clear();
    seq = 0;
    ({ cookie, userId } = await session('owner@example.com'));
  });

  afterEach(async () => {
    if (app) await app.close();
    undoStore.snapshots.clear();
    process.env = originalEnv;
    rmSync(tempDir, { recursive: true, force: true });
  });

  async function session(email: string): Promise<{ userId: string; cookie: string }> {
    const user = await userService.createLocalUser(app.db, email, email, 'password-1234', 'member');
    const token = sessionService.createSession(app.db, user.id, 3600);
    return { userId: user.id, cookie: `cornerstone_session=${token}` };
  }

  function nextId(prefix: string): string {
    seq += 1;
    return `${prefix}-${seq}`;
  }

  // ─── Fixtures ─────────────────────────────────────────────────────────────

  function insertWorkItem(opts: {
    title?: string;
    startDate?: string | null;
    endDate?: string | null;
    durationDays?: number | null;
  }): string {
    const id = nextId('wi');
    app.db
      .insert(schema.workItems)
      .values({
        id,
        title: opts.title ?? `Task ${id}`,
        status: 'not_started',
        startDate: opts.startDate ?? null,
        endDate: opts.endDate ?? null,
        durationDays: opts.durationDays ?? null,
        createdBy: userId,
        createdAt: TS,
        updatedAt: TS,
      })
      .run();
    return id;
  }

  function insertMilestone(targetDate: string): number {
    return app.db
      .insert(schema.milestones)
      .values({
        title: 'Roof complete',
        targetDate,
        createdBy: userId,
        createdAt: TS,
        updatedAt: TS,
      })
      .returning({ id: schema.milestones.id })
      .get().id;
  }

  function insertHouseholdItem(): string {
    const id = nextId('hi');
    app.db
      .insert(schema.householdItems)
      .values({
        id,
        name: 'Sofa',
        categoryId: 'hic-furniture',
        createdBy: userId,
        createdAt: TS,
        updatedAt: TS,
      })
      .run();
    return id;
  }

  function insertVendor(): string {
    const id = nextId('vendor');
    app.db
      .insert(schema.vendors)
      .values({ id, name: 'Acme Builders', createdBy: userId, createdAt: TS, updatedAt: TS })
      .run();
    return id;
  }

  function insertInvoice(vendorId: string, amount: number): string {
    const id = nextId('invoice');
    app.db
      .insert(schema.invoices)
      .values({
        id,
        vendorId,
        amount,
        date: '2026-01-15',
        status: 'pending',
        createdBy: userId,
        createdAt: TS,
        updatedAt: TS,
      })
      .run();
    return id;
  }

  function insertSubsidyProgram(): string {
    const id = nextId('subsidy');
    app.db
      .insert(schema.subsidyPrograms)
      .values({
        id,
        name: 'Energy grant',
        reductionType: 'fixed',
        reductionValue: 100,
        createdBy: userId,
        createdAt: TS,
        updatedAt: TS,
      })
      .run();
    return id;
  }

  function insertWorkItemBudget(workItemId: string): string {
    const id = nextId('wib');
    app.db
      .insert(schema.workItemBudgets)
      .values({ id, workItemId, plannedAmount: 500, createdAt: TS, updatedAt: TS })
      .run();
    return id;
  }

  function insertHouseholdItemBudget(householdItemId: string): string {
    const id = nextId('hib');
    app.db
      .insert(schema.householdItemBudgets)
      .values({ id, householdItemId, plannedAmount: 500, createdAt: TS, updatedAt: TS })
      .run();
    return id;
  }

  function insertBudgetLine(
    invoiceId: string,
    target: { workItemBudgetId?: string; householdItemBudgetId?: string },
    itemizedAmount: number,
  ): string {
    const id = nextId('ibl');
    app.db
      .insert(schema.invoiceBudgetLines)
      .values({
        id,
        invoiceId,
        workItemBudgetId: target.workItemBudgetId ?? null,
        householdItemBudgetId: target.householdItemBudgetId ?? null,
        itemizedAmount,
        createdAt: TS,
        updatedAt: TS,
      })
      .run();
    return id;
  }

  function insertBudgetSource(): string {
    const id = nextId('source');
    app.db
      .insert(schema.budgetSources)
      .values({
        id,
        name: 'Savings',
        sourceType: 'savings',
        totalAmount: 5000,
        createdBy: userId,
        createdAt: TS,
        updatedAt: TS,
      })
      .run();
    return id;
  }

  function insertDeposit(
    invoiceId: string,
    opts: {
      amount?: number;
      entryType?: 'deposit' | 'refund';
      budgetSourceId?: string | null;
      createdBy?: string | null;
    } = {},
  ): string {
    const id = nextId('deposit');
    app.db
      .insert(schema.invoiceDeposits)
      .values({
        id,
        invoiceId,
        amount: opts.amount ?? 300,
        dueDate: '2026-02-01',
        description: 'Synthetic entry',
        status: 'pending',
        entryType: opts.entryType ?? 'deposit',
        budgetSourceId: opts.budgetSourceId ?? null,
        createdBy: opts.createdBy === undefined ? userId : opts.createdBy,
        createdAt: TS,
        updatedAt: TS_UPDATED,
      })
      .run();
    return id;
  }

  // ─── HTTP helpers ─────────────────────────────────────────────────────────

  async function del(url: string, headers: Record<string, string> = { cookie }) {
    return app.inject({ method: 'DELETE', url, headers });
  }

  async function unlink(url: string): Promise<string> {
    const res = await del(url);
    expect(res.statusCode).toBe(200);
    const body = res.json<UndoableDeleteResponse>();
    expect(Object.keys(body)).toEqual(['undo']);
    expect(body.undo.token).toMatch(/^u_[0-9a-f]{32}$/);
    expect(new Date(body.undo.expiresAt).getTime()).toBeGreaterThan(Date.now());
    return body.undo.token;
  }

  function undo(token: string, headers: Record<string, string> = { cookie }) {
    return app.inject({ method: 'POST', url: `/api/undo/${token}`, headers });
  }

  async function expectConflict(token: string, changed: { type: string; id: string }) {
    const res = await undo(token);
    expect(res.statusCode).toBe(409);
    const body = res.json<ApiErrorResponse>();
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.details).toEqual({ changed: [changed] });
  }

  // ─── Case table ───────────────────────────────────────────────────────────

  /** What one relation route needs for the shared Undo assertions. */
  interface Case {
    /** Deleted row(s) as stored, for the byte-identical comparison. */
    rows: () => unknown[];
    url: string;
    subject: { type: string; id: string };
    /** Re-creates the situation that makes the restore refuse (called after the DELETE). */
    conflict: () => void;
    /** Scheduling routes only: the value autoReschedule drives, and a way to stale it. */
    schedule?: {
      read: () => string | null;
      /** Called after the DELETE; leaves a value that only a reschedule can correct. */
      stale: () => void;
    };
  }

  /** A dated chain A -> B whose end date pushes B later than its own start. */
  function setupDependency(): Case {
    const a = insertWorkItem({ startDate: '2026-03-01', endDate: '2026-03-10', durationDays: 9 });
    const b = insertWorkItem({ startDate: '2026-03-01', endDate: '2026-03-06', durationDays: 5 });
    app.db
      .insert(schema.workItemDependencies)
      .values({
        predecessorId: a,
        successorId: b,
        dependencyType: 'finish_to_start',
        leadLagDays: 2,
      })
      .run();
    autoReschedule(app.db);
    return {
      rows: () => app.db.select().from(schema.workItemDependencies).all(),
      url: `/api/work-items/${b}/dependencies/${a}`,
      subject: { type: 'work_item', id: b },
      conflict: () => {
        // The reverse link B -> A: restoring A -> B would now be a 2-cycle.
        app.db
          .insert(schema.workItemDependencies)
          .values({ predecessorId: b, successorId: a })
          .run();
      },
      schedule: {
        read: () =>
          app.db.select().from(schema.workItems).where(eq(schema.workItems.id, b)).get()!.startDate,
        stale: () => {
          app.db
            .update(schema.workItems)
            .set({ startDate: '2026-03-02', endDate: '2026-03-07' })
            .where(eq(schema.workItems.id, b))
            .run();
        },
      },
    };
  }

  function setupHouseholdItemDep(): Case {
    const wi = insertWorkItem({ startDate: '2026-03-01', endDate: '2026-03-10', durationDays: 9 });
    const hi = insertHouseholdItem();
    app.db
      .insert(schema.householdItemDeps)
      .values({ householdItemId: hi, predecessorType: 'work_item', predecessorId: wi })
      .run();
    autoReschedule(app.db);
    return {
      rows: () => app.db.select().from(schema.householdItemDeps).all(),
      url: `/api/household-items/${hi}/dependencies/work_item/${wi}`,
      subject: { type: 'household_item', id: hi },
      conflict: () => {
        app.db
          .insert(schema.householdItemDeps)
          .values({ householdItemId: hi, predecessorType: 'work_item', predecessorId: wi })
          .run();
      },
      schedule: {
        read: () =>
          app.db.select().from(schema.householdItems).where(eq(schema.householdItems.id, hi)).get()!
            .targetDeliveryDate,
        stale: () => {
          app.db
            .update(schema.householdItems)
            .set({ targetDeliveryDate: '2026-01-01' })
            .where(eq(schema.householdItems.id, hi))
            .run();
        },
      },
    };
  }

  /**
   * Milestone M with contributor A (linked) and dependent B (requires M). B's start follows A's
   * end through the milestone node; unlinking A releases it.
   */
  function setupMilestoneLinkScenario() {
    const milestoneId = insertMilestone('2026-03-05');
    const a = insertWorkItem({ startDate: '2026-03-01', endDate: '2026-03-20', durationDays: 19 });
    const b = insertWorkItem({ startDate: '2026-03-01', endDate: '2026-03-06', durationDays: 5 });
    app.db.insert(schema.milestoneWorkItems).values({ milestoneId, workItemId: a }).run();
    app.db.insert(schema.workItemMilestoneDeps).values({ workItemId: b, milestoneId }).run();
    autoReschedule(app.db);
    return {
      milestoneId,
      a,
      b,
      readB: () =>
        app.db.select().from(schema.workItems).where(eq(schema.workItems.id, b)).get()!.startDate,
      staleB: () => {
        app.db
          .update(schema.workItems)
          .set({ startDate: '2026-03-02', endDate: '2026-03-07' })
          .where(eq(schema.workItems.id, b))
          .run();
      },
    };
  }

  function milestoneLinkCase(via: 'milestone' | 'workItem'): Case {
    const s = setupMilestoneLinkScenario();
    return {
      rows: () => app.db.select().from(schema.milestoneWorkItems).all(),
      url:
        via === 'milestone'
          ? `/api/milestones/${s.milestoneId}/work-items/${s.a}`
          : `/api/work-items/${s.a}/milestones/linked/${s.milestoneId}`,
      subject: { type: 'work_item', id: s.a },
      conflict: () => {
        app.db
          .insert(schema.milestoneWorkItems)
          .values({ milestoneId: s.milestoneId, workItemId: s.a })
          .run();
      },
      schedule: { read: s.readB, stale: s.staleB },
    };
  }

  /** B requires milestone M (target after B's own start); the dependency pushes B to M. */
  function milestoneDepCase(via: 'milestone' | 'workItem'): Case {
    const milestoneId = insertMilestone('2026-04-01');
    const b = insertWorkItem({ startDate: '2026-03-01', endDate: '2026-03-06', durationDays: 5 });
    app.db.insert(schema.workItemMilestoneDeps).values({ workItemId: b, milestoneId }).run();
    autoReschedule(app.db);
    return {
      rows: () => app.db.select().from(schema.workItemMilestoneDeps).all(),
      url:
        via === 'milestone'
          ? `/api/milestones/${milestoneId}/dependents/${b}`
          : `/api/work-items/${b}/milestones/required/${milestoneId}`,
      subject: { type: 'work_item', id: b },
      conflict: () => {
        app.db.insert(schema.workItemMilestoneDeps).values({ workItemId: b, milestoneId }).run();
      },
      schedule: {
        read: () =>
          app.db.select().from(schema.workItems).where(eq(schema.workItems.id, b)).get()!.startDate,
        stale: () => {
          app.db
            .update(schema.workItems)
            .set({ startDate: '2026-03-02', endDate: '2026-03-07' })
            .where(eq(schema.workItems.id, b))
            .run();
        },
      },
    };
  }

  function depositCase(prefix: 'invoices' | 'vendors'): Case {
    const vendorId = insertVendor();
    const invoiceId = insertInvoice(vendorId, 1000);
    const sourceId = insertBudgetSource();
    const id = insertDeposit(invoiceId, { budgetSourceId: sourceId });
    return {
      rows: () => app.db.select().from(schema.invoiceDeposits).all(),
      url:
        prefix === 'invoices'
          ? `/api/invoices/${invoiceId}/deposits/${id}`
          : `/api/vendors/${vendorId}/invoices/${invoiceId}/deposits/${id}`,
      subject: { type: 'invoice_deposit', id },
      conflict: () => {
        app.db.delete(schema.invoices).where(eq(schema.invoices.id, invoiceId)).run();
      },
    };
  }

  function contactCase(): Case {
    const vendorId = insertVendor();
    const id = nextId('contact');
    app.db
      .insert(schema.vendorContacts)
      .values({
        id,
        vendorId,
        name: 'Pat Example',
        firstName: 'Pat',
        lastName: 'Example',
        role: 'Site lead',
        phone: '+000 000 0000',
        email: 'pat@example.test',
        notes: 'Synthetic contact',
        createdAt: TS,
        updatedAt: TS_UPDATED,
      })
      .run();
    return {
      rows: () => app.db.select().from(schema.vendorContacts).all(),
      url: `/api/vendors/${vendorId}/contacts/${id}`,
      subject: { type: 'vendor_contact', id },
      conflict: () => {
        app.db.delete(schema.vendors).where(eq(schema.vendors.id, vendorId)).run();
      },
    };
  }

  function budgetLineCase(): Case {
    const vendorId = insertVendor();
    const invoiceId = insertInvoice(vendorId, 1000);
    const wi = insertWorkItem({});
    const id = insertBudgetLine(invoiceId, { workItemBudgetId: insertWorkItemBudget(wi) }, 400);
    return {
      rows: () => app.db.select().from(schema.invoiceBudgetLines).all(),
      url: `/api/invoices/${invoiceId}/budget-lines/${id}`,
      subject: { type: 'invoice_budget_line', id },
      conflict: () => {
        app.db.delete(schema.invoices).where(eq(schema.invoices.id, invoiceId)).run();
      },
    };
  }

  function workItemSubsidyCase(): Case {
    const wi = insertWorkItem({});
    const subsidyId = insertSubsidyProgram();
    app.db
      .insert(schema.workItemSubsidies)
      .values({ workItemId: wi, subsidyProgramId: subsidyId })
      .run();
    return {
      rows: () => app.db.select().from(schema.workItemSubsidies).all(),
      url: `/api/work-items/${wi}/subsidies/${subsidyId}`,
      subject: { type: 'work_item', id: wi },
      conflict: () => {
        app.db.delete(schema.subsidyPrograms).where(eq(schema.subsidyPrograms.id, subsidyId)).run();
      },
    };
  }

  function householdItemSubsidyCase(): Case {
    const hi = insertHouseholdItem();
    const subsidyId = insertSubsidyProgram();
    app.db
      .insert(schema.householdItemSubsidies)
      .values({ householdItemId: hi, subsidyProgramId: subsidyId })
      .run();
    return {
      rows: () => app.db.select().from(schema.householdItemSubsidies).all(),
      url: `/api/household-items/${hi}/subsidies/${subsidyId}`,
      subject: { type: 'household_item', id: hi },
      conflict: () => {
        app.db.delete(schema.subsidyPrograms).where(eq(schema.subsidyPrograms.id, subsidyId)).run();
      },
    };
  }

  const ROUTES: ReadonlyArray<readonly [string, () => Case]> = [
    ['1 DELETE /api/work-items/:id/dependencies/:predecessorId', setupDependency],
    ['2 DELETE /api/household-items/:id/dependencies/:type/:predecessorId', setupHouseholdItemDep],
    ['3 DELETE /api/milestones/:id/work-items/:workItemId', () => milestoneLinkCase('milestone')],
    [
      '4 DELETE /api/work-items/:id/milestones/linked/:milestoneId',
      () => milestoneLinkCase('workItem'),
    ],
    ['5 DELETE /api/milestones/:id/dependents/:workItemId', () => milestoneDepCase('milestone')],
    [
      '6 DELETE /api/work-items/:id/milestones/required/:milestoneId',
      () => milestoneDepCase('workItem'),
    ],
    ['7 DELETE /api/invoices/:invoiceId/deposits/:id', () => depositCase('invoices')],
    [
      '8 DELETE /api/vendors/:vendorId/invoices/:invoiceId/deposits/:id',
      () => depositCase('vendors'),
    ],
    ['9 DELETE /api/vendors/:vendorId/contacts/:contactId', contactCase],
    ['10 DELETE /api/invoices/:invoiceId/budget-lines/:id', budgetLineCase],
    ['11 DELETE /api/work-items/:id/subsidies/:subsidyProgramId', workItemSubsidyCase],
    ['12 DELETE /api/household-items/:id/subsidies/:subsidyProgramId', householdItemSubsidyCase],
  ];

  describe.each(ROUTES)('route %s', (_name, setup) => {
    it('answers 200 { undo } and the row is gone', async () => {
      const c = setup();
      const before = c.rows().length;
      expect(before).toBeGreaterThan(0);

      await unlink(c.url);

      expect(c.rows()).toHaveLength(before - 1);
    });

    it('POST /api/undo/:token restores every original column and names the subject', async () => {
      const c = setup();
      const original = c.rows();

      const token = await unlink(c.url);
      const res = await undo(token);

      expect(res.statusCode).toBe(200);
      expect(res.json<UndoResponse>()).toEqual({ restored: [c.subject], retractedEventIds: [] });
      expect(c.rows()).toEqual(expect.arrayContaining(original));
      expect(c.rows()).toHaveLength(original.length);
    });

    it('consumes the token: a second restore is 404', async () => {
      const c = setup();
      const token = await unlink(c.url);

      expect((await undo(token)).statusCode).toBe(200);
      const again = await undo(token);

      expect(again.statusCode).toBe(404);
      expect(again.json<ApiErrorResponse>().error.code).toBe('NOT_FOUND');
    });

    it('refuses with 409 CONFLICT naming the subject when the situation changed', async () => {
      const c = setup();
      const token = await unlink(c.url);
      c.conflict();
      const afterConflict = c.rows();

      await expectConflict(token, c.subject);

      expect(c.rows()).toEqual(afterConflict);
    });

    it('answers 404 for an unknown token', async () => {
      const res = await undo(`u_${'0'.repeat(32)}`);
      expect(res.statusCode).toBe(404);
    });

    it('answers 404 for an expired token and inserts nothing', async () => {
      const c = setup();
      const token = await unlink(c.url);
      const snapshot = undoStore.snapshots.get(token);
      expect(snapshot).toBeDefined();
      if (snapshot) snapshot.createdAt = Date.now() - UNDO_WINDOW_MS - 1;
      const afterDelete = c.rows();

      const res = await undo(token);

      expect(res.statusCode).toBe(404);
      expect(c.rows()).toEqual(afterDelete);
    });

    it("answers 404 for another user's token and leaves it usable by its owner", async () => {
      const c = setup();
      const token = await unlink(c.url);
      const other = await session('other@example.com');

      const foreign = await undo(token, { cookie: other.cookie });

      expect(foreign.statusCode).toBe(404);
      expect((await undo(token)).statusCode).toBe(200);
    });

    it('requires authentication', async () => {
      const c = setup();
      const res = await del(c.url, {});
      expect(res.statusCode).toBe(401);
      expect(c.rows().length).toBeGreaterThan(0);
    });
  });

  // ─── afterRestore: autoReschedule (rows 1-6) ──────────────────────────────

  describe.each(ROUTES.slice(0, 6))('route %s reschedules', (name, setup) => {
    /** An unrelated dated chain X -> Y whose Y only a reschedule can put back. */
    function unrelatedChain() {
      const x = insertWorkItem({ startDate: '2026-05-01', endDate: '2026-05-10', durationDays: 9 });
      const y = insertWorkItem({ startDate: '2026-05-01', endDate: '2026-05-04', durationDays: 3 });
      app.db.insert(schema.workItemDependencies).values({ predecessorId: x, successorId: y }).run();
      autoReschedule(app.db);
      const read = () =>
        app.db.select().from(schema.workItems).where(eq(schema.workItems.id, y)).get()!.startDate;
      const driven = read();
      app.db
        .update(schema.workItems)
        .set({ startDate: '2026-05-02', endDate: '2026-05-05' })
        .where(eq(schema.workItems.id, y))
        .run();
      return { read, driven };
    }

    it('the DELETE itself reschedules the whole project after issuing the token', async () => {
      const c = setup();
      const chain = unrelatedChain();
      expect(chain.read()).not.toBe(chain.driven);

      await unlink(c.url);

      expect(chain.read()).toBe(chain.driven);
    });

    it('a failing reschedule is logged and the DELETE still answers 200 { undo }', async () => {
      const c = setup();
      // Drop a table only the scheduler reads, so autoReschedule throws inside the route
      const table = name.startsWith('2 ') ? 'work_item_dependencies' : 'household_item_deps';
      app.db.$client.exec(`DROP TABLE ${table}`);
      const errors: unknown[][] = [];
      const originalChild = app.log.child.bind(app.log);
      const childSpy = jest.spyOn(app.log, 'child').mockImplementation((...args) => {
        const child = originalChild(...args);
        const original = child.error.bind(child);
        child.error = ((...e: unknown[]) => {
          errors.push(e);
          return (original as (...a: unknown[]) => void)(...e);
        }) as typeof child.error;
        return child;
      });

      try {
        const token = await unlink(c.url);
        expect(undoStore.snapshots.has(token)).toBe(true);
      } finally {
        childSpy.mockRestore();
      }

      const logged = errors.find((e) => e[1] === 'Reschedule after relation delete failed');
      expect(logged).toBeDefined();
      expect((logged?.[0] as { err?: unknown } | undefined)?.err).toBeInstanceOf(Error);
    });

    it('re-runs autoReschedule once after a successful restore (dates move back)', async () => {
      const c = setup();
      const schedule = c.schedule!;
      const driven = schedule.read();
      expect(driven).not.toBeNull();

      const token = await unlink(c.url);
      schedule.stale();
      const stale = schedule.read();
      expect(stale).not.toBe(driven);

      const res = await undo(token);

      expect(res.statusCode).toBe(200);
      expect(schedule.read()).toBe(driven);
    });

    it('does not reschedule when the restore is refused (409)', async () => {
      const c = setup();
      const schedule = c.schedule!;
      const token = await unlink(c.url);
      schedule.stale();
      const stale = schedule.read();
      c.conflict();

      expect((await undo(token)).statusCode).toBe(409);

      expect(schedule.read()).toBe(stale);
    });

    it('does not reschedule when the token is expired (404)', async () => {
      const c = setup();
      const schedule = c.schedule!;
      const token = await unlink(c.url);
      schedule.stale();
      const stale = schedule.read();
      const snapshot = undoStore.snapshots.get(token);
      if (snapshot) snapshot.createdAt = 0;

      expect((await undo(token)).statusCode).toBe(404);

      expect(schedule.read()).toBe(stale);
    });
  });

  // ─── Route-specific restore rules ─────────────────────────────────────────

  describe('dependency restore', () => {
    it('refuses when the two work items were linked again in the same direction', async () => {
      const c = setupDependency();
      const token = await unlink(c.url);
      const [, b, a] = c.url.match(/work-items\/([^/]+)\/dependencies\/([^/]+)/) ?? [];
      app.db
        .insert(schema.workItemDependencies)
        .values({ predecessorId: a!, successorId: b! })
        .run();

      await expectConflict(token, c.subject);
    });

    it('refuses when a work item was deleted meanwhile', async () => {
      const c = setupDependency();
      const token = await unlink(c.url);
      app.db.delete(schema.workItems).where(eq(schema.workItems.id, c.subject.id)).run();

      await expectConflict(token, c.subject);
    });

    it('refuses when the predecessor was deleted meanwhile', async () => {
      const c = setupDependency();
      const token = await unlink(c.url);
      const predecessorId = c.url.split('/').pop()!;
      app.db.delete(schema.workItems).where(eq(schema.workItems.id, predecessorId)).run();

      await expectConflict(token, c.subject);
    });

    it('refuses when re-adding would close a longer cycle (never CIRCULAR_DEPENDENCY)', async () => {
      const a = insertWorkItem({ startDate: '2026-03-01', durationDays: 3 });
      const b = insertWorkItem({ startDate: '2026-03-01', durationDays: 3 });
      const c = insertWorkItem({ startDate: '2026-03-01', durationDays: 3 });
      app.db.insert(schema.workItemDependencies).values({ predecessorId: a, successorId: b }).run();
      const token = await unlink(`/api/work-items/${b}/dependencies/${a}`);
      // B -> C -> A is now the path; restoring A -> B closes the loop A -> B -> C -> A.
      app.db.insert(schema.workItemDependencies).values({ predecessorId: b, successorId: c }).run();
      app.db.insert(schema.workItemDependencies).values({ predecessorId: c, successorId: a }).run();

      await expectConflict(token, { type: 'work_item', id: b });
    });
  });

  describe('household item dependency restore', () => {
    it('restores a milestone predecessor', async () => {
      const milestoneId = insertMilestone('2026-05-01');
      const hi = insertHouseholdItem();
      app.db
        .insert(schema.householdItemDeps)
        .values({
          householdItemId: hi,
          predecessorType: 'milestone',
          predecessorId: String(milestoneId),
        })
        .run();

      const token = await unlink(
        `/api/household-items/${hi}/dependencies/milestone/${milestoneId}`,
      );
      expect(app.db.select().from(schema.householdItemDeps).all()).toHaveLength(0);
      expect((await undo(token)).statusCode).toBe(200);

      expect(app.db.select().from(schema.householdItemDeps).all()).toEqual([
        { householdItemId: hi, predecessorType: 'milestone', predecessorId: String(milestoneId) },
      ]);
    });

    it('refuses when the milestone predecessor was deleted', async () => {
      const milestoneId = insertMilestone('2026-05-01');
      const hi = insertHouseholdItem();
      app.db
        .insert(schema.householdItemDeps)
        .values({
          householdItemId: hi,
          predecessorType: 'milestone',
          predecessorId: String(milestoneId),
        })
        .run();
      const token = await unlink(
        `/api/household-items/${hi}/dependencies/milestone/${milestoneId}`,
      );
      app.db.delete(schema.milestones).where(eq(schema.milestones.id, milestoneId)).run();

      await expectConflict(token, { type: 'household_item', id: hi });
    });

    it('refuses when the work item predecessor was deleted', async () => {
      const c = setupHouseholdItemDep();
      const token = await unlink(c.url);
      const predecessorId = c.url.split('/').pop()!;
      app.db.delete(schema.workItems).where(eq(schema.workItems.id, predecessorId)).run();

      await expectConflict(token, c.subject);
    });

    it('refuses when the household item was deleted', async () => {
      const c = setupHouseholdItemDep();
      const token = await unlink(c.url);
      app.db.delete(schema.householdItems).where(eq(schema.householdItems.id, c.subject.id)).run();

      await expectConflict(token, c.subject);
    });
  });

  describe('milestone link and dependency restore', () => {
    it('refuses a link restore when the work item now depends on that milestone', async () => {
      const s = setupMilestoneLinkScenario();
      const token = await unlink(`/api/milestones/${s.milestoneId}/work-items/${s.a}`);
      app.db
        .insert(schema.workItemMilestoneDeps)
        .values({ workItemId: s.a, milestoneId: s.milestoneId })
        .run();

      await expectConflict(token, { type: 'work_item', id: s.a });
    });

    it('refuses a dependency restore when the work item now contributes to that milestone', async () => {
      const milestoneId = insertMilestone('2026-04-01');
      const b = insertWorkItem({ startDate: '2026-03-01', durationDays: 5 });
      app.db.insert(schema.workItemMilestoneDeps).values({ workItemId: b, milestoneId }).run();
      const token = await unlink(`/api/work-items/${b}/milestones/required/${milestoneId}`);
      app.db.insert(schema.milestoneWorkItems).values({ milestoneId, workItemId: b }).run();

      await expectConflict(token, { type: 'work_item', id: b });
    });

    it('refuses a link restore when the milestone was deleted', async () => {
      const s = setupMilestoneLinkScenario();
      const token = await unlink(`/api/work-items/${s.a}/milestones/linked/${s.milestoneId}`);
      app.db.delete(schema.milestones).where(eq(schema.milestones.id, s.milestoneId)).run();

      await expectConflict(token, { type: 'work_item', id: s.a });
    });

    it('refuses a dependency restore when the work item was deleted', async () => {
      const c = milestoneDepCase('workItem');
      const token = await unlink(c.url);
      app.db.delete(schema.workItems).where(eq(schema.workItems.id, c.subject.id)).run();

      await expectConflict(token, c.subject);
    });

    it('milestone-page link and unlink now reschedule dependents', async () => {
      const milestoneId = insertMilestone('2026-03-05');
      const a = insertWorkItem({
        startDate: '2026-03-01',
        endDate: '2026-03-20',
        durationDays: 19,
      });
      const b = insertWorkItem({ startDate: '2026-03-01', endDate: '2026-03-06', durationDays: 5 });
      app.db.insert(schema.workItemMilestoneDeps).values({ workItemId: b, milestoneId }).run();
      const startOfB = () =>
        app.db.select().from(schema.workItems).where(eq(schema.workItems.id, b)).get()!.startDate;

      const link = await app.inject({
        method: 'POST',
        url: `/api/milestones/${milestoneId}/work-items`,
        headers: { cookie },
        payload: { workItemId: a },
      });
      expect(link.statusCode).toBe(201);
      const pushed = startOfB();
      expect(pushed).toBe('2026-03-20');

      await unlink(`/api/milestones/${milestoneId}/work-items/${a}`);

      expect(startOfB()).toBe('2026-03-05');
    });
  });

  describe('deposit restore', () => {
    it('restores a deposit whose budget source was deleted with budget_source_id NULL', async () => {
      const invoiceId = insertInvoice(insertVendor(), 1000);
      const sourceId = insertBudgetSource();
      const id = insertDeposit(invoiceId, { budgetSourceId: sourceId });
      const token = await unlink(`/api/invoices/${invoiceId}/deposits/${id}`);
      app.db.delete(schema.budgetSources).where(eq(schema.budgetSources.id, sourceId)).run();

      const res = await undo(token);

      expect(res.statusCode).toBe(200);
      const row = app.db
        .select()
        .from(schema.invoiceDeposits)
        .where(eq(schema.invoiceDeposits.id, id))
        .get()!;
      expect(row.budgetSourceId).toBeNull();
      expect(row.createdBy).toBe(userId);
      expect(row.createdAt).toBe(TS);
      expect(row.updatedAt).toBe(TS_UPDATED);
    });

    it('keeps budget_source_id when the source still exists', async () => {
      const invoiceId = insertInvoice(insertVendor(), 1000);
      const sourceId = insertBudgetSource();
      const id = insertDeposit(invoiceId, { budgetSourceId: sourceId });
      const token = await unlink(`/api/invoices/${invoiceId}/deposits/${id}`);

      expect((await undo(token)).statusCode).toBe(200);

      const row = app.db
        .select()
        .from(schema.invoiceDeposits)
        .where(eq(schema.invoiceDeposits.id, id))
        .get()!;
      expect(row.budgetSourceId).toBe(sourceId);
    });

    it('restores a deposit whose creator was deleted with created_by NULL', async () => {
      const creator = await session('creator@example.com');
      const invoiceId = insertInvoice(insertVendor(), 1000);
      const id = insertDeposit(invoiceId, { createdBy: creator.userId });
      const token = await unlink(`/api/invoices/${invoiceId}/deposits/${id}`);
      app.db.delete(schema.users).where(eq(schema.users.id, creator.userId)).run();

      const res = await undo(token);

      expect(res.statusCode).toBe(200);
      const row = app.db
        .select()
        .from(schema.invoiceDeposits)
        .where(eq(schema.invoiceDeposits.id, id))
        .get()!;
      expect(row.createdBy).toBeNull();
    });

    it('restores a deposit that never had a creator or source', async () => {
      const invoiceId = insertInvoice(insertVendor(), 1000);
      const id = insertDeposit(invoiceId, { createdBy: null });
      const token = await unlink(`/api/invoices/${invoiceId}/deposits/${id}`);

      expect((await undo(token)).statusCode).toBe(200);
    });

    it('refuses when the id is taken again', async () => {
      const invoiceId = insertInvoice(insertVendor(), 1000);
      const id = insertDeposit(invoiceId);
      const token = await unlink(`/api/invoices/${invoiceId}/deposits/${id}`);
      app.db
        .insert(schema.invoiceDeposits)
        .values({
          id,
          invoiceId,
          amount: 1,
          dueDate: '2026-02-01',
          createdAt: TS,
          updatedAt: TS,
        })
        .run();

      await expectConflict(token, { type: 'invoice_deposit', id });
    });

    it('refuses to restore a refund that would exceed the refund cap', async () => {
      const invoiceId = insertInvoice(insertVendor(), 1000);
      const refundId = insertDeposit(invoiceId, { amount: 300, entryType: 'refund' });
      const token = await unlink(`/api/invoices/${invoiceId}/deposits/${refundId}`);
      // 800 + 300 > max(invoice 1000, deposits 0)
      insertDeposit(invoiceId, { amount: 800, entryType: 'refund' });
      const before = app.db.select().from(schema.invoiceDeposits).all();

      const res = await undo(token);

      expect(res.statusCode).toBe(409);
      const body = res.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.code).not.toBe('REFUND_EXCEEDS_INVOICE');
      expect(body.error.details).toEqual({ changed: [{ type: 'invoice_deposit', id: refundId }] });
      expect(app.db.select().from(schema.invoiceDeposits).all()).toEqual(before);
    });

    it('restores a refund that still fits the refund cap', async () => {
      const invoiceId = insertInvoice(insertVendor(), 1000);
      const refundId = insertDeposit(invoiceId, { amount: 300, entryType: 'refund' });
      const token = await unlink(`/api/invoices/${invoiceId}/deposits/${refundId}`);
      insertDeposit(invoiceId, { amount: 700, entryType: 'refund' });

      expect((await undo(token)).statusCode).toBe(200);
    });
  });

  describe('invoice budget line restore', () => {
    it('refuses when the itemized sum would exceed the invoice amount', async () => {
      const invoiceId = insertInvoice(insertVendor(), 1000);
      const wi1 = insertWorkItem({});
      const wi2 = insertWorkItem({});
      const lineId = insertBudgetLine(
        invoiceId,
        { workItemBudgetId: insertWorkItemBudget(wi1) },
        400,
      );
      const token = await unlink(`/api/invoices/${invoiceId}/budget-lines/${lineId}`);
      insertBudgetLine(invoiceId, { workItemBudgetId: insertWorkItemBudget(wi2) }, 700);

      const res = await undo(token);

      expect(res.statusCode).toBe(409);
      const body = res.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.details).toEqual({
        changed: [{ type: 'invoice_budget_line', id: lineId }],
      });
      expect(
        app.db
          .select()
          .from(schema.invoiceBudgetLines)
          .where(eq(schema.invoiceBudgetLines.id, lineId))
          .get(),
      ).toBeUndefined();
    });

    it('restores when the sum lands exactly on the invoice amount', async () => {
      const invoiceId = insertInvoice(insertVendor(), 1000);
      const lineId = insertBudgetLine(
        invoiceId,
        { workItemBudgetId: insertWorkItemBudget(insertWorkItem({})) },
        400,
      );
      const token = await unlink(`/api/invoices/${invoiceId}/budget-lines/${lineId}`);
      insertBudgetLine(
        invoiceId,
        { workItemBudgetId: insertWorkItemBudget(insertWorkItem({})) },
        600,
      );

      expect((await undo(token)).statusCode).toBe(200);
    });

    it('refuses when the cost line was linked to another invoice line meanwhile', async () => {
      const invoiceId = insertInvoice(insertVendor(), 1000);
      const otherInvoice = insertInvoice(insertVendor(), 1000);
      const budgetId = insertWorkItemBudget(insertWorkItem({}));
      const lineId = insertBudgetLine(invoiceId, { workItemBudgetId: budgetId }, 100);
      const token = await unlink(`/api/invoices/${invoiceId}/budget-lines/${lineId}`);
      insertBudgetLine(otherInvoice, { workItemBudgetId: budgetId }, 100);

      await expectConflict(token, { type: 'invoice_budget_line', id: lineId });
    });

    it('refuses when the cost line was deleted meanwhile', async () => {
      const invoiceId = insertInvoice(insertVendor(), 1000);
      const budgetId = insertWorkItemBudget(insertWorkItem({}));
      const lineId = insertBudgetLine(invoiceId, { workItemBudgetId: budgetId }, 100);
      const token = await unlink(`/api/invoices/${invoiceId}/budget-lines/${lineId}`);
      app.db.delete(schema.workItemBudgets).where(eq(schema.workItemBudgets.id, budgetId)).run();

      await expectConflict(token, { type: 'invoice_budget_line', id: lineId });
    });

    it('refuses when the id is taken again', async () => {
      const invoiceId = insertInvoice(insertVendor(), 1000);
      const lineId = insertBudgetLine(
        invoiceId,
        { workItemBudgetId: insertWorkItemBudget(insertWorkItem({})) },
        100,
      );
      const token = await unlink(`/api/invoices/${invoiceId}/budget-lines/${lineId}`);
      app.db
        .insert(schema.invoiceBudgetLines)
        .values({
          id: lineId,
          invoiceId,
          workItemBudgetId: insertWorkItemBudget(insertWorkItem({})),
          itemizedAmount: 1,
          createdAt: TS,
          updatedAt: TS,
        })
        .run();

      await expectConflict(token, { type: 'invoice_budget_line', id: lineId });
    });

    it('restores a household item cost line link with all columns', async () => {
      const invoiceId = insertInvoice(insertVendor(), 1000);
      const budgetId = insertHouseholdItemBudget(insertHouseholdItem());
      const lineId = insertBudgetLine(invoiceId, { householdItemBudgetId: budgetId }, 250);
      const original = app.db.select().from(schema.invoiceBudgetLines).all();
      const token = await unlink(`/api/invoices/${invoiceId}/budget-lines/${lineId}`);

      expect((await undo(token)).statusCode).toBe(200);

      expect(app.db.select().from(schema.invoiceBudgetLines).all()).toEqual(original);
    });

    it('refuses a household item cost line that was linked again or deleted', async () => {
      const invoiceId = insertInvoice(insertVendor(), 1000);
      const otherInvoice = insertInvoice(insertVendor(), 1000);
      const budgetId = insertHouseholdItemBudget(insertHouseholdItem());
      const lineId = insertBudgetLine(invoiceId, { householdItemBudgetId: budgetId }, 100);
      const token = await unlink(`/api/invoices/${invoiceId}/budget-lines/${lineId}`);
      insertBudgetLine(otherInvoice, { householdItemBudgetId: budgetId }, 100);
      await expectConflict(token, { type: 'invoice_budget_line', id: lineId });

      const budgetId2 = insertHouseholdItemBudget(insertHouseholdItem());
      const lineId2 = insertBudgetLine(invoiceId, { householdItemBudgetId: budgetId2 }, 100);
      const token2 = await unlink(`/api/invoices/${invoiceId}/budget-lines/${lineId2}`);
      app.db
        .delete(schema.householdItemBudgets)
        .where(eq(schema.householdItemBudgets.id, budgetId2))
        .run();
      await expectConflict(token2, { type: 'invoice_budget_line', id: lineId2 });
    });
  });

  describe('vendor contact restore', () => {
    it('refuses when the id is taken again', async () => {
      const c = contactCase();
      const token = await unlink(c.url);
      const vendorId = c.url.split('/')[3]!;
      app.db
        .insert(schema.vendorContacts)
        .values({ id: c.subject.id, vendorId, name: 'Someone', createdAt: TS, updatedAt: TS })
        .run();

      await expectConflict(token, c.subject);
    });
  });

  describe('subsidy link restore', () => {
    it('refuses when the link exists again', async () => {
      const c = workItemSubsidyCase();
      const token = await unlink(c.url);
      const subsidyId = c.url.split('/').pop()!;
      app.db
        .insert(schema.workItemSubsidies)
        .values({ workItemId: c.subject.id, subsidyProgramId: subsidyId })
        .run();

      await expectConflict(token, c.subject);
    });

    it('refuses when the work item was deleted', async () => {
      const c = householdItemSubsidyCase();
      const token = await unlink(c.url);
      app.db.delete(schema.householdItems).where(eq(schema.householdItems.id, c.subject.id)).run();

      await expectConflict(token, c.subject);
    });

    it('restores both link kinds', async () => {
      const wi = workItemSubsidyCase();
      const hi = householdItemSubsidyCase();
      const t1 = await unlink(wi.url);
      const t2 = await unlink(hi.url);

      expect((await undo(t1)).statusCode).toBe(200);
      expect((await undo(t2)).statusCode).toBe(200);

      expect(wi.rows()).toHaveLength(1);
      expect(hi.rows()).toHaveLength(1);
      expect(
        app.db
          .select()
          .from(schema.workItemSubsidies)
          .where(and(eq(schema.workItemSubsidies.workItemId, wi.subject.id)))
          .all(),
      ).toHaveLength(1);
    });
  });

  describe('not-found deletes issue no token', () => {
    it('answers 404 and stores no snapshot for a missing relation', async () => {
      const a = insertWorkItem({});
      const b = insertWorkItem({});
      const before = undoStore.snapshots.size;

      const res = await del(`/api/work-items/${b}/dependencies/${a}`);

      expect(res.statusCode).toBe(404);
      expect(undoStore.snapshots.size).toBe(before);
    });
  });
});
