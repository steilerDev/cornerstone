/**
 * Builds a `%term%` pattern for `LIKE … ESCAPE '\'`, escaping the escape character itself
 * as well as the `%` and `_` wildcards so user input always matches literally.
 */
export function toLikeContainsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

/**
 * Builds a `term%` pattern for `LIKE … ESCAPE '\'` (prefix match), escaping like
 * `toLikeContainsPattern`.
 */
export function toLikePrefixPattern(term: string): string {
  return `${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}
