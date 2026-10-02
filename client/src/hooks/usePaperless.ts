import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  PaperlessStatusResponse,
  PaperlessDocumentSearchResult,
  PaperlessTag,
} from '@cornerstone/shared';
import {
  getPaperlessStatus,
  listPaperlessDocuments,
  listPaperlessTags,
} from '../lib/paperlessApi.js';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';
import { translateApiError } from '../lib/errorTranslation.js';
import { useInfiniteScroll } from './useInfiniteScroll.js';
import type { InfiniteScrollStatus } from './useInfiniteScroll.js';

/** Documents per batch (matches the server default page size). */
export const PAPERLESS_DOCUMENT_BATCH_SIZE = 25;

export interface UsePaperlessOptions {
  correspondentId?: number | null;
  /** IntersectionObserver root for the document list sentinel (null = viewport). */
  scrollRoot?: Element | null;
}

export interface UsePaperlessResult {
  status: PaperlessStatusResponse | null;
  /** Accumulated documents across all loaded batches, de-duplicated by id (first occurrence wins). */
  documents: PaperlessDocumentSearchResult[];
  tags: PaperlessTag[];
  listStatus: InfiniteScrollStatus;
  hasMore: boolean;
  lastBatchCount: number;
  fetchSequence: number;
  sentinelRef: (node: HTMLDivElement | null) => void;
  loadMore: () => void;
  retry: () => void;
  /** Message of the most recent current (non-stale) failed batch; null otherwise. */
  error: string | null;
  query: string;
  selectedTags: number[];
  tagCountMap: Map<number, number>;
  /** Changes whenever the list resets to a fresh first batch. */
  resetKey: string;
  search: (q: string) => void;
  toggleTag: (tagId: number) => void;
  setCorrespondent: (id: number | null) => void;
  refresh: () => void;
}

/**
 * Manages Paperless-ngx connection status, the infinitely-scrolled document list, tags and search.
 *
 * Phase 1: fetches status on mount.
 * Phase 2 (once Paperless is configured + reachable):
 *  - tags are fetched in their own effect (a tags failure is non-fatal and does not affect the list);
 *  - documents are loaded in batches via `useInfiniteScroll`, which resets to a fresh first batch
 *    whenever the query, selected tags, correspondent or refresh counter change.
 */
export function usePaperless(options?: UsePaperlessOptions): UsePaperlessResult {
  const { t } = useTranslation('documents');
  const { t: tErrors } = useTranslation('errors');
  const [status, setStatus] = useState<PaperlessStatusResponse | null>(null);
  const [tags, setTags] = useState<PaperlessTag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [refreshCount, setRefreshCount] = useState(0);
  const [correspondentId, setCorrespondentId] = useState<number | null>(
    options?.correspondentId ?? null,
  );

  // Phase 1: fetch status on mount
  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const s = await getPaperlessStatus();
        if (!cancelled) setStatus(s);
      } catch {
        if (!cancelled) {
          setStatus({
            configured: false,
            reachable: false,
            error: 'Failed to check status',
            paperlessUrl: null,
            filterTag: null,
          });
        }
      }
    }

    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = status !== null && status.configured && status.reachable;

  // Phase 2a: tags (independent of the document list; failure is non-fatal)
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    async function loadTags() {
      try {
        const res = await listPaperlessTags();
        if (!cancelled) setTags(res.tags);
      } catch {
        if (!cancelled) setTags([]);
      }
    }

    void loadTags();
    return () => {
      cancelled = true;
    };
  }, [ready, refreshCount]);

  const resetKey = `${query}|${[...selectedTags].sort((a, b) => a - b).join(',')}|${correspondentId ?? ''}|${refreshCount}`;

  // Pure: no setState here — fetchPage side effects are not epoch-guarded.
  const fetchPage = useCallback(
    async (page: number) => {
      const res = await listPaperlessDocuments({
        query: query || undefined,
        tags: selectedTags.length > 0 ? selectedTags.join(',') : undefined,
        correspondent: correspondentId ?? undefined,
        page,
        pageSize: PAPERLESS_DOCUMENT_BATCH_SIZE,
      });
      return {
        items: res.documents,
        hasMore: res.documents.length > 0 && page < res.pagination.totalPages,
      };
    },
    [query, selectedTags, correspondentId],
  );

  const errorMessage = useCallback(
    (err: unknown): string => {
      if (err instanceof ApiClientError) {
        return translateApiError(err.error.code, tErrors);
      }
      if (err instanceof NetworkError) return t('browser.loadErrorNetwork');
      return t('browser.loadErrorUnexpected');
    },
    [t, tErrors],
  );

  const list = useInfiniteScroll<PaperlessDocumentSearchResult>({
    fetchPage,
    resetKey,
    enabled: ready,
    root: options?.scrollRoot ?? null,
    onPageApplied: () => setError(null),
    onPageFailed: (err) => setError(errorMessage(err)),
  });

  // Defence in depth against duplicates across batches (first occurrence wins).
  const documents = useMemo(() => {
    const seen = new Set<number>();
    const result: PaperlessDocumentSearchResult[] = [];
    for (const doc of list.items) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);
      result.push(doc);
    }
    return result;
  }, [list.items]);

  // Tag counts across the loaded documents
  const tagCountMap = useMemo(() => {
    const countMap = new Map<number, number>();
    for (const doc of documents) {
      for (const tag of doc.tags) {
        countMap.set(tag.id, (countMap.get(tag.id) ?? 0) + 1);
      }
    }
    return countMap;
  }, [documents]);

  const search = useCallback((q: string) => {
    setQuery(q);
  }, []);

  const toggleTag = useCallback((tagId: number) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  }, []);

  const setCorrespondent = useCallback((id: number | null) => {
    setCorrespondentId(id);
  }, []);

  const refresh = useCallback(() => {
    setRefreshCount((c) => c + 1);
  }, []);

  return {
    status,
    documents,
    tags,
    listStatus: list.status,
    hasMore: list.hasMore,
    lastBatchCount: list.lastBatchCount,
    fetchSequence: list.fetchSequence,
    sentinelRef: list.sentinelRef,
    loadMore: list.loadMore,
    retry: list.retry,
    error,
    query,
    selectedTags,
    tagCountMap,
    resetKey,
    search,
    toggleTag,
    setCorrespondent,
    refresh,
  };
}
