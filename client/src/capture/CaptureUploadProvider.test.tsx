/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, render, waitFor } from '@testing-library/react';
import i18n from 'i18next';
import type { Photo } from '@cornerstone/shared';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';
import type * as ProviderTypes from './CaptureUploadProvider.js';
import type * as ContextTypes from './captureUploadsContext.js';
import type { CaptureStore } from './captureStore.js';
import type { CaptureRecord, CaptureTags, CaptureUploadsApi } from './captureTypes.js';

let mockUser: { id: string } | null = { id: 'user-1' };
const mockShowToast = jest.fn<(variant: string, message: string) => void>();
jest.unstable_mockModule('../contexts/AuthContext.js', () => ({
  useAuth: () => ({ user: mockUser }),
}));
jest.unstable_mockModule('../components/Toast/ToastContext.js', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

interface Upload {
  entityId: string;
  caption: string | null;
  areaId: string | null;
  orientationId: string | null;
  signal: AbortSignal;
  onProgress: (percent: number) => void;
  resolve: (photo: Photo) => void;
  reject: (error: unknown) => void;
}
const uploads: Upload[] = [];
const mockUploadPhoto = jest.fn(
  (
    _entityType: string,
    entityId: string,
    _file: File,
    caption: string | null | undefined,
    onProgress: ((percent: number) => void) | null | undefined,
    areaId: string | null | undefined,
    orientationId: string | null | undefined,
    signal: AbortSignal | undefined,
  ) =>
    new Promise<Photo>((resolve, reject) => {
      uploads.push({
        entityId,
        caption: caption ?? null,
        areaId: areaId ?? null,
        orientationId: orientationId ?? null,
        signal: signal!,
        onProgress: onProgress!,
        resolve,
        reject,
      });
    }),
);
const mockDeletePhoto = jest.fn<(id: string) => Promise<void>>();
const mockUpdatePhoto = jest.fn<(id: string, data: Record<string, unknown>) => Promise<Photo>>();
jest.unstable_mockModule('../lib/photoApi.js', () => ({
  uploadPhoto: mockUploadPhoto,
  deletePhoto: mockDeletePhoto,
  updatePhoto: mockUpdatePhoto,
}));
const mockGetDiaryEntry = jest.fn<(id: string) => Promise<unknown>>();
jest.unstable_mockModule('../lib/diaryApi.js', () => ({ getDiaryEntry: mockGetDiaryEntry }));

function inlineStore(kind: 'indexeddb' | 'memory', seed: CaptureRecord[] = []): CaptureStore {
  const records = new Map(seed.map((record) => [record.id, record]));
  return {
    kind,
    put: (record) => {
      records.set(record.id, record);
      return Promise.resolve();
    },
    remove: (id) => {
      records.delete(id);
      return Promise.resolve();
    },
    list: (userId) =>
      Promise.resolve([...records.values()].filter((record) => record.userId === userId)),
  };
}
let nextStore: () => CaptureStore = () => inlineStore('memory');
jest.unstable_mockModule('./captureStore.js', () => ({
  openCaptureStore: () => Promise.resolve(nextStore()),
}));

const NO_TAGS: CaptureTags = {
  areaId: null,
  orientationId: null,
  areaSource: null,
  orientationSource: null,
  caption: null,
};
const photo = (id: string) => ({ id }) as unknown as Photo;
const apiError = (status: number) =>
  new ApiClientError(status, { code: 'INTERNAL_ERROR', message: 'x' });
const file = (name = 'a.jpg') => new File(['pixels'], name, { type: 'image/jpeg' });
const settle = (ms = 20) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

describe('CaptureUploadProvider', () => {
  let Provider: typeof ProviderTypes.CaptureUploadProvider;
  let useCaptureUploads: typeof ContextTypes.useCaptureUploads;
  let api: CaptureUploadsApi;
  let renders: number;
  let onLine: boolean;
  let urlCounter: number;
  const createObjectURL = jest.fn<(blob: Blob) => string>();
  const revokeObjectURL = jest.fn<(url: string) => void>();

  function Probe() {
    api = useCaptureUploads();
    renders += 1;
    return null;
  }

  function setup() {
    return render(
      <Provider>
        <Probe />
      </Provider>,
    );
  }

  const purgedMessage = () => i18n.t('upload.purged', { ns: 'photos' });

  beforeEach(async () => {
    mockUser = { id: 'user-1' };
    nextStore = () => inlineStore('memory');
    uploads.length = 0;
    renders = 0;
    onLine = true;
    urlCounter = 0;
    mockShowToast.mockReset();
    mockUploadPhoto.mockClear();
    mockDeletePhoto.mockReset();
    mockUpdatePhoto.mockReset();
    mockUpdatePhoto.mockImplementation((id) => Promise.resolve(photo(`${id}-patched`)));
    mockDeletePhoto.mockResolvedValue(undefined);
    mockGetDiaryEntry.mockReset();
    mockGetDiaryEntry.mockResolvedValue({});
    createObjectURL.mockReset();
    createObjectURL.mockImplementation(() => `blob:${++urlCounter}`);
    revokeObjectURL.mockReset();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => onLine });
    if (!Provider) {
      ({ CaptureUploadProvider: Provider } = await import('./CaptureUploadProvider.js'));
      ({ useCaptureUploads } = await import('./captureUploadsContext.js'));
    }
  });

  afterEach(() => {
    delete (navigator as unknown as { onLine?: boolean }).onLine;
  });

  it('runs in memory mode when the store falls back and uploads still work', async () => {
    setup();
    await waitFor(() => expect(api.storage).toBe('memory'));

    const ids = await act(() =>
      api.add([file()], { draftId: 'd1', source: 'library', tags: NO_TAGS }),
    );

    expect(ids).toHaveLength(1);
    expect(api.items[0]).toMatchObject({ persisted: false, state: 'uploading', draftId: 'd1' });
    expect(uploads).toHaveLength(1);
    expect(uploads[0]!.entityId).toBe('d1');
  });

  it('is an inert API while there is no signed-in user', async () => {
    mockUser = null;
    setup();

    expect(api.storage).toBe('pending');
    expect(api.items).toEqual([]);
    expect(api.orphans).toEqual([]);
    expect(await api.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS })).toEqual([]);
    expect(api.reassign('a', 'b')).toEqual([]);
    expect(() => {
      api.assignDraft(['x'], 'd');
      api.updateTags('x', { caption: 'c' });
      api.remove('x');
      api.retry('d');
      api.adoptOrphans('d');
    }).not.toThrow();
    await api.discardDraft('d');
    await api.discardOrphans();
    const unsubscribe = api.subscribe(() => undefined);
    expect(() => unsubscribe()).not.toThrow();
    expect(await api.whenSettled(['x'])).toEqual({ uploaded: [], failedIds: ['x'] });
    expect(uploads).toHaveLength(0);
  });

  it('uploads with the chips, notifies subscribers, revokes the preview and empties the items', async () => {
    setup();
    await waitFor(() => expect(api.storage).toBe('memory'));
    const seen: unknown[] = [];
    api.subscribe((event) => seen.push(event));

    const [id] = await act(() =>
      api.add([file()], {
        draftId: 'd1',
        source: 'camera',
        tags: { ...NO_TAGS, areaId: 'kitchen', orientationId: 'north', caption: 'sink' },
      }),
    );
    expect(uploads[0]).toMatchObject({
      areaId: 'kitchen',
      orientationId: 'north',
      caption: 'sink',
    });
    act(() => uploads[0]!.onProgress(55));
    expect(api.items[0]?.progress).toBe(55);

    await act(async () => uploads[0]!.resolve(photo('p1')));
    await settle();

    expect(api.items).toEqual([]);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:1');
    expect(seen).toEqual([{ itemId: id, draftId: 'd1', photo: photo('p1') }]);
  });

  it('keeps items without a draft waiting and uploads them after assignDraft', async () => {
    setup();
    await waitFor(() => expect(api.storage).toBe('memory'));

    const ids = await act(() =>
      api.add([file()], { draftId: null, source: 'camera', tags: NO_TAGS }),
    );
    expect(uploads).toHaveLength(0);
    expect(api.items[0]?.state).toBe('waiting');

    act(() => api.assignDraft(ids, 'd9'));

    expect(uploads[0]?.entityId).toBe('d9');
    expect(api.items[0]?.draftId).toBe('d9');
  });

  it('reassign moves items to the other draft and returns their ids', async () => {
    setup();
    await waitFor(() => expect(api.storage).toBe('memory'));
    const ids = await act(() =>
      api.add([file()], { draftId: 'old', source: 'camera', tags: NO_TAGS }),
    );
    act(() => uploads[0]!.reject(apiError(413)));
    await settle();

    let moved: readonly string[] = [];
    act(() => {
      moved = api.reassign('old', 'new');
    });

    expect(moved).toEqual(ids);
    expect(uploads[1]?.entityId).toBe('new');
  });

  it('marks an item blocked on 403', async () => {
    setup();
    await waitFor(() => expect(api.storage).toBe('memory'));
    await act(() => api.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS }));

    act(() => uploads[0]!.reject(apiError(403)));
    await settle();

    expect(api.items[0]?.state).toBe('blocked');
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('a 404 purges the draft and shows exactly one toast', async () => {
    setup();
    await waitFor(() => expect(api.storage).toBe('memory'));
    await act(() =>
      api.add([file(), file('b.jpg')], { draftId: 'gone', source: 'camera', tags: NO_TAGS }),
    );

    act(() => uploads[0]!.reject(apiError(404)));
    await settle();

    expect(api.items).toEqual([]);
    expect(mockShowToast).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith('info', purgedMessage());
  });

  it('remove aborts a running upload and deletes the photo if the server stored it anyway', async () => {
    setup();
    await waitFor(() => expect(api.storage).toBe('memory'));
    const [id] = await act(() =>
      api.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS }),
    );

    act(() => api.remove(id!));
    expect(uploads[0]!.signal.aborted).toBe(true);
    expect(api.items).toEqual([]);

    await act(async () => uploads[0]!.resolve(photo('stored')));
    await settle();

    expect(mockDeletePhoto).toHaveBeenCalledWith('stored');
  });

  it('retries network failures after 2 s and discards a draft with its files', async () => {
    jest.useFakeTimers();
    try {
      setup();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(5);
      });
      await act(() => api.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS }));
      act(() => uploads[0]!.reject(new NetworkError('offline', null)));
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1999);
      });
      expect(uploads).toHaveLength(1);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1);
      });
      expect(uploads).toHaveLength(2);

      await act(() => api.discardDraft('d1'));

      expect(api.items).toEqual([]);
      expect(uploads[1]!.signal.aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('retry(draftId) restarts failed items', async () => {
    setup();
    await waitFor(() => expect(api.storage).toBe('memory'));
    await act(() => api.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS }));
    act(() => uploads[0]!.reject(apiError(413)));
    await settle();
    expect(api.items[0]?.state).toBe('failed');

    act(() => api.retry('d1'));

    expect(uploads).toHaveLength(2);
  });

  it('updateTags changes the item', async () => {
    setup();
    await waitFor(() => expect(api.storage).toBe('memory'));
    const [id] = await act(() =>
      api.add([file()], { draftId: null, source: 'camera', tags: NO_TAGS }),
    );

    act(() => api.updateTags(id!, { caption: 'hello' }));

    expect(api.items[0]?.caption).toBe('hello');
  });

  it('whenSettled resolves with the uploaded photos', async () => {
    setup();
    await waitFor(() => expect(api.storage).toBe('memory'));
    const ids = await act(() =>
      api.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS }),
    );
    const settled = api.whenSettled(ids);

    await act(async () => uploads[0]!.resolve(photo('p1')));

    await expect(settled).resolves.toEqual({ uploaded: [photo('p1')], failedIds: [] });
  });

  it('adoptOrphans and discardOrphans are available (no orphans in a fresh session)', async () => {
    setup();
    await waitFor(() => expect(api.storage).toBe('memory'));

    act(() => api.adoptOrphans('d1'));
    await act(() => api.discardOrphans());

    expect(api.orphans).toEqual([]);
  });

  it('the online event resumes held uploads', async () => {
    onLine = false;
    setup();
    await waitFor(() => expect(api.storage).toBe('memory'));
    await act(() => api.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS }));
    expect(uploads).toHaveLength(0);

    onLine = true;
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(uploads).toHaveLength(1);
  });

  it('keeps the items array identity while nothing changes', async () => {
    const view = setup();
    await waitFor(() => expect(api.storage).toBe('memory'));
    const before = api.items;
    const count = renders;

    view.rerender(
      <Provider>
        <Probe />
      </Provider>,
    );

    expect(renders).toBeGreaterThan(count);
    expect(api.items).toBe(before);
  });

  it('resets when the user changes and ignores the old engine afterwards', async () => {
    const view = setup();
    await waitFor(() => expect(api.storage).toBe('memory'));
    await act(() => api.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS }));
    expect(api.items).toHaveLength(1);

    mockUser = { id: 'user-2' };
    view.rerender(
      <Provider>
        <Probe />
      </Provider>,
    );
    await waitFor(() => expect(api.storage).toBe('memory'));

    expect(api.items).toEqual([]);
    expect(uploads[0]!.signal.aborted).toBe(true);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:1');
  });

  it('returns to the inert API on sign-out and stops listening to online events', async () => {
    const view = setup();
    await waitFor(() => expect(api.storage).toBe('memory'));
    mockUser = null;

    view.rerender(
      <Provider>
        <Probe />
      </Provider>,
    );

    expect(api.storage).toBe('pending');
    expect(api.items).toEqual([]);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(uploads).toHaveLength(0);
  });

  it('removes its online listener and aborts uploads on unmount', async () => {
    const view = setup();
    await waitFor(() => expect(api.storage).toBe('memory'));
    await act(() => api.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS }));

    view.unmount();

    expect(uploads[0]!.signal.aborted).toBe(true);
  });

  it('re-applies a chip changed mid-upload through photoApi.updatePhoto', async () => {
    setup();
    await waitFor(() => expect(api.storage).toBe('memory'));
    const seen: unknown[] = [];
    api.subscribe((event) => seen.push(event));
    const [id] = await act(() =>
      api.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS }),
    );
    act(() => api.updateTags(id!, { areaId: 'garden' }));

    await act(async () => uploads[0]!.resolve(photo('p1')));
    await settle();

    expect(mockUpdatePhoto).toHaveBeenCalledWith('p1', { areaId: 'garden' });
    expect(seen).toEqual([{ itemId: id, draftId: 'd1', photo: photo('p1-patched') }]);
  });

  it('resumes persisted items on mount: a draft that exists uploads, a gone draft is purged', async () => {
    const base = {
      ...NO_TAGS,
      userId: 'user-1',
      sessionId: 'previous-session',
      source: 'camera' as const,
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      name: 'capture.jpg',
      type: 'image/jpeg',
      size: 1,
      state: 'waiting' as const,
      attempts: 0,
    };
    const seed: CaptureRecord[] = [
      { ...base, id: 'live', draftId: 'd-live', createdAt: '2026-01-01T00:00:00Z' },
      { ...base, id: 'dead', draftId: 'd-dead', createdAt: '2026-01-02T00:00:00Z' },
      { ...base, id: 'orphan', draftId: null, createdAt: '2026-01-03T00:00:00Z' },
    ];
    nextStore = () => inlineStore('indexeddb', seed);
    mockGetDiaryEntry.mockImplementation((id) =>
      id === 'd-dead' ? Promise.reject(apiError(404)) : Promise.resolve({}),
    );

    setup();
    await waitFor(() => expect(api.storage).toBe('persistent'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledTimes(1));
    await settle();

    expect(api.items.map((item) => item.id)).toEqual(['live', 'orphan']);
    expect(api.items[0]).toMatchObject({ persisted: true, state: 'uploading' });
    expect(api.orphans.map((item) => item.id)).toEqual(['orphan']);
    expect(uploads.map((upload) => upload.entityId)).toEqual(['d-live']);
    expect(mockShowToast).toHaveBeenCalledWith('info', purgedMessage());
  });
});
