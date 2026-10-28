import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkItemLinkedHouseholdItemSummary, WorkItemMilestones } from '@cornerstone/shared';
import { toFetchFailure } from '../../lib/fetchFailure.js';
import type { FetchFailure } from '../../lib/fetchFailure.js';
import { fetchLinkedHouseholdItems } from '../../lib/householdItemWorkItemsApi.js';
import { getWorkItemMilestones } from '../../lib/workItemMilestonesApi.js';

export interface UseTaskTimingRelationsResult {
  /** null until the first response. */
  readonly milestones: WorkItemMilestones | null;
  readonly purchases: readonly WorkItemLinkedHouseholdItemSummary[] | null;
  /** Why the latest load failed; the loaded data stays while a reload fails. */
  readonly failure: FetchFailure | null;
  /** Reloads in place; clears the failure first (Retry). */
  readonly reload: () => Promise<void>;
}

/**
 * The milestones and the purchases that wait on a task, loaded together. Reloads whenever the
 * page's `revision` changes. The failure is data, so the hook never depends on the translator.
 */
export function useTaskTimingRelations(id: string, revision: number): UseTaskTimingRelationsResult {
  const [milestones, setMilestones] = useState<WorkItemMilestones | null>(null);
  const [purchases, setPurchases] = useState<readonly WorkItemLinkedHouseholdItemSummary[] | null>(
    null,
  );
  const [failure, setFailure] = useState<FetchFailure | null>(null);
  // The latest request wins; unmounting and a newer request both retire the older ones.
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const [loadedMilestones, loadedPurchases] = await Promise.all([
        getWorkItemMilestones(id),
        fetchLinkedHouseholdItems(id),
      ]);
      if (request !== requestRef.current) return;
      setMilestones(loadedMilestones);
      setPurchases(loadedPurchases);
      setFailure(null);
    } catch (err) {
      if (request === requestRef.current) setFailure(toFetchFailure(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
    return () => {
      requestRef.current += 1;
    };
  }, [load, revision]);

  const reload = useCallback(() => {
    setFailure(null);
    return load();
  }, [load]);

  return { milestones, purchases, failure, reload };
}
