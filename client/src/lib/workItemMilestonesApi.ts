import { get, post, del } from './apiClient.js';
import type { WorkItemMilestones } from '@cornerstone/shared';

/**
 * Fetches all milestone relationships for a work item.
 * Returns both required milestones (must complete before WI can start)
 * and linked milestones (WI contributes to).
 */
export function getWorkItemMilestones(workItemId: string): Promise<WorkItemMilestones> {
  return get<WorkItemMilestones>(`/work-items/${workItemId}/milestones`);
}

/**
 * Adds a required milestone dependency for a work item.
 * The work item cannot start until the milestone is completed.
 */
export function addRequiredMilestone(workItemId: string, milestoneId: number): Promise<void> {
  return post<void>(`/work-items/${workItemId}/milestones/required/${milestoneId}`);
}

/**
 * Removes a required milestone dependency from a work item.
 */
export function removeRequiredMilestone(workItemId: string, milestoneId: number): Promise<void> {
  return del<void>(`/work-items/${workItemId}/milestones/required/${milestoneId}`);
}

/**
 * Links a milestone to a work item (work item contributes to that milestone).
 */
export function addLinkedMilestone(workItemId: string, milestoneId: number): Promise<void> {
  return post<void>(`/work-items/${workItemId}/milestones/linked/${milestoneId}`);
}

/**
 * Unlinks a milestone from a work item.
 */
export function removeLinkedMilestone(workItemId: string, milestoneId: number): Promise<void> {
  return del<void>(`/work-items/${workItemId}/milestones/linked/${milestoneId}`);
}
