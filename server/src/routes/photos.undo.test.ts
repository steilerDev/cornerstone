/**
 * End-to-end (real photoService, real files, real undo store) tests for the undoable photo
 * delete (#2221): DELETE /api/photos/:id issues an Undo token, POST /api/undo/:token restores.
 *
 * The mocked-service route contract lives in photos.test.ts; this file proves the pieces fit:
 * rows, the .trash folder, the 30 s window, the discard step and the delete-path regressions.
 * All data is synthetic.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { UNDO_WINDOW_MS } from '@cornerstone/shared';
import type {
  ApiErrorResponse,
  DeletePhotoResponse,
  Photo,
  UndoResponse,
} from '@cornerstone/shared';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import * as draftCleanupService from '../services/draftCleanupService.js';
import { __resetLedgerForTests } from '../services/statusEventLedger.js';
import { undoStore } from '../services/undoService.js';
import { areas, diaryEntries, orientations, photos } from '../db/schema.js';

const PHOTO_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PHOTO_ID = '22222222-2222-4222-8222-222222222222';
const ENTRY_ID = 'entry-undo-1';
const SIGNED_META = JSON.stringify({
  signatures: [{ signerName: 'A', signerType: 'self', signatureDataUrl: 'data:x' }],
});
const FILES = {
  'original.jpg': 'original-bytes',
  'thumbnail.webp': 'thumbnail-bytes',
  'annotated.webp': 'annotated-bytes',
} as const;

describe('Photo delete Undo (real flow)', () => {
  const realNow = undoStore.now;
  let app: FastifyInstance;
  let tempDir: string;
  let storage: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-photo-undo-test-'));
    storage = join(tempDir, 'photos');
    mkdirSync(storage, { recursive: true });
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    process.env.PHOTO_STORAGE_PATH = storage;
    app = await buildApp();
    undoStore.snapshots.clear();
    (undoStore as { now: () => number }).now = () => Date.now();
    __resetLedgerForTests();
  });

  afterEach(async () => {
    jest.useRealTimers();
    if (app) await app.close();
    undoStore.snapshots.clear();
    (undoStore as { now: () => number }).now = realNow;
    process.env = originalEnv;
    rmSync(tempDir, { recursive: true, force: true });
  });

  async function session(email: string): Promise<{ userId: string; cookie: string }> {
    const user = await userService.createLocalUser(app.db, email, email, 'password-1234', 'member');
    const token = sessionService.createSession(app.db, user.id, 3600);
    return { userId: user.id, cookie: `cornerstone_session=${token}` };
  }

  function seedEntry(overrides: Partial<typeof diaryEntries.$inferInsert> = {}): string {
    const now = '2026-03-14T08:00:00.000Z';
    app.db
      .insert(diaryEntries)
      .values({
        id: ENTRY_ID,
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        title: 'Synthetic entry',
        body: 'Body',
        metadata: null,
        status: 'saved',
        isAutomatic: false,
        createdBy: null,
        createdAt: now,
        updatedAt: now,
        ...overrides,
      })
      .run();
    return overrides.id ?? ENTRY_ID;
  }

  function seedPhoto(
    userId: string | null,
    overrides: Partial<typeof photos.$inferInsert> = {},
  ): string {
    const id = overrides.id ?? PHOTO_ID;
    app.db
      .insert(photos)
      .values({
        id,
        entityType: 'diary_entry',
        entityId: ENTRY_ID,
        filename: 'original.jpg',
        originalFilename: 'site.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1234,
        width: 800,
        height: 600,
        takenAt: null,
        caption: 'Synthetic caption',
        areaId: null,
        orientationId: null,
        sortOrder: 2,
        createdBy: userId,
        createdAt: '2026-03-14T08:00:00.000Z',
        updatedAt: '2026-03-15T09:00:00.000Z',
        annotatedAt: '2026-03-16T10:00:00.000Z',
        ...overrides,
      })
      .run();
    const dir = join(storage, id);
    mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(FILES)) writeFileSync(join(dir, name), content);
    return id;
  }

  function photoRow(id = PHOTO_ID) {
    return app.db.select().from(photos).where(eq(photos.id, id)).get();
  }

  function del(cookie: string | undefined, id = PHOTO_ID) {
    return app.inject({
      method: 'DELETE',
      url: `/api/photos/${id}`,
      headers: cookie ? { cookie } : {},
    });
  }

  function undo(cookie: string | undefined, token: string) {
    return app.inject({
      method: 'POST',
      url: `/api/undo/${token}`,
      headers: cookie ? { cookie } : {},
    });
  }

  async function deleteAndGetToken(cookie: string, id = PHOTO_ID): Promise<string> {
    const res = await del(cookie, id);
    expect(res.statusCode).toBe(200);
    return res.json<DeletePhotoResponse>().undo.token;
  }

  const trashPath = (id = PHOTO_ID, name = '') => join(storage, '.trash', id, name);

  describe('DELETE /api/photos/:id', () => {
    it('removes the row, parks the files in .trash and returns an undo token', async () => {
      const { cookie, userId } = await session('del@example.com');
      seedEntry();
      seedPhoto(userId);

      const res = await del(cookie);

      expect(res.statusCode).toBe(200);
      const { undo: token } = res.json<DeletePhotoResponse>();
      expect(token.token).toMatch(/^u_[0-9a-f]{32}$/);
      expect(new Date(token.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(photoRow()).toBeUndefined();
      expect(existsSync(join(storage, PHOTO_ID))).toBe(false);
      for (const [name, content] of Object.entries(FILES)) {
        expect(readFileSync(trashPath(PHOTO_ID, name), 'utf8')).toBe(content);
      }
    });

    it('serves 404 for the file endpoints while the photo is in the trash', async () => {
      const { cookie, userId } = await session('del-404@example.com');
      seedEntry();
      seedPhoto(userId);
      await del(cookie);

      for (const url of [
        `/api/photos/${PHOTO_ID}`,
        `/api/photos/${PHOTO_ID}/file`,
        `/api/photos/${PHOTO_ID}/thumbnail`,
      ]) {
        const res = await app.inject({ method: 'GET', url, headers: { cookie } });
        expect(res.statusCode).toBe(404);
      }
    });

    it('requires authentication and leaves everything in place', async () => {
      const { userId } = await session('del-401@example.com');
      seedEntry();
      seedPhoto(userId);

      const res = await del(undefined);

      expect(res.statusCode).toBe(401);
      expect(photoRow()).toBeDefined();
      expect(existsSync(join(storage, PHOTO_ID, 'original.jpg'))).toBe(true);
      expect(undoStore.snapshots.size).toBe(0);
    });

    it('returns 404 for an unknown photo and issues no token', async () => {
      const { cookie } = await session('del-missing@example.com');

      const res = await del(cookie, '99999999-9999-4999-8999-999999999999');

      expect(res.statusCode).toBe(404);
      expect(undoStore.snapshots.size).toBe(0);
    });

    it('returns 403 IMMUTABLE_ENTRY for a photo of a saved, signed entry and keeps its files', async () => {
      const { cookie, userId } = await session('del-403@example.com');
      seedEntry({ status: 'saved', metadata: SIGNED_META });
      seedPhoto(userId);

      const res = await del(cookie);

      expect(res.statusCode).toBe(403);
      expect(res.json<ApiErrorResponse>().error.code).toBe('IMMUTABLE_ENTRY');
      expect(photoRow()).toBeDefined();
      expect(existsSync(join(storage, PHOTO_ID, 'original.jpg'))).toBe(true);
      expect(existsSync(join(storage, '.trash'))).toBe(false);
      expect(undoStore.snapshots.size).toBe(0);
    });

    it('allows deleting a photo of a signed draft', async () => {
      const { cookie, userId } = await session('del-draft@example.com');
      seedEntry({ status: 'draft', metadata: SIGNED_META });
      seedPhoto(userId);

      const res = await del(cookie);

      expect(res.statusCode).toBe(200);
      expect(photoRow()).toBeUndefined();
    });
  });

  describe('POST /api/undo/:token for a deleted photo', () => {
    it('restores the same photo: row, caption, annotation, order and files', async () => {
      const { cookie, userId } = await session('undo@example.com');
      seedEntry();
      seedPhoto(userId, { id: OTHER_PHOTO_ID, sortOrder: 1 });
      seedPhoto(userId);
      const before = await app.inject({
        method: 'GET',
        url: `/api/photos/${PHOTO_ID}`,
        headers: { cookie },
      });
      const token = await deleteAndGetToken(cookie);

      const res = await undo(cookie, token);

      expect(res.statusCode).toBe(200);
      expect(res.json<UndoResponse>().restored).toEqual([{ type: 'photo', id: PHOTO_ID }]);
      expect(photoRow()).toEqual(
        expect.objectContaining({
          id: PHOTO_ID,
          caption: 'Synthetic caption',
          sortOrder: 2,
          annotatedAt: '2026-03-16T10:00:00.000Z',
          createdAt: '2026-03-14T08:00:00.000Z',
          updatedAt: '2026-03-15T09:00:00.000Z',
          entityType: 'diary_entry',
          entityId: ENTRY_ID,
          createdBy: userId,
        }),
      );

      const after = await app.inject({
        method: 'GET',
        url: `/api/photos/${PHOTO_ID}`,
        headers: { cookie },
      });
      expect(after.statusCode).toBe(200);
      expect(after.json<Photo>()).toEqual(before.json<Photo>());
      expect(after.json<Photo>().thumbnailUrl).toBe(before.json<Photo>().thumbnailUrl);

      const file = await app.inject({
        method: 'GET',
        url: `/api/photos/${PHOTO_ID}/file`,
        headers: { cookie },
      });
      expect(file.statusCode).toBe(200);
      expect(file.body).toBe(FILES['annotated.webp']);
      const thumb = await app.inject({
        method: 'GET',
        url: `/api/photos/${PHOTO_ID}/thumbnail`,
        headers: { cookie },
      });
      expect(thumb.statusCode).toBe(200);
      expect(thumb.body).toBe(FILES['thumbnail.webp']);

      expect(existsSync(trashPath())).toBe(false);
      const list = await app.inject({
        method: 'GET',
        url: `/api/photos?entityType=diary_entry&entityId=${ENTRY_ID}`,
        headers: { cookie },
      });
      expect(list.json<{ photos: Photo[] }>().photos.map((p) => p.id)).toEqual([
        OTHER_PHOTO_ID,
        PHOTO_ID,
      ]);
    });

    it('restores a deleted area and orientation reference as null', async () => {
      const { cookie, userId } = await session('undo-refs@example.com');
      seedEntry();
      const now = '2026-01-01T00:00:00.000Z';
      app.db
        .insert(areas)
        .values({ id: 'area-x', name: 'Area X', sortOrder: 0, createdAt: now, updatedAt: now })
        .run();
      app.db
        .insert(orientations)
        .values({ id: 'orient-x', name: 'North X', sortOrder: 0, createdAt: now, updatedAt: now })
        .run();
      seedPhoto(userId, { areaId: 'area-x', orientationId: 'orient-x' });
      const token = await deleteAndGetToken(cookie);
      app.db.delete(areas).where(eq(areas.id, 'area-x')).run();
      app.db.delete(orientations).where(eq(orientations.id, 'orient-x')).run();

      const res = await undo(cookie, token);

      expect(res.statusCode).toBe(200);
      expect(photoRow()).toEqual(
        expect.objectContaining({
          areaId: null,
          orientationId: null,
          caption: 'Synthetic caption',
        }),
      );
    });

    it('is single-use: a second attempt returns 404', async () => {
      const { cookie, userId } = await session('undo-twice@example.com');
      seedEntry();
      seedPhoto(userId);
      const token = await deleteAndGetToken(cookie);

      expect((await undo(cookie, token)).statusCode).toBe(200);
      const second = await undo(cookie, token);

      expect(second.statusCode).toBe(404);
      expect(photoRow()).toBeDefined();
    });

    it('returns 409 and clears the trash when the diary entry was deleted inside the window', async () => {
      const { cookie, userId } = await session('undo-409@example.com');
      seedEntry();
      seedPhoto(userId);
      const token = await deleteAndGetToken(cookie);
      const removeEntry = await app.inject({
        method: 'DELETE',
        url: `/api/diary-entries/${ENTRY_ID}`,
        headers: { cookie },
      });
      expect(removeEntry.statusCode).toBe(204);

      const res = await undo(cookie, token);

      expect(res.statusCode).toBe(409);
      expect(res.json<ApiErrorResponse>().error.details).toEqual({
        changed: [{ type: 'photo', id: PHOTO_ID }],
      });
      expect(photoRow()).toBeUndefined();
      expect(existsSync(trashPath())).toBe(false);
      expect((await undo(cookie, token)).statusCode).toBe(404);
    });

    it('returns 409 when the entry was signed and saved inside the window', async () => {
      const { cookie, userId } = await session('undo-signed@example.com');
      seedEntry({ status: 'draft' });
      seedPhoto(userId);
      const token = await deleteAndGetToken(cookie);
      app.db
        .update(diaryEntries)
        .set({ status: 'saved', metadata: SIGNED_META })
        .where(eq(diaryEntries.id, ENTRY_ID))
        .run();

      const res = await undo(cookie, token);

      expect(res.statusCode).toBe(409);
      expect(photoRow()).toBeUndefined();
      expect(existsSync(trashPath())).toBe(false);
    });

    it('returns 409 when the entry became automatic', async () => {
      const { cookie, userId } = await session('undo-auto@example.com');
      seedEntry();
      seedPhoto(userId);
      const token = await deleteAndGetToken(cookie);
      app.db
        .update(diaryEntries)
        .set({ isAutomatic: true })
        .where(eq(diaryEntries.id, ENTRY_ID))
        .run();

      expect((await undo(cookie, token)).statusCode).toBe(409);
      expect(photoRow()).toBeUndefined();
    });

    it('returns 404 and inserts no row when the trashed files vanished', async () => {
      const { cookie, userId } = await session('undo-gone@example.com');
      seedEntry();
      seedPhoto(userId);
      const token = await deleteAndGetToken(cookie);
      rmSync(trashPath(), { recursive: true, force: true });

      const res = await undo(cookie, token);

      expect(res.statusCode).toBe(404);
      expect(photoRow()).toBeUndefined();
    });

    it("rejects another user's token with 404 and lets the owner undo afterwards", async () => {
      const owner = await session('owner@example.com');
      const other = await session('other@example.com');
      seedEntry();
      seedPhoto(owner.userId);
      const token = await deleteAndGetToken(owner.cookie);

      const foreign = await undo(other.cookie, token);

      expect(foreign.statusCode).toBe(404);
      expect(photoRow()).toBeUndefined();
      expect(existsSync(trashPath(PHOTO_ID, 'original.jpg'))).toBe(true);

      const mine = await undo(owner.cookie, token);
      expect(mine.statusCode).toBe(200);
      expect(photoRow()).toBeDefined();
      expect(existsSync(join(storage, PHOTO_ID, 'original.jpg'))).toBe(true);
    });
  });

  describe('trash lifecycle', () => {
    it('purges the trashed files once the 30 s window elapses', async () => {
      const { cookie, userId } = await session('expiry@example.com');
      seedEntry();
      seedPhoto(userId);
      jest.useFakeTimers({
        doNotFake: [
          'nextTick',
          'setImmediate',
          'clearImmediate',
          'setInterval',
          'clearInterval',
          'queueMicrotask',
          'performance',
          'hrtime',
        ],
      });
      const token = await deleteAndGetToken(cookie);
      expect(existsSync(trashPath())).toBe(true);

      jest.advanceTimersByTime(UNDO_WINDOW_MS - 1);
      expect(existsSync(trashPath())).toBe(true);
      jest.advanceTimersByTime(1);

      expect(existsSync(trashPath())).toBe(false);
      expect(photoRow()).toBeUndefined();
      jest.useRealTimers();
      expect((await undo(cookie, token)).statusCode).toBe(404);
    });

    it('does not touch the files of a restored photo when its window later elapses', async () => {
      const { cookie, userId } = await session('restored-timer@example.com');
      seedEntry();
      seedPhoto(userId);
      jest.useFakeTimers({
        doNotFake: [
          'nextTick',
          'setImmediate',
          'clearImmediate',
          'setInterval',
          'clearInterval',
          'queueMicrotask',
          'performance',
          'hrtime',
        ],
      });
      const token = await deleteAndGetToken(cookie);
      expect((await undo(cookie, token)).statusCode).toBe(200);

      jest.advanceTimersByTime(UNDO_WINDOW_MS * 2);

      expect(existsSync(join(storage, PHOTO_ID, 'original.jpg'))).toBe(true);
    });

    it('empties .trash at startup, keeping live photos', async () => {
      mkdirSync(join(storage, '.trash', 'leftover'), { recursive: true });
      writeFileSync(join(storage, '.trash', 'leftover', 'original.jpg'), 'stale');
      mkdirSync(join(storage, 'live-photo'), { recursive: true });
      writeFileSync(join(storage, 'live-photo', 'original.jpg'), 'live');
      const second = await buildApp();
      try {
        expect(existsSync(join(storage, '.trash'))).toBe(false);
        expect(readFileSync(join(storage, 'live-photo', 'original.jpg'), 'utf8')).toBe('live');
      } finally {
        await second.close();
      }
    });

    it('starts normally when there is no .trash', async () => {
      expect(existsSync(join(storage, '.trash'))).toBe(false);
      const second = await buildApp();
      await second.close();
    });
  });

  describe('permanent delete paths', () => {
    it('deleting a diary entry removes its photos immediately: no trash, no token', async () => {
      const { cookie, userId } = await session('perm-entry@example.com');
      seedEntry();
      seedPhoto(userId);

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/diary-entries/${ENTRY_ID}`,
        headers: { cookie },
      });

      expect(res.statusCode).toBe(204);
      expect(photoRow()).toBeUndefined();
      expect(existsSync(join(storage, PHOTO_ID))).toBe(false);
      expect(existsSync(join(storage, '.trash'))).toBe(false);
      expect(undoStore.snapshots.size).toBe(0);
    });

    it('the orphan draft cleanup removes photos immediately: no trash, no token', async () => {
      const { userId } = await session('perm-cleanup@example.com');
      seedEntry({
        status: 'draft',
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
      });
      seedPhoto(userId);

      await draftCleanupService.runOrphanCleanup(app.db, app.config, app.log);

      expect(app.db.select().from(diaryEntries).where(eq(diaryEntries.id, ENTRY_ID)).get()).toBe(
        undefined,
      );
      expect(photoRow()).toBeUndefined();
      expect(readdirSync(storage)).toEqual([]);
      expect(undoStore.snapshots.size).toBe(0);
    });
  });
});
