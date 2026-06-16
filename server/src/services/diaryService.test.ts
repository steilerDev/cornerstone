/**
 * Unit tests for diaryService.ts
 *
 * EPIC-13: Construction Diary — Story #803
 * Tests all public functions: listDiaryEntries, getDiaryEntry, createDiaryEntry,
 * updateDiaryEntry, deleteDiaryEntry, createAutomaticDiaryEntry.
 * Also tests metadata validation for each entry type.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { users, diaryEntries, photos } from '../db/schema.js';
import {
  listDiaryEntries,
  getDiaryEntry,
  createDiaryEntry,
  updateDiaryEntry,
  deleteDiaryEntry,
  createAutomaticDiaryEntry,
  promoteDiaryEntry,
  findOrphanDraftIds,
} from './diaryService.js';
import {
  NotFoundError,
  ValidationError,
  InvalidMetadataError,
  ImmutableEntryError,
  InvalidEntryTypeError,
  AlreadySavedError,
} from '../errors/AppError.js';
import type { CreateDiaryEntryRequest, UpdateDiaryEntryRequest } from '@cornerstone/shared';
import { workItems, invoices, milestones, vendors } from '../db/schema.js';

// Local alias so tests can inspect vendorId/vendorName from metadata without
// importing DailyLogMetadata twice (already imported by the production module).
type DailyLogMetadataTest = {
  vendorId?: string | null;
  vendorName?: string | null;
  workStart?: string | null;
  workEnd?: string | null;
  weather?: string | null;
  workersOnSite?: number | null;
};

describe('diaryService', () => {
  let db: BetterSQLite3Database<typeof schema>;
  let sqlite: ReturnType<typeof Database>;
  let tempDir: string;
  let testUserId: string;
  let photoStoragePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'diary-svc-test-'));
    photoStoragePath = join(tempDir, 'photos');
    const dbPath = join(tempDir, 'test.db');
    sqlite = new Database(dbPath);
    runMigrations(sqlite, undefined);
    db = drizzle(sqlite, { schema });

    // Insert a test user
    testUserId = 'user-test-diary-01';
    const now = new Date().toISOString();
    db.insert(users)
      .values({
        id: testUserId,
        email: 'diary@test.com',
        displayName: 'Diary Tester',
        role: 'member',
        authProvider: 'local',
        passwordHash: 'hash',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // Reset timestamp offset for each test to ensure unique entry IDs/timestamps
    entryTimestampOffset = 0;
  });

  afterEach(() => {
    sqlite.close();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  // ─── Helper: insert a diary entry directly ─────────────────────────────────

  let entryTimestampOffset = 0;

  function insertEntry(overrides: Partial<typeof diaryEntries.$inferInsert> = {}): string {
    entryTimestampOffset += 1;
    const id = `diary-${Date.now()}-${entryTimestampOffset}`;
    const now = new Date(Date.now() + entryTimestampOffset).toISOString();
    db.insert(diaryEntries)
      .values({
        id,
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        title: 'Test Entry',
        body: 'Test body content',
        metadata: null,
        isAutomatic: false,
        sourceEntityType: null,
        sourceEntityId: null,
        createdBy: testUserId,
        createdAt: now,
        updatedAt: now,
        ...overrides,
      })
      .run();
    return id;
  }

  // ─── listDiaryEntries ──────────────────────────────────────────────────────

  describe('listDiaryEntries', () => {
    it('returns empty result with correct pagination when DB is empty', () => {
      const result = listDiaryEntries(db, {});
      expect(result.items).toEqual([]);
      expect(result.pagination).toEqual({
        page: 1,
        pageSize: 50,
        totalItems: 0,
        totalPages: 0,
      });
    });

    it('returns entries ordered by entry_date DESC then created_at DESC', () => {
      const id1 = insertEntry({ entryDate: '2026-01-01', body: 'First date' });
      const id2 = insertEntry({ entryDate: '2026-03-15', body: 'Latest date' });
      const id3 = insertEntry({ entryDate: '2026-02-10', body: 'Middle date' });

      const result = listDiaryEntries(db, {});
      expect(result.items).toHaveLength(3);
      expect(result.items[0]!.id).toBe(id2); // 2026-03-15 first
      expect(result.items[1]!.id).toBe(id3); // 2026-02-10 second
      expect(result.items[2]!.id).toBe(id1); // 2026-01-01 last
    });

    it('filters by type when type is provided', () => {
      insertEntry({ entryType: 'daily_log' });
      const visitId = insertEntry({ entryType: 'site_visit' });
      insertEntry({ entryType: 'issue' });

      const result = listDiaryEntries(db, { type: 'site_visit' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe(visitId);
      expect(result.items[0]!.entryType).toBe('site_visit');
    });

    it('filters by dateFrom and dateTo range', () => {
      insertEntry({ entryDate: '2025-12-31' });
      const inRangeId = insertEntry({ entryDate: '2026-01-15' });
      insertEntry({ entryDate: '2026-02-28' });

      const result = listDiaryEntries(db, { dateFrom: '2026-01-01', dateTo: '2026-01-31' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe(inRangeId);
    });

    it('returns only automatic entries when automatic=true', () => {
      insertEntry({ isAutomatic: false });
      const autoId = insertEntry({
        isAutomatic: true,
        entryType: 'work_item_status',
        createdBy: null,
      });

      const result = listDiaryEntries(db, { automatic: true });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe(autoId);
      expect(result.items[0]!.isAutomatic).toBe(true);
    });

    it('returns only manual entries when automatic=false', () => {
      const manualId = insertEntry({ isAutomatic: false });
      insertEntry({ isAutomatic: true, entryType: 'work_item_status', createdBy: null });

      const result = listDiaryEntries(db, { automatic: false });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe(manualId);
      expect(result.items[0]!.isAutomatic).toBe(false);
    });

    it('searches title and body case-insensitively using q filter', () => {
      insertEntry({ title: 'Daily work update', body: 'Nothing special here' });
      const matchId = insertEntry({ title: 'Foundation Check', body: 'The CONCRETE looks good' });
      insertEntry({ title: 'Delivery arrived', body: 'Bricks delivered' });

      const result = listDiaryEntries(db, { q: 'concrete' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe(matchId);
    });

    it('escapes SQL LIKE wildcards in q filter', () => {
      // Entries that should NOT match when searching for literal '%'
      insertEntry({ title: 'Normal entry', body: 'No special chars' });
      const matchId = insertEntry({ title: '50% done', body: 'Halfway there' });

      const result = listDiaryEntries(db, { q: '50%' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe(matchId);
    });

    it('returns photoCount=1 for an entry with one photo after batch query refactor', () => {
      const id = insertEntry({ title: 'Entry with a photo' });
      const now = new Date().toISOString();
      db.insert(photos)
        .values({
          id: `photo-test-${Date.now()}`,
          entityType: 'diary_entry',
          entityId: id,
          filename: 'photo.jpg',
          originalFilename: 'photo.jpg',
          mimeType: 'image/jpeg',
          fileSize: 1024,
          width: 800,
          height: 600,
          takenAt: null,
          caption: null,
          sortOrder: 0,
          createdBy: testUserId,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const result = listDiaryEntries(db, {});
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe(id);
      expect(result.items[0]!.photoCount).toBe(1);
    });

    it('returns correct offset for page 2', () => {
      // Insert 3 entries; page 2 with pageSize 2 should return 1
      const oldestId = insertEntry({ entryDate: '2026-01-01' });
      insertEntry({ entryDate: '2026-01-02' });
      insertEntry({ entryDate: '2026-01-03' });

      // DESC order: 03, 02, 01 → page 1 has 03+02, page 2 has 01
      const result = listDiaryEntries(db, { page: 2, pageSize: 2 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe(oldestId); // Oldest entry on page 2
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.pageSize).toBe(2);
      expect(result.pagination.totalItems).toBe(3);
      expect(result.pagination.totalPages).toBe(2);
    });
  });

  // ─── getDiaryEntry ─────────────────────────────────────────────────────────

  describe('getDiaryEntry', () => {
    it('returns the entry with photoCount=0', () => {
      const id = insertEntry({ title: 'My Entry', body: 'Body content' });

      const result = getDiaryEntry(db, id);
      expect(result.id).toBe(id);
      expect(result.title).toBe('My Entry');
      expect(result.body).toBe('Body content');
      expect(result.photoCount).toBe(0);
      expect(result.createdBy).not.toBeNull();
      expect(result.createdBy?.id).toBe(testUserId);
      expect(result.createdBy?.displayName).toBe('Diary Tester');
    });

    it('throws NotFoundError for unknown ID', () => {
      expect(() => getDiaryEntry(db, 'nonexistent-id')).toThrow(NotFoundError);
    });
  });

  // ─── createDiaryEntry ──────────────────────────────────────────────────────

  describe('createDiaryEntry', () => {
    it('creates entry with all fields and returns DiaryEntrySummary with isAutomatic=false', () => {
      const request: CreateDiaryEntryRequest = {
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        title: 'Day 42',
        body: 'Concrete poured for foundations.',
        metadata: { weather: 'sunny', workersOnSite: 5 },
      };

      const result = createDiaryEntry(db, testUserId, request);
      expect(result.id).toBeDefined();
      expect(result.entryType).toBe('daily_log');
      expect(result.entryDate).toBe('2026-03-14');
      expect(result.title).toBe('Day 42');
      expect(result.body).toBe('Concrete poured for foundations.');
      expect(result.isAutomatic).toBe(false);
      expect(result.sourceEntityType).toBeNull();
      expect(result.sourceEntityId).toBeNull();
      expect(result.photoCount).toBe(0);
      expect(result.createdBy?.id).toBe(testUserId);
    });

    it('throws InvalidEntryTypeError when entryType is work_item_status', () => {
      const request = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Invalid entryType for test
        entryType: 'work_item_status' as any,
        entryDate: '2026-03-14',
        body: 'System entry',
      };
      expect(() => createDiaryEntry(db, testUserId, request)).toThrow(InvalidEntryTypeError);
    });

    it('throws ValidationError when body is empty string', () => {
      const request: CreateDiaryEntryRequest = {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: '   ',
      };
      expect(() => createDiaryEntry(db, testUserId, request)).toThrow(ValidationError);
    });

    it('throws InvalidMetadataError for invalid daily_log metadata (weather: tornado)', () => {
      const request: CreateDiaryEntryRequest = {
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        body: 'Stormy day',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Intentionally invalid metadata for test
        metadata: { weather: 'tornado' } as any,
      };
      expect(() => createDiaryEntry(db, testUserId, request)).toThrow(InvalidMetadataError);
    });

    it('accepts null metadata without error', () => {
      const request: CreateDiaryEntryRequest = {
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        body: 'No metadata today',
        metadata: null,
      };
      const result = createDiaryEntry(db, testUserId, request);
      expect(result.metadata).toBeNull();
    });

    it('stores metadata as JSON and returns it parsed', () => {
      const metadata = { weather: 'sunny', workersOnSite: 3 };
      const request: CreateDiaryEntryRequest = {
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        body: 'Good progress',
        metadata,
      };
      const result = createDiaryEntry(db, testUserId, request);
      expect(result.metadata).toEqual(metadata);
    });

    it('throws ValidationError when metadata exceeds 2MB when serialized', () => {
      // Build metadata whose JSON.stringify length > 2_097_152
      const request: CreateDiaryEntryRequest = {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: 'Oversized metadata',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Intentionally invalid metadata for test
        metadata: { data: 'x'.repeat(2_097_153) } as any,
      };
      expect(() => createDiaryEntry(db, testUserId, request)).toThrow(ValidationError);
    });

    it('accepts metadata at exactly 2MB when serialized', () => {
      // {"data":"..."} — key+quotes+colon+quotes = 10 chars, so value length = 2_097_152 - 10 = 2_097_142
      const prefix = '{"data":"';
      const suffix = '"}';
      const valueLen = 2_097_152 - prefix.length - suffix.length;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Intentionally invalid metadata for test
      const metadata = { data: 'x'.repeat(valueLen) } as any;
      expect(JSON.stringify(metadata).length).toBe(2_097_152);
      const request: CreateDiaryEntryRequest = {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: 'Boundary metadata',
        metadata,
      };
      const result = createDiaryEntry(db, testUserId, request);
      expect(result.id).toBeDefined();
    });
  });

  // ─── updateDiaryEntry ──────────────────────────────────────────────────────

  describe('updateDiaryEntry', () => {
    it('updates title, body, entryDate, and metadata; updatedAt advances', () => {
      const originalUpdatedAt = new Date(Date.now() - 5000).toISOString();
      const id = insertEntry({
        title: 'Old Title',
        body: 'Old body',
        entryDate: '2026-01-01',
        metadata: null,
        updatedAt: originalUpdatedAt,
      });

      const updateRequest: UpdateDiaryEntryRequest = {
        title: 'New Title',
        body: 'New body content',
        entryDate: '2026-03-14',
        metadata: { weather: 'cloudy' },
      };

      const result = updateDiaryEntry(db, id, updateRequest);
      expect(result.title).toBe('New Title');
      expect(result.body).toBe('New body content');
      expect(result.entryDate).toBe('2026-03-14');
      expect(result.metadata).toEqual({ weather: 'cloudy' });
      // updatedAt should be newer than the original value
      expect(result.updatedAt > originalUpdatedAt).toBe(true);
    });

    it('throws NotFoundError for unknown ID', () => {
      expect(() => updateDiaryEntry(db, 'does-not-exist', { body: 'Updated' })).toThrow(
        NotFoundError,
      );
    });

    it('throws ImmutableEntryError with statusCode 403 for an automatic entry', () => {
      const id = insertEntry({
        isAutomatic: true,
        entryType: 'work_item_status',
        createdBy: null,
      });
      let thrown: unknown;
      try {
        updateDiaryEntry(db, id, { body: 'Should fail' });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(ImmutableEntryError);
      expect((thrown as ImmutableEntryError).statusCode).toBe(403);
    });

    it('throws InvalidMetadataError for invalid metadata on update', () => {
      const id = insertEntry({ entryType: 'site_visit' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Intentionally invalid metadata for test
      expect(() => updateDiaryEntry(db, id, { metadata: { outcome: 'maybe' } as any })).toThrow(
        InvalidMetadataError,
      );
    });

    it('setting metadata to null clears it', () => {
      const id = insertEntry({
        metadata: JSON.stringify({ weather: 'sunny' }),
      });

      const result = updateDiaryEntry(db, id, { metadata: null });
      // When metadata is null, JSON.stringify(null) = 'null'; parseMetadata returns null for falsy
      // The service stores JSON.stringify(null) = 'null' — which parses back to null (falsy check)
      expect(result.metadata).toBeNull();
    });

    it('throws ValidationError when metadata exceeds 2MB when serialized', () => {
      const id = insertEntry({ entryType: 'general_note' });
      expect(() =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Intentionally invalid metadata for test
        updateDiaryEntry(db, id, { metadata: { data: 'x'.repeat(2_097_153) } as any }),
      ).toThrow(ValidationError);
    });
  });

  // ─── deleteDiaryEntry ──────────────────────────────────────────────────────

  describe('deleteDiaryEntry', () => {
    it('deletes entry; subsequent getDiaryEntry throws NotFoundError', async () => {
      const id = insertEntry();
      await deleteDiaryEntry(db, id, photoStoragePath);
      expect(() => getDiaryEntry(db, id)).toThrow(NotFoundError);
    });

    it('throws NotFoundError for unknown ID', async () => {
      await expect(deleteDiaryEntry(db, 'no-such-entry', photoStoragePath)).rejects.toThrow(
        NotFoundError,
      );
    });

    it('successfully deletes an automatic entry', async () => {
      const id = insertEntry({
        isAutomatic: true,
        entryType: 'invoice_status',
        createdBy: null,
      });
      // Automatic entries CAN be deleted (Story #808 changed this behavior)
      await expect(deleteDiaryEntry(db, id, photoStoragePath)).resolves.toBeUndefined();
      expect(() => getDiaryEntry(db, id)).toThrow(NotFoundError);
    });
  });

  // ─── sourceEntityTitle resolution ─────────────────────────────────────────

  describe('sourceEntityTitle resolution', () => {
    it('getDiaryEntry returns sourceEntityTitle from work_item title', () => {
      const now = new Date().toISOString();
      db.insert(workItems)
        .values({
          id: 'wi-kitchen-01',
          title: 'Kitchen Renovation',
          status: 'not_started',
          createdBy: testUserId,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const id = insertEntry({
        isAutomatic: true,
        entryType: 'work_item_status',
        sourceEntityType: 'work_item',
        sourceEntityId: 'wi-kitchen-01',
        createdBy: null,
      });

      const result = getDiaryEntry(db, id);
      expect(result.sourceEntityTitle).toBe('Kitchen Renovation');
    });

    it('getDiaryEntry returns sourceEntityTitle from invoice invoiceNumber', () => {
      const now = new Date().toISOString();
      db.insert(vendors)
        .values({
          id: 'vendor-01',
          name: 'Test Vendor',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      db.insert(invoices)
        .values({
          id: 'inv-01',
          vendorId: 'vendor-01',
          invoiceNumber: 'INV-2026-001',
          amount: 1000,
          date: '2026-03-14',
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const id = insertEntry({
        isAutomatic: true,
        entryType: 'invoice_status',
        sourceEntityType: 'invoice',
        sourceEntityId: 'inv-01',
        createdBy: null,
      });

      const result = getDiaryEntry(db, id);
      expect(result.sourceEntityTitle).toBe('INV-2026-001');
    });

    it('getDiaryEntry returns sourceEntityTitle from milestone title', () => {
      const now = new Date().toISOString();
      const milestone = db
        .insert(milestones)
        .values({
          title: 'Foundation Complete',
          targetDate: '2026-06-01',
          isCompleted: false,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: milestones.id })
        .get();

      const milestoneId = String(milestone!.id);
      const id = insertEntry({
        isAutomatic: true,
        entryType: 'milestone_delay',
        sourceEntityType: 'milestone',
        sourceEntityId: milestoneId,
        createdBy: null,
      });

      const result = getDiaryEntry(db, id);
      expect(result.sourceEntityTitle).toBe('Foundation Complete');
    });

    it('getDiaryEntry returns sourceEntityTitle=null when no source entity', () => {
      const id = insertEntry({
        sourceEntityType: null,
        sourceEntityId: null,
      });

      const result = getDiaryEntry(db, id);
      expect(result.sourceEntityTitle).toBeNull();
    });

    it('listDiaryEntries includes sourceEntityTitle on items with work_item source', () => {
      const now = new Date().toISOString();
      db.insert(workItems)
        .values({
          id: 'wi-roofing-02',
          title: 'Roofing Work',
          status: 'not_started',
          createdBy: testUserId,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      insertEntry({
        isAutomatic: true,
        entryType: 'work_item_status',
        sourceEntityType: 'work_item',
        sourceEntityId: 'wi-roofing-02',
        createdBy: null,
      });

      const result = listDiaryEntries(db, {});
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.sourceEntityTitle).toBe('Roofing Work');
    });

    it('listDiaryEntries returns sourceEntityTitle=null for manual entries without source', () => {
      insertEntry({
        sourceEntityType: null,
        sourceEntityId: null,
      });

      const result = listDiaryEntries(db, {});
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.sourceEntityTitle).toBeNull();
    });
  });

  // ─── createAutomaticDiaryEntry ─────────────────────────────────────────────

  describe('createAutomaticDiaryEntry', () => {
    it('creates entry with isAutomatic=true and source entity set', () => {
      createAutomaticDiaryEntry(
        db,
        'work_item_status',
        '2026-03-14',
        'Status changed from In Progress to Completed',
        'Work item status changed to completed',
        'work_item',
        'wi-123',
      );

      const result = listDiaryEntries(db, { automatic: true });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.isAutomatic).toBe(true);
      expect(result.items[0]!.entryType).toBe('work_item_status');
      expect(result.items[0]!.sourceEntityType).toBe('work_item');
      expect(result.items[0]!.sourceEntityId).toBe('wi-123');
      expect(result.items[0]!.createdBy).toBeNull();
    });

    it('creates entry with null source for system-wide events', () => {
      createAutomaticDiaryEntry(
        db,
        'budget_breach',
        '2026-03-14',
        'Budget category overspend detected',
        'Budget threshold exceeded',
        null,
        null,
      );

      const result = listDiaryEntries(db, { automatic: true });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.sourceEntityType).toBeNull();
      expect(result.items[0]!.sourceEntityId).toBeNull();
    });
  });

  // ─── Metadata validation ───────────────────────────────────────────────────

  describe('metadata validation', () => {
    // daily_log

    it('daily_log: accepts valid metadata', () => {
      const request: CreateDiaryEntryRequest = {
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        body: 'Sunny day',
        metadata: {
          weather: 'sunny',
          temperatureCelsius: 22,
          workersOnSite: 4,
        },
      };
      expect(() => createDiaryEntry(db, testUserId, request)).not.toThrow();
    });

    it('daily_log: rejects invalid weather value', () => {
      const request: CreateDiaryEntryRequest = {
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        body: 'Bad weather',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Intentionally invalid metadata for test
        metadata: { weather: 'tornado' } as any,
      };
      expect(() => createDiaryEntry(db, testUserId, request)).toThrow(InvalidMetadataError);
    });

    // site_visit

    it('site_visit: rejects invalid outcome', () => {
      const request: CreateDiaryEntryRequest = {
        entryType: 'site_visit',
        entryDate: '2026-03-14',
        body: 'Inspection done',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Intentionally invalid metadata for test
        metadata: { outcome: 'maybe' } as any,
      };
      expect(() => createDiaryEntry(db, testUserId, request)).toThrow(InvalidMetadataError);
    });

    // delivery

    it('delivery: rejects non-array materials', () => {
      const request: CreateDiaryEntryRequest = {
        entryType: 'delivery',
        entryDate: '2026-03-14',
        body: 'Materials arrived',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Intentionally invalid metadata for test
        metadata: { materials: 'concrete' } as any,
      };
      expect(() => createDiaryEntry(db, testUserId, request)).toThrow(InvalidMetadataError);
    });

    // issue

    it('issue: rejects invalid severity', () => {
      const request: CreateDiaryEntryRequest = {
        entryType: 'issue',
        entryDate: '2026-03-14',
        body: 'Something broke',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Intentionally invalid metadata for test
        metadata: { severity: 'fatal' } as any,
      };
      expect(() => createDiaryEntry(db, testUserId, request)).toThrow(InvalidMetadataError);
    });

    // general_note

    it('general_note: accepts any metadata shape', () => {
      const request: CreateDiaryEntryRequest = {
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: 'General observation',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Intentionally invalid metadata for test
        metadata: { randomField: 'anything', nested: { value: 42 } } as any,
      };
      expect(() => createDiaryEntry(db, testUserId, request)).not.toThrow();
    });

    // null metadata

    it('null metadata is valid for any entry type', () => {
      const types: CreateDiaryEntryRequest['entryType'][] = [
        'daily_log',
        'site_visit',
        'delivery',
        'issue',
        'general_note',
      ];
      for (const entryType of types) {
        const request: CreateDiaryEntryRequest = {
          entryType,
          entryDate: '2026-03-14',
          body: `${entryType} entry with null metadata`,
          metadata: null,
        };
        expect(() => createDiaryEntry(db, testUserId, request)).not.toThrow();
      }
    });
  });

  // ─── Draft creation (Story #1426) ─────────────────────────────────────────

  describe('createDiaryEntry draft mode', () => {
    it('creates draft with status=draft and no body; returns status=draft, body=""', () => {
      const request: CreateDiaryEntryRequest = {
        entryType: 'general_note',
        status: 'draft',
      };
      const result = createDiaryEntry(db, testUserId, request);
      expect(result.status).toBe('draft');
      expect(result.body).toBe('');
    });

    it('creates draft with no entryDate; defaults to today', () => {
      const today = new Date().toISOString().split('T')[0];
      const result = createDiaryEntry(db, testUserId, {
        entryType: 'general_note',
        status: 'draft',
      });
      expect(result.entryDate).toBe(today);
    });

    it('creates draft with invalid metadata enum; throws InvalidMetadataError', () => {
      const request = {
        entryType: 'daily_log' as const,
        status: 'draft' as const,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Intentionally invalid metadata for test
        metadata: { weather: 'tornado' } as any,
      };
      expect(() => createDiaryEntry(db, testUserId, request)).toThrow(InvalidMetadataError);
    });

    it('creating saved entry without body throws ValidationError', () => {
      const request = {
        entryType: 'general_note' as const,
        entryDate: '2026-03-14',
        // no body
      } as CreateDiaryEntryRequest;
      expect(() => createDiaryEntry(db, testUserId, request)).toThrow(ValidationError);
    });

    it('creating saved entry without entryDate throws ValidationError', () => {
      const request = {
        entryType: 'general_note' as const,
        body: 'Some body',
        // no entryDate
      } as CreateDiaryEntryRequest;
      expect(() => createDiaryEntry(db, testUserId, request)).toThrow(ValidationError);
    });
  });

  // ─── updateDiaryEntry draft relaxed validation (Story #1426) ───────────────

  describe('updateDiaryEntry draft vs saved validation', () => {
    it('updates draft entry with body=""; succeeds (relaxed validation)', () => {
      const id = insertEntry({ status: 'draft', body: 'Initial body' });
      const result = updateDiaryEntry(db, id, { body: '' });
      // Body stays as the old value when empty string is passed (falsy guard in update)
      // The important thing is no ValidationError is thrown
      expect(result).toBeDefined();
    });

    it('updating saved entry with body="" throws ValidationError', () => {
      const id = insertEntry({ status: 'saved', body: 'Non-empty body' });
      expect(() => updateDiaryEntry(db, id, { body: '' })).toThrow(ValidationError);
    });
  });

  // ─── promoteDiaryEntry (Story #1426) ──────────────────────────────────────

  describe('promoteDiaryEntry', () => {
    it('promotes a valid general_note draft to saved; returns status=saved', () => {
      const id = insertEntry({
        status: 'draft',
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: 'Ready to save',
      });
      const result = promoteDiaryEntry(db, id, {});
      expect(result.status).toBe('saved');
    });

    it('promoting site_visit draft without inspectorName throws ValidationError; entry stays draft', () => {
      const id = insertEntry({
        status: 'draft',
        entryType: 'site_visit',
        entryDate: '2026-03-14',
        body: 'Inspection report',
        // No metadata with inspectorName
      });
      expect(() => promoteDiaryEntry(db, id, {})).toThrow(ValidationError);
      // Verify entry stays draft in DB
      const entry = db.select().from(diaryEntries).where(eq(diaryEntries.id, id)).get();
      expect(entry?.status).toBe('draft');
    });

    it('promoting issue draft without severity throws ValidationError', () => {
      const id = insertEntry({
        status: 'draft',
        entryType: 'issue',
        entryDate: '2026-03-14',
        body: 'Critical issue found',
        // no metadata with severity
      });
      expect(() => promoteDiaryEntry(db, id, {})).toThrow(ValidationError);
    });

    it('promoting an already-saved entry throws AlreadySavedError', () => {
      const id = insertEntry({ status: 'saved' });
      expect(() => promoteDiaryEntry(db, id, {})).toThrow(AlreadySavedError);
    });

    it('promoting an automatic entry throws ImmutableEntryError', () => {
      const id = insertEntry({
        status: 'saved',
        isAutomatic: true,
        entryType: 'work_item_status',
        createdBy: null,
      });
      expect(() => promoteDiaryEntry(db, id, {})).toThrow(ImmutableEntryError);
    });

    it('promoting with field overrides applies overrides and validates', () => {
      const id = insertEntry({
        status: 'draft',
        entryType: 'general_note',
        entryDate: '2026-01-01',
        body: '',
      });
      const result = promoteDiaryEntry(db, id, {
        entryDate: '2026-06-15',
        body: 'Overridden body content',
        title: 'Overridden Title',
      });
      expect(result.status).toBe('saved');
      expect(result.entryDate).toBe('2026-06-15');
      expect(result.body).toBe('Overridden body content');
      expect(result.title).toBe('Overridden Title');
    });
  });

  // ─── listDiaryEntries status filter (Story #1426) ─────────────────────────

  describe('listDiaryEntries status filter', () => {
    it('filters by status=draft; returns only draft entries', () => {
      insertEntry({ status: 'draft', body: 'Draft entry' });
      insertEntry({ status: 'saved', body: 'Saved entry' });

      const result = listDiaryEntries(db, { status: 'draft' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.status).toBe('draft');
    });

    it('filters by status=saved; returns only saved entries', () => {
      insertEntry({ status: 'draft', body: 'Draft entry' });
      insertEntry({ status: 'saved', body: 'Saved entry' });

      const result = listDiaryEntries(db, { status: 'saved' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.status).toBe('saved');
    });

    it('without status filter; returns both draft and saved entries', () => {
      insertEntry({ status: 'draft', body: 'Draft entry' });
      insertEntry({ status: 'saved', body: 'Saved entry' });

      const result = listDiaryEntries(db, {});
      expect(result.items).toHaveLength(2);
    });
  });

  // ─── daily_log vendor + work-time validation (Story #1672) ───────────────

  describe('daily_log vendorId validation', () => {
    const vendorId = 'vendor-test-01';

    beforeEach(() => {
      const now = new Date().toISOString();
      db.insert(vendors)
        .values({
          id: vendorId,
          name: 'Test Vendor',
          createdAt: now,
          updatedAt: now,
        })
        .run();
    });

    it('accepts valid vendorId referencing an existing vendor', () => {
      const request: CreateDiaryEntryRequest = {
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        body: 'Vendor was on site',
        metadata: { vendorId },
      };
      expect(() => createDiaryEntry(db, testUserId, request)).not.toThrow();
    });

    it('rejects vendorId not in vendors table', () => {
      const request: CreateDiaryEntryRequest = {
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        body: 'Unknown vendor',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Intentionally invalid metadata for test
        metadata: { vendorId: 'nonexistent-vendor-999' } as any,
      };
      expect(() => createDiaryEntry(db, testUserId, request)).toThrow(InvalidMetadataError);
    });

    it('accepts null vendorId', () => {
      const request: CreateDiaryEntryRequest = {
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        body: 'No vendor today',
        metadata: { vendorId: null },
      };
      expect(() => createDiaryEntry(db, testUserId, request)).not.toThrow();
    });
  });

  describe('daily_log workStart / workEnd validation', () => {
    it('accepts valid workStart "08:00"', () => {
      const request: CreateDiaryEntryRequest = {
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        body: 'Work started at 8',
        metadata: { workStart: '08:00' },
      };
      expect(() => createDiaryEntry(db, testUserId, request)).not.toThrow();
    });

    it('rejects workStart "8:00" (no leading zero)', () => {
      const request: CreateDiaryEntryRequest = {
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        body: 'Bad start format',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Intentionally invalid metadata for test
        metadata: { workStart: '8:00' } as any,
      };
      expect(() => createDiaryEntry(db, testUserId, request)).toThrow(InvalidMetadataError);
    });

    it('rejects workStart "invalid"', () => {
      const request: CreateDiaryEntryRequest = {
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        body: 'Invalid start',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Intentionally invalid metadata for test
        metadata: { workStart: 'invalid' } as any,
      };
      expect(() => createDiaryEntry(db, testUserId, request)).toThrow(InvalidMetadataError);
    });

    it('accepts valid workEnd after workStart (08:00 → 16:30)', () => {
      const request: CreateDiaryEntryRequest = {
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        body: 'Full work day',
        metadata: { workStart: '08:00', workEnd: '16:30' },
      };
      expect(() => createDiaryEntry(db, testUserId, request)).not.toThrow();
    });

    it('rejects workEnd equal to workStart (08:00/08:00)', () => {
      const request: CreateDiaryEntryRequest = {
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        body: 'Same start and end',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Intentionally invalid metadata for test
        metadata: { workStart: '08:00', workEnd: '08:00' } as any,
      };
      expect(() => createDiaryEntry(db, testUserId, request)).toThrow(InvalidMetadataError);
    });

    it('rejects workEnd before workStart (16:00/08:00)', () => {
      const request: CreateDiaryEntryRequest = {
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        body: 'End before start',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Intentionally invalid metadata for test
        metadata: { workStart: '16:00', workEnd: '08:00' } as any,
      };
      expect(() => createDiaryEntry(db, testUserId, request)).toThrow(InvalidMetadataError);
    });

    it('accepts only workStart without workEnd — no cross-field error', () => {
      const request: CreateDiaryEntryRequest = {
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        body: 'Started but no end recorded',
        metadata: { workStart: '08:00' },
      };
      expect(() => createDiaryEntry(db, testUserId, request)).not.toThrow();
    });
  });

  describe('daily_log vendorName denormalization', () => {
    const vendorId = 'vendor-test-02';
    const vendorName = 'Denorm Vendor Co.';

    beforeEach(() => {
      const now = new Date().toISOString();
      db.insert(vendors)
        .values({
          id: vendorId,
          name: vendorName,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    });

    it('getDiaryEntry denormalizes vendorName when vendorId present', () => {
      const request: CreateDiaryEntryRequest = {
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        body: 'Vendor present on site',
        metadata: { vendorId },
      };
      const created = createDiaryEntry(db, testUserId, request);
      const fetched = getDiaryEntry(db, created.id);
      const dlm = fetched.metadata as DailyLogMetadataTest;
      expect(dlm.vendorName).toBe(vendorName);
    });

    it('getDiaryEntry sets vendorName null when vendor was deleted after save', () => {
      // Insert entry directly bypassing validation, simulating vendor-deleted-after-save scenario
      const id = insertEntry({
        entryType: 'daily_log',
        metadata: JSON.stringify({ vendorId: 'deleted-vendor-id' }),
      });
      const fetched = getDiaryEntry(db, id);
      const dlm = fetched.metadata as DailyLogMetadataTest;
      // vendorName should be null because the vendor doesn't exist
      expect(dlm.vendorName === null || dlm.vendorName === undefined).toBe(true);
    });

    it('listDiaryEntries includes vendorName in daily_log metadata', () => {
      const request: CreateDiaryEntryRequest = {
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        body: 'Vendor list test',
        metadata: { vendorId },
      };
      createDiaryEntry(db, testUserId, request);
      const result = listDiaryEntries(db, {});
      const dlEntry = result.items.find((i) => i.entryType === 'daily_log');
      expect(dlEntry).toBeDefined();
      const dlm = dlEntry!.metadata as DailyLogMetadataTest;
      expect(dlm.vendorName).toBe(vendorName);
    });

    it('createDiaryEntry saves workStart and workEnd in metadata (fetch and verify)', () => {
      const request: CreateDiaryEntryRequest = {
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        body: 'Work times recorded',
        metadata: { workStart: '07:30', workEnd: '15:45' },
      };
      const created = createDiaryEntry(db, testUserId, request);
      const fetched = getDiaryEntry(db, created.id);
      const dlm = fetched.metadata as DailyLogMetadataTest;
      expect(dlm.workStart).toBe('07:30');
      expect(dlm.workEnd).toBe('15:45');
    });

    it('existing daily_log entry without new fields loads without error', () => {
      // Insert entry without workStart/workEnd/vendorId — simulates legacy data
      const id = insertEntry({
        entryType: 'daily_log',
        metadata: JSON.stringify({ weather: 'sunny', workersOnSite: 3 }),
      });
      expect(() => getDiaryEntry(db, id)).not.toThrow();
      const fetched = getDiaryEntry(db, id);
      expect(fetched.metadata).toBeDefined();
    });
  });

  // ─── findOrphanDraftIds (Story #1426) ─────────────────────────────────────

  describe('findOrphanDraftIds', () => {
    it('returns only draft entries older than the cutoff', () => {
      const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
      const recentDate = new Date().toISOString();

      // Old draft — should be returned
      const oldDraftId = `old-draft-${Date.now()}`;
      db.insert(diaryEntries)
        .values({
          id: oldDraftId,
          entryType: 'general_note',
          entryDate: '2025-01-01',
          title: null,
          body: 'Old draft',
          metadata: null,
          status: 'draft',
          isAutomatic: false,
          sourceEntityType: null,
          sourceEntityId: null,
          createdBy: testUserId,
          createdAt: oldDate,
          updatedAt: oldDate,
        })
        .run();

      // Recent draft — should NOT be returned
      const recentDraftId = `recent-draft-${Date.now()}`;
      db.insert(diaryEntries)
        .values({
          id: recentDraftId,
          entryType: 'general_note',
          entryDate: '2026-03-14',
          title: null,
          body: 'Recent draft',
          metadata: null,
          status: 'draft',
          isAutomatic: false,
          sourceEntityType: null,
          sourceEntityId: null,
          createdBy: testUserId,
          createdAt: recentDate,
          updatedAt: recentDate,
        })
        .run();

      // Old saved entry — should NOT be returned (not a draft)
      const savedId = `old-saved-${Date.now()}`;
      db.insert(diaryEntries)
        .values({
          id: savedId,
          entryType: 'general_note',
          entryDate: '2025-01-01',
          title: null,
          body: 'Old but saved',
          metadata: null,
          status: 'saved',
          isAutomatic: false,
          sourceEntityType: null,
          sourceEntityId: null,
          createdBy: testUserId,
          createdAt: oldDate,
          updatedAt: oldDate,
        })
        .run();

      const ids = findOrphanDraftIds(db, 30);
      expect(ids).toContain(oldDraftId);
      expect(ids).not.toContain(recentDraftId);
      expect(ids).not.toContain(savedId);
    });

    it('with olderThanDays=0; cutoff is now; no entries match (all are current or older)', () => {
      // Should not throw — just returns no results for a 0-day window where
      // no entries were created in the "future"
      expect(() => findOrphanDraftIds(db, 0)).not.toThrow();
    });
  });
});
