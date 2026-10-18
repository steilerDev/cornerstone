import { describe, it, expect } from '@jest/globals';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DOCS_BASE_URL } from '../../lib/externalLinks.js';
import { INTEGRATION_ANCHORS } from '../../navigation/IntegrationsLink.js';
import { INTEGRATION_GUIDE_PATHS, integrationGuideUrl } from './integrationGuides.js';

const DOCS_SRC = resolve(process.cwd(), 'docs/src');

function guideExists(path: string): boolean {
  return [`${path}.md`, `${path}.mdx`, `${path}/index.md`, `${path}/index.mdx`].some((file) =>
    existsSync(resolve(DOCS_SRC, file)),
  );
}

describe('INTEGRATION_GUIDE_PATHS', () => {
  it('has exactly one guide per anchor', () => {
    expect(Object.keys(INTEGRATION_GUIDE_PATHS).sort()).toEqual([...INTEGRATION_ANCHORS].sort());
  });

  it('runs from the repository root so the docs folder is found', () => {
    expect(existsSync(DOCS_SRC)).toBe(true);
  });

  it.each(Object.entries(INTEGRATION_GUIDE_PATHS))(
    'the %s guide (%s) exists under docs/src',
    (_anchor, path) => {
      expect(path.startsWith('/')).toBe(false);
      expect(guideExists(path)).toBe(true);
    },
  );
});

describe('integrationGuideUrl', () => {
  it.each(INTEGRATION_ANCHORS)('joins the docs base URL and the %s path', (anchor) => {
    expect(integrationGuideUrl(anchor)).toBe(`${DOCS_BASE_URL}/${INTEGRATION_GUIDE_PATHS[anchor]}`);
  });
});
