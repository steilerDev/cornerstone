import type { CaptureRecord } from './captureTypes.js';

export interface CaptureStore {
  readonly kind: 'indexeddb' | 'memory';
  /** Rejects on QuotaExceededError / private mode; the caller keeps the blob in memory. */
  put(record: CaptureRecord): Promise<void>;
  remove(id: string): Promise<void>;
  /** Records of that user only, oldest first. */
  list(userId: string): Promise<CaptureRecord[]>;
}

export const CAPTURE_DB_NAME = 'cornerstone-capture';
export const CAPTURE_DB_VERSION = 1;
const STORE_NAME = 'shots';
const USER_INDEX = 'byUser';

export function createMemoryStore(): CaptureStore {
  const records = new Map<string, CaptureRecord>();
  return {
    kind: 'memory',
    put: (record) => {
      records.set(record.id, record);
      return Promise.resolve();
    },
    remove: (id) => {
      records.delete(id);
      return Promise.resolve();
    },
    list: (userId) =>
      Promise.resolve(
        [...records.values()]
          .filter((record) => record.userId === userId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      ),
  };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function wrapDatabase(db: IDBDatabase): CaptureStore {
  return {
    kind: 'indexeddb',
    async put(record) {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const done = transactionDone(tx);
      tx.objectStore(STORE_NAME).put(record);
      await done;
    },
    async remove(id) {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const done = transactionDone(tx);
      tx.objectStore(STORE_NAME).delete(id);
      await done;
    },
    async list(userId) {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const rows = await requestResult<CaptureRecord[]>(
        tx.objectStore(STORE_NAME).index(USER_INDEX).getAll(userId),
      );
      return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
  };
}

/**
 * Opens the IndexedDB store. Falls back to a memory store when IndexedDB is missing, blocked
 * or fails to open.
 */
export function openCaptureStore(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): Promise<CaptureStore> {
  if (!factory) return Promise.resolve(createMemoryStore());
  return new Promise<CaptureStore>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(CAPTURE_DB_NAME, CAPTURE_DB_VERSION);
    } catch {
      resolve(createMemoryStore());
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex(USER_INDEX, 'userId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(wrapDatabase(request.result));
    request.onerror = () => resolve(createMemoryStore());
    request.onblocked = () => resolve(createMemoryStore());
  });
}
