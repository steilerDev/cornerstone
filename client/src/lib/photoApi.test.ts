import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  getPhotosForEntity,
  updatePhoto,
  deletePhoto,
  getPhotoFileUrl,
  getPhotoThumbnailUrl,
  uploadPhoto,
  uploadAnnotation,
  clearAnnotation,
  getPhotoSpots,
  getPhotoSpotPhotos,
  fetchPhotoBlob,
  updatePhotoDetails,
  updatePhotoTags,
} from './photoApi.js';
import { ApiClientError, NetworkError } from './apiClient.js';
import { PHOTO_SPOT_ANY } from '@cornerstone/shared';
import type { Photo } from '@cornerstone/shared';

// ─── Shared photo fixture ──────────────────────────────────────────────────────

const makePhoto = (overrides: Partial<Photo> = {}): Photo => ({
  id: 'photo-1',
  entityType: 'diary_entry',
  entityId: 'entry-abc',
  originalFilename: 'photo.jpg',
  mimeType: 'image/jpeg',
  fileSize: 12345,
  width: 800,
  height: 600,
  takenAt: null,
  caption: null,
  areaId: null,
  orientationId: null,
  orientation: null,
  sortOrder: 0,
  createdBy: null,
  annotatedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  fileUrl: '/api/photos/photo-1/file',
  thumbnailUrl: '/api/photos/photo-1/thumbnail',
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('photoApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── getPhotosForEntity ──────────────────────────────────────────────────────

  describe('getPhotosForEntity', () => {
    it('sends GET request to /api/photos with entityType and entityId query params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ photos: [] }),
      } as Response);

      await getPhotosForEntity('diary_entry', 'entry-123');

      const callUrl = mockFetch.mock.calls[0]![0] as string;
      expect(callUrl).toContain('/api/photos');
      expect(callUrl).toContain('entityType=diary_entry');
      expect(callUrl).toContain('entityId=entry-123');
    });

    it('returns the photos array from the response', async () => {
      const photo1 = makePhoto({ id: 'photo-1' });
      const photo2 = makePhoto({ id: 'photo-2', caption: 'Living room' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ photos: [photo1, photo2] }),
      } as Response);

      const result = await getPhotosForEntity('diary_entry', 'entry-123');

      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('photo-1');
      expect(result[1]!.id).toBe('photo-2');
    });

    it('returns empty array when no photos exist for the entity', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ photos: [] }),
      } as Response);

      const result = await getPhotosForEntity('room', 'room-999');

      expect(result).toEqual([]);
    });

    it('encodes special characters in entityType and entityId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ photos: [] }),
      } as Response);

      await getPhotosForEntity('diary_entry', 'entry with spaces');

      const callUrl = mockFetch.mock.calls[0]![0] as string;
      expect(callUrl).toContain('entityId=entry+with+spaces');
    });

    it('throws ApiClientError when server returns 500', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
      } as Response);

      await expect(getPhotosForEntity('diary_entry', 'entry-123')).rejects.toThrow();
    });

    it('throws ApiClientError when entity not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Entity not found' } }),
      } as Response);

      await expect(getPhotosForEntity('diary_entry', 'nonexistent')).rejects.toThrow();
    });
  });

  // ─── updatePhoto ─────────────────────────────────────────────────────────────

  describe('updatePhoto', () => {
    it('sends PATCH request to /api/photos/:id with update data', async () => {
      const updatedPhoto = makePhoto({ caption: 'New caption' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ photo: updatedPhoto }),
      } as Response);

      await updatePhoto('photo-1', { caption: 'New caption' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/photos/photo-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ caption: 'New caption' }),
        }),
      );
    });

    it('returns the updated photo from the response', async () => {
      const updatedPhoto = makePhoto({ caption: 'Updated caption', sortOrder: 2 });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ photo: updatedPhoto }),
      } as Response);

      const result = await updatePhoto('photo-1', { caption: 'Updated caption', sortOrder: 2 });

      expect(result).toEqual(updatedPhoto);
      expect(result.caption).toBe('Updated caption');
      expect(result.sortOrder).toBe(2);
    });

    it('can set caption to null (clearing it)', async () => {
      const updatedPhoto = makePhoto({ caption: null });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ photo: updatedPhoto }),
      } as Response);

      await updatePhoto('photo-1', { caption: null });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/photos/photo-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ caption: null }),
        }),
      );
    });

    it('can update sortOrder only', async () => {
      const updatedPhoto = makePhoto({ sortOrder: 5 });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ photo: updatedPhoto }),
      } as Response);

      const result = await updatePhoto('photo-1', { sortOrder: 5 });

      expect(result.sortOrder).toBe(5);
    });

    it('throws when photo not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Photo not found' } }),
      } as Response);

      await expect(updatePhoto('nonexistent', { caption: 'test' })).rejects.toThrow();
    });

    it('throws on validation error (400)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid sort order' },
        }),
      } as Response);

      await expect(updatePhoto('photo-1', { sortOrder: -1 })).rejects.toThrow();
    });
  });

  // ─── deletePhoto ─────────────────────────────────────────────────────────────

  describe('deletePhoto', () => {
    it('sends DELETE request to /api/photos/:id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      await deletePhoto('photo-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/photos/photo-1',
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });

    it('returns the undo token from the response body', async () => {
      const body = { undo: { token: 'tok-9', expiresAt: '2026-01-01T00:00:10.000Z' } };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
      } as Response);

      const result = await deletePhoto('photo-1');

      expect(result).toEqual(body);
    });

    it('uses the correct photo ID in the URL path', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      await deletePhoto('photo-abc-xyz');

      const callUrl = mockFetch.mock.calls[0]![0] as string;
      expect(callUrl).toBe('/api/photos/photo-abc-xyz');
    });

    it('throws when photo not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Photo not found' } }),
      } as Response);

      await expect(deletePhoto('nonexistent')).rejects.toThrow();
    });

    it('throws on server error (500)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Delete failed' } }),
      } as Response);

      await expect(deletePhoto('photo-1')).rejects.toThrow();
    });
  });

  // ─── getPhotoFileUrl ──────────────────────────────────────────────────────────

  describe('getPhotoFileUrl', () => {
    it('returns the file URL for a photo using the base URL', () => {
      const url = getPhotoFileUrl('photo-1');
      expect(url).toBe('/api/photos/photo-1/file');
    });

    it('returns different URLs for different photo IDs', () => {
      const url1 = getPhotoFileUrl('photo-aaa');
      const url2 = getPhotoFileUrl('photo-bbb');

      expect(url1).toBe('/api/photos/photo-aaa/file');
      expect(url2).toBe('/api/photos/photo-bbb/file');
      expect(url1).not.toBe(url2);
    });
  });

  // ─── getPhotoThumbnailUrl ─────────────────────────────────────────────────────

  describe('getPhotoThumbnailUrl', () => {
    it('returns the thumbnail URL for a photo using the base URL', () => {
      const url = getPhotoThumbnailUrl('photo-1');
      expect(url).toBe('/api/photos/photo-1/thumbnail');
    });

    it('returns different URLs for different photo IDs', () => {
      const url1 = getPhotoThumbnailUrl('photo-aaa');
      const url2 = getPhotoThumbnailUrl('photo-bbb');

      expect(url1).toBe('/api/photos/photo-aaa/thumbnail');
      expect(url2).toBe('/api/photos/photo-bbb/thumbnail');
      expect(url1).not.toBe(url2);
    });

    it('thumbnail URL is distinct from file URL for the same photo', () => {
      const fileUrl = getPhotoFileUrl('photo-1');
      const thumbnailUrl = getPhotoThumbnailUrl('photo-1');

      expect(thumbnailUrl).not.toBe(fileUrl);
      expect(thumbnailUrl).toContain('/thumbnail');
      expect(fileUrl).toContain('/file');
    });
  });

  // ─── uploadPhoto ─────────────────────────────────────────────────────────────

  describe('uploadPhoto', () => {
    // uploadPhoto uses XMLHttpRequest, so we mock it

    let mockXhr: {
      open: jest.MockedFunction<(method: string, url: string) => void>;
      abort: jest.MockedFunction<() => void>;
      send: jest.MockedFunction<(body?: FormData) => void>;
      setRequestHeader: jest.MockedFunction<() => void>;
      upload: {
        addEventListener: jest.MockedFunction<
          (event: string, handler: (e: ProgressEvent) => void) => void
        >;
      };
      addEventListener: jest.MockedFunction<(event: string, handler: () => void) => void>;
      status: number;
      responseText: string;
    };

    let xhrEventHandlers: Record<string, () => void>;
    let xhrUploadEventHandlers: Record<string, (e: ProgressEvent) => void>;

    beforeEach(() => {
      xhrEventHandlers = {};
      xhrUploadEventHandlers = {};

      mockXhr = {
        open: jest.fn(),
        abort: jest.fn(),
        send: jest.fn(),
        setRequestHeader: jest.fn(),
        upload: {
          addEventListener: jest.fn((event: string, handler: (e: ProgressEvent) => void) => {
            xhrUploadEventHandlers[event] = handler;
          }),
        },
        addEventListener: jest.fn((event: string, handler: () => void) => {
          xhrEventHandlers[event] = handler;
        }),
        status: 201,
        responseText: '',
      };

      // Override the global XMLHttpRequest constructor
      globalThis.XMLHttpRequest = jest.fn(() => mockXhr) as unknown as typeof XMLHttpRequest;
    });

    const makeFile = (name = 'test.jpg', type = 'image/jpeg'): File =>
      new File(['content'], name, { type });

    it('opens XHR POST to /api/photos', () => {
      const file = makeFile();
      void uploadPhoto('diary_entry', 'entry-1', file);

      expect(mockXhr.open).toHaveBeenCalledWith('POST', '/api/photos');
    });

    it('appends file, entityType, and entityId to FormData and sends it', () => {
      const file = makeFile('photo.jpg');
      void uploadPhoto('diary_entry', 'entry-1', file);

      expect(mockXhr.send).toHaveBeenCalledWith(expect.any(FormData));
      const formData = mockXhr.send.mock.calls[0]![0] as FormData;
      expect(formData.get('file')).toBe(file);
      expect(formData.get('entityType')).toBe('diary_entry');
      expect(formData.get('entityId')).toBe('entry-1');
    });

    it('includes caption in FormData when provided', () => {
      const file = makeFile();
      void uploadPhoto('diary_entry', 'entry-1', file, 'My caption');

      const formData = mockXhr.send.mock.calls[0]![0] as FormData;
      expect(formData.get('caption')).toBe('My caption');
    });

    it('does not include caption in FormData when not provided', () => {
      const file = makeFile();
      void uploadPhoto('diary_entry', 'entry-1', file);

      const formData = mockXhr.send.mock.calls[0]![0] as FormData;
      expect(formData.get('caption')).toBeNull();
    });

    it('resolves with the photo from the response on 201 status', async () => {
      const photo = makePhoto();
      mockXhr.status = 201;
      mockXhr.responseText = JSON.stringify({ photo });

      const promise = uploadPhoto('diary_entry', 'entry-1', makeFile());

      // Trigger the load event
      xhrEventHandlers['load']!();

      const result = await promise;
      expect(result).toEqual(photo);
    });

    it('rejects with an ApiClientError carrying the server body code, status and details on non-201 status', async () => {
      mockXhr.status = 400;
      mockXhr.responseText = JSON.stringify({
        error: { code: 'VALIDATION_ERROR', message: 'File type not supported' },
      });

      const promise = uploadPhoto('diary_entry', 'entry-1', makeFile());
      xhrEventHandlers['load']!();

      const err = await promise.catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiClientError);
      expect((err as ApiClientError).statusCode).toBe(400);
      expect((err as ApiClientError).error.code).toBe('VALIDATION_ERROR');
    });

    it('derives INTERNAL_ERROR for a 5xx whose error body has no code', async () => {
      mockXhr.status = 500;
      mockXhr.responseText = JSON.stringify({ error: {} });

      const promise = uploadPhoto('diary_entry', 'entry-1', makeFile());
      xhrEventHandlers['load']!();

      const err = await promise.catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiClientError);
      expect((err as ApiClientError).statusCode).toBe(500);
      expect((err as ApiClientError).error.code).toBe('INTERNAL_ERROR');
    });

    it('derives INTERNAL_ERROR when a 5xx response is not JSON', async () => {
      mockXhr.status = 502;
      mockXhr.responseText = 'Bad Gateway';

      const promise = uploadPhoto('diary_entry', 'entry-1', makeFile());
      xhrEventHandlers['load']!();

      const err = await promise.catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiClientError);
      expect((err as ApiClientError).statusCode).toBe(502);
      expect((err as ApiClientError).error.code).toBe('INTERNAL_ERROR');
    });

    it('derives PAYLOAD_TOO_LARGE for an HTML (proxy) 413 response', async () => {
      mockXhr.status = 413;
      mockXhr.responseText = '<html><body>413 Request Entity Too Large</body></html>';

      const promise = uploadPhoto('diary_entry', 'entry-1', makeFile());
      xhrEventHandlers['load']!();

      const err = await promise.catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiClientError);
      expect((err as ApiClientError).statusCode).toBe(413);
      expect((err as ApiClientError).error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('derives VALIDATION_ERROR for a 4xx with an unparseable body', async () => {
      mockXhr.status = 400;
      mockXhr.responseText = 'nope';

      const promise = uploadPhoto('diary_entry', 'entry-1', makeFile());
      xhrEventHandlers['load']!();

      const err = await promise.catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiClientError);
      expect((err as ApiClientError).error.code).toBe('VALIDATION_ERROR');
    });

    it('ignores a JSON error body whose code is not a string and derives from the status', async () => {
      mockXhr.status = 413;
      mockXhr.responseText = JSON.stringify({ error: { code: 42, message: 'x' } });

      const promise = uploadPhoto('diary_entry', 'entry-1', makeFile());
      xhrEventHandlers['load']!();

      const err = await promise.catch((e: unknown) => e);
      expect((err as ApiClientError).error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('rejects with parse error when 201 response is not valid JSON', async () => {
      mockXhr.status = 201;
      mockXhr.responseText = 'not-json';

      const promise = uploadPhoto('diary_entry', 'entry-1', makeFile());
      xhrEventHandlers['load']!();

      await expect(promise).rejects.toThrow('Failed to parse upload response');
    });

    it('rejects with NetworkError on XHR error event', async () => {
      const promise = uploadPhoto('diary_entry', 'entry-1', makeFile());
      xhrEventHandlers['error']!();

      await expect(promise).rejects.toBeInstanceOf(NetworkError);
      await expect(promise).rejects.toThrow('Network error during upload');
    });

    it('rejects with an AbortError DOMException on XHR abort event', async () => {
      const promise = uploadPhoto('diary_entry', 'entry-1', makeFile());
      xhrEventHandlers['abort']!();

      await expect(promise).rejects.toBeInstanceOf(DOMException);
      await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    });

    describe('signal', () => {
      const send = (signal?: AbortSignal) =>
        uploadPhoto('diary_entry', 'entry-1', makeFile(), null, null, null, null, signal);

      it('rejects at once with an AbortError and never opens a request when already aborted', async () => {
        const controller = new AbortController();
        controller.abort();

        await expect(send(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });

        expect(globalThis.XMLHttpRequest).not.toHaveBeenCalled();
        expect(mockXhr.send).not.toHaveBeenCalled();
      });

      it('aborts the request when the signal fires during the upload', async () => {
        const controller = new AbortController();
        const promise = send(controller.signal);
        expect(mockXhr.abort).not.toHaveBeenCalled();

        controller.abort();
        expect(mockXhr.abort).toHaveBeenCalledTimes(1);
        // A real XHR answers abort() with the abort event.
        xhrEventHandlers['abort']!();

        await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
      });

      it('behaves as before with seven arguments (no signal)', async () => {
        const photo = makePhoto();
        mockXhr.status = 201;
        mockXhr.responseText = JSON.stringify({ photo });
        const promise = uploadPhoto('diary_entry', 'entry-1', makeFile(), 'cap', null, 'a1', 'o1');
        xhrEventHandlers['load']!();

        await expect(promise).resolves.toEqual(photo);
        expect(mockXhr.abort).not.toHaveBeenCalled();
      });
    });

    it('calls onProgress with percentage during upload when length is computable', async () => {
      const onProgress = jest.fn<(percent: number) => void>();

      const photo = makePhoto();
      mockXhr.status = 201;
      mockXhr.responseText = JSON.stringify({ photo });

      const promise = uploadPhoto('diary_entry', 'entry-1', makeFile(), undefined, onProgress);

      // Simulate progress events
      xhrUploadEventHandlers['progress']!({
        lengthComputable: true,
        loaded: 50,
        total: 100,
      } as ProgressEvent);

      xhrUploadEventHandlers['progress']!({
        lengthComputable: true,
        loaded: 100,
        total: 100,
      } as ProgressEvent);

      xhrEventHandlers['load']!();
      await promise;

      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(onProgress).toHaveBeenNthCalledWith(1, 50);
      expect(onProgress).toHaveBeenNthCalledWith(2, 100);
    });

    it('does not call onProgress when length is not computable', async () => {
      const onProgress = jest.fn<(percent: number) => void>();

      const photo = makePhoto();
      mockXhr.status = 201;
      mockXhr.responseText = JSON.stringify({ photo });

      const promise = uploadPhoto('diary_entry', 'entry-1', makeFile(), undefined, onProgress);

      xhrUploadEventHandlers['progress']!({
        lengthComputable: false,
        loaded: 50,
        total: 0,
      } as ProgressEvent);

      xhrEventHandlers['load']!();
      await promise;

      expect(onProgress).not.toHaveBeenCalled();
    });

    it('does not register progress listener when onProgress is not provided', () => {
      void uploadPhoto('diary_entry', 'entry-1', makeFile());

      // upload.addEventListener should not have been called since onProgress was omitted
      expect(mockXhr.upload.addEventListener).not.toHaveBeenCalled();
    });

    it('rounds progress percentage to nearest integer', async () => {
      const onProgress = jest.fn<(percent: number) => void>();

      const photo = makePhoto();
      mockXhr.status = 201;
      mockXhr.responseText = JSON.stringify({ photo });

      const promise = uploadPhoto('diary_entry', 'entry-1', makeFile(), undefined, onProgress);

      // 1/3 = 33.333...
      xhrUploadEventHandlers['progress']!({
        lengthComputable: true,
        loaded: 1,
        total: 3,
      } as ProgressEvent);

      xhrEventHandlers['load']!();
      await promise;

      expect(onProgress).toHaveBeenCalledWith(33);
    });
  });
  // ─── uploadAnnotation ────────────────────────────────────────────────────────

  describe('uploadAnnotation', () => {
    const blob = new Blob(['x'], { type: 'image/webp' });
    const samplePhoto = makePhoto();

    it('PUTs the blob and resolves with the photo on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ photo: samplePhoto }),
      } as Response);

      const result = await uploadAnnotation('photo-1', blob);

      expect(result).toEqual(samplePhoto);
      const [url, init] = mockFetch.mock.calls[0]!;
      expect(String(url)).toContain('/photos/photo-1/annotation');
      expect(init?.method).toBe('PUT');
    });

    it('rejects with an ApiClientError built from the server error body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: { code: 'IMMUTABLE_ENTRY', message: 'locked' } }),
      } as Response);

      const err = await uploadAnnotation('photo-1', blob).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiClientError);
      expect((err as ApiClientError).statusCode).toBe(403);
      expect((err as ApiClientError).error.code).toBe('IMMUTABLE_ENTRY');
    });

    it('derives PAYLOAD_TOO_LARGE for an unparseable 413 body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 413,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      } as unknown as Response);

      const err = await uploadAnnotation('photo-1', blob).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiClientError);
      expect((err as ApiClientError).error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('clearAnnotation sends DELETE to the annotation endpoint', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' } as Response);

      await clearAnnotation('photo-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/photos/photo-1/annotation',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('converts a fetch rejection into a NetworkError carrying the cause', async () => {
      const cause = new TypeError('Failed to fetch');
      mockFetch.mockRejectedValueOnce(cause);

      const err = await uploadAnnotation('photo-1', blob).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(NetworkError);
      expect((err as NetworkError).message).toBe('Network request failed');
      expect((err as NetworkError).cause).toBe(cause);
    });

    it('derives VALIDATION_ERROR for a 4xx body without an error code', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'raw server text' } }),
      } as Response);

      const err = await uploadAnnotation('photo-1', blob).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiClientError);
      expect((err as ApiClientError).statusCode).toBe(400);
      expect((err as ApiClientError).error.code).toBe('VALIDATION_ERROR');
      expect((err as ApiClientError).error.message).toBe('HTTP 400');
    });

    it('derives INTERNAL_ERROR for an unparseable 500 body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new SyntaxError('bad');
        },
      } as unknown as Response);

      const err = await uploadAnnotation('photo-1', blob).catch((e: unknown) => e);

      expect((err as ApiClientError).error.code).toBe('INTERNAL_ERROR');
    });
  });

  // ─── Photo spots (Story #2162) ────────────────────────────────────────────────

  describe('getPhotoSpots', () => {
    it('GETs /api/photos/spots and returns the parsed body', async () => {
      const body = { spots: [], areas: [], orientations: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => body,
      } as Response);

      const result = await getPhotoSpots();

      expect(result).toEqual(body);
      expect(mockFetch.mock.calls[0]![0]).toBe('/api/photos/spots');
    });
  });

  describe('getPhotoSpotPhotos', () => {
    it('sends areaId and orientationId query params', async () => {
      const body = { area: null, orientation: null, photos: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => body,
      } as Response);

      await getPhotoSpotPhotos('a1', 'o1');

      const url = new URL(mockFetch.mock.calls[0]![0] as string, 'http://x');
      expect(url.pathname).toBe('/api/photos/spots/photos');
      expect(url.searchParams.get('areaId')).toBe('a1');
      expect(url.searchParams.get('orientationId')).toBe('o1');
    });

    it('maps a null area to the __none__ sentinel', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ area: null, orientation: null, photos: [] }),
      } as Response);

      await getPhotoSpotPhotos(null, 'o1');

      expect(mockFetch.mock.calls[0]![0]).toBe(
        '/api/photos/spots/photos?areaId=__none__&orientationId=o1',
      );
    });

    it('maps a null orientation to the __none__ sentinel', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ area: null, orientation: null, photos: [] }),
      } as Response);

      await getPhotoSpotPhotos('a1', null);

      expect(mockFetch.mock.calls[0]![0]).toBe(
        '/api/photos/spots/photos?areaId=a1&orientationId=__none__',
      );
    });

    it('passes the __any__ orientation sentinel through (all no-area photos)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ area: null, orientation: null, photos: [] }),
      } as Response);

      await getPhotoSpotPhotos(null, PHOTO_SPOT_ANY);

      expect(mockFetch.mock.calls[0]![0]).toBe(
        '/api/photos/spots/photos?areaId=__none__&orientationId=__any__',
      );
    });
  });

  // ─── updatePhotoDetails / updatePhotoTags ────────────────────────────────────

  describe('updatePhotoDetails', () => {
    it('PATCHes /api/photos/:id and returns the whole response including undo', async () => {
      const photo = makePhoto({ areaId: 'a1' });
      const undo = { token: 'tok', expiresAt: '2026-01-01T00:00:30.000Z' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ photo, undo }),
      } as Response);

      const result = await updatePhotoDetails('photo-1', { areaId: 'a1' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/photos/photo-1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ areaId: 'a1' }) }),
      );
      expect(result).toEqual({ photo, undo });
    });

    it('returns a response without undo when no tag changed', async () => {
      const photo = makePhoto({ caption: 'x' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ photo }),
      } as Response);

      const result = await updatePhotoDetails('photo-1', { caption: 'x' });

      expect(result.undo).toBeUndefined();
    });

    it('rejects with ApiClientError on a server error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: { code: 'IMMUTABLE_ENTRY', message: 'locked' } }),
      } as Response);

      await expect(updatePhotoDetails('photo-1', { areaId: null })).rejects.toBeInstanceOf(
        ApiClientError,
      );
    });
  });

  describe('updatePhotoTags', () => {
    it('PATCHes /api/photos/tags with only the supplied keys and returns the result', async () => {
      const undo = { token: 'tok', expiresAt: '2026-01-01T00:00:30.000Z' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ updated: 2, undo }),
      } as Response);

      const result = await updatePhotoTags({ photoIds: ['a', 'b'], areaId: 'a1' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/photos/tags',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ photoIds: ['a', 'b'], areaId: 'a1' }),
        }),
      );
      expect(result).toEqual({ updated: 2, undo });
    });

    it('sends null to clear a tag', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ updated: 1, undo: { token: 't', expiresAt: 'x' } }),
      } as Response);

      await updatePhotoTags({ photoIds: ['a'], orientationId: null });

      const body = JSON.parse((mockFetch.mock.calls[0]![1] as RequestInit).body as string);
      expect(body).toEqual({ photoIds: ['a'], orientationId: null });
    });

    it('rejects with ApiClientError when the server refuses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          error: { code: 'IMMUTABLE_ENTRY', message: 'locked', details: { lockedPhotoIds: ['a'] } },
        }),
      } as Response);

      await expect(updatePhotoTags({ photoIds: ['a'], areaId: 'x' })).rejects.toBeInstanceOf(
        ApiClientError,
      );
    });
  });

  // ─── fetchPhotoBlob ──────────────────────────────────────────────────────────

  describe('fetchPhotoBlob', () => {
    const blob = new Blob(['img'], { type: 'image/webp' });
    const okResponse = () => ({ ok: true, blob: async () => blob }) as unknown as Response;

    it('fetches the annotated (default) file from fileUrl with credentials', async () => {
      mockFetch.mockResolvedValueOnce(okResponse());

      const result = await fetchPhotoBlob(makePhoto(), 'annotated');

      expect(result).toBe(blob);
      expect(mockFetch).toHaveBeenCalledWith('/api/photos/photo-1/file', {
        credentials: 'include',
      });
    });

    it('adds ?variant=original for the original', async () => {
      mockFetch.mockResolvedValueOnce(okResponse());

      await fetchPhotoBlob(makePhoto(), 'original');

      expect(mockFetch.mock.calls[0]![0]).toBe('/api/photos/photo-1/file?variant=original');
    });

    it('joins with & when the url already carries a query', async () => {
      mockFetch.mockResolvedValue(okResponse());
      const versioned = makePhoto({ fileUrl: '/api/photos/photo-1/file?v=123' });

      await fetchPhotoBlob(versioned, 'original');
      await fetchPhotoBlob(versioned, 'annotated');

      expect(mockFetch.mock.calls[0]![0]).toBe('/api/photos/photo-1/file?v=123&variant=original');
      expect(mockFetch.mock.calls[1]![0]).toBe('/api/photos/photo-1/file?v=123');
    });

    it('maps an error response to ApiClientError with its code', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'nope' } }),
      } as unknown as Response);

      const error = await fetchPhotoBlob(makePhoto(), 'original').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiClientError);
      expect((error as ApiClientError).statusCode).toBe(404);
      expect((error as ApiClientError).error.code).toBe('NOT_FOUND');
    });

    it('falls back to a status-derived error for a non-JSON body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError('bad json');
        },
      } as unknown as Response);

      const error = await fetchPhotoBlob(makePhoto(), 'original').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiClientError);
      expect((error as ApiClientError).statusCode).toBe(502);
    });

    it('throws NetworkError when fetch itself fails', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(fetchPhotoBlob(makePhoto(), 'annotated')).rejects.toBeInstanceOf(NetworkError);
    });
  });
});
