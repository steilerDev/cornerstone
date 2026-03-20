import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for design review screenshot capture.
 *
 * This config is completely isolated from the main E2E test suite.
 * It runs only the design-review tests and captures screenshots across
 * three viewports (desktop, tablet, mobile) for design consistency review.
 *
 * Run locally:  npx playwright test --config=design-review.config.ts
 * Run via CI:   Triggered by the design-review-screenshots workflow
 */
export default defineConfig({
  testDir: './tests/design-review',
  outputDir: './design-review-output',

  fullyParallel: false, // Sequential to avoid data race conditions during seeding
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1, // Single worker — screenshots must be deterministic

  reporter: [['list']],

  use: {
    baseURL: process.env.APP_BASE_URL || 'http://localhost:3000',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },

  globalSetup: './containers/setup.ts',
  globalTeardown: './containers/teardown.ts',

  timeout: 60_000, // Screenshots need more time (theme toggling, waiting for renders)

  projects: [
    // Auth setup — runs first
    {
      name: 'auth-setup',
      testDir: '.',
      testMatch: /auth\.setup\.ts/,
      timeout: 120000,
    },

    // Desktop (1920x1080)
    {
      name: 'desktop',
      dependencies: ['auth-setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        storageState: 'test-results/.auth/admin.json',
      },
    },

    // Tablet (iPad)
    {
      name: 'tablet',
      dependencies: ['auth-setup'],
      use: {
        ...devices['iPad (gen 7)'],
        storageState: 'test-results/.auth/admin.json',
      },
    },

    // Mobile (iPhone 13)
    {
      name: 'mobile',
      dependencies: ['auth-setup'],
      use: {
        ...devices['iPhone 13'],
        storageState: 'test-results/.auth/admin.json',
      },
    },
  ],
});
