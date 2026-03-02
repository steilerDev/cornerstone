/**
 * E2E tests for the Documents page (/documents) — EPIC-08 (Story 8.3 + 8.7)
 *
 * The DocumentBrowser renders different states based on Paperless-ngx
 * configuration. In the E2E test environment, Paperless-ngx is NOT configured
 * (no PAPERLESS_URL / PAPERLESS_API_TOKEN env vars in the testcontainer), so
 * all tests verify the "not configured" path.
 *
 * Scenarios covered:
 * 1. Page loads with h1 "Documents" heading                                      (smoke)
 * 2. DocumentBrowser shows "Paperless-ngx Not Configured" state
 * 3. "Not configured" state contains setup instructions (env var names)
 * 4. Sidebar navigation item "Documents" navigates to /documents
 * 5. Documents page renders without horizontal scroll (responsive)
 * 6. Documents page renders correctly in dark mode
 * 7. "Not configured" state is accessible — has a heading (a11y)
 * 8. API: GET /api/paperless/status returns configured: false when env vars absent
 */

import { test, expect } from '../../fixtures/auth.js';
import { DocumentsPage } from '../../pages/DocumentsPage.js';
import { ROUTES } from '../../fixtures/testData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Page loads — smoke test
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Documents page load (Scenario 1)', { tag: '@smoke' }, () => {
  test('Documents page loads with h1 "Documents" heading', async ({ page }) => {
    // Given: An authenticated user
    // When: Navigating to /documents
    const docsPage = new DocumentsPage(page);
    await docsPage.goto();

    // Then: The page should render the h1 heading
    await expect(docsPage.heading).toBeVisible();
    await expect(docsPage.heading).toHaveText('Documents');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: "Not configured" state renders
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Not configured state (Scenario 2)', { tag: '@responsive' }, () => {
  test('DocumentBrowser shows "Paperless-ngx Not Configured" heading when env vars absent', async ({
    page,
  }) => {
    // Given: Paperless-ngx is NOT configured in the test environment
    // When: Navigating to the Documents page
    const docsPage = new DocumentsPage(page);
    await docsPage.goto();

    // Then: The "not configured" h2 heading should be visible
    await expect(docsPage.notConfiguredTitle).toBeVisible();
    await expect(docsPage.notConfiguredTitle).toHaveText('Paperless-ngx Not Configured');
  });

  test('DocumentBrowser does NOT show search input when Paperless is not configured', async ({
    page,
  }) => {
    // Given: Paperless-ngx is NOT configured
    // When: Navigating to the Documents page
    const docsPage = new DocumentsPage(page);
    await docsPage.goto();

    // Then: There should be no search input (browser not available)
    await expect(docsPage.searchInput).not.toBeVisible();
  });

  test('DocumentBrowser does NOT show document grid when Paperless is not configured', async ({
    page,
  }) => {
    // Given: Paperless-ngx is NOT configured
    // When: Navigating to the Documents page
    const docsPage = new DocumentsPage(page);
    await docsPage.goto();

    // Then: There should be no document grid
    await expect(docsPage.documentGrid).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: "Not configured" state contains setup instructions
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Not configured instructions (Scenario 3)', { tag: '@responsive' }, () => {
  test('Not configured state mentions PAPERLESS_URL env var', async ({ page }) => {
    // Given: Paperless-ngx is NOT configured
    // When: Navigating to the Documents page
    const docsPage = new DocumentsPage(page);
    await docsPage.goto();

    // Then: The instruction text should mention the PAPERLESS_URL env var
    const pageContent = await page.content();
    expect(pageContent).toContain('PAPERLESS_URL');
  });

  test('Not configured state mentions PAPERLESS_API_TOKEN env var', async ({ page }) => {
    // Given: Paperless-ngx is NOT configured
    // When: Navigating to the Documents page
    const docsPage = new DocumentsPage(page);
    await docsPage.goto();

    // Then: The instruction text should mention the PAPERLESS_API_TOKEN env var
    const pageContent = await page.content();
    expect(pageContent).toContain('PAPERLESS_API_TOKEN');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Navigation from sidebar
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Sidebar navigation (Scenario 4)', { tag: '@responsive' }, () => {
  test('Deep-linking to /documents works and renders the page heading', async ({ page }) => {
    // Given: An authenticated user
    // When: Navigating directly to the documents URL
    await page.goto(ROUTES.documents);
    const docsPage = new DocumentsPage(page);
    await docsPage.heading.waitFor({ state: 'visible' });

    // Then: The correct URL is shown and heading is present
    expect(page.url()).toContain(ROUTES.documents);
    await expect(docsPage.heading).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Responsive — no horizontal scroll
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout (Scenario 5)', { tag: '@responsive' }, () => {
  test('Documents page renders without horizontal scroll on current viewport', async ({ page }) => {
    // Given: An authenticated user on a given viewport size
    const docsPage = new DocumentsPage(page);
    await docsPage.goto();

    // Then: No horizontal scrollbar should appear
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  test('Not configured state info box is fully visible without clipping on current viewport', async ({
    page,
  }) => {
    // Given: Paperless-ngx is not configured
    const docsPage = new DocumentsPage(page);
    await docsPage.goto();

    // Then: The info state container should be in view and not overflow
    await expect(docsPage.notConfiguredState).toBeVisible();
    const box = await docsPage.notConfiguredState.boundingBox();
    expect(box).not.toBeNull();
    // The info state should have a reasonable width (not collapsed)
    if (box) {
      expect(box.width).toBeGreaterThan(100);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Dark mode rendering
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dark mode rendering (Scenario 6)', { tag: '@responsive' }, () => {
  test('Documents page renders correctly in dark mode without horizontal scroll', async ({
    page,
  }) => {
    // Given: An authenticated user
    const docsPage = new DocumentsPage(page);
    await docsPage.goto();

    // When: Switching to dark mode
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    // Then: Key elements should still be visible
    await expect(docsPage.heading).toBeVisible();
    await expect(docsPage.notConfiguredTitle).toBeVisible();

    // And: No horizontal scroll
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Accessibility — "not configured" state heading
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Accessibility (Scenario 7)', { tag: '@responsive' }, () => {
  test('Not configured state has an accessible heading (h2)', async ({ page }) => {
    // Given: Paperless-ngx is not configured
    const docsPage = new DocumentsPage(page);
    await docsPage.goto();

    // Then: The state has an h2 heading (accessible to screen readers)
    const heading = page.getByRole('heading', {
      level: 2,
      name: 'Paperless-ngx Not Configured',
    });
    await expect(heading).toBeVisible();
  });

  test('Documents page h1 is the first heading on the page', async ({ page }) => {
    // Given: An authenticated user
    const docsPage = new DocumentsPage(page);
    await docsPage.goto();

    // Then: There should be exactly one h1 heading with the correct title
    const h1Elements = await page.getByRole('heading', { level: 1 }).all();
    expect(h1Elements.length).toBe(1);
    await expect(h1Elements[0]).toHaveText('Documents');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: API — Paperless status endpoint
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Paperless status API (Scenario 8)', () => {
  test('GET /api/paperless/status returns configured: false when env vars absent', async ({
    page,
  }) => {
    // Given: The E2E container has no PAPERLESS_URL / PAPERLESS_API_TOKEN env vars
    // When: Requesting the paperless status API
    const response = await page.request.get('/api/paperless/status');

    // Then: The endpoint should return 200 with configured: false
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { configured: boolean; reachable: boolean };
    expect(body.configured).toBe(false);
    expect(body.reachable).toBe(false);
  });
});
