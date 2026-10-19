export interface StickyTags {
  areaId: string | null;
  orientationId: string | null;
}

function key(draftId: string): string {
  return `cornerstone.capture.tags.${draftId}`;
}

function idOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** Per-draft chip state; sessionStorage so it survives a reload of the same tab. */
export function readStickyTags(draftId: string): StickyTags | null {
  try {
    const raw = sessionStorage.getItem(key(draftId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    return { areaId: idOrNull(record.areaId), orientationId: idOrNull(record.orientationId) };
  } catch {
    return null;
  }
}

export function writeStickyTags(draftId: string, tags: StickyTags): void {
  try {
    sessionStorage.setItem(key(draftId), JSON.stringify(tags));
  } catch {
    // Storage unavailable: the chips simply start empty after a reload.
  }
}

export function clearStickyTags(draftId: string): void {
  try {
    sessionStorage.removeItem(key(draftId));
  } catch {
    // Nothing to clear.
  }
}
