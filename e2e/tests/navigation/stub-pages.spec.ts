/**
 * Smoke tests for stub pages — Dashboard, Household Items, Documents
 *
 * These pages are placeholder implementations that will be expanded in future
 * epics.  The tests here verify that:
 *   - Each route loads without error
 *   - The correct h1 heading is rendered
 *   - A description paragraph is present
 *
 * When a stub page graduates to a full feature page, move its assertions into
 * a dedicated spec file and remove the corresponding test from here.
 *
 * NOTE: Timeline has graduated to a full feature page (EPIC-06). Its smoke
 * test now lives in e2e/tests/timeline/timeline-gantt.spec.ts.
 */

import { test, expect } from '../../fixtures/auth.js';
import { DashboardPage } from '../../pages/DashboardPage.js';
import { HouseholdItemsPage } from '../../pages/HouseholdItemsPage.js';
import { DocumentsPage } from '../../pages/DocumentsPage.js';

test.describe('Stub pages — smoke tests', { tag: '@responsive' }, () => {
  test('Dashboard page loads with heading', { tag: '@smoke' }, async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await expect(dashboard.heading).toBeVisible();
    await expect(dashboard.heading).toHaveText('Dashboard');
    await expect(dashboard.description).toBeVisible();
  });

  test('Household Items page loads with heading', async ({ page }) => {
    const householdItems = new HouseholdItemsPage(page);
    await householdItems.goto();
    await expect(householdItems.heading).toBeVisible();
    await expect(householdItems.heading).toHaveText('Household Items');
    await expect(householdItems.description).toBeVisible();
  });

  test('Documents page loads with heading', async ({ page }) => {
    const documents = new DocumentsPage(page);
    await documents.goto();
    await expect(documents.heading).toBeVisible();
    await expect(documents.heading).toHaveText('Documents');
    await expect(documents.description).toBeVisible();
  });
});
