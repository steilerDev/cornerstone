import { describe, it, expect } from '@jest/globals';
import { DOCS_BASE_URL, HOME_HELP_URL } from './externalLinks.js';

describe('HOME_HELP_URL (#2230)', () => {
  it('points at the "What moved where" docs page under the docs base URL', () => {
    expect(HOME_HELP_URL).toBe(`${DOCS_BASE_URL}/guides/home/what-moved-where`);
    expect(HOME_HELP_URL).toBe('https://cornerstone.steiler.dev/guides/home/what-moved-where');
  });
});
