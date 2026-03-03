import { get, post, del } from './apiClient.js';
import type { SubsidyProgram, HouseholdItemSubsidyPaybackResponse } from '@cornerstone/shared';

/**
 * Fetches all subsidies linked to a household item.
 */
export function fetchHouseholdItemSubsidies(householdItemId: string): Promise<SubsidyProgram[]> {
  return get<{ subsidies: SubsidyProgram[] }>(`/household-items/${householdItemId}/subsidies`).then(
    (r) => r.subsidies,
  );
}

/**
 * Links a subsidy program to a household item.
 */
export function linkHouseholdItemSubsidy(
  householdItemId: string,
  subsidyProgramId: string,
): Promise<SubsidyProgram> {
  return post<{ subsidy: SubsidyProgram }>(`/household-items/${householdItemId}/subsidies`, {
    subsidyProgramId,
  }).then((r) => r.subsidy);
}

/**
 * Unlinks a subsidy program from a household item.
 */
export function unlinkHouseholdItemSubsidy(
  householdItemId: string,
  subsidyProgramId: string,
): Promise<void> {
  return del<void>(`/household-items/${householdItemId}/subsidies/${subsidyProgramId}`);
}

/**
 * Fetches subsidy payback information for a household item.
 */
export function fetchHouseholdItemSubsidyPayback(
  householdItemId: string,
): Promise<HouseholdItemSubsidyPaybackResponse> {
  return get<HouseholdItemSubsidyPaybackResponse>(
    `/household-items/${householdItemId}/subsidy-payback`,
  );
}
