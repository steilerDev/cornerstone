import { renderHook, act, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';

// ─── Hoisted mocks (must precede dynamic import) ───────────────────────────────

const mockGetPhotosForEntity = jest.fn<() => Promise<unknown>>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUploadPhotoApi = jest.fn<(...args: any[]) => Promise<unknown>>();
const mockUpdatePhotoApi = jest.fn<() => Promise<unknown>>();
const mockDeletePhotoApi = jest.fn<() => Promise<void>>();

jest.unstable_mockModule('../lib/photoApi.js', () => ({
  getPhotosForEntity: mockGetPhotosForEntity,
  uploadPhoto: mockUploadPhotoApi,
  updatePhoto: mockUpdatePhotoApi,
  deletePhoto: mockDeletePhotoApi,
  getPhotoFileUrl: jest.fn((id: string) => `/api/photos/${id}/file`),
  getPhotoThumbnailUrl: jest.fn((id: string) => `/api/photos/${id}/thumbnail`),
}));

class MockApiClientError extends Error {
  statusCode: number;
  error: { code: string; message?: string };
  constructor(statusCode: number, error: { code: string; message?: string }) {
    super(error.message ?? 'API Error');
    this.statusCode = statusCode;
    this.error = error;
  }
}

class MockNetworkError extends Error {
  constructor(message: string) {
    super(message);
  }
}

jest.unstable_mockModule('../lib/apiClient.js', () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  del: jest.fn(),
  put: jest.fn(),
  setBaseUrl: jest.fn(),
  getBaseUrl: jest.fn().mockReturnValue('/api'),
  ApiClientError: MockApiClientError,
  NetworkError: MockNetworkError,
}));

import type * as UsePhotosModule from './usePhotos.js';

let usePhotos: (typeof UsePhotosModule)['usePhotos'];

// ─── Fixture factory ───────────────────────────────────────────────────────────

const makePhoto = (id: string, overrides = {}) => ({
  id,
  entityType: 'diary_entry',
  entityId: 'entry-1',
  originalFilename: `photo-${id}.jpg`,
  mimeType: 'image/jpeg',
  fileSize: 10000,
  width: 800,
  height: 600,
  takenAt: null,
  caption: null,
  sortOrder: 0,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  fileUrl: `/api/photos/${id}/file`,
  thumbnailUrl: `/api/photos/${id}/thumbnail`,
  ...overrides,
});

// ─── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(async () => {
  ({ usePhotos } = (await import('./usePhotos.js')) as typeof UsePhotosModule);
  mockGetPhotosForEntity.mockReset();
  mockUploadPhotoApi.mockReset();
  mockUpdatePhotoApi.mockReset();
  mockDeletePhotoApi.mockReset();

  // Default: resolves with an empty array
  mockGetPhotosForEntity.mockResolvedValue([]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('usePhotos', () => {
  // ─── Initial loading state ─────────────────────────────────────────────────

  it('starts with loading=true while the initial fetch is pending', () => {
    mockGetPhotosForEntity.mockImplementationOnce(() => new Promise(() => {}));

    const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));

    expect(result.current.loading).toBe(true);
    expect(result.current.photos).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('fetches photos on mount using entityType and entityId', async () => {
    const photos = [makePhoto('photo-1'), makePhoto('photo-2')];
    mockGetPhotosForEntity.mockResolvedValueOnce(photos);

    const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));

    await waitFor(() => expect(result.current.photos).toHaveLength(2));

    expect(mockGetPhotosForEntity).toHaveBeenCalledWith('diary_entry', 'entry-1');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets loading=false and populates photos on successful fetch', async () => {
    const photos = [makePhoto('photo-abc')];
    mockGetPhotosForEntity.mockResolvedValueOnce(photos);

    const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.photos).toEqual(photos);
  });

  it('resolves to empty photos array when entity has no photos', async () => {
    mockGetPhotosForEntity.mockResolvedValueOnce([]);

    const { result } = renderHook(() => usePhotos('room', 'room-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.photos).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('does not fetch when entityType is empty', async () => {
    const { result } = renderHook(() => usePhotos('', 'entry-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGetPhotosForEntity).not.toHaveBeenCalled();
    expect(result.current.photos).toEqual([]);
  });

  it('does not fetch when entityId is empty', async () => {
    const { result } = renderHook(() => usePhotos('diary_entry', ''));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGetPhotosForEntity).not.toHaveBeenCalled();
    expect(result.current.photos).toEqual([]);
  });

  // ─── Error handling ────────────────────────────────────────────────────────

  it('sets error from ApiClientError message and clears loading', async () => {
    mockGetPhotosForEntity.mockRejectedValueOnce(
      new MockApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Server error' }),
    );

    const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));

    await waitFor(() => expect(result.current.error).toBe('Server error'));
    expect(result.current.loading).toBe(false);
    expect(result.current.photos).toEqual([]);
  });

  it('uses fallback message when ApiClientError has no message', async () => {
    mockGetPhotosForEntity.mockRejectedValueOnce(
      new MockApiClientError(401, { code: 'UNAUTHORIZED' }),
    );

    const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));

    await waitFor(() => expect(result.current.error).toBe('Failed to load photos.'));
    expect(result.current.loading).toBe(false);
  });

  it('sets network error message on NetworkError', async () => {
    mockGetPhotosForEntity.mockRejectedValueOnce(new MockNetworkError('Connection refused'));

    const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));

    await waitFor(() =>
      expect(result.current.error).toBe('Network error: Unable to connect to the server.'),
    );
    expect(result.current.loading).toBe(false);
  });

  it('sets generic error message for unexpected errors', async () => {
    mockGetPhotosForEntity.mockRejectedValueOnce(new Error('Unexpected failure'));

    const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));

    await waitFor(() => expect(result.current.error).toBe('An unexpected error occurred.'));
    expect(result.current.loading).toBe(false);
  });

  // ─── refresh() ────────────────────────────────────────────────────────────

  describe('refresh()', () => {
    it('triggers a new fetch when called', async () => {
      mockGetPhotosForEntity.mockResolvedValue([]);

      const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));

      await waitFor(() => expect(mockGetPhotosForEntity).toHaveBeenCalledTimes(1));

      const callsBefore = mockGetPhotosForEntity.mock.calls.length;

      act(() => {
        result.current.refresh();
      });

      await waitFor(() =>
        expect(mockGetPhotosForEntity.mock.calls.length).toBeGreaterThan(callsBefore),
      );
    });

    it('updates photos with fresh data after refresh', async () => {
      mockGetPhotosForEntity.mockResolvedValueOnce([]);

      const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));
      await waitFor(() => expect(mockGetPhotosForEntity).toHaveBeenCalledTimes(1));

      const newPhotos = [makePhoto('photo-fresh')];
      mockGetPhotosForEntity.mockResolvedValueOnce(newPhotos);

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => expect(result.current.photos).toEqual(newPhotos));
    });
  });

  // ─── uploadProgress ───────────────────────────────────────────────────────

  it('starts with an empty uploadProgress map', async () => {
    const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.uploadProgress.size).toBe(0);
  });

  // ─── uploadPhoto() ─────────────────────────────────────────────────────────

  describe('uploadPhoto()', () => {
    const makeFile = (name = 'test.jpg'): File =>
      new File(['content'], name, { type: 'image/jpeg' });

    it('calls uploadPhotoApi with entityType, entityId, file, and caption', async () => {
      const photo = makePhoto('photo-new');
      mockUploadPhotoApi.mockResolvedValueOnce(photo);
      mockGetPhotosForEntity.mockResolvedValueOnce([]);

      const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      const file = makeFile('upload.jpg');

      await act(async () => {
        await result.current.uploadPhoto(file, 'Test caption');
      });

      expect(mockUploadPhotoApi).toHaveBeenCalledWith(
        'diary_entry',
        'entry-1',
        file,
        'Test caption',
        expect.any(Function),
      );
    });

    it('prepends the new photo to the beginning of the photos list', async () => {
      const existingPhoto = makePhoto('photo-old');
      mockGetPhotosForEntity.mockResolvedValueOnce([existingPhoto]);

      const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));
      await waitFor(() => expect(result.current.photos).toHaveLength(1));

      const newPhoto = makePhoto('photo-new');
      mockUploadPhotoApi.mockResolvedValueOnce(newPhoto);

      await act(async () => {
        await result.current.uploadPhoto(makeFile());
      });

      expect(result.current.photos).toHaveLength(2);
      expect(result.current.photos[0]!.id).toBe('photo-new');
      expect(result.current.photos[1]!.id).toBe('photo-old');
    });

    it('returns the uploaded photo', async () => {
      const photo = makePhoto('photo-returned');
      mockUploadPhotoApi.mockResolvedValueOnce(photo);
      mockGetPhotosForEntity.mockResolvedValueOnce([]);

      const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      let returned: unknown;
      await act(async () => {
        returned = await result.current.uploadPhoto(makeFile());
      });

      expect(returned).toEqual(photo);
    });

    it('updates uploadProgress during upload via the progress wrapper', async () => {
      let capturedProgressCallback: ((percent: number) => void) | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let resolveUpload: (value: any) => void;
      const photo = makePhoto('photo-progress');

      mockUploadPhotoApi.mockImplementationOnce(
        (_entityType, _entityId, _file, _caption, onProgress) => {
          capturedProgressCallback = onProgress as (percent: number) => void;
          // Deferred promise — upload stays pending until resolveUpload() is called.
          // This ensures the upload does NOT complete before we can check progress state.
          return new Promise((resolve) => {
            resolveUpload = resolve;
          });
        },
      );

      mockGetPhotosForEntity.mockResolvedValueOnce([]);

      const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      const file = makeFile('progress.jpg');

      // Start the upload but do NOT await it — runs until it hits the deferred promise
      // Using a separate variable to track the upload promise for cleanup
      let uploadDone = false;
      const runUpload = async () => {
        await result.current.uploadPhoto(file);
        uploadDone = true;
      };
      // Fire the upload outside act to avoid nested act problems
      const uploadPromise = runUpload().catch(() => {
        uploadDone = true;
      });

      // The mock runs synchronously when uploadPhoto calls uploadPhotoApi,
      // so capturedProgressCallback is set before the first await in uploadPhoto
      expect(capturedProgressCallback).toBeDefined();

      // Simulate a progress event inside act() so React flushes the state update
      await act(async () => {
        capturedProgressCallback!(75);
      });

      // After act(), the state update has been committed
      expect(result.current.uploadProgress.get('progress.jpg')).toBe(75);
      expect(uploadDone).toBe(false); // upload still pending

      // Resolve the upload to clean up
      await act(async () => {
        resolveUpload!(photo);
        await uploadPromise;
      });
    });

    it('clears uploadProgress entry after successful upload', async () => {
      let capturedProgressCallback: ((percent: number) => void) | undefined;
      const photo = makePhoto('photo-done');

      mockUploadPhotoApi.mockImplementationOnce(
        (_entityType, _entityId, _file, _caption, onProgress) => {
          capturedProgressCallback = onProgress as (percent: number) => void;
          return Promise.resolve(photo);
        },
      );

      mockGetPhotosForEntity.mockResolvedValueOnce([]);

      const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      const file = makeFile('done.jpg');

      await act(async () => {
        // Trigger progress before the upload resolves
        if (capturedProgressCallback) {
          capturedProgressCallback(50);
        }
        await result.current.uploadPhoto(file);
      });

      expect(result.current.uploadProgress.has('done.jpg')).toBe(false);
    });

    it('clears uploadProgress entry on upload failure', async () => {
      let capturedProgressCallback: ((percent: number) => void) | undefined;

      mockUploadPhotoApi.mockImplementationOnce(
        (_entityType, _entityId, _file, _caption, onProgress) => {
          capturedProgressCallback = onProgress as (percent: number) => void;
          return Promise.reject(new Error('Upload failed'));
        },
      );

      mockGetPhotosForEntity.mockResolvedValueOnce([]);

      const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      const file = makeFile('fail.jpg');

      await act(async () => {
        try {
          await result.current.uploadPhoto(file);
        } catch {
          // expected
        }
      });

      expect(result.current.uploadProgress.has('fail.jpg')).toBe(false);
    });

    it('re-throws when upload fails', async () => {
      mockUploadPhotoApi.mockRejectedValueOnce(new Error('Upload error'));
      mockGetPhotosForEntity.mockResolvedValueOnce([]);

      const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      let thrownError: unknown;
      await act(async () => {
        try {
          await result.current.uploadPhoto(makeFile());
        } catch (err) {
          thrownError = err;
        }
      });

      expect(thrownError).toBeInstanceOf(Error);
    });

    it('forwards the external onProgress callback with the same percentage', async () => {
      let capturedInternalCallback: ((percent: number) => void) | undefined;
      const photo = makePhoto('photo-ext-progress');

      mockUploadPhotoApi.mockImplementationOnce(
        (_entityType, _entityId, _file, _caption, onProgress) => {
          capturedInternalCallback = onProgress as (percent: number) => void;
          return Promise.resolve(photo);
        },
      );

      mockGetPhotosForEntity.mockResolvedValueOnce([]);

      const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      const externalOnProgress = jest.fn<(percent: number) => void>();

      await act(async () => {
        const file = makeFile('ext.jpg');
        const uploadPromise = result.current.uploadPhoto(file, undefined, externalOnProgress);

        if (capturedInternalCallback) {
          capturedInternalCallback(60);
        }
        await uploadPromise;
      });

      expect(externalOnProgress).toHaveBeenCalledWith(60);
    });
  });

  // ─── deletePhoto() ─────────────────────────────────────────────────────────

  describe('deletePhoto()', () => {
    it('calls deletePhotoApi with the photo ID', async () => {
      const photos = [makePhoto('photo-1')];
      mockGetPhotosForEntity.mockResolvedValueOnce(photos);
      mockDeletePhotoApi.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));
      await waitFor(() => expect(result.current.photos).toHaveLength(1));

      await act(async () => {
        await result.current.deletePhoto('photo-1');
      });

      expect(mockDeletePhotoApi).toHaveBeenCalledWith('photo-1');
    });

    it('removes the deleted photo from local state', async () => {
      const photos = [makePhoto('photo-1'), makePhoto('photo-2')];
      mockGetPhotosForEntity.mockResolvedValueOnce(photos);
      mockDeletePhotoApi.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));
      await waitFor(() => expect(result.current.photos).toHaveLength(2));

      await act(async () => {
        await result.current.deletePhoto('photo-1');
      });

      expect(result.current.photos).toHaveLength(1);
      expect(result.current.photos[0]!.id).toBe('photo-2');
    });

    it('only removes the targeted photo when multiple photos exist', async () => {
      const photos = [makePhoto('photo-1'), makePhoto('photo-2'), makePhoto('photo-3')];
      mockGetPhotosForEntity.mockResolvedValueOnce(photos);
      mockDeletePhotoApi.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));
      await waitFor(() => expect(result.current.photos).toHaveLength(3));

      await act(async () => {
        await result.current.deletePhoto('photo-2');
      });

      expect(result.current.photos).toHaveLength(2);
      expect(result.current.photos.map((p: { id: string }) => p.id)).toEqual([
        'photo-1',
        'photo-3',
      ]);
    });

    it('re-throws when deletePhotoApi rejects', async () => {
      const photos = [makePhoto('photo-1')];
      mockGetPhotosForEntity.mockResolvedValueOnce(photos);
      mockDeletePhotoApi.mockRejectedValueOnce(new Error('Delete failed'));

      const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));
      await waitFor(() => expect(result.current.photos).toHaveLength(1));

      let thrownError: unknown;
      await act(async () => {
        try {
          await result.current.deletePhoto('photo-1');
        } catch (err) {
          thrownError = err;
        }
      });

      expect(thrownError).toBeInstanceOf(Error);
    });
  });

  // ─── updatePhoto() ─────────────────────────────────────────────────────────

  describe('updatePhoto()', () => {
    it('calls updatePhotoApi with the photo ID and update data', async () => {
      const existingPhoto = makePhoto('photo-1');
      const updatedPhoto = makePhoto('photo-1', { caption: 'New caption' });
      mockGetPhotosForEntity.mockResolvedValueOnce([existingPhoto]);
      mockUpdatePhotoApi.mockResolvedValueOnce(updatedPhoto);

      const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));
      await waitFor(() => expect(result.current.photos).toHaveLength(1));

      await act(async () => {
        await result.current.updatePhoto('photo-1', { caption: 'New caption' });
      });

      expect(mockUpdatePhotoApi).toHaveBeenCalledWith('photo-1', { caption: 'New caption' });
    });

    it('replaces the updated photo in local state', async () => {
      const existingPhoto = makePhoto('photo-1', { caption: 'Old caption' });
      const updatedPhoto = makePhoto('photo-1', { caption: 'New caption' });
      mockGetPhotosForEntity.mockResolvedValueOnce([existingPhoto]);
      mockUpdatePhotoApi.mockResolvedValueOnce(updatedPhoto);

      const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));
      await waitFor(() => expect(result.current.photos).toHaveLength(1));

      await act(async () => {
        await result.current.updatePhoto('photo-1', { caption: 'New caption' });
      });

      expect(result.current.photos[0]!.caption).toBe('New caption');
    });

    it('only replaces the targeted photo when multiple photos exist', async () => {
      const photo1 = makePhoto('photo-1', { caption: 'First' });
      const photo2 = makePhoto('photo-2', { caption: 'Second' });
      const updatedPhoto2 = makePhoto('photo-2', { caption: 'Updated second' });
      mockGetPhotosForEntity.mockResolvedValueOnce([photo1, photo2]);
      mockUpdatePhotoApi.mockResolvedValueOnce(updatedPhoto2);

      const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));
      await waitFor(() => expect(result.current.photos).toHaveLength(2));

      await act(async () => {
        await result.current.updatePhoto('photo-2', { caption: 'Updated second' });
      });

      expect(result.current.photos[0]!.caption).toBe('First');
      expect(result.current.photos[1]!.caption).toBe('Updated second');
    });

    it('can update sortOrder', async () => {
      const existingPhoto = makePhoto('photo-1', { sortOrder: 0 });
      const updatedPhoto = makePhoto('photo-1', { sortOrder: 3 });
      mockGetPhotosForEntity.mockResolvedValueOnce([existingPhoto]);
      mockUpdatePhotoApi.mockResolvedValueOnce(updatedPhoto);

      const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));
      await waitFor(() => expect(result.current.photos).toHaveLength(1));

      await act(async () => {
        await result.current.updatePhoto('photo-1', { sortOrder: 3 });
      });

      expect(result.current.photos[0]!.sortOrder).toBe(3);
    });

    it('re-throws when updatePhotoApi rejects', async () => {
      const existingPhoto = makePhoto('photo-1');
      mockGetPhotosForEntity.mockResolvedValueOnce([existingPhoto]);
      mockUpdatePhotoApi.mockRejectedValueOnce(new Error('Update failed'));

      const { result } = renderHook(() => usePhotos('diary_entry', 'entry-1'));
      await waitFor(() => expect(result.current.photos).toHaveLength(1));

      let thrownError: unknown;
      await act(async () => {
        try {
          await result.current.updatePhoto('photo-1', { caption: 'test' });
        } catch (err) {
          thrownError = err;
        }
      });

      expect(thrownError).toBeInstanceOf(Error);
    });
  });

  // ─── Refetch on entityId change ────────────────────────────────────────────

  it('refetches when entityId changes', async () => {
    mockGetPhotosForEntity.mockResolvedValue([]);

    const { result, rerender } = renderHook(({ entityId }) => usePhotos('diary_entry', entityId), {
      initialProps: { entityId: 'entry-1' },
    });

    await waitFor(() => expect(mockGetPhotosForEntity).toHaveBeenCalledTimes(1));
    expect(mockGetPhotosForEntity).toHaveBeenCalledWith('diary_entry', 'entry-1');

    const newPhotos = [makePhoto('photo-xyz')];
    mockGetPhotosForEntity.mockResolvedValueOnce(newPhotos);

    rerender({ entityId: 'entry-2' });

    await waitFor(() =>
      expect(mockGetPhotosForEntity).toHaveBeenCalledWith('diary_entry', 'entry-2'),
    );
    await waitFor(() => expect(result.current.photos).toEqual(newPhotos));
  });

  it('refetches when entityType changes', async () => {
    mockGetPhotosForEntity.mockResolvedValue([]);

    const { rerender } = renderHook(({ entityType }) => usePhotos(entityType, 'entity-1'), {
      initialProps: { entityType: 'diary_entry' },
    });

    await waitFor(() => expect(mockGetPhotosForEntity).toHaveBeenCalledTimes(1));

    rerender({ entityType: 'room' });

    await waitFor(() => expect(mockGetPhotosForEntity).toHaveBeenCalledWith('room', 'entity-1'));
  });
});
