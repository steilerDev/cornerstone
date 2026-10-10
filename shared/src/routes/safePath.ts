// The single rule for "is this a same-origin app path" (EPIC-21, #2204). Pure: no imports.

/** Longest accepted in-app path (pathname, search and hash together). */
export const MAX_APP_PATH_LENGTH = 2048;

/**
 * Returns `value` unchanged when it is a same-origin app path, else `null`.
 *
 * Rules: a string; 1..MAX_APP_PATH_LENGTH chars; starts with '/'; contains no backslash;
 * does not start with '//'; contains no '://'; contains no ASCII control character
 * (U+0000-U+001F, U+007F). Browsers read a backslash as '/' and strip tab/newline inside
 * URLs, so '/\x' and '/\t/x' both become '//x', an off-site redirect.
 *
 * It validates; it never decodes or rewrites.
 */
export function safeAppPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value.length > MAX_APP_PATH_LENGTH) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (value.includes('\\') || value.includes('://')) return null;
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (/[\u0000-\u001F\u007F]/.test(value)) return null;
  return value;
}
