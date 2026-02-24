import { post } from './apiClient.js';
import type { ScheduleRequest, ScheduleResponse } from '@cornerstone/shared';

/**
 * Calls the scheduling engine (read-only — does NOT persist changes).
 * Returns the proposed schedule with CPM dates and critical path.
 *
 * POST /api/schedule
 */
export function runSchedule(request: ScheduleRequest): Promise<ScheduleResponse> {
  return post<ScheduleResponse>('/schedule', request);
}
