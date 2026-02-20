/**
 * Custom Playwright fixtures for authentication
 */

import { test as base } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';

// Extend base test with custom fixtures
export const test = base.extend<{
  authenticatedPage: Page;
  testPrefix: string;
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

  // Unique prefix per worker+project to prevent data collisions in shared DB.
  // Format: "E2E-<3-char-project><workerIndex>" e.g. "E2E-des0", "E2E-tab2", "E2E-mob1"
  testPrefix: [
    async ({ authenticatedPage: _ap }, use, testInfo: TestInfo) => {
      const project = testInfo.project.name.slice(0, 3); // "des", "tab", "mob"
      await use(`E2E-${project}${testInfo.workerIndex}`);
    },
    { scope: 'test' },
  ],
});

export { expect } from '@playwright/test';
