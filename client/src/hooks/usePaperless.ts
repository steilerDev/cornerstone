import { useState, useEffect, useCallback } from 'react';
import type {
  PaperlessStatusResponse,
  PaperlessDocumentSearchResult,
  PaperlessTag,
  PaginationMeta,
} from '@cornerstone/shared';
import {
  getPaperlessStatus,
  listPaperlessDocuments,
  listPaperlessTags,
} from '../lib/paperlessApi.js';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';

export interface UsePaperlessResult {
  status: PaperlessStatusResponse | null;
  documents: PaperlessDocumentSearchResult[];
  tags: PaperlessTag[];
  pagination: PaginationMeta | null;
  isLoading: boolean;
  error: string | null;
  query: string;
  selectedTags: number[];
  tagCountMap: Map<number, number>;
  search: (q: string) => void;
  toggleTag: (tagId: number) => void;
  setPage: (page: number) => void;
  refresh: () => void;
}

/**
 * Manages Paperless-ngx connection status, document list, tags, search, and pagination.
 *
 * Phase 1: fetches status on mount.
 * Phase 2: fetches documents + tags when status is configured + reachable, or when
 * query/selectedTags/page/fetchCount changes.
 */
export function usePaperless(): UsePaperlessResult {
  const [status, setStatus] = useState<PaperlessStatusResponse | null>(null);
  const [documents, setDocuments] = useState<PaperlessDocumentSearchResult[]>([]);
  const [tags, setTags] = useState<PaperlessTag[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTagsState] = useState<number[]>([]);
  const [page, setPageState] = useState(1);
  const [fetchCount, setFetchCount] = useState(0);
  const [tagCountMap, setTagCountMap] = useState<Map<number, number>>(new Map());

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

  // Phase 2: fetch documents + tags when status changes or fetchCount triggers
  useEffect(() => {
    if (status === null) return;

    if (!status.configured || !status.reachable) {
      setIsLoading(false);
      setTagCountMap(new Map());
      return;
    }

    let cancelled = false;

    async function loadData() {
      setIsLoading(true);
      setError(null);

      try {
        const tagsStr = selectedTags.length > 0 ? selectedTags.join(',') : undefined;
        const [docsResponse, tagsResponse] = await Promise.all([
          listPaperlessDocuments({ query: query || undefined, tags: tagsStr, page }),
          listPaperlessTags(),
        ]);

        if (!cancelled) {
          setDocuments(docsResponse.documents);
          setPagination(docsResponse.pagination);
          setTags(tagsResponse.tags);

          // Compute tag count map from returned documents
          const countMap = new Map<number, number>();
          for (const doc of docsResponse.documents) {
            for (const tag of doc.tags) {
              countMap.set(tag.id, (countMap.get(tag.id) ?? 0) + 1);
            }
          }
          setTagCountMap(countMap);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiClientError) {
            setError(err.error.message ?? 'Failed to load documents.');
          } else if (err instanceof NetworkError) {
            setError('Network error: Unable to connect to the server.');
          } else {
            setError('An unexpected error occurred.');
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [status, query, selectedTags, page, fetchCount]);

  const search = useCallback((q: string) => {
    setQuery(q);
    setPageState(1);
  }, []);

  const toggleTag = useCallback((tagId: number) => {
    setSelectedTagsState((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
    setPageState(1);
  }, []);

  const setPage = useCallback((p: number) => {
    setPageState(p);
  }, []);

  const refresh = useCallback(() => {
    setFetchCount((c) => c + 1);
  }, []);

  return {
    status,
    documents,
    tags,
    pagination,
    isLoading,
    error,
    query,
    selectedTags,
    tagCountMap,
    search,
    toggleTag,
    setPage,
    refresh,
  };
}
