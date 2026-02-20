/**
 * Proxy E2E Tests: Reverse Proxy Setup
 *
 * Tests that the application works correctly through the nginx reverse proxy.
 * Validates PR #70 (trustProxy) implementation.
 */

import { test, expect } from '@playwright/test';
import { readFile } from 'fs/promises';
import { TEST_ADMIN, API } from '../../fixtures/testData.js';

// Read the proxy base URL from container state
let proxyBaseUrl: string;

test.beforeAll(async () => {
  try {
    const stateJson = await readFile('e2e/test-results/.state/containers.json', 'utf-8');
    const state = JSON.parse(stateJson);
    proxyBaseUrl = state.proxyBaseUrl;
    console.log(`Using proxy URL: ${proxyBaseUrl}`);
  } catch {
    // Fallback to environment variable
    proxyBaseUrl = process.env.PROXY_BASE_URL || 'http://localhost:8080';
    console.warn(`Could not read container state, using fallback proxy URL: ${proxyBaseUrl}`);
  }
});

test.describe('Reverse Proxy Setup', { tag: '@responsive' }, () => {
  test('should return healthy status through proxy', async ({ request }) => {
    // Given: A reverse proxy forwarding to the Cornerstone app
    // When: Checking the health endpoint through the proxy
    const response = await request.get(`${proxyBaseUrl}${API.health}`);

    // Then: The application should be healthy
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('status', 'ok');
  });

  test('should serve application through proxy', async ({ page }) => {
    // Given: A reverse proxy forwarding to the Cornerstone app
    // When: Navigating to the proxy URL
    await page.goto(proxyBaseUrl);

    // Then: The application should load correctly
    // Should redirect to /login since setup is already done via auth-setup
    await expect(page).toHaveURL(/\/(login)?$/);
  });

  test('should enforce auth guard through proxy', async ({ browser }) => {
    // Given: An unauthenticated user
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();

    // When: Attempting to access a protected route through the proxy
    await page.goto(`${proxyBaseUrl}/profile`);

    // Then: Should redirect to login
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test('should complete login flow through proxy', async ({ browser, browserName }) => {
    // WebKit has cookie-handling issues with session cookies set through nginx proxy:
    // the Set-Cookie from the login POST is not persisted in the browser context, so the
    // redirect after login loops back to /login. Desktop Chrome covers this scenario.
    test.skip(browserName === 'webkit', 'WebKit cookie handling through nginx proxy is unreliable');

    // Given: An unauthenticated user accessing the login page through proxy
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.goto(`${proxyBaseUrl}/login`);

    // When: Logging in with valid credentials
    await page.getByLabel(/email/i).fill(TEST_ADMIN.email);
    await page.getByLabel(/password/i).fill(TEST_ADMIN.password);
    await page.getByRole('button', { name: /sign in/i }).click();

    // Then: Should redirect away from login page (to dashboard or home)
    await expect(page).not.toHaveURL(/\/login/);

    await context.close();
  });

  test('should maintain session through proxy', async ({ browser, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit cookie handling through nginx proxy is unreliable');

    // Given: A user who logs in through the proxy
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();

    // When: Logging in through the proxy
    await page.goto(`${proxyBaseUrl}/login`);
    await page.getByLabel(/email/i).fill(TEST_ADMIN.email);
    await page.getByLabel(/password/i).fill(TEST_ADMIN.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).not.toHaveURL(/\/login/);

    // And: Navigating to a protected route
    await page.goto(`${proxyBaseUrl}/profile`);

    // Then: The session should persist and the page should load
    await expect(page.getByRole('heading', { name: 'Profile', level: 1 })).toBeVisible();

    await context.close();
  });

  test('should handle logout through proxy', async ({ browser, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit cookie handling through nginx proxy is unreliable');

    // Given: A user who is logged in through the proxy
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();

    // Login first
    await page.goto(`${proxyBaseUrl}/login`);
    await page.getByLabel(/email/i).fill(TEST_ADMIN.email);
    await page.getByLabel(/password/i).fill(TEST_ADMIN.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).not.toHaveURL(/\/login/);

    // When: Logging out through the proxy
    await page.goto(`${proxyBaseUrl}/profile`);

    // Open sidebar on mobile/tablet viewports where it's hidden
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 1024) {
      // Scope to header to avoid strict mode violation (sidebar also has a Close menu button)
      const menuButton = page
        .locator('header')
        .getByRole('button', { name: /Open menu|Close menu/ });
      await menuButton.click();
      // Wait for sidebar to open (CSS transform-based, not display-based)
      await page.locator('aside[data-open="true"]').waitFor({ timeout: 5000 });
    }

    const logoutButton = page.getByRole('button', { name: /logout/i });
    await logoutButton.click();

    // Then: Should redirect to login page
    await expect(page).toHaveURL(/\/login/);

    // And: Attempting to access a protected route should redirect back to login
    await page.goto(`${proxyBaseUrl}/profile`);
    await expect(page).toHaveURL(/\/login/);

    await context.close();
  });

  test('should correctly handle X-Forwarded headers', async ({ playwright }) => {
    // Use a fresh API context without inherited storageState cookies to avoid
    // stale session cookies interfering with the proxy login request.
    const request = await playwright.request.newContext();

    try {
      // Given: A reverse proxy that sets X-Forwarded-* headers
      // When: Making API requests through the proxy
      const loginResponse = await request.post(`${proxyBaseUrl}${API.login}`, {
        data: {
          email: TEST_ADMIN.email,
          password: TEST_ADMIN.password,
        },
      });

      // Then: Login should succeed (trust proxy is correctly configured)
      expect(loginResponse.ok()).toBeTruthy();

      // And: Session should be properly created with correct cookie attributes
      const meResponse = await request.get(`${proxyBaseUrl}${API.authMe}`);
      expect(meResponse.ok()).toBeTruthy();
      const meBody = await meResponse.json();
      expect(meBody.user).toBeTruthy();
    } finally {
      await request.dispose();
    }
  });

  test('should serve static assets through proxy', async ({ page }) => {
    // Given: A reverse proxy forwarding to the Cornerstone app
    // When: Loading the application through the proxy
    const response = await page.goto(proxyBaseUrl);

    // Then: The main page should load successfully
    expect(response?.ok()).toBeTruthy();

    // And: JavaScript and CSS assets should load successfully
    // Check for the React root element to ensure the app is rendered
    const rootElement = page.locator('#root');
    await expect(rootElement).toBeVisible();
  });

  test('should handle API errors through proxy', async ({ request }) => {
    // Given: A reverse proxy forwarding to the Cornerstone app
    // When: Making a request with invalid credentials through the proxy
    const loginResponse = await request.post(`${proxyBaseUrl}${API.login}`, {
      data: {
        email: TEST_ADMIN.email,
        password: 'wrong-password',
      },
    });

    // Then: Should receive proper error response
    expect(loginResponse.status()).toBe(401);
    const errorBody = await loginResponse.json();
    expect(errorBody).toHaveProperty('error');
    expect(errorBody.error).toHaveProperty('code');
    expect(errorBody.error).toHaveProperty('message');
  });
});
