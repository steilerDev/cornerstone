import { test as setup, expect } from '@playwright/test';
import { mkdir } from 'fs/promises';

const authFile = 'test-results/.auth/admin.json';

/**
 * Authentication setup for E2E tests.
 * This runs once before all test projects and creates an admin user.
 */
setup('authenticate as admin', async ({ page }) => {
  console.log('🔑 Setting up admin user for E2E tests...');

  // Navigate to the app (should redirect to /setup on fresh DB)
  await page.goto('/');

  // Wait for the setup page to load
  await expect(page).toHaveURL(/\/setup/);
  console.log('✅ Setup page loaded');

  // Fill out the admin setup form
  await page.getByLabel(/email/i).fill('admin@e2e-test.local');
  await page.getByLabel(/display name/i).fill('E2E Admin');
  await page.getByLabel(/^password$/i).fill('e2e-secure-password-123!');
  await page.getByLabel(/confirm password/i).fill('e2e-secure-password-123!');

  // Submit the form
  await page.getByRole('button', { name: /create admin/i }).click();

  // Wait for redirect to login page after successful setup
  await expect(page).toHaveURL(/\/login/);
  console.log('✅ Admin user created, redirected to login');

  // Log in with the newly created admin credentials
  await page.getByLabel(/email/i).fill('admin@e2e-test.local');
  await page.getByLabel(/password/i).fill('e2e-secure-password-123!');
  await page.getByRole('button', { name: /log in/i }).click();

  // Wait for successful login (redirect to home or dashboard)
  await expect(page).not.toHaveURL(/\/login/);
  console.log('✅ Admin logged in successfully');

  // Ensure the auth directory exists
  await mkdir('test-results/.auth', { recursive: true });

  // Save signed-in state to file
  await page.context().storageState({ path: authFile });
  console.log(`💾 Authentication state saved to ${authFile}`);
});
