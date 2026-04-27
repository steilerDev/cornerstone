/**
 * Deterministic color index for budget sources.
 * Uses a stable string hash so UUIDs map consistently to one of 10 color slots.
 * Slot 0 is reserved for "Unassigned" lines (budgetSourceId === null).
 * Slots 1–9 are used for named sources.
 *
 * @param sourceId - Budget source UUID string, or null for unassigned lines
 * @returns 0 for null (unassigned), or 1–9 for named sources
 */
export function getSourceColorIndex(sourceId: string | null): number {
  if (sourceId === null) return 0;
  let hash = 0;
  for (let i = 0; i < sourceId.length; i++) {
    hash = (hash * 31 + sourceId.charCodeAt(i)) | 0;
  }
  // Ensure result is in [1, 9] for named sources (slot 0 is reserved for unassigned)
  return (Math.abs(hash) % 9) + 1;
}

/**
 * Returns the CSS module class name for the source badge slot.
 * Pass sourceId === null for "Unassigned", or a source UUID string for named sources.
 */
export type SourceBadgeStyleKey =
  | `source${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
  | 'sourceUnassigned';

export function getSourceBadgeStyleKey(sourceId: string | null): SourceBadgeStyleKey {
  if (sourceId === null) return 'sourceUnassigned';
  const index = getSourceColorIndex(sourceId);
  return `source${index}` as SourceBadgeStyleKey;
}
