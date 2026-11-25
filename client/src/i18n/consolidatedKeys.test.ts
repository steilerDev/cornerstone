import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import i18n from './index.js';

/**
 * Guard for #2259 (AC2): 20 duplicate keys were merged into canonical `common` keys. The old keys
 * must stay gone in both locales, the canonical values must read exactly as before, and no
 * production call site may bring an old key back.
 */

const i18nDir = path.dirname(fileURLToPath(import.meta.url));
const clientSrc = path.resolve(i18nDir, '..');

const CANCEL = { canonical: 'common:button.cancel', en: 'Cancel', de: 'Abbrechen' };
const SAVE = { canonical: 'common:button.save', en: 'Save', de: 'Speichern' };
const CLOSE = { canonical: 'common:button.close', en: 'Close', de: 'Schließen' };
const RETRY = { canonical: 'common:button.retry', en: 'Retry', de: 'Erneut versuchen' };
const LOADING = { canonical: 'common:loading', en: 'Loading...', de: 'Wird geladen...' };

const MERGES: readonly { old: string; canonical: string; en: string; de: string }[] = [
  { old: 'budget:autoItemize.cancel', ...CANCEL },
  { old: 'budget:common.cancel', ...CANCEL },
  { old: 'budget:convertPage.actions.cancel', ...CANCEL },
  { old: 'settings:tradesManager.cancel', ...CANCEL },
  { old: 'budget:autoItemize.save', ...SAVE },
  { old: 'settings:tradesManager.save', ...SAVE },
  { old: 'home:catchUp.close', ...CLOSE },
  { old: 'budget:overview.retry', ...RETRY },
  { old: 'budget:sources.lines.retry', ...RETRY },
  { old: 'budget:invoiceDetail.retry', ...RETRY },
  { old: 'budget:autoItemize.retry', ...RETRY },
  { old: 'budget:autoItemize.mergeRetryButton', ...RETRY },
  { old: 'costLines:section.retry', ...RETRY },
  { old: 'diary:infiniteScroll.retryButton', ...RETRY },
  { old: 'documents:browser.infiniteScroll.retryButton', ...RETRY },
  { old: 'history:infiniteScroll.retry', ...RETRY },
  { old: 'householdItems:purchasePage.retry', ...RETRY },
  { old: 'workItems:taskPage.retry', ...RETRY },
  { old: 'budget:common.loading', ...LOADING },
  { old: 'auth:setup.loading', ...LOADING },
];

function readLocale(locale: string, ns: string): Record<string, unknown> {
  const file = path.join(i18nDir, locale, `${ns}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
}

function hasPath(tree: Record<string, unknown>, keyPath: string): boolean {
  let node: unknown = tree;
  for (const part of keyPath.split('.')) {
    if (node === null || typeof node !== 'object' || !(part in node)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return true;
}

function collectSources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : collectSources(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('consolidated i18n keys (#2259)', () => {
  it('pins 20 merges', () => {
    expect(MERGES).toHaveLength(20);
  });

  describe.each(MERGES)('$old', ({ old, canonical, en, de }) => {
    const [ns = '', keyPath = ''] = old.split(':');
    const [canonicalNs = '', canonicalPath = ''] = canonical.split(':');

    it.each(['en', 'de'])('is gone from the %s locale', (locale) => {
      expect(hasPath(readLocale(locale, ns), keyPath)).toBe(false);
    });

    it('has a canonical key with the same text as before in en and de', () => {
      const enValue = i18n.getFixedT('en', canonicalNs)(canonicalPath);
      const deValue = i18n.getFixedT('de', canonicalNs)(canonicalPath);
      expect(enValue).toBe(en);
      expect(deValue).toBe(de);
    });
  });

  it('resolves an ns-prefixed common key from a non-common t', () => {
    expect(i18n.getFixedT('de', 'budget')('common:button.retry')).toBe('Erneut versuchen');
    expect(i18n.getFixedT('en', 'settings')('common:button.cancel')).toBe('Cancel');
    expect(i18n.getFixedT('de', 'auth')('common:loading')).toBe('Wird geladen...');
  });

  it('keeps old key strings out of production t() calls', () => {
    const offenders: string[] = [];
    for (const file of collectSources(clientSrc)) {
      const source = fs.readFileSync(file, 'utf8');
      for (const { old } of MERGES) {
        const [ns = '', keyPath = ''] = old.split(':');
        const re = new RegExp(
          `\\b(?:t|tCommon|tRef\\.current)\\(\\s*['"\`](?:${ns}:)?${keyPath.replace(/\./g, '\\.')}['"\`]`,
        );
        if (re.test(source)) offenders.push(`${path.relative(clientSrc, file)} -> ${old}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
