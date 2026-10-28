import { useEffect, useState } from 'react';
import type {
  DiaryEntryListQuery,
  DiaryEntrySummary,
  WorkItemPageDetail,
} from '@cornerstone/shared';
import { listDiaryEntries } from '../../lib/diaryApi.js';
import { toFetchFailure } from '../../lib/fetchFailure.js';
import type { FetchFailure } from '../../lib/fetchFailure.js';
import { barDates } from '../../lib/scheduleDates.js';

const PAGE_SIZE = 20;
const BASE_QUERY: DiaryEntryListQuery = {
  automatic: false,
  status: 'saved',
  page: 1,
  pageSize: PAGE_SIZE,
};

export interface UseTaskDiaryResult {
  readonly primary: {
    readonly items: readonly DiaryEntrySummary[] | null;
    readonly totalItems: number | null;
    readonly scope: 'company' | 'task' | 'none';
  };
  /** null when block 2 does not apply (no company, or no area or no window). */
  readonly other: { readonly items: readonly DiaryEntrySummary[] | null } | null;
  readonly failure: FetchFailure | null;
  readonly reload: () => void;
  /** Tab count: primary.totalItems (null until loaded; 0 for scope 'none'). */
  readonly count: number | null;
}

interface Loaded {
  readonly items: readonly DiaryEntrySummary[];
  readonly totalItems: number;
  readonly other: readonly DiaryEntrySummary[] | null;
}

/**
 * The saved site diary entries of a task. With an assigned company: that company's entries within
 * the task's shown dates, plus (when the task has an area) the photo-tagged entries of that area
 * in the same dates that the first block does not hold. Without a company: the area's entries in
 * the dates; with neither, nothing is requested. A reload on a new `revision` keeps the previous
 * entries on screen.
 */
export function useTaskDiary(task: WorkItemPageDetail, revision: number): UseTaskDiaryResult {
  const taskId = task.id;
  const vendorId = task.assignedVendor?.id ?? null;
  const areaId = task.area?.id ?? null;
  const { start, end } = barDates(task);
  const dates = start !== null && end !== null ? { dateFrom: start, dateTo: end } : null;
  const from = dates?.dateFrom ?? null;
  const to = dates?.dateTo ?? null;
  const scope: UseTaskDiaryResult['primary']['scope'] =
    vendorId !== null ? 'company' : areaId !== null && dates !== null ? 'task' : 'none';
  const hasOther = scope === 'company' && areaId !== null && dates !== null;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failure, setFailure] = useState<FetchFailure | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (scope === 'none') return undefined;
    const range = from !== null && to !== null ? { dateFrom: from, dateTo: to } : {};
    const primaryQuery: DiaryEntryListQuery =
      vendorId !== null
        ? { ...BASE_QUERY, vendorId, ...range }
        : // No company and not 'none': the task has an area.
          { ...BASE_QUERY, areaId: areaId as string, ...range };
    const otherQuery: DiaryEntryListQuery | null = hasOther
      ? { ...BASE_QUERY, areaId, ...range }
      : null;
    let cancelled = false;
    Promise.all([
      listDiaryEntries(primaryQuery),
      otherQuery === null ? Promise.resolve(null) : listDiaryEntries(otherQuery),
    ])
      .then(([primary, other]) => {
        if (cancelled) return;
        const seen = new Set(primary.items.map((entry) => entry.id));
        setLoaded({
          items: primary.items,
          totalItems: primary.pagination.totalItems,
          other: other === null ? null : other.items.filter((entry) => !seen.has(entry.id)),
        });
        setFailure(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setFailure(toFetchFailure(err));
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, scope, hasOther, vendorId, areaId, from, to, revision, attempt]);

  const items = scope === 'none' ? [] : (loaded?.items ?? null);
  const totalItems = scope === 'none' ? 0 : (loaded?.totalItems ?? null);

  return {
    primary: { items, totalItems, scope },
    other: hasOther ? { items: loaded?.other ?? null } : null,
    failure,
    reload: () => {
      setFailure(null);
      setAttempt((value) => value + 1);
    },
    count: totalItems,
  };
}
