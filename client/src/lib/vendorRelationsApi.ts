import { get } from './apiClient.js';
import type { RequestOptions } from './apiClient.js';
import type { VendorRelationsResponse } from '@cornerstone/shared';

/** Fetches what one company is attached to: its tasks, purchases and cost lines (contract 13). */
export function fetchVendorRelations(
  id: string,
  options?: RequestOptions,
): Promise<VendorRelationsResponse> {
  return get<VendorRelationsResponse>(`/vendors/${id}/relations`, options);
}
