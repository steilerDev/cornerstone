/**
 * Application-wide settings service.
 *
 * Story #1877: Household metadata settings for Bank Report Wizard.
 * Uses a simple key-value table (app_settings) to store application-level
 * configuration that is not per-user.
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, asc, eq } from 'drizzle-orm';
import type * as schemaTypes from '../db/schema.js';
import { appSettings, userPreferences, users } from '../db/schema.js';
import type {
  EntriesLanguage,
  HouseholdSettings,
  UpdateHouseholdSettingsRequest,
} from '@cornerstone/shared';
import { ENTRIES_LANGUAGES, FALLBACK_ENTRIES_LANGUAGE } from '@cornerstone/shared';
import { ValidationError } from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

const HOUSEHOLD_NAME_KEY = 'household_name';
const HOUSEHOLD_ADDRESS_KEY = 'household_address';
const ENTRIES_LANGUAGE_KEY = 'entries_language';

function isEntriesLanguage(v: unknown): v is EntriesLanguage {
  return typeof v === 'string' && (ENTRIES_LANGUAGES as readonly string[]).includes(v);
}

/**
 * Unset-value derivation: the earliest-created user's (any role, deactivated included)
 * locale preference when it is 'de' or 'en', otherwise the fallback. Never persisted.
 */
function deriveEntriesLanguage(db: DbType): EntriesLanguage {
  const founder = db
    .select({ id: users.id })
    .from(users)
    .orderBy(asc(users.createdAt), asc(users.id))
    .limit(1)
    .get();
  if (!founder) return FALLBACK_ENTRIES_LANGUAGE;
  const pref = db
    .select({ value: userPreferences.value })
    .from(userPreferences)
    .where(and(eq(userPreferences.userId, founder.id), eq(userPreferences.key, 'locale')))
    .get();
  return isEntriesLanguage(pref?.value) ? pref.value : FALLBACK_ENTRIES_LANGUAGE;
}

/**
 * Retrieve a raw setting value from app_settings.
 * Returns null if the key does not exist.
 */
function getRawSetting(db: DbType, key: string): string | null {
  const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  return row?.value ?? null;
}

/**
 * Insert or update a raw setting in app_settings.
 */
function upsertRawSetting(db: DbType, key: string, value: string | null): void {
  const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  const now = new Date().toISOString();

  if (existing) {
    db.update(appSettings).set({ value, updatedAt: now }).where(eq(appSettings.key, key)).run();
  } else {
    db.insert(appSettings).values({ key, value, updatedAt: now }).run();
  }
}

/**
 * Get the current household settings.
 * householdName and householdAddress are nullable; entriesLanguage is never null
 * (stored value, else derived from the founder's locale, else 'en'). Reads never write.
 */
export function getHouseholdSettings(db: DbType): HouseholdSettings {
  const householdName = getRawSetting(db, HOUSEHOLD_NAME_KEY);
  const householdAddress = getRawSetting(db, HOUSEHOLD_ADDRESS_KEY);

  const storedLanguage = getRawSetting(db, ENTRIES_LANGUAGE_KEY);

  return {
    householdName,
    householdAddress,
    entriesLanguage: isEntriesLanguage(storedLanguage) ? storedLanguage : deriveEntriesLanguage(db),
  };
}

/**
 * Update household settings.
 * At least one of householdName, householdAddress or entriesLanguage must be provided.
 * Setting householdName or householdAddress to null clears it (entriesLanguage is never null).
 * Partial updates leave other fields unchanged.
 *
 * @throws ValidationError if no field is provided, a length is exceeded or entriesLanguage is invalid
 * @returns the updated HouseholdSettings
 */
export function updateHouseholdSettings(
  db: DbType,
  data: UpdateHouseholdSettingsRequest,
): HouseholdSettings {
  // Validate at least one field provided
  if (
    data.householdName === undefined &&
    data.householdAddress === undefined &&
    data.entriesLanguage === undefined
  ) {
    throw new ValidationError('At least one field must be provided');
  }

  // Validate householdName if provided
  if (data.householdName !== undefined && data.householdName !== null) {
    if (data.householdName.length > 200) {
      throw new ValidationError('Household name must be 200 characters or fewer');
    }
  }

  // Validate householdAddress if provided
  if (data.householdAddress !== undefined && data.householdAddress !== null) {
    if (data.householdAddress.length > 500) {
      throw new ValidationError('Household address must be 500 characters or fewer');
    }
  }

  if (data.entriesLanguage !== undefined && !isEntriesLanguage(data.entriesLanguage)) {
    throw new ValidationError('Language of entries must be one of: de, en');
  }

  // Update each field if provided
  if (data.householdName !== undefined) {
    upsertRawSetting(db, HOUSEHOLD_NAME_KEY, data.householdName);
  }

  if (data.householdAddress !== undefined) {
    upsertRawSetting(db, HOUSEHOLD_ADDRESS_KEY, data.householdAddress);
  }

  if (data.entriesLanguage !== undefined) {
    upsertRawSetting(db, ENTRIES_LANGUAGE_KEY, data.entriesLanguage);
  }

  return getHouseholdSettings(db);
}
