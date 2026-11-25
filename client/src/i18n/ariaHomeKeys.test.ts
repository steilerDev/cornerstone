import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

type CommonJson = { aria: Record<string, string> };

function readCommon(locale: 'en' | 'de'): CommonJson {
  return JSON.parse(
    fs.readFileSync(path.join(dirname, locale, 'common.json'), 'utf-8'),
  ) as CommonJson;
}

describe('aria.logoHome (sidebar logo link name, #2261)', () => {
  it.each(['en', 'de'] as const)(
    '%s common.json has aria.logoHome with the app name placeholder and no aria.goToHome',
    (locale) => {
      const { aria } = readCommon(locale);
      expect(aria.logoHome).toEqual(expect.stringContaining('{{appName}}'));
      expect(aria).not.toHaveProperty('goToHome');
    },
  );
});
