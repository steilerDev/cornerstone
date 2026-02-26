import { useState, useEffect } from 'react';
import type { MilestoneSummary } from '@cornerstone/shared';
import {
  listMilestones,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  linkWorkItem,
  unlinkWorkItem,
} from '../lib/milestonesApi.js';
import type { CreateMilestoneRequest, UpdateMilestoneRequest } from '@cornerstone/shared';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';

export interface UseMilestonesResult {
  milestones: MilestoneSummary[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  createMilestone: (data: CreateMilestoneRequest) => Promise<MilestoneSummary | null>;
  updateMilestone: (id: number, data: UpdateMilestoneRequest) => Promise<MilestoneSummary | null>;
  deleteMilestone: (id: number) => Promise<boolean>;
  linkWorkItem: (milestoneId: number, workItemId: string) => Promise<boolean>;
  unlinkWorkItem: (milestoneId: number, workItemId: string) => Promise<boolean>;
}

/**
 * Manages the full CRUD lifecycle for milestones.
 * Returns loading, error, and data states following the project's hook conventions.
 * Mutation methods refetch the list after success.
 */
export function useMilestones(): UseMilestonesResult {
  const [milestones, setMilestones] = useState<MilestoneSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setIsLoading(true);
      setError(null);

      try {
        const data = await listMilestones();
        if (!cancelled) {
          setMilestones(data);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiClientError) {
            setError(err.error.message ?? 'Failed to load milestones.');
          } else if (err instanceof NetworkError) {
            setError('Network error: Unable to connect to the server.');
          } else {
            setError('An unexpected error occurred while loading milestones.');
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

  async function handleCreate(data: CreateMilestoneRequest): Promise<MilestoneSummary | null> {
    try {
      const milestone = await createMilestone(data);
      refetch();
      return milestone;
    } catch {
      return null;
    }
  }

  async function handleUpdate(
    id: number,
    data: UpdateMilestoneRequest,
  ): Promise<MilestoneSummary | null> {
    try {
      const milestone = await updateMilestone(id, data);
      refetch();
      return milestone;
    } catch {
      return null;
    }
  }

  async function handleDelete(id: number): Promise<boolean> {
    try {
      await deleteMilestone(id);
      refetch();
      return true;
    } catch {
      return false;
    }
  }

  async function handleLinkWorkItem(milestoneId: number, workItemId: string): Promise<boolean> {
    try {
      await linkWorkItem(milestoneId, workItemId);
      refetch();
      return true;
    } catch {
      return false;
    }
  }

  async function handleUnlinkWorkItem(milestoneId: number, workItemId: string): Promise<boolean> {
    try {
      await unlinkWorkItem(milestoneId, workItemId);
      refetch();
      return true;
    } catch {
      return false;
    }
  }

  return {
    milestones,
    isLoading,
    error,
    refetch,
    createMilestone: handleCreate,
    updateMilestone: handleUpdate,
    deleteMilestone: handleDelete,
    linkWorkItem: handleLinkWorkItem,
    unlinkWorkItem: handleUnlinkWorkItem,
  };
}
