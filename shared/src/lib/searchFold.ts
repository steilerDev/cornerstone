/**
 * Case-, accent- and German-digraph-insensitive form used by search on both the server
 * (SQLite `fold()` function) and the client.
 *
 * Order matters: `toLowerCase` turns the capital sharp s (U+1E9E) into `ß` before the
 * `ß` -> `ss` step.
 */
export function foldSearchText(value: string): string {
  return value
    .normalize('NFD')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ae/g, 'a')
    .replace(/oe/g, 'o')
    .replace(/ue/g, 'u');
}

/** Digits only: strips spaces, "+", "-", "(", ")" and every other non-digit. */
export function searchDigits(value: string): string {
  return value.replace(/\D/g, '');
}
