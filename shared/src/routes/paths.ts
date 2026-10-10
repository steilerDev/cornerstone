// Path helpers shared by redirects.ts and match.ts (EPIC-21, ADR-038).
// Self-contained: imports nothing.

/** The plain path of a `from`: everything up to the first `?`, `#` or ` (`. */
export function baseFrom(from: string): string {
  const cut = from.search(/[?# ]/);
  return cut >= 0 ? from.slice(0, cut) : from;
}
