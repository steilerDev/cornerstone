import { useState, useEffect, useCallback } from 'react';
import type {
  DocumentLinkWithMetadata,
  DocumentLinkEntityType,
  AttachmentType,
} from '@cornerstone/shared';
import {
  listDocumentLinks,
  createDocumentLink,
  deleteDocumentLink,
  listAllLinkedDocumentIds,
  updateDocumentLinkAttachmentType,
} from '../lib/documentLinksApi.js';
import { useTranslation } from 'react-i18next';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';
import { translateApiError } from '../lib/errorTranslation.js';

export interface UseDocumentLinksResult {
  links: DocumentLinkWithMetadata[];
  isLoading: boolean;
  error: string | null;
  addLink: (paperlessDocumentId: number, attachmentType?: AttachmentType | null) => Promise<void>;
  removeLink: (linkId: string) => Promise<void>;
  updateAttachmentType: (linkId: string, attachmentType: AttachmentType | null) => Promise<void>;
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
  const { t } = useTranslation('documents');
  const { t: tErrors } = useTranslation('errors');
  const { t: tCommon } = useTranslation('common');
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
            setError(translateApiError(err.error.code, tErrors));
          } else if (err instanceof NetworkError) {
            setError(tCommon('requestErrors.network'));
          } else {
            setError(tCommon('requestErrors.unexpected'));
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
  }, [entityType, entityId, fetchCount, t, tErrors, tCommon]);

  const addLink = useCallback(
    async (paperlessDocumentId: number, attachmentType?: AttachmentType | null) => {
      await createDocumentLink({
        entityType,
        entityId,
        paperlessDocumentId,
        attachmentType: attachmentType ?? undefined,
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

  const updateAttachmentType = useCallback(
    async (linkId: string, attachmentType: AttachmentType | null) => {
      const updated = await updateDocumentLinkAttachmentType(linkId, attachmentType);
      // Optimistically update local state
      setLinks((prev) =>
        prev.map((link) =>
          link.id === linkId ? { ...link, attachmentType: updated.attachmentType } : link,
        ),
      );
    },
    [],
  );

  const refresh = useCallback(() => {
    setFetchCount((c) => c + 1);
  }, []);

  return {
    links,
    isLoading,
    error,
    addLink,
    removeLink,
    updateAttachmentType,
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
  const { t: tErrors } = useTranslation('errors');
  const { t: tCommon } = useTranslation('common');
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
        setError(translateApiError(err.error.code, tErrors));
      } else if (err instanceof NetworkError) {
        setError(tCommon('requestErrors.network'));
      } else {
        setError(tCommon('requestErrors.unexpected'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [tErrors, tCommon]);

  return { ids, isLoading, error, fetch };
}
