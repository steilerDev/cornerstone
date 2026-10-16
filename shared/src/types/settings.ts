/**
 * Household-wide settings and application-level configuration types.
 * Story #1877: Settings for Bank Report Wizard (household sender metadata).
 */

/** Languages the household writes its own entries in (#2215). */
export const ENTRIES_LANGUAGES = ['de', 'en'] as const;
export type EntriesLanguage = (typeof ENTRIES_LANGUAGES)[number];
/** Last step of the unset-value derivation (API Contract > Household Settings). */
export const FALLBACK_ENTRIES_LANGUAGE: EntriesLanguage = 'en';

/** Household-wide settings, consumed by the Bank Report Wizard's cover-letter sender block. */
export interface HouseholdSettings {
  householdName: string | null;
  householdAddress: string | null;
  /** Never null: the stored value, else derived from the founder's locale, else 'en'. */
  entriesLanguage: EntriesLanguage;
}

/** Request body for updating household settings. */
export interface UpdateHouseholdSettingsRequest {
  householdName?: string | null;
  householdAddress?: string | null;
  entriesLanguage?: EntriesLanguage;
}

/** Response shape for household settings endpoints. */
export interface HouseholdSettingsResponse {
  settings: HouseholdSettings;
}
