import { describe, expect, it } from '@jest/globals';
import { MAX_APP_PATH_LENGTH, safeAppPath } from './safePath.js';

describe('safeAppPath', () => {
  describe('accepts same-origin app paths unchanged', () => {
    it.each(['/', '/diary', '/diary?q=a%20b#x', '/settings/users', '/diary/d-1?x=1&y=2#h'])(
      'returns %s as-is',
      (path) => {
        expect(safeAppPath(path)).toBe(path);
      },
    );

    it('accepts a path of exactly MAX_APP_PATH_LENGTH characters', () => {
      const path = `/${'a'.repeat(MAX_APP_PATH_LENGTH - 1)}`;
      expect(path).toHaveLength(2048);
      expect(safeAppPath(path)).toBe(path);
    });
  });

  describe('rejects anything that could leave the app', () => {
    // Mutation named per row: dropping the matching rule from safeAppPath makes that row fail.
    it.each([
      ['empty string (length rule)', ''],
      ['relative path (leading slash rule)', 'diary'],
      ['protocol-relative (double slash rule)', '//evil.example'],
      ['backslash after slash (backslash rule)', '/\\evil.example'],
      ['backslash inside the path (backslash rule)', '/a\\b'],
      ['tab inside the path (control-character rule)', '/a\tb'],
      ['tab between slashes (control-character rule)', '/\t/evil.example'],
      ['newline (control-character rule)', '/a\nb'],
      ['NUL (control-character rule)', '/\u0000'],
      ['DEL (control-character rule)', '/\u007f'],
      ['absolute URL (leading slash rule)', 'https://evil.example'],
      ['scheme in a query value (:// rule)', '/x?u=http://evil.example'],
    ])('returns null for %s', (_label, value) => {
      expect(safeAppPath(value)).toBeNull();
    });

    it('returns null for a path one character over the limit', () => {
      expect(safeAppPath(`/${'a'.repeat(MAX_APP_PATH_LENGTH)}`)).toBeNull();
    });

    it.each([null, undefined, 42, {}, ['/diary'], true])('returns null for non-string %p', (v) => {
      expect(safeAppPath(v)).toBeNull();
    });
  });

  it('validates without decoding: an encoded backslash is not a backslash', () => {
    expect(safeAppPath('/%5Cevil.example')).toBe('/%5Cevil.example');
  });
});
