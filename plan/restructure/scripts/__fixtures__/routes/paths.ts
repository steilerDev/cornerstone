export function baseFrom(from: string): string {
  const cut = from.search(/[?# ]/);
  return cut >= 0 ? from.slice(0, cut) : from;
}
