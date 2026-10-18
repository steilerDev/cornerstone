import { get } from './apiClient.js';
import type { IntegrationsStatusResponse } from '@cornerstone/shared';

/** Read-only status of every integration (admin only). */
export function getIntegrationsStatus(): Promise<IntegrationsStatusResponse> {
  return get<IntegrationsStatusResponse>('/settings/integrations');
}
