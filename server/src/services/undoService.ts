/**
 * Undo Service — in-memory snapshots for status changes (EPIC-21 story 1.3, contract 11).
 *
 * `runUndoable` wraps a synchronous service call: it snapshots the tracked columns of the
 * subject (and, for operations that auto-reschedule, of every work item and household item)
 * before and after, and issues a single-use token bound to the acting user. `applyUndo`
 * restores the "before" values unless any restored row changed since, and retracts (or
 * re-inserts) the automatic diary events the operation wrote (or retracted).
 *
 * Snapshots live in memory only; a restart drops them. They are never shared across users.
 */

import { randomBytes } from 'node:crypto';
import { eq, inArray, and } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { UNDO_WINDOW_MS } from '@cornerstone/shared';
import type { UndoResponse, UndoRow, UndoSubjectType, UndoToken } from '@cornerstone/shared';
import type * as schemaTypes from '../db/schema.js';
import {
  budgetSources,
  diaryEntries,
  householdItems,
  invoiceDeposits,
  invoices,
  milestones,
  subsidyPrograms,
  workItems,
} from '../db/schema.js';
import { ConflictError, NotFoundError } from '../errors/AppError.js';
import {
  beginCollection,
  endCollection,
  forgetEvent,
  restoreLedgerEntry,
  type RetractedEvent,
} from './statusEventLedger.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

type TrackedValues = Record<string, unknown>;

interface SubjectConfig {
  readonly table: unknown;
  readonly idColumn: unknown;
  /** Columns snapshotted and restored (drizzle property names). */
  readonly tracked: readonly string[];
  /** Subset of `tracked` whose change issues an undo token. */
  readonly statusColumns: readonly string[];
  readonly numericId?: boolean;
}

const SUBJECTS: Record<UndoSubjectType, SubjectConfig> = {
  work_item: {
    table: workItems,
    idColumn: workItems.id,
    tracked: ['status', 'startDate', 'endDate', 'actualStartDate', 'actualEndDate', 'updatedAt'],
    statusColumns: ['status', 'actualStartDate', 'actualEndDate'],
  },
  household_item: {
    table: householdItems,
    idColumn: householdItems.id,
    tracked: ['status', 'actualDeliveryDate', 'targetDeliveryDate', 'isLate', 'updatedAt'],
    statusColumns: ['status', 'actualDeliveryDate'],
  },
  milestone: {
    table: milestones,
    idColumn: milestones.id,
    tracked: ['isCompleted', 'completedAt', 'updatedAt'],
    statusColumns: ['isCompleted', 'completedAt'],
    numericId: true,
  },
  invoice: {
    table: invoices,
    idColumn: invoices.id,
    tracked: ['status', 'updatedAt'],
    statusColumns: ['status'],
  },
  invoice_deposit: {
    table: invoiceDeposits,
    idColumn: invoiceDeposits.id,
    tracked: ['status', 'paidDate', 'claimedDate', 'updatedAt'],
    statusColumns: ['status', 'paidDate', 'claimedDate'],
  },
  subsidy_program: {
    table: subsidyPrograms,
    idColumn: subsidyPrograms.id,
    tracked: ['applicationStatus', 'updatedAt'],
    statusColumns: ['applicationStatus'],
  },
  budget_source: {
    table: budgetSources,
    idColumn: budgetSources.id,
    tracked: ['status', 'updatedAt'],
    statusColumns: ['status'],
  },
  diary_entry: {
    table: diaryEntries,
    idColumn: diaryEntries.id,
    tracked: ['metadata', 'updatedAt'],
    statusColumns: ['metadata'],
  },
};

interface SnapshotRow {
  type: UndoSubjectType;
  id: string;
  before: TrackedValues;
  after: TrackedValues;
}

interface Snapshot {
  userId: string;
  createdAt: number;
  rows: SnapshotRow[];
  written: string[];
  retracted: RetractedEvent[];
}

export interface UndoStoreOptions {
  readonly now?: () => number;
  readonly maxEntries?: number;
}

export interface UndoStore {
  readonly now: () => number;
  readonly maxEntries: number;
  readonly snapshots: Map<string, Snapshot>;
}

const DEFAULT_MAX_ENTRIES = 500;

export function createUndoStore(opts: UndoStoreOptions = {}): UndoStore {
  return {
    now: opts.now ?? Date.now,
    maxEntries: opts.maxEntries ?? DEFAULT_MAX_ENTRIES,
    snapshots: new Map(),
  };
}

/** Process singleton used by the routes. */
export const undoStore: UndoStore = createUndoStore();

// ─── Row access ───────────────────────────────────────────────────────────────────────────

function pick(row: Record<string, unknown>, columns: readonly string[]): TrackedValues {
  const out: TrackedValues = {};
  for (const column of columns) out[column] = row[column] ?? null;
  return out;
}

function stable(values: TrackedValues, columns: readonly string[]): string {
  return JSON.stringify(columns.map((column) => values[column] ?? null));
}

function resolutionStatus(metadata: unknown): string | null {
  if (typeof metadata !== 'string') return null;
  try {
    const parsed = JSON.parse(metadata) as { resolutionStatus?: unknown } | null;
    return typeof parsed?.resolutionStatus === 'string' ? parsed.resolutionStatus : null;
  } catch {
    return null;
  }
}

function readSubject(db: DbType, subject: UndoRow): TrackedValues | null {
  const cfg = SUBJECTS[subject.type];
  const id = cfg.numericId ? Number(subject.id) : subject.id;
  const row = db
    .select()
    .from(cfg.table as typeof workItems)
    .where(eq(cfg.idColumn as typeof workItems.id, id as string))
    .get() as Record<string, unknown> | undefined;
  return row ? pick(row, cfg.tracked) : null;
}

/** Tracked rows keyed `type:id`, for the subject and (when rescheduling) all schedule rows. */
function readState(
  db: DbType,
  subject: UndoRow,
  reschedules: boolean,
): Map<string, SnapshotRowState> {
  const state = new Map<string, SnapshotRowState>();
  const add = (type: UndoSubjectType, id: string, values: TrackedValues): void => {
    state.set(`${type}:${id}`, { type, id, values });
  };

  const subjectValues = readSubject(db, subject);
  if (subjectValues) add(subject.type, subject.id, subjectValues);

  if (reschedules) {
    for (const row of db.select().from(workItems).all()) {
      add('work_item', row.id, pick(row, SUBJECTS.work_item.tracked));
    }
    for (const row of db.select().from(householdItems).all()) {
      add('household_item', row.id, pick(row, SUBJECTS.household_item.tracked));
    }
  }
  return state;
}

interface SnapshotRowState {
  type: UndoSubjectType;
  id: string;
  values: TrackedValues;
}

function statusValues(type: UndoSubjectType, values: TrackedValues | undefined): string {
  if (!values) return 'null';
  const cfg = SUBJECTS[type];
  if (type === 'diary_entry') return JSON.stringify(resolutionStatus(values.metadata));
  return stable(values, cfg.statusColumns);
}

// ─── runUndoable ──────────────────────────────────────────────────────────────────────────

export interface RunUndoableArgs {
  readonly userId: string;
  readonly subject: UndoRow;
  readonly reschedules: boolean;
}

/**
 * Run a synchronous service call and, when it changed a status column of the subject, store a
 * snapshot and return a single-use undo token. A throwing `fn` leaves no snapshot.
 */
export function runUndoable<T>(
  db: DbType,
  store: UndoStore,
  args: RunUndoableArgs,
  fn: () => T,
): { result: T; undo: UndoToken | null } {
  const { userId, subject, reschedules } = args;
  const before = readState(db, subject, reschedules);

  const collection = beginCollection();
  let result: T;
  try {
    result = fn();
  } finally {
    endCollection(collection);
  }

  const after = readState(db, subject, reschedules);

  const rows: SnapshotRow[] = [];
  for (const [key, afterRow] of after) {
    const beforeRow = before.get(key);
    if (!beforeRow) continue;
    const columns = SUBJECTS[afterRow.type].tracked;
    if (stable(beforeRow.values, columns) !== stable(afterRow.values, columns)) {
      rows.push({
        type: afterRow.type,
        id: afterRow.id,
        before: beforeRow.values,
        after: afterRow.values,
      });
    }
  }

  const subjectKeyStr = `${subject.type}:${subject.id}`;
  const statusChanged =
    statusValues(subject.type, before.get(subjectKeyStr)?.values) !==
    statusValues(subject.type, after.get(subjectKeyStr)?.values);
  if (!statusChanged) return { result, undo: null };

  // The subject itself is always restored, even if only its status columns differ.
  const createdAt = store.now();
  pruneExpired(store, createdAt);
  while (store.snapshots.size >= store.maxEntries) {
    const oldest = store.snapshots.keys().next().value;
    if (oldest === undefined) break;
    store.snapshots.delete(oldest);
  }

  const token = `u_${randomBytes(16).toString('hex')}`;
  store.snapshots.set(token, {
    userId,
    createdAt,
    rows,
    written: collection.written,
    retracted: collection.retracted,
  });

  return {
    result,
    undo: { token, expiresAt: new Date(createdAt + UNDO_WINDOW_MS).toISOString() },
  };
}

function pruneExpired(store: UndoStore, now: number): void {
  for (const [token, snapshot] of store.snapshots) {
    if (now - snapshot.createdAt >= UNDO_WINDOW_MS) store.snapshots.delete(token);
  }
}

// ─── applyUndo ────────────────────────────────────────────────────────────────────────────

/**
 * Restore a snapshot. The token is consumed whatever the outcome (200 or 409).
 * @throws NotFoundError for an unknown, expired, used or foreign token
 * @throws ConflictError when any snapshotted row changed since the operation
 */
export function applyUndo(
  db: DbType,
  store: UndoStore,
  token: string,
  userId: string,
): UndoResponse {
  const snapshot = store.snapshots.get(token);
  if (
    !snapshot ||
    snapshot.userId !== userId ||
    store.now() - snapshot.createdAt >= UNDO_WINDOW_MS
  ) {
    // A foreign token is left in place so it cannot be burned by another user.
    if (snapshot && snapshot.userId === userId) store.snapshots.delete(token);
    throw new NotFoundError('Undo is no longer available');
  }
  store.snapshots.delete(token);

  const changed: UndoRow[] = [];
  for (const row of snapshot.rows) {
    const current = readSubject(db, row);
    const columns = SUBJECTS[row.type].tracked;
    if (!current || stable(current, columns) !== stable(row.after, columns)) {
      changed.push({ type: row.type, id: row.id });
    }
  }
  if (changed.length > 0) {
    throw new ConflictError('The record changed after this action', { changed });
  }

  const retractedEventIds: string[] = [];
  const now = new Date().toISOString();

  db.transaction((tx) => {
    for (const row of snapshot.rows) {
      const cfg = SUBJECTS[row.type];
      const id = cfg.numericId ? Number(row.id) : row.id;
      tx.update(cfg.table as typeof workItems)
        .set({ ...row.before, updatedAt: now } as Partial<typeof workItems.$inferInsert>)
        .where(eq(cfg.idColumn as typeof workItems.id, id as string))
        .run();
    }

    if (snapshot.written.length > 0) {
      const existing = tx
        .select({ id: diaryEntries.id })
        .from(diaryEntries)
        .where(and(inArray(diaryEntries.id, snapshot.written), eq(diaryEntries.isAutomatic, true)))
        .all();
      for (const { id } of existing) retractedEventIds.push(id);
      if (existing.length > 0) {
        tx.delete(diaryEntries)
          .where(
            and(
              inArray(
                diaryEntries.id,
                existing.map((e) => e.id),
              ),
              eq(diaryEntries.isAutomatic, true),
            ),
          )
          .run();
      }
    }

    for (const { row } of snapshot.retracted) {
      tx.insert(diaryEntries)
        .values(row as typeof diaryEntries.$inferInsert)
        .onConflictDoNothing()
        .run();
    }
  });

  for (const eventId of snapshot.written) forgetEvent(eventId);
  for (const { key, entry } of snapshot.retracted) restoreLedgerEntry(key, entry);

  return {
    restored: snapshot.rows.map(({ type, id }) => ({ type, id })),
    retractedEventIds,
  };
}
