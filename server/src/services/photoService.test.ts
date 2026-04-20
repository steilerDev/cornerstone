/**
 * Unit tests for photoService.ts
 *
 * EPIC-13 & EPIC-16: Photo Upload Infrastructure
 *
 * Tests all exported service functions:
 *   - uploadPhoto
 *   - getPhoto
 *   - getPhotosForEntity
 *   - updatePhoto
 *   - reorderPhotos
 *   - deletePhoto
 *   - deletePhotosForEntity
 *   - getPhotoFilePath
 *
 * Strategy:
 *   - `sharp` is mocked via jest.unstable_mockModule (native binary unavailable in test env)
 *   - File system I/O uses real temp directories
 *   - DB uses in-memory SQLite via Drizzle ORM
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { ValidationError } from '../errors/AppError.js';

// ─── Mock sharp BEFORE any module import that uses it ─────────────────────────

// Default mock buffers
const FAKE_PROCESSED_BUFFER = Buffer.from('processed-image-data');
const FAKE_THUMBNAIL_BUFFER = Buffer.from('thumbnail-image-data');

// Type helper — allows us to call mock methods without fighting TypeScript's inference
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = jest.MockedFunction<(...args: any[]) => any>;

// Build a chainable mock sharp instance
const mockSharpInstance = {
  rotate: jest.fn() as AnyMock,
  metadata: jest.fn() as AnyMock,
  jpeg: jest.fn() as AnyMock,
  png: jest.fn() as AnyMock,
  webp: jest.fn() as AnyMock,
  resize: jest.fn() as AnyMock,
  toBuffer: jest.fn() as AnyMock,
};

// Chain methods return `this` so calls can be chained: sharp(buf).rotate().jpeg().toBuffer()
mockSharpInstance.rotate.mockReturnValue(mockSharpInstance);
mockSharpInstance.jpeg.mockReturnValue(mockSharpInstance);
mockSharpInstance.png.mockReturnValue(mockSharpInstance);
mockSharpInstance.webp.mockReturnValue(mockSharpInstance);
mockSharpInstance.resize.mockReturnValue(mockSharpInstance);

mockSharpInstance.metadata.mockResolvedValue({ width: 100, height: 100 });
mockSharpInstance.toBuffer.mockResolvedValue(FAKE_PROCESSED_BUFFER);

// The sharp module default export is a function that returns the instance
const mockSharpFn = jest.fn() as AnyMock;
mockSharpFn.mockReturnValue(mockSharpInstance);

jest.unstable_mockModule('sharp', () => ({
  default: mockSharpFn,
}));

// ─── Dynamic imports (must come AFTER jest.unstable_mockModule) ─────────────

let photoService: typeof import('./photoService.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a fresh in-memory SQLite database with all migrations applied.
 */
function createTestDb() {
  const sqliteDb = new Database(':memory:');
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');
  runMigrations(sqliteDb);
  return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
}

/**
 * Insert a test user directly into the DB. Returns the user ID.
 */
function createTestUser(
  db: BetterSQLite3Database<typeof schema>,
  email: string,
  displayName: string,
): string {
  const now = new Date().toISOString();
  const userId = `user-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  db.insert(schema.users)
    .values({
      id: userId,
      email,
      displayName,
      role: 'member',
      authProvider: 'local',
      passwordHash: '$scrypt$n=16384,r=8,p=1$c29tZXNhbHQ=$c29tZWhhc2g=',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return userId;
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('photoService', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let tempStoragePath: string;
  let userId: string;

  beforeEach(async () => {
    // Set up in-memory database
    ({ sqlite, db } = createTestDb());

    // Create temp directory for photo storage
    tempStoragePath = mkdtempSync(join(tmpdir(), 'cornerstone-photo-test-'));

    // Create test user
    userId = createTestUser(db, 'user@example.com', 'Test User');

    // Import module AFTER mock is configured
    if (!photoService) {
      photoService = await import('./photoService.js');
    }

    // Reset all mocks to clean state
    jest.clearAllMocks();

    // Re-setup default mock behavior after clearAllMocks
    mockSharpInstance.rotate.mockReturnValue(mockSharpInstance);
    mockSharpInstance.jpeg.mockReturnValue(mockSharpInstance);
    mockSharpInstance.png.mockReturnValue(mockSharpInstance);
    mockSharpInstance.webp.mockReturnValue(mockSharpInstance);
    mockSharpInstance.resize.mockReturnValue(mockSharpInstance);
    mockSharpFn.mockReturnValue(mockSharpInstance);
    mockSharpInstance.metadata.mockResolvedValue({ width: 800, height: 600 });
    // Use mockResolvedValue (persistent) so any number of uploads work per test
    // Tests that need different behavior should override with mockResolvedValueOnce
    mockSharpInstance.toBuffer.mockResolvedValue(FAKE_PROCESSED_BUFFER);
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

  // ─── uploadPhoto ──────────────────────────────────────────────────────────

  describe('uploadPhoto()', () => {
    it('uploads a JPEG photo and returns a Photo object', async () => {
      const fileBuffer = Buffer.from('fake-jpeg-data');
      const photo = await photoService.uploadPhoto(
        db,
        tempStoragePath,
        fileBuffer,
        'test-photo.jpg',
        'image/jpeg',
        'test',
        'entity-id-123',
        userId,
      );

      expect(photo.id).toBeDefined();
      expect(photo.entityType).toBe('test');
      expect(photo.entityId).toBe('entity-id-123');
      expect(photo.originalFilename).toBe('test-photo.jpg');
      expect(photo.mimeType).toBe('image/jpeg');
      expect(photo.caption).toBeNull();
      expect(photo.sortOrder).toBe(0);
      expect(photo.fileUrl).toBe(`/api/photos/${photo.id}/file`);
      expect(photo.thumbnailUrl).toBe(`/api/photos/${photo.id}/thumbnail`);
      expect(photo.createdBy).toEqual({ id: userId, displayName: 'Test User' });
      expect(photo.createdAt).toBeDefined();
      expect(photo.updatedAt).toBeDefined();
    });

    it('stores width and height from sharp metadata', async () => {
      mockSharpInstance.metadata.mockResolvedValue({ width: 1920, height: 1080 });

      const photo = await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('fake-jpeg'),
        'wide.jpg',
        'image/jpeg',
        'test',
        'entity-456',
        userId,
      );

      expect(photo.width).toBe(1920);
      expect(photo.height).toBe(1080);
    });

    it('stores null width/height when metadata lacks dimensions', async () => {
      mockSharpInstance.metadata.mockResolvedValue({});

      const photo = await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('fake-jpeg'),
        'no-dims.jpg',
        'image/jpeg',
        'test',
        'entity-789',
        userId,
      );

      expect(photo.width).toBeNull();
      expect(photo.height).toBeNull();
    });

    it('uploads a PNG photo with correct extension', async () => {
      const photo = await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('fake-png'),
        'image.png',
        'image/png',
        'test',
        'entity-png',
        userId,
      );

      expect(photo.mimeType).toBe('image/png');
      // PNG uses .png extension
      const rows = db.select().from(schema.photos).all();
      expect(rows[0]!.filename).toBe('original.png');
    });

    it('uploads a WebP photo with correct extension', async () => {
      const photo = await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('fake-webp'),
        'image.webp',
        'image/webp',
        'test',
        'entity-webp',
        userId,
      );

      expect(photo.mimeType).toBe('image/webp');
      const rows = db.select().from(schema.photos).all();
      expect(rows[0]!.filename).toBe('original.webp');
    });

    it('converts HEIC to JPEG (uses .jpg extension)', async () => {
      const photo = await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('fake-heic'),
        'photo.heic',
        'image/heic',
        'test',
        'entity-heic',
        userId,
      );

      expect(photo.mimeType).toBe('image/heic');
      // HEIC converts to JPEG on disk
      const rows = db.select().from(schema.photos).all();
      expect(rows[0]!.filename).toBe('original.jpg');
    });

    it('converts HEIF to JPEG (uses .jpg extension)', async () => {
      await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('fake-heif'),
        'photo.heif',
        'image/heif',
        'test',
        'entity-heif',
        userId,
      );

      const rows = db.select().from(schema.photos).all();
      expect(rows[0]!.filename).toBe('original.jpg');
    });

    it('accepts an optional caption', async () => {
      const photo = await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('fake-jpeg'),
        'captioned.jpg',
        'image/jpeg',
        'test',
        'entity-caption',
        userId,
        'A beautiful photo',
      );

      expect(photo.caption).toBe('A beautiful photo');
    });

    it('sets createdBy to null when the user was deleted after photo was uploaded', async () => {
      // Upload photo with real user
      const tempUserId = createTestUser(db, 'temp@example.com', 'Temp User');
      const photo = await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('fake-jpeg'),
        'test.jpg',
        'image/jpeg',
        'test',
        'entity-nouser',
        tempUserId,
      );

      // Delete the user — cascade sets createdBy to NULL (onDelete: 'set null')
      db.delete(schema.users).where(eq(schema.users.id, tempUserId)).run();

      // Retrieve photo — createdBy should now be null
      const retrieved = photoService.getPhoto(db, photo.id);
      expect(retrieved!.createdBy).toBeNull();
    });

    it('creates photo directory with original and thumbnail files on disk', async () => {
      const photo = await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('fake-jpeg'),
        'test.jpg',
        'image/jpeg',
        'test',
        'entity-disk',
        userId,
      );

      const photoDir = join(tempStoragePath, photo.id);
      expect(existsSync(photoDir)).toBe(true);
      expect(existsSync(join(photoDir, 'original.jpg'))).toBe(true);
      expect(existsSync(join(photoDir, 'thumbnail.webp'))).toBe(true);
    });

    it('stores file size from processed buffer length', async () => {
      const photo = await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('fake-jpeg'),
        'size.jpg',
        'image/jpeg',
        'test',
        'entity-size',
        userId,
      );

      expect(photo.fileSize).toBe(FAKE_PROCESSED_BUFFER.length);
    });

    it('throws ValidationError for disallowed MIME types', async () => {
      await expect(
        photoService.uploadPhoto(
          db,
          tempStoragePath,
          Buffer.from('fake-gif'),
          'anim.gif',
          'image/gif',
          'test',
          'entity-gif',
          userId,
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError for text/plain MIME type', async () => {
      await expect(
        photoService.uploadPhoto(
          db,
          tempStoragePath,
          Buffer.from('not an image'),
          'note.txt',
          'text/plain',
          'test',
          'entity-txt',
          userId,
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError for application/pdf MIME type', async () => {
      await expect(
        photoService.uploadPhoto(
          db,
          tempStoragePath,
          Buffer.from('pdf-data'),
          'doc.pdf',
          'application/pdf',
          'test',
          'entity-pdf',
          userId,
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('cleans up directory on error during image processing', async () => {
      mockSharpInstance.toBuffer.mockRejectedValueOnce(new Error('sharp processing failed'));

      await expect(
        photoService.uploadPhoto(
          db,
          tempStoragePath,
          Buffer.from('bad-data'),
          'bad.jpg',
          'image/jpeg',
          'test',
          'entity-cleanup',
          userId,
        ),
      ).rejects.toThrow('sharp processing failed');

      // Directory should be cleaned up
      const dirs = existsSync(tempStoragePath) ? readdirSync(tempStoragePath) : [];
      expect(dirs).toHaveLength(0);
    });

    it('does not insert a DB record on error', async () => {
      mockSharpInstance.toBuffer.mockRejectedValueOnce(new Error('processing error'));

      await expect(
        photoService.uploadPhoto(
          db,
          tempStoragePath,
          Buffer.from('bad-data'),
          'bad.jpg',
          'image/jpeg',
          'test',
          'entity-no-db',
          userId,
        ),
      ).rejects.toThrow();

      const rows = db.select().from(schema.photos).all();
      expect(rows).toHaveLength(0);
    });

    it('calls sharp with auto-rotate', async () => {
      await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('rotated-jpeg'),
        'rotated.jpg',
        'image/jpeg',
        'test',
        'entity-rotate',
        userId,
      );

      expect(mockSharpInstance.rotate).toHaveBeenCalled();
    });

    it('generates thumbnail with 300px max dimension', async () => {
      await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('large-jpeg'),
        'large.jpg',
        'image/jpeg',
        'test',
        'entity-thumb',
        userId,
      );

      expect(mockSharpInstance.resize).toHaveBeenCalledWith(300, 300, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    });
  });

  // ─── getPhoto ─────────────────────────────────────────────────────────────

  describe('getPhoto()', () => {
    it('returns null for a non-existent photo ID', () => {
      const result = photoService.getPhoto(db, 'non-existent-id');
      expect(result).toBeNull();
    });

    it('returns a Photo object for an existing photo', async () => {
      const uploaded = await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('jpeg'),
        'photo.jpg',
        'image/jpeg',
        'test',
        'entity-get',
        userId,
      );

      const result = photoService.getPhoto(db, uploaded.id);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(uploaded.id);
      expect(result!.entityType).toBe('test');
      expect(result!.entityId).toBe('entity-get');
    });

    it('includes createdBy user info', async () => {
      const uploaded = await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('jpeg'),
        'photo.jpg',
        'image/jpeg',
        'test',
        'entity-createdby',
        userId,
      );

      const result = photoService.getPhoto(db, uploaded.id);
      expect(result!.createdBy).toEqual({ id: userId, displayName: 'Test User' });
    });

    it('includes fileUrl and thumbnailUrl with correct format', async () => {
      const uploaded = await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('jpeg'),
        'photo.jpg',
        'image/jpeg',
        'test',
        'entity-urls',
        userId,
      );

      const result = photoService.getPhoto(db, uploaded.id);
      expect(result!.fileUrl).toBe(`/api/photos/${uploaded.id}/file`);
      expect(result!.thumbnailUrl).toBe(`/api/photos/${uploaded.id}/thumbnail`);
    });
  });

  // ─── getPhotosForEntity ───────────────────────────────────────────────────

  describe('getPhotosForEntity()', () => {
    it('returns empty array when no photos exist for entity', () => {
      const result = photoService.getPhotosForEntity(db, 'test', 'no-entity');
      expect(result).toEqual([]);
    });

    it('returns photos for a specific entity', async () => {
      // Setup: two sharp toBuffer mock calls per upload (original + thumbnail)
      mockSharpInstance.toBuffer
        .mockResolvedValueOnce(FAKE_PROCESSED_BUFFER)
        .mockResolvedValueOnce(FAKE_THUMBNAIL_BUFFER)
        .mockResolvedValueOnce(FAKE_PROCESSED_BUFFER)
        .mockResolvedValueOnce(FAKE_THUMBNAIL_BUFFER);

      await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('jpeg1'),
        'photo1.jpg',
        'image/jpeg',
        'test',
        'entity-list',
        userId,
      );
      await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('jpeg2'),
        'photo2.jpg',
        'image/jpeg',
        'test',
        'entity-list',
        userId,
      );

      const result = photoService.getPhotosForEntity(db, 'test', 'entity-list');
      expect(result).toHaveLength(2);
      expect(result.every((p) => p.entityType === 'test')).toBe(true);
      expect(result.every((p) => p.entityId === 'entity-list')).toBe(true);
    });

    it('does not return photos for a different entity', async () => {
      await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('jpeg'),
        'photo.jpg',
        'image/jpeg',
        'test',
        'entity-A',
        userId,
      );

      const result = photoService.getPhotosForEntity(db, 'test', 'entity-B');
      expect(result).toHaveLength(0);
    });

    it('does not return photos for a different entity type', async () => {
      await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('jpeg'),
        'photo.jpg',
        'image/jpeg',
        'diary_entry',
        'entity-X',
        userId,
      );

      const result = photoService.getPhotosForEntity(db, 'room', 'entity-X');
      expect(result).toHaveLength(0);
    });

    it('orders photos by sortOrder ascending then createdAt ascending', async () => {
      // Insert via DB directly to control sortOrder
      const now = new Date().toISOString();
      const past = new Date(Date.now() - 10000).toISOString();

      const photoIdA = 'photo-sort-a';
      const photoIdB = 'photo-sort-b';

      db.insert(schema.photos)
        .values({
          id: photoIdA,
          entityType: 'test',
          entityId: 'entity-sort',
          filename: 'original.jpg',
          originalFilename: 'a.jpg',
          mimeType: 'image/jpeg',
          fileSize: 100,
          width: null,
          height: null,
          takenAt: null,
          caption: null,
          sortOrder: 2,
          createdBy: userId,
          createdAt: past,
          updatedAt: past,
        })
        .run();

      db.insert(schema.photos)
        .values({
          id: photoIdB,
          entityType: 'test',
          entityId: 'entity-sort',
          filename: 'original.jpg',
          originalFilename: 'b.jpg',
          mimeType: 'image/jpeg',
          fileSize: 100,
          width: null,
          height: null,
          takenAt: null,
          caption: null,
          sortOrder: 1,
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const result = photoService.getPhotosForEntity(db, 'test', 'entity-sort');
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe(photoIdB); // sortOrder 1 first
      expect(result[1]!.id).toBe(photoIdA); // sortOrder 2 second
    });
  });

  // ─── updatePhoto ─────────────────────────────────────────────────────────

  describe('updatePhoto()', () => {
    it('returns null for a non-existent photo ID', () => {
      const result = photoService.updatePhoto(db, 'no-such-id', { caption: 'test' });
      expect(result).toBeNull();
    });

    it('updates caption on an existing photo', async () => {
      const uploaded = await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('jpeg'),
        'photo.jpg',
        'image/jpeg',
        'test',
        'entity-update',
        userId,
      );

      const result = photoService.updatePhoto(db, uploaded.id, { caption: 'New caption' });
      expect(result).not.toBeNull();
      expect(result!.caption).toBe('New caption');
    });

    it('clears caption when set to null', async () => {
      const uploaded = await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('jpeg'),
        'photo.jpg',
        'image/jpeg',
        'test',
        'entity-clear-cap',
        userId,
        'initial caption',
      );

      const result = photoService.updatePhoto(db, uploaded.id, { caption: null });
      expect(result!.caption).toBeNull();
    });

    it('updates sortOrder on an existing photo', async () => {
      const uploaded = await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('jpeg'),
        'photo.jpg',
        'image/jpeg',
        'test',
        'entity-sortorder',
        userId,
      );

      const result = photoService.updatePhoto(db, uploaded.id, { sortOrder: 5 });
      expect(result!.sortOrder).toBe(5);
    });

    it('updates both caption and sortOrder simultaneously', async () => {
      const uploaded = await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('jpeg'),
        'photo.jpg',
        'image/jpeg',
        'test',
        'entity-both',
        userId,
      );

      const result = photoService.updatePhoto(db, uploaded.id, {
        caption: 'Updated',
        sortOrder: 3,
      });
      expect(result!.caption).toBe('Updated');
      expect(result!.sortOrder).toBe(3);
    });

    it('does not modify caption when only sortOrder is updated', async () => {
      const uploaded = await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('jpeg'),
        'photo.jpg',
        'image/jpeg',
        'test',
        'entity-preserve',
        userId,
        'keep this caption',
      );

      const result = photoService.updatePhoto(db, uploaded.id, { sortOrder: 7 });
      expect(result!.caption).toBe('keep this caption');
    });

    it('updates updatedAt timestamp', async () => {
      const uploaded = await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('jpeg'),
        'photo.jpg',
        'image/jpeg',
        'test',
        'entity-ts',
        userId,
      );

      const before = new Date(uploaded.updatedAt).getTime();
      // Small delay to ensure timestamp differs
      await new Promise((r) => setTimeout(r, 10));

      const result = photoService.updatePhoto(db, uploaded.id, { caption: 'new' });
      const after = new Date(result!.updatedAt).getTime();
      expect(after).toBeGreaterThanOrEqual(before);
    });
  });

  // ─── reorderPhotos ────────────────────────────────────────────────────────

  describe('reorderPhotos()', () => {
    it('sets sortOrder based on position in photoIds array', async () => {
      // Insert two photos via DB directly
      const now = new Date().toISOString();
      const idA = 'reorder-a';
      const idB = 'reorder-b';
      const idC = 'reorder-c';

      for (const [id, filename] of [
        [idA, 'a.jpg'],
        [idB, 'b.jpg'],
        [idC, 'c.jpg'],
      ] as [string, string][]) {
        db.insert(schema.photos)
          .values({
            id,
            entityType: 'test',
            entityId: 'entity-reorder',
            filename: 'original.jpg',
            originalFilename: filename,
            mimeType: 'image/jpeg',
            fileSize: 100,
            width: null,
            height: null,
            takenAt: null,
            caption: null,
            sortOrder: 0,
            createdBy: null,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      // Reorder: C, A, B
      photoService.reorderPhotos(db, 'test', 'entity-reorder', [idC, idA, idB]);

      const rows = photoService.getPhotosForEntity(db, 'test', 'entity-reorder');
      expect(rows[0]!.id).toBe(idC); // sortOrder 0
      expect(rows[1]!.id).toBe(idA); // sortOrder 1
      expect(rows[2]!.id).toBe(idB); // sortOrder 2
    });

    it('does not update photos for a different entity', async () => {
      const now = new Date().toISOString();
      const idA = 'cross-entity-a';

      db.insert(schema.photos)
        .values({
          id: idA,
          entityType: 'test',
          entityId: 'entity-other',
          filename: 'original.jpg',
          originalFilename: 'a.jpg',
          mimeType: 'image/jpeg',
          fileSize: 100,
          width: null,
          height: null,
          takenAt: null,
          caption: null,
          sortOrder: 0,
          createdBy: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      // Reorder with different entityId — should be a no-op for entity-other
      photoService.reorderPhotos(db, 'test', 'entity-different', [idA]);

      const row = db.select().from(schema.photos).all()[0]!;
      expect(row.sortOrder).toBe(0); // unchanged
    });

    it('handles empty photoIds array without error', () => {
      expect(() => {
        photoService.reorderPhotos(db, 'test', 'entity-empty', []);
      }).not.toThrow();
    });
  });

  // ─── deletePhoto ─────────────────────────────────────────────────────────

  describe('deletePhoto()', () => {
    it('removes the DB record for the photo', async () => {
      const uploaded = await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('jpeg'),
        'photo.jpg',
        'image/jpeg',
        'test',
        'entity-del',
        userId,
      );

      await photoService.deletePhoto(db, tempStoragePath, uploaded.id);

      const result = photoService.getPhoto(db, uploaded.id);
      expect(result).toBeNull();
    });

    it('removes the photo directory from disk', async () => {
      const uploaded = await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('jpeg'),
        'photo.jpg',
        'image/jpeg',
        'test',
        'entity-del-disk',
        userId,
      );

      const photoDir = join(tempStoragePath, uploaded.id);
      expect(existsSync(photoDir)).toBe(true);

      await photoService.deletePhoto(db, tempStoragePath, uploaded.id);

      expect(existsSync(photoDir)).toBe(false);
    });

    it('does not throw when photo directory does not exist', async () => {
      // Insert a DB record without creating the directory
      const now = new Date().toISOString();
      const photoId = 'no-dir-photo';
      db.insert(schema.photos)
        .values({
          id: photoId,
          entityType: 'test',
          entityId: 'entity-nodir',
          filename: 'original.jpg',
          originalFilename: 'photo.jpg',
          mimeType: 'image/jpeg',
          fileSize: 100,
          width: null,
          height: null,
          takenAt: null,
          caption: null,
          sortOrder: 0,
          createdBy: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      // Should not throw even though directory doesn't exist
      await expect(photoService.deletePhoto(db, tempStoragePath, photoId)).resolves.not.toThrow();
    });
  });

  // ─── deletePhotosForEntity ────────────────────────────────────────────────

  describe('deletePhotosForEntity()', () => {
    it('deletes all photos for an entity', async () => {
      // Upload two photos for the same entity
      mockSharpInstance.toBuffer
        .mockResolvedValueOnce(FAKE_PROCESSED_BUFFER)
        .mockResolvedValueOnce(FAKE_THUMBNAIL_BUFFER)
        .mockResolvedValueOnce(FAKE_PROCESSED_BUFFER)
        .mockResolvedValueOnce(FAKE_THUMBNAIL_BUFFER);

      const p1 = await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('jpeg1'),
        'photo1.jpg',
        'image/jpeg',
        'test',
        'entity-delall',
        userId,
      );
      const p2 = await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('jpeg2'),
        'photo2.jpg',
        'image/jpeg',
        'test',
        'entity-delall',
        userId,
      );

      await photoService.deletePhotosForEntity(db, tempStoragePath, 'test', 'entity-delall');

      expect(photoService.getPhoto(db, p1.id)).toBeNull();
      expect(photoService.getPhoto(db, p2.id)).toBeNull();
    });

    it('does not delete photos for a different entity', async () => {
      const uploaded = await photoService.uploadPhoto(
        db,
        tempStoragePath,
        Buffer.from('jpeg'),
        'photo.jpg',
        'image/jpeg',
        'test',
        'entity-keep',
        userId,
      );

      await photoService.deletePhotosForEntity(db, tempStoragePath, 'test', 'entity-delete-other');

      expect(photoService.getPhoto(db, uploaded.id)).not.toBeNull();
    });

    it('does not throw when entity has no photos', async () => {
      await expect(
        photoService.deletePhotosForEntity(db, tempStoragePath, 'test', 'entity-none'),
      ).resolves.not.toThrow();
    });
  });

  // ─── getPhotoFilePath ─────────────────────────────────────────────────────

  describe('getPhotoFilePath()', () => {
    it('returns null for original when photo directory does not exist', async () => {
      const result = await photoService.getPhotoFilePath(
        tempStoragePath,
        'no-such-photo',
        'original',
      );
      expect(result).toBeNull();
    });

    it('returns null for thumbnail when photo directory does not exist', async () => {
      const result = await photoService.getPhotoFilePath(
        tempStoragePath,
        'no-such-photo',
        'thumbnail',
      );
      expect(result).toBeNull();
    });

    it('returns the original file path when the file exists', async () => {
      const photoId = 'filepath-test';
      const photoDir = join(tempStoragePath, photoId);
      mkdirSync(photoDir, { recursive: true });
      const originalPath = join(photoDir, 'original.jpg');
      writeFileSync(originalPath, 'fake content');

      const result = await photoService.getPhotoFilePath(tempStoragePath, photoId, 'original');
      expect(result).toBe(originalPath);
    });

    it('returns the thumbnail file path when the file exists', async () => {
      const photoId = 'filepath-thumb-test';
      const photoDir = join(tempStoragePath, photoId);
      mkdirSync(photoDir, { recursive: true });
      const thumbnailPath = join(photoDir, 'thumbnail.webp');
      writeFileSync(thumbnailPath, 'fake thumbnail');

      const result = await photoService.getPhotoFilePath(tempStoragePath, photoId, 'thumbnail');
      expect(result).toBe(thumbnailPath);
    });

    it('returns null for original when directory exists but no original.* file', async () => {
      const photoId = 'filepath-nofile';
      const photoDir = join(tempStoragePath, photoId);
      mkdirSync(photoDir, { recursive: true });
      // Create thumbnail but not original
      writeFileSync(join(photoDir, 'thumbnail.webp'), 'thumb');

      const result = await photoService.getPhotoFilePath(tempStoragePath, photoId, 'original');
      expect(result).toBeNull();
    });

    it('returns null for thumbnail when directory exists but no thumbnail.webp', async () => {
      const photoId = 'filepath-nothumb';
      const photoDir = join(tempStoragePath, photoId);
      mkdirSync(photoDir, { recursive: true });
      // Create original but not thumbnail
      writeFileSync(join(photoDir, 'original.jpg'), 'original');

      const result = await photoService.getPhotoFilePath(tempStoragePath, photoId, 'thumbnail');
      expect(result).toBeNull();
    });

    it('finds original.jpg extension', async () => {
      const photoId = 'filepath-ext-jpg';
      const photoDir = join(tempStoragePath, photoId);
      mkdirSync(photoDir, { recursive: true });
      writeFileSync(join(photoDir, 'original.jpg'), 'jpeg');

      const result = await photoService.getPhotoFilePath(tempStoragePath, photoId, 'original');
      expect(result).toContain('original.jpg');
    });

    it('finds original.png extension', async () => {
      const photoId = 'filepath-ext-png';
      const photoDir = join(tempStoragePath, photoId);
      mkdirSync(photoDir, { recursive: true });
      writeFileSync(join(photoDir, 'original.png'), 'png');

      const result = await photoService.getPhotoFilePath(tempStoragePath, photoId, 'original');
      expect(result).toContain('original.png');
    });
  });
});
