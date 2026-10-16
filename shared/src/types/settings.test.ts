/**
 * Tests for the household settings types and the entries-language constants (#2215).
 */

import { describe, it, expect } from '@jest/globals';
import { ENTRIES_LANGUAGES, FALLBACK_ENTRIES_LANGUAGE } from './settings.js';
import type {
  EntriesLanguage,
  HouseholdSettings,
  UpdateHouseholdSettingsRequest,
} from './settings.js';
import type { ReorderReferenceListRequest } from './referenceList.js';

describe('ENTRIES_LANGUAGES', () => {
  it('lists exactly German and English', () => {
    expect([...ENTRIES_LANGUAGES]).toEqual(['de', 'en']);
  });

  it('has the fallback language as a member', () => {
    expect(FALLBACK_ENTRIES_LANGUAGE).toBe('en');
    expect(ENTRIES_LANGUAGES as readonly string[]).toContain(FALLBACK_ENTRIES_LANGUAGE);
  });
});

describe('household settings types', () => {
  it('requires a non-null entriesLanguage on HouseholdSettings', () => {
    const language: EntriesLanguage = 'de';
    const settings: HouseholdSettings = {
      householdName: null,
      householdAddress: null,
      entriesLanguage: language,
    };

    expect(settings.entriesLanguage).toBe('de');
  });

  it('allows entriesLanguage alone in an update request', () => {
    const request: UpdateHouseholdSettingsRequest = { entriesLanguage: 'en' };

    expect(Object.keys(request)).toEqual(['entriesLanguage']);
  });

  it('rejects unsupported languages at compile time', () => {
    // @ts-expect-error 'fr' is not an EntriesLanguage
    const invalid: UpdateHouseholdSettingsRequest = { entriesLanguage: 'fr' };

    expect(invalid).toBeDefined();
  });
});

describe('ReorderReferenceListRequest', () => {
  it('carries the full ordered id list', () => {
    const request: ReorderReferenceListRequest = { ids: ['a', 'b', 'c'] };

    expect(request.ids).toHaveLength(3);
  });
});
