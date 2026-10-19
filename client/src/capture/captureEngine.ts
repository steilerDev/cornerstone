import type { Photo } from '@cornerstone/shared';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';
import type { CaptureStore } from './captureStore.js';
import type {
  CaptureItem,
  CaptureRecord,
  CaptureSource,
  CaptureTags,
  CaptureUploadedEvent,
  CaptureUploadsApi,
} from './captureTypes.js';
import { createUploadQueue } from './uploadQueue.js';
import type { UploadQueue } from './uploadQueue.js';

export interface CaptureSnapshot {
  storage: CaptureUploadsApi['storage'];
  items: readonly CaptureItem[];
  orphans: readonly CaptureItem[];
}

export interface CaptureEngineDeps {
  userId: string;
  /** Provider instance id; tells crash orphans from this session's items. */
  sessionId: string;
  openStore: () => Promise<CaptureStore>;
  uploadPhoto: (
    entityType: string,
    entityId: string,
    file: File,
    caption: string | null,
    onProgress: (percent: number) => void,
    areaId: string | null,
    orientationId: string | null,
    signal: AbortSignal,
  ) => Promise<Photo>;
  deletePhoto: (id: string) => Promise<void>;
  /** PATCH of a stored photo's tags; used to re-apply tags changed while the upload ran. */
  updatePhoto?: (
    id: string,
    data: { areaId?: string | null; orientationId?: string | null; caption?: string | null },
  ) => Promise<Photo>;
  getDiaryEntry: (id: string) => Promise<unknown>;
  isOnline: () => boolean;
  schedule?: (fn: () => void, ms: number) => () => void;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  newId: () => string;
  now?: () => string;
  /** Called with a new snapshot whenever something changed. */
  onChange: (snapshot: CaptureSnapshot) => void;
  /** Called once after waiting photos of vanished drafts were removed. */
  onPurged: () => void;
}

export interface CaptureEngine extends Omit<CaptureUploadsApi, 'storage' | 'items' | 'orphans'> {
  /** Opens the store and resumes the user's records. */
  start(): Promise<void>;
  /** The `online` event: restart waiting uploads and re-check unverified drafts. */
  handleOnline(): void;
  getSnapshot(): CaptureSnapshot;
  dispose(): void;
}

interface Entry {
  item: CaptureItem;
  record: CaptureRecord;
  file: File;
  removed: boolean;
}

interface Waiter {
  ids: readonly string[];
  resolve: (result: { uploaded: readonly Photo[]; failedIds: readonly string[] }) => void;
}

function isRetryable(error: unknown): boolean {
  if (error instanceof NetworkError) return true;
  if (error instanceof ApiClientError) {
    return error.statusCode >= 500 || error.statusCode === 408;
  }
  return false;
}

function statusOf(error: unknown): number | null {
  return error instanceof ApiClientError ? error.statusCode : null;
}

export function createCaptureEngine(deps: CaptureEngineDeps): CaptureEngine {
  const entries = new Map<string, Entry>();
  const listeners = new Set<(event: CaptureUploadedEvent) => void>();
  const uploaded = new Map<string, Photo>();
  const waiters = new Set<Waiter>();
  const unverifiedDrafts = new Set<string>();
  let storage: CaptureUploadsApi['storage'] = 'pending';
  let store: CaptureStore | null = null;
  let disposed = false;
  let snapshot: CaptureSnapshot = { storage, items: [], orphans: [] };
  let ready: Promise<void> = Promise.resolve();

  const now = deps.now ?? (() => new Date().toISOString());

  function publish(): void {
    if (disposed) return;
    const all = [...entries.values()];
    snapshot = {
      storage,
      items: all.map((entry) => entry.item),
      orphans: all
        .filter(
          (entry) => entry.record.draftId === null && entry.record.sessionId !== deps.sessionId,
        )
        .map((entry) => entry.item),
    };
    deps.onChange(snapshot);
  }

  function setItem(entry: Entry, patch: Partial<CaptureItem>): void {
    entry.item = { ...entry.item, ...patch };
  }

  function persist(entry: Entry): void {
    if (!store || !entry.item.persisted) return;
    entry.record = {
      ...entry.record,
      state: entry.item.state === 'uploading' ? 'waiting' : entry.item.state,
    };
    store.put(entry.record).catch(() => {
      // Best effort: the blob stays in memory and in the record already stored.
    });
  }

  function checkWaiters(): void {
    for (const waiter of [...waiters]) {
      const settled = waiter.ids.every((id) => {
        if (uploaded.has(id)) return true;
        const entry = entries.get(id);
        return !entry || entry.item.state === 'failed' || entry.item.state === 'blocked';
      });
      if (!settled) continue;
      waiters.delete(waiter);
      const photos: Photo[] = [];
      const failedIds: string[] = [];
      for (const id of waiter.ids) {
        const photo = uploaded.get(id);
        if (photo) photos.push(photo);
        else failedIds.push(id);
      }
      waiter.resolve({ uploaded: photos, failedIds });
    }
  }

  function drop(entry: Entry): Promise<void> {
    entry.removed = true;
    queue.cancel(entry.item.id);
    entries.delete(entry.item.id);
    deps.revokeObjectURL(entry.item.previewUrl);
    return store ? store.remove(entry.item.id).catch(() => undefined) : Promise.resolve();
  }

  function purgeDrafts(draftIds: readonly string[]): void {
    const doomed = new Set(draftIds);
    const victims = [...entries.values()].filter(
      (entry) => entry.record.draftId !== null && doomed.has(entry.record.draftId),
    );
    if (victims.length === 0) return;
    for (const draftId of doomed) unverifiedDrafts.delete(draftId);
    for (const entry of victims) void drop(entry);
    publish();
    checkWaiters();
    deps.onPurged();
  }

  async function run(id: string, signal: AbortSignal): Promise<void> {
    const entry = entries.get(id);
    const draftId = entry?.record.draftId ?? null;
    if (!entry || draftId === null) throw new Error('Capture item is not ready to upload');
    const sent = {
      areaId: entry.item.areaId,
      orientationId: entry.item.orientationId,
      caption: entry.item.caption,
    };
    let photo = await deps.uploadPhoto(
      'diary_entry',
      draftId,
      entry.file,
      entry.item.caption,
      (percent) => {
        if (entry.removed || disposed) return;
        setItem(entry, { progress: percent });
        publish();
      },
      entry.item.areaId,
      entry.item.orientationId,
      signal,
    );
    // Tags can change while the request is in flight (it carried the old values). Patch the
    // stored photo until it matches the item's latest tags. Values are absolute, so a repeat is
    // harmless; only dimensions changed since the last write are sent, so nothing the user sets
    // afterwards is overwritten. The last comparison and the hand-off below run in one
    // synchronous block: `updateTags` either lands before the comparison (and is patched) or
    // after the item left the list (and the screen then patches the uploaded photo itself).
    let confirmed = sent;
    let patchFailures = 0;
    while (!entry.removed && !disposed) {
      const { areaId, orientationId, caption } = entry.item;
      const patch: {
        areaId?: string | null;
        orientationId?: string | null;
        caption?: string | null;
      } = {};
      if (areaId !== confirmed.areaId) patch.areaId = areaId;
      if (orientationId !== confirmed.orientationId) patch.orientationId = orientationId;
      if (caption !== confirmed.caption) patch.caption = caption;
      if (Object.keys(patch).length === 0 || !deps.updatePhoto) break;
      try {
        photo = await deps.updatePhoto(photo.id, patch);
        confirmed = { areaId, orientationId, caption };
      } catch {
        // A failed patch must not fail the upload (a retry would store a duplicate): try once more.
        patchFailures += 1;
        if (patchFailures > 1) break;
      }
    }
    if (entry.removed || disposed) {
      // Removed while the request was already on the server: take the stored photo away again.
      await deps.deletePhoto(photo.id).catch(() => undefined);
      return;
    }
    // Hand-off, synchronously: from here the item is gone from the engine and from the snapshot
    // at the same moment the listeners learn about the photo. The IndexedDB delete is not awaited.
    uploaded.set(id, photo);
    void drop(entry);
    publish();
    for (const listener of [...listeners]) {
      try {
        listener({ itemId: id, draftId, photo });
      } catch {
        // A faulty listener must not break the others.
      }
    }
    checkWaiters();
  }

  const queue: UploadQueue = createUploadQueue({
    run,
    isRetryable,
    isOnline: deps.isOnline,
    schedule: deps.schedule,
    onStart: (id) => {
      const entry = entries.get(id);
      if (!entry) return;
      setItem(entry, { state: 'uploading', progress: 0 });
      publish();
    },
    onRetryScheduled: (id) => {
      const entry = entries.get(id);
      if (!entry) return;
      entry.record = { ...entry.record, attempts: entry.record.attempts + 1 };
      setItem(entry, { state: 'waiting', progress: null });
      publish();
    },
    onFailed: (id, error) => {
      const entry = entries.get(id);
      if (!entry) return;
      const status = statusOf(error);
      if (status === 404) {
        purgeDrafts(entry.record.draftId ? [entry.record.draftId] : []);
        return;
      }
      setItem(entry, { state: status === 403 ? 'blocked' : 'failed', progress: null });
      persist(entry);
      publish();
      checkWaiters();
    },
  });

  function createEntry(record: CaptureRecord, persisted: boolean): Entry {
    const file = new File([record.blob], record.name, { type: record.type });
    const item: CaptureItem = {
      id: record.id,
      draftId: record.draftId,
      source: record.source,
      name: record.name,
      previewUrl: deps.createObjectURL(record.blob),
      state: record.state,
      progress: null,
      persisted,
      createdAt: record.createdAt,
      areaId: record.areaId,
      orientationId: record.orientationId,
      areaSource: record.areaSource,
      orientationSource: record.orientationSource,
      caption: record.caption,
    };
    const entry: Entry = { item, record, file, removed: false };
    entries.set(record.id, entry);
    return entry;
  }

  /** Starts (or restarts) the upload of an item that has a draft. Blocked items stay blocked. */
  function enqueueEntry(entry: Entry, resetBlocked: boolean): void {
    if (entry.record.draftId === null) return;
    if (entry.item.state === 'blocked' && !resetBlocked) return;
    if (entry.item.state === 'failed' || entry.item.state === 'blocked') {
      setItem(entry, { state: 'waiting', progress: null });
    }
    entry.record = { ...entry.record, attempts: 0 };
    queue.cancel(entry.item.id);
    queue.enqueue(entry.item.id);
  }

  function setDraft(entry: Entry, draftId: string): void {
    entry.record = { ...entry.record, draftId };
    setItem(entry, { draftId });
    persist(entry);
    enqueueEntry(entry, true);
  }

  async function verifyDrafts(draftIds: readonly string[]): Promise<void> {
    const gone: string[] = [];
    await Promise.all(
      draftIds.map(async (draftId) => {
        try {
          await deps.getDiaryEntry(draftId);
          unverifiedDrafts.delete(draftId);
          if (disposed) return;
          for (const entry of [...entries.values()]) {
            if (entry.record.draftId === draftId) enqueueEntry(entry, false);
          }
        } catch (error) {
          if (statusOf(error) === 404) gone.push(draftId);
          else unverifiedDrafts.add(draftId);
        }
      }),
    );
    if (disposed) return;
    if (gone.length > 0) purgeDrafts(gone);
    else publish();
  }

  async function startEngine(): Promise<void> {
    const opened = await deps.openStore();
    if (disposed) return;
    store = opened;
    storage = opened.kind === 'indexeddb' ? 'persistent' : 'memory';
    const records: CaptureRecord[] = await opened.list(deps.userId).catch(() => []);
    if (disposed) return;
    const drafts = new Set<string>();
    for (const record of records) {
      createEntry(record, opened.kind === 'indexeddb');
      if (record.draftId !== null) drafts.add(record.draftId);
    }
    publish();
    await verifyDrafts([...drafts]);
  }

  return {
    start() {
      ready = startEngine();
      return ready;
    },
    handleOnline() {
      queue.resume();
      if (unverifiedDrafts.size > 0) void verifyDrafts([...unverifiedDrafts]);
    },
    getSnapshot: () => snapshot,
    dispose() {
      disposed = true;
      queue.dispose();
      for (const entry of entries.values()) deps.revokeObjectURL(entry.item.previewUrl);
      entries.clear();
      listeners.clear();
      waiters.clear();
    },

    async add(files, init: { draftId: string | null; source: CaptureSource; tags: CaptureTags }) {
      await ready;
      if (disposed) return [];
      const ids: string[] = [];
      for (const file of files) {
        const record: CaptureRecord = {
          ...init.tags,
          id: deps.newId(),
          userId: deps.userId,
          sessionId: deps.sessionId,
          draftId: init.draftId,
          source: init.source,
          blob: file,
          name: file.name,
          type: file.type,
          size: file.size,
          state: 'waiting',
          attempts: 0,
          createdAt: now(),
        };
        let persisted = false;
        if (store) {
          try {
            await store.put(record);
            persisted = store.kind === 'indexeddb';
          } catch {
            // Quota or private mode: keep the blob in memory only.
          }
        }
        if (disposed) return ids;
        const entry = createEntry(record, persisted);
        ids.push(record.id);
        publish();
        enqueueEntry(entry, false);
      }
      return ids;
    },

    assignDraft(itemIds, draftId) {
      let changed = false;
      for (const id of itemIds) {
        const entry = entries.get(id);
        if (!entry || entry.record.draftId !== null) continue;
        setDraft(entry, draftId);
        changed = true;
      }
      if (changed) publish();
    },

    reassign(fromDraftId, toDraftId) {
      const moved: string[] = [];
      for (const entry of [...entries.values()]) {
        if (entry.record.draftId !== fromDraftId) continue;
        setDraft(entry, toDraftId);
        moved.push(entry.item.id);
      }
      unverifiedDrafts.delete(fromDraftId);
      if (moved.length > 0) publish();
      return moved;
    },

    updateTags(itemId, patch) {
      const entry = entries.get(itemId);
      if (!entry) return;
      entry.record = { ...entry.record, ...patch };
      setItem(entry, patch);
      persist(entry);
      publish();
    },

    remove(itemId) {
      const entry = entries.get(itemId);
      if (!entry) return;
      void drop(entry);
      publish();
      checkWaiters();
    },

    retry(draftId) {
      let changed = false;
      for (const entry of entries.values()) {
        if (entry.record.draftId !== draftId || entry.item.state === 'blocked') continue;
        if (entry.item.state === 'uploading') continue;
        setItem(entry, { state: 'waiting', progress: null });
        entry.record = { ...entry.record, attempts: 0 };
        queue.retry(entry.item.id);
        changed = true;
      }
      if (changed) publish();
    },

    async discardDraft(draftId) {
      const victims = [...entries.values()].filter((entry) => entry.record.draftId === draftId);
      const pending = victims.map((entry) => drop(entry));
      unverifiedDrafts.delete(draftId);
      publish();
      checkWaiters();
      await Promise.all(pending);
    },

    adoptOrphans(draftId) {
      let changed = false;
      for (const entry of [...entries.values()]) {
        if (entry.record.draftId !== null || entry.record.sessionId === deps.sessionId) continue;
        setDraft(entry, draftId);
        changed = true;
      }
      if (changed) publish();
    },

    async discardOrphans() {
      const victims = snapshot.orphans.flatMap((item) => {
        const entry = entries.get(item.id);
        return entry ? [entry] : [];
      });
      const pending = victims.map((entry) => drop(entry));
      publish();
      checkWaiters();
      await Promise.all(pending);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    whenSettled(itemIds) {
      return new Promise((resolve) => {
        waiters.add({ ids: itemIds, resolve });
        checkWaiters();
      });
    },
  };
}
