import { useState, useEffect, useCallback } from 'react';
import type { DocumentLinkWithMetadata, DocumentLinkEntityType } from '@cornerstone/shared';
import {
  listDocumentLinks,
  createDocumentLink,
  deleteDocumentLink,
  listAllLinkedDocumentIds,
} from '../lib/documentLinksApi.js';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';

export interface UseDocumentLinksResult {
  links: DocumentLinkWithMetadata[];
  isLoading: boolean;
  error: string | null;
  addLink: (paperlessDocumentId: number) => Promise<void>;
  removeLink: (linkId: string) => Promise<void>;
  refresh: () => void;
}

/**
 * Manages document links for an entity (work item, household item, or invoice).
 * Handles fetching the list, adding new links, and removing existing links.
 */
export function useDocumentLinks(
  entityType: DocumentLinkEntityType,
  entityId: string,
): UseDocumentLinksResult {
  const [links, setLinks] = useState<DocumentLinkWithMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  // Fetch document links on mount and when refresh is called
  useEffect(() => {
    let cancelled = false;

    async function loadLinks() {
      setIsLoading(true);
      setError(null);

      try {
        const fetchedLinks = await listDocumentLinks(entityType, entityId);
        if (!cancelled) {
          setLinks(fetchedLinks);
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
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadLinks();
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId, fetchCount]);

  const addLink = useCallback(
    async (paperlessDocumentId: number) => {
      await createDocumentLink({
        entityType,
        entityId,
        paperlessDocumentId,
      });
      // Refresh the list after successful creation
      setFetchCount((c) => c + 1);
    },
    [entityType, entityId],
  );

  const removeLink = useCallback(async (linkId: string) => {
    await deleteDocumentLink(linkId);
    // Optimistically remove from local state immediately for better UX
    setLinks((prev) => prev.filter((link) => link.id !== linkId));
  }, []);

  const refresh = useCallback(() => {
    setFetchCount((c) => c + 1);
  }, []);

  return {
    links,
    isLoading,
    error,
    addLink,
    removeLink,
    refresh,
  };
}

export interface UseAllLinkedDocumentIdsResult {
  ids: number[];
  isLoading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
}

/**
 * Fetches the system-wide set of linked Paperless-ngx document IDs on demand.
 * Does NOT fetch on mount — call `.fetch()` to trigger a load (e.g. on picker open).
 */
export function useAllLinkedDocumentIds(): UseAllLinkedDocumentIdsResult {
  const [ids, setIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetched = await listAllLinkedDocumentIds();
      setIds(fetched);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message ?? 'Failed to load linked document IDs.');
      } else if (err instanceof NetworkError) {
        setError('Network error: Unable to connect to the server.');
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { ids, isLoading, error, fetch };
}
