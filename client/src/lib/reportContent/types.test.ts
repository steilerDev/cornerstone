import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { REPORT_SKIP_REASONS } from './types.js';

describe('REPORT_SKIP_REASONS', () => {
  it('lists the skip reasons in declaration order', () => {
    expect([...REPORT_SKIP_REASONS]).toEqual(['footnoteFetchFailed', 'footnoteInvalidPdf']);
  });

  it('contains every reason attachments.ts emits via skip()', () => {
    const source = readFileSync(
      new URL('../reportPdf/attachments.ts', import.meta.url).pathname,
      'utf8',
    );
    const emitted = new Set([...source.matchAll(/\bskip\('(\w+)'\)/g)].map((m) => m[1]));

    expect(emitted.size).toBeGreaterThan(0);
    for (const reason of emitted) {
      expect(REPORT_SKIP_REASONS).toContain(reason);
    }
  });
});
