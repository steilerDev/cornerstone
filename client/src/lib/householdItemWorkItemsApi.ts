import { get } from './apiClient.js';
import type { WorkItemLinkedHouseholdItemSummary } from '@cornerstone/shared';

/**
 * Fetches all household items that depend on a work item (via the scheduling engine).
 */
export function fetchLinkedHouseholdItems(
  workItemId: string,
): Promise<WorkItemLinkedHouseholdItemSummary[]> {
  return get<{ householdItems: WorkItemLinkedHouseholdItemSummary[] }>(
    `/work-items/${workItemId}/dependent-household-items`,
  ).then((r) => r.householdItems);
}
