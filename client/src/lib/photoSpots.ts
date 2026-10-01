import type {
  AreaResponse,
  AreaSummary,
  OrientationResponse,
  PhotoSpotSummary,
} from '@cornerstone/shared';

/** URL path segment used for "no area" / "no orientation". */
export const SPOT_URL_NONE = 'none';

export const AREA_PATH_SEPARATOR = ' › ';

export function toSpotUrlKey(id: string | null): string {
  return id ?? SPOT_URL_NONE;
}

export function fromSpotUrlKey(key: string): string | null {
  return key === SPOT_URL_NONE ? null : key;
}

export function spotKey(areaId: string | null, orientationId: string | null): string {
  return `${toSpotUrlKey(areaId)}:${toSpotUrlKey(orientationId)}`;
}

export function buildSpotViewerPath(
  areaId: string | null,
  orientationId: string | null,
  photoId?: string,
): string {
  const base = `/photos/spot/${encodeURIComponent(toSpotUrlKey(areaId))}/${encodeURIComponent(
    toSpotUrlKey(orientationId),
  )}`;
  return photoId ? `${base}?photo=${encodeURIComponent(photoId)}` : base;
}

/** "Root › Parent › Area" label for an area summary. */
export function formatAreaPath(area: AreaSummary): string {
  return [...area.ancestors.map((a) => a.name), area.name].join(AREA_PATH_SEPARATOR);
}

export interface SpotCell {
  areaId: string | null;
  orientationId: string | null;
  orientationName: string | null;
  spot: PhotoSpotSummary | null;
}

export interface SpotRow {
  areaId: string | null;
  name: string | null;
  color: string | null;
  depth: number;
  cells: SpotCell[];
}

export interface SpotGroup {
  /** Root area id, or SPOT_URL_NONE for the no-area group. */
  id: string;
  name: string | null;
  color: string | null;
  hasHeader: boolean;
  rows: SpotRow[];
}

/** Lays areas x orientations out as groups of rows with one cell per orientation. */
export function buildSpotGroups(
  areas: AreaResponse[],
  orientations: OrientationResponse[],
  spots: PhotoSpotSummary[],
): SpotGroup[] {
  const spotByKey = new Map<string, PhotoSpotSummary>();
  for (const s of spots) spotByKey.set(spotKey(s.areaId, s.orientationId), s);

  const areaIds = new Set(areas.map((a) => a.id));
  const childrenOf = new Map<string, AreaResponse[]>();
  const roots: AreaResponse[] = [];
  for (const a of areas) {
    if (a.parentId === null || !areaIds.has(a.parentId)) {
      roots.push(a);
    } else {
      const list = childrenOf.get(a.parentId) ?? [];
      list.push(a);
      childrenOf.set(a.parentId, list);
    }
  }

  const makeRow = (
    areaId: string | null,
    name: string | null,
    color: string | null,
    depth: number,
  ): SpotRow => {
    const cells: SpotCell[] = orientations.map((o) => ({
      areaId,
      orientationId: o.id,
      orientationName: o.name,
      spot: spotByKey.get(spotKey(areaId, o.id)) ?? null,
    }));
    cells.push({
      areaId,
      orientationId: null,
      orientationName: null,
      spot: spotByKey.get(spotKey(areaId, null)) ?? null,
    });
    return { areaId, name, color, depth, cells };
  };

  const groups: SpotGroup[] = [];
  const visited = new Set<string>();

  for (const root of roots) {
    if (visited.has(root.id)) continue;
    visited.add(root.id);
    const children = childrenOf.get(root.id) ?? [];

    if (children.length === 0) {
      groups.push({
        id: root.id,
        name: root.name,
        color: root.color,
        hasHeader: false,
        rows: [makeRow(root.id, root.name, root.color, 0)],
      });
      continue;
    }

    const rows: SpotRow[] = [];
    if (spots.some((s) => s.areaId === root.id)) {
      rows.push(makeRow(root.id, root.name, root.color, 0));
    }
    const walk = (parentId: string, depth: number) => {
      for (const child of childrenOf.get(parentId) ?? []) {
        if (visited.has(child.id)) continue;
        visited.add(child.id);
        rows.push(makeRow(child.id, child.name, child.color, depth));
        walk(child.id, depth + 1);
      }
    };
    walk(root.id, 0);
    groups.push({ id: root.id, name: root.name, color: root.color, hasHeader: true, rows });
  }

  if (spots.some((s) => s.areaId === null)) {
    groups.push({
      id: SPOT_URL_NONE,
      name: null,
      color: null,
      hasHeader: false,
      rows: [makeRow(null, null, null, 0)],
    });
  }

  return groups;
}
