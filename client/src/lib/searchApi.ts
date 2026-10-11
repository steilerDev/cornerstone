import { get } from './apiClient.js';
import type { SearchResponse, SearchResultType } from '@cornerstone/shared';

export interface SearchEverywhereParams {
  q: string;
  /** Restrict the search to these result types; omitted or empty searches all types. */
  types?: readonly SearchResultType[];
  limit?: number;
}

/** Global search across every entity type (GET /api/search). */
export function searchEverywhere(
  params: SearchEverywhereParams,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const search = new URLSearchParams();
  search.set('q', params.q);
  if (params.types !== undefined && params.types.length > 0) {
    search.set('types', params.types.join(','));
  }
  if (params.limit !== undefined) {
    search.set('limit', String(params.limit));
  }
  return get<SearchResponse>(`/search?${search.toString()}`, { signal });
}
