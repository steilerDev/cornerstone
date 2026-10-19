/**
 * End-to-end (real app, DB, photoService and undo store) tests for photo tag changes (#2226):
 * PATCH /api/photos/tags (bulk), the additive `undo` field of PATCH /api/photos/:id and the
 * tag Undo through POST /api/undo/:token. All data is synthetic.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type {
  ApiErrorResponse,
  UpdatePhotoResponse,
  UpdatePhotoTagsResponse,
  UndoResponse,
} from '@cornerstone/shared';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { __resetLedgerForTests } from '../services/statusEventLedger.js';
import { undoStore } from '../services/undoService.js';
import { areas, diaryEntries, orientations, photos } from '../db/schema.js';

const SIGNED_META = JSON.stringify({
  signatures: [{ signerName: 'A', signerType: 'self', signatureDataUrl: 'data:x' }],
});
const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const P3 = '33333333-3333-4333-8333-333333333333';
const ENTRY = 'entry-tags-1';
const AREA_A = 'area-tags-a';
const AREA_B = 'area-tags-b';
const ORI_N = 'ori-tags-n';
const ORI_S = 'ori-tags-s';

describe('Photo tag changes (real flow)', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let cookie: string;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-photo-tags-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    process.env.PHOTO_STORAGE_PATH = join(tempDir, 'photos');
    app = await buildApp();
    undoStore.snapshots.clear();
    __resetLedgerForTests();
    cookie = (await session('tags@example.com')).cookie;
    seedTags();
  });

  afterEach(async () => {
    if (app) await app.close();
    undoStore.snapshots.clear();
    process.env = originalEnv;
    rmSync(tempDir, { recursive: true, force: true });
  });

  async function session(email: string): Promise<{ userId: string; cookie: string }> {
    const user = await userService.createLocalUser(app.db, email, email, 'password-1234', 'member');
    const token = sessionService.createSession(app.db, user.id, 3600);
    return { userId: user.id, cookie: `cornerstone_session=${token}` };
  }

  function seedTags(): void {
    const now = '2026-03-14T08:00:00.000Z';
    for (const [id, name] of [
      [AREA_A, 'Test Room A'],
      [AREA_B, 'Test Room B'],
    ] as const) {
      app.db
        .insert(areas)
        .values({ id, name, color: null, sortOrder: 0, createdAt: now, updatedAt: now })
        .run();
    }
    for (const [id, name] of [
      [ORI_N, 'Test North'],
      [ORI_S, 'Test South'],
    ] as const) {
      app.db
        .insert(orientations)
        .values({ id, name, description: null, sortOrder: 0, createdAt: now, updatedAt: now })
        .run();
    }
  }

  function seedEntry(
    id = ENTRY,
    overrides: Partial<typeof diaryEntries.$inferInsert> = {},
  ): string {
    const now = '2026-03-14T08:00:00.000Z';
    app.db
      .insert(diaryEntries)
      .values({
        id,
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
    return id;
  }

  function seedPhoto(id: string, overrides: Partial<typeof photos.$inferInsert> = {}): string {
    app.db
      .insert(photos)
      .values({
        id,
        entityType: 'diary_entry',
        entityId: ENTRY,
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
        sortOrder: 0,
        createdBy: null,
        createdAt: '2026-03-14T08:00:00.000Z',
        updatedAt: '2026-03-15T09:00:00.000Z',
        ...overrides,
      })
      .run();
    return id;
  }

  function row(id: string) {
    return app.db.select().from(photos).where(eq(photos.id, id)).get();
  }

  function tagsOf(id: string) {
    const r = row(id);
    return r ? { areaId: r.areaId, orientationId: r.orientationId } : undefined;
  }

  function patchTags(body: unknown, headers: Record<string, string> | undefined = { cookie }) {
    return app.inject({
      method: 'PATCH',
      url: '/api/photos/tags',
      headers,
      payload: body as object,
    });
  }

  function patchPhoto(id: string, body: object) {
    return app.inject({
      method: 'PATCH',
      url: `/api/photos/${id}`,
      headers: { cookie },
      payload: body,
    });
  }

  function undo(token: string, headers: Record<string, string> = { cookie }) {
    return app.inject({ method: 'POST', url: `/api/undo/${token}`, headers });
  }

  describe('PATCH /api/photos/tags', () => {
    it('sets the area on every listed photo and leaves the orientation alone when the key is absent', async () => {
      seedEntry();
      seedPhoto(P1, { orientationId: ORI_N });
      seedPhoto(P2, { orientationId: ORI_S });
      seedPhoto(P3);

      const res = await patchTags({ photoIds: [P1, P2], areaId: AREA_A });

      expect(res.statusCode).toBe(200);
      const body = res.json<UpdatePhotoTagsResponse>();
      expect(body.updated).toBe(2);
      expect(body.undo.token).toMatch(/^u_[0-9a-f]{32}$/);
      expect(new Date(body.undo.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(tagsOf(P1)).toEqual({ areaId: AREA_A, orientationId: ORI_N });
      expect(tagsOf(P2)).toEqual({ areaId: AREA_A, orientationId: ORI_S });
      expect(tagsOf(P3)).toEqual({ areaId: null, orientationId: null });
    });

    it('sets only the orientation and bumps updated_at', async () => {
      seedEntry();
      seedPhoto(P1, { areaId: AREA_B });

      const res = await patchTags({ photoIds: [P1], orientationId: ORI_S });

      expect(res.statusCode).toBe(200);
      expect(tagsOf(P1)).toEqual({ areaId: AREA_B, orientationId: ORI_S });
      expect(row(P1)!.updatedAt).not.toBe('2026-03-15T09:00:00.000Z');
    });

    it('sets area and orientation together', async () => {
      seedEntry();
      seedPhoto(P1);

      const res = await patchTags({ photoIds: [P1], areaId: AREA_A, orientationId: ORI_N });

      expect(res.statusCode).toBe(200);
      expect(tagsOf(P1)).toEqual({ areaId: AREA_A, orientationId: ORI_N });
    });

    it('clears a tag with null and keeps the other', async () => {
      seedEntry();
      seedPhoto(P1, { areaId: AREA_A, orientationId: ORI_N });

      const res = await patchTags({ photoIds: [P1], areaId: null });
      expect(res.statusCode).toBe(200);
      expect(tagsOf(P1)).toEqual({ areaId: null, orientationId: ORI_N });

      const res2 = await patchTags({ photoIds: [P1], orientationId: null });
      expect(res2.statusCode).toBe(200);
      expect(tagsOf(P1)).toEqual({ areaId: null, orientationId: null });
    });

    it('issues a token even when nothing changes', async () => {
      seedEntry();
      seedPhoto(P1, { areaId: AREA_A });

      const res = await patchTags({ photoIds: [P1], areaId: AREA_A });

      expect(res.statusCode).toBe(200);
      expect(res.json<UpdatePhotoTagsResponse>().undo.token).toMatch(/^u_/);
      expect(undoStore.snapshots.size).toBe(1);
    });

    it('is not captured by PATCH /:id', async () => {
      seedEntry();
      seedPhoto(P1);

      const res = await patchTags({ photoIds: [P1], areaId: AREA_A });

      expect(res.statusCode).toBe(200);
      expect(res.json<UpdatePhotoTagsResponse>().updated).toBe(1);
    });

    it('accepts photos that are not diary photos', async () => {
      seedPhoto(P1, { entityType: 'work_item', entityId: 'wi-1' });

      const res = await patchTags({ photoIds: [P1], areaId: AREA_A });

      expect(res.statusCode).toBe(200);
      expect(tagsOf(P1)?.areaId).toBe(AREA_A);
    });

    it('allows photos of a draft entry and of a saved entry with empty signatures', async () => {
      seedEntry('draft-1', { status: 'draft', metadata: SIGNED_META });
      seedEntry('saved-empty', { metadata: JSON.stringify({ signatures: [] }) });
      seedPhoto(P1, { entityId: 'draft-1' });
      seedPhoto(P2, { entityId: 'saved-empty' });

      const res = await patchTags({ photoIds: [P1, P2], areaId: AREA_A });

      expect(res.statusCode).toBe(200);
      expect(tagsOf(P1)?.areaId).toBe(AREA_A);
      expect(tagsOf(P2)?.areaId).toBe(AREA_A);
    });

    it('returns 401 without a session and changes nothing', async () => {
      seedEntry();
      seedPhoto(P1);

      const res = await patchTags({ photoIds: [P1], areaId: AREA_A }, {});

      expect(res.statusCode).toBe(401);
      expect(tagsOf(P1)).toEqual({ areaId: null, orientationId: null });
      expect(undoStore.snapshots.size).toBe(0);
    });

    describe('validation', () => {
      it.each([
        ['empty photoIds', { photoIds: [], areaId: AREA_A }],
        [
          'more than 1000 ids',
          { photoIds: Array.from({ length: 1001 }, (_, i) => `p-${i}`), areaId: AREA_A },
        ],
        ['duplicate ids', { photoIds: [P1, P1], areaId: AREA_A }],
        ['neither areaId nor orientationId', { photoIds: [P1] }],
        ['non-string (object) id', { photoIds: [{ a: 1 }], areaId: AREA_A }],
        ['empty id', { photoIds: [''], areaId: AREA_A }],
        ['id over 36 chars', { photoIds: ['x'.repeat(37)], areaId: AREA_A }],
        ['missing photoIds', { areaId: AREA_A }],
        ['empty areaId string', { photoIds: [P1], areaId: '' }],
        ['numeric orientationId', { photoIds: [P1], orientationId: 3 }],
      ])('returns 400 for %s', async (_label, body) => {
        seedEntry();
        seedPhoto(P1);

        const res = await patchTags(body);

        expect(res.statusCode).toBe(400);
        expect(res.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
        expect(undoStore.snapshots.size).toBe(0);
      });

      it('accepts exactly 1000 ids (missing ones then 404)', async () => {
        const res = await patchTags({
          photoIds: Array.from({ length: 1000 }, (_, i) => `p-${i}`),
          areaId: AREA_A,
        });

        expect(res.statusCode).toBe(404);
      });

      it('returns 400 details.unknownAreaIds for an unknown area', async () => {
        seedEntry();
        seedPhoto(P1);

        const res = await patchTags({ photoIds: [P1], areaId: 'no-such-area' });

        expect(res.statusCode).toBe(400);
        const err = res.json<ApiErrorResponse>().error;
        expect(err.code).toBe('VALIDATION_ERROR');
        expect(err.details).toEqual({ unknownAreaIds: ['no-such-area'] });
      });

      it('returns 400 details.unknownOrientationIds for an unknown orientation', async () => {
        seedEntry();
        seedPhoto(P1);

        const res = await patchTags({ photoIds: [P1], orientationId: 'no-such-ori' });

        expect(res.statusCode).toBe(400);
        expect(res.json<ApiErrorResponse>().error.details).toEqual({
          unknownOrientationIds: ['no-such-ori'],
        });
      });

      it('checks the area before the orientation and both before the photos', async () => {
        const res = await patchTags({
          photoIds: ['missing-photo'],
          areaId: 'no-such-area',
          orientationId: 'no-such-ori',
        });

        expect(res.statusCode).toBe(400);
        expect(res.json<ApiErrorResponse>().error.details).toEqual({
          unknownAreaIds: ['no-such-area'],
        });
      });

      it('checks the orientation before missing photos', async () => {
        const res = await patchTags({
          photoIds: ['missing-photo'],
          orientationId: 'no-such-ori',
        });

        expect(res.statusCode).toBe(400);
      });
    });

    it('returns 404 details.missingPhotoIds in request order and changes nothing', async () => {
      seedEntry();
      seedPhoto(P1);

      const res = await patchTags({ photoIds: ['gone-2', P1, 'gone-1'], areaId: AREA_A });

      expect(res.statusCode).toBe(404);
      const err = res.json<ApiErrorResponse>().error;
      expect(err.code).toBe('NOT_FOUND');
      expect(err.details).toEqual({ missingPhotoIds: ['gone-2', 'gone-1'] });
      expect(tagsOf(P1)).toEqual({ areaId: null, orientationId: null });
      expect(undoStore.snapshots.size).toBe(0);
    });

    it('returns 403 IMMUTABLE_ENTRY with lockedPhotoIds and changes no photo (all or nothing)', async () => {
      seedEntry();
      seedEntry('signed-1', { metadata: SIGNED_META });
      seedPhoto(P1);
      seedPhoto(P2, { entityId: 'signed-1' });
      seedPhoto(P3);

      const res = await patchTags({ photoIds: [P1, P2, P3], areaId: AREA_A });

      expect(res.statusCode).toBe(403);
      const err = res.json<ApiErrorResponse>().error;
      expect(err.code).toBe('IMMUTABLE_ENTRY');
      expect(err.details).toEqual({ lockedPhotoIds: [P2] });
      for (const id of [P1, P2, P3]) {
        expect(tagsOf(id)).toEqual({ areaId: null, orientationId: null });
      }
      expect(undoStore.snapshots.size).toBe(0);
    });
  });

  describe('Undo of a bulk tag change', () => {
    it('restores each photo to its own previous tags', async () => {
      seedEntry();
      seedPhoto(P1, { areaId: AREA_B, orientationId: ORI_N });
      seedPhoto(P2, { areaId: null, orientationId: ORI_S });
      const { undo: token } = (
        await patchTags({ photoIds: [P1, P2], areaId: AREA_A, orientationId: null })
      ).json<UpdatePhotoTagsResponse>();
      expect(tagsOf(P1)).toEqual({ areaId: AREA_A, orientationId: null });

      const res = await undo(token.token);

      expect(res.statusCode).toBe(200);
      expect(res.json<UndoResponse>().restored).toEqual([{ type: 'photo', id: P1 }]);
      expect(tagsOf(P1)).toEqual({ areaId: AREA_B, orientationId: ORI_N });
      expect(tagsOf(P2)).toEqual({ areaId: null, orientationId: ORI_S });
    });

    it('is single-use: a second Undo returns 404', async () => {
      seedEntry();
      seedPhoto(P1);
      const { undo: token } = (
        await patchTags({ photoIds: [P1], areaId: AREA_A })
      ).json<UpdatePhotoTagsResponse>();

      expect((await undo(token.token)).statusCode).toBe(200);
      expect((await undo(token.token)).statusCode).toBe(404);
    });

    it("rejects another user's token with 404 and restores nothing", async () => {
      seedEntry();
      seedPhoto(P1);
      const { undo: token } = (
        await patchTags({ photoIds: [P1], areaId: AREA_A })
      ).json<UpdatePhotoTagsResponse>();
      const other = await session('other-tags@example.com');

      const res = await undo(token.token, { cookie: other.cookie });

      expect(res.statusCode).toBe(404);
      expect(tagsOf(P1)?.areaId).toBe(AREA_A);
    });

    it('returns 409 listing the re-tagged photo and restores nothing', async () => {
      seedEntry();
      seedPhoto(P1);
      seedPhoto(P2);
      const { undo: token } = (
        await patchTags({ photoIds: [P1, P2], areaId: AREA_A })
      ).json<UpdatePhotoTagsResponse>();
      await patchTags({ photoIds: [P2], areaId: AREA_B });

      const res = await undo(token.token);

      expect(res.statusCode).toBe(409);
      const err = res.json<ApiErrorResponse>().error;
      expect(err.code).toBe('CONFLICT');
      expect(err.details).toEqual({ changed: [{ type: 'photo', id: P2 }] });
      expect(tagsOf(P1)?.areaId).toBe(AREA_A);
      expect(tagsOf(P2)?.areaId).toBe(AREA_B);
    });

    it('returns 409 when the orientation was changed afterwards', async () => {
      seedEntry();
      seedPhoto(P1);
      const { undo: token } = (
        await patchTags({ photoIds: [P1], orientationId: ORI_N })
      ).json<UpdatePhotoTagsResponse>();
      await patchTags({ photoIds: [P1], orientationId: ORI_S });

      expect((await undo(token.token)).statusCode).toBe(409);
    });

    it('returns 409 when a photo was deleted in the meantime', async () => {
      seedEntry();
      seedPhoto(P1);
      const { undo: token } = (
        await patchTags({ photoIds: [P1], areaId: AREA_A })
      ).json<UpdatePhotoTagsResponse>();
      app.db.delete(photos).where(eq(photos.id, P1)).run();

      const res = await undo(token.token);

      expect(res.statusCode).toBe(409);
      expect(res.json<ApiErrorResponse>().error.details).toEqual({
        changed: [{ type: 'photo', id: P1 }],
      });
    });

    it('returns 409 when the entry was signed in the meantime', async () => {
      seedEntry();
      seedPhoto(P1);
      const { undo: token } = (
        await patchTags({ photoIds: [P1], areaId: AREA_A })
      ).json<UpdatePhotoTagsResponse>();
      app.db
        .update(diaryEntries)
        .set({ metadata: SIGNED_META })
        .where(eq(diaryEntries.id, ENTRY))
        .run();

      const res = await undo(token.token);

      expect(res.statusCode).toBe(409);
      expect(tagsOf(P1)?.areaId).toBe(AREA_A);
    });

    it('returns 409 when the diary entry is gone', async () => {
      seedEntry();
      seedPhoto(P1);
      const { undo: token } = (
        await patchTags({ photoIds: [P1], areaId: AREA_A })
      ).json<UpdatePhotoTagsResponse>();
      app.db.update(photos).set({ entityId: 'vanished' }).where(eq(photos.id, P1)).run();

      expect((await undo(token.token)).statusCode).toBe(409);
    });

    it('is not blocked by a caption edit in between, and keeps that caption', async () => {
      seedEntry();
      seedPhoto(P1);
      const { undo: token } = (
        await patchTags({ photoIds: [P1], areaId: AREA_A })
      ).json<UpdatePhotoTagsResponse>();
      expect((await patchPhoto(P1, { caption: 'Edited later' })).statusCode).toBe(200);

      const res = await undo(token.token);

      expect(res.statusCode).toBe(200);
      expect(tagsOf(P1)?.areaId).toBeNull();
      expect(row(P1)!.caption).toBe('Edited later');
    });

    it('restores a deleted before-area and before-orientation as NULL', async () => {
      seedEntry();
      seedPhoto(P1, { areaId: AREA_B, orientationId: ORI_S });
      const { undo: token } = (
        await patchTags({ photoIds: [P1], areaId: AREA_A, orientationId: ORI_N })
      ).json<UpdatePhotoTagsResponse>();
      app.db.delete(areas).where(eq(areas.id, AREA_B)).run();
      app.db.delete(orientations).where(eq(orientations.id, ORI_S)).run();

      const res = await undo(token.token);

      expect(res.statusCode).toBe(200);
      expect(tagsOf(P1)).toEqual({ areaId: null, orientationId: null });
    });
  });

  describe('PATCH /api/photos/:id undo field', () => {
    it('returns an undo token when the area changes, and Undo restores the tags but keeps the caption', async () => {
      seedEntry();
      seedPhoto(P1, { areaId: AREA_B, orientationId: ORI_N });

      const res = await patchPhoto(P1, { areaId: AREA_A, caption: 'New caption' });

      expect(res.statusCode).toBe(200);
      const body = res.json<UpdatePhotoResponse>();
      expect(body.photo.areaId).toBe(AREA_A);
      expect(body.undo?.token).toMatch(/^u_[0-9a-f]{32}$/);

      const undone = await undo(body.undo!.token);

      expect(undone.statusCode).toBe(200);
      expect(undone.json<UndoResponse>().restored).toEqual([{ type: 'photo', id: P1 }]);
      expect(tagsOf(P1)).toEqual({ areaId: AREA_B, orientationId: ORI_N });
      expect(row(P1)!.caption).toBe('New caption');
    });

    it('returns an undo token when only the orientation changes', async () => {
      seedEntry();
      seedPhoto(P1);

      const body = (await patchPhoto(P1, { orientationId: ORI_S })).json<UpdatePhotoResponse>();

      expect(body.undo?.token).toBeDefined();
    });

    it('returns an undo token when a tag is cleared', async () => {
      seedEntry();
      seedPhoto(P1, { areaId: AREA_A });

      const body = (await patchPhoto(P1, { areaId: null })).json<UpdatePhotoResponse>();

      expect(body.photo.areaId).toBeNull();
      expect(body.undo?.token).toBeDefined();
    });

    it.each([
      ['caption only', { caption: 'Only caption' }],
      ['sortOrder only', { sortOrder: 4 }],
      ['same area value', { areaId: AREA_A }],
    ])('has no undo key for %s', async (_label, payload) => {
      seedEntry();
      seedPhoto(P1, { areaId: AREA_A });

      const res = await patchPhoto(P1, payload);

      expect(res.statusCode).toBe(200);
      expect(Object.keys(res.json<UpdatePhotoResponse>())).toEqual(['photo']);
      expect(undoStore.snapshots.size).toBe(0);
    });

    it('returns 403 for a photo of a signed saved entry and issues no token', async () => {
      seedEntry(ENTRY, { metadata: SIGNED_META });
      seedPhoto(P1);

      const res = await patchPhoto(P1, { areaId: AREA_A });

      expect(res.statusCode).toBe(403);
      expect(res.json<ApiErrorResponse>().error.code).toBe('IMMUTABLE_ENTRY');
      expect(tagsOf(P1)?.areaId).toBeNull();
      expect(undoStore.snapshots.size).toBe(0);
    });

    it('returns 404 for an unknown photo', async () => {
      const res = await patchPhoto(P1, { areaId: AREA_A });

      expect(res.statusCode).toBe(404);
    });

    it('returns 409 on Undo when the tags were changed again', async () => {
      seedEntry();
      seedPhoto(P1);
      const body = (await patchPhoto(P1, { areaId: AREA_A })).json<UpdatePhotoResponse>();
      await patchPhoto(P1, { areaId: AREA_B });

      expect((await undo(body.undo!.token)).statusCode).toBe(409);
    });
  });
});
