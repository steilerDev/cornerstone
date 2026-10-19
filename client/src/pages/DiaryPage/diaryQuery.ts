import { MANUAL_DIARY_ENTRY_TYPES } from '@cornerstone/shared';
import type { ManualDiaryEntryType } from '@cornerstone/shared';

/** The Site diary list's filters as they live in the URL. */
export interface DiaryFilterState {
  q: string;
  types: ManualDiaryEntryType[];
  dateFrom: string;
  dateTo: string;
  areaId: string;
  /** UI word for the company; the API parameter is `vendorId`. */
  companyId: string;
  /** `status=draft`: the feed shows drafts only. */
  drafts: boolean;
}

export const EMPTY_DIARY_FILTERS: DiaryFilterState = {
  q: '',
  types: [],
  dateFrom: '',
  dateTo: '',
  areaId: '',
  companyId: '',
  drafts: false,
};

export function readDiaryFilters(params: URLSearchParams): DiaryFilterState {
  const known = MANUAL_DIARY_ENTRY_TYPES as readonly string[];
  const types = (params.get('types') ?? '')
    .split(',')
    .filter((type) => known.includes(type)) as ManualDiaryEntryType[];
  return {
    q: params.get('q') ?? '',
    types,
    dateFrom: params.get('dateFrom') ?? '',
    dateTo: params.get('dateTo') ?? '',
    areaId: params.get('areaId') ?? '',
    companyId: params.get('companyId') ?? '',
    // ?status=saved (old Drafts-chip links) behaves like no status.
    drafts: params.get('status') === 'draft',
  };
}

/** Merges a patch into the previous params; empty values drop their key, `page` is dropped. */
export function writeDiaryFilters(
  prev: URLSearchParams,
  patch: Partial<DiaryFilterState>,
): URLSearchParams {
  const next = new URLSearchParams(prev);
  const setOrDelete = (key: string, value: string) => {
    if (value) next.set(key, value);
    else next.delete(key);
  };
  if (patch.q !== undefined) setOrDelete('q', patch.q);
  if (patch.types !== undefined) setOrDelete('types', patch.types.join(','));
  if (patch.dateFrom !== undefined) setOrDelete('dateFrom', patch.dateFrom);
  if (patch.dateTo !== undefined) setOrDelete('dateTo', patch.dateTo);
  if (patch.areaId !== undefined) setOrDelete('areaId', patch.areaId);
  if (patch.companyId !== undefined) setOrDelete('companyId', patch.companyId);
  if (patch.drafts !== undefined) setOrDelete('status', patch.drafts ? 'draft' : '');
  next.delete('page');
  return next;
}

/** Filters shown as chips and counted on the button (the search text is not one). */
export function activeFilterCount(state: DiaryFilterState): number {
  return (
    state.types.length +
    (state.areaId ? 1 : 0) +
    (state.companyId ? 1 : 0) +
    (state.dateFrom ? 1 : 0) +
    (state.dateTo ? 1 : 0) +
    (state.drafts ? 1 : 0)
  );
}

/** Whether anything narrows the list, the search text included. */
export function hasAnyFilter(state: DiaryFilterState): boolean {
  return Boolean(state.q) || activeFilterCount(state) > 0;
}
