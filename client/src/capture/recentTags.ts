export type RecentTagKind = 'area' | 'orientation';

const MAX_RECENT = 8;

function key(kind: RecentTagKind, userId: string): string {
  const name = kind === 'area' ? 'recentAreas' : 'recentOrientations';
  return `cornerstone.capture.${name}.${userId}`;
}

function readIds(kind: RecentTagKind, userId: string): string[] {
  try {
    const raw = localStorage.getItem(key(kind, userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  }
}

/** The user's recently used tag ids, newest first, limited to ids that still exist. */
export function readRecentTags(
  kind: RecentTagKind,
  userId: string,
  validIds: ReadonlySet<string>,
): string[] {
  return readIds(kind, userId)
    .filter((id) => validIds.has(id))
    .slice(0, MAX_RECENT);
}

/** Moves (or adds) an id to the front. Silent when storage is unavailable. */
export function pushRecentTag(kind: RecentTagKind, userId: string, id: string): void {
  try {
    const next = [id, ...readIds(kind, userId).filter((existing) => existing !== id)].slice(
      0,
      MAX_RECENT,
    );
    localStorage.setItem(key(kind, userId), JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode, quota): recents are a convenience only.
  }
}
