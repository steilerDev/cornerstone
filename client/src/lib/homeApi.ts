import { get } from './apiClient.js';
import type { HomePulseResponse, HomeSetupResponse, HomeWeekResponse } from '@cornerstone/shared';

/** Dated items from today to today + 20 (starts, ends, payments, deliveries, milestones). */
export function getHomeWeek(): Promise<HomeWeekResponse> {
  return get<HomeWeekResponse>('/home/week');
}

/** The three Pulse figures (Left to spend, Still to pay, Progress). */
export function getHomePulse(): Promise<HomePulseResponse> {
  return get<HomePulseResponse>('/home/pulse');
}

/** The set-up checklist state (admin-only steps are absent for members). */
export function getHomeSetup(): Promise<HomeSetupResponse> {
  return get<HomeSetupResponse>('/home/setup');
}
