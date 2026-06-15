import { useState, useEffect } from 'react';
import type { OrientationResponse, CreateOrientationRequest, UpdateOrientationRequest } from '@cornerstone/shared';
import { fetchOrientations, createOrientation, updateOrientation, deleteOrientation } from '../lib/orientationApi.js';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';

export interface UseOrientationsResult {
  orientations: OrientationResponse[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  createOrientation: (data: CreateOrientationRequest) => Promise<OrientationResponse | null>;
  updateOrientation: (id: string, data: UpdateOrientationRequest) => Promise<OrientationResponse | null>;
  deleteOrientation: (id: string) => Promise<boolean>;
}

/**
 * Manages the full CRUD lifecycle for orientations.
 * Returns loading, error, and data states following the project's hook conventions.
 * Mutation methods refetch the list after success.
 */
export function useOrientations(): UseOrientationsResult {
  const [orientations, setOrientations] = useState<OrientationResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setIsLoading(true);
      setError(null);

      try {
        const data = await fetchOrientations();
        if (!cancelled) {
          setOrientations(data.orientations);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiClientError) {
            setError(err.error.message ?? 'Failed to load orientations.');
          } else if (err instanceof NetworkError) {
            setError('Network error: Unable to connect to the server.');
          } else {
            setError('An unexpected error occurred while loading orientations.');
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

  async function handleCreate(data: CreateOrientationRequest): Promise<OrientationResponse | null> {
    try {
      const orientation = await createOrientation(data);
      refetch();
      return orientation;
    } catch {
      return null;
    }
  }

  async function handleUpdate(id: string, data: UpdateOrientationRequest): Promise<OrientationResponse | null> {
    try {
      const orientation = await updateOrientation(id, data);
      refetch();
      return orientation;
    } catch {
      return null;
    }
  }

  async function handleDelete(id: string): Promise<boolean> {
    try {
      await deleteOrientation(id);
      refetch();
      return true;
    } catch {
      return false;
    }
  }

  return {
    orientations,
    isLoading,
    error,
    refetch,
    createOrientation: handleCreate,
    updateOrientation: handleUpdate,
    deleteOrientation: handleDelete,
  };
}
