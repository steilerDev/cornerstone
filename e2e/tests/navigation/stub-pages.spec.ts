/**
 * Smoke tests for stub pages — Dashboard
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
 * NOTE: Documents page was removed (standalone browser unnecessary). Document
 * linking tests remain in e2e/tests/documents/documents-linked-sections.spec.ts.
 * NOTE: Household Items has graduated to a full feature page (EPIC-04). Its
 * tests now live in e2e/tests/household-items/.
 */

import { test, expect } from '../../fixtures/auth.js';
import { DashboardPage } from '../../pages/DashboardPage.js';

test.describe('Stub pages — smoke tests', { tag: '@responsive' }, () => {
  test('Dashboard page loads with heading', { tag: '@smoke' }, async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await expect(dashboard.heading).toBeVisible();
    await expect(dashboard.heading).toHaveText('Project');
    await expect(dashboard.description).toBeVisible();
  });
});
