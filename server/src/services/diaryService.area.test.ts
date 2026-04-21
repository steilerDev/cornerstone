/**
 * Tests for sourceEntityArea enrichment in diaryService (Issues #1271-#1273).
 *
 * Verifies that listDiaryEntries, getDiaryEntry, updateDiaryEntry correctly
 * populate sourceEntityArea via loadAreaMap + getAreaWithAncestors for
 * work_item-sourced entries, and return null for all other source types.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { getDiaryEntry, listDiaryEntries, updateDiaryEntry } from './diaryService.js';

// ─── DB setup ─────────────────────────────────────────────────────────────────

describe('diaryService — sourceEntityArea enrichment', () => {
  let db: BetterSQLite3Database<typeof schema>;
  let sqlite: ReturnType<typeof Database>;
  let tempDir: string;
  let testUserId: string;
  let idCounter = 0;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'diary-area-test-'));
    const dbPath = join(tempDir, 'test.db');
    sqlite = new Database(dbPath);
    runMigrations(sqlite, undefined);
    db = drizzle(sqlite, { schema });

    idCounter = 0;

    testUserId = 'user-diary-area-01';
    const now = new Date().toISOString();
    db.insert(schema.users)
      .values({
        id: testUserId,
        email: 'diary-area@test.com',
        displayName: 'Area Tester',
        role: 'member',
        authProvider: 'local',
        passwordHash: 'hash',
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });

  afterEach(() => {
    sqlite.close();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function makeId(prefix: string): string {
    idCounter++;
    return `${prefix}-area-test-${idCounter}`;
  }

  function insertArea(opts: {
    name: string;
    parentId?: string | null;
    color?: string | null;
  }): string {
    const id = makeId('area');
    const now = new Date().toISOString();
    db.insert(schema.areas)
      .values({
        id,
        name: opts.name,
        parentId: opts.parentId ?? null,
        color: opts.color ?? null,
        sortOrder: idCounter,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertWorkItem(
    opts: {
      title?: string;
      areaId?: string | null;
    } = {},
  ): string {
    const id = makeId('wi');
    const now = new Date().toISOString();
    db.insert(schema.workItems)
      .values({
        id,
        title: opts.title ?? 'Test Work Item',
        status: 'not_started',
        createdBy: testUserId,
        createdAt: now,
        updatedAt: now,
        areaId: opts.areaId ?? null,
        startDate: null,
        endDate: null,
        durationDays: null,
        startAfter: null,
        startBefore: null,
        assignedUserId: null,
        assignedVendorId: null,
      })
      .run();
    return id;
  }

  function insertVendor(): string {
    const id = makeId('vendor');
    const now = new Date().toISOString();
    db.insert(schema.vendors)
      .values({
        id,
        name: 'Test Vendor',
        tradeId: null,
        phone: null,
        email: null,
        address: null,
        notes: null,
        createdBy: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertInvoice(vendorId: string): string {
    const id = makeId('invoice');
    const now = new Date().toISOString();
    db.insert(schema.invoices)
      .values({
        id,
        vendorId,
        invoiceNumber: 'INV-001',
        amount: 1000,
        date: '2026-01-15',
        dueDate: null,
        status: 'pending',
        notes: null,
        createdBy: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  let entryOffset = 0;

  function insertDiaryEntry(
    opts: {
      sourceEntityType?: string | null;
      sourceEntityId?: string | null;
      entryDate?: string;
    } = {},
  ): string {
    entryOffset++;
    const id = `diary-area-${Date.now()}-${entryOffset}`;
    const now = new Date(Date.now() + entryOffset).toISOString();
    db.insert(schema.diaryEntries)
      .values({
        id,
        entryType: 'daily_log',
        entryDate: opts.entryDate ?? '2026-03-14',
        title: 'Test Entry',
        body: 'Test body',
        metadata: null,
        isAutomatic: false,
        sourceEntityType: opts.sourceEntityType ?? null,
        sourceEntityId: opts.sourceEntityId ?? null,
        createdBy: testUserId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  // ─── getDiaryEntry tests ───────────────────────────────────────────────────

  describe('getDiaryEntry', () => {
    it('work_item source with area → sourceEntityArea has correct id, name, color, empty ancestors', () => {
      const areaId = insertArea({ name: 'Kitchen', color: '#ff0000' });
      const wiId = insertWorkItem({ areaId });
      const entryId = insertDiaryEntry({ sourceEntityType: 'work_item', sourceEntityId: wiId });

      const result = getDiaryEntry(db, entryId);

      expect(result.sourceEntityArea).not.toBeNull();
      expect(result.sourceEntityArea!.id).toBe(areaId);
      expect(result.sourceEntityArea!.name).toBe('Kitchen');
      expect(result.sourceEntityArea!.color).toBe('#ff0000');
      expect(result.sourceEntityArea!.ancestors).toEqual([]);
    });

    it('work_item source with no area → sourceEntityArea is null', () => {
      const wiId = insertWorkItem({ areaId: null });
      const entryId = insertDiaryEntry({ sourceEntityType: 'work_item', sourceEntityId: wiId });

      const result = getDiaryEntry(db, entryId);

      expect(result.sourceEntityArea).toBeNull();
    });

    it('invoice source → sourceEntityArea is null', () => {
      const vendorId = insertVendor();
      const invoiceId = insertInvoice(vendorId);
      const entryId = insertDiaryEntry({ sourceEntityType: 'invoice', sourceEntityId: invoiceId });

      const result = getDiaryEntry(db, entryId);

      expect(result.sourceEntityArea).toBeNull();
    });

    it('no source (manual entry, sourceEntityType: null) → sourceEntityArea is null', () => {
      const entryId = insertDiaryEntry({ sourceEntityType: null, sourceEntityId: null });

      const result = getDiaryEntry(db, entryId);

      expect(result.sourceEntityArea).toBeNull();
    });

    it('work_item in child area with root ancestor → ancestors[0]!.name equals root area name', () => {
      const rootAreaId = insertArea({ name: 'Ground Floor', color: '#aabbcc' });
      const childAreaId = insertArea({ name: 'Kitchen', parentId: rootAreaId });
      const wiId = insertWorkItem({ areaId: childAreaId });
      const entryId = insertDiaryEntry({ sourceEntityType: 'work_item', sourceEntityId: wiId });

      const result = getDiaryEntry(db, entryId);

      expect(result.sourceEntityArea).not.toBeNull();
      expect(result.sourceEntityArea!.id).toBe(childAreaId);
      expect(result.sourceEntityArea!.name).toBe('Kitchen');
      expect(result.sourceEntityArea!.ancestors).toHaveLength(1);
      expect(result.sourceEntityArea!.ancestors[0]!.name).toBe('Ground Floor');
      expect(result.sourceEntityArea!.ancestors[0]!.id).toBe(rootAreaId);
    });
  });

  // ─── listDiaryEntries tests ────────────────────────────────────────────────

  describe('listDiaryEntries', () => {
    it('mixed entries return correct sourceEntityArea per entry', () => {
      const areaId = insertArea({ name: 'Bathroom' });
      const wiWithArea = insertWorkItem({ areaId });
      const wiNoArea = insertWorkItem({ areaId: null });

      insertDiaryEntry({
        sourceEntityType: 'work_item',
        sourceEntityId: wiWithArea,
        entryDate: '2026-03-16',
      });
      insertDiaryEntry({
        sourceEntityType: 'work_item',
        sourceEntityId: wiNoArea,
        entryDate: '2026-03-15',
      });
      insertDiaryEntry({
        sourceEntityType: null,
        sourceEntityId: null,
        entryDate: '2026-03-14',
      });

      const result = listDiaryEntries(db, {});
      expect(result.items).toHaveLength(3);

      // The entry with area
      const entryWithArea = result.items.find((e) => e.sourceEntityArea !== null);
      expect(entryWithArea).toBeDefined();
      expect(entryWithArea!.sourceEntityArea!.id).toBe(areaId);
      expect(entryWithArea!.sourceEntityArea!.name).toBe('Bathroom');

      // The remaining two entries should have null sourceEntityArea
      const entriesWithoutArea = result.items.filter((e) => e.sourceEntityArea === null);
      expect(entriesWithoutArea).toHaveLength(2);
    });
  });

  // ─── updateDiaryEntry tests ────────────────────────────────────────────────

  describe('updateDiaryEntry', () => {
    it('sourceEntityArea preserved after body update', () => {
      const areaId = insertArea({ name: 'Living Room' });
      const wiId = insertWorkItem({ areaId });
      const entryId = insertDiaryEntry({ sourceEntityType: 'work_item', sourceEntityId: wiId });

      const updated = updateDiaryEntry(db, entryId, { body: 'Updated body text' });

      expect(updated.sourceEntityArea).not.toBeNull();
      expect(updated.sourceEntityArea!.id).toBe(areaId);
      expect(updated.sourceEntityArea!.name).toBe('Living Room');
    });
  });
});
