/**
 * Smoke tests for stub pages — Dashboard
 *
 * These pages are placeholder implementations that will be expanded in future
 * epics.  The tests here verify that:
 *   - Each route loads without error
 *   - The correct h1 heading is rendered
 *
 * As each page gets its own full test suite, the corresponding smoke test here
 * can be removed or moved into the page-specific spec file.
 *
 * NOTE: Household Items has graduated to a full feature page (EPIC-04). Its
 * tests now live in e2e/tests/household-items/.
 */

import { test, expect } from '../../fixtures/auth.js';
import { DashboardPage } from '../../pages/DashboardPage.js';

test.describe('Stub pages — smoke tests', { tag: '@responsive' }, () => {
  test('Dashboard page loads with heading and card grid', { tag: '@smoke' }, async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await expect(dashboard.heading).toBeVisible();
    await expect(dashboard.heading).toHaveText('Project');
    await expect(dashboard.cardGrid).toBeVisible();
  });
});
