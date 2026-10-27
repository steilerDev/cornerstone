import { get, post } from './apiClient.js';
import type {
  FinancingResponse,
  GrantCoveredItemsResponse,
  GrantItemRef,
  LinkGrantItemsRequest,
} from '@cornerstone/shared';

/**
 * Fetches the Financing page data: every funding source and grant with the money service's
 * figures.
 */
export function fetchFinancing(signal?: AbortSignal): Promise<FinancingResponse> {
  return get<FinancingResponse>('/budget/financing', { signal });
}

/**
 * Fetches the tasks and purchases a grant covers, each with its computed share.
 */
export function fetchGrantItems(grantId: string): Promise<GrantCoveredItemsResponse> {
  return get<GrantCoveredItemsResponse>(`/subsidy-programs/${grantId}/items`);
}

/**
 * Links tasks and purchases to a grant in one atomic request; resolves with the full covered
 * list.
 */
export function linkGrantItems(
  grantId: string,
  items: readonly GrantItemRef[],
): Promise<GrantCoveredItemsResponse> {
  const body: LinkGrantItemsRequest = { items: [...items] };
  return post<GrantCoveredItemsResponse>(`/subsidy-programs/${grantId}/items`, body);
}
