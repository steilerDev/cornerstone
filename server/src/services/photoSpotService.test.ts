/**
 * Tests for photoSpotService (Story #2162: Photo browser).
 * Real in-memory SQLite database with all migrations applied.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { NotFoundError } from '../errors/AppError.js';
import { listPhotoSpots, listSpotPhotos } from './photoSpotService.js';

describe('photoSpotService', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let counter = 0;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    counter = 0;
  });

  afterEach(() => {
    sqlite.close();
  });

  function nextId(prefix: string): string {
    counter += 1;
    return `${prefix}-${String(counter).padStart(4, '0')}`;
  }

  function insertArea(name: string, opts: { parentId?: string; sortOrder?: number } = {}): string {
    const id = nextId('area');
    const now = new Date().toISOString();
    db.insert(schema.areas)
      .values({
        id,
        name,
        parentId: opts.parentId ?? null,
        color: '#112233',
        sortOrder: opts.sortOrder ?? 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertOrientation(name: string, sortOrder = 0): string {
    const id = nextId('orient');
    const now = new Date().toISOString();
    db.insert(schema.orientations)
      .values({ id, name, description: `${name} desc`, sortOrder, createdAt: now, updatedAt: now })
      .run();
    return id;
  }

  function insertEntry(
    opts: {
      entryDate?: string;
      status?: 'draft' | 'saved';
      title?: string | null;
      createdAt?: string;
      entryType?: 'daily_log' | 'issue';
    } = {},
  ): string {
    const id = nextId('entry');
    const createdAt = opts.createdAt ?? '2026-01-01T00:00:00.000Z';
    db.insert(schema.diaryEntries)
      .values({
        id,
        entryType: opts.entryType ?? 'daily_log',
        entryDate: opts.entryDate ?? '2026-09-11',
        title: opts.title === undefined ? 'Entry title' : opts.title,
        body: 'body',
        status: opts.status ?? 'saved',
        isAutomatic: false,
        createdAt,
        updatedAt: createdAt,
      })
      .run();
    return id;
  }

  function insertPhoto(opts: {
    id?: string;
    entityType?: string;
    entityId: string;
    areaId?: string | null;
    orientationId?: string | null;
    sortOrder?: number;
    createdAt?: string;
    updatedAt?: string;
    annotatedAt?: string | null;
    takenAt?: string | null;
    caption?: string | null;
  }): string {
    const id = opts.id ?? nextId('photo');
    const createdAt = opts.createdAt ?? '2026-01-01T00:00:00.000Z';
    db.insert(schema.photos)
      .values({
        id,
        entityType: opts.entityType ?? 'diary_entry',
        entityId: opts.entityId,
        filename: `${id}.jpg`,
        originalFilename: 'orig.jpg',
        mimeType: 'image/jpeg',
        fileSize: 100,
        width: 800,
        height: 600,
        takenAt: opts.takenAt ?? null,
        caption: opts.caption ?? null,
        areaId: opts.areaId ?? null,
        orientationId: opts.orientationId ?? null,
        sortOrder: opts.sortOrder ?? 0,
        createdAt,
        updatedAt: opts.updatedAt ?? createdAt,
        annotatedAt: opts.annotatedAt ?? null,
      })
      .run();
    return id;
  }

  describe('listPhotoSpots', () => {
    it('returns no spots on an empty database but still lists areas and orientations in sortOrder, name order', () => {
      const b = insertArea('Bravo', { sortOrder: 2 });
      const a = insertArea('Alpha', { sortOrder: 2 });
      const first = insertArea('Zulu', { sortOrder: 1 });
      const o2 = insertOrientation('North', 2);
      const o1 = insertOrientation('Ceiling', 1);

      const result = listPhotoSpots(db);

      expect(result.spots).toEqual([]);
      expect(result.areas.map((x) => x.id)).toEqual([first, a, b]);
      expect(result.orientations.map((x) => x.id)).toEqual([o1, o2]);
    });

    it('counts only diary_entry photos (room and test photos excluded)', () => {
      const area = insertArea('Kitchen');
      const o = insertOrientation('North');
      const entry = insertEntry();
      insertPhoto({ entityId: entry, areaId: area, orientationId: o });
      insertPhoto({ entityType: 'room', entityId: entry, areaId: area, orientationId: o });
      insertPhoto({ entityType: 'test', entityId: entry, areaId: area, orientationId: o });

      const { spots } = listPhotoSpots(db);

      expect(spots).toHaveLength(1);
      expect(spots[0]!.photoCount).toBe(1);
    });

    it('excludes photos on draft diary entries from both endpoints', () => {
      const area = insertArea('Kitchen');
      const o = insertOrientation('North');
      const draft = insertEntry({ status: 'draft' });
      insertPhoto({ entityId: draft, areaId: area, orientationId: o });

      expect(listPhotoSpots(db).spots).toEqual([]);
      expect(listSpotPhotos(db, area, o).photos).toEqual([]);
    });

    it('excludes orphan photos whose diary entry no longer exists', () => {
      const area = insertArea('Kitchen');
      const o = insertOrientation('North');
      insertPhoto({ entityId: 'missing-entry', areaId: area, orientationId: o });

      expect(listPhotoSpots(db).spots).toEqual([]);
      expect(listSpotPhotos(db, area, o).photos).toEqual([]);
    });

    it('reports the diary entry date, never the photo takenAt/createdAt', () => {
      const area = insertArea('Kitchen');
      const o = insertOrientation('North');
      const entry = insertEntry({ entryDate: '2026-09-11' });
      insertPhoto({
        entityId: entry,
        areaId: area,
        orientationId: o,
        takenAt: '2020-01-01T10:00:00.000Z',
      });

      expect(listPhotoSpots(db).spots[0]!.latestEntryDate).toBe('2026-09-11');
      expect(listSpotPhotos(db, area, o).photos[0]!.diaryEntry.entryDate).toBe('2026-09-11');
    });

    it('counts 3 photos over 2 entries and picks the photo on the newer entry date as latest', () => {
      const area = insertArea('Kitchen');
      const o = insertOrientation('North');
      const older = insertEntry({ entryDate: '2026-09-01' });
      const newer = insertEntry({ entryDate: '2026-09-20' });
      insertPhoto({ entityId: older, areaId: area, orientationId: o });
      insertPhoto({ entityId: older, areaId: area, orientationId: o });
      const newest = insertPhoto({ entityId: newer, areaId: area, orientationId: o });

      const spot = listPhotoSpots(db).spots[0]!;

      expect(spot.photoCount).toBe(3);
      expect(spot.latestPhotoId).toBe(newest);
      expect(spot.latestEntryDate).toBe('2026-09-20');
      expect(listSpotPhotos(db, area, o).photos[0]!.id).toBe(spot.latestPhotoId);
    });

    it('breaks a same-entry-date tie by newer diary entry createdAt', () => {
      const area = insertArea('Kitchen');
      const o = insertOrientation('North');
      const early = insertEntry({ createdAt: '2026-09-11T08:00:00.000Z' });
      const late = insertEntry({ createdAt: '2026-09-11T17:00:00.000Z' });
      insertPhoto({ entityId: early, areaId: area, orientationId: o });
      const latePhoto = insertPhoto({ entityId: late, areaId: area, orientationId: o });

      const spot = listPhotoSpots(db).spots[0]!;

      expect(spot.latestPhotoId).toBe(latePhoto);
      expect(listSpotPhotos(db, area, o).photos[0]!.id).toBe(spot.latestPhotoId);
    });

    it('breaks a same-entry tie by photo sort_order ascending', () => {
      const area = insertArea('Kitchen');
      const o = insertOrientation('North');
      const entry = insertEntry();
      insertPhoto({ entityId: entry, areaId: area, orientationId: o, sortOrder: 5 });
      const first = insertPhoto({ entityId: entry, areaId: area, orientationId: o, sortOrder: 1 });

      const spot = listPhotoSpots(db).spots[0]!;

      expect(spot.latestPhotoId).toBe(first);
      expect(listSpotPhotos(db, area, o).photos[0]!.id).toBe(first);
    });

    it('breaks a sort_order tie by photo createdAt ascending', () => {
      const area = insertArea('Kitchen');
      const o = insertOrientation('North');
      const entry = insertEntry();
      insertPhoto({
        entityId: entry,
        areaId: area,
        orientationId: o,
        createdAt: '2026-02-01T00:00:00.000Z',
      });
      const earlier = insertPhoto({
        entityId: entry,
        areaId: area,
        orientationId: o,
        createdAt: '2026-01-01T00:00:00.000Z',
      });

      expect(listPhotoSpots(db).spots[0]!.latestPhotoId).toBe(earlier);
      expect(listSpotPhotos(db, area, o).photos[0]!.id).toBe(earlier);
    });

    it('breaks a full tie by photo id ascending so listing[0] always equals latestPhotoId', () => {
      const area = insertArea('Kitchen');
      const o = insertOrientation('North');
      const entry = insertEntry();
      insertPhoto({ id: 'photo-b', entityId: entry, areaId: area, orientationId: o });
      insertPhoto({ id: 'photo-a', entityId: entry, areaId: area, orientationId: o });
      insertPhoto({ id: 'photo-c', entityId: entry, areaId: area, orientationId: o });

      const spot = listPhotoSpots(db).spots[0]!;
      const list = listSpotPhotos(db, area, o).photos;

      expect(spot.latestPhotoId).toBe('photo-a');
      expect(list.map((p) => p.id)).toEqual(['photo-a', 'photo-b', 'photo-c']);
    });

    it('lists (null,X), (A,null) and (null,null) as separate spots with null ids', () => {
      const area = insertArea('Kitchen');
      const o = insertOrientation('North');
      const entry = insertEntry();
      insertPhoto({ entityId: entry, areaId: null, orientationId: o });
      insertPhoto({ entityId: entry, areaId: area, orientationId: null });
      insertPhoto({ entityId: entry, areaId: null, orientationId: null });

      const spots = listPhotoSpots(db).spots;
      const keys = spots.map((s) => `${s.areaId}|${s.orientationId}`).sort();

      expect(keys).toEqual([`${area}|null`, `null|${o}`, 'null|null'].sort());
      expect(spots.every((s) => s.photoCount === 1)).toBe(true);
    });

    it('builds ?v= from annotatedAt when set, otherwise updatedAt', () => {
      const area = insertArea('Kitchen');
      const o = insertOrientation('North');
      const o2 = insertOrientation('South');
      const entry = insertEntry();
      const annotated = insertPhoto({
        entityId: entry,
        areaId: area,
        orientationId: o,
        updatedAt: '2026-03-01T00:00:00.000Z',
        annotatedAt: '2026-04-01T00:00:00.000Z',
      });
      const plain = insertPhoto({
        entityId: entry,
        areaId: area,
        orientationId: o2,
        updatedAt: '2026-03-01T00:00:00.000Z',
      });

      const spots = listPhotoSpots(db).spots;
      const annotatedSpot = spots.find((s) => s.latestPhotoId === annotated)!;
      const plainSpot = spots.find((s) => s.latestPhotoId === plain)!;

      expect(annotatedSpot.latestThumbnailUrl).toBe(
        `/api/photos/${annotated}/thumbnail?v=${encodeURIComponent('2026-04-01T00:00:00.000Z')}`,
      );
      expect(plainSpot.latestThumbnailUrl).toBe(
        `/api/photos/${plain}/thumbnail?v=${encodeURIComponent('2026-03-01T00:00:00.000Z')}`,
      );
      const item = listSpotPhotos(db, area, o).photos[0]!;
      expect(item.fileUrl).toBe(
        `/api/photos/${annotated}/file?v=${encodeURIComponent('2026-04-01T00:00:00.000Z')}`,
      );
      expect(item.thumbnailUrl).toContain(`/api/photos/${annotated}/thumbnail?v=`);
    });
  });

  describe('listSpotPhotos', () => {
    it('matches exactly one spot: child-area photos are not in the parent spot', () => {
      const parent = insertArea('House');
      const child = insertArea('Kitchen', { parentId: parent });
      const o = insertOrientation('North');
      const entry = insertEntry();
      insertPhoto({ entityId: entry, areaId: parent, orientationId: o });
      const childPhoto = insertPhoto({ entityId: entry, areaId: child, orientationId: o });

      const parentList = listSpotPhotos(db, parent, o).photos;
      const childList = listSpotPhotos(db, child, o).photos;

      expect(parentList).toHaveLength(1);
      expect(parentList.map((p) => p.id)).not.toContain(childPhoto);
      expect(childList.map((p) => p.id)).toEqual([childPhoto]);
    });

    it('selects only photos with NULL area/orientation when ids are null', () => {
      const area = insertArea('Kitchen');
      const o = insertOrientation('North');
      const entry = insertEntry();
      insertPhoto({ entityId: entry, areaId: area, orientationId: o });
      insertPhoto({ entityId: entry, areaId: area, orientationId: null });
      insertPhoto({ entityId: entry, areaId: null, orientationId: o });
      const none = insertPhoto({ entityId: entry, areaId: null, orientationId: null });

      const result = listSpotPhotos(db, null, null);

      expect(result.photos.map((p) => p.id)).toEqual([none]);
      expect(result.area).toBeNull();
      expect(result.orientation).toBeNull();
    });

    it('orders newest first and returns diaryEntry id, type, null-preserving title and date', () => {
      const area = insertArea('Kitchen');
      const o = insertOrientation('North');
      const older = insertEntry({ entryDate: '2026-09-01', title: null, entryType: 'issue' });
      const newer = insertEntry({ entryDate: '2026-09-20', title: 'Fresh' });
      const p1 = insertPhoto({
        entityId: older,
        areaId: area,
        orientationId: o,
        caption: 'cap',
      });
      const p2 = insertPhoto({ entityId: newer, areaId: area, orientationId: o });

      const { photos } = listSpotPhotos(db, area, o);

      expect(photos.map((p) => p.id)).toEqual([p2, p1]);
      expect(photos[0]!.diaryEntry).toEqual({
        id: newer,
        entryType: 'daily_log',
        title: 'Fresh',
        entryDate: '2026-09-20',
      });
      expect(photos[1]!.diaryEntry).toEqual({
        id: older,
        entryType: 'issue',
        title: null,
        entryDate: '2026-09-01',
      });
      expect(photos[1]!.caption).toBe('cap');
      expect(photos[1]!.width).toBe(800);
      expect(photos[1]!.height).toBe(600);
    });

    it('returns the area as an AreaSummary with root-first ancestors and the orientation summary', () => {
      const root = insertArea('House');
      const mid = insertArea('Ground floor', { parentId: root });
      const leaf = insertArea('Kitchen', { parentId: mid });
      const o = insertOrientation('North');

      const result = listSpotPhotos(db, leaf, o);

      expect(result.area).toEqual({
        id: leaf,
        name: 'Kitchen',
        color: '#112233',
        ancestors: [
          { id: root, name: 'House', color: '#112233' },
          { id: mid, name: 'Ground floor', color: '#112233' },
        ],
      });
      expect(result.orientation).toEqual({ id: o, name: 'North', description: 'North desc' });
      expect(result.photos).toEqual([]);
    });

    it('throws NotFoundError "Area not found" for an unknown area, even if the orientation is also unknown', () => {
      expect(() => listSpotPhotos(db, 'nope', 'nope2')).toThrow(NotFoundError);
      expect(() => listSpotPhotos(db, 'nope', 'nope2')).toThrow('Area not found');
    });

    it('throws NotFoundError "Orientation not found" for an unknown orientation', () => {
      const area = insertArea('Kitchen');
      expect(() => listSpotPhotos(db, area, 'nope')).toThrow('Orientation not found');
      expect(() => listSpotPhotos(db, null, 'nope')).toThrow(NotFoundError);
    });
  });
});
