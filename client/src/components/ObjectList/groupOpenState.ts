function storageKey(listKey: string, group: string): string {
  return `objectList:${listKey}:${group}`;
}

/** Session-only open/closed overrides of a list's groups, restored on Back. */
export function readGroupOpen(listKey: string, group: string): Record<string, boolean> {
  try {
    const raw = sessionStorage.getItem(storageKey(listKey, group));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'boolean') result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

export function writeGroupOpen(listKey: string, group: string, map: Record<string, boolean>): void {
  try {
    sessionStorage.setItem(storageKey(listKey, group), JSON.stringify(map));
  } catch {
    // Private mode or storage disabled: the overrides simply last for this page view.
  }
}
