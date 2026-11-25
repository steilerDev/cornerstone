/**
 * Reads one string value from a client locale file so a spec compares against the shipped text
 * instead of a copy of it (#2258), e.g. `i18nValue('de', 'auth', 'login.title')`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { BrowserContextOptions, TestInfo } from '@playwright/test';

const I18N_DIR = fileURLToPath(new URL('../../client/src/i18n/', import.meta.url));

export function i18nValue(lang: 'en' | 'de', namespace: string, key: string): string {
  let node: unknown = JSON.parse(readFileSync(`${I18N_DIR}${lang}/${namespace}.json`, 'utf8'));
  for (const part of key.split('.')) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  if (typeof node !== 'string') throw new Error(`i18n key ${lang}/${namespace}:${key} missing`);
  return node;
}

/**
 * The running project's viewport and touch settings, for a hand-made `browser.newContext()` so a
 * phone or tablet run keeps its layout.
 */
export function projectContextOptions(testInfo: TestInfo): BrowserContextOptions {
  const use = testInfo.project.use;
  const options: BrowserContextOptions = {};
  if (use.viewport) options.viewport = use.viewport;
  if (use.hasTouch !== undefined) options.hasTouch = use.hasTouch;
  if (use.isMobile !== undefined) options.isMobile = use.isMobile;
  if (use.userAgent !== undefined) options.userAgent = use.userAgent;
  if (use.deviceScaleFactor !== undefined) options.deviceScaleFactor = use.deviceScaleFactor;
  return options;
}
