import { get, patch } from './apiClient.js';
import type {
  HouseholdSettings,
  UpdateHouseholdSettingsRequest,
  HouseholdSettingsResponse,
} from '@cornerstone/shared';

export function fetchHouseholdSettings(): Promise<HouseholdSettings> {
  return get<HouseholdSettingsResponse>('/settings').then((r) => r.settings);
}

export function updateHouseholdSettings(
  data: UpdateHouseholdSettingsRequest,
): Promise<HouseholdSettings> {
  return patch<HouseholdSettingsResponse>('/settings', data).then((r) => r.settings);
}
