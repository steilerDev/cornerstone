import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import type { AreaResponse, CreateAreaRequest, UpdateAreaRequest } from '@cornerstone/shared';
import { fetchAreas, createArea, updateArea, deleteArea } from '../lib/areasApi.js';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';
import { translateApiError } from '../lib/errorTranslation.js';

export interface UseAreasResult {
  areas: AreaResponse[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  createArea: (data: CreateAreaRequest) => Promise<AreaResponse>;
  updateArea: (id: string, data: UpdateAreaRequest) => Promise<AreaResponse>;
  deleteArea: (id: string) => Promise<void>;
}

/**
 * Manages the full CRUD lifecycle for areas.
 * Returns loading, error, and data states following the project's hook conventions.
 * Mutation methods refetch the list after success and throw ApiClientError on failure.
 */
export function useAreas(): UseAreasResult {
  const { t } = useTranslation('settings');
  const { t: tErrors } = useTranslation('errors');
  const { t: tCommon } = useTranslation('common');
  const [areas, setAreas] = useState<AreaResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setIsLoading(true);
      setError(null);

      try {
        const data = await fetchAreas();
        if (!cancelled) {
          setAreas(data.areas);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiClientError) {
            setError(translateApiError(err.error.code, tErrors));
          } else if (err instanceof NetworkError) {
            setError(tCommon('requestErrors.network'));
          } else {
            setError(t('manage.areas.loadError'));
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchData();

    return () => {
      cancelled = true;
    };
  }, [fetchCount, t, tErrors, tCommon]);

  function refetch() {
    setFetchCount((c) => c + 1);
  }

  async function handleCreate(data: CreateAreaRequest): Promise<AreaResponse> {
    const area = await createArea(data);
    refetch();
    return area;
  }

  async function handleUpdate(id: string, data: UpdateAreaRequest): Promise<AreaResponse> {
    const area = await updateArea(id, data);
    refetch();
    return area;
  }

  async function handleDelete(id: string): Promise<void> {
    await deleteArea(id);
    refetch();
  }

  return {
    areas,
    isLoading,
    error,
    refetch,
    createArea: handleCreate,
    updateArea: handleUpdate,
    deleteArea: handleDelete,
  };
}
