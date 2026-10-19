import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { listAreasWithCounts } from './areaCountsService.js';

describe('areaCountsService.listAreasWithCounts', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let seq = 0;

  const NOW = '2026-08-07T10:00:00.000Z';

  function addArea(name: string, parentId: string | null = null, sortOrder = 0): string {
    const id = `area-${++seq}`;
    db.insert(schema.areas)
      .values({ id, name, parentId, sortOrder, createdAt: NOW, updatedAt: NOW })
      .run();
    return id;
  }

  function addWorkItem(
    areaId: string | null,
    status: 'not_started' | 'in_progress' | 'completed' = 'not_started',
  ): void {
    db.insert(schema.workItems)
      .values({ id: `wi-${++seq}`, title: 'Task', status, areaId, createdAt: NOW, updatedAt: NOW })
      .run();
  }

  function addHouseholdItem(
    areaId: string | null,
    status: 'planned' | 'purchased' | 'scheduled' | 'arrived' = 'planned',
  ): void {
    db.insert(schema.householdItems)
      .values({
        id: `hi-${++seq}`,
        name: 'Sofa',
        categoryId: 'hic-furniture',
        status,
        areaId,
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
  }

  function addDiaryEntry(entryDate: string, status: 'draft' | 'saved' = 'saved'): string {
    const id = `de-${++seq}`;
    db.insert(schema.diaryEntries)
      .values({
        id,
        entryType: 'daily_log',
        entryDate,
        body: 'Note',
        status,
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
    return id;
  }

  function addPhoto(
    areaId: string | null,
    entityId: string,
    entityType: string = 'diary_entry',
  ): void {
    const id = `ph-${++seq}`;
    db.insert(schema.photos)
      .values({
        id,
        entityType,
        entityId,
        filename: `${id}.jpg`,
        originalFilename: 'p.jpg',
        mimeType: 'image/jpeg',
        fileSize: 10,
        areaId,
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
  }

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    seq = 0;
  });

  afterEach(() => {
    sqlite.close();
  });

  it('returns an empty list when there are no areas', () => {
    expect(listAreasWithCounts(db)).toEqual([]);
  });

  it('gives an area without attachments zero counts and a null latestDate', () => {
    const id = addArea('Attic');

    const [area] = listAreasWithCounts(db);

    expect(area!.id).toBe(id);
    expect(area!.counts).toEqual({
      workItems: { total: 0, open: 0 },
      householdItems: { total: 0, open: 0 },
      photos: { total: 0, latestDate: null },
    });
  });

  it('keeps every AreaResponse field next to counts', () => {
    const id = addArea('Attic');

    const [area] = listAreasWithCounts(db);

    expect(area).toMatchObject({
      id,
      name: 'Attic',
      parentId: null,
      description: null,
      color: null,
      sortOrder: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('counts work items per area, open = every status except completed', () => {
    const kitchen = addArea('Kitchen');
    const hall = addArea('Hall');
    addWorkItem(kitchen, 'not_started');
    addWorkItem(kitchen, 'in_progress');
    addWorkItem(kitchen, 'completed');
    addWorkItem(hall, 'completed');
    addWorkItem(null, 'in_progress');

    const byId = new Map(listAreasWithCounts(db).map((a) => [a.id, a.counts]));

    expect(byId.get(kitchen)!.workItems).toEqual({ total: 3, open: 2 });
    expect(byId.get(hall)!.workItems).toEqual({ total: 1, open: 0 });
  });

  it('counts household items per area, open = every status except arrived', () => {
    const kitchen = addArea('Kitchen');
    addHouseholdItem(kitchen, 'planned');
    addHouseholdItem(kitchen, 'purchased');
    addHouseholdItem(kitchen, 'scheduled');
    addHouseholdItem(kitchen, 'arrived');
    addHouseholdItem(null, 'planned');

    const [area] = listAreasWithCounts(db);

    expect(area!.counts.householdItems).toEqual({ total: 4, open: 3 });
  });

  it('counts only photos of saved diary entries and reports the latest entry date', () => {
    const kitchen = addArea('Kitchen');
    const early = addDiaryEntry('2026-03-01');
    const late = addDiaryEntry('2026-05-20');
    const draft = addDiaryEntry('2026-09-09', 'draft');
    addPhoto(kitchen, early);
    addPhoto(kitchen, late);
    addPhoto(kitchen, late);
    addPhoto(kitchen, draft); // draft entry: outside the Photos page scope
    addPhoto(kitchen, late, 'work_item'); // not a diary photo
    addPhoto(null, late); // no area

    const [area] = listAreasWithCounts(db);

    expect(area!.counts.photos).toEqual({ total: 3, latestDate: '2026-05-20' });
  });

  it('reports zero photos and no date when every photo sits on a draft entry', () => {
    const kitchen = addArea('Kitchen');
    addPhoto(kitchen, addDiaryEntry('2026-09-09', 'draft'));

    const [area] = listAreasWithCounts(db);

    expect(area!.counts.photos).toEqual({ total: 0, latestDate: null });
  });

  it('keeps counts direct: a parent does not include its children', () => {
    const parent = addArea('Ground floor');
    const child = addArea('Kitchen', parent);
    addWorkItem(child, 'in_progress');
    addHouseholdItem(child);
    addPhoto(child, addDiaryEntry('2026-04-04'));

    const byId = new Map(listAreasWithCounts(db).map((a) => [a.id, a.counts]));

    expect(byId.get(parent)).toEqual({
      workItems: { total: 0, open: 0 },
      householdItems: { total: 0, open: 0 },
      photos: { total: 0, latestDate: null },
    });
    expect(byId.get(child)).toEqual({
      workItems: { total: 1, open: 1 },
      householdItems: { total: 1, open: 1 },
      photos: { total: 1, latestDate: '2026-04-04' },
    });
  });

  it('combines the three sources for one area without cross-multiplying', () => {
    const kitchen = addArea('Kitchen');
    for (let i = 0; i < 3; i++) addWorkItem(kitchen);
    for (let i = 0; i < 2; i++) addHouseholdItem(kitchen);
    const entry = addDiaryEntry('2026-06-06');
    for (let i = 0; i < 4; i++) addPhoto(kitchen, entry);

    const [area] = listAreasWithCounts(db);

    expect(area!.counts).toEqual({
      workItems: { total: 3, open: 3 },
      householdItems: { total: 2, open: 2 },
      photos: { total: 4, latestDate: '2026-06-06' },
    });
  });

  it('filters by search (case-insensitive) and still attaches counts to the matches', () => {
    const kitchen = addArea('Kitchen');
    addArea('Bathroom');
    addWorkItem(kitchen);

    const result = listAreasWithCounts(db, 'kitch');

    expect(result.map((a) => a.name)).toEqual(['Kitchen']);
    expect(result[0]!.counts.workItems.total).toBe(1);
  });

  it('returns nothing when the search matches no area', () => {
    addArea('Kitchen');

    expect(listAreasWithCounts(db, 'zzz')).toEqual([]);
  });
});
