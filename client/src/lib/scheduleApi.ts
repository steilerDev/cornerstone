import type {
  ScheduleOverride,
  ScheduleRequest,
  SchedulePreviewResponse,
} from '@cornerstone/shared';
import { post } from './apiClient.js';

/**
 * What-if schedule: applies the overrides in memory and returns the projected schedule with its
 * `impact`. Nothing is saved (POST /api/schedule, contract 3).
 */
export function previewSchedule(
  body: ScheduleRequest & { overrides: ScheduleOverride[] },
  options?: { signal?: AbortSignal },
): Promise<SchedulePreviewResponse> {
  return post<SchedulePreviewResponse>('/schedule', body, options);
}
