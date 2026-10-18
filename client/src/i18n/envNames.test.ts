/**
 * AC5 guard (#2217): environment variable names are shown only on Settings > Integrations, and
 * there they come from the server. No locale string may contain one.
 *
 * The list is built from the server's config parser (`getValue('NAME')` reads), so a variable
 * added later is covered without touching this test.
 */
import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CONFIG_SOURCE = readFileSync(resolve(process.cwd(), 'server/src/plugins/config.ts'), 'utf8');
const LOCALES_DIR = resolve(process.cwd(), 'client/src/i18n');

const ENV_NAMES = [...new Set([...CONFIG_SOURCE.matchAll(/getValue\('([A-Z0-9_]+)'\)/g)])].map(
  (match) => match[1] as string,
);

function collectStrings(node: unknown, path: string, out: { path: string; value: string }[]) {
  if (typeof node === 'string') {
    out.push({ path, value: node });
  } else if (node && typeof node === 'object') {
    for (const [key, child] of Object.entries(node)) collectStrings(child, `${path}.${key}`, out);
  }
}

function localeStrings(locale: 'en' | 'de') {
  const out: { path: string; value: string }[] = [];
  const dir = resolve(LOCALES_DIR, locale);
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
    const json: unknown = JSON.parse(readFileSync(resolve(dir, file), 'utf8'));
    collectStrings(json, `${locale}/${file}`, out);
  }
  return out;
}

const NAME_PATTERN = new RegExp(`(?<![A-Z0-9_])(${ENV_NAMES.join('|')})(?![A-Z0-9_])`);

describe('environment variable names in locale files', () => {
  it('finds the names the server reads', () => {
    expect(ENV_NAMES.length).toBeGreaterThan(20);
    expect(ENV_NAMES).toEqual(
      expect.arrayContaining([
        'PAPERLESS_URL',
        'LLM_API_KEY',
        'OIDC_CLIENT_SECRET',
        'EXTERNAL_URL',
        'BACKUP_CADENCE',
        'PHOTO_MAX_FILE_SIZE_MB',
      ]),
    );
  });

  it.each(['en', 'de'] as const)('no %s string contains an environment variable name', (locale) => {
    const strings = localeStrings(locale);
    expect(strings.length).toBeGreaterThan(1000);
    const offenders = strings
      .filter(({ value }) => NAME_PATTERN.test(value))
      .map(({ path, value }) => `${path}: ${value}`);
    expect(offenders).toEqual([]);
  });

  it('the pattern catches a name inside a sentence (negative control)', () => {
    expect(NAME_PATTERN.test('Set PAPERLESS_URL and restart')).toBe(true);
    expect(NAME_PATTERN.test('Set the Paperless address and restart')).toBe(false);
  });
});
