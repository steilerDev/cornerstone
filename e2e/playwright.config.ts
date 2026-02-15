import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  outputDir: './playwright-output',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 1 : 0,

  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['html', { outputFolder: 'playwright-report' }], ['list']],

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.APP_BASE_URL || 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'retain-on-failure',

    /* Take screenshot only on failure */
    screenshot: 'only-on-failure',

    /* Record video on failure for CI debugging */
    video: 'retain-on-failure',
  },

  /* Global setup and teardown */
  globalSetup: './containers/setup.ts',
  globalTeardown: './containers/teardown.ts',

  /* Configure projects for major browsers */
  projects: [
    // Authentication setup project - runs first
    {
      name: 'auth-setup',
      testDir: '.',
      testMatch: /auth\.setup\.ts/,
      timeout: 120000, // 2 minutes for setup
    },

    // Desktop large viewport (1920x1080)
    {
      name: 'desktop-lg',
      dependencies: ['auth-setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        storageState: 'test-results/.auth/admin.json',
      },
    },

    // Desktop medium viewport (1440x900)
    {
      name: 'desktop-md',
      dependencies: ['auth-setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: 'test-results/.auth/admin.json',
      },
    },

    // Tablet viewport (iPad Gen 7)
    {
      name: 'tablet',
      dependencies: ['auth-setup'],
      use: {
        ...devices['iPad (gen 7)'],
        storageState: 'test-results/.auth/admin.json',
      },
    },

    // Mobile iPhone viewport (iPhone 13)
    {
      name: 'mobile-iphone',
      dependencies: ['auth-setup'],
      use: {
        ...devices['iPhone 13'],
        storageState: 'test-results/.auth/admin.json',
      },
    },

    // Mobile Android viewport (Pixel 5)
    {
      name: 'mobile-android',
      dependencies: ['auth-setup'],
      use: {
        ...devices['Pixel 5'],
        storageState: 'test-results/.auth/admin.json',
      },
    },
  ],

  /* Test timeout */
  timeout: 30000, // 30 seconds per test

  /* Global timeout: cap the entire suite at 45 minutes on CI to prevent stuck runs */
  globalTimeout: process.env.CI ? 45 * 60 * 1000 : undefined,
});
