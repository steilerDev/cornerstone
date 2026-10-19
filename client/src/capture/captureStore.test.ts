/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { IDBFactory } from 'fake-indexeddb';
import { CAPTURE_DB_NAME, createMemoryStore, openCaptureStore } from './captureStore.js';
import type { CaptureRecord } from './captureTypes.js';

function makeRecord(overrides: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    id: 'shot-1',
    userId: 'user-1',
    sessionId: 'session-1',
    draftId: null,
    source: 'camera',
    blob: new Blob(['pixels'], { type: 'image/jpeg' }),
    name: 'capture-1.jpg',
    type: 'image/jpeg',
    size: 6,
    state: 'waiting',
    attempts: 0,
    createdAt: '2026-01-01T10:00:00.000Z',
    areaId: null,
    orientationId: null,
    areaSource: null,
    orientationSource: null,
    caption: null,
    ...overrides,
  };
}

function failingOpen(event: 'onerror' | 'onblocked'): IDBFactory {
  return {
    open: () => {
      const request = {} as IDBOpenDBRequest;
      setTimeout(() => (request[event] as unknown as () => void)(), 0);
      return request;
    },
  } as unknown as IDBFactory;
}

describe('openCaptureStore', () => {
  it('uses IndexedDB when a factory is available', async () => {
    const store = await openCaptureStore(new IDBFactory());
    expect(store.kind).toBe('indexeddb');
  });

  it('puts, lists (oldest first) and removes records', async () => {
    const store = await openCaptureStore(new IDBFactory());
    await store.put(makeRecord({ id: 'a' }));
    await store.put(makeRecord({ id: 'b', createdAt: '2026-01-01T09:00:00.000Z' }));

    const listed = await store.list('user-1');
    expect(listed.map((record) => record.id)).toEqual(['b', 'a']);
    expect(listed[0]?.blob.size).toBe(6);

    await store.remove('a');
    expect((await store.list('user-1')).map((record) => record.id)).toEqual(['b']);
  });

  it('put with an existing id replaces the record', async () => {
    const store = await openCaptureStore(new IDBFactory());
    await store.put(makeRecord({ id: 'a', caption: 'first' }));
    await store.put(makeRecord({ id: 'a', caption: 'second' }));

    const listed = await store.list('user-1');
    expect(listed).toHaveLength(1);
    expect(listed[0]?.caption).toBe('second');
  });

  it("lists only the given user's records and keeps other users' records", async () => {
    const store = await openCaptureStore(new IDBFactory());
    await store.put(makeRecord({ id: 'mine', userId: 'user-1' }));
    await store.put(makeRecord({ id: 'theirs', userId: 'user-2' }));

    expect((await store.list('user-1')).map((record) => record.id)).toEqual(['mine']);
    expect((await store.list('user-2')).map((record) => record.id)).toEqual(['theirs']);
    expect(await store.list('nobody')).toEqual([]);
  });

  it('keeps records across a reopen of the same database (reload)', async () => {
    const factory = new IDBFactory();
    const first = await openCaptureStore(factory);
    await first.put(makeRecord({ id: 'survivor', draftId: 'draft-1' }));

    const reopened = await openCaptureStore(factory);

    const listed = await reopened.list('user-1');
    expect(listed.map((record) => record.id)).toEqual(['survivor']);
    expect(listed[0]?.draftId).toBe('draft-1');
  });

  it('falls back to a memory store when IndexedDB is missing', async () => {
    const store = await openCaptureStore(undefined as unknown as IDBFactory);
    expect(store.kind).toBe('memory');
  });

  it('falls back to a memory store when open throws', async () => {
    const factory = {
      open: () => {
        throw new Error('SecurityError');
      },
    } as unknown as IDBFactory;
    expect((await openCaptureStore(factory)).kind).toBe('memory');
  });

  it('falls back to a memory store when open reports an error', async () => {
    expect((await openCaptureStore(failingOpen('onerror'))).kind).toBe('memory');
  });

  it('falls back to a memory store when open is blocked', async () => {
    expect((await openCaptureStore(failingOpen('onblocked'))).kind).toBe('memory');
  });

  it('does not recreate an object store that already exists on upgrade', async () => {
    const factory = new IDBFactory();
    await new Promise<void>((resolve) => {
      const request = factory.open(CAPTURE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('shots', { keyPath: 'id' });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
    });

    const store = await openCaptureStore(factory);

    expect(store.kind).toBe('indexeddb');
  });

  it('rejects put when the record cannot be stored (quota or clone failure)', async () => {
    const store = await openCaptureStore(new IDBFactory());
    const bad = makeRecord({ id: 'x' });
    (bad as unknown as { blob: unknown }).blob = () => undefined;

    await expect(store.put(bad)).rejects.toBeDefined();
  });

  it('rejects remove for an invalid key', async () => {
    const store = await openCaptureStore(new IDBFactory());
    await expect(store.remove(undefined as unknown as string)).rejects.toBeDefined();
  });
});

describe('createMemoryStore', () => {
  it('stores, lists per user, orders oldest first and removes', async () => {
    const store = createMemoryStore();
    expect(store.kind).toBe('memory');
    await store.put(makeRecord({ id: 'late', createdAt: '2026-01-02T00:00:00.000Z' }));
    await store.put(makeRecord({ id: 'early', createdAt: '2026-01-01T00:00:00.000Z' }));
    await store.put(makeRecord({ id: 'other', userId: 'user-2' }));

    expect((await store.list('user-1')).map((record) => record.id)).toEqual(['early', 'late']);

    await store.remove('early');
    expect((await store.list('user-1')).map((record) => record.id)).toEqual(['late']);
    expect((await store.list('user-2')).map((record) => record.id)).toEqual(['other']);
  });
});
