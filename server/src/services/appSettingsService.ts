/**
 * Application-wide settings service.
 *
 * Story #1877: Household metadata settings for Bank Report Wizard.
 * Uses a simple key-value table (app_settings) to store application-level
 * configuration that is not per-user.
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import type * as schemaTypes from '../db/schema.js';
import { appSettings } from '../db/schema.js';
import type { HouseholdSettings, UpdateHouseholdSettingsRequest } from '@cornerstone/shared';
import { ValidationError } from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

const HOUSEHOLD_NAME_KEY = 'household_name';
const HOUSEHOLD_ADDRESS_KEY = 'household_address';

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
 * Returns an object with householdName and householdAddress (both nullable).
 * If settings have not been configured, returns nulls.
 */
export function getHouseholdSettings(db: DbType): HouseholdSettings {
  const householdName = getRawSetting(db, HOUSEHOLD_NAME_KEY);
  const householdAddress = getRawSetting(db, HOUSEHOLD_ADDRESS_KEY);

  return {
    householdName,
    householdAddress,
  };
}

/**
 * Update household settings.
 * At least one field must be provided (either householdName or householdAddress).
 * Setting a field to null clears it.
 * Partial updates leave other fields unchanged.
 *
 * @throws ValidationError if both fields are undefined or if values exceed maxLength
 * @returns the updated HouseholdSettings
 */
export function updateHouseholdSettings(
  db: DbType,
  data: UpdateHouseholdSettingsRequest,
): HouseholdSettings {
  // Validate at least one field provided
  if (data.householdName === undefined && data.householdAddress === undefined) {
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

  // Update each field if provided
  if (data.householdName !== undefined) {
    upsertRawSetting(db, HOUSEHOLD_NAME_KEY, data.householdName);
  }

  if (data.householdAddress !== undefined) {
    upsertRawSetting(db, HOUSEHOLD_ADDRESS_KEY, data.householdAddress);
  }

  return getHouseholdSettings(db);
}
