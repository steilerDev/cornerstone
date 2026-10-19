/**
 * @jest-environment node
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { IDBFactory } from 'fake-indexeddb';
import type { Photo } from '@cornerstone/shared';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';
import { createCaptureEngine } from './captureEngine.js';
import type { CaptureEngine, CaptureEngineDeps, CaptureSnapshot } from './captureEngine.js';
import { createMemoryStore, openCaptureStore } from './captureStore.js';
import type { CaptureStore } from './captureStore.js';
import type { CaptureRecord, CaptureTags } from './captureTypes.js';

const NO_TAGS: CaptureTags = {
  areaId: null,
  orientationId: null,
  areaSource: null,
  orientationSource: null,
  caption: null,
};

interface Upload {
  entityType: string;
  entityId: string;
  file: File;
  caption: string | null;
  onProgress: (percent: number) => void;
  areaId: string | null;
  orientationId: string | null;
  signal: AbortSignal;
  resolve: (photo: Photo) => void;
  reject: (error: unknown) => void;
}

const photo = (id: string): Photo =>
  ({ id, fileUrl: `/api/photos/${id}/file` }) as unknown as Photo;
const flush = async () => {
  for (let i = 0; i < 30; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 1));
};
const apiError = (status: number) =>
  new ApiClientError(status, { code: 'INTERNAL_ERROR', message: 'x' });

function record(overrides: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    ...NO_TAGS,
    id: 'rec-1',
    userId: 'user-1',
    sessionId: 'old-session',
    draftId: null,
    source: 'camera',
    blob: new Blob(['abc'], { type: 'image/jpeg' }),
    name: 'capture-1.jpg',
    type: 'image/jpeg',
    size: 3,
    state: 'waiting',
    attempts: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('createCaptureEngine', () => {
  let uploads: Upload[];
  let timers: { fn: () => void; ms: number; cancelled: boolean }[];
  let online: boolean;
  let store: CaptureStore;
  let events: string[];
  let snapshots: CaptureSnapshot[];
  let counter: number;
  let engine: CaptureEngine;

  const uploadPhoto = jest.fn<CaptureEngineDeps['uploadPhoto']>();
  const deletePhoto = jest.fn<CaptureEngineDeps['deletePhoto']>();
  const getDiaryEntry = jest.fn<CaptureEngineDeps['getDiaryEntry']>();
  const createObjectURL = jest.fn<CaptureEngineDeps['createObjectURL']>();
  const revokeObjectURL = jest.fn<CaptureEngineDeps['revokeObjectURL']>();
  const onPurged = jest.fn<() => void>();

  function make(overrides: Partial<CaptureEngineDeps> = {}): CaptureEngine {
    engine = createCaptureEngine({
      userId: 'user-1',
      sessionId: 'session-now',
      openStore: () => Promise.resolve(store),
      uploadPhoto,
      deletePhoto,
      getDiaryEntry,
      isOnline: () => online,
      schedule: (fn, ms) => {
        const timer = { fn, ms, cancelled: false };
        timers.push(timer);
        return () => {
          timer.cancelled = true;
        };
      },
      createObjectURL,
      revokeObjectURL,
      newId: () => `id-${++counter}`,
      now: () => '2026-02-02T00:00:00.000Z',
      onChange: (snapshot) => snapshots.push(snapshot),
      onPurged,
      ...overrides,
    });
    return engine;
  }

  const file = (name = 'a.jpg') => new File(['pixels'], name, { type: 'image/jpeg' });
  const last = () => snapshots[snapshots.length - 1]!;
  const itemStates = () => engine.getSnapshot().items.map((item) => item.state);

  beforeEach(() => {
    uploads = [];
    timers = [];
    online = true;
    events = [];
    snapshots = [];
    counter = 0;
    store = createMemoryStore();
    uploadPhoto.mockReset();
    uploadPhoto.mockImplementation(
      (entityType, entityId, f, caption, onProgress, areaId, orientationId, signal) =>
        new Promise<Photo>((resolve, reject) => {
          events.push('upload');
          uploads.push({
            entityType,
            entityId,
            file: f,
            caption,
            onProgress,
            areaId,
            orientationId,
            signal,
            resolve,
            reject,
          });
        }),
    );
    deletePhoto.mockReset();
    deletePhoto.mockResolvedValue(undefined);
    getDiaryEntry.mockReset();
    getDiaryEntry.mockResolvedValue({});
    createObjectURL.mockReset();
    createObjectURL.mockImplementation(() => `blob:${++counter}`);
    revokeObjectURL.mockReset();
    onPurged.mockReset();
  });

  describe('start', () => {
    it('reports memory storage when the store is memory-backed, persistent for IndexedDB', async () => {
      await make().start();
      expect(last().storage).toBe('memory');

      store = await openCaptureStore(new IDBFactory());
      await make().start();
      expect(last().storage).toBe('persistent');
    });

    it('starts with a pending, empty snapshot', () => {
      make();
      expect(engine.getSnapshot()).toEqual({ storage: 'pending', items: [], orphans: [] });
    });

    it('survives a store whose list rejects', async () => {
      store = { ...createMemoryStore(), list: () => Promise.reject(new Error('boom')) };
      await make().start();
      expect(last().items).toEqual([]);
    });

    it('does nothing when disposed while the store was opening', async () => {
      let open!: (value: CaptureStore) => void;
      make({ openStore: () => new Promise<CaptureStore>((resolve) => (open = resolve)) });
      const started = engine.start();
      engine.dispose();
      open(store);
      await started;

      expect(snapshots).toHaveLength(0);
    });

    it('does nothing when disposed while the records were loading', async () => {
      let release!: (records: CaptureRecord[]) => void;
      store = {
        ...createMemoryStore(),
        list: () => new Promise<CaptureRecord[]>((resolve) => (release = resolve)),
      };
      make();
      const started = engine.start();
      await flush();
      engine.dispose();
      release([record()]);
      await started;

      expect(createObjectURL).not.toHaveBeenCalled();
    });
  });

  describe('resume after a reload', () => {
    let factory: IDBFactory;

    beforeEach(async () => {
      factory = new IDBFactory();
      store = await openCaptureStore(factory);
    });

    it('re-creates previews and uploads persisted items whose draft still exists', async () => {
      await store.put(record({ id: 'r1', draftId: 'draft-1', caption: 'kept', areaId: 'kitchen' }));
      await store.put(record({ id: 'r2', userId: 'user-2', draftId: 'draft-1' }));

      make({ openStore: () => openCaptureStore(factory) });
      await engine.start();

      expect(getDiaryEntry).toHaveBeenCalledWith('draft-1');
      expect(last().items.map((item) => item.id)).toEqual(['r1']);
      expect(last().items[0]).toMatchObject({ persisted: true, caption: 'kept' });
      expect(uploads).toHaveLength(1);
      expect(uploads[0]).toMatchObject({
        entityType: 'diary_entry',
        entityId: 'draft-1',
        caption: 'kept',
        areaId: 'kitchen',
      });
      expect(uploads[0]!.file.name).toBe('capture-1.jpg');
    });

    it('verifies each draft once for several items', async () => {
      await store.put(record({ id: 'r1', draftId: 'draft-1' }));
      await store.put(record({ id: 'r2', draftId: 'draft-1', createdAt: '2026-01-02T00:00:00Z' }));

      make({ openStore: () => openCaptureStore(factory) });
      await engine.start();

      expect(getDiaryEntry).toHaveBeenCalledTimes(1);
      expect(uploads).toHaveLength(2);
    });

    it('purges the items of a draft that no longer exists (404) with one notice', async () => {
      await store.put(record({ id: 'r1', draftId: 'gone' }));
      await store.put(record({ id: 'r2', draftId: 'gone', createdAt: '2026-01-02T00:00:00Z' }));
      await store.put(record({ id: 'r3', draftId: 'live' }));
      getDiaryEntry.mockImplementation((id) =>
        id === 'gone' ? Promise.reject(apiError(404)) : Promise.resolve({}),
      );

      make({ openStore: () => openCaptureStore(factory) });
      await engine.start();

      expect(last().items.map((item) => item.id)).toEqual(['r3']);
      expect(onPurged).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledTimes(2);
      const remaining = await store.list('user-1');
      expect(remaining.map((r) => r.id)).toEqual(['r3']);
    });

    it('keeps the records when the draft check fails otherwise and retries on the online event', async () => {
      await store.put(record({ id: 'r1', draftId: 'draft-1' }));
      getDiaryEntry.mockRejectedValueOnce(new NetworkError('offline', null));

      make({ openStore: () => openCaptureStore(factory) });
      await engine.start();
      expect(uploads).toHaveLength(0);
      expect(last().items).toHaveLength(1);
      expect(onPurged).not.toHaveBeenCalled();

      engine.handleOnline();
      await flush();

      expect(getDiaryEntry).toHaveBeenCalledTimes(2);
      expect(uploads).toHaveLength(1);
    });

    it('purges on the online event when the unverified draft turned out to be gone', async () => {
      await store.put(record({ id: 'r1', draftId: 'draft-1' }));
      getDiaryEntry.mockRejectedValueOnce(apiError(500));
      make({ openStore: () => openCaptureStore(factory) });
      await engine.start();

      getDiaryEntry.mockRejectedValueOnce(apiError(404));
      engine.handleOnline();
      await flush();

      expect(last().items).toEqual([]);
      expect(onPurged).toHaveBeenCalledTimes(1);
    });

    it('lists null-draft records of another session as orphans, never uploading them', async () => {
      await store.put(record({ id: 'orphan', draftId: null, sessionId: 'old-session' }));

      make({ openStore: () => openCaptureStore(factory) });
      await engine.start();

      expect(last().orphans.map((item) => item.id)).toEqual(['orphan']);
      expect(getDiaryEntry).not.toHaveBeenCalled();
      expect(uploads).toHaveLength(0);
    });

    it('resets failed and blocked state of resumed records to be retried (blocked stays blocked)', async () => {
      await store.put(record({ id: 'f', draftId: 'd', state: 'failed' }));
      await store.put(
        record({ id: 'b', draftId: 'd', state: 'blocked', createdAt: '2026-01-03T00:00:00Z' }),
      );

      make({ openStore: () => openCaptureStore(factory) });
      await engine.start();

      expect(uploads).toHaveLength(1);
      expect(last().items.find((item) => item.id === 'b')?.state).toBe('blocked');
    });

    it('persists across a second reload: items added, then reopened, are found again', async () => {
      make({ openStore: () => openCaptureStore(factory) });
      await engine.start();
      const [id] = await engine.add([file()], { draftId: null, source: 'library', tags: NO_TAGS });
      engine.dispose();

      const second = createCaptureEngine({
        userId: 'user-1',
        sessionId: 'session-later',
        openStore: () => openCaptureStore(factory),
        uploadPhoto,
        deletePhoto,
        getDiaryEntry,
        isOnline: () => true,
        createObjectURL,
        revokeObjectURL,
        newId: () => 'x',
        onChange: (snapshot) => snapshots.push(snapshot),
        onPurged,
      });
      await second.start();

      expect(second.getSnapshot().orphans.map((item) => item.id)).toEqual([id]);
      second.dispose();
    });
  });

  describe('add', () => {
    it('writes the record before any upload starts', async () => {
      const put = jest.fn<CaptureStore['put']>(async (r) => {
        events.push('put');
        await createMemoryStore().put(r);
      });
      store = { ...createMemoryStore(), put };
      await make().start();

      await engine.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS });

      expect(events).toEqual(['put', 'upload']);
    });

    it('waits for the store to be ready', async () => {
      make();
      const started = engine.start();
      const ids = await engine.add([file(), file('b.jpg')], {
        draftId: null,
        source: 'library',
        tags: { ...NO_TAGS, areaId: 'a1', areaSource: 'live' },
      });
      await started;

      expect(ids).toEqual(['id-1', 'id-3']);
      expect(last().items).toHaveLength(2);
      expect(last().items[0]).toMatchObject({
        draftId: null,
        source: 'library',
        areaId: 'a1',
        areaSource: 'live',
        state: 'waiting',
        previewUrl: 'blob:2',
        createdAt: '2026-02-02T00:00:00.000Z',
      });
    });

    it('keeps items without a draft waiting, with no upload', async () => {
      await make().start();
      await engine.add([file()], { draftId: null, source: 'camera', tags: NO_TAGS });

      expect(uploads).toHaveLength(0);
      expect(itemStates()).toEqual(['waiting']);
    });

    it('marks items persisted: false when the store is memory-only', async () => {
      await make().start();
      await engine.add([file()], { draftId: null, source: 'camera', tags: NO_TAGS });

      expect(last().items[0]?.persisted).toBe(false);
    });

    it('marks items persisted: true with IndexedDB', async () => {
      store = await openCaptureStore(new IDBFactory());
      await make().start();
      await engine.add([file()], { draftId: null, source: 'camera', tags: NO_TAGS });

      expect(last().items[0]?.persisted).toBe(true);
    });

    it('keeps the photo in memory with persisted: false when the write is rejected (quota)', async () => {
      const idb = await openCaptureStore(new IDBFactory());
      store = {
        kind: 'indexeddb',
        put: () => Promise.reject(new DOMException('full', 'QuotaExceededError')),
        remove: idb.remove,
        list: idb.list,
      };
      await make().start();

      const ids = await engine.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS });

      expect(ids).toHaveLength(1);
      expect(last().items[0]?.persisted).toBe(false);
      expect(uploads).toHaveLength(1);
    });

    it('does not write best-effort updates for memory-only items', async () => {
      const put = jest.fn<CaptureStore['put']>().mockRejectedValue(new Error('full'));
      store = {
        kind: 'indexeddb',
        put,
        remove: jest.fn(async () => undefined),
        list: async () => [],
      };
      await make().start();
      const [id] = await engine.add([file()], { draftId: null, source: 'camera', tags: NO_TAGS });
      put.mockClear();

      engine.updateTags(id!, { caption: 'hello' });

      expect(put).not.toHaveBeenCalled();
      expect(last().items[0]?.caption).toBe('hello');
    });

    it('returns nothing when disposed', async () => {
      await make().start();
      engine.dispose();

      expect(
        await engine.add([file()], { draftId: null, source: 'camera', tags: NO_TAGS }),
      ).toEqual([]);
    });

    it('stops adding when disposed while a record is being written', async () => {
      let finish!: () => void;
      store = {
        ...createMemoryStore(),
        put: () => new Promise<void>((resolve) => (finish = resolve)),
      };
      await make().start();

      const adding = engine.add([file(), file('b.jpg')], {
        draftId: null,
        source: 'camera',
        tags: NO_TAGS,
      });
      await flush();
      engine.dispose();
      finish();

      expect(await adding).toEqual([]);
    });

    it('adds before the store has been started (no store): item is memory-only', async () => {
      make({ openStore: () => Promise.resolve(store) });
      const ids = await engine.add([file()], { draftId: null, source: 'drop', tags: NO_TAGS });

      expect(ids).toHaveLength(1);
      expect(last().items[0]?.persisted).toBe(false);
    });
  });

  describe('uploading', () => {
    it('uploads with the current tags, reports progress and deletes the record on success', async () => {
      store = await openCaptureStore(new IDBFactory());
      await make().start();
      const events2: unknown[] = [];
      engine.subscribe((event) => events2.push(event));
      const [id] = await engine.add([file()], {
        draftId: 'd1',
        source: 'camera',
        tags: { ...NO_TAGS, caption: 'first' },
      });

      expect(itemStates()).toEqual(['uploading']);
      engine.updateTags(id!, { areaId: 'garden', caption: 'second' });
      uploads[0]!.onProgress(40);
      expect(last().items[0]?.progress).toBe(40);

      uploads[0]!.resolve(photo('p1'));
      await flush();

      expect(uploads[0]).toMatchObject({ entityId: 'd1' });
      expect(last().items).toEqual([]);
      expect(await store.list('user-1')).toEqual([]);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:2');
      expect(events2).toEqual([{ itemId: id, draftId: 'd1', photo: photo('p1') }]);
    });

    it('uses the tags set after the item was queued but before the upload started', async () => {
      await make().start();
      const [id] = await engine.add([file()], { draftId: null, source: 'camera', tags: NO_TAGS });
      engine.updateTags(id!, { areaId: 'garden', orientationId: 'north', caption: 'late' });

      engine.assignDraft([id!], 'd1');

      expect(uploads[0]).toMatchObject({
        areaId: 'garden',
        orientationId: 'north',
        caption: 'late',
      });
    });

    it('a failing listener does not stop the others', async () => {
      await make().start();
      const seen: string[] = [];
      engine.subscribe(() => {
        throw new Error('bad listener');
      });
      engine.subscribe((event) => seen.push(event.itemId));
      await engine.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS });

      uploads[0]!.resolve(photo('p1'));
      await flush();

      expect(seen).toEqual(['id-1']);
    });

    it('stops notifying an unsubscribed listener', async () => {
      await make().start();
      const seen: string[] = [];
      const unsubscribe = engine.subscribe((event) => seen.push(event.itemId));
      unsubscribe();
      await engine.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS });

      uploads[0]!.resolve(photo('p1'));
      await flush();

      expect(seen).toEqual([]);
    });

    it('uploads at most 3 at a time', async () => {
      await make().start();
      await engine.add([file(), file(), file(), file()], {
        draftId: 'd1',
        source: 'library',
        tags: NO_TAGS,
      });

      expect(uploads).toHaveLength(3);
      uploads[0]!.resolve(photo('p1'));
      await flush();
      expect(uploads).toHaveLength(4);
    });

    it('holds uploads while offline and starts them on the online event', async () => {
      online = false;
      await make().start();
      await engine.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS });
      expect(uploads).toHaveLength(0);

      online = true;
      engine.handleOnline();

      expect(uploads).toHaveLength(1);
    });

    it('ignores progress that arrives after removal', async () => {
      await make().start();
      const [id] = await engine.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS });
      const count = snapshots.length;
      engine.remove(id!);
      const afterRemove = snapshots.length;

      uploads[0]!.onProgress(80);

      expect(afterRemove).toBeGreaterThan(count);
      expect(snapshots).toHaveLength(afterRemove);
    });
  });

  describe('failures', () => {
    it('retries network errors after 2 s, 5 s and 15 s, then marks the item failed', async () => {
      store = await openCaptureStore(new IDBFactory());
      await make().start();
      await engine.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS });

      uploads[0]!.reject(new NetworkError('offline', null));
      await flush();
      expect(itemStates()).toEqual(['waiting']);
      expect(timers.map((timer) => timer.ms)).toEqual([2000]);

      timers[0]!.fn();
      uploads[1]!.reject(apiError(503));
      await flush();
      timers[1]!.fn();
      uploads[2]!.reject(apiError(408));
      await flush();
      expect(timers.map((timer) => timer.ms)).toEqual([2000, 5000, 15000]);
      timers[2]!.fn();
      uploads[3]!.reject(new NetworkError('offline', null));
      await flush();

      expect(itemStates()).toEqual(['failed']);
      expect((await store.list('user-1'))[0]).toMatchObject({ state: 'failed', attempts: 3 });
    });

    it('does not retry other client errors (413) and marks the item failed at once', async () => {
      await make().start();
      await engine.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS });

      uploads[0]!.reject(apiError(413));
      await flush();

      expect(itemStates()).toEqual(['failed']);
      expect(timers).toHaveLength(0);
    });

    it('does not retry an unknown error type', async () => {
      await make().start();
      await engine.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS });

      uploads[0]!.reject(new Error('weird'));
      await flush();

      expect(itemStates()).toEqual(['failed']);
    });

    it('marks an item blocked on 403 and keeps its record', async () => {
      store = await openCaptureStore(new IDBFactory());
      await make().start();
      await engine.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS });

      uploads[0]!.reject(apiError(403));
      await flush();

      expect(itemStates()).toEqual(['blocked']);
      expect((await store.list('user-1'))[0]?.state).toBe('blocked');
      expect(onPurged).not.toHaveBeenCalled();
    });

    it('purges every item of the draft on 404 and shows one notice', async () => {
      store = await openCaptureStore(new IDBFactory());
      await make().start();
      await engine.add([file(), file('b.jpg')], {
        draftId: 'd1',
        source: 'camera',
        tags: NO_TAGS,
      });
      await engine.add([file('c.jpg')], { draftId: 'd2', source: 'camera', tags: NO_TAGS });

      uploads[0]!.reject(apiError(404));
      await flush();

      expect(last().items.map((item) => item.draftId)).toEqual(['d2']);
      expect(onPurged).toHaveBeenCalledTimes(1);
      expect((await store.list('user-1')).map((r) => r.draftId)).toEqual(['d2']);
      expect(uploads[1]!.signal.aborted).toBe(true);
    });

    it('retry(draftId) restarts failed items with a fresh backoff but leaves blocked ones', async () => {
      await make().start();
      const [failed, blocked] = await engine.add([file(), file('b.jpg')], {
        draftId: 'd1',
        source: 'camera',
        tags: NO_TAGS,
      });
      uploads[0]!.reject(apiError(413));
      uploads[1]!.reject(apiError(403));
      await flush();
      expect(itemStates()).toEqual(['failed', 'blocked']);

      engine.retry('d1');

      expect(uploads).toHaveLength(3);
      expect(itemStates()).toEqual(['uploading', 'blocked']);
      expect(last().items.map((item) => item.id)).toEqual([failed, blocked]);
    });

    it('retry(draftId) skips uploading items and other drafts, and is silent when nothing changes', async () => {
      await make().start();
      await engine.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS });
      const count = snapshots.length;

      engine.retry('d1');
      engine.retry('other');

      expect(snapshots).toHaveLength(count);
      expect(uploads).toHaveLength(1);
    });

    it('a failure of an already removed item is ignored', async () => {
      await make().start();
      const [id] = await engine.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS });
      engine.remove(id!);

      uploads[0]!.reject(apiError(413));
      await flush();

      expect(last().items).toEqual([]);
    });
  });

  describe('remove', () => {
    it('aborts a running upload, deletes the record and revokes the preview', async () => {
      store = await openCaptureStore(new IDBFactory());
      await make().start();
      const [id] = await engine.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS });

      engine.remove(id!);
      await flush();

      expect(uploads[0]!.signal.aborted).toBe(true);
      expect(last().items).toEqual([]);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:2');
      expect(await store.list('user-1')).toEqual([]);
    });

    it('deletes the stored photo when the upload resolves after removal, without notifying', async () => {
      await make().start();
      const seen: unknown[] = [];
      engine.subscribe((event) => seen.push(event));
      const [id] = await engine.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS });
      engine.remove(id!);

      uploads[0]!.resolve(photo('stored-1'));
      await flush();

      expect(deletePhoto).toHaveBeenCalledWith('stored-1');
      expect(seen).toEqual([]);
    });

    it('ignores a failing cleanup delete', async () => {
      deletePhoto.mockRejectedValue(new Error('gone'));
      await make().start();
      const [id] = await engine.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS });
      engine.remove(id!);

      uploads[0]!.resolve(photo('stored-1'));
      await flush();

      expect(deletePhoto).toHaveBeenCalledTimes(1);
    });

    it('deletes the stored photo when the engine is disposed mid-upload', async () => {
      await make().start();
      await engine.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS });
      engine.dispose();

      uploads[0]!.resolve(photo('stored-2'));
      await flush();

      expect(deletePhoto).toHaveBeenCalledWith('stored-2');
    });

    it('is a no-op for an unknown id', async () => {
      await make().start();
      const count = snapshots.length;
      engine.remove('nope');
      expect(snapshots).toHaveLength(count);
    });

    it('tolerates a store whose remove rejects', async () => {
      store = { ...createMemoryStore(), remove: () => Promise.reject(new Error('x')) };
      await make().start();
      const [id] = await engine.add([file()], { draftId: null, source: 'camera', tags: NO_TAGS });

      engine.remove(id!);
      await flush();

      expect(last().items).toEqual([]);
    });
  });

  describe('drafts', () => {
    it('assignDraft gives draft-less items their draft once and starts the upload', async () => {
      await make().start();
      const ids = await engine.add([file(), file('b.jpg')], {
        draftId: null,
        source: 'camera',
        tags: NO_TAGS,
      });

      engine.assignDraft([ids[0]!, 'unknown'], 'd1');
      engine.assignDraft([ids[0]!], 'd2');

      expect(uploads).toHaveLength(1);
      expect(uploads[0]!.entityId).toBe('d1');
      expect(last().items.map((item) => item.draftId)).toEqual(['d1', null]);
    });

    it('assignDraft with nothing to assign publishes nothing', async () => {
      await make().start();
      const count = snapshots.length;
      engine.assignDraft(['x'], 'd1');
      expect(snapshots).toHaveLength(count);
    });

    it('reassign moves every item of one draft to another and returns the ids', async () => {
      store = await openCaptureStore(new IDBFactory());
      await make().start();
      const ids = await engine.add([file(), file('b.jpg')], {
        draftId: 'old',
        source: 'camera',
        tags: NO_TAGS,
      });
      uploads[0]!.reject(apiError(413));
      uploads[1]!.reject(apiError(403));
      await flush();

      const moved = engine.reassign('old', 'new');

      expect(moved).toEqual(ids);
      expect(uploads.slice(2).map((upload) => upload.entityId)).toEqual(['new', 'new']);
      expect((await store.list('user-1')).map((r) => r.draftId)).toEqual(['new', 'new']);
    });

    it('reassign returns an empty list when the draft has no items', async () => {
      await make().start();
      const count = snapshots.length;
      expect(engine.reassign('none', 'new')).toEqual([]);
      expect(snapshots).toHaveLength(count);
    });

    it('discardDraft aborts and clears every item and stored file of that draft only', async () => {
      store = await openCaptureStore(new IDBFactory());
      await make().start();
      await engine.add([file(), file('b.jpg')], { draftId: 'd1', source: 'camera', tags: NO_TAGS });
      await engine.add([file('c.jpg')], { draftId: 'd2', source: 'camera', tags: NO_TAGS });

      await engine.discardDraft('d1');

      expect(last().items.map((item) => item.draftId)).toEqual(['d2']);
      expect((await store.list('user-1')).map((r) => r.draftId)).toEqual(['d2']);
      expect(uploads[0]!.signal.aborted).toBe(true);
      expect(uploads[2]!.signal.aborted).toBe(false);
      expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    });

    it("adoptOrphans gives crash survivors the draft; this session's draft-less items stay", async () => {
      store = await openCaptureStore(new IDBFactory());
      await store.put(record({ id: 'orphan', draftId: null, sessionId: 'old-session' }));
      await make().start();
      await engine.add([file()], { draftId: null, source: 'camera', tags: NO_TAGS });
      expect(last().orphans.map((item) => item.id)).toEqual(['orphan']);

      engine.adoptOrphans('d1');

      expect(last().orphans).toEqual([]);
      expect(uploads.map((upload) => upload.entityId)).toEqual(['d1']);
      expect(last().items.find((item) => item.id === 'id-2')?.draftId).toBeNull();
    });

    it('adoptOrphans without orphans publishes nothing', async () => {
      await make().start();
      const count = snapshots.length;
      engine.adoptOrphans('d1');
      expect(snapshots).toHaveLength(count);
    });

    it('discardOrphans removes only the orphans', async () => {
      store = await openCaptureStore(new IDBFactory());
      await store.put(record({ id: 'orphan', draftId: null, sessionId: 'old-session' }));
      await store.put(
        record({ id: 'mine', draftId: 'd1', createdAt: '2026-01-05T00:00:00Z', sessionId: 'old' }),
      );
      await make().start();

      await engine.discardOrphans();

      expect(last().items.map((item) => item.id)).toEqual(['mine']);
      expect((await store.list('user-1')).map((r) => r.id)).toEqual(['mine']);
    });
  });

  describe('updateTags', () => {
    it('updates the item and the stored record', async () => {
      store = await openCaptureStore(new IDBFactory());
      await make().start();
      const [id] = await engine.add([file()], { draftId: null, source: 'camera', tags: NO_TAGS });

      engine.updateTags(id!, { areaId: 'garden', areaSource: 'hand' });
      await flush();

      expect(last().items[0]).toMatchObject({ areaId: 'garden', areaSource: 'hand' });
      expect((await store.list('user-1'))[0]).toMatchObject({ areaId: 'garden' });
    });

    it('ignores an unknown id and tolerates a rejecting store', async () => {
      store = {
        ...createMemoryStore(),
        kind: 'indexeddb',
        put: () => Promise.reject(new Error('x')),
      };
      await make().start();
      engine.updateTags('nope', { caption: 'x' });
      await engine.add([file()], { draftId: null, source: 'camera', tags: NO_TAGS });

      engine.updateTags('id-1', { caption: 'y' });
      await flush();

      expect(last().items[0]?.caption).toBe('y');
    });
  });

  describe('whenSettled', () => {
    it('resolves with the uploaded photos once every id has uploaded', async () => {
      await make().start();
      const ids = await engine.add([file(), file('b.jpg')], {
        draftId: 'd1',
        source: 'camera',
        tags: NO_TAGS,
      });
      const settled = engine.whenSettled(ids);

      uploads[0]!.resolve(photo('p1'));
      await flush();
      uploads[1]!.resolve(photo('p2'));

      await expect(settled).resolves.toEqual({
        uploaded: [photo('p1'), photo('p2')],
        failedIds: [],
      });
    });

    it('reports failed and blocked ids once their retries are used up', async () => {
      await make().start();
      const ids = await engine.add([file(), file('b.jpg'), file('c.jpg')], {
        draftId: 'd1',
        source: 'camera',
        tags: NO_TAGS,
      });
      const settled = engine.whenSettled(ids);

      uploads[0]!.resolve(photo('p1'));
      uploads[1]!.reject(apiError(413));
      uploads[2]!.reject(apiError(403));

      await expect(settled).resolves.toEqual({
        uploaded: [photo('p1')],
        failedIds: [ids[1], ids[2]],
      });
    });

    it('does not resolve while an item is still retrying automatically', async () => {
      await make().start();
      const ids = await engine.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS });
      let done = false;
      void engine.whenSettled(ids).then(() => (done = true));

      uploads[0]!.reject(new NetworkError('offline', null));
      await flush();

      expect(done).toBe(false);
    });

    it('treats removed or unknown ids as failed', async () => {
      await make().start();

      await expect(engine.whenSettled(['ghost'])).resolves.toEqual({
        uploaded: [],
        failedIds: ['ghost'],
      });
    });

    it('resolves an empty list immediately', async () => {
      await make().start();
      await expect(engine.whenSettled([])).resolves.toEqual({ uploaded: [], failedIds: [] });
    });
  });

  describe('re-applying tags changed during the upload', () => {
    const updatePhoto = jest.fn<NonNullable<CaptureEngineDeps['updatePhoto']>>();

    beforeEach(() => {
      updatePhoto.mockReset();
      updatePhoto.mockImplementation((id) => Promise.resolve(photo(`${id}-patched`)));
    });

    async function startUpload(tags: Partial<CaptureTags> = {}) {
      await make({ updatePhoto }).start();
      const [id] = await engine.add([file()], {
        draftId: 'd1',
        source: 'camera',
        tags: { ...NO_TAGS, ...tags },
      });
      return id!;
    }

    it('patches the stored photo with a chip changed while uploading, then reports it uploaded', async () => {
      const seen: unknown[] = [];
      const id = await startUpload({ areaId: 'kitchen' });
      engine.subscribe((event) => seen.push(event));
      engine.updateTags(id, { areaId: 'garden' });

      uploads[0]!.resolve(photo('p1'));
      await flush();

      expect(updatePhoto).toHaveBeenCalledTimes(1);
      expect(updatePhoto).toHaveBeenCalledWith('p1', { areaId: 'garden' });
      expect(seen).toEqual([{ itemId: id, draftId: 'd1', photo: photo('p1-patched') }]);
      expect(last().items).toEqual([]);
    });

    it('does not patch when nothing changed', async () => {
      await startUpload({ areaId: 'kitchen', caption: 'sink' });

      uploads[0]!.resolve(photo('p1'));
      await flush();

      expect(updatePhoto).not.toHaveBeenCalled();
      expect(last().items).toEqual([]);
    });

    it('sends only the changed fields, as absolute values (including null)', async () => {
      const id = await startUpload({ areaId: 'kitchen', orientationId: 'north', caption: 'sink' });
      engine.updateTags(id, { orientationId: null, caption: 'tap' });

      uploads[0]!.resolve(photo('p1'));
      await flush();

      expect(updatePhoto).toHaveBeenCalledWith('p1', { orientationId: null, caption: 'tap' });
    });

    it('loops until stable: keeps patching while tags change during each patch', async () => {
      const id = await startUpload();
      let round = 0;
      updatePhoto.mockImplementation((photoId) => {
        round += 1;
        if (round < 5) engine.updateTags(id, { caption: `c${round + 1}` });
        return Promise.resolve(photo(`${photoId}-${round}`));
      });
      engine.updateTags(id, { caption: 'c1' });

      uploads[0]!.resolve(photo('p1'));
      await flush();

      expect(updatePhoto.mock.calls.map((call) => call[1])).toEqual([
        { caption: 'c1' },
        { caption: 'c2' },
        { caption: 'c3' },
        { caption: 'c4' },
        { caption: 'c5' },
      ]);
      expect(last().items).toEqual([]);
    });

    it('sends only the dimensions changed since the last confirmed write', async () => {
      const id = await startUpload();
      updatePhoto.mockImplementationOnce((photoId) => {
        engine.updateTags(id, { orientationId: 'north' });
        return Promise.resolve(photo(`${photoId}-1`));
      });
      engine.updateTags(id, { areaId: 'garden' });

      uploads[0]!.resolve(photo('p1'));
      await flush();

      expect(updatePhoto.mock.calls.map((call) => call[1])).toEqual([
        { areaId: 'garden' },
        { orientationId: 'north' },
      ]);
    });

    it('retries a failed patch once and uses the patched photo', async () => {
      const id = await startUpload();
      const seen: { photo: Photo }[] = [];
      engine.subscribe((event) => seen.push(event));
      updatePhoto.mockRejectedValueOnce(apiError(500));
      engine.updateTags(id, { areaId: 'garden' });

      uploads[0]!.resolve(photo('p1'));
      await flush();

      expect(updatePhoto).toHaveBeenCalledTimes(2);
      expect(updatePhoto.mock.calls[1]![1]).toEqual({ areaId: 'garden' });
      expect(seen[0]!.photo).toEqual(photo('p1-patched'));
    });

    it('gives up after the single retry fails but still counts the upload as successful', async () => {
      const id = await startUpload();
      const seen: { photo: Photo }[] = [];
      engine.subscribe((event) => seen.push(event));
      updatePhoto.mockRejectedValue(apiError(500));
      engine.updateTags(id, { areaId: 'garden' });

      uploads[0]!.resolve(photo('p1'));
      await flush();

      expect(updatePhoto).toHaveBeenCalledTimes(2);
      expect(seen).toHaveLength(1);
      expect(seen[0]!.photo).toEqual(photo('p1'));
      expect(deletePhoto).not.toHaveBeenCalled();
      expect(timers).toHaveLength(0);
    });

    it('never loses a chip tap that lands while the IndexedDB delete is still running', async () => {
      const idb = await openCaptureStore(new IDBFactory());
      let releaseDelete!: () => void;
      const deleteGate = new Promise<void>((resolve) => (releaseDelete = resolve));
      store = {
        kind: 'indexeddb',
        put: idb.put,
        list: idb.list,
        remove: async (recordId) => {
          await deleteGate;
          await idb.remove(recordId);
        },
      };
      const id = await startUpload({ areaId: 'kitchen' });
      const seen: { photo: Photo }[] = [];
      engine.subscribe((event) => seen.push(event));

      uploads[0]!.resolve(photo('p1'));
      await flush();

      // The delete has not finished, yet the photo is already reported and the item is gone.
      expect(seen).toHaveLength(1);
      expect(last().items).toEqual([]);

      // A tap now reaches an item that left the engine: it must not throw or resurrect it.
      expect(() => engine.updateTags(id, { areaId: 'garden' })).not.toThrow();
      expect(last().items).toEqual([]);
      releaseDelete();
      await flush();
      expect(await idb.list('user-1')).toEqual([]);
    });

    it('patches a chip tap that lands between the upload response and the compare', async () => {
      const id = await startUpload({ areaId: 'kitchen' });
      const seen: { photo: Photo }[] = [];
      engine.subscribe((event) => seen.push(event));

      uploads[0]!.resolve(photo('p1'));
      engine.updateTags(id, { areaId: 'garden' });
      await flush();

      const patched = updatePhoto.mock.calls.map((call) => call[1]);
      const reportedAfterPatch = patched.length === 1 && seen[0]!.photo.id === 'p1-patched';
      expect(reportedAfterPatch).toBe(true);
      expect(patched[0]).toEqual({ areaId: 'garden' });
    });

    it('stops patching and deletes the stored photo when the item is removed during the patch', async () => {
      const id = await startUpload();
      const seen: unknown[] = [];
      engine.subscribe((event) => seen.push(event));
      let finishPatch!: () => void;
      updatePhoto.mockImplementation(
        (photoId) =>
          new Promise<Photo>((resolve) => {
            finishPatch = () => resolve(photo(`${photoId}-patched`));
          }),
      );
      engine.updateTags(id, { caption: 'late' });
      uploads[0]!.resolve(photo('p1'));
      await flush();

      engine.remove(id);
      finishPatch();
      await flush();

      expect(updatePhoto).toHaveBeenCalledTimes(1);
      expect(deletePhoto).toHaveBeenCalledWith('p1-patched');
      expect(seen).toEqual([]);
    });

    it('reports the stored photo unchanged when no updatePhoto dep is given', async () => {
      await make().start();
      const [id] = await engine.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS });
      const seen: unknown[] = [];
      engine.subscribe((event) => seen.push(event));
      engine.updateTags(id!, { areaId: 'garden' });

      uploads[0]!.resolve(photo('p1'));
      await flush();

      expect(seen).toEqual([{ itemId: id, draftId: 'd1', photo: photo('p1') }]);
    });
  });

  describe('dispose', () => {
    it('aborts uploads, revokes previews and stops publishing', async () => {
      await make().start();
      await engine.add([file()], { draftId: 'd1', source: 'camera', tags: NO_TAGS });
      const count = snapshots.length;

      engine.dispose();
      uploads[0]!.onProgress(10);

      expect(uploads[0]!.signal.aborted).toBe(true);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:2');
      expect(snapshots).toHaveLength(count);
    });
  });
});
