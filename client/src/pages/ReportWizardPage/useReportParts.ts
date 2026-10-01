/**
 * Multi-PDF report pipeline state for the report wizard (#2161): attachment sizing (step 4),
 * part generation and staleness (step 5).
 *
 * The pipeline module (`lib/reportPdf/parts.js`) is loaded lazily via dynamic import so the
 * wizard page does not statically depend on the Paperless API client. Static imports here are
 * limited to React and types.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SourceReportResponse } from '@cornerstone/shared';
import type { ReportColumnKey, ReportContent } from '../../lib/reportContent/index.js';
import type {
  AttachmentCache,
  FailedFetch,
  GeneratedReportParts,
  SkippedDocument,
} from '../../lib/reportPdf/types.js';

/** Minimum interval between progress state updates, to avoid announcement spam. */
const PROGRESS_THROTTLE_MS = 500;

const NO_FAILURES: ReadonlySet<number> = new Set<number>();

export type SizingState =
  | { phase: 'idle' }
  | { phase: 'running'; done: number; total: number }
  | { phase: 'failed'; failures: FailedFetch[] };

export type SizingOutcome = 'ok' | 'failed' | 'cancelled';

export type PartsStatus = 'idle' | 'preparing' | 'ready' | 'stale' | 'error';

export interface UseReportPartsArgs {
  enabled: boolean;
  limitBytes: number | null;
  report: SourceReportResponse | null;
  includedInvoiceIds: ReadonlySet<string>;
  content: ReportContent | null;
  hiddenColumns: ReadonlySet<ReportColumnKey>;
  /** Changes whenever cached attachments must be discarded (e.g. `${useCase}:${sourceId}`). */
  cacheScope: string;
  onSkipped: (skipped: SkippedDocument[]) => void;
}

export interface UseReportPartsResult {
  sizing: SizingState;
  startSizing: () => Promise<SizingOutcome>;
  cancelSizing: () => void;
  continueWithoutFailed: () => void;
  partsStatus: PartsStatus;
  result: GeneratedReportParts | null;
  ensureParts: () => Promise<GeneratedReportParts | null>;
}

interface GenerationKey {
  enabled: boolean;
  limitBytes: number | null;
  report: SourceReportResponse | null;
  includedInvoiceIds: ReadonlySet<string>;
  content: ReportContent | null;
  hiddenColumns: ReadonlySet<ReportColumnKey>;
  acceptedFailures: ReadonlySet<number>;
  cacheScope: string;
}

interface ResultEntry {
  key: GenerationKey;
  result: GeneratedReportParts;
}

interface InFlight {
  key: GenerationKey;
  controller: AbortController;
  promise: Promise<GeneratedReportParts | null>;
}

function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

export function useReportParts(args: UseReportPartsArgs): UseReportPartsResult {
  const {
    enabled,
    limitBytes,
    report,
    includedInvoiceIds,
    content,
    hiddenColumns,
    cacheScope,
    onSkipped,
  } = args;

  const [sizing, setSizing] = useState<SizingState>({ phase: 'idle' });
  const [accepted, setAccepted] = useState<{ scope: string; ids: ReadonlySet<number> } | null>(
    null,
  );
  const [resultEntry, setResultEntry] = useState<ResultEntry | null>(null);
  const [preparingKey, setPreparingKey] = useState<GenerationKey | null>(null);
  const [errorKey, setErrorKey] = useState<GenerationKey | null>(null);

  const cacheRef = useRef<{ scope: string; map: AttachmentCache }>({
    scope: cacheScope,
    map: new Map(),
  });
  const sizingControllerRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef<InFlight | null>(null);
  const latestKeyRef = useRef<GenerationKey | null>(null);
  const onSkippedRef = useRef(onSkipped);

  const acceptedFailures: ReadonlySet<number> =
    accepted && accepted.scope === cacheScope ? accepted.ids : NO_FAILURES;

  const key = useMemo<GenerationKey>(
    () => ({
      enabled,
      limitBytes,
      report,
      includedInvoiceIds,
      content,
      hiddenColumns,
      acceptedFailures,
      cacheScope,
    }),
    [
      enabled,
      limitBytes,
      report,
      includedInvoiceIds,
      content,
      hiddenColumns,
      acceptedFailures,
      cacheScope,
    ],
  );

  useEffect(() => {
    latestKeyRef.current = key;
    onSkippedRef.current = onSkipped;
  }, [key, onSkipped]);

  // Abort everything on unmount.
  useEffect(() => {
    return () => {
      sizingControllerRef.current?.abort();
      inFlightRef.current?.controller.abort();
    };
  }, []);

  /** Returns the attachment cache for the current scope, discarding a stale one. */
  const getCache = useCallback((): AttachmentCache => {
    if (cacheRef.current.scope !== cacheScope) {
      cacheRef.current = { scope: cacheScope, map: new Map() };
    }
    return cacheRef.current.map;
  }, [cacheScope]);

  const startSizing = useCallback(async (): Promise<SizingOutcome> => {
    if (!enabled || !report) return 'ok';

    const controller = new AbortController();
    sizingControllerRef.current?.abort();
    sizingControllerRef.current = controller;

    try {
      const lib = await import('../../lib/reportPdf/parts.js');
      if (controller.signal.aborted) return 'cancelled';

      const cache = getCache();
      // A fresh sizing round retries previously accepted failures.
      setAccepted({ scope: cacheScope, ids: NO_FAILURES });

      const uncached = lib.countUncachedDocuments(report, includedInvoiceIds, cache);
      if (uncached === 0) return 'ok';

      // onProgress reports over all included (invoice, document) pairs, so start from that total.
      let totalPairs = 0;
      for (const invoice of report.invoices) {
        if (!includedInvoiceIds.has(invoice.invoiceId)) continue;
        totalPairs += (invoice.documents ?? []).length;
      }
      setSizing({ phase: 'running', done: 0, total: totalPairs });
      let lastEmit = 0;
      const acquired = await lib.acquireAttachments(report, includedInvoiceIds, cache, {
        signal: controller.signal,
        onProgress: (done, total) => {
          const now = Date.now();
          if (now - lastEmit >= PROGRESS_THROTTLE_MS) {
            lastEmit = now;
            setSizing({ phase: 'running', done, total });
          }
        },
      });

      if (controller.signal.aborted) {
        setSizing({ phase: 'idle' });
        return 'cancelled';
      }
      if (acquired.failedFetches.length > 0) {
        setSizing({ phase: 'failed', failures: acquired.failedFetches });
        return 'failed';
      }
      setSizing({ phase: 'idle' });
      return 'ok';
    } catch (err) {
      setSizing({ phase: 'idle' });
      if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        return 'cancelled';
      }
      // Unexpected failure: let step 5 surface it (with a retry) through ensureParts().
      console.error(err);
      return 'ok';
    } finally {
      if (sizingControllerRef.current === controller) sizingControllerRef.current = null;
    }
  }, [enabled, report, includedInvoiceIds, cacheScope, getCache]);

  const cancelSizing = useCallback(() => {
    sizingControllerRef.current?.abort();
    // Dismisses the failure card too (Back); a running round resets itself on abort.
    setSizing((prev) => (prev.phase === 'failed' ? { phase: 'idle' } : prev));
  }, []);

  const continueWithoutFailed = useCallback(() => {
    if (sizing.phase === 'failed') {
      setAccepted({ scope: cacheScope, ids: new Set(sizing.failures.map((f) => f.documentId)) });
    }
    setSizing({ phase: 'idle' });
  }, [sizing, cacheScope]);

  const ensureParts = useCallback(async (): Promise<GeneratedReportParts | null> => {
    if (!enabled || limitBytes === null || !report || !content) return null;
    if (resultEntry && resultEntry.key === key) return resultEntry.result;
    if (inFlightRef.current && inFlightRef.current.key === key) {
      return inFlightRef.current.promise;
    }

    inFlightRef.current?.controller.abort();
    const controller = new AbortController();
    const { signal } = controller;
    const isCurrent = () => latestKeyRef.current === key && !isAborted(signal);

    setPreparingKey(key);
    setErrorKey(null);

    const promise = (async (): Promise<GeneratedReportParts | null> => {
      try {
        const lib = await import('../../lib/reportPdf/parts.js');
        const acquired = await lib.acquireAttachments(report, includedInvoiceIds, getCache(), {
          skipFetch: acceptedFailures,
          signal,
        });
        if (acquired.failedFetches.length > 0) {
          if (isCurrent()) setErrorKey(key);
          return null;
        }
        const generated = await lib.generateReportParts({
          report,
          includedInvoiceIds,
          content,
          hiddenColumns,
          acquired,
          limitBytes,
          signal,
        });
        // Epoch guard: only publish state for the key that is still current. The caller still
        // receives the result, which reflects the content at the time of the click.
        if (isCurrent()) {
          setResultEntry({ key, result: generated });
          onSkippedRef.current(generated.skippedDocuments);
        }
        return generated;
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          console.error(err);
          if (isCurrent()) setErrorKey(key);
        }
        return null;
      } finally {
        if (inFlightRef.current?.controller === controller) inFlightRef.current = null;
        setPreparingKey((prev) => (prev === key ? null : prev));
      }
    })();

    inFlightRef.current = { key, controller, promise };
    return promise;
  }, [
    enabled,
    limitBytes,
    report,
    content,
    includedInvoiceIds,
    hiddenColumns,
    acceptedFailures,
    key,
    resultEntry,
    getCache,
  ]);

  let partsStatus: PartsStatus = 'idle';
  if (enabled) {
    if (preparingKey === key) partsStatus = 'preparing';
    else if (resultEntry && resultEntry.key.cacheScope === cacheScope) {
      partsStatus = resultEntry.key === key ? 'ready' : 'stale';
    } else if (errorKey === key) partsStatus = 'error';
  }
  // An error for the current key wins over a stale result (regeneration failed).
  if (enabled && errorKey === key && partsStatus === 'stale') partsStatus = 'error';

  return {
    sizing,
    startSizing,
    cancelSizing,
    continueWithoutFailed,
    partsStatus,
    result:
      enabled && resultEntry && resultEntry.key.cacheScope === cacheScope
        ? resultEntry.result
        : null,
    ensureParts,
  };
}
