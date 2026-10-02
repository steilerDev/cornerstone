/**
 * Narrow a possibly-undefined value (e.g. an indexed read under
 * `noUncheckedIndexedAccess`) without a non-null assertion.
 */
export function defined<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${what} to be defined`);
  }
  return value;
}
