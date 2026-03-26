/**
 * Integration tests for /api/photos route handlers.
 *
 * EPIC-13 & EPIC-16: Photo Upload Infrastructure
 *
 * Tests all endpoints:
 *   POST   /api/photos              - upload photo (multipart)
 *   GET    /api/photos              - list photos for entity
 *   GET    /api/photos/:id          - get single photo metadata
 *   GET    /api/photos/:id/file     - serve original file stream
 *   GET    /api/photos/:id/thumbnail - serve thumbnail stream
 *   PATCH  /api/photos/reorder      - reorder photos for entity
 *   PATCH  /api/photos/:id          - update photo metadata
 *   DELETE /api/photos/:id          - delete photo
 *
 * Strategy:
 *   - photoService module is fully mocked to avoid sharp native binary dependency
 *   - buildApp() + app.inject() for HTTP layer validation
 *   - Multipart bodies built manually for upload endpoint tests
 *   - Auth is tested: all endpoints require a valid session
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Photo, ApiErrorResponse } from '@cornerstone/shared';

// ─── Mock photoService BEFORE importing app ────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = jest.MockedFunction<(...args: any[]) => any>;

const mockUploadPhoto = jest.fn() as AnyMock;
const mockGetPhoto = jest.fn() as AnyMock;
const mockGetPhotosForEntity = jest.fn() as AnyMock;
const mockUpdatePhoto = jest.fn() as AnyMock;
const mockReorderPhotos = jest.fn() as AnyMock;
const mockDeletePhoto = jest.fn() as AnyMock;
const mockGetPhotoFilePath = jest.fn() as AnyMock;

const mockDeletePhotosForEntity = jest.fn() as AnyMock;

jest.unstable_mockModule('../services/photoService.js', () => ({
  uploadPhoto: mockUploadPhoto,
  getPhoto: mockGetPhoto,
  getPhotosForEntity: mockGetPhotosForEntity,
  updatePhoto: mockUpdatePhoto,
  reorderPhotos: mockReorderPhotos,
  deletePhoto: mockDeletePhoto,
  deletePhotosForEntity: mockDeletePhotosForEntity,
  getPhotoFilePath: mockGetPhotoFilePath,
}));

// ─── Dynamic imports (after mocks) ───────────────────────────────────────────

let buildApp: typeof import('../app.js').buildApp;
let userService: typeof import('../services/userService.js');
let sessionService: typeof import('../services/sessionService.js');

// ─── Test fixtures ────────────────────────────────────────────────────────────

function makePhoto(overrides: Partial<Photo> = {}): Photo {
  return {
    id: 'photo-id-123',
    entityType: 'test',
    entityId: 'entity-id-456',
    originalFilename: 'photo.jpg',
    mimeType: 'image/jpeg',
    fileSize: 12345,
    width: 800,
    height: 600,
    takenAt: null,
    caption: null,
    sortOrder: 0,
    createdBy: { id: 'user-id', displayName: 'Test User' },
    createdAt: '2026-03-01T12:00:00.000Z',
    updatedAt: '2026-03-01T12:00:00.000Z',
    fileUrl: '/api/photos/photo-id-123/file',
    thumbnailUrl: '/api/photos/photo-id-123/thumbnail',
    ...overrides,
  };
}

/**
 * Build a multipart/form-data body from parts.
 * Returns { body: Buffer, contentType: string }.
 */
function buildMultipartBody(
  parts: Array<{
    name: string;
    value: string | Buffer;
    filename?: string;
    contentType?: string;
  }>,
): { body: Buffer; contentType: string } {
  const boundary = 'test-boundary-12345';
  const CRLF = '\r\n';
  const chunks: Buffer[] = [];

  for (const part of parts) {
    let header = `--${boundary}${CRLF}`;
    if (part.filename) {
      header += `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"${CRLF}`;
      header += `Content-Type: ${part.contentType ?? 'application/octet-stream'}${CRLF}`;
    } else {
      header += `Content-Disposition: form-data; name="${part.name}"${CRLF}`;
    }
    header += CRLF;

    chunks.push(Buffer.from(header));
    chunks.push(typeof part.value === 'string' ? Buffer.from(part.value) : part.value);
    chunks.push(Buffer.from(CRLF));
  }

  chunks.push(Buffer.from(`--${boundary}--${CRLF}`));

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('Photo Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let photoStoragePath: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    // Create temp directories
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-photo-routes-test-'));
    photoStoragePath = join(tempDir, 'photos');
    mkdirSync(photoStoragePath, { recursive: true });

    // Configure environment
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    process.env.PHOTO_STORAGE_PATH = photoStoragePath;
    process.env.PHOTO_MAX_FILE_SIZE_MB = '20';

    // Import modules after mocks are set up
    if (!buildApp) {
      buildApp = (await import('../app.js')).buildApp;
      userService = await import('../services/userService.js');
      sessionService = await import('../services/sessionService.js');
    }

    app = await buildApp();

    // Reset all mocks before each test
    jest.clearAllMocks();
    // Default implementations
    mockUploadPhoto.mockResolvedValue(makePhoto());
    mockGetPhoto.mockReturnValue(null);
    mockGetPhotosForEntity.mockReturnValue([]);
    mockUpdatePhoto.mockReturnValue(null);
    mockReorderPhotos.mockReturnValue(undefined);
    mockDeletePhoto.mockResolvedValue(undefined);
    mockGetPhotoFilePath.mockResolvedValue(null);
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    process.env = originalEnv;
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ─── Helpers ────────────────────────────────────────────────────────────

  async function createUserWithSession(
    email: string,
    displayName: string,
    password: string,
    role: 'admin' | 'member' = 'member',
  ): Promise<{ userId: string; cookie: string }> {
    const user = await userService.createLocalUser(app.db, email, displayName, password, role);
    const sessionToken = sessionService.createSession(app.db, user.id, 3600);
    return {
      userId: user.id,
      cookie: `cornerstone_session=${sessionToken}`,
    };
  }

  // ─── POST /api/photos ──────────────────────────────────────────────────

  describe('POST /api/photos', () => {
    it('returns 401 without authentication', async () => {
      const { body, contentType } = buildMultipartBody([
        {
          name: 'file',
          value: Buffer.from('fake-image'),
          filename: 'photo.jpg',
          contentType: 'image/jpeg',
        },
        { name: 'entityType', value: 'test' },
        { name: 'entityId', value: 'entity-123' },
      ]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/photos',
        headers: { 'content-type': contentType },
        payload: body,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 201 with uploaded photo on success', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');
      const photo = makePhoto({ id: 'new-photo-id' });
      mockUploadPhoto.mockResolvedValue(photo);

      const { body, contentType } = buildMultipartBody([
        {
          name: 'file',
          value: Buffer.from('fake-jpeg-data'),
          filename: 'photo.jpg',
          contentType: 'image/jpeg',
        },
        { name: 'entityType', value: 'test' },
        { name: 'entityId', value: 'entity-123' },
      ]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/photos',
        headers: { cookie, 'content-type': contentType },
        payload: body,
      });

      expect(response.statusCode).toBe(201);
      const responseBody = JSON.parse(response.body) as { photo: Photo };
      expect(responseBody.photo.id).toBe('new-photo-id');
    });

    it('passes caption to service when provided', async () => {
      const { cookie } = await createUserWithSession('cap@example.com', 'Cap', 'password');

      const { body, contentType } = buildMultipartBody([
        {
          name: 'file',
          value: Buffer.from('fake-jpeg'),
          filename: 'photo.jpg',
          contentType: 'image/jpeg',
        },
        { name: 'entityType', value: 'test' },
        { name: 'entityId', value: 'entity-456' },
        { name: 'caption', value: 'My caption' },
      ]);

      await app.inject({
        method: 'POST',
        url: '/api/photos',
        headers: { cookie, 'content-type': contentType },
        payload: body,
      });

      expect(mockUploadPhoto).toHaveBeenCalledWith(
        expect.anything(), // db
        photoStoragePath,
        expect.any(Buffer),
        'photo.jpg',
        'image/jpeg',
        'test',
        'entity-456',
        expect.any(String), // userId
        'My caption',
      );
    });

    it('returns 400 when no file is included', async () => {
      const { cookie } = await createUserWithSession('nofile@example.com', 'NoFile', 'password');

      const { body, contentType } = buildMultipartBody([
        { name: 'entityType', value: 'test' },
        { name: 'entityId', value: 'entity-789' },
      ]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/photos',
        headers: { cookie, 'content-type': contentType },
        payload: body,
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when entityType is missing', async () => {
      const { cookie } = await createUserWithSession('notype@example.com', 'NoType', 'password');

      const { body, contentType } = buildMultipartBody([
        {
          name: 'file',
          value: Buffer.from('fake-jpeg'),
          filename: 'photo.jpg',
          contentType: 'image/jpeg',
        },
        { name: 'entityId', value: 'entity-789' },
      ]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/photos',
        headers: { cookie, 'content-type': contentType },
        payload: body,
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when entityId is missing', async () => {
      const { cookie } = await createUserWithSession('noid@example.com', 'NoId', 'password');

      const { body, contentType } = buildMultipartBody([
        {
          name: 'file',
          value: Buffer.from('fake-jpeg'),
          filename: 'photo.jpg',
          contentType: 'image/jpeg',
        },
        { name: 'entityType', value: 'test' },
      ]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/photos',
        headers: { cookie, 'content-type': contentType },
        payload: body,
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when file size exceeds configured limit', async () => {
      const { cookie } = await createUserWithSession('oversize@example.com', 'Big', 'password');

      // Set a 1MB limit
      process.env.PHOTO_MAX_FILE_SIZE_MB = '1';
      await app.close();
      app = await buildApp();

      // Create a buffer slightly over 1MB
      const oversizeBuffer = Buffer.alloc(1.1 * 1024 * 1024, 0xff);

      const { body, contentType } = buildMultipartBody([
        {
          name: 'file',
          value: oversizeBuffer,
          filename: 'huge.jpg',
          contentType: 'image/jpeg',
        },
        { name: 'entityType', value: 'test' },
        { name: 'entityId', value: 'entity-big' },
      ]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/photos',
        headers: { cookie, 'content-type': contentType },
        payload: body,
      });

      expect(response.statusCode).toBe(400);
      const errBody = JSON.parse(response.body) as ApiErrorResponse;
      expect(errBody.error.message).toMatch(/exceeds maximum/i);
    });

    it('returns 400 when service throws ValidationError for invalid MIME type', async () => {
      const { cookie } = await createUserWithSession('mime@example.com', 'MimeUser', 'password');
      const { ValidationError } = await import('../errors/AppError.js');
      mockUploadPhoto.mockRejectedValue(new ValidationError('MIME type not allowed: image/gif'));

      const { body, contentType } = buildMultipartBody([
        {
          name: 'file',
          value: Buffer.from('fake-gif'),
          filename: 'anim.gif',
          contentType: 'image/gif',
        },
        { name: 'entityType', value: 'test' },
        { name: 'entityId', value: 'entity-gif' },
      ]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/photos',
        headers: { cookie, 'content-type': contentType },
        payload: body,
      });

      expect(response.statusCode).toBe(400);
      const errBody = JSON.parse(response.body) as ApiErrorResponse;
      expect(errBody.error.message).toContain('MIME type not allowed');
    });

    it('passes entityType, entityId and userId to service', async () => {
      const { userId, cookie } = await createUserWithSession(
        'verify@example.com',
        'VerifyUser',
        'password',
      );

      const { body, contentType } = buildMultipartBody([
        {
          name: 'file',
          value: Buffer.from('fake-jpeg'),
          filename: 'shot.jpg',
          contentType: 'image/jpeg',
        },
        { name: 'entityType', value: 'diary_entry' },
        { name: 'entityId', value: 'entry-abc' },
      ]);

      await app.inject({
        method: 'POST',
        url: '/api/photos',
        headers: { cookie, 'content-type': contentType },
        payload: body,
      });

      expect(mockUploadPhoto).toHaveBeenCalledWith(
        expect.anything(),
        photoStoragePath,
        expect.any(Buffer),
        'shot.jpg',
        'image/jpeg',
        'diary_entry',
        'entry-abc',
        userId,
        undefined,
      );
    });
  });

  // ─── GET /api/photos ───────────────────────────────────────────────────

  describe('GET /api/photos', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/photos?entityType=test&entityId=e1',
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns 200 with empty array when no photos exist', async () => {
      const { cookie } = await createUserWithSession('list@example.com', 'ListUser', 'password');
      mockGetPhotosForEntity.mockReturnValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/photos?entityType=test&entityId=entity-123',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { photos: Photo[] };
      expect(body.photos).toEqual([]);
    });

    it('returns 200 with list of photos', async () => {
      const { cookie } = await createUserWithSession('list2@example.com', 'ListUser2', 'password');
      const photos = [makePhoto({ id: 'p1' }), makePhoto({ id: 'p2' })];
      mockGetPhotosForEntity.mockReturnValue(photos);

      const response = await app.inject({
        method: 'GET',
        url: '/api/photos?entityType=test&entityId=entity-456',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { photos: Photo[] };
      expect(body.photos).toHaveLength(2);
      expect(body.photos[0].id).toBe('p1');
    });

    it('passes entityType and entityId to service', async () => {
      const { cookie } = await createUserWithSession('filter@example.com', 'Filter', 'password');
      mockGetPhotosForEntity.mockReturnValue([]);

      await app.inject({
        method: 'GET',
        url: '/api/photos?entityType=diary_entry&entityId=entry-xyz',
        headers: { cookie },
      });

      expect(mockGetPhotosForEntity).toHaveBeenCalledWith(
        expect.anything(),
        'diary_entry',
        'entry-xyz',
      );
    });

    it('returns 400 when entityType is missing', async () => {
      const { cookie } = await createUserWithSession(
        'missingtype@example.com',
        'Missing',
        'password',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/photos?entityId=entity-123',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when entityId is missing', async () => {
      const { cookie } = await createUserWithSession('missingid@example.com', 'Missing2', 'pw');

      const response = await app.inject({
        method: 'GET',
        url: '/api/photos?entityType=test',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ─── GET /api/photos/:id ───────────────────────────────────────────────

  describe('GET /api/photos/:id', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/photos/photo-id-123',
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when photo does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'getphoto@example.com',
        'GetPhoto',
        'password',
      );
      mockGetPhoto.mockReturnValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/photos/non-existent-id',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body) as ApiErrorResponse;
      expect(body.error.message).toMatch(/photo not found/i);
    });

    it('returns 200 with photo metadata when found', async () => {
      const { cookie } = await createUserWithSession(
        'getphoto2@example.com',
        'GetPhoto2',
        'password',
      );
      const photo = makePhoto({ id: 'existing-photo' });
      mockGetPhoto.mockReturnValue(photo);

      const response = await app.inject({
        method: 'GET',
        url: '/api/photos/existing-photo',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { photo: Photo };
      expect(body.photo.id).toBe('existing-photo');
      expect(body.photo.mimeType).toBe('image/jpeg');
    });
  });

  // ─── GET /api/photos/:id/file ──────────────────────────────────────────

  describe('GET /api/photos/:id/file', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/photos/photo-id-123/file',
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when photo metadata not found', async () => {
      const { cookie } = await createUserWithSession('file@example.com', 'File', 'password');
      mockGetPhoto.mockReturnValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/photos/no-photo/file',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body) as ApiErrorResponse;
      expect(body.error.message).toMatch(/photo not found/i);
    });

    it('returns 404 when photo file does not exist on disk', async () => {
      const { cookie } = await createUserWithSession('file2@example.com', 'File2', 'password');
      mockGetPhoto.mockReturnValue(makePhoto());
      mockGetPhotoFilePath.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/photos/photo-id-123/file',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body) as ApiErrorResponse;
      expect(body.error.message).toMatch(/photo file not found/i);
    });

    it('returns 200 with file stream when photo and file exist', async () => {
      const { cookie } = await createUserWithSession('file3@example.com', 'File3', 'password');

      // Create a real file on disk for streaming
      const photoId = 'stream-photo';
      const photoDir = join(photoStoragePath, photoId);
      mkdirSync(photoDir, { recursive: true });
      const filePath = join(photoDir, 'original.jpg');
      writeFileSync(filePath, Buffer.from('fake-jpeg-content'));

      mockGetPhoto.mockReturnValue(makePhoto({ id: photoId, mimeType: 'image/jpeg' }));
      mockGetPhotoFilePath.mockResolvedValue(filePath);

      const response = await app.inject({
        method: 'GET',
        url: `/api/photos/${photoId}/file`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('image/jpeg');
      expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    });

    it('calls getPhotoFilePath with "original" variant', async () => {
      const { cookie } = await createUserWithSession('variant@example.com', 'Variant', 'password');
      mockGetPhoto.mockReturnValue(makePhoto());
      mockGetPhotoFilePath.mockResolvedValue(null);

      await app.inject({
        method: 'GET',
        url: '/api/photos/photo-id-123/file',
        headers: { cookie },
      });

      expect(mockGetPhotoFilePath).toHaveBeenCalledWith(
        photoStoragePath,
        'photo-id-123',
        'original',
      );
    });
  });

  // ─── GET /api/photos/:id/thumbnail ────────────────────────────────────

  describe('GET /api/photos/:id/thumbnail', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/photos/photo-id-123/thumbnail',
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when photo metadata not found', async () => {
      const { cookie } = await createUserWithSession('thumb@example.com', 'Thumb', 'password');
      mockGetPhoto.mockReturnValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/photos/no-photo/thumbnail',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 when thumbnail file does not exist on disk', async () => {
      const { cookie } = await createUserWithSession('thumb2@example.com', 'Thumb2', 'password');
      mockGetPhoto.mockReturnValue(makePhoto());
      mockGetPhotoFilePath.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/photos/photo-id-123/thumbnail',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body) as ApiErrorResponse;
      expect(body.error.message).toMatch(/thumbnail not found/i);
    });

    it('returns 200 with WebP thumbnail stream when found', async () => {
      const { cookie } = await createUserWithSession('thumb3@example.com', 'Thumb3', 'password');

      const photoId = 'thumb-stream-photo';
      const photoDir = join(photoStoragePath, photoId);
      mkdirSync(photoDir, { recursive: true });
      const thumbPath = join(photoDir, 'thumbnail.webp');
      writeFileSync(thumbPath, Buffer.from('fake-webp-thumbnail'));

      mockGetPhoto.mockReturnValue(makePhoto({ id: photoId }));
      mockGetPhotoFilePath.mockResolvedValue(thumbPath);

      const response = await app.inject({
        method: 'GET',
        url: `/api/photos/${photoId}/thumbnail`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('image/webp');
      expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    });

    it('calls getPhotoFilePath with "thumbnail" variant', async () => {
      const { cookie } = await createUserWithSession('tv@example.com', 'TV', 'password');
      mockGetPhoto.mockReturnValue(makePhoto());
      mockGetPhotoFilePath.mockResolvedValue(null);

      await app.inject({
        method: 'GET',
        url: '/api/photos/photo-id-123/thumbnail',
        headers: { cookie },
      });

      expect(mockGetPhotoFilePath).toHaveBeenCalledWith(
        photoStoragePath,
        'photo-id-123',
        'thumbnail',
      );
    });
  });

  // ─── PATCH /api/photos/:id ─────────────────────────────────────────────

  describe('PATCH /api/photos/:id', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/photos/photo-id-123',
        payload: { caption: 'updated' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when photo does not exist', async () => {
      const { cookie } = await createUserWithSession('patch@example.com', 'PatchUser', 'password');
      mockUpdatePhoto.mockReturnValue(null);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/photos/no-such-photo',
        headers: { cookie, 'content-type': 'application/json' },
        payload: { caption: 'test' },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body) as ApiErrorResponse;
      expect(body.error.message).toMatch(/photo not found/i);
    });

    it('returns 200 with updated photo when caption is updated', async () => {
      const { cookie } = await createUserWithSession(
        'patchcap@example.com',
        'PatchCap',
        'password',
      );
      const updated = makePhoto({ caption: 'New Caption' });
      mockUpdatePhoto.mockReturnValue(updated);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/photos/photo-id-123',
        headers: { cookie, 'content-type': 'application/json' },
        payload: { caption: 'New Caption' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { photo: Photo };
      expect(body.photo.caption).toBe('New Caption');
    });

    it('returns 200 with updated photo when sortOrder is updated', async () => {
      const { cookie } = await createUserWithSession(
        'patchord@example.com',
        'PatchOrd',
        'password',
      );
      const updated = makePhoto({ sortOrder: 5 });
      mockUpdatePhoto.mockReturnValue(updated);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/photos/photo-id-123',
        headers: { cookie, 'content-type': 'application/json' },
        payload: { sortOrder: 5 },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { photo: Photo };
      expect(body.photo.sortOrder).toBe(5);
    });

    it('accepts null caption to clear the caption', async () => {
      const { cookie } = await createUserWithSession(
        'clearcap@example.com',
        'ClearCap',
        'password',
      );
      const updated = makePhoto({ caption: null });
      mockUpdatePhoto.mockReturnValue(updated);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/photos/photo-id-123',
        headers: { cookie, 'content-type': 'application/json' },
        payload: { caption: null },
      });

      expect(response.statusCode).toBe(200);
    });

    it('returns 400 when body has no updatable fields', async () => {
      const { cookie } = await createUserWithSession(
        'emptyp@example.com',
        'EmptyPatch',
        'password',
      );

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/photos/photo-id-123',
        headers: { cookie, 'content-type': 'application/json' },
        payload: {},
      });

      // minProperties: 1 in schema means empty body is rejected
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when sortOrder is negative', async () => {
      const { cookie } = await createUserWithSession('negord@example.com', 'NegOrd', 'password');

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/photos/photo-id-123',
        headers: { cookie, 'content-type': 'application/json' },
        payload: { sortOrder: -1 },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ─── PATCH /api/photos/reorder ─────────────────────────────────────────

  describe('PATCH /api/photos/reorder', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/photos/reorder',
        payload: {
          entityType: 'test',
          entityId: 'entity-123',
          photoIds: ['p1', 'p2'],
        },
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns 204 on successful reorder', async () => {
      const { cookie } = await createUserWithSession('reorder@example.com', 'Reorder', 'password');
      mockReorderPhotos.mockReturnValue(undefined);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/photos/reorder',
        headers: { cookie, 'content-type': 'application/json' },
        payload: {
          entityType: 'test',
          entityId: 'entity-123',
          photoIds: ['photo-a', 'photo-b', 'photo-c'],
        },
      });

      expect(response.statusCode).toBe(204);
    });

    it('calls reorderPhotos service with correct arguments', async () => {
      const { cookie } = await createUserWithSession(
        'reorderargs@example.com',
        'ReorderArgs',
        'password',
      );

      await app.inject({
        method: 'PATCH',
        url: '/api/photos/reorder',
        headers: { cookie, 'content-type': 'application/json' },
        payload: {
          entityType: 'diary_entry',
          entityId: 'entry-xyz',
          photoIds: ['id1', 'id2'],
        },
      });

      expect(mockReorderPhotos).toHaveBeenCalledWith(
        expect.anything(),
        'diary_entry',
        'entry-xyz',
        ['id1', 'id2'],
      );
    });

    it('returns 400 when entityType is missing', async () => {
      const { cookie } = await createUserWithSession(
        'reorderval@example.com',
        'ReorderVal',
        'password',
      );

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/photos/reorder',
        headers: { cookie, 'content-type': 'application/json' },
        payload: {
          entityId: 'entity-123',
          photoIds: ['p1'],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when photoIds is missing', async () => {
      const { cookie } = await createUserWithSession(
        'reorderpids@example.com',
        'ReorderPids',
        'password',
      );

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/photos/reorder',
        headers: { cookie, 'content-type': 'application/json' },
        payload: {
          entityType: 'test',
          entityId: 'entity-123',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('accepts empty photoIds array', async () => {
      const { cookie } = await createUserWithSession(
        'reorderempty@example.com',
        'ReorderEmpty',
        'password',
      );

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/photos/reorder',
        headers: { cookie, 'content-type': 'application/json' },
        payload: {
          entityType: 'test',
          entityId: 'entity-123',
          photoIds: [],
        },
      });

      expect(response.statusCode).toBe(204);
    });
  });

  // ─── DELETE /api/photos/:id ────────────────────────────────────────────

  describe('DELETE /api/photos/:id', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/photos/photo-id-123',
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when photo does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'delete@example.com',
        'DeleteUser',
        'password',
      );
      mockGetPhoto.mockReturnValue(null);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/photos/no-such-photo',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body) as ApiErrorResponse;
      expect(body.error.message).toMatch(/photo not found/i);
    });

    it('returns 204 on successful delete', async () => {
      const { cookie } = await createUserWithSession('delete2@example.com', 'Delete2', 'password');
      mockGetPhoto.mockReturnValue(makePhoto());
      mockDeletePhoto.mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/photos/photo-id-123',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
    });

    it('calls deletePhoto service with correct photo id', async () => {
      const { cookie } = await createUserWithSession(
        'deleteargs@example.com',
        'DeleteArgs',
        'password',
      );
      mockGetPhoto.mockReturnValue(makePhoto({ id: 'photo-to-delete' }));
      mockDeletePhoto.mockResolvedValue(undefined);

      await app.inject({
        method: 'DELETE',
        url: '/api/photos/photo-to-delete',
        headers: { cookie },
      });

      expect(mockDeletePhoto).toHaveBeenCalledWith(
        expect.anything(),
        photoStoragePath,
        'photo-to-delete',
      );
    });
  });
});
