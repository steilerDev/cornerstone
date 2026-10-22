/**
 * E2E tests for the ReferenceList search on Settings > Project setup (#2234, EPIC-21).
 *
 * The three reference lists (cost categories, purchase categories, photo orientations) show a
 * search field from 8 rows (or while a query is typed), filter live by name and description,
 * disable reorder while a query is active (the handle and the ⋯ Move up / Move down), and show a
 * "No ... match." empty state whose "Clear search" action refocuses the field. The h2 carries the
 * total row count "(n)".
 *
 * The lists are GLOBAL (every worker shares them), so these tests mock the list GET with
 * synthetic rows (`mockReferenceList`) instead of creating real rows: a deterministic row count
 * is needed to test the 8-row threshold, and real creates/deletes would race with other workers.
 * All names are invented and carry the per-test prefix.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { mockReferenceList } from '../../fixtures/referenceListMocks.js';
import type { MockedListKey, MockedRow } from '../../fixtures/referenceListMocks.js';
import { ProjectSetupPage } from '../../pages/ProjectSetupPage.js';
import type { ReferenceListControl } from '../../pages/ProjectSetupPage.js';

function makeRows(prefix: string, count: number, label = 'Example category'): MockedRow[] {
  return Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return { id: `${prefix}-id-${n}`, name: `${prefix} ${label} ${n}` };
  });
}

async function openWithRows(
  page: Page,
  key: MockedListKey,
  mocked: MockedRow[],
): Promise<{ setup: ProjectSetupPage; list: ReferenceListControl }> {
  await mockReferenceList(page, key, mocked);
  const setup = new ProjectSetupPage(page);
  await setup.goto();
  return { setup, list: setup[key] };
}

test.describe('Project setup — list search (#2234)', { tag: '@responsive' }, () => {
  test('Scenario 1: search appears from 8 rows and the heading shows the total', async ({
    page,
    testPrefix,
  }) => {
    const { list } = await openWithRows(page, 'costCategories', makeRows(testPrefix, 8));

    await expect(list.searchInput).toBeVisible();
    await expect(list.items).toHaveCount(8);
    await expect(list.heading).toContainText('Cost categories');
    await expect(list.count).toHaveText('(8)');
  });

  test('Scenario 1b: purchase categories and orientations offer the search too', async ({
    page,
    testPrefix,
  }) => {
    await mockReferenceList(page, 'purchaseCategories', makeRows(testPrefix, 9, 'Purchase group'));
    await mockReferenceList(page, 'orientations', makeRows(testPrefix, 8, 'Orientation'));
    const setup = new ProjectSetupPage(page);
    await setup.goto();

    await expect(setup.purchaseCategories.searchInput).toBeVisible();
    await expect(setup.purchaseCategories.count).toHaveText('(9)');
    await expect(setup.orientations.searchInput).toBeVisible();
    await expect(setup.orientations.count).toHaveText('(8)');
  });

  test('Scenario 2: below 8 rows there is no search field, but the count is shown', async ({
    page,
    testPrefix,
  }) => {
    const { list } = await openWithRows(
      page,
      'orientations',
      makeRows(testPrefix, 7, 'Orientation'),
    );

    await expect(list.items).toHaveCount(7);
    await expect(list.count).toHaveText('(7)');
    await expect(list.searchInput).toHaveCount(0);
  });

  test('Scenario 3: typing filters the rows live; the heading total stays unfiltered', async ({
    page,
    testPrefix,
  }) => {
    const mocked = makeRows(testPrefix, 10);
    const { list } = await openWithRows(page, 'costCategories', mocked);

    // Rows 01-09 contain "category 0"; row 10 does not
    await list.searchInput.fill('category 0');
    await expect(list.items).toHaveCount(9);

    await list.searchInput.fill('category 07');
    await expect(list.items).toHaveCount(1);
    await expect(list.row(mocked[6]!.name)).toBeVisible();
    await expect(list.count).toHaveText('(10)');

    await list.searchInput.fill('');
    await expect(list.items).toHaveCount(10);
  });

  test('Scenario 3b: the search also matches the description', async ({ page, testPrefix }) => {
    const mocked = makeRows(testPrefix, 8).map((row, i) =>
      i === 4 ? { ...row, description: 'Zebra note' } : row,
    );
    const { list } = await openWithRows(page, 'costCategories', mocked);

    await list.searchInput.fill('zebra');
    await expect(list.items).toHaveCount(1);
    await expect(list.row(mocked[4]!.name)).toBeVisible();
  });

  test('Scenario 3c: reordering is disabled while a query is active and restored after', async ({
    page,
    testPrefix,
  }) => {
    const mocked = makeRows(testPrefix, 8);
    const mock = await mockReferenceList(page, 'costCategories', mocked);
    const setup = new ProjectSetupPage(page);
    await setup.goto();
    const list = setup.costCategories;
    const first = mocked[0]!.name;

    await list.searchInput.fill('category 0');
    await expect(list.items).toHaveCount(8);
    await expect(list.handle(first)).toHaveAttribute('aria-disabled', 'true');

    // Keyboard pick-up does nothing: no reorder request, order unchanged
    await list.focusHandle(first);
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space');
    await expect(list.items.first()).toContainText(first);
    expect(mock.requests).toHaveLength(0);

    // ⋯ Move up / Move down are aria-disabled (also on a middle row)
    await list.openMenu(mocked[3]!.name);
    await expect(list.menuItem('Move up')).toHaveAttribute('aria-disabled', 'true');
    await expect(list.menuItem('Move down')).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');

    // Clearing the query restores reordering
    await list.searchInput.fill('');
    await expect(list.handle(first)).not.toHaveAttribute('aria-disabled', 'true');
    await list.openMenu(mocked[3]!.name);
    await expect(list.menuItem('Move up')).not.toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
  });

  test('Scenario 4: no match shows the empty state; Clear search restores the list and refocuses the field', async ({
    page,
    testPrefix,
  }) => {
    const { list } = await openWithRows(page, 'costCategories', makeRows(testPrefix, 8));

    await list.searchInput.fill('zzz-no-such-category');
    await expect(list.section).toContainText('No cost categories match.');
    await expect(list.items).toHaveCount(0);
    // The field stays so the query can be edited; the total is unfiltered
    await expect(list.searchInput).toBeVisible();
    await expect(list.count).toHaveText('(8)');

    await list.clearSearchButton.click();
    await expect(list.searchInput).toHaveValue('');
    await expect(list.searchInput).toBeFocused();
    await expect(list.items).toHaveCount(8);
    await expect(list.section).not.toContainText('No cost categories match.');
  });

  test('Scenario 6: the Project setup h1 and tab title are unchanged', async ({
    page,
    testPrefix,
  }) => {
    const { setup } = await openWithRows(page, 'costCategories', makeRows(testPrefix, 8));

    await expect(setup.heading).toBeVisible();
    await expect(page).toHaveTitle(/Project setup/);
  });
});
