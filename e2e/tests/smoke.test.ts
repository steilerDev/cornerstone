import { test, expect } from '@playwright/test';

/**
 * Smoke tests to verify the E2E infrastructure is working correctly.
 */

test.describe('Infrastructure smoke tests', () => {
  test('should load the home page', async ({ page }) => {
    await page.goto('/');
    // #2202: the tab title is "<page> · <house name or Cornerstone>". The shared E2E database
    // may hold a house name (settings-manage.spec.ts sets one concurrently), so only the
    // page segment is asserted.
    await expect(page).toHaveTitle(/^Home · /);
  });

  test('should have a working health endpoint', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('status', 'ok');
  });
});
