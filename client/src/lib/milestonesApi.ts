import { get, post, patch, del } from './apiClient.js';
import type {
  MilestoneSummary,
  MilestoneDetail,
  MilestoneListResponse,
  CreateMilestoneRequest,
  UpdateMilestoneRequest,
  LinkWorkItemRequest,
  MilestoneWorkItemLinkResponse,
} from '@cornerstone/shared';

/**
 * Fetches the list of all milestones.
 */
export function listMilestones(): Promise<MilestoneSummary[]> {
  return get<MilestoneListResponse>('/milestones').then((r) => r.milestones);
}

/**
 * Fetches a single milestone by ID, including linked work items.
 */
export function getMilestone(id: number): Promise<MilestoneDetail> {
  return get<MilestoneDetail>(`/milestones/${id}`);
}

/**
 * Creates a new milestone.
 */
export function createMilestone(data: CreateMilestoneRequest): Promise<MilestoneSummary> {
  return post<MilestoneSummary>('/milestones', data);
}

/**
 * Updates an existing milestone.
 */
export function updateMilestone(
  id: number,
  data: UpdateMilestoneRequest,
): Promise<MilestoneSummary> {
  return patch<MilestoneSummary>(`/milestones/${id}`, data);
}

/**
 * Deletes a milestone.
 */
export function deleteMilestone(id: number): Promise<void> {
  return del<void>(`/milestones/${id}`);
}

/**
 * Links a work item to a milestone.
 */
export function linkWorkItem(
  milestoneId: number,
  workItemId: string,
): Promise<MilestoneWorkItemLinkResponse> {
  const body: LinkWorkItemRequest = { workItemId };
  return post<MilestoneWorkItemLinkResponse>(`/milestones/${milestoneId}/work-items`, body);
}

/**
 * Unlinks a work item from a milestone.
 */
export function unlinkWorkItem(milestoneId: number, workItemId: string): Promise<void> {
  return del<void>(`/milestones/${milestoneId}/work-items/${workItemId}`);
}

/**
 * Adds a work item as a dependent of a milestone.
 * The work item will require this milestone to complete before it can start.
 */
export function addDependentWorkItem(
  milestoneId: number,
  workItemId: string,
): Promise<{ dependentWorkItems: { id: string; title: string }[] }> {
  return post<{ dependentWorkItems: { id: string; title: string }[] }>(
    `/milestones/${milestoneId}/dependents/${workItemId}`,
    {},
  );
}

/**
 * Removes a work item from the dependents of a milestone.
 */
export function removeDependentWorkItem(milestoneId: number, workItemId: string): Promise<void> {
  return del<void>(`/milestones/${milestoneId}/dependents/${workItemId}`);
}
