/**
 * E2E tests for the phone page gutter (EPIC-21, PR #2290)
 *
 * At 375px every page's content sits 16px from each side of the viewport, whether the page uses
 * PageLayout (Companies, work item detail) or its own container (Site diary). Mobile project only.
 * The first block under `main` is measured: its box is the page's content column.
 */

import { mockConfig } from '../../fixtures/paperlessInvoiceMocks.js';
import type { Page } from '@playwright/test';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { test, expect } from '../../fixtures/auth.js';
import { createWorkItemViaApi, deleteWorkItemViaApi } from '../../fixtures/apiHelpers.js';
import { ROUTES } from '../../fixtures/testData.js';

const VIEWPORT_WIDTH = 375;
const GUTTER = 16;

async function expectGutters(page: Page): Promise<void> {
  const edges = await page.evaluate(() => {
    const main = document.querySelector('main');
    const block = main?.firstElementChild;
    if (!block) return null;
    const rect = block.getBoundingClientRect();
    return { left: rect.left, right: document.documentElement.clientWidth - rect.right };
  });
  expect(edges, 'main has a content block').not.toBeNull();
  expect(Math.abs((edges?.left ?? 0) - GUTTER)).toBeLessThanOrEqual(1);
  expect(Math.abs((edges?.right ?? 0) - GUTTER)).toBeLessThanOrEqual(1);
}

test.describe('Phone page gutter', { tag: '@responsive' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: VIEWPORT_WIDTH, height: 900 });
  });

  test('a list page (Companies) has 16px gutters', async ({ page }) => {
    await page.goto(ROUTES.companies);
    await expect(page.locator('main h1').first()).toBeVisible();
    await expectGutters(page);
  });

  test('a detail page (work item) has 16px gutters', async ({ page, testPrefix }) => {
    const id = await createWorkItemViaApi(page, { title: `${testPrefix} Gutter work item` });
    try {
      await page.goto(routeUrl('workItem', { id }));
      await expect(page.locator('main h1').first()).toBeVisible();
      await expectGutters(page);
    } finally {
      await deleteWorkItemViaApi(page, id);
    }
  });

  test('a diary page (Site diary) has 16px gutters', async ({ page }) => {
    await page.goto(ROUTES.diary);
    await expect(page.locator('main h1').first()).toBeVisible();
    await expectGutters(page);
  });

  test('the Paperless review page heading sits 16px from the left edge', async ({ page }) => {
    // With the AI reader off the route redirects to the New invoice dialog (#2241): turn it on
    await mockConfig(page, true);
    await page.goto(routeUrl('invoicePaperlessReview', undefined, { documentId: 1 }));
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('invoicePaperlessReview'));
    const heading = page.locator('main h1').first();
    await expect(heading).toBeVisible();
    const box = await heading.boundingBox();
    expect(Math.abs((box?.x ?? 0) - GUTTER)).toBeLessThanOrEqual(1);
  });
});
