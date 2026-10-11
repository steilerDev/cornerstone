/**
 * E2E New menu role parity (Story #2212 / EPIC-21, P1.6, scenario N6)
 *
 * A member sees the same New entries as an admin, on Home and on a Money page, on the surface
 * of the current width (top-bar menu from 1024px, New sheet below). Nothing in the menu is
 * admin-gated.
 *
 * Uses the same `isolatedUserPerWorker` value as member-access.spec.ts, so it shares that
 * worker's member user: no extra user, no extra login (rate limit).
 */

import { test, expect } from '../../fixtures/isolatedUser.js';
import type { Page } from '@playwright/test';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { ROUTES } from '../../fixtures/testData.js';
import {
  CREATE_ENTRY_LABELS,
  CreateMenu,
  GENERAL_CREATE_ENTRIES,
  MONEY_CREATE_ENTRIES,
} from '../../pages/components/CreateMenu.js';

test.use({
  isolatedUserPerWorker: {
    emailPrefix: 'member-access',
    displayName: 'E2E Member Access',
    role: 'member',
  },
});

async function rowLabels(page: Page, path: string): Promise<string[]> {
  const createMenu = new CreateMenu(page);
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await createMenu.open();
  return createMenu.rows().allTextContents();
}

test.describe('New menu for a member (#2212)', { tag: '@responsive' }, () => {
  test('N6: a member sees the same rows as an admin, with Money rows on Money pages', async ({
    page,
    browser,
  }) => {
    const general = GENERAL_CREATE_ENTRIES.map((id) => CREATE_ENTRY_LABELS[id]);
    const withMoney = [...GENERAL_CREATE_ENTRIES, ...MONEY_CREATE_ENTRIES].map(
      (id) => CREATE_ENTRY_LABELS[id],
    );

    expect(await rowLabels(page, ROUTES.home)).toEqual(general);
    expect(await rowLabels(page, routeUrl('budgetOverview'))).toEqual(withMoney);

    // The admin session gets exactly the same lists
    const adminContext = await browser.newContext({
      storageState: 'test-results/.auth/admin.json',
      viewport: page.viewportSize(),
    });
    try {
      const adminPage = await adminContext.newPage();
      expect(await rowLabels(adminPage, ROUTES.home)).toEqual(general);
      expect(await rowLabels(adminPage, routeUrl('budgetOverview'))).toEqual(withMoney);
    } finally {
      await adminContext.close();
    }
  });
});
