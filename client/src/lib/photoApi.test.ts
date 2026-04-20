import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  getPhotosForEntity,
  updatePhoto,
  deletePhoto,
  getPhotoFileUrl,
  getPhotoThumbnailUrl,
  uploadPhoto,
} from './photoApi.js';
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
  sortOrder: 0,
  createdBy: null,
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

    it('returns void on successful delete', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      const result = await deletePhoto('photo-1');

      expect(result).toBeUndefined();
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

    it('rejects with an error message from the server on non-201 status', async () => {
      mockXhr.status = 400;
      mockXhr.responseText = JSON.stringify({
        error: { message: 'File type not supported' },
      });

      const promise = uploadPhoto('diary_entry', 'entry-1', makeFile());
      xhrEventHandlers['load']!();

      await expect(promise).rejects.toThrow('File type not supported');
    });

    it('rejects with generic upload failed message when server error body has no message', async () => {
      mockXhr.status = 500;
      mockXhr.responseText = JSON.stringify({ error: {} });

      const promise = uploadPhoto('diary_entry', 'entry-1', makeFile());
      xhrEventHandlers['load']!();

      await expect(promise).rejects.toThrow('Upload failed (500)');
    });

    it('rejects with generic upload failed message when server response is not JSON', async () => {
      mockXhr.status = 502;
      mockXhr.responseText = 'Bad Gateway';

      const promise = uploadPhoto('diary_entry', 'entry-1', makeFile());
      xhrEventHandlers['load']!();

      await expect(promise).rejects.toThrow('Upload failed (502)');
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

      await expect(promise).rejects.toThrow('Network error during upload');
    });

    it('rejects with abort error on XHR abort event', async () => {
      const promise = uploadPhoto('diary_entry', 'entry-1', makeFile());
      xhrEventHandlers['abort']!();

      await expect(promise).rejects.toThrow('Upload aborted');
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
});
