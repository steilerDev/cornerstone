import { useEffect, useState } from 'react';
import type { VendorRelationsResponse } from '@cornerstone/shared';
import { toFetchFailure } from '../../lib/fetchFailure.js';
import type { FetchFailure } from '../../lib/fetchFailure.js';
import { fetchVendorRelations } from '../../lib/vendorRelationsApi.js';

export interface UseCompanyRelationsResult {
  /** null until the first load; a reload on a new `revision` keeps the previous data. */
  readonly data: VendorRelationsResponse | null;
  readonly failure: FetchFailure | null;
  readonly retry: () => void;
}

/** What one company is attached to (tasks, purchases, cost lines), reloaded with the record. */
export function useCompanyRelations(vendorId: string, revision: number): UseCompanyRelationsResult {
  const [data, setData] = useState<VendorRelationsResponse | null>(null);
  const [failure, setFailure] = useState<FetchFailure | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchVendorRelations(vendorId)
      .then((response) => {
        if (cancelled) return;
        setData(response);
        setFailure(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setFailure(toFetchFailure(err));
      });
    return () => {
      cancelled = true;
    };
  }, [vendorId, revision, attempt]);

  return {
    data,
    failure,
    retry: () => {
      setFailure(null);
      setAttempt((value) => value + 1);
    },
  };
}
