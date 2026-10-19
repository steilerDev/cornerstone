/**
 * Service tests for the diary rules of story #2220 (EPIC-21, contract 5):
 * type change on drafts, the title/text/photo content rule, date validation,
 * site_visit Start/End, the same-date title lookup and author stability.
 * All data is synthetic.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { eq } from 'drizzle-orm';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { registerSqlFunctions } from '../db/sqlFunctions.js';
import * as schema from '../db/schema.js';
import { users, diaryEntries, photos, vendors, areas } from '../db/schema.js';
import {
  createDiaryEntry,
  updateDiaryEntry,
  promoteDiaryEntry,
  lookupDiaryEntries,
  createAutomaticDiaryEntry,
} from './diaryService.js';
import { listSpotPhotos } from './photoSpotService.js';
import { ValidationError, InvalidMetadataError, ImmutableEntryError } from '../errors/AppError.js';
import type { CreateDiaryEntryRequest } from '@cornerstone/shared';

const CONTENT_ERROR = 'A saved entry needs a title, text or at least one photo';

const validSig = {
  signerName: 'Test Member A',
  signerType: 'self' as const,
  signatureDataUrl: 'data:image/png;base64,AAAA',
  signedAt: '2026-03-14T10:00:00.000Z',
};

describe('diaryService rules (#2220)', () => {
  let template: Buffer;
  let sqlite: ReturnType<typeof Database>;
  let db: BetterSQLite3Database<typeof schema>;
  const userA = 'user-rules-a';
  const userB = 'user-rules-b';
  let seq = 0;

  beforeAll(() => {
    const base = new Database(':memory:');
    runMigrations(base, undefined);
    template = base.serialize();
    base.close();
  });

  beforeEach(() => {
    seq = 0;
    sqlite = new Database(template);
    registerSqlFunctions(sqlite);
    db = drizzle(sqlite, { schema });
    const now = '2026-01-01T00:00:00.000Z';
    for (const [id, name] of [
      [userA, 'Test Member A'],
      [userB, 'Test Member B'],
    ] as const) {
      db.insert(users)
        .values({
          id,
          email: `${id}@test.example`,
          displayName: name,
          role: 'member',
          authProvider: 'local',
          passwordHash: 'hash',
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
  });

  afterEach(() => {
    if (sqlite.open) sqlite.close();
  });

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function insertEntry(overrides: Partial<typeof diaryEntries.$inferInsert> = {}): string {
    seq += 1;
    const id = `rules-entry-${seq}`;
    const ts = new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString();
    db.insert(diaryEntries)
      .values({
        id,
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        title: 'Formwork check',
        body: 'Some text',
        metadata: null,
        status: 'draft',
        isAutomatic: false,
        createdBy: userA,
        createdAt: ts,
        updatedAt: ts,
        ...overrides,
      })
      .run();
    return id;
  }

  function insertPhoto(entryId: string, extra: Partial<typeof photos.$inferInsert> = {}): string {
    seq += 1;
    const id = `rules-photo-${seq}`;
    const now = '2026-03-14T08:00:00.000Z';
    db.insert(photos)
      .values({
        id,
        entityType: 'diary_entry',
        entityId: entryId,
        filename: `${id}.jpg`,
        originalFilename: 'site.jpg',
        mimeType: 'image/jpeg',
        fileSize: 100,
        sortOrder: 0,
        createdBy: userA,
        createdAt: now,
        updatedAt: now,
        ...extra,
      })
      .run();
    return id;
  }

  function row(id: string) {
    const r = db.select().from(diaryEntries).where(eq(diaryEntries.id, id)).get();
    if (!r) throw new Error('row missing');
    return r;
  }

  function storedMeta(id: string): unknown {
    const raw = row(id).metadata;
    return raw === null ? null : JSON.parse(raw);
  }

  function insertVendor(): string {
    const now = '2026-01-01T00:00:00.000Z';
    db.insert(vendors)
      .values({ id: 'rules-vendor-1', name: 'Test Vendor', createdAt: now, updatedAt: now })
      .run();
    return 'rules-vendor-1';
  }

  function validationDetails(fn: () => unknown): Record<string, unknown> | undefined {
    try {
      fn();
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      return (e as ValidationError).details as Record<string, unknown> | undefined;
    }
    throw new Error('expected ValidationError');
  }

  // ─── AC1: type change on drafts ────────────────────────────────────────────

  describe('type change on a draft', () => {
    it('daily_log to site_visit keeps only the keys site_visit knows', () => {
      const vendorId = insertVendor();
      const id = insertEntry({
        entryType: 'daily_log',
        metadata: JSON.stringify({
          weather: 'sunny',
          workersOnSite: 3,
          vendorId,
          workStart: '07:00',
          workEnd: '15:00',
          signatures: [validSig],
        }),
      });
      const result = updateDiaryEntry(db, id, { entryType: 'site_visit' });
      expect(result.entryType).toBe('site_visit');
      expect(storedMeta(id)).toEqual({
        workStart: '07:00',
        workEnd: '15:00',
        signatures: [validSig],
      });
    });

    it('issue to delivery leaves null metadata', () => {
      const id = insertEntry({
        entryType: 'issue',
        metadata: JSON.stringify({ severity: 'high', resolutionStatus: 'open' }),
      });
      updateDiaryEntry(db, id, { entryType: 'delivery' });
      expect(row(id).entryType).toBe('delivery');
      expect(storedMeta(id)).toBeNull();
    });

    it('any type to general_note stores SQL NULL, not the string "null"', () => {
      const id = insertEntry({
        metadata: JSON.stringify({ weather: 'sunny', workersOnSite: 2 }),
      });
      updateDiaryEntry(db, id, { entryType: 'general_note' });
      expect(row(id).metadata).toBeNull();
      const raw = sqlite.prepare('SELECT metadata FROM diary_entries WHERE id = ?').get(id) as {
        metadata: unknown;
      };
      expect(raw.metadata).toBeNull();
    });

    it('drops unknown keys of metadata supplied with the type change, then validates', () => {
      const id = insertEntry({ entryType: 'daily_log', metadata: null });
      const result = updateDiaryEntry(db, id, {
        entryType: 'issue',
        metadata: { severity: 'low', resolutionStatus: 'open', weather: 'sunny' } as never,
      });
      expect(result.entryType).toBe('issue');
      expect(storedMeta(id)).toEqual({ severity: 'low', resolutionStatus: 'open' });
    });

    it('rejects invalid supplied metadata for the new type and leaves the entry unchanged', () => {
      const original = JSON.stringify({ weather: 'sunny' });
      const id = insertEntry({ entryType: 'daily_log', metadata: original });
      expect(() =>
        updateDiaryEntry(db, id, {
          entryType: 'issue',
          metadata: { severity: 'bogus' } as never,
        }),
      ).toThrow(InvalidMetadataError);
      expect(row(id).entryType).toBe('daily_log');
      expect(row(id).metadata).toBe(original);
    });

    it('the same type on a draft is accepted and does not filter metadata', () => {
      const original = JSON.stringify({ weather: 'sunny', legacyKey: 'kept' });
      const id = insertEntry({ entryType: 'daily_log', metadata: original });
      const result = updateDiaryEntry(db, id, { entryType: 'daily_log' });
      expect(result.entryType).toBe('daily_log');
      expect(row(id).metadata).toBe(original);
    });

    it('a signed draft keeps its signatures when the new type knows them', () => {
      const id = insertEntry({
        entryType: 'daily_log',
        metadata: JSON.stringify({ weather: 'sunny', signatures: [validSig] }),
      });
      const result = updateDiaryEntry(db, id, { entryType: 'issue' });
      expect(result.entryType).toBe('issue');
      expect(storedMeta(id)).toEqual({ signatures: [validSig] });
    });

    it('an automatic-type value is rejected as an invalid entry type', () => {
      const id = insertEntry();
      expect(() => updateDiaryEntry(db, id, { entryType: 'work_item_status' as never })).toThrow(
        'Only manual entry types are allowed',
      );
      expect(row(id).entryType).toBe('daily_log');
    });

    it('keeps created_by unchanged', () => {
      const id = insertEntry({ createdBy: userA });
      updateDiaryEntry(db, id, { entryType: 'general_note' });
      expect(row(id).createdBy).toBe(userA);
    });
  });

  describe('type change is refused where it must be', () => {
    it.each(['issue', 'daily_log'] as const)(
      'saved entry with entryType %s -> 400 on field entryType, DB unchanged',
      (entryType) => {
        const id = insertEntry({ status: 'saved', entryType: 'daily_log' });
        const details = validationDetails(() => updateDiaryEntry(db, id, { entryType }));
        expect(details).toEqual({ field: 'entryType' });
        expect(row(id).entryType).toBe('daily_log');
      },
    );

    it('automatic entry -> ImmutableEntryError (precedence over 400)', () => {
      const id = createAutomaticDiaryEntry(
        db,
        'work_item_status',
        '2026-03-14',
        'Formwork check',
        'auto',
        null,
        null,
      );
      expect(() => updateDiaryEntry(db, id, { entryType: 'issue' })).toThrow(ImmutableEntryError);
    });

    it('saved signed entry -> ImmutableEntryError', () => {
      const id = insertEntry({
        status: 'saved',
        entryType: 'issue',
        metadata: JSON.stringify({
          severity: 'low',
          resolutionStatus: 'open',
          signatures: [validSig],
        }),
      });
      expect(() => updateDiaryEntry(db, id, { entryType: 'general_note' })).toThrow(
        ImmutableEntryError,
      );
    });
  });

  // ─── AC2: content rule ─────────────────────────────────────────────────────

  describe('content rule on create (saved)', () => {
    const base = (extra: Partial<CreateDiaryEntryRequest>): CreateDiaryEntryRequest => ({
      entryType: 'general_note',
      entryDate: '2026-03-14',
      ...extra,
    });

    it('accepts a title only; body is the empty string', () => {
      const result = createDiaryEntry(db, userA, base({ title: 'Formwork check' }));
      expect(result.status).toBe('saved');
      expect(result.body).toBe('');
    });

    it('accepts a body only', () => {
      const result = createDiaryEntry(db, userA, base({ body: 'Rain, no work' }));
      expect(result.title).toBeNull();
      expect(result.body).toBe('Rain, no work');
    });

    it('accepts a short Note without a title', () => {
      const result = createDiaryEntry(db, userA, base({ body: 'Rain, no work' }));
      expect(result.entryType).toBe('general_note');
    });

    it('rejects a whitespace title with no body, naming title, body and photos', () => {
      const details = validationDetails(() => createDiaryEntry(db, userA, base({ title: '   ' })));
      expect(details).toEqual({ fields: ['title', 'body', 'photos'] });
    });

    it('stores the title trimmed, and null for a whitespace-only title (drafts too)', () => {
      const trimmed = createDiaryEntry(db, userA, base({ title: '  Formwork check  ' }));
      expect(row(trimmed.id).title).toBe('Formwork check');
      const draft = createDiaryEntry(db, userA, {
        entryType: 'general_note',
        status: 'draft',
        title: '   ',
      });
      expect(row(draft.id).title).toBeNull();
    });

    it('stores SQL NULL metadata when none is supplied', () => {
      const result = createDiaryEntry(db, userA, base({ title: 'Screed day 2' }));
      expect(row(result.id).metadata).toBeNull();
    });
  });

  describe('content rule on promote', () => {
    it('a draft with no title, text or photo is refused and stays a draft', () => {
      const id = insertEntry({ entryType: 'general_note', title: null, body: '' });
      expect(() => promoteDiaryEntry(db, id, {})).toThrow(CONTENT_ERROR);
      expect(row(id).status).toBe('draft');
    });

    it('a draft with one photo and nothing else is saved', () => {
      const id = insertEntry({ entryType: 'general_note', title: null, body: '' });
      insertPhoto(id);
      expect(promoteDiaryEntry(db, id, {}).status).toBe('saved');
    });

    it('a draft with only a title is saved', () => {
      const id = insertEntry({ entryType: 'general_note', title: 'Screed day 2', body: '' });
      expect(promoteDiaryEntry(db, id, {}).status).toBe('saved');
    });

    it('trims the title override, and a whitespace override counts as no title', () => {
      const id = insertEntry({ entryType: 'general_note', title: null, body: 'Text' });
      const result = promoteDiaryEntry(db, id, { title: '  Screed day 2 ' });
      expect(row(result.id).title).toBe('Screed day 2');
      const blank = insertEntry({ entryType: 'general_note', title: 'Old', body: '' });
      expect(() => promoteDiaryEntry(db, blank, { title: '   ' })).toThrow(CONTENT_ERROR);
    });

    it('site_visit still needs inspectorName and outcome even with a title', () => {
      const id = insertEntry({ entryType: 'site_visit', title: 'Formwork check', body: '' });
      expect(() => promoteDiaryEntry(db, id, {})).toThrow(/non-empty inspectorName/);
      expect(row(id).status).toBe('draft');
    });
  });

  describe('content rule on PATCH', () => {
    it('saved: body "" with a title is stored as ""', () => {
      const id = insertEntry({ status: 'saved', title: 'Formwork check', body: 'Text' });
      updateDiaryEntry(db, id, { body: '' });
      expect(row(id).body).toBe('');
    });

    it('saved: title null and body "" with no photo is refused and unchanged', () => {
      const id = insertEntry({ status: 'saved', title: 'Formwork check', body: 'Text' });
      expect(() => updateDiaryEntry(db, id, { title: null, body: '' })).toThrow(CONTENT_ERROR);
      expect(row(id).title).toBe('Formwork check');
      expect(row(id).body).toBe('Text');
    });

    it('saved: the same change with one photo is accepted', () => {
      const id = insertEntry({ status: 'saved', title: 'Formwork check', body: 'Text' });
      insertPhoto(id);
      const result = updateDiaryEntry(db, id, { title: null, body: '' });
      expect(result.title).toBeNull();
      expect(result.photoCount).toBe(1);
    });

    it('draft: body "" clears the previous text', () => {
      const id = insertEntry({ status: 'draft', body: 'Previous text' });
      updateDiaryEntry(db, id, { body: '' });
      expect(row(id).body).toBe('');
    });

    it('draft: title null and body "" with no photos is allowed', () => {
      const id = insertEntry({ status: 'draft', title: 'Old', body: 'Text' });
      const result = updateDiaryEntry(db, id, { title: null, body: '' });
      expect(result.title).toBeNull();
      expect(result.body).toBe('');
    });

    it('stores a trimmed title and null for whitespace', () => {
      const id = insertEntry({ status: 'draft', title: null });
      updateDiaryEntry(db, id, { title: '  Formwork check  ' });
      expect(row(id).title).toBe('Formwork check');
      updateDiaryEntry(db, id, { title: '  ' });
      expect(row(id).title).toBeNull();
    });
  });

  // ─── AC5: dates ────────────────────────────────────────────────────────────

  describe('entry date validation', () => {
    it.each(['2026-02-30', 'garbage', ''])('create (saved and draft) rejects %j', (entryDate) => {
      const saved = validationDetails(() =>
        createDiaryEntry(db, userA, {
          entryType: 'general_note',
          title: 'Formwork check',
          entryDate,
        }),
      );
      expect(saved).toEqual({ field: 'entryDate' });
      const draft = validationDetails(() =>
        createDiaryEntry(db, userA, { entryType: 'general_note', status: 'draft', entryDate }),
      );
      expect(draft).toEqual({ field: 'entryDate' });
    });

    it.each(['2026-02-30', 'garbage', ''])('PATCH and promote reject %j', (entryDate) => {
      const id = insertEntry({ status: 'draft', entryType: 'general_note' });
      expect(validationDetails(() => updateDiaryEntry(db, id, { entryDate }))).toEqual({
        field: 'entryDate',
      });
      expect(row(id).entryDate).toBe('2026-03-14');
      expect(validationDetails(() => promoteDiaryEntry(db, id, { entryDate }))).toEqual({
        field: 'entryDate',
      });
      expect(row(id).status).toBe('draft');
    });

    it('accepts a leap day', () => {
      const result = createDiaryEntry(db, userA, {
        entryType: 'general_note',
        title: 'Formwork check',
        entryDate: '2024-02-29',
      });
      expect(result.entryDate).toBe('2024-02-29');
    });

    it('PATCH on a saved unsigned entry stores the new date', () => {
      const id = insertEntry({ status: 'saved' });
      updateDiaryEntry(db, id, { entryDate: '2026-04-01' });
      expect(row(id).entryDate).toBe('2026-04-01');
    });

    it('PATCH on a saved signed entry is still locked', () => {
      const id = insertEntry({
        status: 'saved',
        entryType: 'issue',
        metadata: JSON.stringify({
          severity: 'low',
          resolutionStatus: 'open',
          signatures: [validSig],
        }),
      });
      expect(() => updateDiaryEntry(db, id, { entryDate: '2026-04-01' })).toThrow(
        ImmutableEntryError,
      );
      expect(row(id).entryDate).toBe('2026-03-14');
    });

    it('the spot listing shows the new entry date for the same photo', () => {
      const now = '2026-01-01T00:00:00.000Z';
      db.insert(areas)
        .values({
          id: 'rules-area-1',
          name: 'Test Area',
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const id = insertEntry({ status: 'saved', entryDate: '2026-05-04' });
      const photoId = insertPhoto(id, { areaId: 'rules-area-1' });

      const before = listSpotPhotos(db, 'rules-area-1', null).photos;
      expect(before.map((p) => [p.id, p.diaryEntry.entryDate])).toEqual([[photoId, '2026-05-04']]);

      updateDiaryEntry(db, id, { entryDate: '2026-05-01' });
      const after = listSpotPhotos(db, 'rules-area-1', null).photos;
      expect(after.map((p) => [p.id, p.diaryEntry.entryDate])).toEqual([[photoId, '2026-05-01']]);
    });
  });

  // ─── site_visit Start/End ──────────────────────────────────────────────────

  describe('site_visit workStart / workEnd', () => {
    const siteMeta = (extra: Record<string, unknown>) =>
      ({ inspectorName: 'Test Inspector', outcome: 'pass', ...extra }) as never;

    it('is accepted on create, PATCH and promote', () => {
      const created = createDiaryEntry(db, userA, {
        entryType: 'site_visit',
        entryDate: '2026-03-14',
        title: 'Formwork check',
        metadata: siteMeta({ workStart: '08:00', workEnd: '10:30' }),
      });
      expect(storedMeta(created.id)).toMatchObject({ workStart: '08:00', workEnd: '10:30' });

      updateDiaryEntry(db, created.id, {
        metadata: siteMeta({ workStart: '09:00', workEnd: '11:00' }),
      });
      expect(storedMeta(created.id)).toMatchObject({ workStart: '09:00', workEnd: '11:00' });

      const draft = insertEntry({
        entryType: 'site_visit',
        metadata: JSON.stringify({
          inspectorName: 'Test Inspector',
          outcome: 'pass',
          workStart: '08:00',
          workEnd: '10:30',
        }),
      });
      expect(promoteDiaryEntry(db, draft, {}).status).toBe('saved');
      expect(
        promoteDiaryEntry(db, insertEntry({ entryType: 'site_visit' }), {
          metadata: siteMeta({ workStart: '08:00', workEnd: '09:00' }),
        }).status,
      ).toBe('saved');
    });

    it.each([
      ['equal times', { workStart: '10:00', workEnd: '10:00' }, /^site_visit workEnd/],
      ['end before start', { workStart: '10:00', workEnd: '09:00' }, /^site_visit workEnd/],
      ['unpadded start', { workStart: '8:00' }, /^site_visit workStart/],
      ['unpadded end', { workEnd: '8:00' }, /^site_visit workEnd/],
    ])('rejects %s', (_label, extra, message) => {
      expect(() =>
        createDiaryEntry(db, userA, {
          entryType: 'site_visit',
          entryDate: '2026-03-14',
          title: 'Formwork check',
          metadata: siteMeta(extra),
        }),
      ).toThrow(message);
    });

    it('keeps the daily_log message prefix', () => {
      expect(() =>
        createDiaryEntry(db, userA, {
          entryType: 'daily_log',
          entryDate: '2026-03-14',
          title: 'Formwork check',
          metadata: { workStart: '10:00', workEnd: '09:00' },
        }),
      ).toThrow('daily_log workEnd must be strictly after workStart');
    });
  });

  // ─── AC4: lookup ───────────────────────────────────────────────────────────

  describe('lookupDiaryEntries', () => {
    const lookup = (title: string, extra: { entryDate?: string; excludeId?: string } = {}) =>
      lookupDiaryEntries(db, { entryDate: '2026-03-14', title, ...extra }).matches;

    it('matches case-, space- and umlaut-insensitively and reports the photo count', () => {
      const id = insertEntry({
        status: 'saved',
        entryType: 'issue',
        title: 'Ölwechsel Bagger',
      });
      insertPhoto(id);
      insertPhoto(id);
      insertPhoto(insertEntry({ title: 'Other title' }));
      expect(lookup('  oelwechsel bagger ')).toEqual([
        { id, entryType: 'issue', title: 'Ölwechsel Bagger', status: 'saved', photoCount: 2 },
      ]);
    });

    it('does not match another date or a substring', () => {
      insertEntry({ title: 'Ölwechsel Bagger' });
      expect(lookup('Ölwechsel Bagger', { entryDate: '2026-03-15' })).toEqual([]);
      expect(lookup('Ölwechsel')).toEqual([]);
    });

    it('includes drafts and excludes automatic entries', () => {
      const draft = insertEntry({ status: 'draft', title: 'Screed day 2' });
      createAutomaticDiaryEntry(
        db,
        'work_item_status',
        '2026-03-14',
        'Screed day 2',
        'auto',
        null,
        null,
      );
      expect(lookup('Screed day 2').map((m) => m.id)).toEqual([draft]);
    });

    it('excludeId removes exactly that entry', () => {
      const a = insertEntry({ title: 'Screed day 2' });
      const b = insertEntry({ title: 'Screed day 2' });
      expect(lookup('Screed day 2', { excludeId: a }).map((m) => m.id)).toEqual([b]);
    });

    it('returns at most 5, newest created first', () => {
      const ids: string[] = [];
      for (let i = 1; i <= 7; i++) {
        const ts = `2026-03-0${i}T10:00:00.000Z`;
        ids.push(insertEntry({ title: 'Screed day 2', createdAt: ts, updatedAt: ts }));
      }
      expect(lookup('Screed day 2').map((m) => m.id)).toEqual([...ids].reverse().slice(0, 5));
    });

    it('breaks createdAt ties by id descending', () => {
      const ts = '2026-03-01T10:00:00.000Z';
      const a = insertEntry({ title: 'Screed day 2', createdAt: ts, updatedAt: ts });
      const b = insertEntry({ title: 'Screed day 2', createdAt: ts, updatedAt: ts });
      expect(lookup('Screed day 2').map((m) => m.id)).toEqual([a, b].sort().reverse());
    });

    it('matches a stored title with a leading tab or newline and trailing whitespace', () => {
      const tab = insertEntry({ title: '\tFormwork check' });
      const nl = insertEntry({ title: '\nFormwork check \r\n' });
      expect(
        lookup(' Formwork check\n')
          .map((m) => m.id)
          .sort(),
      ).toEqual([tab, nl].sort());
    });

    it('never matches entries without a title', () => {
      insertEntry({ title: null });
      expect(lookup('Formwork check')).toEqual([]);
    });

    it.each(['', '2026-02-30', 'garbage'])('rejects entryDate %j', (entryDate) => {
      expect(
        validationDetails(() => lookupDiaryEntries(db, { entryDate, title: 'Formwork check' })),
      ).toEqual({ field: 'entryDate' });
    });

    it('rejects a blank title, a title that folds to empty, and an over-long title', () => {
      for (const title of ['   ', '́', 'x'.repeat(1001)]) {
        expect(validationDetails(() => lookup(title))).toEqual({ field: 'title' });
      }
    });

    it('treats a missing title as blank', () => {
      expect(
        validationDetails(() => lookupDiaryEntries(db, { entryDate: '2026-03-14' } as never)),
      ).toEqual({ field: 'title' });
    });
  });

  // ─── AC6: author ───────────────────────────────────────────────────────────

  describe('author', () => {
    it('is the creating user and survives PATCH, type change and promote', () => {
      const created = createDiaryEntry(db, userA, {
        entryType: 'daily_log',
        status: 'draft',
        title: 'Formwork check',
      });
      expect(created.createdBy?.id).toBe(userA);

      const patched = updateDiaryEntry(db, created.id, { body: 'More text' });
      expect(patched.createdBy?.id).toBe(userA);
      const retyped = updateDiaryEntry(db, created.id, { entryType: 'general_note' });
      expect(retyped.createdBy?.id).toBe(userA);
      const promoted = promoteDiaryEntry(db, created.id, {});
      expect(promoted.createdBy?.id).toBe(userA);
      expect(row(created.id).createdBy).not.toBe(userB);
    });
  });
});
