import { get } from './apiClient.js';
import type { TimelineResponse } from '@cornerstone/shared';

/**
 * Fetches the aggregated timeline data for Gantt chart and calendar views.
 */
export async function getTimeline(): Promise<TimelineResponse> {
  return get<TimelineResponse>('/timeline');
}
