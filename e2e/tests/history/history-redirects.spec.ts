/**
 * E2E: the Site diary's old `?filterMode` links land on History (#2224, EPIC-21 P2.5).
 *
 * The two links are page-served query maps (route map `interim: 'page'`): the Site diary does one
 * `replace` navigation before its list mounts, so Back leaves the app instead of bouncing, and no
 * diary request is made. Desktop-independent logic, but it runs on every viewport project
 * because the filter panel it lands on differs by width.
 *
 * Scenarios
 * - R1  /diary?filterMode=automatic&types=invoice_status,daily_log&q=zz
 *       -> /history?q=zz&type=invoice_status in one replace (Back goes to the page before)
 * - R2  /diary?filterMode=all -> /history?include=diary (checkbox checked)
 * - R3  /diary?filterMode=manual stays on the Site diary: no system events, History link shown
 */

import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { installRouteLog, readRouteLog } from '../../fixtures/routeLog.js';
import { DiaryPage } from '../../pages/DiaryPage.js';
import { HistoryPage } from '../../pages/HistoryPage.js';

test.describe('Site diary ?filterMode links go to History', { tag: '@responsive' }, () => {
  test('R1: filterMode=automatic lands on /history with q and the first History type, in one replace', async ({
    page,
  }) => {
    const history = new HistoryPage(page);
    const diaryListRequests: string[] = [];
    await installRouteLog(page);

    // A page before the legacy link, so "Back" has somewhere to go (the Home page itself may
    // read the diary, so the request listener starts after it has settled)
    await page.goto(routeUrl('dashboard'));
    await expect(page.locator('main h1').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === '/api/diary-entries' && request.method() === 'GET') {
        diaryListRequests.push(request.url());
      }
    });
    await page.goto(
      `${routeUrl('diary')}?filterMode=automatic&types=invoice_status,daily_log&q=zz`,
    );

    await expect(page).toHaveURL(
      (url) =>
        url.pathname === routeUrl('history') &&
        url.searchParams.get('q') === 'zz' &&
        url.searchParams.get('type') === 'invoice_status' &&
        !url.searchParams.has('filterMode') &&
        !url.searchParams.has('types'),
    );
    await expect(history.heading).toBeVisible();

    // The History page shows the carried filters
    await history.openFiltersIfCollapsed();
    await expect(history.typeChip('invoice_status')).toHaveAttribute('aria-pressed', 'true');
    await expect(history.searchInput).toHaveValue('zz');

    // One replaceState, no push, no stop on the way
    const log = await readRouteLog(page);
    expect(log.filter((entry) => entry.kind === 'pushState')).toEqual([]);
    expect(log.map((entry) => new URL(entry.url).pathname)).toEqual([routeUrl('history')]);

    // The diary list never mounted
    expect(diaryListRequests, 'no diary list request is made').toEqual([]);

    // Back leaves the app's previous page; it does not return to /diary
    await page.goBack();
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('dashboard'));
  });

  test('R2: filterMode=all lands on /history?include=diary with the toggle on', async ({
    page,
  }) => {
    const history = new HistoryPage(page);
    await page.goto(`${routeUrl('diary')}?filterMode=all`);

    await expect(page).toHaveURL(
      (url) =>
        url.pathname === routeUrl('history') && url.search === '?include=diary' && url.hash === '',
    );
    await expect(history.heading).toBeVisible();
    await history.openFiltersIfCollapsed();
    await expect(history.includeDiaryCheckbox).toBeChecked();
    await expect(history.typeChipGroup.locator('[aria-pressed="true"]')).toHaveCount(0);
  });

  test('R3: filterMode=manual stays on the Site diary without system events', async ({ page }) => {
    const diary = new DiaryPage(page);
    const automaticRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === '/api/diary-entries' && url.searchParams.get('automatic') !== 'false') {
        automaticRequests.push(request.url());
      }
    });

    await page.goto(`${routeUrl('diary')}?filterMode=manual`);
    await diary.heading.waitFor({ state: 'visible' });
    await diary.waitForLoaded();

    // Nothing is rewritten
    await expect(page).toHaveURL(
      (url) => url.pathname === routeUrl('diary') && url.search === '?filterMode=manual',
    );
    await expect(diary.systemEventRowsAny()).toHaveCount(0);
    await expect(diary.modeChips).toHaveCount(0);
    await diary.openFiltersIfCollapsed();
    await expect(diary.historyLink).toBeVisible();
    expect(automaticRequests, 'every diary list request asks for automatic=false').toEqual([]);
  });
});
