/**
 * Home preferences (#2230, contract 18): the strict (PATCH) and lenient (client read) parsers.
 *
 * Mutations these tests catch:
 *  - a size limit off by one (1024 accepted, 1025 rejected);
 *  - an unknown / non-string / repeated member accepted;
 *  - `needs-attention` accepted as hideable, or a non-collapsible section as collapsed;
 *  - a boolean key accepting `false`, `"true"` (a JSON string) or `1`;
 *  - the lenient reader throwing, keeping duplicates or returning input order.
 */

import { describe, it, expect } from '@jest/globals';
import {
  HOME_COLLAPSED_SECTIONS_KEY,
  HOME_COLLAPSIBLE_SECTION_IDS,
  HOME_HIDDEN_SECTIONS_KEY,
  HOME_HIDEABLE_SECTION_IDS,
  HOME_MOVED_NOTICE_SEEN_KEY,
  HOME_PREFERENCE_KEYS,
  HOME_PREFERENCE_MAX_LENGTH,
  HOME_SECTION_IDS,
  HOME_SETUP_DISMISSED_KEY,
  isHomePreferenceKey,
  parseHomeSectionIds,
  validateHomePreferenceValue,
} from './homePreferences.js';

describe('constants', () => {
  it('lists the four preference keys under the home. prefix', () => {
    expect([...HOME_PREFERENCE_KEYS]).toEqual([
      'home.hiddenSections',
      'home.collapsedSections',
      'home.movedNoticeSeen',
      'home.setupDismissed',
    ]);
    expect(HOME_PREFERENCE_MAX_LENGTH).toBe(1024);
  });

  it('never lets Needs attention be hidden, and only Tidy up collapse', () => {
    expect([...HOME_SECTION_IDS]).toContain('needs-attention');
    expect([...HOME_HIDEABLE_SECTION_IDS]).not.toContain('needs-attention');
    expect([...HOME_HIDEABLE_SECTION_IDS]).toEqual([
      'tidy-up',
      'this-week',
      'pulse',
      'latest-from-site',
    ]);
    expect([...HOME_COLLAPSIBLE_SECTION_IDS]).toEqual(['tidy-up']);
  });
});

describe('isHomePreferenceKey', () => {
  it.each([...HOME_PREFERENCE_KEYS])('accepts %s', (key) => {
    expect(isHomePreferenceKey(key)).toBe(true);
  });

  it.each(['dashboard.hiddenCards', 'home.other', 'home.', '', 'HOME.hiddenSections'])(
    'rejects %j',
    (key) => {
      expect(isHomePreferenceKey(key)).toBe(false);
    },
  );
});

describe('validateHomePreferenceValue: hidden sections', () => {
  const key = HOME_HIDDEN_SECTIONS_KEY;

  it.each([
    '[]',
    '["pulse"]',
    '["tidy-up","this-week","pulse","latest-from-site"]',
    '["latest-from-site","pulse"]',
    ' [ "pulse" ] ',
  ])('accepts %s', (value) => {
    expect(validateHomePreferenceValue(key, value)).toBeNull();
  });

  it('rejects needs-attention (never hideable) as bad_section', () => {
    expect(validateHomePreferenceValue(key, '["needs-attention"]')).toBe('bad_section');
  });

  it.each(['["nope"]', '[1]', '[null]', '[["pulse"]]', '[{"a":1}]', '[true]'])(
    'rejects the member in %s as bad_section',
    (value) => {
      expect(validateHomePreferenceValue(key, value)).toBe('bad_section');
    },
  );

  it('rejects a repeated member as duplicate', () => {
    expect(validateHomePreferenceValue(key, '["pulse","pulse"]')).toBe('duplicate');
  });

  it('reports bad_section before duplicate when an earlier member is invalid', () => {
    expect(validateHomePreferenceValue(key, '["x","pulse","pulse"]')).toBe('bad_section');
  });

  it.each(['{}', '"pulse"', '1', 'true', 'null', '{"0":"pulse"}'])(
    'rejects %s as not_array',
    (value) => {
      expect(validateHomePreferenceValue(key, value)).toBe('not_array');
    },
  );

  it.each(['', 'pulse', '[', '["pulse"', 'undefined', "['pulse']"])(
    'rejects %j as not_json',
    (value) => {
      expect(validateHomePreferenceValue(key, value)).toBe('not_json');
    },
  );
});

describe('validateHomePreferenceValue: collapsed sections', () => {
  const key = HOME_COLLAPSED_SECTIONS_KEY;

  it.each(['[]', '["tidy-up"]'])('accepts %s', (value) => {
    expect(validateHomePreferenceValue(key, value)).toBeNull();
  });

  it.each(['["pulse"]', '["needs-attention"]', '["this-week"]'])(
    'rejects %s: only Tidy up can collapse',
    (value) => {
      expect(validateHomePreferenceValue(key, value)).toBe('bad_section');
    },
  );

  it('rejects duplicates and non-arrays', () => {
    expect(validateHomePreferenceValue(key, '["tidy-up","tidy-up"]')).toBe('duplicate');
    expect(validateHomePreferenceValue(key, '"tidy-up"')).toBe('not_array');
    expect(validateHomePreferenceValue(key, 'tidy-up')).toBe('not_json');
  });
});

describe('validateHomePreferenceValue: boolean keys', () => {
  const keys = [HOME_MOVED_NOTICE_SEEN_KEY, HOME_SETUP_DISMISSED_KEY] as const;

  it.each(keys)('%s accepts exactly the strings true and false', (key) => {
    expect(validateHomePreferenceValue(key, 'true')).toBeNull();
    expect(validateHomePreferenceValue(key, 'false')).toBeNull();
  });

  it.each([
    ' true',
    'true ',
    'True',
    'TRUE',
    'False',
    '1',
    '0',
    'nope',
    '',
    'yes',
    'null',
    '"true"',
    '[]',
    '{}',
    '[true]',
    'truefalse',
  ])('rejects %j as not_boolean (no parsing, no trimming)', (value) => {
    for (const key of keys) {
      expect(validateHomePreferenceValue(key, value)).toBe('not_boolean');
    }
  });

  it('never reports not_json or not_array for a boolean key', () => {
    for (const key of keys) {
      expect(validateHomePreferenceValue(key, '{nope')).toBe('not_boolean');
    }
  });
});

describe('validateHomePreferenceValue: size limit', () => {
  const padded = (length: number): string => `["pulse"${' '.repeat(length - 9)}]`;

  it('accepts a value of exactly 1024 characters and rejects 1025 as too_large', () => {
    expect(padded(1024)).toHaveLength(1024);
    expect(validateHomePreferenceValue(HOME_HIDDEN_SECTIONS_KEY, padded(1024))).toBeNull();
    expect(padded(1025)).toHaveLength(1025);
    expect(validateHomePreferenceValue(HOME_HIDDEN_SECTIONS_KEY, padded(1025))).toBe('too_large');
  });

  it('reports too_large before parsing, for every key', () => {
    const big = 'x'.repeat(2000);
    for (const key of HOME_PREFERENCE_KEYS) {
      expect(validateHomePreferenceValue(key, big)).toBe('too_large');
    }
  });
});

describe('parseHomeSectionIds (lenient)', () => {
  const allowed = HOME_HIDEABLE_SECTION_IDS;

  it('returns [] for undefined, unparsable and non-array values', () => {
    expect(parseHomeSectionIds(undefined, allowed)).toEqual([]);
    expect(parseHomeSectionIds('not json', allowed)).toEqual([]);
    expect(parseHomeSectionIds('', allowed)).toEqual([]);
    expect(parseHomeSectionIds('{"pulse":1}', allowed)).toEqual([]);
    expect(parseHomeSectionIds('"pulse"', allowed)).toEqual([]);
    expect(parseHomeSectionIds('null', allowed)).toEqual([]);
  });

  it('drops unknown, non-string and duplicate members', () => {
    expect(
      parseHomeSectionIds('["pulse","nope",3,null,"pulse","needs-attention"]', allowed),
    ).toEqual(['pulse']);
  });

  it('returns members in the allowed order, not the stored order', () => {
    expect(parseHomeSectionIds('["latest-from-site","tidy-up","pulse"]', allowed)).toEqual([
      'tidy-up',
      'pulse',
      'latest-from-site',
    ]);
  });

  it('reads an empty array as nothing hidden', () => {
    expect(parseHomeSectionIds('[]', allowed)).toEqual([]);
  });

  it('works with the collapsible tuple', () => {
    expect(parseHomeSectionIds('["tidy-up","pulse"]', HOME_COLLAPSIBLE_SECTION_IDS)).toEqual([
      'tidy-up',
    ]);
  });
});
