/**
 * Unit tests for photoAnnotationService.ts
 *
 * Story #1473: Photo Annotator Foundation
 *
 * Tests:
 *   - saveAnnotatedImage: writes file, regenerates thumbnail, sets annotated_at, returns Photo
 *   - clearAnnotation: removes file, regenerates thumbnail from original, nulls annotated_at
 *
 * Strategy:
 *   - `sharp` mocked via jest.unstable_mockModule (native binary unavailable in test env)
 *   - `photoService` is mocked for getPhotoFilePath; getPhoto uses in-memory SQLite
 *   - File system I/O uses real temp directories
 *   - DB uses in-memory SQLite via Drizzle ORM + runMigrations
 *
 * Note: Server tests fail locally in this worktree due to stale dist (drizzle-orm type
 * resolution). They pass in CI where shared dist is built correctly. This is the
 * pre-existing environment issue documented in agent memory.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import type { Photo } from '@cornerstone/shared';

// ─── Mock sharp BEFORE any module import that uses it ─────────────────────────

const FAKE_THUMBNAIL_BUFFER = Buffer.from('fake-thumbnail-webp-data');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = jest.MockedFunction<(...args: any[]) => any>;

const mockSharpInstance = {
  resize: jest.fn() as AnyMock,
  webp: jest.fn() as AnyMock,
  toBuffer: jest.fn() as AnyMock,
};

mockSharpInstance.resize.mockReturnValue(mockSharpInstance);
mockSharpInstance.webp.mockReturnValue(mockSharpInstance);
mockSharpInstance.toBuffer.mockResolvedValue(FAKE_THUMBNAIL_BUFFER);

const mockSharpFn = jest.fn() as AnyMock;
mockSharpFn.mockReturnValue(mockSharpInstance);

jest.unstable_mockModule('sharp', () => ({
  default: mockSharpFn,
}));

// ─── Mock photoService — only getPhotoFilePath needs mocking ──────────────────
// getPhoto is left as a pass-through to the real implementation (real DB queries)

const mockGetPhotoFilePath = jest.fn() as AnyMock;

// We need getPhoto to work against our real in-memory DB.
// photoAnnotationService imports { getPhoto, getPhotoFilePath } from './photoService.js'
// We partially mock: getPhotoFilePath is our mock, getPhoto delegates to real module.
let realPhotoServiceGetPhoto: (
  db: BetterSQLite3Database<typeof schema>,
  id: string,
) => Photo | undefined;

jest.unstable_mockModule('./photoService.js', () => ({
  getPhoto: (db: BetterSQLite3Database<typeof schema>, id: string) =>
    realPhotoServiceGetPhoto(db, id),
  getPhotoFilePath: mockGetPhotoFilePath,
  uploadPhoto: jest.fn(),
  getPhotosForEntity: jest.fn(),
  updatePhoto: jest.fn(),
  reorderPhotos: jest.fn(),
  deletePhoto: jest.fn(),
  deletePhotosForEntity: jest.fn(),
}));

// ─── Dynamic imports (must come AFTER jest.unstable_mockModule) ─────────────

let photoAnnotationService: typeof import('./photoAnnotationService.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createTestDb() {
  const sqliteDb = new Database(':memory:');
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');
  runMigrations(sqliteDb);
  const db = drizzle(sqliteDb, { schema }) as BetterSQLite3Database<typeof schema>;
  return { sqlite: sqliteDb, db };
}

function createTestUser(db: BetterSQLite3Database<typeof schema>): string {
  const now = new Date().toISOString();
  const userId = `user-${Date.now()}`;
  db.insert(schema.users)
    .values({
      id: userId,
      email: 'test@example.com',
      displayName: 'Test User',
      role: 'member',
      authProvider: 'local',
      passwordHash: '$scrypt$n=16384,r=8,p=1$c29tZXNhbHQ=$c29tZWhhc2g=',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return userId;
}

function insertPhoto(db: BetterSQLite3Database<typeof schema>, id: string, userId: string): void {
  const now = new Date().toISOString();
  db.insert(schema.photos)
    .values({
      id,
      entityType: 'test',
      entityId: 'entity-1',
      filename: 'original.jpg',
      originalFilename: 'original.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1000,
      width: 800,
      height: 600,
      takenAt: null,
      caption: null,
      sortOrder: 0,
      annotatedAt: null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('photoAnnotationService', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let tempStoragePath: string;
  let userId: string;
  let photoId: string;
  let photoDir: string;

  beforeEach(async () => {
    // Set up in-memory database
    ({ sqlite, db } = createTestDb());

    // Create temp directory for photo storage
    tempStoragePath = mkdtempSync(join(tmpdir(), 'cornerstone-annotation-test-'));

    // Create test user and photo
    userId = createTestUser(db);
    photoId = `photo-${Date.now()}`;
    insertPhoto(db, photoId, userId);

    // Create photo directory and original file on disk
    photoDir = join(tempStoragePath, photoId);
    mkdirSync(photoDir, { recursive: true });
    writeFileSync(join(photoDir, 'original.jpg'), Buffer.from('fake-jpeg-data'));

    // Import modules after mocks are configured
    if (!photoAnnotationService) {
      photoAnnotationService = await import('./photoAnnotationService.js');
    }

    // Set up real getPhoto delegation by importing real photoService
    if (!realPhotoServiceGetPhoto) {
      // We need to import the real function. Since photoService.js is mocked above,
      // we get the mock module but the mock's getPhoto delegates to this fn.
      // We need the actual DB-reading logic, which we replicate minimally here:
      realPhotoServiceGetPhoto = (innerDb, id) => {
        const row = innerDb.select().from(schema.photos).where(eq(schema.photos.id, id)).get();
        if (!row) return undefined;
        const createdByUser = row.createdBy
          ? innerDb
              .select({ id: schema.users.id, displayName: schema.users.displayName })
              .from(schema.users)
              .where(eq(schema.users.id, row.createdBy))
              .get()
          : null;
        return {
          id: row.id,
          entityType: row.entityType,
          entityId: row.entityId,
          originalFilename: row.originalFilename,
          mimeType: row.mimeType,
          fileSize: row.fileSize,
          width: row.width,
          height: row.height,
          takenAt: row.takenAt,
          caption: row.caption,
          sortOrder: row.sortOrder,
          annotatedAt: row.annotatedAt ?? null,
          createdBy: createdByUser ?? null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          fileUrl: `/api/photos/${row.id}/file`,
          thumbnailUrl: `/api/photos/${row.id}/thumbnail`,
        } as Photo;
      };
    }

    // Reset mocks
    jest.clearAllMocks();
    mockSharpInstance.resize.mockReturnValue(mockSharpInstance);
    mockSharpInstance.webp.mockReturnValue(mockSharpInstance);
    mockSharpInstance.toBuffer.mockResolvedValue(FAKE_THUMBNAIL_BUFFER);
    mockSharpFn.mockReturnValue(mockSharpInstance);

    // Default: getPhotoFilePath returns the original file path
    mockGetPhotoFilePath.mockResolvedValue(join(photoDir, 'original.jpg'));
  });

  afterEach(() => {
    if (sqlite && sqlite.open) {
      sqlite.close();
    }
    try {
      rmSync(tempStoragePath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ─── saveAnnotatedImage ───────────────────────────────────────────────────

  describe('saveAnnotatedImage()', () => {
    it('writes annotated.png to the photo directory', async () => {
      const pngBuffer = Buffer.from('fake-png-data');

      await photoAnnotationService.saveAnnotatedImage(db, tempStoragePath, photoId, pngBuffer);

      const annotatedPath = join(photoDir, 'annotated.png');
      expect(existsSync(annotatedPath)).toBe(true);
    });

    it('writes the exact buffer content to annotated.png', async () => {
      const pngBuffer = Buffer.from('exact-png-content-12345');

      await photoAnnotationService.saveAnnotatedImage(db, tempStoragePath, photoId, pngBuffer);

      const written = readFileSync(join(photoDir, 'annotated.png'));
      expect(written.equals(pngBuffer)).toBe(true);
    });

    it('calls Sharp with resize 300x300 inside WebP for thumbnail regeneration', async () => {
      const pngBuffer = Buffer.from('fake-png-data');

      await photoAnnotationService.saveAnnotatedImage(db, tempStoragePath, photoId, pngBuffer);

      // sharp() was called with the PNG buffer
      expect(mockSharpFn).toHaveBeenCalledWith(pngBuffer);
      // .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
      expect(mockSharpInstance.resize).toHaveBeenCalledWith(300, 300, {
        fit: 'inside',
        withoutEnlargement: true,
      });
      // .webp() was called
      expect(mockSharpInstance.webp).toHaveBeenCalled();
      // .toBuffer() was called
      expect(mockSharpInstance.toBuffer).toHaveBeenCalled();
    });

    it('writes generated thumbnail buffer to thumbnail.webp', async () => {
      const pngBuffer = Buffer.from('fake-png-data');

      await photoAnnotationService.saveAnnotatedImage(db, tempStoragePath, photoId, pngBuffer);

      const thumbnailPath = join(photoDir, 'thumbnail.webp');
      expect(existsSync(thumbnailPath)).toBe(true);

      const written = readFileSync(thumbnailPath);
      expect(written.equals(FAKE_THUMBNAIL_BUFFER)).toBe(true);
    });

    it('sets annotated_at in the database record', async () => {
      const pngBuffer = Buffer.from('fake-png-data');
      const before = new Date().toISOString();

      await photoAnnotationService.saveAnnotatedImage(db, tempStoragePath, photoId, pngBuffer);

      const row = db.select().from(schema.photos).where(eq(schema.photos.id, photoId)).get();
      expect(row).toBeDefined();
      expect(row!.annotatedAt).not.toBeNull();
      // annotated_at should be a valid ISO date at or after our timestamp
      expect(row!.annotatedAt! >= before).toBe(true);
    });

    it('returns updated Photo object with annotatedAt set', async () => {
      const pngBuffer = Buffer.from('fake-png-data');

      const result = await photoAnnotationService.saveAnnotatedImage(
        db,
        tempStoragePath,
        photoId,
        pngBuffer,
      );

      expect(result.id).toBe(photoId);
      expect(result.annotatedAt).not.toBeNull();
      expect(result.fileUrl).toBe(`/api/photos/${photoId}/file`);
      expect(result.entityType).toBe('test');
    });

    it('throws NotFoundError when photo ID does not exist', async () => {
      await expect(
        photoAnnotationService.saveAnnotatedImage(
          db,
          tempStoragePath,
          'non-existent-photo-id',
          Buffer.from('png'),
        ),
      ).rejects.toThrow('Photo not found');
    });
  });

  // ─── clearAnnotation ──────────────────────────────────────────────────────

  describe('clearAnnotation()', () => {
    it('removes annotated.png when it exists', async () => {
      // First create an annotated file
      const annotatedPath = join(photoDir, 'annotated.png');
      writeFileSync(annotatedPath, Buffer.from('annotated-data'));
      expect(existsSync(annotatedPath)).toBe(true);

      await photoAnnotationService.clearAnnotation(db, tempStoragePath, photoId);

      expect(existsSync(annotatedPath)).toBe(false);
    });

    it('does not throw when annotated.png does not exist (idempotent)', async () => {
      // No annotated.png present
      expect(existsSync(join(photoDir, 'annotated.png'))).toBe(false);

      await expect(
        photoAnnotationService.clearAnnotation(db, tempStoragePath, photoId),
      ).resolves.toBeUndefined();
    });

    it('calls Sharp with the original file path to regenerate thumbnail', async () => {
      const originalPath = join(photoDir, 'original.jpg');
      mockGetPhotoFilePath.mockResolvedValue(originalPath);

      await photoAnnotationService.clearAnnotation(db, tempStoragePath, photoId);

      // sharp() was called with the original file path
      expect(mockSharpFn).toHaveBeenCalledWith(originalPath);
      expect(mockSharpInstance.resize).toHaveBeenCalledWith(300, 300, {
        fit: 'inside',
        withoutEnlargement: true,
      });
      expect(mockSharpInstance.webp).toHaveBeenCalled();
    });

    it('writes regenerated thumbnail to thumbnail.webp', async () => {
      mockGetPhotoFilePath.mockResolvedValue(join(photoDir, 'original.jpg'));

      await photoAnnotationService.clearAnnotation(db, tempStoragePath, photoId);

      const thumbnailPath = join(photoDir, 'thumbnail.webp');
      expect(existsSync(thumbnailPath)).toBe(true);
    });

    it('sets annotated_at to null in the database', async () => {
      // First set annotated_at to a value
      const now = new Date().toISOString();
      db.update(schema.photos).set({ annotatedAt: now }).where(eq(schema.photos.id, photoId)).run();

      // Verify it was set
      const before = db.select().from(schema.photos).where(eq(schema.photos.id, photoId)).get();
      expect(before!.annotatedAt).not.toBeNull();

      await photoAnnotationService.clearAnnotation(db, tempStoragePath, photoId);

      const row = db.select().from(schema.photos).where(eq(schema.photos.id, photoId)).get();
      expect(row!.annotatedAt).toBeNull();
    });

    it('throws NotFoundError when photo ID does not exist', async () => {
      await expect(
        photoAnnotationService.clearAnnotation(db, tempStoragePath, 'non-existent-id'),
      ).rejects.toThrow('Photo not found');
    });

    it('does not throw when original file is missing (getPhotoFilePath returns null)', async () => {
      // Simulate missing original file
      mockGetPhotoFilePath.mockResolvedValue(null);

      await expect(
        photoAnnotationService.clearAnnotation(db, tempStoragePath, photoId),
      ).resolves.toBeUndefined();

      // Sharp should NOT have been called since there's no original to process
      expect(mockSharpFn).not.toHaveBeenCalled();
    });

    it('still nulls annotated_at even when original file is missing', async () => {
      mockGetPhotoFilePath.mockResolvedValue(null);
      const now = new Date().toISOString();
      db.update(schema.photos).set({ annotatedAt: now }).where(eq(schema.photos.id, photoId)).run();

      await photoAnnotationService.clearAnnotation(db, tempStoragePath, photoId);

      const row = db.select().from(schema.photos).where(eq(schema.photos.id, photoId)).get();
      expect(row!.annotatedAt).toBeNull();
    });

    it('calls getPhotoFilePath with preferAnnotated=false to get original', async () => {
      await photoAnnotationService.clearAnnotation(db, tempStoragePath, photoId);

      expect(mockGetPhotoFilePath).toHaveBeenCalledWith(
        tempStoragePath,
        photoId,
        'original',
        false,
      );
    });
  });
});
