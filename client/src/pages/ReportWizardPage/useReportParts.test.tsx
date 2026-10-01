/**
 * Unit tests for useReportParts.ts (story #2161): attachment sizing (ok / failed / cancelled,
 * throttled progress), part generation, staleness, the epoch guard, in-flight de-duplication and
 * cache scoping. The pipeline module (`lib/reportPdf/parts.js`) is mocked.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { SourceReportResponse } from '@cornerstone/shared';
import type { ReportColumnKey, ReportContent } from '../../lib/reportContent/index.js';
import type * as PartsModule from '../../lib/reportPdf/parts.js';
import type {
  AcquireResult,
  AttachmentCache,
  FailedFetch,
  GeneratedReportParts,
  SkippedDocument,
} from '../../lib/reportPdf/types.js';
import type { UseReportPartsArgs } from './useReportParts.js';

const mockAcquire = jest.fn<typeof PartsModule.acquireAttachments>();
const mockCountUncached = jest.fn<typeof PartsModule.countUncachedDocuments>();
const mockGenerate = jest.fn<typeof PartsModule.generateReportParts>();
jest.unstable_mockModule('../../lib/reportPdf/parts.js', () => ({
  acquireAttachments: mockAcquire,
  countUncachedDocuments: mockCountUncached,
  generateReportParts: mockGenerate,
}));

const { useReportParts } = await import('./useReportParts.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeContent(tag: string): ReportContent {
  return { tag } as unknown as ReportContent;
}

function makeFailure(documentId: number): FailedFetch {
  return {
    invoiceId: `inv-${documentId}`,
    documentId,
    title: `Doc ${documentId}`,
    vendorName: 'ACME',
    invoiceNumber: `N-${documentId}`,
  };
}

function makeParts(skipped: SkippedDocument[] = []): GeneratedReportParts {
  return {
    parts: [
      {
        index: 0,
        blob: new Blob(['a']),
        size: 1,
        attachmentKeys: [],
        invoiceIds: [],
        overLimit: false,
      },
    ],
    skippedDocuments: skipped,
    warnings: [],
    limitBytes: 1_000_000,
  };
}

const okAcquire: AcquireResult = { attachments: [], skippedDocuments: [], failedFetches: [] };

function makeDocs(count: number) {
  return Array.from({ length: count }, (_, i) => ({ documentId: i + 1 }));
}
// inv-1 (included) has 3 documents, inv-2 (not included) has 4: the sizing total must be 3.
const REPORT = {
  id: 'report',
  invoices: [
    { invoiceId: 'inv-1', documents: makeDocs(3) },
    { invoiceId: 'inv-2', documents: makeDocs(4) },
    { invoiceId: 'inv-1', documents: undefined },
  ],
} as unknown as SourceReportResponse;
const INCLUDED: ReadonlySet<string> = new Set(['inv-1']);
const HIDDEN: ReadonlySet<ReportColumnKey> = new Set<ReportColumnKey>();
const CONTENT_A = makeContent('A');

function makeArgs(overrides: Partial<UseReportPartsArgs> = {}): UseReportPartsArgs {
  return {
    enabled: true,
    limitBytes: 1_000_000,
    report: REPORT,
    includedInvoiceIds: INCLUDED,
    content: CONTENT_A,
    hiddenColumns: HIDDEN,
    cacheScope: 'claim:src-1',
    onSkipped: jest.fn(),
    ...overrides,
  };
}

function setup(initial: Partial<UseReportPartsArgs> = {}) {
  const onSkipped = jest.fn<(s: SkippedDocument[]) => void>();
  const hook = renderHook((props: UseReportPartsArgs) => useReportParts(props), {
    initialProps: makeArgs({ onSkipped, ...initial }),
  });
  const update = (changes: Partial<UseReportPartsArgs>) =>
    hook.rerender(makeArgs({ onSkipped, ...initial, ...changes }));
  return { ...hook, onSkipped, update };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCountUncached.mockReturnValue(2);
  mockAcquire.mockResolvedValue(okAcquire);
  mockGenerate.mockImplementation(async () => makeParts());
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Sizing ───────────────────────────────────────────────────────────────────

describe('useReportParts — sizing', () => {
  it('starts idle with no result', () => {
    const { result } = setup();

    expect(result.current.sizing).toEqual({ phase: 'idle' });
    expect(result.current.partsStatus).toBe('idle');
    expect(result.current.result).toBeNull();
  });

  it('returns "ok" without touching the pipeline when the feature is disabled', async () => {
    const { result } = setup({ enabled: false });

    let outcome;
    await act(async () => {
      outcome = await result.current.startSizing();
    });

    expect(outcome).toBe('ok');
    expect(mockCountUncached).not.toHaveBeenCalled();
    expect(mockAcquire).not.toHaveBeenCalled();
  });

  it('returns "ok" without touching the pipeline when there is no report yet', async () => {
    const { result } = setup({ report: null });

    let outcome;
    await act(async () => {
      outcome = await result.current.startSizing();
    });

    expect(outcome).toBe('ok');
    expect(mockAcquire).not.toHaveBeenCalled();
  });

  it('returns "ok" with no running state when every document is already cached', async () => {
    mockCountUncached.mockReturnValue(0);
    const phases: string[] = [];
    const { result } = renderHook(() => {
      const value = useReportParts(makeArgs());
      phases.push(value.sizing.phase);
      return value;
    });

    let outcome;
    await act(async () => {
      outcome = await result.current.startSizing();
    });

    expect(outcome).toBe('ok');
    expect(mockAcquire).not.toHaveBeenCalled();
    expect(phases).not.toContain('running');
    expect(result.current.sizing).toEqual({ phase: 'idle' });
  });

  it('shows a running state whose total covers ALL included documents, not just the uncached ones', async () => {
    const gate = deferred<AcquireResult>();
    mockCountUncached.mockReturnValue(1); // partially warm cache: 1 of the 3 included pairs
    mockAcquire.mockReturnValueOnce(gate.promise);
    const { result } = setup();

    let pending!: Promise<string>;
    act(() => {
      pending = result.current.startSizing();
    });
    await waitFor(() =>
      expect(result.current.sizing).toEqual({ phase: 'running', done: 0, total: 3 }),
    );

    await act(async () => {
      gate.resolve(okAcquire);
      await pending;
    });

    await expect(pending).resolves.toBe('ok');
    expect(result.current.sizing).toEqual({ phase: 'idle' });
    expect(mockAcquire).toHaveBeenCalledTimes(1);
    const [report, included, cache, options] = mockAcquire.mock.calls[0]!;
    expect(report).toBe(REPORT);
    expect(included).toBe(INCLUDED);
    expect(cache).toBeInstanceOf(Map);
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(typeof options?.onProgress).toBe('function');
  });

  it('publishes the first progress update immediately, then throttles to one per 500 ms', async () => {
    const gate = deferred<AcquireResult>();
    mockCountUncached.mockReturnValue(1);
    mockAcquire.mockReturnValueOnce(gate.promise);
    let now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const { result } = setup();

    let pending!: Promise<string>;
    act(() => {
      pending = result.current.startSizing();
    });
    await waitFor(() =>
      expect(result.current.sizing).toEqual({ phase: 'running', done: 0, total: 3 }),
    );
    const onProgress = mockAcquire.mock.calls[0]![3]!.onProgress!;

    // First callback: published at once, without waiting 500 ms.
    now += 10;
    act(() => onProgress(1, 3));
    expect(result.current.sizing).toEqual({ phase: 'running', done: 1, total: 3 });

    now += 100;
    act(() => onProgress(2, 3));
    expect(result.current.sizing).toEqual({ phase: 'running', done: 1, total: 3 });

    now += 500;
    act(() => onProgress(3, 3));
    expect(result.current.sizing).toEqual({ phase: 'running', done: 3, total: 3 });

    await act(async () => {
      gate.resolve(okAcquire);
      await pending;
    });
    expect(result.current.sizing).toEqual({ phase: 'idle' });
  });

  it('goes to "failed" with the failed fetches and returns "failed"', async () => {
    const failures = [makeFailure(11), makeFailure(12)];
    mockAcquire.mockResolvedValueOnce({ ...okAcquire, failedFetches: failures });
    const { result } = setup();

    let outcome;
    await act(async () => {
      outcome = await result.current.startSizing();
    });

    expect(outcome).toBe('failed');
    expect(result.current.sizing).toEqual({ phase: 'failed', failures });
  });

  it('"Continue without them" accepts the failures, returns to idle and skips them on generation', async () => {
    mockAcquire.mockResolvedValueOnce({ ...okAcquire, failedFetches: [makeFailure(11)] });
    const { result } = setup();
    await act(async () => {
      await result.current.startSizing();
    });

    act(() => result.current.continueWithoutFailed());
    expect(result.current.sizing).toEqual({ phase: 'idle' });

    await act(async () => {
      await result.current.ensureParts();
    });
    const options = mockAcquire.mock.calls[1]![3]!;
    expect(Array.from(options.skipFetch ?? [])).toEqual([11]);
  });

  it('continueWithoutFailed is harmless when sizing did not fail', () => {
    const { result } = setup();

    act(() => result.current.continueWithoutFailed());

    expect(result.current.sizing).toEqual({ phase: 'idle' });
  });

  it('a fresh sizing round clears previously accepted failures', async () => {
    mockAcquire.mockResolvedValueOnce({ ...okAcquire, failedFetches: [makeFailure(11)] });
    const { result } = setup();
    await act(async () => {
      await result.current.startSizing();
    });
    act(() => result.current.continueWithoutFailed());

    mockAcquire.mockResolvedValueOnce(okAcquire);
    await act(async () => {
      await result.current.startSizing();
    });
    await act(async () => {
      await result.current.ensureParts();
    });

    const lastCall = mockAcquire.mock.calls[mockAcquire.mock.calls.length - 1]!;
    expect(Array.from(lastCall[3]!.skipFetch ?? [])).toEqual([]);
  });

  it('cancelSizing aborts a running round: outcome "cancelled" and idle', async () => {
    const gate = deferred<AcquireResult>();
    mockAcquire.mockReturnValueOnce(gate.promise);
    const { result } = setup();

    let pending!: Promise<string>;
    act(() => {
      pending = result.current.startSizing();
    });
    await waitFor(() => expect(result.current.sizing.phase).toBe('running'));
    const signal = mockAcquire.mock.calls[0]![3]!.signal!;

    act(() => result.current.cancelSizing());
    expect(signal.aborted).toBe(true);

    await act(async () => {
      gate.resolve(okAcquire);
      await pending;
    });
    await expect(pending).resolves.toBe('cancelled');
    expect(result.current.sizing).toEqual({ phase: 'idle' });
  });

  it('treats an AbortError from the pipeline as "cancelled"', async () => {
    mockAcquire.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    const { result } = setup();

    let outcome;
    await act(async () => {
      outcome = await result.current.startSizing();
    });

    expect(outcome).toBe('cancelled');
    expect(result.current.sizing).toEqual({ phase: 'idle' });
  });

  it('cancelSizing dismisses the failure card (Back)', async () => {
    mockAcquire.mockResolvedValueOnce({ ...okAcquire, failedFetches: [makeFailure(11)] });
    const { result } = setup();
    await act(async () => {
      await result.current.startSizing();
    });
    expect(result.current.sizing.phase).toBe('failed');

    act(() => result.current.cancelSizing());

    expect(result.current.sizing).toEqual({ phase: 'idle' });
  });

  it('cancelSizing while idle is a no-op', () => {
    const { result } = setup();

    act(() => result.current.cancelSizing());

    expect(result.current.sizing).toEqual({ phase: 'idle' });
  });

  it('returns "ok" after an unexpected pipeline error so step 5 can show the error and Retry', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockAcquire.mockRejectedValueOnce(new Error('boom'));
    const { result } = setup();

    let outcome;
    await act(async () => {
      outcome = await result.current.startSizing();
    });

    expect(outcome).toBe('ok');
    expect(result.current.sizing).toEqual({ phase: 'idle' });
    expect(consoleError).toHaveBeenCalled();
  });

  it('a new sizing round aborts the previous one', async () => {
    const first = deferred<AcquireResult>();
    mockAcquire.mockReturnValueOnce(first.promise);
    const { result } = setup();

    let firstRun!: Promise<string>;
    act(() => {
      firstRun = result.current.startSizing();
    });
    await waitFor(() => expect(mockAcquire).toHaveBeenCalledTimes(1));
    const firstSignal = mockAcquire.mock.calls[0]![3]!.signal!;

    mockAcquire.mockResolvedValueOnce(okAcquire);
    await act(async () => {
      await result.current.startSizing();
    });
    expect(firstSignal.aborted).toBe(true);

    await act(async () => {
      first.resolve(okAcquire);
      await firstRun;
    });
    await expect(firstRun).resolves.toBe('cancelled');
  });

  it('aborts a running sizing round on unmount', async () => {
    const gate = deferred<AcquireResult>();
    mockAcquire.mockReturnValueOnce(gate.promise);
    const { result, unmount } = setup();
    act(() => {
      void result.current.startSizing();
    });
    await waitFor(() => expect(mockAcquire).toHaveBeenCalledTimes(1));
    const signal = mockAcquire.mock.calls[0]![3]!.signal!;

    unmount();

    expect(signal.aborted).toBe(true);
    await act(async () => {
      gate.resolve(okAcquire);
    });
  });
});

// ─── Generation ───────────────────────────────────────────────────────────────

describe('useReportParts — ensureParts', () => {
  it.each<[string, Partial<UseReportPartsArgs>]>([
    ['the feature is disabled', { enabled: false }],
    ['there is no limit', { limitBytes: null }],
    ['there is no report', { report: null }],
    ['there is no content', { content: null }],
  ])('returns null without generating when %s', async (_label, overrides) => {
    const { result } = setup(overrides);

    let value;
    await act(async () => {
      value = await result.current.ensureParts();
    });

    expect(value).toBeNull();
    expect(mockAcquire).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(result.current.partsStatus).toBe('idle');
  });

  it('acquires attachments, generates the parts, publishes them and reports skipped documents', async () => {
    const skipped: SkippedDocument[] = [
      {
        invoiceId: 'inv-1',
        documentId: '9',
        reason: 'footnoteFetchFailed',
        vendorName: 'ACME',
        invoiceNumber: 'N-1',
      },
    ];
    const generated = makeParts(skipped);
    mockGenerate.mockResolvedValueOnce(generated);
    const { result, onSkipped } = setup();

    let value;
    await act(async () => {
      value = await result.current.ensureParts();
    });

    expect(value).toBe(generated);
    expect(result.current.partsStatus).toBe('ready');
    expect(result.current.result).toBe(generated);
    expect(onSkipped).toHaveBeenCalledTimes(1);
    expect(onSkipped).toHaveBeenCalledWith(skipped);
    const input = mockGenerate.mock.calls[0]![0];
    expect(input.report).toBe(REPORT);
    expect(input.includedInvoiceIds).toBe(INCLUDED);
    expect(input.content).toBe(CONTENT_A);
    expect(input.hiddenColumns).toBe(HIDDEN);
    expect(input.limitBytes).toBe(1_000_000);
    expect(input.acquired).toBe(okAcquire);
    expect(input.signal).toBeInstanceOf(AbortSignal);
  });

  it('reports "preparing" while generation is running', async () => {
    const gate = deferred<GeneratedReportParts>();
    mockGenerate.mockReturnValueOnce(gate.promise);
    const { result } = setup();

    let pending!: Promise<GeneratedReportParts | null>;
    act(() => {
      pending = result.current.ensureParts();
    });
    await waitFor(() => expect(result.current.partsStatus).toBe('preparing'));

    await act(async () => {
      gate.resolve(makeParts());
      await pending;
    });
    expect(result.current.partsStatus).toBe('ready');
  });

  it('de-duplicates concurrent calls for the same key: one generation, same promise result', async () => {
    const gate = deferred<GeneratedReportParts>();
    mockGenerate.mockReturnValueOnce(gate.promise);
    const { result } = setup();

    let first!: Promise<GeneratedReportParts | null>;
    let second!: Promise<GeneratedReportParts | null>;
    act(() => {
      first = result.current.ensureParts();
    });
    await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1));
    act(() => {
      second = result.current.ensureParts();
    });

    const generated = makeParts();
    await act(async () => {
      gate.resolve(generated);
      await Promise.all([first, second]);
    });

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockAcquire).toHaveBeenCalledTimes(1);
    await expect(first).resolves.toBe(generated);
    await expect(second).resolves.toBe(generated);
  });

  it('returns the cached result for an unchanged key without regenerating', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.ensureParts();
    });

    let again;
    await act(async () => {
      again = await result.current.ensureParts();
    });

    expect(again).toBe(result.current.result);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it('turns the result stale when content changes and does not auto-regenerate', async () => {
    const { result, update } = setup();
    await act(async () => {
      await result.current.ensureParts();
    });
    expect(result.current.partsStatus).toBe('ready');

    update({ content: makeContent('B') });

    expect(result.current.partsStatus).toBe('stale');
    expect(result.current.result).not.toBeNull();
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockAcquire).toHaveBeenCalledTimes(1);
  });

  it.each<[string, () => Partial<UseReportPartsArgs>]>([
    ['the limit', () => ({ limitBytes: 2_000_000 })],
    ['the included invoices', () => ({ includedInvoiceIds: new Set(['inv-1', 'inv-2']) })],
    ['the hidden columns', () => ({ hiddenColumns: new Set<ReportColumnKey>() })],
    ['the report', () => ({ report: { id: 'other' } as unknown as SourceReportResponse })],
  ])('turns the result stale when %s changes', async (_label, changes) => {
    const { result, update } = setup();
    await act(async () => {
      await result.current.ensureParts();
    });

    update(changes());

    expect(result.current.partsStatus).toBe('stale');
  });

  it('regenerates on demand after becoming stale and becomes ready again', async () => {
    const { result, update } = setup();
    await act(async () => {
      await result.current.ensureParts();
    });
    update({ content: makeContent('B') });
    const regenerated = makeParts();
    mockGenerate.mockResolvedValueOnce(regenerated);

    await act(async () => {
      await result.current.ensureParts();
    });

    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(mockGenerate.mock.calls[1]![0].content).toEqual(makeContent('B'));
    expect(result.current.partsStatus).toBe('ready');
    expect(result.current.result).toBe(regenerated);
  });

  it('epoch guard: a run for a superseded key still returns its result but publishes nothing', async () => {
    const gate = deferred<GeneratedReportParts>();
    mockGenerate.mockReturnValueOnce(gate.promise);
    const { result, update, onSkipped } = setup();

    let pending!: Promise<GeneratedReportParts | null>;
    act(() => {
      pending = result.current.ensureParts();
    });
    await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1));

    update({ content: makeContent('B') });

    const generated = makeParts();
    let value;
    await act(async () => {
      gate.resolve(generated);
      value = await pending;
    });

    expect(value).toBe(generated);
    expect(onSkipped).not.toHaveBeenCalled();
    expect(result.current.result).toBeNull();
    expect(result.current.partsStatus).toBe('idle');
  });

  it('aborts the previous run when ensureParts is called for a new key', async () => {
    const gate = deferred<GeneratedReportParts>();
    mockGenerate.mockReturnValueOnce(gate.promise);
    const { result, update } = setup();
    act(() => {
      void result.current.ensureParts();
    });
    await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1));
    const firstSignal = mockGenerate.mock.calls[0]![0].signal!;

    update({ content: makeContent('B') });
    await act(async () => {
      await result.current.ensureParts();
    });

    expect(firstSignal.aborted).toBe(true);
    await act(async () => {
      gate.resolve(makeParts());
    });
  });

  it('aborts an in-flight generation on unmount', async () => {
    const gate = deferred<GeneratedReportParts>();
    mockGenerate.mockReturnValueOnce(gate.promise);
    const { result, unmount } = setup();
    act(() => {
      void result.current.ensureParts();
    });
    await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1));
    const signal = mockGenerate.mock.calls[0]![0].signal!;

    unmount();

    expect(signal.aborted).toBe(true);
    await act(async () => {
      gate.resolve(makeParts());
    });
  });

  it('returns null and reports "error" when attachments fail to load', async () => {
    mockAcquire.mockResolvedValueOnce({ ...okAcquire, failedFetches: [makeFailure(7)] });
    const { result, onSkipped } = setup();

    let value;
    await act(async () => {
      value = await result.current.ensureParts();
    });

    expect(value).toBeNull();
    expect(result.current.partsStatus).toBe('error');
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(onSkipped).not.toHaveBeenCalled();
  });

  it('returns null and reports "error" when generation throws, then recovers on retry', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGenerate.mockRejectedValueOnce(new Error('render failed'));
    const { result } = setup();

    let value;
    await act(async () => {
      value = await result.current.ensureParts();
    });
    expect(value).toBeNull();
    expect(result.current.partsStatus).toBe('error');

    await act(async () => {
      await result.current.ensureParts();
    });
    expect(result.current.partsStatus).toBe('ready');
  });

  it('an error for the current key wins over a stale earlier result', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result, update } = setup();
    await act(async () => {
      await result.current.ensureParts();
    });
    update({ content: makeContent('B') });
    expect(result.current.partsStatus).toBe('stale');
    mockGenerate.mockRejectedValueOnce(new Error('render failed'));

    await act(async () => {
      await result.current.ensureParts();
    });

    expect(result.current.partsStatus).toBe('error');
  });

  it('returns null without flagging an error when generation is aborted', async () => {
    mockGenerate.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    const { result } = setup();

    let value;
    await act(async () => {
      value = await result.current.ensureParts();
    });

    expect(value).toBeNull();
    expect(result.current.partsStatus).toBe('idle');
  });

  it('hides status and result when the feature gets disabled', async () => {
    const { result, update } = setup();
    await act(async () => {
      await result.current.ensureParts();
    });

    update({ enabled: false });

    expect(result.current.partsStatus).toBe('idle');
    expect(result.current.result).toBeNull();
  });
});

// ─── Cache scope ──────────────────────────────────────────────────────────────

describe('useReportParts — cache scope', () => {
  it('keeps the attachment cache across content changes within one scope', async () => {
    const seen: AttachmentCache[] = [];
    mockAcquire.mockImplementation(async (_r, _i, cache) => {
      cache.set(1, { status: 'invalid' });
      seen.push(cache);
      return okAcquire;
    });
    const { result, update } = setup();
    await act(async () => {
      await result.current.ensureParts();
    });

    update({ content: makeContent('B') });
    await act(async () => {
      await result.current.ensureParts();
    });

    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);
    expect(seen[1]!.size).toBe(1);
  });

  it('discards the cache, accepted failures and result when cacheScope changes', async () => {
    const caches: AttachmentCache[] = [];
    const sizesOnEntry: number[] = [];
    mockAcquire.mockImplementation(async (_r, _i, cache) => {
      sizesOnEntry.push(cache.size);
      cache.set(1, { status: 'invalid' });
      caches.push(cache);
      return okAcquire;
    });
    const { result, update } = setup();
    // Accept a failure in scope A.
    mockAcquire.mockResolvedValueOnce({ ...okAcquire, failedFetches: [makeFailure(11)] });
    await act(async () => {
      await result.current.startSizing();
    });
    act(() => result.current.continueWithoutFailed());
    await act(async () => {
      await result.current.ensureParts();
    });
    expect(result.current.partsStatus).toBe('ready');

    update({ cacheScope: 'claim:src-2' });

    expect(result.current.result).toBeNull();
    expect(result.current.partsStatus).toBe('idle');

    await act(async () => {
      await result.current.ensureParts();
    });

    const lastCall = mockAcquire.mock.calls[mockAcquire.mock.calls.length - 1]!;
    expect(Array.from(lastCall[3]!.skipFetch ?? [])).toEqual([]);
    expect(sizesOnEntry[sizesOnEntry.length - 1]).toBe(0);
    expect(caches[caches.length - 1]).not.toBe(caches[0]);
  });
});
