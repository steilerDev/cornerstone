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

  /* CI workers: 2x vCPU count (4 vCPUs on ubuntu-latest). Profiling showed 12 workers
     causes load avg 126+ and 208 test failures from CPU contention. Memory headroom
     exists (9.7/16 GB) but browsers are CPU-heavy. 8 workers is the sweet spot. */
  workers: process.env.CI ? 8 : undefined,

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

    /* Fail click()/fill() fast instead of falling through to test timeout */
    actionTimeout: 5000,

    /* Fail page.goto() at 10s instead of test timeout */
    navigationTimeout: 10000,
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

    // Desktop (1920x1080, chromium) — all tests
    {
      name: 'desktop',
      dependencies: ['auth-setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        storageState: 'test-results/.auth/admin.json',
      },
    },

    // Tablet (iPad Gen 7, webkit) — all tests, provides webkit engine coverage
    {
      name: 'tablet',
      dependencies: ['auth-setup'],
      timeout: 30_000, // WebKit is significantly slower than Chromium
      use: {
        ...devices['iPad (gen 7)'],
        storageState: 'test-results/.auth/admin.json',
      },
    },

    // Mobile (iPhone 13, webkit) — only @responsive-tagged tests
    {
      name: 'mobile',
      dependencies: ['auth-setup'],
      grep: /@responsive/,
      timeout: 30_000, // WebKit is significantly slower than Chromium
      use: {
        ...devices['iPhone 13'],
        storageState: 'test-results/.auth/admin.json',
      },
    },
  ],

  /* Test timeout — most passing tests complete in 2-5s; some multi-step tests need up to 10s */
  timeout: 10_000, // 10 seconds per test (desktop default)

  /* Global timeout: cap the entire suite at 30 minutes on CI to prevent stuck runs */
  globalTimeout: process.env.CI ? 30 * 60 * 1000 : undefined,
});
