/**
 * Migration integration tests for 0047_system_event_backfill.sql (ADR-040 §5, #2223, defect D-16).
 *
 * The migration is data-only: it converts the stored English text of legacy automatic diary
 * entries into version-1 system event parameters, re-links deposit events to their invoice, never
 * deletes, never touches a manual row, and is idempotent. All fixture data is synthetic.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import {
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../migrate.js';

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url));
const TARGET_MIGRATION = '0047_system_event_backfill.sql';

/** Apply every migration sorting before TARGET_MIGRATION (derived from the real directory). */
function setupPreMigrationDb(db: Database.Database): void {
  const preFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => f < TARGET_MIGRATION);

  const tempDir = mkdtempSync(join(tmpdir(), 'cs-mig-0047-test-'));
  const symlinks: string[] = [];
  for (const file of preFiles) {
    const linkPath = join(tempDir, file);
    symlinkSync(join(MIGRATIONS_DIR, file), linkPath);
    symlinks.push(linkPath);
  }

  try {
    runMigrations(db, tempDir);
  } finally {
    for (const linkPath of symlinks) {
      if (existsSync(linkPath)) unlinkSync(linkPath);
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function targetSql(): string {
  return readFileSync(join(MIGRATIONS_DIR, TARGET_MIGRATION), 'utf-8');
}

interface Row {
  id: string;
  entry_type: string;
  entry_date: string;
  title: string | null;
  body: string;
  metadata: string | null;
  status: string;
  is_automatic: number;
  source_entity_type: string | null;
  source_entity_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const TS = '2026-03-01T10:00:00.000Z';

describe('Migration 0047: system event backfill (D-16)', () => {
  let db: Database.Database;
  let originalWarn: typeof console.warn;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    originalWarn = console.warn;
    console.warn = () => undefined;
    setupPreMigrationDb(db);
    seedReferenceRows();
  });

  afterEach(() => {
    console.warn = originalWarn;
    db.close();
  });

  // ─── Fixtures ──────────────────────────────────────────────────────────────

  function seedReferenceRows(): void {
    db.prepare(
      `INSERT INTO users (id, email, display_name, role, auth_provider, password_hash, created_at, updated_at)
       VALUES ('user-1', 'user-1@example.test', 'User One', 'member', 'local', 'x', ?, ?)`,
    ).run(TS, TS);
    db.prepare(
      `INSERT INTO vendors (id, name, created_at, updated_at) VALUES ('vendor-1', 'Company A', ?, ?)`,
    ).run(TS, TS);
    db.prepare(
      `INSERT INTO invoices (id, vendor_id, invoice_number, amount, date, status, created_at, updated_at)
       VALUES ('inv-1', 'vendor-1', 'INV-T-001', 1200, '2026-03-01', 'pending', ?, ?)`,
    ).run(TS, TS);
    db.prepare(
      `INSERT INTO invoice_deposits (id, invoice_id, amount, due_date, status, entry_type, created_at, updated_at)
       VALUES ('dep-1', 'inv-1', 300, '2026-03-05', 'paid', 'deposit', ?, ?)`,
    ).run(TS, TS);
  }

  let seq = 0;
  function entry(o: Partial<Row> & Pick<Row, 'entry_type' | 'body'>, automatic = true): string {
    seq += 1;
    const id = o.id ?? `e-${String(seq).padStart(3, '0')}`;
    db.prepare(
      `INSERT INTO diary_entries (id, entry_type, entry_date, title, body, metadata, status, is_automatic,
         source_entity_type, source_entity_id, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'saved', ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      o.entry_type,
      o.entry_date ?? '2026-03-01',
      o.title ?? null,
      o.body,
      o.metadata ?? null,
      automatic ? 1 : 0,
      o.source_entity_type ?? null,
      o.source_entity_id ?? null,
      o.created_by ?? null,
      o.created_at ?? TS,
      o.updated_at ?? TS,
    );
    return id;
  }

  function rowOf(id: string): Row {
    return db.prepare('SELECT * FROM diary_entries WHERE id = ?').get(id) as Row;
  }

  function allRows(): Row[] {
    return db.prepare('SELECT * FROM diary_entries ORDER BY id').all() as Row[];
  }

  function runTarget(): void {
    db.exec(targetSql());
  }

  /** Expected metadata text: json_object output is compact with insertion-ordered keys. */
  function json(o: Record<string, unknown>): string {
    return JSON.stringify(o);
  }

  const legacy = json({ v: 1, event: 'legacy' });

  function statusMeta(from: string | null, to: string, subject: string | null) {
    return json({ v: 1, event: 'status_changed', from, to, subjectLabel: subject });
  }

  // ─── Templates ─────────────────────────────────────────────────────────────

  describe('work item status rows', () => {
    it('v1: raw values with pre-v1 metadata take from/to from previousValue/newValue', () => {
      const id = entry({
        entry_type: 'work_item_status',
        body: '[Work Item] "Task A" status changed from not_started to in_progress',
        metadata: JSON.stringify({
          changeSummary: 'x',
          previousValue: 'not_started',
          newValue: 'in_progress',
        }),
        source_entity_type: 'work_item',
        source_entity_id: 'wi-1',
      });
      runTarget();
      expect(rowOf(id).metadata).toBe(statusMeta('not_started', 'in_progress', 'Task A'));
    });

    it('v2: labelled body with a prefix', () => {
      const id = entry({
        entry_type: 'work_item_status',
        title: 'Status changed from Not Started to In Progress',
        body: '[Work Item] "Task A" status changed from Not Started to In Progress',
        metadata: JSON.stringify({ changeSummary: 'x' }),
        source_entity_type: 'work_item',
        source_entity_id: 'wi-1',
      });
      runTarget();
      expect(rowOf(id).metadata).toBe(statusMeta('not_started', 'in_progress', 'Task A'));
    });

    it('v3: no prefix, quoted title', () => {
      const id = entry({
        entry_type: 'work_item_status',
        body: '"Task A" status changed from In Progress to Completed',
        source_entity_type: 'work_item',
        source_entity_id: 'wi-1',
      });
      runTarget();
      expect(rowOf(id).metadata).toBe(statusMeta('in_progress', 'completed', 'Task A'));
    });

    it('keeps a title with quotes inside and strips only the outer pair', () => {
      const id = entry({
        entry_type: 'work_item_status',
        body: '"Task "A" two" status changed from Not Started to Completed',
      });
      runTarget();
      expect(rowOf(id).metadata).toBe(statusMeta('not_started', 'completed', 'Task "A" two'));
    });

    it('keeps an unquoted title as is', () => {
      const id = entry({
        entry_type: 'work_item_status',
        body: 'Task A status changed from Not Started to Completed',
      });
      runTarget();
      expect(rowOf(id).metadata).toBe(statusMeta('not_started', 'completed', 'Task A'));
    });
  });

  describe('invoice status rows', () => {
    it.each([
      ['[Invoice] INV-T-001 status changed from Pending to Paid', 'pending', 'paid', 'INV-T-001'],
      ['INV-T-001 status changed from Pending to Paid', 'pending', 'paid', 'INV-T-001'],
      ['INV-T-001 status changed from pending to paid', 'pending', 'paid', 'INV-T-001'],
      ['[Invoice] INV-T-001 status changed from paid to claimed', 'paid', 'claimed', 'INV-T-001'],
      ['N/A status changed from Pending to Paid', 'pending', 'paid', null],
      ['[Invoice] N/A status changed from Paid to Claimed', 'paid', 'claimed', null],
      ['INV-T-002 status changed from Quotation to Pending', 'quotation', 'pending', 'INV-T-002'],
    ])('%s', (body, from, to, subject) => {
      const id = entry({
        entry_type: 'invoice_status',
        body,
        source_entity_type: 'invoice',
        source_entity_id: 'inv-1',
      });
      runTarget();
      expect(rowOf(id).metadata).toBe(statusMeta(from, to, subject));
    });

    it('picks the exact label pair when both spellings exist in the table (Paid vs paid)', () => {
      const a = entry({
        entry_type: 'invoice_status',
        body: 'INV-T-005 status changed from Pending to Paid',
      });
      const b = entry({
        entry_type: 'invoice_status',
        body: 'INV-T-005 status changed from pending to paid',
      });
      runTarget();
      expect(rowOf(a).metadata).toBe(statusMeta('pending', 'paid', 'INV-T-005'));
      expect(rowOf(b).metadata).toBe(statusMeta('pending', 'paid', 'INV-T-005'));
    });

    it('prefers the longest matching suffix when a subject looks like a status phrase', () => {
      const id = entry({
        entry_type: 'invoice_status',
        body: 'Final status changed from Pending to Paid status changed from Paid to Claimed',
      });
      runTarget();
      expect(rowOf(id).metadata).toBe(
        statusMeta('paid', 'claimed', 'Final status changed from Pending to Paid'),
      );
    });
  });

  describe('grant status rows', () => {
    it('first release: "changed to" with previousValue keeps from', () => {
      const id = entry({
        entry_type: 'subsidy_status',
        body: 'Subsidy: Grant A application status changed to approved',
        metadata: JSON.stringify({
          changeSummary: 'x',
          previousValue: 'applied',
          newValue: 'approved',
        }),
        source_entity_type: 'subsidy_program',
        source_entity_id: 'sub-1',
      });
      runTarget();
      expect(rowOf(id).metadata).toBe(statusMeta('applied', 'approved', 'Grant A'));
    });

    it('first release without previousValue: from is null', () => {
      const id = entry({
        entry_type: 'subsidy_status',
        body: 'Subsidy: Grant A application status changed to approved',
        metadata: JSON.stringify({ changeSummary: 'x', newValue: 'approved' }),
      });
      runTarget();
      expect(rowOf(id).metadata).toBe(statusMeta(null, 'approved', 'Grant A'));
    });

    it('first release with no metadata at all: from is null, to from the label', () => {
      const id = entry({
        entry_type: 'subsidy_status',
        body: 'Subsidy: Grant A application status changed to received',
      });
      runTarget();
      expect(rowOf(id).metadata).toBe(statusMeta(null, 'received', 'Grant A'));
    });

    it('v2: "Subsidy: " prefix with labels', () => {
      const id = entry({
        entry_type: 'subsidy_status',
        body: 'Subsidy: Grant A application status changed from Applied to Approved',
      });
      runTarget();
      expect(rowOf(id).metadata).toBe(statusMeta('applied', 'approved', 'Grant A'));
    });

    it('v3: no prefix', () => {
      const id = entry({
        entry_type: 'subsidy_status',
        body: 'Grant A application status changed from Eligible to Applied',
      });
      runTarget();
      expect(rowOf(id).metadata).toBe(statusMeta('eligible', 'applied', 'Grant A'));
    });
  });

  describe('milestone delay rows', () => {
    it('v2: "Milestone: " prefix, dates and delay days', () => {
      const id = entry({
        entry_type: 'milestone_delay',
        body: 'Milestone: Milestone A is delayed by 13 days (Target date 2026-03-01, new projected date 2026-03-14)',
        source_entity_type: 'milestone',
        source_entity_id: '7',
      });
      runTarget();
      expect(rowOf(id).metadata).toBe(
        json({
          v: 1,
          event: 'milestone_delayed',
          targetDate: '2026-03-01',
          projectedDate: '2026-03-14',
          delayDays: 13,
          subjectLabel: 'Milestone A',
        }),
      );
    });

    it('v3: no prefix', () => {
      const id = entry({
        entry_type: 'milestone_delay',
        body: 'Milestone A is delayed by 14 days (Target date 2026-03-01, new projected date 2026-03-15)',
      });
      runTarget();
      expect(rowOf(id).metadata).toBe(
        json({
          v: 1,
          event: 'milestone_delayed',
          targetDate: '2026-03-01',
          projectedDate: '2026-03-15',
          delayDays: 14,
          subjectLabel: 'Milestone A',
        }),
      );
    });

    it('delay days are derived from the dates, not the text (month boundary)', () => {
      const id = entry({
        entry_type: 'milestone_delay',
        body: 'Milestone A is delayed by 99 days (Target date 2026-02-27, new projected date 2026-03-02)',
      });
      runTarget();
      expect(JSON.parse(rowOf(id).metadata!)).toMatchObject({ delayDays: 3 });
    });

    it('the dateless form becomes legacy', () => {
      const id = entry({
        entry_type: 'milestone_delay',
        body: 'Milestone: Milestone A is delayed beyond target date',
      });
      runTarget();
      expect(rowOf(id).metadata).toBe(legacy);
    });

    it('an impossible date (2026-02-30) becomes legacy', () => {
      const id = entry({
        entry_type: 'milestone_delay',
        body: 'Milestone A is delayed by 5 days (Target date 2026-02-30, new projected date 2026-03-14)',
      });
      runTarget();
      expect(rowOf(id).metadata).toBe(legacy);
    });

    it('an impossible projected date becomes legacy', () => {
      const id = entry({
        entry_type: 'milestone_delay',
        body: 'Milestone A is delayed by 5 days (Target date 2026-03-01, new projected date 2026-13-14)',
      });
      runTarget();
      expect(rowOf(id).metadata).toBe(legacy);
    });
  });

  describe('invoice created rows', () => {
    function created(body: string, sourceId: string | null = 'inv-1'): string {
      return entry({
        entry_type: 'invoice_created',
        body,
        source_entity_type: sourceId ? 'invoice' : null,
        source_entity_id: sourceId,
      });
    }

    function createdMeta(label: string | null, vendorId: string | null, vendor: string | null) {
      return json({
        v: 1,
        event: 'invoice_created',
        subjectLabel: label,
        vendorId,
        vendorName: vendor,
      });
    }

    it.each(['[Invoice] INV-T-001 created for Company A', 'INV-T-001 created for Company A'])(
      '%s takes vendorId from the live invoice',
      (body) => {
        const id = created(body);
        runTarget();
        expect(rowOf(id).metadata).toBe(createdMeta('INV-T-001', 'vendor-1', 'Company A'));
      },
    );

    it('vendorId is null when the invoice is gone', () => {
      const id = created('INV-T-009 created for Company A', 'inv-gone');
      runTarget();
      expect(rowOf(id).metadata).toBe(createdMeta('INV-T-009', null, 'Company A'));
    });

    it('"N/A" means no invoice number', () => {
      const id = created('N/A created for Company A');
      runTarget();
      expect(rowOf(id).metadata).toBe(createdMeta(null, 'vendor-1', 'Company A'));
    });

    it('splits at the first " created for " so a vendor name may contain it', () => {
      const id = created('INV-T-001 created for Company created for Others');
      runTarget();
      expect(rowOf(id).metadata).toBe(
        createdMeta('INV-T-001', 'vendor-1', 'Company created for Others'),
      );
    });
  });

  describe('rows that fall back to legacy', () => {
    it.each([
      ['budget_breach', 'Budget category "Structure" has exceeded its planned budget'],
      ['auto_reschedule', '4 items were rescheduled'],
    ])('%s body', (entryType, body) => {
      const id = entry({ entry_type: entryType, body });
      runTarget();
      expect(rowOf(id).metadata).toBe(legacy);
    });

    it('an unknown status label', () => {
      const id = entry({
        entry_type: 'work_item_status',
        body: '"Task A" status changed from Blocked to In Progress',
      });
      runTarget();
      expect(rowOf(id).metadata).toBe(legacy);
    });

    it('an empty body', () => {
      const id = entry({ entry_type: 'work_item_status', body: '' });
      runTarget();
      expect(rowOf(id).metadata).toBe(legacy);
    });

    it('a body that is only the template suffix (no subject text before it) becomes legacy', () => {
      const id = entry({
        entry_type: 'invoice_status',
        body: ' status changed from Pending to Paid',
      });
      runTarget();
      expect(rowOf(id).metadata).toBe(legacy);
    });

    it('malformed JSON metadata does not throw and the row becomes legacy', () => {
      const id = entry({
        entry_type: 'work_item_status',
        body: 'unparseable text',
        metadata: '{not json',
      });
      expect(() => runTarget()).not.toThrow();
      expect(rowOf(id).metadata).toBe(legacy);
    });

    it('malformed JSON metadata on a parseable body is still converted from the text', () => {
      const id = entry({
        entry_type: 'work_item_status',
        body: '"Task A" status changed from Not Started to In Progress',
        metadata: '{not json',
      });
      runTarget();
      expect(rowOf(id).metadata).toBe(statusMeta('not_started', 'in_progress', 'Task A'));
    });

    it('non-object JSON metadata (an array) does not throw', () => {
      const id = entry({
        entry_type: 'work_item_status',
        body: '"Task A" status changed from Not Started to In Progress',
        metadata: '[1,2]',
      });
      expect(() => runTarget()).not.toThrow();
      expect(rowOf(id).metadata).toBe(statusMeta('not_started', 'in_progress', 'Task A'));
    });
  });

  // ─── Deposits (D-16) ───────────────────────────────────────────────────────

  describe('deposit rows are re-linked to their invoice (D-16)', () => {
    it('an existing deposit: source becomes the invoice, metadata keeps the deposit id', () => {
      const id = entry({
        entry_type: 'invoice_status',
        body: 'Deposit for invoice INV-T-001 changed from Pending to Paid',
        source_entity_type: 'invoice_deposit',
        source_entity_id: 'dep-1',
      });
      runTarget();
      const row = rowOf(id);
      expect(row.source_entity_type).toBe('invoice');
      expect(row.source_entity_id).toBe('inv-1');
      expect(row.metadata).toBe(
        json({
          v: 1,
          event: 'status_changed',
          from: 'pending',
          to: 'paid',
          subjectLabel: 'INV-T-001',
          depositId: 'dep-1',
        }),
      );
    });

    it('a deleted deposit: both source columns are NULL and the deposit id is kept', () => {
      const id = entry({
        entry_type: 'invoice_status',
        body: 'Deposit for invoice INV-T-001 changed from Paid to Claimed',
        source_entity_type: 'invoice_deposit',
        source_entity_id: 'dep-gone',
      });
      runTarget();
      const row = rowOf(id);
      expect(row.source_entity_type).toBeNull();
      expect(row.source_entity_id).toBeNull();
      expect(JSON.parse(row.metadata!)).toMatchObject({
        to: 'claimed',
        depositId: 'dep-gone',
      });
    });

    it('"N/A" deposit label means no invoice number', () => {
      const id = entry({
        entry_type: 'invoice_status',
        body: 'Deposit for invoice N/A changed from Pending to Claimed',
        source_entity_type: 'invoice_deposit',
        source_entity_id: 'dep-1',
      });
      runTarget();
      expect(JSON.parse(rowOf(id).metadata!)).toMatchObject({ subjectLabel: null });
    });

    it('an unparseable deposit body becomes legacy with the deposit id, and is re-linked', () => {
      const id = entry({
        entry_type: 'invoice_status',
        body: 'something else happened to a deposit',
        source_entity_type: 'invoice_deposit',
        source_entity_id: 'dep-1',
      });
      runTarget();
      const row = rowOf(id);
      expect(row.metadata).toBe(json({ v: 1, event: 'legacy', depositId: 'dep-1' }));
      expect(row.source_entity_type).toBe('invoice');
      expect(row.source_entity_id).toBe('inv-1');
    });

    it('a deposit body without its fixed prefix is not a deposit template: legacy with the deposit id', () => {
      const id = entry({
        entry_type: 'invoice_status',
        body: 'INV-T-001 changed from Pending to Paid',
        source_entity_type: 'invoice_deposit',
        source_entity_id: 'dep-1',
      });
      runTarget();
      expect(rowOf(id).metadata).toBe(json({ v: 1, event: 'legacy', depositId: 'dep-1' }));
    });

    it('a deposit row with a NULL source id becomes plain legacy and its type is cleared', () => {
      const id = entry({
        entry_type: 'invoice_status',
        body: 'unparseable',
        source_entity_type: 'invoice_deposit',
        source_entity_id: null,
      });
      runTarget();
      const row = rowOf(id);
      expect(row.metadata).toBe(legacy);
      expect(row.source_entity_type).toBeNull();
    });

    it('invoice rows (not deposits) keep their source', () => {
      const id = entry({
        entry_type: 'invoice_status',
        body: 'INV-T-001 status changed from Pending to Paid',
        source_entity_type: 'invoice',
        source_entity_id: 'inv-1',
      });
      runTarget();
      const row = rowOf(id);
      expect(row.source_entity_type).toBe('invoice');
      expect(row.source_entity_id).toBe('inv-1');
    });
  });

  // ─── Invariants ────────────────────────────────────────────────────────────

  describe('invariants', () => {
    function seedMixed(): void {
      entry({
        entry_type: 'work_item_status',
        body: '"Task A" status changed from Not Started to In Progress',
        title: 'Status changed from Not Started to In Progress',
        created_by: 'user-1',
        entry_date: '2026-02-20',
        created_at: '2026-02-20T08:00:00.000Z',
        updated_at: '2026-02-21T08:00:00.000Z',
      });
      entry({
        entry_type: 'invoice_status',
        body: 'Deposit for invoice INV-T-001 changed from Pending to Paid',
        source_entity_type: 'invoice_deposit',
        source_entity_id: 'dep-1',
      });
      entry({ entry_type: 'budget_breach', body: 'Over budget text' });
      entry({ entry_type: 'milestone_delay', body: 'Milestone A is delayed beyond target date' });
      entry({ entry_type: 'general_note', body: 'A manual note', metadata: null }, false);
      entry(
        {
          entry_type: 'daily_log',
          body: 'Manual log',
          title: 'Day 1',
          metadata: JSON.stringify({ weather: 'sunny', changeSummary: 'kept as is' }),
        },
        false,
      );
      entry(
        {
          entry_type: 'general_note',
          body: 'Manual note with broken metadata',
          metadata: '{not json',
        },
        false,
      );
    }

    it('deletes nothing and leaves title, body, dates and creator byte-identical', () => {
      seedMixed();
      const before = allRows();

      runTarget();

      const after = allRows();
      expect(after).toHaveLength(before.length);
      for (const row of before) {
        const next = after.find((r) => r.id === row.id)!;
        expect(next.title).toBe(row.title);
        expect(next.body).toBe(row.body);
        expect(next.entry_date).toBe(row.entry_date);
        expect(next.created_at).toBe(row.created_at);
        expect(next.updated_at).toBe(row.updated_at);
        expect(next.created_by).toBe(row.created_by);
        expect(next.entry_type).toBe(row.entry_type);
        expect(next.status).toBe(row.status);
        expect(next.is_automatic).toBe(row.is_automatic);
      }
    });

    it('leaves every manual row untouched, including malformed metadata', () => {
      seedMixed();
      const before = allRows().filter((r) => r.is_automatic === 0);
      expect(before).toHaveLength(3);

      runTarget();

      const after = allRows().filter((r) => r.is_automatic === 0);
      expect(after).toEqual(before);
    });

    it('leaves rows that already carry version-1 metadata untouched', () => {
      const v1 = entry({
        entry_type: 'work_item_status',
        body: '',
        metadata: statusMeta('not_started', 'in_progress', 'Task A'),
        source_entity_type: 'work_item',
        source_entity_id: 'wi-1',
      });
      const v1Deposit = entry({
        entry_type: 'invoice_status',
        body: '',
        metadata: json({
          v: 1,
          event: 'status_changed',
          from: 'pending',
          to: 'paid',
          subjectLabel: 'INV-T-001',
          depositId: 'dep-1',
        }),
        source_entity_type: 'invoice',
        source_entity_id: 'inv-1',
      });
      const before = [rowOf(v1), rowOf(v1Deposit)];

      runTarget();

      expect([rowOf(v1), rowOf(v1Deposit)]).toEqual(before);
    });

    it('a second run changes nothing', () => {
      seedMixed();
      runTarget();
      const afterFirst = allRows();

      runTarget();

      expect(allRows()).toEqual(afterFirst);
    });

    it('drops its helper tables', () => {
      seedMixed();
      runTarget();
      const temps = db
        .prepare("SELECT name FROM sqlite_temp_master WHERE type = 'table' AND name LIKE 'se_%'")
        .all();
      expect(temps).toEqual([]);
    });

    it('creates no persistent table and changes no schema', () => {
      const before = db
        .prepare(
          "SELECT name, sql FROM sqlite_master WHERE type IN ('table','index') ORDER BY name",
        )
        .all();
      seedMixed();
      runTarget();
      const after = db
        .prepare(
          "SELECT name, sql FROM sqlite_master WHERE type IN ('table','index') ORDER BY name",
        )
        .all();
      expect(after).toEqual(before);
    });

    it('applies on an empty diary and leaves it empty', () => {
      expect(() => runTarget()).not.toThrow();
      expect(allRows()).toEqual([]);
    });
  });

  // ─── Runner ────────────────────────────────────────────────────────────────

  describe('through the migration runner', () => {
    it('applies once, records itself and is skipped on the next start', () => {
      entry({
        entry_type: 'work_item_status',
        body: '"Task A" status changed from Not Started to In Progress',
      });

      runMigrations(db);
      const applied = db
        .prepare('SELECT name FROM _migrations WHERE name = ?')
        .all(TARGET_MIGRATION);
      expect(applied).toHaveLength(1);
      const afterFirst = allRows();
      expect(JSON.parse(afterFirst[0]!.metadata!)).toMatchObject({ v: 1, event: 'status_changed' });

      // Manually reset a row; a skipped migration must not convert it again
      db.prepare('UPDATE diary_entries SET metadata = NULL').run();
      runMigrations(db);
      expect(allRows()[0]!.metadata).toBeNull();
    });
  });
});
