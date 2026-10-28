// Parse/format helpers for the range filters of an object list (`from:…,to:…`, `min:…,max:…`).

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** The value of one `key:value` side of a `from:…,to:…` / `min:…,max:…` serialisation. */
function sideOf(value: string, key: string): string | null {
  for (const part of value.split(',')) {
    const separator = part.indexOf(':');
    if (separator !== -1 && part.slice(0, separator) === key) return part.slice(separator + 1);
  }
  return null;
}

/** "from:2026-01-01,to:2026-02-01" to { from, to }; an invalid or empty side is null, no valid side is null. */
export function parseDateRange(
  value: string | null,
): { from: string | null; to: string | null } | null {
  if (!value) return null;
  const rawFrom = sideOf(value, 'from');
  const rawTo = sideOf(value, 'to');
  const from = rawFrom !== null && isRealDate(rawFrom) ? rawFrom : null;
  const to = rawTo !== null && isRealDate(rawTo) ? rawTo : null;
  return from === null && to === null ? null : { from, to };
}

/** The URL serialisation of a date range; null when both sides are empty. */
export function formatDateRange(from: string | null, to: string | null): string | null {
  const parts: string[] = [];
  if (from) parts.push(`from:${from}`);
  if (to) parts.push(`to:${to}`);
  return parts.length > 0 ? parts.join(',') : null;
}

function finiteNumber(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

/** "min:10,max:250.5" to { min, max } (finite numbers only); no valid side is null. */
export function parseNumberRange(
  value: string | null,
): { min: number | null; max: number | null } | null {
  if (!value) return null;
  const min = finiteNumber(sideOf(value, 'min'));
  const max = finiteNumber(sideOf(value, 'max'));
  return min === null && max === null ? null : { min, max };
}

/** The URL serialisation of a number range; null when both sides are empty. */
export function formatNumberRange(min: number | null, max: number | null): string | null {
  const parts: string[] = [];
  if (min !== null) parts.push(`min:${min}`);
  if (max !== null) parts.push(`max:${max}`);
  return parts.length > 0 ? parts.join(',') : null;
}
