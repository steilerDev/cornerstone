/**
 * @jest-environment node
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createUploadQueue } from './uploadQueue.js';
import type { UploadQueue } from './uploadQueue.js';

interface Deferred {
  id: string;
  signal: AbortSignal;
  resolve: () => void;
  reject: (error: unknown) => void;
}

interface Timer {
  fn: () => void;
  ms: number;
  cancelled: boolean;
}

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe('createUploadQueue', () => {
  let runs: Deferred[];
  let timers: Timer[];
  let online: boolean;
  let retryable: boolean;
  const onStart = jest.fn<(id: string) => void>();
  const onRetryScheduled = jest.fn<(id: string, attempt: number) => void>();
  const onSucceeded = jest.fn<(id: string) => void>();
  const onFailed = jest.fn<(id: string, error: unknown) => void>();

  function build(overrides: Partial<Parameters<typeof createUploadQueue>[0]> = {}): UploadQueue {
    return createUploadQueue({
      run: (id, signal) =>
        new Promise<void>((resolve, reject) => {
          runs.push({ id, signal, resolve, reject });
        }),
      isRetryable: () => retryable,
      isOnline: () => online,
      schedule: (fn, ms) => {
        const timer: Timer = { fn, ms, cancelled: false };
        timers.push(timer);
        return () => {
          timer.cancelled = true;
        };
      },
      onStart,
      onRetryScheduled,
      onSucceeded,
      onFailed,
      ...overrides,
    });
  }

  const latest = (id: string) => [...runs].reverse().find((run) => run.id === id)!;

  beforeEach(() => {
    runs = [];
    timers = [];
    online = true;
    retryable = true;
    onStart.mockReset();
    onRetryScheduled.mockReset();
    onSucceeded.mockReset();
    onFailed.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts at most 3 uploads at once and starts the 4th when one finishes', async () => {
    const queue = build();
    for (const id of ['a', 'b', 'c', 'd']) queue.enqueue(id);

    expect(runs.map((run) => run.id)).toEqual(['a', 'b', 'c']);

    runs[0]!.resolve();
    await flush();

    expect(runs.map((run) => run.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(onSucceeded).toHaveBeenCalledWith('a');
    expect(queue.has('a')).toBe(false);
    expect(queue.has('d')).toBe(true);
  });

  it('honours a custom concurrency', () => {
    const queue = build({ concurrency: 1 });
    queue.enqueue('a');
    queue.enqueue('b');

    expect(runs.map((run) => run.id)).toEqual(['a']);
  });

  it('ignores a second enqueue of the same id', () => {
    const queue = build();
    queue.enqueue('a');
    queue.enqueue('a');

    expect(runs).toHaveLength(1);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('retries a retryable failure after 2 s, 5 s and 15 s, then fails', async () => {
    const queue = build();
    queue.enqueue('a');

    runs[0]!.reject(new Error('net'));
    await flush();
    expect(timers.map((timer) => timer.ms)).toEqual([2000]);
    expect(onRetryScheduled).toHaveBeenLastCalledWith('a', 1);
    expect(runs).toHaveLength(1);

    timers[0]!.fn();
    expect(runs).toHaveLength(2);
    runs[1]!.reject(new Error('net'));
    await flush();
    expect(timers.map((timer) => timer.ms)).toEqual([2000, 5000]);

    timers[1]!.fn();
    runs[2]!.reject(new Error('net'));
    await flush();
    expect(timers.map((timer) => timer.ms)).toEqual([2000, 5000, 15000]);
    expect(onRetryScheduled).toHaveBeenLastCalledWith('a', 3);

    timers[2]!.fn();
    runs[3]!.reject(new Error('boom'));
    await flush();

    expect(timers).toHaveLength(3);
    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(onFailed).toHaveBeenCalledWith('a', expect.any(Error));
    expect(queue.has('a')).toBe(true);
  });

  it('does not retry a non-retryable failure', async () => {
    retryable = false;
    const queue = build();
    queue.enqueue('a');

    runs[0]!.reject(new Error('400'));
    await flush();

    expect(timers).toHaveLength(0);
    expect(onFailed).toHaveBeenCalledTimes(1);
  });

  it('frees the slot of a failed upload for the next one', async () => {
    retryable = false;
    const queue = build({ concurrency: 1 });
    queue.enqueue('a');
    queue.enqueue('b');

    runs[0]!.reject(new Error('x'));
    await flush();

    expect(runs.map((run) => run.id)).toEqual(['a', 'b']);
  });

  it('uses the default timer when no schedule is injected', async () => {
    jest.useFakeTimers();
    const queue = createUploadQueue({
      run: (id, signal) =>
        new Promise<void>((resolve, reject) => {
          runs.push({ id, signal, resolve, reject });
        }),
      isRetryable: () => true,
      isOnline: () => true,
    });
    queue.enqueue('a');

    runs[0]!.reject(new Error('net'));
    await flush();
    expect(runs).toHaveLength(1);

    jest.advanceTimersByTime(1999);
    expect(runs).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(runs).toHaveLength(2);

    // cancelling clears the default timer
    runs[1]!.reject(new Error('net'));
    await flush();
    queue.cancel('a');
    jest.advanceTimersByTime(60000);
    expect(runs).toHaveLength(2);
  });

  it('uses custom retry delays', async () => {
    const queue = build({ retryDelaysMs: [10] });
    queue.enqueue('a');

    runs[0]!.reject(new Error('net'));
    await flush();
    expect(timers.map((timer) => timer.ms)).toEqual([10]);

    timers[0]!.fn();
    runs[1]!.reject(new Error('net'));
    await flush();
    expect(onFailed).toHaveBeenCalledTimes(1);
  });

  describe('offline', () => {
    it('holds uploads while offline and starts them on resume', () => {
      online = false;
      const queue = build();
      queue.enqueue('a');
      queue.enqueue('b');
      expect(runs).toHaveLength(0);

      online = true;
      queue.resume();

      expect(runs.map((run) => run.id)).toEqual(['a', 'b']);
    });

    it('resume starts a waiting retry immediately and cancels its timer', async () => {
      const queue = build();
      queue.enqueue('a');
      runs[0]!.reject(new Error('net'));
      await flush();
      expect(timers).toHaveLength(1);

      queue.resume();

      expect(timers[0]!.cancelled).toBe(true);
      expect(runs).toHaveLength(2);
    });

    it('does not start a due retry while offline', async () => {
      const queue = build();
      queue.enqueue('a');
      runs[0]!.reject(new Error('net'));
      await flush();

      online = false;
      timers[0]!.fn();
      expect(runs).toHaveLength(1);

      online = true;
      queue.resume();
      expect(runs).toHaveLength(2);
    });

    it('resume leaves running and failed entries alone', async () => {
      retryable = false;
      const queue = build();
      queue.enqueue('a');
      queue.enqueue('b');
      runs[0]!.reject(new Error('x'));
      await flush();

      queue.resume();

      expect(runs).toHaveLength(2);
    });
  });

  describe('retry', () => {
    it('restarts a failed id with a fresh backoff', async () => {
      retryable = false;
      const queue = build();
      queue.enqueue('a');
      runs[0]!.reject(new Error('x'));
      await flush();

      retryable = true;
      queue.retry('a');
      expect(runs).toHaveLength(2);
      runs[1]!.reject(new Error('net'));
      await flush();
      expect(timers.map((timer) => timer.ms)).toEqual([2000]);
    });

    it('cuts a backoff wait short and resets the attempts', async () => {
      const queue = build();
      queue.enqueue('a');
      runs[0]!.reject(new Error('net'));
      await flush();

      queue.retry('a');

      expect(timers[0]!.cancelled).toBe(true);
      expect(runs).toHaveLength(2);
    });

    it('queues an unknown id', () => {
      const queue = build();
      queue.retry('fresh');

      expect(runs.map((run) => run.id)).toEqual(['fresh']);
    });

    it('does not start a second run for an id that is already running', () => {
      const queue = build();
      queue.enqueue('a');
      queue.retry('a');

      expect(runs).toHaveLength(1);
    });
  });

  describe('cancel', () => {
    it('aborts a running upload, drops the id and ignores its late outcome', async () => {
      const queue = build();
      queue.enqueue('a');
      const run = runs[0]!;

      queue.cancel('a');
      expect(run.signal.aborted).toBe(true);
      expect(queue.has('a')).toBe(false);

      run.reject(new DOMException('Upload aborted', 'AbortError'));
      await flush();
      expect(onFailed).not.toHaveBeenCalled();
      expect(timers).toHaveLength(0);
    });

    it('ignores a late success of a cancelled upload', async () => {
      const queue = build();
      queue.enqueue('a');
      const run = runs[0]!;
      queue.cancel('a');

      run.resolve();
      await flush();

      expect(onSucceeded).not.toHaveBeenCalled();
    });

    it('frees the slot for the next queued id', async () => {
      const queue = build({ concurrency: 1 });
      queue.enqueue('a');
      queue.enqueue('b');
      const first = runs[0]!;

      queue.cancel('a');
      first.reject(new DOMException('Upload aborted', 'AbortError'));
      await flush();

      expect(runs.map((run) => run.id)).toEqual(['a', 'b']);
    });

    it('cancels a pending retry timer', async () => {
      const queue = build();
      queue.enqueue('a');
      runs[0]!.reject(new Error('net'));
      await flush();

      queue.cancel('a');

      expect(timers[0]!.cancelled).toBe(true);
      timers[0]!.fn();
      expect(runs).toHaveLength(1);
    });

    it('does nothing for an unknown id', () => {
      const queue = build();
      expect(() => queue.cancel('nope')).not.toThrow();
    });

    it('a re-enqueued id after cancel is a fresh run', async () => {
      const queue = build();
      queue.enqueue('a');
      const stale = runs[0]!;
      queue.cancel('a');
      queue.enqueue('a');
      expect(runs).toHaveLength(2);

      stale.resolve();
      await flush();

      expect(onSucceeded).not.toHaveBeenCalled();
      expect(queue.has('a')).toBe(true);
      expect(latest('a')).not.toBe(stale);
    });
  });

  describe('dispose', () => {
    it('aborts running uploads, cancels timers and empties the queue', async () => {
      const queue = build({ concurrency: 2 });
      queue.enqueue('a');
      queue.enqueue('b');
      queue.enqueue('c');
      runs[1]!.reject(new Error('net'));
      await flush();
      // b is backing off, a runs, c took b's slot.
      expect(timers).toHaveLength(1);

      queue.dispose();

      expect(timers[0]!.cancelled).toBe(true);
      expect(runs[0]!.signal.aborted).toBe(true);
      expect(runs[2]!.signal.aborted).toBe(true);
      expect(queue.has('a')).toBe(false);
      expect(queue.has('c')).toBe(false);
    });
  });
});
