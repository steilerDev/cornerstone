/**
 * Custom Playwright fixtures for authentication
 */

import { test as base } from '@playwright/test';
import type { Page } from '@playwright/test';

// Extend base test with custom fixtures
export const test = base.extend<{
  authenticatedPage: Page;
}>({
  authenticatedPage: async ({ browser }, use) => {
    // Create a context with the admin storage state
    const context = await browser.newContext({
      storageState: 'test-results/.auth/admin.json',
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect } from '@playwright/test';
