/**
 * Tests for the photo extras, list filters and filter options of diaryService (#2225):
 * loadDiaryPhotoExtras, thumbnails/photoAreas on every summary, `areaId` / `vendorId` list
 * filters and getDiaryFilterOptions. Real in-memory SQLite with the `fold` SQL function;
 * synthetic data only.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { registerSqlFunctions } from '../db/sqlFunctions.js';
import * as schema from '../db/schema.js';
import { loadAreaMap } from './areaService.js';
import {
  createDiaryEntry,
  getDiaryEntry,
  getDiaryFilterOptions,
  listDiaryEntries,
  loadDiaryPhotoExtras,
  promoteDiaryEntry,
  updateDiaryEntry,
} from './diaryService.js';
import { listHistory } from './historyService.js';
import { DIARY_LIST_THUMBNAIL_LIMIT } from '@cornerstone/shared';

const NOW = '2026-03-10T10:00:00.000Z';

describe('diaryService photo extras, filters and filter options (#2225)', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let seq = 0;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    registerSqlFunctions(sqlite);
    db = drizzle(sqlite, { schema });
    seq = 0;
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── Fixtures ──────────────────────────────────────────────────────────────

  function entry(id: string, o: Partial<typeof schema.diaryEntries.$inferInsert> = {}): string {
    db.insert(schema.diaryEntries)
      .values({
        id,
        entryType: 'daily_log',
        entryDate: '2026-03-10',
        title: `Entry ${id}`,
        body: 'Some text',
        metadata: null,
        status: 'saved',
        isAutomatic: false,
        createdBy: null,
        createdAt: NOW,
        updatedAt: NOW,
        ...o,
      })
      .run();
    return id;
  }

  function patchEntry(id: string, set: Partial<typeof schema.diaryEntries.$inferInsert>): void {
    db.update(schema.diaryEntries).set(set).where(eq(schema.diaryEntries.id, id)).run();
  }

  function area(id: string, name: string, parentId: string | null = null): string {
    seq += 1;
    db.insert(schema.areas)
      .values({ id, name, parentId, sortOrder: seq, createdAt: NOW, updatedAt: NOW })
      .run();
    return id;
  }

  function photo(
    id: string,
    entryId: string,
    o: Partial<typeof schema.photos.$inferInsert> = {},
  ): string {
    db.insert(schema.photos)
      .values({
        id,
        entityType: 'diary_entry',
        entityId: entryId,
        filename: `${id}.jpg`,
        originalFilename: `${id}.jpg`,
        mimeType: 'image/jpeg',
        fileSize: 1,
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
        ...o,
      })
      .run();
    return id;
  }

  function vendor(id: string, name: string): string {
    db.insert(schema.vendors).values({ id, name, createdAt: NOW, updatedAt: NOW }).run();
    return id;
  }

  const listIds = (q: Parameters<typeof listDiaryEntries>[1] = {}) =>
    listDiaryEntries(db, { pageSize: 100, ...q })
      .items.map((i) => i.id)
      .sort();

  // ─── loadDiaryPhotoExtras ──────────────────────────────────────────────────

  describe('loadDiaryPhotoExtras', () => {
    it('returns an empty map for no entry ids', () => {
      expect(loadDiaryPhotoExtras(db, [], loadAreaMap(db)).size).toBe(0);
    });

    it('has no entry for an entry without photos', () => {
      entry('e-none');
      expect(loadDiaryPhotoExtras(db, ['e-none'], loadAreaMap(db)).has('e-none')).toBe(false);
    });

    it('limits thumbnails to 5', () => {
      expect(DIARY_LIST_THUMBNAIL_LIMIT).toBe(5);
    });

    it.each([
      [1, 1],
      [5, 5],
      [7, 5],
    ])('%i photos give photoCount %i-or-more and at most 5 thumbnails', (count, thumbs) => {
      entry('e-1');
      for (let i = 0; i < count; i += 1) photo(`p-${i}`, 'e-1', { sortOrder: i });
      const extras = loadDiaryPhotoExtras(db, ['e-1'], loadAreaMap(db)).get('e-1')!;
      expect(extras.photoCount).toBe(count);
      expect(extras.thumbnails).toHaveLength(thumbs);
    });

    it('orders thumbnails by sort_order, then created_at, then id', () => {
      entry('e-1');
      photo('p-c', 'e-1', { sortOrder: 2 });
      photo('p-b2', 'e-1', { sortOrder: 1, createdAt: '2026-03-10T10:00:02.000Z' });
      photo('p-b1', 'e-1', { sortOrder: 1, createdAt: '2026-03-10T10:00:01.000Z' });
      photo('p-a-z', 'e-1', { sortOrder: 0 });
      photo('p-a-a', 'e-1', { sortOrder: 0 });
      const extras = loadDiaryPhotoExtras(db, ['e-1'], loadAreaMap(db)).get('e-1')!;
      expect(extras.thumbnails.map((t) => t.id)).toEqual(['p-a-a', 'p-a-z', 'p-b1', 'p-b2', 'p-c']);
    });

    it('keeps only the first five of seven in order', () => {
      entry('e-1');
      for (let i = 0; i < 7; i += 1) photo(`p-${i}`, 'e-1', { sortOrder: 6 - i });
      const extras = loadDiaryPhotoExtras(db, ['e-1'], loadAreaMap(db)).get('e-1')!;
      expect(extras.thumbnails.map((t) => t.id)).toEqual(['p-6', 'p-5', 'p-4', 'p-3', 'p-2']);
    });

    it('builds a cache-busted URL from annotatedAt, else updatedAt', () => {
      entry('e-1');
      photo('p-plain', 'e-1', { sortOrder: 0 });
      photo('p-annotated', 'e-1', { sortOrder: 1, annotatedAt: '2026-03-11T09:00:00.000Z' });
      const [plain, annotated] = loadDiaryPhotoExtras(db, ['e-1'], loadAreaMap(db)).get(
        'e-1',
      )!.thumbnails;
      expect(plain!.thumbnailUrl).toBe(
        `/api/photos/p-plain/thumbnail?v=${encodeURIComponent(NOW)}`,
      );
      expect(annotated!.thumbnailUrl).toBe(
        `/api/photos/p-annotated/thumbnail?v=${encodeURIComponent('2026-03-11T09:00:00.000Z')}`,
      );
    });

    it('counts and groups photos per entry and ignores other entity types', () => {
      entry('e-1');
      entry('e-2');
      photo('p-1', 'e-1');
      photo('p-2', 'e-2');
      photo('p-3', 'e-2');
      photo('p-other', 'e-1', { entityType: 'work_item' });
      const map = loadDiaryPhotoExtras(db, ['e-1', 'e-2'], loadAreaMap(db));
      expect(map.get('e-1')!.photoCount).toBe(1);
      expect(map.get('e-2')!.photoCount).toBe(2);
    });

    it('collapses two photos in one area into one photoAreas entry', () => {
      entry('e-1');
      area('a-1', 'Area A');
      photo('p-1', 'e-1', { areaId: 'a-1' });
      photo('p-2', 'e-1', { areaId: 'a-1' });
      const extras = loadDiaryPhotoExtras(db, ['e-1'], loadAreaMap(db)).get('e-1')!;
      expect(extras.photoAreas.map((a) => a.id)).toEqual(['a-1']);
    });

    it('adds ancestors root-first for a nested area', () => {
      entry('e-1');
      area('a-root', 'Area A');
      area('a-mid', 'Floor 1', 'a-root');
      area('a-leaf', 'Room 1', 'a-mid');
      photo('p-1', 'e-1', { areaId: 'a-leaf' });
      const [leaf] = loadDiaryPhotoExtras(db, ['e-1'], loadAreaMap(db)).get('e-1')!.photoAreas;
      expect(leaf!.id).toBe('a-leaf');
      expect(leaf!.ancestors!.map((a) => a.name)).toEqual(['Area A', 'Floor 1']);
    });

    it('sorts areas by path, case-insensitively', () => {
      entry('e-1');
      area('a-b', 'beta');
      area('a-a', 'Alpha');
      area('a-c', 'Charlie');
      area('a-a-sub', 'Zeta', 'a-a');
      photo('p-1', 'e-1', { areaId: 'a-c' });
      photo('p-2', 'e-1', { areaId: 'a-b' });
      photo('p-3', 'e-1', { areaId: 'a-a-sub' });
      photo('p-4', 'e-1', { areaId: 'a-a' });
      const extras = loadDiaryPhotoExtras(db, ['e-1'], loadAreaMap(db)).get('e-1')!;
      expect(extras.photoAreas.map((a) => a.id)).toEqual(['a-a', 'a-a-sub', 'a-b', 'a-c']);
    });

    it('breaks equal paths by id', () => {
      entry('e-1');
      area('a-2', 'Same');
      area('a-1', 'same');
      photo('p-1', 'e-1', { areaId: 'a-2' });
      photo('p-2', 'e-1', { areaId: 'a-1' });
      const extras = loadDiaryPhotoExtras(db, ['e-1'], loadAreaMap(db)).get('e-1')!;
      expect(extras.photoAreas.map((a) => a.id)).toEqual(['a-1', 'a-2']);
    });

    it('ignores a photo whose area was deleted (area_id null)', () => {
      entry('e-1');
      area('a-1', 'Area A');
      photo('p-1', 'e-1', { areaId: 'a-1' });
      db.delete(schema.areas).run();
      const extras = loadDiaryPhotoExtras(db, ['e-1'], loadAreaMap(db)).get('e-1')!;
      expect(extras.photoAreas).toEqual([]);
      expect(extras.photoCount).toBe(1);
    });

    it('skips an area id missing from the area map', () => {
      entry('e-1');
      area('a-1', 'Area A');
      photo('p-1', 'e-1', { areaId: 'a-1' });
      const extras = loadDiaryPhotoExtras(db, ['e-1'], new Map()).get('e-1')!;
      expect(extras.photoAreas).toEqual([]);
    });
  });

  // ─── Summaries carry the extras ────────────────────────────────────────────

  describe('summaries', () => {
    it('list rows carry thumbnails and photoAreas, photoCount unchanged', () => {
      entry('e-1');
      area('a-1', 'Area A');
      for (let i = 0; i < 7; i += 1) photo(`p-${i}`, 'e-1', { sortOrder: i, areaId: 'a-1' });
      entry('e-empty');
      const items = listDiaryEntries(db, { pageSize: 100 }).items;
      const row = items.find((i) => i.id === 'e-1')!;
      expect(row.photoCount).toBe(7);
      expect(row.thumbnails).toHaveLength(5);
      expect(row.photoAreas!.map((a) => a.id)).toEqual(['a-1']);
      const empty = items.find((i) => i.id === 'e-empty')!;
      expect(empty.photoCount).toBe(0);
      expect(empty.thumbnails).toEqual([]);
      expect(empty.photoAreas).toEqual([]);
    });

    it('automatic rows carry empty extras', () => {
      entry('auto-1', {
        entryType: 'invoice_status',
        isAutomatic: true,
        title: null,
        body: '',
      });
      const row = listDiaryEntries(db, { pageSize: 100, automatic: true }).items.find(
        (i) => i.id === 'auto-1',
      )!;
      expect(row.thumbnails).toEqual([]);
      expect(row.photoAreas).toEqual([]);
    });

    it('detail carries the extras', () => {
      entry('e-1');
      area('a-1', 'Area A');
      photo('p-1', 'e-1', { areaId: 'a-1' });
      const detail = getDiaryEntry(db, 'e-1');
      expect(detail.photoCount).toBe(1);
      expect(detail.thumbnails!.map((t) => t.id)).toEqual(['p-1']);
      expect(detail.photoAreas!.map((a) => a.id)).toEqual(['a-1']);
    });

    it('detail without photos has empty extras', () => {
      entry('e-1');
      const detail = getDiaryEntry(db, 'e-1');
      expect(detail.thumbnails).toEqual([]);
      expect(detail.photoAreas).toEqual([]);
    });

    it('update returns the extras', () => {
      entry('e-1');
      area('a-1', 'Area A');
      photo('p-1', 'e-1', { areaId: 'a-1' });
      const updated = updateDiaryEntry(db, 'e-1', { title: 'Renamed' });
      expect(updated.title).toBe('Renamed');
      expect(updated.thumbnails!.map((t) => t.id)).toEqual(['p-1']);
      expect(updated.photoAreas!.map((a) => a.id)).toEqual(['a-1']);
    });

    it('update of a saved entry counts photos for the content rule', () => {
      entry('e-1', { title: 'Only title', body: '' });
      expect(() => updateDiaryEntry(db, 'e-1', { title: '' })).toThrow();
      photo('p-1', 'e-1');
      expect(updateDiaryEntry(db, 'e-1', { title: '' }).photoCount).toBe(1);
    });

    it('promote counts photos for the content rule and returns the extras', () => {
      entry('e-draft', { status: 'draft', title: null, body: '' });
      expect(() => promoteDiaryEntry(db, 'e-draft', {})).toThrow();
      photo('p-1', 'e-draft');
      const promoted = promoteDiaryEntry(db, 'e-draft', {});
      expect(promoted.status).toBe('saved');
      expect(promoted.thumbnails!.map((t) => t.id)).toEqual(['p-1']);
    });

    it('create returns empty extras', () => {
      db.insert(schema.users)
        .values({
          id: 'u-1',
          email: 'user-a@test.example',
          displayName: 'User A',
          role: 'member',
          authProvider: 'local',
          passwordHash: 'hash',
          createdAt: NOW,
          updatedAt: NOW,
        })
        .run();
      const created = createDiaryEntry(db, 'u-1', {
        entryType: 'daily_log',
        entryDate: '2026-03-10',
        title: 'New',
        body: 'Text',
      });
      expect(created.thumbnails).toEqual([]);
      expect(created.photoAreas).toEqual([]);
    });

    it('History include-diary rows carry thumbnails and photoAreas', () => {
      entry('e-1');
      area('a-1', 'Area A');
      photo('p-1', 'e-1', { areaId: 'a-1' });
      const row = listHistory(db, { types: [], includeDiary: true, pageSize: 100 }).items.find(
        (i) => i.id === 'e-1',
      )!;
      expect(row.thumbnails!.map((t) => t.id)).toEqual(['p-1']);
      expect(row.photoAreas!.map((a) => a.id)).toEqual(['a-1']);
    });
  });

  // ─── areaId filter ─────────────────────────────────────────────────────────

  describe('list filter areaId', () => {
    beforeEach(() => {
      area('a-root', 'Area A');
      area('a-child', 'Room 1', 'a-root');
      area('a-other', 'Area B');
      entry('e-child');
      photo('p-1', 'e-child', { areaId: 'a-child' });
      entry('e-root');
      photo('p-2', 'e-root', { areaId: 'a-root' });
      entry('e-other');
      photo('p-3', 'e-other', { areaId: 'a-other' });
      entry('e-nophoto');
    });

    it('matches an entry whose photo is tagged with the area', () => {
      expect(listIds({ areaId: 'a-other' })).toEqual(['e-other']);
    });

    it('a parent area matches a child-tagged photo', () => {
      expect(listIds({ areaId: 'a-root' })).toEqual(['e-child', 'e-root']);
    });

    it('a child area does not match a parent-tagged photo', () => {
      expect(listIds({ areaId: 'a-child' })).toEqual(['e-child']);
    });

    it('an unknown area gives an empty list', () => {
      const res = listDiaryEntries(db, { areaId: 'nope' });
      expect(res.items).toEqual([]);
      expect(res.pagination.totalItems).toBe(0);
    });

    it('combines with type, status, q and dates', () => {
      patchEntry('e-child', {
        entryType: 'issue',
        entryDate: '2026-01-01',
        title: 'Crack',
        status: 'draft',
      });
      expect(listIds({ areaId: 'a-root', type: 'issue' })).toEqual(['e-child']);
      expect(listIds({ areaId: 'a-root', status: 'draft' })).toEqual(['e-child']);
      expect(listIds({ areaId: 'a-root', status: 'saved' })).toEqual(['e-root']);
      expect(listIds({ areaId: 'a-root', q: 'crack' })).toEqual(['e-child']);
      expect(listIds({ areaId: 'a-root', dateFrom: '2026-02-01' })).toEqual(['e-root']);
      expect(listIds({ areaId: 'a-root', dateTo: '2026-02-01' })).toEqual(['e-child']);
    });

    it('still pages', () => {
      const res = listDiaryEntries(db, { areaId: 'a-root', pageSize: 1, page: 2 });
      expect(res.items).toHaveLength(1);
      expect(res.pagination.totalItems).toBe(2);
      expect(res.pagination.totalPages).toBe(2);
    });
  });

  // ─── vendorId filter ───────────────────────────────────────────────────────

  describe('list filter vendorId', () => {
    beforeEach(() => {
      vendor('v-1', 'Müller Bau');
      vendor('v-2', 'Company B');
      entry('log-1', { metadata: JSON.stringify({ vendorId: 'v-1' }) });
      entry('log-2', { metadata: JSON.stringify({ vendorId: 'v-2' }) });
      entry('del-1', {
        entryType: 'delivery',
        metadata: JSON.stringify({ vendor: 'MUELLER BAU' }),
      });
      entry('del-2', {
        entryType: 'delivery',
        metadata: JSON.stringify({ vendor: 'Company B' }),
      });
      entry('plain');
    });

    it('matches a daily log by id and a delivery by folded name', () => {
      expect(listIds({ vendorId: 'v-1' })).toEqual(['del-1', 'log-1']);
      expect(listIds({ vendorId: 'v-2' })).toEqual(['del-2', 'log-2']);
    });

    it('does not match a delivery by vendorId or a daily log by vendor name', () => {
      entry('del-id', {
        entryType: 'delivery',
        metadata: JSON.stringify({ vendorId: 'v-1' }),
      });
      entry('log-name', { metadata: JSON.stringify({ vendor: 'Company B' }) });
      expect(listIds({ vendorId: 'v-1' })).not.toContain('del-id');
      expect(listIds({ vendorId: 'v-2' })).not.toContain('log-name');
    });

    it('an unknown company gives an empty list', () => {
      expect(listDiaryEntries(db, { vendorId: 'nope' }).items).toEqual([]);
    });

    it('an unknown id still matches daily logs that carry it', () => {
      entry('log-ghost', { metadata: JSON.stringify({ vendorId: 'ghost' }) });
      expect(listIds({ vendorId: 'ghost' })).toEqual(['log-ghost']);
    });

    it('malformed metadata JSON does not error', () => {
      entry('bad-log', { metadata: '{not json' });
      entry('bad-del', { entryType: 'delivery', metadata: 'nope' });
      expect(listIds({ vendorId: 'v-1' })).toEqual(['del-1', 'log-1']);
    });

    it('combines with type, status and q', () => {
      expect(listIds({ vendorId: 'v-1', type: 'delivery' })).toEqual(['del-1']);
      patchEntry('log-1', { status: 'draft' });
      expect(listIds({ vendorId: 'v-1', status: 'saved' })).toEqual(['del-1']);
      expect(listIds({ vendorId: 'v-1', q: 'log-1', status: 'saved' })).toEqual([]);
      expect(listIds({ vendorId: 'v-1', q: 'del-1' })).toEqual(['del-1']);
    });
  });

  // ─── getDiaryFilterOptions ─────────────────────────────────────────────────

  describe('getDiaryFilterOptions', () => {
    it('is empty without data', () => {
      expect(getDiaryFilterOptions(db)).toEqual({ types: [], areas: [], companies: [] });
    });

    it('lists the manual types in use in tuple order and skips drafts and automatic rows', () => {
      entry('e-issue', { entryType: 'issue' });
      entry('e-log', { entryType: 'daily_log' });
      entry('e-draft', { entryType: 'site_visit', status: 'draft' });
      entry('e-auto', {
        entryType: 'invoice_status',
        isAutomatic: true,
        title: null,
        body: '',
      });
      expect(getDiaryFilterOptions(db).types).toEqual(['daily_log', 'issue']);
    });

    it('lists photo areas with ancestors, excluding drafts and automatic entries', () => {
      area('a-root', 'Area A');
      area('a-child', 'Room 1', 'a-root');
      area('a-draft', 'Draft Area');
      area('a-auto', 'Auto Area');
      entry('e-1');
      photo('p-1', 'e-1', { areaId: 'a-child' });
      photo('p-2', 'e-1', { areaId: 'a-child' });
      photo('p-none', 'e-1');
      entry('e-draft', { status: 'draft' });
      photo('p-3', 'e-draft', { areaId: 'a-draft' });
      entry('e-auto', { isAutomatic: true, entryType: 'invoice_status' });
      photo('p-4', 'e-auto', { areaId: 'a-auto' });
      const { areas } = getDiaryFilterOptions(db);
      expect(areas.map((a) => a.id)).toEqual(['a-child']);
      expect(areas[0]!.ancestors!.map((a) => a.name)).toEqual(['Area A']);
    });

    it('lists companies once, from daily logs by id and deliveries by folded name, sorted', () => {
      vendor('v-b', 'beta Co');
      vendor('v-a', 'Alpha Co');
      vendor('v-c', 'Charlie Co');
      vendor('v-unused', 'Unused Co');
      vendor('v-draft', 'Draft Co');
      entry('log-a', { metadata: JSON.stringify({ vendorId: 'v-a' }) });
      entry('del-a', { entryType: 'delivery', metadata: JSON.stringify({ vendor: 'ALPHA CO' }) });
      entry('del-b', { entryType: 'delivery', metadata: JSON.stringify({ vendor: 'Beta Co' }) });
      entry('log-c', { metadata: JSON.stringify({ vendorId: 'v-c' }) });
      entry('log-draft', { status: 'draft', metadata: JSON.stringify({ vendorId: 'v-draft' }) });
      entry('bad', { metadata: '{oops' });
      expect(getDiaryFilterOptions(db).companies).toEqual([
        { id: 'v-a', name: 'Alpha Co' },
        { id: 'v-b', name: 'beta Co' },
        { id: 'v-c', name: 'Charlie Co' },
      ]);
    });

    it('orders companies with the same name by id', () => {
      vendor('v-2', 'Same Co');
      vendor('v-1', 'Same Co');
      entry('log-1', { metadata: JSON.stringify({ vendorId: 'v-1' }) });
      entry('log-2', { metadata: JSON.stringify({ vendorId: 'v-2' }) });
      expect(getDiaryFilterOptions(db).companies.map((c) => c.id)).toEqual(['v-1', 'v-2']);
    });
  });
});
