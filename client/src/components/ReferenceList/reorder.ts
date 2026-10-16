/** Returns a copy of `ids` with `id` moved to `toIndex` (clamped); unchanged when `id` is absent. */
export function moveId(ids: readonly string[], id: string, toIndex: number): string[] {
  const from = ids.indexOf(id);
  if (from === -1) return [...ids];
  const target = Math.max(0, Math.min(ids.length - 1, toIndex));
  const next = ids.filter((existing) => existing !== id);
  next.splice(target, 0, id);
  return next;
}

/**
 * Index the dragged row would take when dropped at `clientY`, given the row rects in the current
 * order: the number of other rows whose vertical centre lies above the pointer.
 */
export function computeDropIndex(
  clientY: number,
  rects: readonly { top: number; height: number }[],
  fromIndex: number,
): number {
  let above = 0;
  rects.forEach((rect, index) => {
    if (index === fromIndex) return;
    if (rect.top + rect.height / 2 < clientY) above += 1;
  });
  return above;
}

/** 1-based position of `id` and the list length. */
export function positionOf(
  ids: readonly string[],
  id: string,
): { position: number; total: number } {
  return { position: ids.indexOf(id) + 1, total: ids.length };
}
