import { useState, useEffect } from 'react';
import type { AreaResponse, CreateAreaRequest, UpdateAreaRequest } from '@cornerstone/shared';
import { fetchAreas, createArea, updateArea, deleteArea } from '../lib/areasApi.js';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';

export interface UseAreasResult {
  areas: AreaResponse[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  createArea: (data: CreateAreaRequest) => Promise<AreaResponse | null>;
  updateArea: (id: string, data: UpdateAreaRequest) => Promise<AreaResponse | null>;
  deleteArea: (id: string) => Promise<boolean>;
}

/**
 * Manages the full CRUD lifecycle for areas.
 * Returns loading, error, and data states following the project's hook conventions.
 * Mutation methods refetch the list after success.
 */
export function useAreas(): UseAreasResult {
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
            setError(err.error.message ?? 'Failed to load areas.');
          } else if (err instanceof NetworkError) {
            setError('Network error: Unable to connect to the server.');
          } else {
            setError('An unexpected error occurred while loading areas.');
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
  }, [fetchCount]);

  function refetch() {
    setFetchCount((c) => c + 1);
  }

  async function handleCreate(data: CreateAreaRequest): Promise<AreaResponse | null> {
    try {
      const area = await createArea(data);
      refetch();
      return area;
    } catch {
      return null;
    }
  }

  async function handleUpdate(id: string, data: UpdateAreaRequest): Promise<AreaResponse | null> {
    try {
      const area = await updateArea(id, data);
      refetch();
      return area;
    } catch {
      return null;
    }
  }

  async function handleDelete(id: string): Promise<boolean> {
    try {
      await deleteArea(id);
      refetch();
      return true;
    } catch {
      return false;
    }
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
