/**
 * Greedy row fill for the summary strip: how many grid columns each fact spans so that a wide
 * fact takes two and the last cell of every row fills the remaining width (no blank cells).
 */
export function factSpans(wide: readonly boolean[], cols: number): number[] {
  const spans: number[] = [];
  let used = 0;
  for (const isWide of wide) {
    const want = isWide ? Math.min(2, cols) : 1;
    if (used + want > cols) {
      spans[spans.length - 1]! += cols - used;
      used = 0;
    }
    spans.push(want);
    used += want;
    if (used >= cols) used = 0;
  }
  if (used > 0) spans[spans.length - 1]! += cols - used;
  return spans;
}
