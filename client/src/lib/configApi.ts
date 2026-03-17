import { get } from './apiClient.js';
import type { AppConfigResponse } from '@cornerstone/shared';

export function fetchConfig(): Promise<AppConfigResponse> {
  return get<AppConfigResponse>('/config');
}
