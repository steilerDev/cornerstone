import { get, post, del } from './apiClient.js';
import type { WorkItemSummary, WorkItemLinkedHouseholdItemSummary } from '@cornerstone/shared';

/**
 * Fetches all work items linked to a household item.
 */
export function fetchLinkedWorkItems(householdItemId: string): Promise<WorkItemSummary[]> {
  return get<{ workItems: WorkItemSummary[] }>(
    `/household-items/${householdItemId}/work-items`,
  ).then((r) => r.workItems);
}

/**
 * Links a work item to a household item.
 */
export function linkWorkItemToHouseholdItem(
  householdItemId: string,
  workItemId: string,
): Promise<WorkItemSummary> {
  return post<{ workItem: WorkItemSummary }>(`/household-items/${householdItemId}/work-items`, {
    workItemId,
  }).then((r) => r.workItem);
}

/**
 * Unlinks a work item from a household item.
 */
export function unlinkWorkItemFromHouseholdItem(
  householdItemId: string,
  workItemId: string,
): Promise<void> {
  return del<void>(`/household-items/${householdItemId}/work-items/${workItemId}`);
}

/**
 * Fetches all household items linked to a work item.
 */
export function fetchLinkedHouseholdItems(
  workItemId: string,
): Promise<WorkItemLinkedHouseholdItemSummary[]> {
  return get<{ householdItems: WorkItemLinkedHouseholdItemSummary[] }>(
    `/work-items/${workItemId}/household-items`,
  ).then((r) => r.householdItems);
}
