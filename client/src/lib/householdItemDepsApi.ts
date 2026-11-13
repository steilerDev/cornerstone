import { post, del } from './apiClient.js';
import type { UndoableDeleteResponse } from '@cornerstone/shared';
import type { HouseholdItemDepDetail, CreateHouseholdItemDepRequest } from '@cornerstone/shared';

/**
 * Creates a new dependency for a household item.
 */
export function createHouseholdItemDep(
  householdItemId: string,
  data: CreateHouseholdItemDepRequest,
): Promise<HouseholdItemDepDetail> {
  return post<{ dependency: HouseholdItemDepDetail }>(
    `/household-items/${householdItemId}/dependencies`,
    data,
  ).then((r) => r.dependency);
}

/**
 * Deletes a dependency for a household item.
 */
export function deleteHouseholdItemDep(
  householdItemId: string,
  predecessorType: 'work_item' | 'milestone',
  predecessorId: string,
): Promise<UndoableDeleteResponse> {
  return del<UndoableDeleteResponse>(
    `/household-items/${householdItemId}/dependencies/${predecessorType}/${predecessorId}`,
  );
}
