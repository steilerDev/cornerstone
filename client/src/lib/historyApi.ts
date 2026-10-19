import { get } from './apiClient.js';
import type { HistoryListResponse, HistoryQuery } from '@cornerstone/shared';

/** Fetches one page of the History feed (GET /api/history, contract 17). */
export function listHistory(
  query: HistoryQuery,
  signal?: AbortSignal,
): Promise<HistoryListResponse> {
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
  if (query.type) params.set('type', query.type);
  if (query.entityType) params.set('entityType', query.entityType);
  if (query.entityId) params.set('entityId', query.entityId);
  if (query.batchId) params.set('batchId', query.batchId);
  if (query.dateFrom) params.set('dateFrom', query.dateFrom);
  if (query.dateTo) params.set('dateTo', query.dateTo);
  if (query.q) params.set('q', query.q);
  if (query.includeDiary) params.set('includeDiary', 'true');
  if (query.showHidden) params.set('showHidden', 'true');
  if (query.includeHidden) params.set('includeHidden', 'true');

  const queryString = params.toString();
  return get<HistoryListResponse>(queryString ? `/history?${queryString}` : '/history', {
    signal,
  });
}
