/**
 * Smoke tests for the page every session lands on — Home
 *
 * The tests here verify that:
 *   - The route loads without error
 *   - The correct h1 heading is rendered
 *
 * The full Home suite lives in home.spec.ts; the smoke test stays here so the critical-path
 * check is part of the smoke run.
 *
 * NOTE: Household Items has graduated to a full feature page (EPIC-04). Its
 * tests now live in e2e/tests/household-items/.
 */

import { test, expect } from '../../fixtures/auth.js';
import { HomePage } from '../../pages/HomePage.js';

test.describe('Smoke tests — Home', { tag: '@responsive' }, () => {
  test(
    'Home page loads with its heading and the footer link',
    { tag: '@smoke' },
    async ({ page }) => {
      const home = new HomePage(page);
      await home.goto();
      await expect(home.heading).toBeVisible();
      await expect(home.heading).toHaveText('Home');
      await expect(home.footerHistoryLink).toBeVisible();
    },
  );
});
