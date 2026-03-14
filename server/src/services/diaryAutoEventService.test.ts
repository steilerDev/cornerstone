/**
 * Unit tests for diaryAutoEventService.ts
 *
 * EPIC-13: Construction Diary — Story #808
 * Tests all 6 event functions and fire-and-forget behavior.
 * Uses a real in-memory SQLite DB with migrations.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { diaryEntries } from '../db/schema.js';
import {
  onWorkItemStatusChanged,
  onInvoiceStatusChanged,
  onMilestoneDelayed,
  onBudgetCategoryOverspend,
  onAutoRescheduleCompleted,
  onSubsidyStatusChanged,
} from './diaryAutoEventService.js';
// diaryService is imported internally by diaryAutoEventService — not needed here

// Suppress migration logs
beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('diaryAutoEventService', () => {
  let db: BetterSQLite3Database<typeof schema>;
  let sqlite: ReturnType<typeof Database>;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'diary-auto-event-test-'));
    const dbPath = join(tempDir, 'test.db');
    sqlite = new Database(dbPath);
    runMigrations(sqlite, undefined);
    db = drizzle(sqlite, { schema });
  });

  afterEach(() => {
    sqlite.close();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
    jest.restoreAllMocks();
  });

  // ─── Helper: query all diary entries directly ─────────────────────────────

  function getAllEntries() {
    return db.select().from(diaryEntries).all();
  }

  // ─── onWorkItemStatusChanged ───────────────────────────────────────────────

  describe('onWorkItemStatusChanged', () => {
    it('creates a diary entry when enabled=true', () => {
      onWorkItemStatusChanged(
        db,
        true,
        'wi-test-001',
        'Foundation Work',
        'not_started',
        'in_progress',
      );

      const entries = getAllEntries();
      expect(entries).toHaveLength(1);

      const entry = entries[0];
      expect(entry.entryType).toBe('work_item_status');
      expect(entry.isAutomatic).toBe(true);
      expect(entry.sourceEntityType).toBe('work_item');
      expect(entry.sourceEntityId).toBe('wi-test-001');
      expect(entry.createdBy).toBeNull();
      expect(entry.body).toContain('Foundation Work');
      expect(entry.body).toContain('not_started');
      expect(entry.body).toContain('in_progress');
    });

    it('does not create a diary entry when enabled=false', () => {
      onWorkItemStatusChanged(
        db,
        false,
        'wi-test-002',
        'Roof Installation',
        'in_progress',
        'completed',
      );

      const entries = getAllEntries();
      expect(entries).toHaveLength(0);
    });

    it('stores metadata with previousValue and newValue', () => {
      onWorkItemStatusChanged(
        db,
        true,
        'wi-test-003',
        'Electrical Wiring',
        'not_started',
        'completed',
      );

      const entries = getAllEntries();
      expect(entries).toHaveLength(1);

      const metadata = JSON.parse(entries[0].metadata ?? 'null');
      expect(metadata).not.toBeNull();
      expect(metadata.previousValue).toBe('not_started');
      expect(metadata.newValue).toBe('completed');
      expect(typeof metadata.changeSummary).toBe('string');
    });
  });

  // ─── onInvoiceStatusChanged ────────────────────────────────────────────────

  describe('onInvoiceStatusChanged', () => {
    it('creates a diary entry with entryType=invoice_status, body contains invoice number', () => {
      onInvoiceStatusChanged(
        db,
        true,
        'inv-001',
        'INV-2026-042',
        'pending',
        'paid',
      );

      const entries = getAllEntries();
      expect(entries).toHaveLength(1);

      const entry = entries[0];
      expect(entry.entryType).toBe('invoice_status');
      expect(entry.isAutomatic).toBe(true);
      expect(entry.sourceEntityType).toBe('invoice');
      expect(entry.sourceEntityId).toBe('inv-001');
      expect(entry.body).toContain('INV-2026-042');
      expect(entry.body).toContain('pending');
      expect(entry.body).toContain('paid');
    });

    it('body uses invoiceNumber param (even if empty string, shows N/A)', () => {
      // When invoiceNumber is empty string, the service uses 'N/A' per the template
      onInvoiceStatusChanged(
        db,
        true,
        'inv-002',
        '',
        'pending',
        'claimed',
      );

      const entries = getAllEntries();
      expect(entries).toHaveLength(1);

      // Empty string is falsy, so template renders 'N/A'
      expect(entries[0].body).toContain('N/A');
    });

    it('stores metadata with previousValue, newValue, and changeSummary', () => {
      onInvoiceStatusChanged(
        db,
        true,
        'inv-003',
        'INV-2026-100',
        'pending',
        'paid',
      );

      const entries = getAllEntries();
      expect(entries).toHaveLength(1);
      const metadata = JSON.parse(entries[0].metadata ?? 'null');
      expect(metadata.previousValue).toBe('pending');
      expect(metadata.newValue).toBe('paid');
      expect(metadata.changeSummary).toContain('pending');
      expect(metadata.changeSummary).toContain('paid');
    });

    it('does not create entry when enabled=false', () => {
      onInvoiceStatusChanged(db, false, 'inv-004', 'INV-999', 'pending', 'paid');
      expect(getAllEntries()).toHaveLength(0);
    });
  });

  // ─── onMilestoneDelayed ────────────────────────────────────────────────────

  describe('onMilestoneDelayed', () => {
    it('creates a diary entry with entryType=milestone_delay, body contains milestone name', () => {
      onMilestoneDelayed(db, true, 42, 'Foundation Complete');

      const entries = getAllEntries();
      expect(entries).toHaveLength(1);

      const entry = entries[0];
      expect(entry.entryType).toBe('milestone_delay');
      expect(entry.isAutomatic).toBe(true);
      expect(entry.sourceEntityType).toBe('milestone');
      expect(entry.sourceEntityId).toBe('42');
      expect(entry.body).toContain('Foundation Complete');
    });

    it('converts milestoneId (number) to string for sourceEntityId', () => {
      onMilestoneDelayed(db, true, 999, 'Roof Complete');

      const entries = getAllEntries();
      expect(entries[0].sourceEntityId).toBe('999');
    });

    it('does not create entry when enabled=false', () => {
      onMilestoneDelayed(db, false, 1, 'Some Milestone');
      expect(getAllEntries()).toHaveLength(0);
    });
  });

  // ─── onBudgetCategoryOverspend ─────────────────────────────────────────────

  describe('onBudgetCategoryOverspend', () => {
    it('creates a diary entry with entryType=budget_breach, body contains category name', () => {
      onBudgetCategoryOverspend(db, true, 'bc-structural', 'Structural Work');

      const entries = getAllEntries();
      expect(entries).toHaveLength(1);

      const entry = entries[0];
      expect(entry.entryType).toBe('budget_breach');
      expect(entry.isAutomatic).toBe(true);
      expect(entry.sourceEntityType).toBe('budget_source');
      expect(entry.sourceEntityId).toBe('bc-structural');
      expect(entry.body).toContain('Structural Work');
    });

    it('does not create entry when enabled=false', () => {
      onBudgetCategoryOverspend(db, false, 'bc-electrical', 'Electrical');
      expect(getAllEntries()).toHaveLength(0);
    });
  });

  // ─── onAutoRescheduleCompleted ─────────────────────────────────────────────

  describe('onAutoRescheduleCompleted', () => {
    it('creates a diary entry with entryType=auto_reschedule when count > 0', () => {
      onAutoRescheduleCompleted(db, true, 5);

      const entries = getAllEntries();
      expect(entries).toHaveLength(1);

      const entry = entries[0];
      expect(entry.entryType).toBe('auto_reschedule');
      expect(entry.isAutomatic).toBe(true);
      expect(entry.sourceEntityType).toBeNull();
      expect(entry.sourceEntityId).toBeNull();
      expect(entry.body).toContain('5');
      expect(entry.body).toContain('updated');
    });

    it('stores metadata with itemCount equal to updatedCount', () => {
      onAutoRescheduleCompleted(db, true, 3);

      const entries = getAllEntries();
      const metadata = JSON.parse(entries[0].metadata ?? 'null');
      expect(metadata.itemCount).toBe(3);
    });

    it('does not create entry when count = 0', () => {
      onAutoRescheduleCompleted(db, true, 0);
      expect(getAllEntries()).toHaveLength(0);
    });

    it('does not create entry when enabled=false, even when count > 0', () => {
      onAutoRescheduleCompleted(db, false, 10);
      expect(getAllEntries()).toHaveLength(0);
    });
  });

  // ─── onSubsidyStatusChanged ────────────────────────────────────────────────

  describe('onSubsidyStatusChanged', () => {
    it('creates a diary entry with entryType=subsidy_status, body contains subsidy name', () => {
      onSubsidyStatusChanged(
        db,
        true,
        'sub-kfw-001',
        'KfW Energy Grant',
        'applied',
        'approved',
      );

      const entries = getAllEntries();
      expect(entries).toHaveLength(1);

      const entry = entries[0];
      expect(entry.entryType).toBe('subsidy_status');
      expect(entry.isAutomatic).toBe(true);
      expect(entry.sourceEntityType).toBe('subsidy_program');
      expect(entry.sourceEntityId).toBe('sub-kfw-001');
      expect(entry.body).toContain('KfW Energy Grant');
      expect(entry.body).toContain('approved');
    });

    it('stores metadata with previousValue, newValue, and changeSummary', () => {
      onSubsidyStatusChanged(
        db,
        true,
        'sub-bafa-002',
        'BAFA Insulation Subsidy',
        'applied',
        'received',
      );

      const entries = getAllEntries();
      const metadata = JSON.parse(entries[0].metadata ?? 'null');
      expect(metadata.previousValue).toBe('applied');
      expect(metadata.newValue).toBe('received');
      expect(typeof metadata.changeSummary).toBe('string');
    });

    it('does not create entry when enabled=false', () => {
      onSubsidyStatusChanged(db, false, 'sub-001', 'Grant', 'applied', 'approved');
      expect(getAllEntries()).toHaveLength(0);
    });
  });

  // ─── Fire-and-forget behavior ──────────────────────────────────────────────

  describe('fire-and-forget behavior', () => {
    it('does not propagate errors and warns via console.warn when DB write fails', () => {
      // Restore the suppress-all spy and replace with one that captures calls
      jest.restoreAllMocks();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      // Close the database to force an error in createAutomaticDiaryEntry
      sqlite.close();

      // Calling any event function must NOT throw even with a broken DB
      expect(() => {
        onWorkItemStatusChanged(db, true, 'wi-fail', 'Failing WI', 'not_started', 'in_progress');
      }).not.toThrow();

      // console.warn must have been called with the failure info
      expect(warnSpy).toHaveBeenCalled();
      const firstCallArgs = warnSpy.mock.calls[0];
      expect(firstCallArgs[0]).toContain('[diaryAutoEvent]');
    });
  });
});
