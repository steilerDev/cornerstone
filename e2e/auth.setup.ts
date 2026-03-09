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

  // The setup endpoint creates a session automatically, so after setup:
  // /setup -> redirect to /login -> LoginPage detects session -> redirect to / -> /project/overview
  // Wait for the project overview to load (confirms session is active and redirects completed)
  await expect(page.getByRole('heading', { name: 'Project', level: 1 })).toBeVisible({
    timeout: 15000,
  });
  console.log('✅ Admin user created, session established, redirected to project overview');

  // Ensure the auth directory exists
  await mkdir('test-results/.auth', { recursive: true });

  // Save signed-in state to file
  await page.context().storageState({ path: authFile });
  console.log(`💾 Authentication state saved to ${authFile}`);
});
