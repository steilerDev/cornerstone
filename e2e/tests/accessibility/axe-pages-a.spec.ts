/**
 * E2E: axe-core on the table pages, first half of the table (Story #2261, AC1 and AC4).
 *
 * One test per page; both themes run inside it so a failure names the page. The scan uses the
 * WCAG 2.0/2.1 A and AA tags, with no disabled rule and no excluded element. Runs on desktop,
 * tablet and mobile. The table is split in two files for shard balance (fixtures/a11yPages.ts).
 * Data is synthetic and removed in afterAll.
 */

import { test } from '../../fixtures/auth.js';
import { expectNoAxeViolations } from '../../fixtures/a11y.js';
import { enableDarkTheme } from '../../fixtures/darkMode.js';
import {
  A11Y_ROWS_A,
  cleanupA11y,
  emptySeed,
  openRow,
  seedA11y,
  seedTag,
} from '../../fixtures/a11yPages.js';

const seed = emptySeed('');

test.describe(
  'Axe: no WCAG A/AA violations (first half of the pages)',
  { tag: '@responsive' },
  () => {
    test.describe.configure({ mode: 'parallel' });

    test.beforeAll(async ({ browser }, testInfo) => {
      seed.tag = seedTag(testInfo.project.name, testInfo.workerIndex);
      await seedA11y(browser, seed);
    });

    test.afterAll(async ({ browser }) => {
      await cleanupA11y(browser, seed);
    });

    for (const row of A11Y_ROWS_A) {
      test(`${row.id}: light and dark`, async ({ page }, testInfo) => {
        const label = `${row.id} ${testInfo.project.name}`;
        await openRow(page, row, seed);
        await expectNoAxeViolations(page, { label: `${label} light` });
        await enableDarkTheme(page);
        await expectNoAxeViolations(page, { label: `${label} dark` });
      });
    }
  },
);
