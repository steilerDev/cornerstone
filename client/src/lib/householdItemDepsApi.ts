import { get, post, del } from './apiClient.js';
import type {
  HouseholdItemDepDetail,
  HouseholdItemDepsResponse,
  CreateHouseholdItemDepRequest,
} from '@cornerstone/shared';

/**
 * Fetches all dependencies for a household item.
 */
export function fetchHouseholdItemDeps(householdItemId: string): Promise<HouseholdItemDepDetail[]> {
  return get<HouseholdItemDepsResponse>(`/household-items/${householdItemId}/dependencies`).then(
    (r) => r.dependencies,
  );
}

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
): Promise<void> {
  return del<void>(
    `/household-items/${householdItemId}/dependencies/${predecessorType}/${predecessorId}`,
  );
}
