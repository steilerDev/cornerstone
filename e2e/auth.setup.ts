import { test as setup, expect } from '@playwright/test';
import { mkdir } from 'fs/promises';

const authFile = 'test-results/.auth/admin.json';

/**
 * Authentication setup for E2E tests.
 * This runs once before all test projects and creates an admin user.
 */
setup('authenticate as admin', async ({ page }) => {
  console.log('🔑 Setting up admin user for E2E tests...');

  // Capture browser console logs for debugging
  page.on('console', (msg) => console.log(`[browser] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', (error) => console.error(`[browser error] ${error.message}`));

  // Navigate to the app (should redirect to /setup on fresh DB)
  await page.goto('/');

  // Wait for the setup page to load
  await expect(page).toHaveURL(/\/setup/);
  console.log('✅ Setup page loaded');

  // Wait for the form to be ready (loading state resolves)
  await expect(page.getByRole('button', { name: /create admin/i })).toBeVisible();
  console.log('✅ Setup form rendered');

  // Fill out the admin setup form
  await page.getByLabel('Email').fill('admin@e2e-test.local');
  await page.getByLabel('Display Name').fill('E2E Admin');
  await page.getByLabel('Password', { exact: true }).fill('e2e-secure-password-123!');
  await page.getByLabel('Confirm Password').fill('e2e-secure-password-123!');
  console.log('✅ Form fields filled');

  // Submit the form and wait for the API response
  const [response] = await Promise.all([
    page.waitForResponse((resp) => resp.url().includes('/api/auth/setup')),
    page.getByRole('button', { name: /create admin/i }).click(),
  ]);

  console.log(`📡 Setup API response: ${response.status()} ${response.statusText()}`);
  if (!response.ok()) {
    const body = await response.text();
    console.error(`❌ Setup API error body: ${body}`);
  }

  // Wait for redirect to login page after successful setup (longer timeout for safety)
  await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
  console.log('✅ Admin user created, redirected to login');

  // Log in with the newly created admin credentials
  await expect(page.getByRole('button', { name: /log in/i })).toBeVisible();
  await page.getByLabel('Email').fill('admin@e2e-test.local');
  await page.getByLabel('Password').fill('e2e-secure-password-123!');

  const [loginResponse] = await Promise.all([
    page.waitForResponse((resp) => resp.url().includes('/api/auth/login')),
    page.getByRole('button', { name: /log in/i }).click(),
  ]);

  console.log(`📡 Login API response: ${loginResponse.status()} ${loginResponse.statusText()}`);

  // Wait for successful login (redirect to home or dashboard)
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 });
  console.log('✅ Admin logged in successfully');

  // Ensure the auth directory exists
  await mkdir('test-results/.auth', { recursive: true });

  // Save signed-in state to file
  await page.context().storageState({ path: authFile });
  console.log(`💾 Authentication state saved to ${authFile}`);
});
