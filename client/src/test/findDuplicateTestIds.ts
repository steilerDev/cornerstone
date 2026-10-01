/** Returns every data-testid value that occurs more than once under `root` (sorted, deduped). */
export function findDuplicateTestIds(root: ParentNode = document): string[] {
  const counts = new Map<string, number>();
  root.querySelectorAll('[data-testid]').forEach((el) => {
    const id = el.getAttribute('data-testid') ?? '';
    if (id === '') return;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  });
  return [...counts]
    .filter(([, n]) => n > 1)
    .map(([id]) => id)
    .sort();
}
