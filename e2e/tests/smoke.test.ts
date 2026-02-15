import { test, expect } from '@playwright/test';

/**
 * Smoke tests to verify the E2E infrastructure is working correctly.
 */

test.describe('Infrastructure smoke tests', () => {
  test('should load the home page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/cornerstone/i);
  });

  test('should have a working health endpoint', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('status', 'ok');
  });
});
