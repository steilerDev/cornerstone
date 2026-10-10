import { get } from './apiClient.js';
import type { DeleteImpactEntityType, DeleteImpactResponse } from '@cornerstone/shared';

/** What a successful DELETE of the entity would also change (zero counts are omitted). */
export function fetchDeleteImpact(
  entityType: DeleteImpactEntityType,
  id: string | number,
): Promise<DeleteImpactResponse> {
  return get<DeleteImpactResponse>(
    `/delete-impact/${encodeURIComponent(entityType)}/${encodeURIComponent(String(id))}`,
  );
}
