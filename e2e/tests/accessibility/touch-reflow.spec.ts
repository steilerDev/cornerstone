/**
 * E2E: touch targets and reflow on the table pages (Story #2261, AC3).
 *
 * Mobile project only. (a) Every visible interactive element has a hit area of at least
 * 44 x 44 px at the device width (390 px), with the More sheet closed and once more open on
 * Home. (b) No page scrolls sideways at 320, 375 and 768 px (320 px stands in for 400% zoom).
 * The exemptions live in `TOUCH_TARGET_EXEMPTIONS` (fixtures/a11y.ts).
 */

import { test } from '../../fixtures/auth.js';
import { expectNoHorizontalOverflow, expectTouchTargets } from '../../fixtures/a11y.js';
import {
  A11Y_ROWS,
  cleanupA11y,
  emptySeed,
  openRow,
  seedA11y,
  seedTag,
} from '../../fixtures/a11yPages.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { routeUrl } from '../../../shared/src/routes/index.js';

const seed = emptySeed('');

const WIDTHS = [
  { width: 320, height: 640 },
  { width: 375, height: 667 },
  { width: 768, height: 1024 },
];

test.describe('Touch targets and reflow', { tag: '@responsive' }, () => {
  test.describe.configure({ mode: 'parallel' });

  test.beforeAll(async ({ browser }, testInfo) => {
    if (testInfo.project.name !== 'mobile') return;
    seed.tag = seedTag(testInfo.project.name, testInfo.workerIndex);
    await seedA11y(browser, seed);
  });

  test.afterAll(async ({ browser }, testInfo) => {
    if (testInfo.project.name !== 'mobile') return;
    await cleanupA11y(browser, seed);
  });

  // eslint-disable-next-line no-empty-pattern -- Playwright needs the destructuring to declare no fixtures
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'phone width only');
  });

  for (const row of A11Y_ROWS) {
    test(`${row.id}: every target is at least 44x44`, async ({ page }) => {
      await openRow(page, row, seed);
      await expectTouchTargets(page, { label: row.id });
    });

    test(`${row.id}: no sideways overflow at 320, 375 and 768 px`, async ({ page }) => {
      await openRow(page, row, seed);
      for (const size of WIDTHS) {
        await page.setViewportSize(size);
        await expectNoHorizontalOverflow(page, { label: `${row.id} at ${size.width}px` });
      }
    });
  }

  test('home with the More sheet open: every target is at least 44x44', async ({ page }) => {
    const appShell = new AppShellPage(page);
    await page.goto(routeUrl('home'));
    await appShell.openMoreSheet();
    await expectTouchTargets(page, { label: 'home with the More sheet open' });
  });
});
