import { useEffect, useState } from 'react';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import { listDiaryEntries } from '../../lib/diaryApi.js';
import { toFetchFailure } from '../../lib/fetchFailure.js';
import type { FetchFailure } from '../../lib/fetchFailure.js';

const PAGE_SIZE = 20;

export interface UseCompanyDiaryResult {
  /** null until the first load; a reload on a new `revision` keeps the previous entries. */
  readonly items: readonly DiaryEntrySummary[] | null;
  /** All matching entries, for the tab count and "Show all"; null until loaded. */
  readonly totalItems: number | null;
  readonly failure: FetchFailure | null;
  readonly reload: () => void;
}

/**
 * The saved site diary entries that name one company (the query the Site diary page runs for
 * `?companyId=`), newest page only. Loaded with the page so the tab count is there before a visit.
 */
export function useCompanyDiary(vendorId: string, revision: number): UseCompanyDiaryResult {
  const [items, setItems] = useState<readonly DiaryEntrySummary[] | null>(null);
  const [totalItems, setTotalItems] = useState<number | null>(null);
  const [failure, setFailure] = useState<FetchFailure | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listDiaryEntries({
      vendorId,
      automatic: false,
      status: 'saved',
      page: 1,
      pageSize: PAGE_SIZE,
    })
      .then((response) => {
        if (cancelled) return;
        setItems(response.items);
        setTotalItems(response.pagination.totalItems);
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
    items,
    totalItems,
    failure,
    reload: () => {
      setFailure(null);
      setAttempt((value) => value + 1);
    },
  };
}
