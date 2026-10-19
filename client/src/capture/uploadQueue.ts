export const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [2000, 5000, 15000];
export const DEFAULT_CONCURRENCY = 3;

export interface UploadQueueOptions {
  /** Performs one upload; resolves on success, rejects on failure. Aborting rejects too. */
  run: (id: string, signal: AbortSignal) => Promise<void>;
  /** Whether a failure is worth an automatic retry (network, 5xx, timeout). */
  isRetryable: (error: unknown) => boolean;
  isOnline: () => boolean;
  /** Returns a cancel function. Defaults to setTimeout/clearTimeout. */
  schedule?: (fn: () => void, ms: number) => () => void;
  concurrency?: number;
  retryDelaysMs?: readonly number[];
  onStart?: (id: string) => void;
  /** A failed run is waiting for its next automatic attempt. */
  onRetryScheduled?: (id: string, attempt: number) => void;
  onSucceeded?: (id: string) => void;
  /** Retries are used up, or the error is not retryable. */
  onFailed?: (id: string, error: unknown) => void;
}

export interface UploadQueue {
  enqueue(id: string): void;
  /** Resets the backoff of a failed id and queues it again. */
  retry(id: string): void;
  /** Restarts waiting ids (bound to the `online` event). */
  resume(): void;
  /** Aborts a running upload and drops the id. */
  cancel(id: string): void;
  has(id: string): boolean;
  dispose(): void;
}

type Status = 'queued' | 'running' | 'backoff' | 'failed';

interface Entry {
  status: Status;
  attempts: number;
  controller: AbortController | null;
  cancelTimer: (() => void) | null;
}

const defaultSchedule = (fn: () => void, ms: number): (() => void) => {
  const handle = setTimeout(fn, ms);
  return () => clearTimeout(handle);
};

function newEntry(): Entry {
  return { status: 'queued', attempts: 0, controller: null, cancelTimer: null };
}

export function createUploadQueue(options: UploadQueueOptions): UploadQueue {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const delays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const schedule = options.schedule ?? defaultSchedule;
  const entries = new Map<string, Entry>();
  let running = 0;

  function pump(): void {
    if (!options.isOnline()) return;
    for (const [id, entry] of entries) {
      if (running >= concurrency) return;
      if (entry.status === 'queued') start(id, entry);
    }
  }

  function start(id: string, entry: Entry): void {
    const controller = new AbortController();
    entry.status = 'running';
    entry.controller = controller;
    running += 1;
    options.onStart?.(id);
    options.run(id, controller.signal).then(
      () => {
        running -= 1;
        if (entries.get(id) === entry) {
          entries.delete(id);
          options.onSucceeded?.(id);
        }
        pump();
      },
      (error: unknown) => {
        running -= 1;
        if (entries.get(id) === entry && !controller.signal.aborted) {
          entry.controller = null;
          if (options.isRetryable(error) && entry.attempts < delays.length) {
            const delay = delays[entry.attempts] ?? 0;
            entry.attempts += 1;
            entry.status = 'backoff';
            options.onRetryScheduled?.(id, entry.attempts);
            entry.cancelTimer = schedule(() => {
              entry.cancelTimer = null;
              if (entries.get(id) !== entry) return;
              entry.status = 'queued';
              pump();
            }, delay);
          } else {
            entry.status = 'failed';
            options.onFailed?.(id, error);
          }
        }
        pump();
      },
    );
  }

  return {
    enqueue(id) {
      if (entries.has(id)) return;
      entries.set(id, newEntry());
      pump();
    },
    retry(id) {
      const entry = entries.get(id);
      if (!entry) {
        entries.set(id, newEntry());
      } else if (entry.status === 'failed' || entry.status === 'backoff') {
        entry.cancelTimer?.();
        entry.cancelTimer = null;
        entry.attempts = 0;
        entry.status = 'queued';
      }
      pump();
    },
    resume() {
      for (const entry of entries.values()) {
        if (entry.status === 'backoff') {
          entry.cancelTimer?.();
          entry.cancelTimer = null;
          entry.status = 'queued';
        }
      }
      pump();
    },
    cancel(id) {
      const entry = entries.get(id);
      if (!entry) return;
      entries.delete(id);
      entry.cancelTimer?.();
      entry.controller?.abort();
    },
    has: (id) => entries.has(id),
    dispose() {
      for (const entry of entries.values()) {
        entry.cancelTimer?.();
        entry.controller?.abort();
      }
      entries.clear();
    },
  };
}
