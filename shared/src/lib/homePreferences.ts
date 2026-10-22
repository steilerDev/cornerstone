/**
 * Home preferences (#2230, EPIC-21 contract 18): section ids, preference keys and the strict
 * (PATCH) and lenient (client read) parsers. Imports nothing but siblings.
 */

export const HOME_SECTION_IDS = [
  'needs-attention',
  'tidy-up',
  'this-week',
  'pulse',
  'latest-from-site',
] as const;
export type HomeSectionId = (typeof HOME_SECTION_IDS)[number];

/** Needs attention always shows. */
export const HOME_HIDEABLE_SECTION_IDS = [
  'tidy-up',
  'this-week',
  'pulse',
  'latest-from-site',
] as const;
export type HomeHideableSectionId = (typeof HOME_HIDEABLE_SECTION_IDS)[number];

export const HOME_COLLAPSIBLE_SECTION_IDS = ['tidy-up'] as const;
export type HomeCollapsibleSectionId = (typeof HOME_COLLAPSIBLE_SECTION_IDS)[number];

export const HOME_HIDDEN_SECTIONS_KEY = 'home.hiddenSections';
export const HOME_COLLAPSED_SECTIONS_KEY = 'home.collapsedSections';
export const HOME_MOVED_NOTICE_SEEN_KEY = 'home.movedNoticeSeen';
export const HOME_SETUP_DISMISSED_KEY = 'home.setupDismissed';
export const HOME_PREFERENCE_KEYS = [
  HOME_HIDDEN_SECTIONS_KEY,
  HOME_COLLAPSED_SECTIONS_KEY,
  HOME_MOVED_NOTICE_SEEN_KEY,
  HOME_SETUP_DISMISSED_KEY,
] as const;
export type HomePreferenceKey = (typeof HOME_PREFERENCE_KEYS)[number];
export const HOME_PREFERENCE_MAX_LENGTH = 1024;

export type HomePreferenceInvalidReason =
  'too_large' | 'not_json' | 'not_array' | 'bad_section' | 'duplicate' | 'not_true';

export function isHomePreferenceKey(key: string): key is HomePreferenceKey {
  return (HOME_PREFERENCE_KEYS as readonly string[]).includes(key);
}

function allowedFor(key: HomePreferenceKey): readonly string[] | null {
  if (key === HOME_HIDDEN_SECTIONS_KEY) return HOME_HIDEABLE_SECTION_IDS;
  if (key === HOME_COLLAPSED_SECTIONS_KEY) return HOME_COLLAPSIBLE_SECTION_IDS;
  return null;
}

/** Strict (PATCH). null = valid. */
export function validateHomePreferenceValue(
  key: HomePreferenceKey,
  value: string,
): HomePreferenceInvalidReason | null {
  if (value.length > HOME_PREFERENCE_MAX_LENGTH) return 'too_large';
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return 'not_json';
  }
  const allowed = allowedFor(key);
  if (allowed === null) return parsed === true ? null : 'not_true';
  if (!Array.isArray(parsed)) return 'not_array';
  const seen = new Set<string>();
  for (const member of parsed as unknown[]) {
    if (typeof member !== 'string' || !allowed.includes(member)) return 'bad_section';
    if (seen.has(member)) return 'duplicate';
    seen.add(member);
  }
  return null;
}

/**
 * Lenient (client read): unparsable / non-array -> []; unknown or duplicate members dropped;
 * result in `allowed` order.
 */
export function parseHomeSectionIds<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T[] {
  if (value === undefined) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const present = new Set<unknown>(parsed as unknown[]);
  return allowed.filter((id) => present.has(id));
}
