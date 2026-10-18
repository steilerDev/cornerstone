import { describe, it, expect } from '@jest/globals';
import { DOCS_BASE_URL, GITHUB_URL, HELP_URL } from './externalLinks.js';

describe('externalLinks', () => {
  it('builds HELP_URL from the documentation base URL with a trailing slash', () => {
    expect(HELP_URL).toBe(`${DOCS_BASE_URL}/`);
  });

  it('keeps the documentation base URL free of a trailing slash so paths can be appended', () => {
    expect(DOCS_BASE_URL).toBe('https://cornerstone.steiler.dev');
    expect(`${DOCS_BASE_URL}/guides/backup`).toBe('https://cornerstone.steiler.dev/guides/backup');
  });

  it('points GITHUB_URL at the project repository', () => {
    expect(GITHUB_URL).toBe('https://github.com/steilerDev/cornerstone');
  });
});
