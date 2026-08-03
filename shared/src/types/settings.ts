/**
 * Household-wide settings and application-level configuration types.
 * Story #1877: Settings for Bank Report Wizard (household sender metadata).
 */

/** Household-wide settings, consumed by the Bank Report Wizard's cover-letter sender block. */
export interface HouseholdSettings {
  householdName: string | null;
  householdAddress: string | null;
}

/** Request body for updating household settings. */
export interface UpdateHouseholdSettingsRequest {
  householdName?: string | null;
  householdAddress?: string | null;
}

/** Response shape for household settings endpoints. */
export interface HouseholdSettingsResponse {
  settings: HouseholdSettings;
}
