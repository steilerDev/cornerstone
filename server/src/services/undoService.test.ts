/**
 * Unit tests for undoService.ts (#2209): runUndoable snapshots, single-use user-bound tokens,
 * the 30 s window, conflict detection, event retraction / re-insertion (ADR-040 W3/W4).
 * Real in-memory SQLite with migrations; fake timers drive the clock.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, eq } from 'drizzle-orm';
import { UNDO_WINDOW_MS } from '@cornerstone/shared';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { ConflictError, NotFoundError } from '../errors/AppError.js';
import * as workItemService from './workItemService.js';
import * as dependencyService from './dependencyService.js';
import * as milestoneService from './milestoneService.js';
import * as workItemMilestoneService from './workItemMilestoneService.js';
import * as householdItemService from './householdItemService.js';
import * as invoiceService from './invoiceService.js';
import * as invoiceDepositService from './invoiceDepositService.js';
import * as subsidyProgramService from './subsidyProgramService.js';
import * as diaryService from './diaryService.js';
import * as budgetSourceService from './budgetSourceService.js';
import { __resetLedgerForTests, activeCollection } from './statusEventLedger.js';
import { applyUndo, createUndoStore, runUndoable, undoStore } from './undoService.js';
import type { UndoStore } from './undoService.js';

const START = new Date('2026-08-07T10:00:00.000Z');
const TOKEN_SHAPE = /^u_[0-9a-f]{32}$/;

describe('undoService', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let store: UndoStore;
  let userA: string;
  let userB: string;

  function insertUser(email: string): string {
    const id = `user-${email}`;
    const now = new Date().toISOString();
    db.insert(schema.users)
      .values({
        id,
        email,
        displayName: email,
        role: 'member',
        authProvider: 'local',
        passwordHash: 'x',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function statusEvents(entryType = 'work_item_status') {
    return db
      .select()
      .from(schema.diaryEntries)
      .where(eq(schema.diaryEntries.entryType, entryType as 'general_note'))
      .all();
  }

  function workItem(
    title: string,
    extra: Partial<Parameters<typeof workItemService.createWorkItem>[2]> = {},
  ) {
    return workItemService.createWorkItem(db, userA, { title, ...extra });
  }

  function patchWorkItem(
    id: string,
    data: Parameters<typeof workItemService.updateWorkItem>[2],
    actor: string | null = userA,
  ) {
    return runUndoable(
      db,
      store,
      { userId: actor ?? userA, subject: { type: 'work_item', id }, reschedules: true },
      () => workItemService.updateWorkItem(db, id, data, true, actor),
    );
  }

  function getWorkItemRow(id: string) {
    return db.select().from(schema.workItems).where(eq(schema.workItems.id, id)).get()!;
  }

  beforeEach(() => {
    jest.useFakeTimers({ now: START });
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    store = createUndoStore({ now: () => Date.now() });
    __resetLedgerForTests();
    userA = insertUser('a@example.com');
    userB = insertUser('b@example.com');
  });

  afterEach(() => {
    jest.useRealTimers();
    sqlite.close();
  });

  describe('createUndoStore', () => {
    it('defaults to a 500 entry cap and the real clock', () => {
      const s = createUndoStore();
      expect(s.maxEntries).toBe(500);
      expect(s.now()).toBe(Date.now());
      expect(s.snapshots.size).toBe(0);
    });

    it('exports a process singleton', () => {
      expect(undoStore.snapshots).toBeInstanceOf(Map);
    });
  });

  describe('runUndoable', () => {
    it('returns undo: null and stores nothing when no status column changed', () => {
      const wi = workItem('Walls');
      const { result, undo } = patchWorkItem(wi.id, { title: 'Walls renamed' });
      expect(result.title).toBe('Walls renamed');
      expect(undo).toBeNull();
      expect(store.snapshots.size).toBe(0);
    });

    it('issues a u_<32 hex> token expiring 30 s from now when the status changed', () => {
      const wi = workItem('Walls');
      const { undo } = patchWorkItem(wi.id, { status: 'in_progress' });
      expect(undo).not.toBeNull();
      expect(undo!.token).toMatch(TOKEN_SHAPE);
      expect(undo!.expiresAt).toBe(new Date(START.getTime() + UNDO_WINDOW_MS).toISOString());
      expect(store.snapshots.get(undo!.token)?.userId).toBe(userA);
    });

    it('issues different tokens for each change', () => {
      const wi = workItem('Walls');
      const first = patchWorkItem(wi.id, { status: 'in_progress' }).undo!;
      const second = patchWorkItem(wi.id, { status: 'completed' }).undo!;
      expect(first.token).not.toBe(second.token);
      expect(store.snapshots.size).toBe(2);
    });

    it('snapshots a successor whose dates the reschedule moved', () => {
      const pred = workItem('Pred', { startDate: '2026-08-10', durationDays: 3 });
      const succ = workItem('Succ', { startDate: '2026-08-13', durationDays: 2 });
      dependencyService.createDependency(db, succ.id, {
        predecessorId: pred.id,
        dependencyType: 'finish_to_start',
      });
      const succBefore = getWorkItemRow(succ.id);

      const { undo } = patchWorkItem(pred.id, {
        status: 'completed',
        actualStartDate: '2026-08-10',
        actualEndDate: '2026-08-20',
      });

      const succAfter = getWorkItemRow(succ.id);
      expect(succAfter.startDate).not.toBe(succBefore.startDate);
      const snapshot = store.snapshots.get(undo!.token)!;
      const ids = snapshot.rows.map((r) => `${r.type}:${r.id}`);
      expect(ids).toContain(`work_item:${pred.id}`);
      expect(ids).toContain(`work_item:${succ.id}`);
    });

    it('stores no snapshot and closes the collector when fn throws', () => {
      const wi = workItem('Walls');
      expect(() =>
        runUndoable(
          db,
          store,
          { userId: userA, subject: { type: 'work_item', id: wi.id }, reschedules: true },
          () => {
            throw new Error('boom');
          },
        ),
      ).toThrow('boom');
      expect(store.snapshots.size).toBe(0);
      expect(activeCollection()).toBeUndefined();
    });

    it('does not collect events written after a throwing call', () => {
      const wi = workItem('Walls');
      expect(() =>
        runUndoable(
          db,
          store,
          { userId: userA, subject: { type: 'work_item', id: wi.id }, reschedules: false },
          () => {
            throw new Error('boom');
          },
        ),
      ).toThrow();
      // A later, unrelated undoable call must only carry its own events.
      const { undo } = patchWorkItem(wi.id, { status: 'in_progress' });
      expect(store.snapshots.get(undo!.token)!.written).toHaveLength(1);
    });

    it('collects the status event id and any milestone-delay event written in the same call', () => {
      const wi = workItem('Walls', { startDate: '2026-08-10', durationDays: 3 });
      const ms = milestoneService.createMilestone(
        db,
        { title: 'Roof', targetDate: '2026-08-08' },
        userA,
      );
      workItemMilestoneService.addLinkedMilestone(db, wi.id, ms.id);
      const { undo } = patchWorkItem(wi.id, { status: 'in_progress' });
      const snapshot = store.snapshots.get(undo!.token)!;
      expect(statusEvents('milestone_delay')).toHaveLength(1);
      expect(snapshot.written).toHaveLength(2);
      for (const id of snapshot.written) {
        expect(
          db.select().from(schema.diaryEntries).where(eq(schema.diaryEntries.id, id)).get()
            ?.isAutomatic,
        ).toBe(true);
      }
    });

    it('prunes expired snapshots when a new one is stored', () => {
      const wi = workItem('Walls');
      const first = patchWorkItem(wi.id, { status: 'in_progress' }).undo!;
      jest.setSystemTime(new Date(START.getTime() + UNDO_WINDOW_MS));
      const second = patchWorkItem(wi.id, { status: 'completed' }).undo!;
      expect(store.snapshots.has(first.token)).toBe(false);
      expect(store.snapshots.has(second.token)).toBe(true);
    });

    it('caps the store, dropping the oldest snapshot first', () => {
      store = createUndoStore({ now: () => Date.now(), maxEntries: 2 });
      const wi = workItem('Walls');
      const t1 = patchWorkItem(wi.id, { status: 'in_progress' }).undo!;
      const t2 = patchWorkItem(wi.id, { status: 'completed' }).undo!;
      const t3 = patchWorkItem(wi.id, { status: 'in_progress' }).undo!;
      expect(store.snapshots.size).toBe(2);
      expect(store.snapshots.has(t1.token)).toBe(false);
      expect(store.snapshots.has(t2.token)).toBe(true);
      expect(store.snapshots.has(t3.token)).toBe(true);
    });

    it('stores a snapshot even when the subject was deleted by fn (status read as null)', () => {
      const ms = milestoneService.createMilestone(
        db,
        { title: 'Gone', targetDate: '2026-09-01' },
        userA,
      );
      const { undo } = runUndoable(
        db,
        store,
        { userId: userA, subject: { type: 'milestone', id: String(ms.id) }, reschedules: false },
        () => milestoneService.deleteMilestone(db, ms.id),
      );
      expect(undo).not.toBeNull();
      expect(store.snapshots.get(undo!.token)!.rows).toEqual([]);
    });

    describe('per subject type', () => {
      it('household_item: status change issues a token, a name change does not', () => {
        const item = householdItemService.createHouseholdItem(db, userA, { name: 'Sofa' }, 0.19);
        const quiet = runUndoable(
          db,
          store,
          { userId: userA, subject: { type: 'household_item', id: item.id }, reschedules: true },
          () => householdItemService.updateHouseholdItem(db, item.id, { name: 'Sofa 2' }, 0.19),
        );
        expect(quiet.undo).toBeNull();
        const loud = runUndoable(
          db,
          store,
          { userId: userA, subject: { type: 'household_item', id: item.id }, reschedules: true },
          () =>
            householdItemService.updateHouseholdItem(db, item.id, { status: 'purchased' }, 0.19),
        );
        expect(loud.undo?.token).toMatch(TOKEN_SHAPE);
      });

      it('milestone: isCompleted change issues a token, a title change does not', () => {
        const ms = milestoneService.createMilestone(
          db,
          { title: 'Roof', targetDate: '2026-09-01' },
          userA,
        );
        const subject = { type: 'milestone' as const, id: String(ms.id) };
        const quiet = runUndoable(db, store, { userId: userA, subject, reschedules: false }, () =>
          milestoneService.updateMilestone(db, ms.id, { title: 'Roof 2' }),
        );
        expect(quiet.undo).toBeNull();
        const loud = runUndoable(db, store, { userId: userA, subject, reschedules: false }, () =>
          milestoneService.updateMilestone(db, ms.id, { isCompleted: true }),
        );
        expect(loud.undo?.token).toMatch(TOKEN_SHAPE);
      });

      it('invoice: status change issues a token', () => {
        const vendorId = insertVendor();
        const inv = invoiceService.createInvoice(
          db,
          vendorId,
          { invoiceNumber: 'INV-1', amount: 100, date: '2026-08-01', status: 'pending' },
          userA,
        );
        const quiet = runUndoable(
          db,
          store,
          { userId: userA, subject: { type: 'invoice', id: inv.id }, reschedules: false },
          () => invoiceService.updateInvoice(db, vendorId, inv.id, { notes: 'x' }, true, userA),
        );
        expect(quiet.undo).toBeNull();
        const loud = runUndoable(
          db,
          store,
          { userId: userA, subject: { type: 'invoice', id: inv.id }, reschedules: false },
          () => invoiceService.updateInvoice(db, vendorId, inv.id, { status: 'paid' }, true, userA),
        );
        expect(loud.undo?.token).toMatch(TOKEN_SHAPE);
      });

      it('invoice_deposit: status change issues a token', () => {
        const { invoiceId, depositId } = setupDeposit();
        const loud = runUndoable(
          db,
          store,
          {
            userId: userA,
            subject: { type: 'invoice_deposit', id: depositId },
            reschedules: false,
          },
          () =>
            invoiceDepositService.updateDeposit(
              db,
              invoiceId,
              depositId,
              { status: 'paid', paidDate: '2026-08-05' },
              true,
              userA,
            ),
        );
        expect(loud.undo?.token).toMatch(TOKEN_SHAPE);
      });

      it('subsidy_program: applicationStatus change issues a token', () => {
        const program = subsidyProgramService.createSubsidyProgram(
          db,
          { name: 'Grant', reductionType: 'percentage', reductionValue: 10 },
          userA,
        );
        const quiet = runUndoable(
          db,
          store,
          {
            userId: userA,
            subject: { type: 'subsidy_program', id: program.id },
            reschedules: false,
          },
          () =>
            subsidyProgramService.updateSubsidyProgram(
              db,
              program.id,
              { name: 'Grant 2' },
              true,
              userA,
            ),
        );
        expect(quiet.undo).toBeNull();
        const loud = runUndoable(
          db,
          store,
          {
            userId: userA,
            subject: { type: 'subsidy_program', id: program.id },
            reschedules: false,
          },
          () =>
            subsidyProgramService.updateSubsidyProgram(
              db,
              program.id,
              { applicationStatus: 'approved' },
              true,
              userA,
            ),
        );
        expect(loud.undo?.token).toMatch(TOKEN_SHAPE);
      });

      it('diary_entry: only a resolutionStatus change issues a token', () => {
        const entry = diaryService.createDiaryEntry(db, userA, {
          entryType: 'issue',
          entryDate: '2026-08-01',
          body: 'Leak',
          metadata: { severity: 'low', resolutionStatus: 'open' },
        });
        const subject = { type: 'diary_entry' as const, id: entry.id };
        const quiet = runUndoable(db, store, { userId: userA, subject, reschedules: false }, () =>
          diaryService.updateDiaryEntry(db, entry.id, { body: 'Leak in cellar' }),
        );
        expect(quiet.undo).toBeNull();
        const loud = runUndoable(db, store, { userId: userA, subject, reschedules: false }, () =>
          diaryService.updateDiaryEntry(db, entry.id, {
            metadata: { severity: 'low', resolutionStatus: 'resolved' },
          }),
        );
        expect(loud.undo?.token).toMatch(TOKEN_SHAPE);
      });

      it('diary_entry: unparsable or non-string metadata reads as no resolution status', () => {
        const entry = diaryService.createDiaryEntry(db, userA, {
          entryType: 'issue',
          entryDate: '2026-08-01',
          body: 'Leak',
          metadata: { severity: 'low', resolutionStatus: 'open' },
        });
        const subject = { type: 'diary_entry' as const, id: entry.id };
        const toBroken = runUndoable(
          db,
          store,
          { userId: userA, subject, reschedules: false },
          () =>
            sqlite
              .prepare("UPDATE diary_entries SET metadata = '{not json' WHERE id = ?")
              .run(entry.id),
        );
        expect(toBroken.undo).not.toBeNull();
        const toNull = runUndoable(db, store, { userId: userA, subject, reschedules: false }, () =>
          sqlite.prepare('UPDATE diary_entries SET metadata = NULL WHERE id = ?').run(entry.id),
        );
        // broken -> null: both read as no resolution status, so no token
        expect(toNull.undo).toBeNull();
        const toArray = runUndoable(db, store, { userId: userA, subject, reschedules: false }, () =>
          sqlite.prepare("UPDATE diary_entries SET metadata = 'null' WHERE id = ?").run(entry.id),
        );
        expect(toArray.undo).toBeNull();
      });
    });
  });

  describe('applyUndo', () => {
    it('restores status and actual dates and returns restored rows and retracted event ids', () => {
      const wi = workItem('Walls');
      const before = getWorkItemRow(wi.id);
      const { undo } = patchWorkItem(wi.id, { status: 'completed' });
      const eventId = statusEvents()[0]!.id;
      expect(getWorkItemRow(wi.id).status).toBe('completed');

      const response = applyUndo(db, store, undo!.token, userA);

      const after = getWorkItemRow(wi.id);
      expect(after.status).toBe(before.status);
      expect(after.actualStartDate).toBe(before.actualStartDate);
      expect(after.actualEndDate).toBe(before.actualEndDate);
      expect(response.restored).toContainEqual({ type: 'work_item', id: wi.id });
      expect(response.retractedEventIds).toEqual([eventId]);
      expect(statusEvents()).toHaveLength(0);
    });

    it('restores the dates of a rescheduled successor', () => {
      const pred = workItem('Pred', { startDate: '2026-08-10', durationDays: 3 });
      const succ = workItem('Succ', { startDate: '2026-08-13', durationDays: 2 });
      dependencyService.createDependency(db, succ.id, {
        predecessorId: pred.id,
        dependencyType: 'finish_to_start',
      });
      const succBefore = getWorkItemRow(succ.id);
      const { undo } = patchWorkItem(pred.id, {
        status: 'completed',
        actualStartDate: '2026-08-10',
        actualEndDate: '2026-08-20',
      });
      expect(getWorkItemRow(succ.id).startDate).not.toBe(succBefore.startDate);

      const response = applyUndo(db, store, undo!.token, userA);

      const succAfter = getWorkItemRow(succ.id);
      expect(succAfter.startDate).toBe(succBefore.startDate);
      expect(succAfter.endDate).toBe(succBefore.endDate);
      expect(response.restored.map((r) => r.id)).toContain(succ.id);
    });

    it('stamps updatedAt with the undo time instead of the stored value', () => {
      const wi = workItem('Walls');
      const { undo } = patchWorkItem(wi.id, { status: 'in_progress' });
      jest.setSystemTime(new Date(START.getTime() + 5000));
      applyUndo(db, store, undo!.token, userA);
      expect(getWorkItemRow(wi.id).updatedAt).toBe(new Date(START.getTime() + 5000).toISOString());
    });

    it('retracts the milestone-delay event written by the same call', () => {
      const wi = workItem('Walls', { startDate: '2026-08-10', durationDays: 3 });
      const ms = milestoneService.createMilestone(
        db,
        { title: 'Roof', targetDate: '2026-08-08' },
        userA,
      );
      workItemMilestoneService.addLinkedMilestone(db, wi.id, ms.id);
      const { undo } = patchWorkItem(wi.id, { status: 'in_progress' });
      const written = store.snapshots.get(undo!.token)!.written;
      expect(statusEvents('milestone_delay')).toHaveLength(1);
      expect(written).toHaveLength(2);

      const response = applyUndo(db, store, undo!.token, userA);

      expect(response.retractedEventIds.sort()).toEqual([...written].sort());
      expect(
        db
          .select()
          .from(schema.diaryEntries)
          .where(eq(schema.diaryEntries.isAutomatic, true))
          .all(),
      ).toHaveLength(0);
    });

    it('only reports event ids that still exist (a manually removed event is skipped)', () => {
      const wi = workItem('Walls');
      const { undo } = patchWorkItem(wi.id, { status: 'in_progress' });
      sqlite.prepare('DELETE FROM diary_entries').run();
      const response = applyUndo(db, store, undo!.token, userA);
      expect(response.retractedEventIds).toEqual([]);
    });

    it('never deletes a non-automatic diary entry even if its id is in the written list', () => {
      const wi = workItem('Walls');
      const { undo } = patchWorkItem(wi.id, { status: 'in_progress' });
      const eventId = statusEvents()[0]!.id;
      sqlite.prepare('UPDATE diary_entries SET is_automatic = 0 WHERE id = ?').run(eventId);
      const response = applyUndo(db, store, undo!.token, userA);
      expect(response.retractedEventIds).toEqual([]);
      expect(
        db.select().from(schema.diaryEntries).where(eq(schema.diaryEntries.id, eventId)).get(),
      ).toBeDefined();
    });

    it('writes no events of its own', () => {
      const wi = workItem('Walls');
      const { undo } = patchWorkItem(wi.id, { status: 'in_progress' });
      applyUndo(db, store, undo!.token, userA);
      expect(db.select().from(schema.diaryEntries).all()).toHaveLength(0);
    });

    describe('single use', () => {
      it('rejects a second use with 404', () => {
        const wi = workItem('Walls');
        const { undo } = patchWorkItem(wi.id, { status: 'in_progress' });
        applyUndo(db, store, undo!.token, userA);
        expect(() => applyUndo(db, store, undo!.token, userA)).toThrow(NotFoundError);
        expect(store.snapshots.has(undo!.token)).toBe(false);
      });

      it('rejects an unknown token with 404', () => {
        expect(() => applyUndo(db, store, `u_${'0'.repeat(32)}`, userA)).toThrow(NotFoundError);
      });
    });

    describe('user binding', () => {
      it('rejects another user with the same 404 as an unknown token', () => {
        const wi = workItem('Walls');
        const { undo } = patchWorkItem(wi.id, { status: 'in_progress' });
        let foreign: unknown;
        let unknown: unknown;
        try {
          applyUndo(db, store, undo!.token, userB);
        } catch (e) {
          foreign = e;
        }
        try {
          applyUndo(db, store, `u_${'1'.repeat(32)}`, userB);
        } catch (e) {
          unknown = e;
        }
        expect(foreign).toBeInstanceOf(NotFoundError);
        expect(unknown).toBeInstanceOf(NotFoundError);
        expect((foreign as NotFoundError).message).toBe((unknown as NotFoundError).message);
        expect((foreign as NotFoundError).statusCode).toBe((unknown as NotFoundError).statusCode);
        expect((foreign as NotFoundError).details).toEqual((unknown as NotFoundError).details);
      });

      it('does not change any row when another user tries', () => {
        const wi = workItem('Walls');
        const { undo } = patchWorkItem(wi.id, { status: 'in_progress' });
        expect(() => applyUndo(db, store, undo!.token, userB)).toThrow(NotFoundError);
        expect(getWorkItemRow(wi.id).status).toBe('in_progress');
      });

      it('leaves the owner token intact after a foreign attempt', () => {
        const wi = workItem('Walls');
        const { undo } = patchWorkItem(wi.id, { status: 'in_progress' });
        expect(() => applyUndo(db, store, undo!.token, userB)).toThrow(NotFoundError);
        expect(store.snapshots.has(undo!.token)).toBe(true);
        const response = applyUndo(db, store, undo!.token, userA);
        expect(response.restored).toContainEqual({ type: 'work_item', id: wi.id });
        expect(getWorkItemRow(wi.id).status).toBe('not_started');
      });
    });

    describe('expiry', () => {
      it('accepts a token 1 ms before the window closes', () => {
        const wi = workItem('Walls');
        const { undo } = patchWorkItem(wi.id, { status: 'in_progress' });
        jest.setSystemTime(new Date(START.getTime() + UNDO_WINDOW_MS - 1));
        expect(() => applyUndo(db, store, undo!.token, userA)).not.toThrow();
      });

      it('rejects a token exactly 30 s old with 404 and drops it', () => {
        const wi = workItem('Walls');
        const { undo } = patchWorkItem(wi.id, { status: 'in_progress' });
        jest.setSystemTime(new Date(START.getTime() + UNDO_WINDOW_MS));
        expect(() => applyUndo(db, store, undo!.token, userA)).toThrow(NotFoundError);
        expect(store.snapshots.has(undo!.token)).toBe(false);
        expect(getWorkItemRow(wi.id).status).toBe('in_progress');
      });

      it('an expired foreign attempt does not delete the owner token entry', () => {
        const wi = workItem('Walls');
        const { undo } = patchWorkItem(wi.id, { status: 'in_progress' });
        jest.setSystemTime(new Date(START.getTime() + UNDO_WINDOW_MS + 1));
        expect(() => applyUndo(db, store, undo!.token, userB)).toThrow(NotFoundError);
        expect(store.snapshots.has(undo!.token)).toBe(true);
      });
    });

    describe('conflicts', () => {
      it('409 with details.changed when the row was edited in between, restoring nothing', () => {
        const pred = workItem('Pred', { startDate: '2026-08-10', durationDays: 3 });
        const succ = workItem('Succ', { startDate: '2026-08-13', durationDays: 2 });
        dependencyService.createDependency(db, succ.id, {
          predecessorId: pred.id,
          dependencyType: 'finish_to_start',
        });
        const { undo } = patchWorkItem(pred.id, {
          status: 'completed',
          actualStartDate: '2026-08-10',
          actualEndDate: '2026-08-20',
        });
        // someone else edits the successor's status afterwards
        sqlite.prepare("UPDATE work_items SET status = 'in_progress' WHERE id = ?").run(succ.id);
        const predAfter = getWorkItemRow(pred.id);

        let error: unknown;
        try {
          applyUndo(db, store, undo!.token, userA);
        } catch (e) {
          error = e;
        }
        expect(error).toBeInstanceOf(ConflictError);
        expect((error as ConflictError).details).toEqual({
          changed: [{ type: 'work_item', id: succ.id }],
        });
        // nothing restored, including the unchanged predecessor
        expect(getWorkItemRow(pred.id)).toEqual(predAfter);
        expect(getWorkItemRow(succ.id).status).toBe('in_progress');
      });

      it('consumes the token on a 409', () => {
        const wi = workItem('Walls');
        const { undo } = patchWorkItem(wi.id, { status: 'in_progress' });
        sqlite
          .prepare(
            "UPDATE work_items SET title = 'x', updated_at = '2030-01-01T00:00:00.000Z' WHERE id = ?",
          )
          .run(wi.id);
        expect(() => applyUndo(db, store, undo!.token, userA)).toThrow(ConflictError);
        expect(store.snapshots.has(undo!.token)).toBe(false);
        expect(() => applyUndo(db, store, undo!.token, userA)).toThrow(NotFoundError);
      });

      it('409 when the subject row was deleted meanwhile', () => {
        const wi = workItem('Walls');
        const { undo } = patchWorkItem(wi.id, { status: 'in_progress' });
        sqlite.prepare('DELETE FROM work_items WHERE id = ?').run(wi.id);
        expect(() => applyUndo(db, store, undo!.token, userA)).toThrow(ConflictError);
      });

      it('leaves the retracted/written events untouched on a 409', () => {
        const wi = workItem('Walls');
        const { undo } = patchWorkItem(wi.id, { status: 'in_progress' });
        sqlite.prepare("UPDATE work_items SET status = 'completed' WHERE id = ?").run(wi.id);
        expect(() => applyUndo(db, store, undo!.token, userA)).toThrow(ConflictError);
        expect(statusEvents()).toHaveLength(1);
      });
    });

    describe('other subjects', () => {
      it('restores a milestone (numeric id) completion', () => {
        const ms = milestoneService.createMilestone(
          db,
          { title: 'Roof', targetDate: '2026-09-01' },
          userA,
        );
        const { undo } = runUndoable(
          db,
          store,
          { userId: userA, subject: { type: 'milestone', id: String(ms.id) }, reschedules: false },
          () => milestoneService.updateMilestone(db, ms.id, { isCompleted: true }),
        );
        const response = applyUndo(db, store, undo!.token, userA);
        const row = db
          .select()
          .from(schema.milestones)
          .where(eq(schema.milestones.id, ms.id))
          .get()!;
        expect(row.isCompleted).toBe(false);
        expect(row.completedAt).toBeNull();
        expect(response.restored).toEqual([{ type: 'milestone', id: String(ms.id) }]);
      });

      it('restores a household item status and delivery dates', () => {
        const item = householdItemService.createHouseholdItem(db, userA, { name: 'Sofa' }, 0.19);
        const { undo } = runUndoable(
          db,
          store,
          { userId: userA, subject: { type: 'household_item', id: item.id }, reschedules: true },
          () => householdItemService.updateHouseholdItem(db, item.id, { status: 'arrived' }, 0.19),
        );
        applyUndo(db, store, undo!.token, userA);
        const row = db
          .select()
          .from(schema.householdItems)
          .where(eq(schema.householdItems.id, item.id))
          .get()!;
        expect(row.status).toBe('planned');
        expect(row.actualDeliveryDate).toBeNull();
      });

      it('restores an invoice and retracts its status event', () => {
        const vendorId = insertVendor();
        const inv = invoiceService.createInvoice(
          db,
          vendorId,
          { invoiceNumber: 'INV-1', amount: 100, date: '2026-08-01', status: 'pending' },
          userA,
        );
        const eventsBefore = statusEvents('invoice_status').length;
        const { undo } = runUndoable(
          db,
          store,
          { userId: userA, subject: { type: 'invoice', id: inv.id }, reschedules: false },
          () => invoiceService.updateInvoice(db, vendorId, inv.id, { status: 'paid' }, true, userA),
        );
        expect(statusEvents('invoice_status').length).toBe(eventsBefore + 1);
        applyUndo(db, store, undo!.token, userA);
        expect(
          db.select().from(schema.invoices).where(eq(schema.invoices.id, inv.id)).get()!.status,
        ).toBe('pending');
        expect(statusEvents('invoice_status').length).toBe(eventsBefore);
      });

      it('restores a deposit status and dates', () => {
        const { invoiceId, depositId } = setupDeposit();
        const { undo } = runUndoable(
          db,
          store,
          {
            userId: userA,
            subject: { type: 'invoice_deposit', id: depositId },
            reschedules: false,
          },
          () =>
            invoiceDepositService.updateDeposit(
              db,
              invoiceId,
              depositId,
              { status: 'paid', paidDate: '2026-08-05' },
              true,
              userA,
            ),
        );
        applyUndo(db, store, undo!.token, userA);
        const row = db
          .select()
          .from(schema.invoiceDeposits)
          .where(eq(schema.invoiceDeposits.id, depositId))
          .get()!;
        expect(row.status).toBe('pending');
        expect(row.paidDate).toBeNull();
      });

      it('restores a subsidy application status', () => {
        const program = subsidyProgramService.createSubsidyProgram(
          db,
          { name: 'Grant', reductionType: 'percentage', reductionValue: 10 },
          userA,
        );
        const { undo } = runUndoable(
          db,
          store,
          {
            userId: userA,
            subject: { type: 'subsidy_program', id: program.id },
            reschedules: false,
          },
          () =>
            subsidyProgramService.updateSubsidyProgram(
              db,
              program.id,
              { applicationStatus: 'approved' },
              true,
              userA,
            ),
        );
        applyUndo(db, store, undo!.token, userA);
        expect(
          db
            .select()
            .from(schema.subsidyPrograms)
            .where(eq(schema.subsidyPrograms.id, program.id))
            .get()!.applicationStatus,
        ).toBe(program.applicationStatus);
      });

      it('restores a diary issue resolution status', () => {
        const entry = diaryService.createDiaryEntry(db, userA, {
          entryType: 'issue',
          entryDate: '2026-08-01',
          body: 'Leak',
          metadata: { severity: 'low', resolutionStatus: 'open' },
        });
        const { undo } = runUndoable(
          db,
          store,
          { userId: userA, subject: { type: 'diary_entry', id: entry.id }, reschedules: false },
          () =>
            diaryService.updateDiaryEntry(db, entry.id, {
              metadata: { severity: 'low', resolutionStatus: 'resolved' },
            }),
        );
        applyUndo(db, store, undo!.token, userA);
        const row = db
          .select()
          .from(schema.diaryEntries)
          .where(eq(schema.diaryEntries.id, entry.id))
          .get()!;
        expect(JSON.parse(row.metadata!).resolutionStatus).toBe('open');
      });
    });
  });

  describe('budget_source (R2)', () => {
    function newSource() {
      return budgetSourceService.createBudgetSource(
        db,
        { name: 'Bank loan', sourceType: 'bank_loan', totalAmount: 1000 },
        userA,
        0.19,
      );
    }

    function patchSource(
      id: string,
      data: Parameters<typeof budgetSourceService.updateBudgetSource>[2],
      actor = userA,
    ) {
      return runUndoable(
        db,
        store,
        { userId: actor, subject: { type: 'budget_source', id }, reschedules: false },
        () => budgetSourceService.updateBudgetSource(db, id, data, 0.19),
      );
    }

    function statusOf(id: string): string {
      return db.select().from(schema.budgetSources).where(eq(schema.budgetSources.id, id)).get()!
        .status;
    }

    it('issues a token only when the status changes', () => {
      const src = newSource();
      expect(patchSource(src.id, { name: 'Renamed' }).undo).toBeNull();
      expect(store.snapshots.size).toBe(0);
      const loud = patchSource(src.id, { status: 'exhausted' });
      expect(loud.undo?.token).toMatch(TOKEN_SHAPE);
      expect(store.snapshots.get(loud.undo!.token)!.userId).toBe(userA);
    });

    it('restores the previous status and returns the restored row', () => {
      const src = newSource();
      const { undo } = patchSource(src.id, { status: 'closed' });
      expect(statusOf(src.id)).toBe('closed');
      const response = applyUndo(db, store, undo!.token, userA);
      expect(statusOf(src.id)).toBe('active');
      expect(response.restored).toEqual([{ type: 'budget_source', id: src.id }]);
      expect(response.retractedEventIds).toEqual([]);
    });

    it('409 with details.changed when the row changed since, restoring nothing', () => {
      const src = newSource();
      const { undo } = patchSource(src.id, { status: 'exhausted' });
      sqlite.prepare("UPDATE budget_sources SET status = 'closed' WHERE id = ?").run(src.id);
      let error: unknown;
      try {
        applyUndo(db, store, undo!.token, userA);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).details).toEqual({
        changed: [{ type: 'budget_source', id: src.id }],
      });
      expect(statusOf(src.id)).toBe('closed');
      expect(() => applyUndo(db, store, undo!.token, userA)).toThrow(NotFoundError);
    });

    it('409 when only updatedAt moved (a later edit of another field)', () => {
      const src = newSource();
      const { undo } = patchSource(src.id, { status: 'exhausted' });
      jest.setSystemTime(new Date(START.getTime() + 2000));
      budgetSourceService.updateBudgetSource(db, src.id, { name: 'Edited later' }, 0.19);
      expect(() => applyUndo(db, store, undo!.token, userA)).toThrow(ConflictError);
      expect(statusOf(src.id)).toBe('exhausted');
    });

    it('is bound to the user and single use', () => {
      const src = newSource();
      const { undo } = patchSource(src.id, { status: 'exhausted' });
      expect(() => applyUndo(db, store, undo!.token, userB)).toThrow(NotFoundError);
      expect(statusOf(src.id)).toBe('exhausted');
      applyUndo(db, store, undo!.token, userA);
      expect(() => applyUndo(db, store, undo!.token, userA)).toThrow(NotFoundError);
    });

    it('expires after 30 s', () => {
      const src = newSource();
      const { undo } = patchSource(src.id, { status: 'exhausted' });
      jest.setSystemTime(new Date(START.getTime() + UNDO_WINDOW_MS));
      expect(() => applyUndo(db, store, undo!.token, userA)).toThrow(NotFoundError);
      expect(statusOf(src.id)).toBe('exhausted');
    });
  });

  describe('diary_entry metadata restore (A3)', () => {
    it('reverts the whole metadata JSON, including other fields edited in the same PATCH', () => {
      const entry = diaryService.createDiaryEntry(db, userA, {
        entryType: 'issue',
        entryDate: '2026-08-01',
        body: 'Leak',
        metadata: { severity: 'low', resolutionStatus: 'open' },
      });
      const { undo } = runUndoable(
        db,
        store,
        { userId: userA, subject: { type: 'diary_entry', id: entry.id }, reschedules: false },
        () =>
          diaryService.updateDiaryEntry(db, entry.id, {
            metadata: { severity: 'high', resolutionStatus: 'resolved' },
          }),
      );
      const row = () =>
        db.select().from(schema.diaryEntries).where(eq(schema.diaryEntries.id, entry.id)).get()!;
      expect(JSON.parse(row().metadata!)).toEqual({
        severity: 'high',
        resolutionStatus: 'resolved',
      });

      applyUndo(db, store, undo!.token, userA);

      expect(JSON.parse(row().metadata!)).toEqual({ severity: 'low', resolutionStatus: 'open' });
    });

    it('a severity-only edit issues no token (resolution status unchanged)', () => {
      const entry = diaryService.createDiaryEntry(db, userA, {
        entryType: 'issue',
        entryDate: '2026-08-01',
        body: 'Leak',
        metadata: { severity: 'low', resolutionStatus: 'open' },
      });
      const { undo } = runUndoable(
        db,
        store,
        { userId: userA, subject: { type: 'diary_entry', id: entry.id }, reschedules: false },
        () =>
          diaryService.updateDiaryEntry(db, entry.id, {
            metadata: { severity: 'high', resolutionStatus: 'open' },
          }),
      );
      expect(undo).toBeNull();
    });
  });

  describe('W1 / W3 / W4 at the service level', () => {
    function revert(
      id: string,
      from: 'in_progress',
      to: 'not_started',
      actor: string | null = userA,
    ) {
      void from;
      return patchWorkItem(id, { status: to }, actor);
    }

    it('not_started -> in_progress -> not_started by the same user inside 30 s writes zero events', () => {
      const wi = workItem('Walls');
      patchWorkItem(wi.id, { status: 'in_progress' });
      jest.setSystemTime(new Date(START.getTime() + 10_000));
      revert(wi.id, 'in_progress', 'not_started');
      expect(statusEvents()).toHaveLength(0);
    });

    it('the same flip by different users writes two events', () => {
      const wi = workItem('Walls');
      patchWorkItem(wi.id, { status: 'in_progress' }, userA);
      revert(wi.id, 'in_progress', 'not_started', userB);
      expect(statusEvents()).toHaveLength(2);
    });

    it('the same flip after the 30 s window writes two events', () => {
      const wi = workItem('Walls');
      patchWorkItem(wi.id, { status: 'in_progress' });
      jest.setSystemTime(new Date(START.getTime() + UNDO_WINDOW_MS));
      revert(wi.id, 'in_progress', 'not_started');
      expect(statusEvents()).toHaveLength(2);
    });

    it('the flip just inside the window (29.999 s) is still retracted', () => {
      const wi = workItem('Walls');
      patchWorkItem(wi.id, { status: 'in_progress' });
      jest.setSystemTime(new Date(START.getTime() + UNDO_WINDOW_MS - 1));
      revert(wi.id, 'in_progress', 'not_started');
      expect(statusEvents()).toHaveLength(0);
    });

    it('a system caller (no actor) never triggers a retraction', () => {
      const wi = workItem('Walls');
      patchWorkItem(wi.id, { status: 'in_progress' }, null);
      patchWorkItem(wi.id, { status: 'not_started' }, null);
      expect(statusEvents()).toHaveLength(2);
    });

    it('pending -> paid -> pending on a deposit leaves zero events', () => {
      const { invoiceId, depositId } = setupDeposit();
      invoiceDepositService.updateDeposit(
        db,
        invoiceId,
        depositId,
        { status: 'paid', paidDate: '2026-08-05' },
        true,
        userA,
      );
      expect(statusEvents('invoice_status')).toHaveLength(1);
      invoiceDepositService.updateDeposit(
        db,
        invoiceId,
        depositId,
        { status: 'pending' },
        true,
        userA,
      );
      expect(statusEvents('invoice_status')).toHaveLength(0);
    });

    it('a deposit moving to pending after the window writes no event (AC-17)', () => {
      const { invoiceId, depositId } = setupDeposit();
      invoiceDepositService.updateDeposit(
        db,
        invoiceId,
        depositId,
        { status: 'paid', paidDate: '2026-08-05' },
        true,
        userA,
      );
      jest.setSystemTime(new Date(START.getTime() + UNDO_WINDOW_MS + 1));
      invoiceDepositService.updateDeposit(
        db,
        invoiceId,
        depositId,
        { status: 'pending' },
        true,
        userA,
      );
      expect(statusEvents('invoice_status')).toHaveLength(1);
    });

    it('undo of A -> B leaves zero events', () => {
      const wi = workItem('Walls');
      const { undo } = patchWorkItem(wi.id, { status: 'in_progress' });
      applyUndo(db, store, undo!.token, userA);
      expect(statusEvents()).toHaveLength(0);
    });

    it('A -> B, B -> A (retracted), then undo of the B -> A token restores state B and the A -> B event', () => {
      const wi = workItem('Walls');
      patchWorkItem(wi.id, { status: 'in_progress' });
      const originalEvent = statusEvents()[0]!;
      const back = revert(wi.id, 'in_progress', 'not_started');
      expect(statusEvents()).toHaveLength(0);
      expect(store.snapshots.get(back.undo!.token)!.retracted).toHaveLength(1);

      applyUndo(db, store, back.undo!.token, userA);

      expect(getWorkItemRow(wi.id).status).toBe('in_progress');
      const events = statusEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(originalEvent);
    });

    it('after re-insertion the ledger lets a further B -> A inside the window retract again', () => {
      const wi = workItem('Walls');
      patchWorkItem(wi.id, { status: 'in_progress' });
      const back = revert(wi.id, 'in_progress', 'not_started');
      applyUndo(db, store, back.undo!.token, userA);
      expect(statusEvents()).toHaveLength(1);
      revert(wi.id, 'in_progress', 'not_started');
      expect(statusEvents()).toHaveLength(0);
    });

    it('after undoing A -> B the ledger forgets the event so B -> A does not retract anything', () => {
      const wi = workItem('Walls');
      const first = patchWorkItem(wi.id, { status: 'in_progress' });
      applyUndo(db, store, first.undo!.token, userA);
      patchWorkItem(wi.id, { status: 'in_progress' });
      expect(statusEvents()).toHaveLength(1);
    });

    it('diaryAutoEvents=false writes no rows and raises no errors', () => {
      const wi = workItem('Walls');
      const { undo } = runUndoable(
        db,
        store,
        { userId: userA, subject: { type: 'work_item', id: wi.id }, reschedules: true },
        () => workItemService.updateWorkItem(db, wi.id, { status: 'in_progress' }, false, userA),
      );
      expect(undo).not.toBeNull();
      expect(statusEvents()).toHaveLength(0);
      expect(store.snapshots.get(undo!.token)!.written).toEqual([]);
      expect(() => applyUndo(db, store, undo!.token, userA)).not.toThrow();
      expect(getWorkItemRow(wi.id).status).toBe('not_started');
    });

    it('same-status updates (W1) write nothing', () => {
      const wi = workItem('Walls');
      patchWorkItem(wi.id, { status: 'not_started', title: 'Renamed' });
      expect(statusEvents()).toHaveLength(0);
    });
  });

  describe('D7: skipped-start default', () => {
    it('not_started -> completed with an explicit past actualEndDate sets actualStartDate to it', () => {
      const wi = workItem('Walls');
      workItemService.updateWorkItem(
        db,
        wi.id,
        { status: 'completed', actualEndDate: '2026-08-05' },
        true,
        userA,
      );
      const row = getWorkItemRow(wi.id);
      expect(row.actualEndDate).toBe('2026-08-05');
      expect(row.actualStartDate).toBe('2026-08-05');
    });
  });

  // ─── Helpers needing DB handles ─────────────────────────────────────────────

  function insertVendor(): string {
    const id = `vendor-${Math.random().toString(36).slice(2)}`;
    const now = new Date().toISOString();
    db.insert(schema.vendors)
      .values({ id, name: 'Vendor', createdBy: null, createdAt: now, updatedAt: now })
      .run();
    return id;
  }

  function setupDeposit() {
    const vendorId = insertVendor();
    const invoice = invoiceService.createInvoice(
      db,
      vendorId,
      { invoiceNumber: 'INV-D', amount: 1000, date: '2026-08-01', status: 'pending' },
      userA,
    );
    const deposit = invoiceDepositService.createDeposit(
      db,
      invoice.id,
      { amount: 300, dueDate: '2026-08-20' },
      userA,
    );
    return { invoiceId: invoice.id, depositId: deposit.id };
  }

  // keep `and` import used for event lookups
  void and;
});
