/**
 * E2E tests for the Orientations settings tab (Story #1674).
 *
 * The Orientations tab lives at /settings/manage?tab=orientations.
 * It provides a flat CRUD list for orientations used to tag photos with a
 * directional label (e.g. "South – Street").  Orientations have:
 *   - name (required, max 100 chars)
 *   - description (optional, max 500 chars)
 *   - sortOrder (optional, non-negative integer, defaults to 0)
 *   - NO color field (unlike areas/budget categories)
 *
 * Delete always succeeds from a UX standpoint: if photos reference an
 * orientation, the FK is SET NULL — the success banner appears regardless.
 *
 * Scenarios covered (8 total — all acceptance criteria from spec):
 * 1. [smoke][responsive] Navigate to Settings → Orientations tab — tab visible and active
 * 2. [responsive] Empty state displayed when no orientations exist
 * 3. [responsive] Create orientation with name only — appears in list
 * 4. [responsive] Create orientation with name + description — both rendered in list row
 * 5. [responsive] Attempt to create with empty name — create button disabled
 * 6. [responsive] Edit orientation — rename reflected in list
 * 7. [responsive] Delete orientation — confirmation modal shown, then deleted, success shown
 * 8. [responsive] Sort order: two orientations with different sort orders listed in order
 */

import { test, expect } from '../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { OrientationsPage } from '../pages/OrientationsPage.js';

const MANAGE_ROUTE = '/settings/manage';
const ORIENTATIONS_TAB_URL = `${MANAGE_ROUTE}?tab=orientations`;

// ─────────────────────────────────────────────────────────────────────────────
// API helpers (in-file: no shared helpers for orientations yet)
// ─────────────────────────────────────────────────────────────────────────────

async function createOrientationViaApi(
  page: Page,
  data: { name: string; description?: string | null; sortOrder?: number },
): Promise<string> {
  const response = await page.request.post('/api/orientations', { data });
  if (!response.ok()) throw new Error(`POST /api/orientations returned ${response.status()}`);
  const body = (await response.json()) as { orientation: { id: string } };
  return body.orientation.id;
}

async function deleteOrientationViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`/api/orientations/${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Tab is visible and active
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Orientations tab — visibility (Scenario 1)', { tag: '@responsive' }, () => {
  test(
    'Navigate to Settings → Orientations tab — tab visible and active',
    { tag: '@smoke' },
    async ({ page }) => {
      await page.goto(ORIENTATIONS_TAB_URL);
      await page.getByRole('heading', { level: 1, name: 'Manage', exact: true }).waitFor({
        state: 'visible',
      });

      // The Orientations tab button must be present and active
      const orientationsTab = page.getByRole('tab', { name: 'Orientations', exact: true });
      await expect(orientationsTab).toBeVisible();
      await expect(orientationsTab).toHaveAttribute('aria-selected', 'true');

      // The create form heading must be visible in the active panel
      const orientationsPage = new OrientationsPage(page);
      await expect(orientationsPage.createFormHeading).toBeVisible();
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Empty state
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Orientations tab — empty state (Scenario 2)', { tag: '@responsive' }, () => {
  test('Empty state is displayed in the existing list section when no orientations exist', async ({
    page,
    testPrefix,
  }) => {
    // We cannot guarantee the DB is empty, so we mock the GET to return empty.
    await page.route('**/api/orientations*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ orientations: [] }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      const orientationsPage = new OrientationsPage(page);
      await orientationsPage.goto();

      // The EmptyState component must appear in the list section
      await expect(orientationsPage.emptyState).toBeVisible();
    } finally {
      await page.unroute('**/api/orientations*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Create orientation with name only
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Orientations tab — create name-only (Scenario 3)', { tag: '@responsive' }, () => {
  test('Create orientation with name only — appears in list', async ({ page, testPrefix }) => {
    const orientationName = `${testPrefix} South`;
    let orientationId = '';

    try {
      const orientationsPage = new OrientationsPage(page);
      await orientationsPage.goto();
      await expect(orientationsPage.createFormHeading).toBeVisible();

      orientationId = await orientationsPage.createOrientation(orientationName);

      // Success banner appears
      await expect(orientationsPage.successMessage).toBeVisible();

      // Item appears in the list — getOrientationRow() returns the itemName element
      const nameEl = orientationsPage.getOrientationRow(orientationName);
      await expect(nameEl).toBeVisible();
      await expect(nameEl).toHaveText(orientationName);
    } finally {
      if (orientationId) await deleteOrientationViaApi(page, orientationId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Create orientation with name + description
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Orientations tab — create with description (Scenario 4)',
  { tag: '@responsive' },
  () => {
    test('Create orientation with name and description — both rendered in list row', async ({
      page,
      testPrefix,
    }) => {
      const orientationName = `${testPrefix} South`;
      const orientationDesc = 'Street-facing';
      let orientationId = '';

      try {
        const orientationsPage = new OrientationsPage(page);
        await orientationsPage.goto();

        orientationId = await orientationsPage.createOrientation(orientationName, orientationDesc);

        // Success banner
        await expect(orientationsPage.successMessage).toBeVisible();

        // Name and description both appear in the list.
        // getOrientationRow() returns the itemName element; description is a sibling element.
        const nameEl = orientationsPage.getOrientationRow(orientationName);
        await expect(nameEl).toBeVisible();
        await expect(nameEl).toHaveText(orientationName);
        // Description is rendered as a sibling [class*="itemDescription"] in the same container
        await expect(
          orientationsPage.panel
            .locator('[class*="itemDescription"]')
            .filter({ hasText: orientationDesc }),
        ).toBeVisible();
      } finally {
        if (orientationId) await deleteOrientationViaApi(page, orientationId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Empty name — create button disabled
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Orientations tab — validation: empty name (Scenario 5)',
  { tag: '@responsive' },
  () => {
    test('Create button is disabled when name is empty', async ({ page }) => {
      await page.goto(ORIENTATIONS_TAB_URL);
      await page.getByRole('heading', { level: 1, name: 'Manage', exact: true }).waitFor({
        state: 'visible',
      });

      const orientationsPage = new OrientationsPage(page);
      // Without filling the name, the create button must be disabled
      await expect(orientationsPage.createButton).toBeDisabled();
    });

    test('Create button stays disabled when name contains only whitespace', async ({ page }) => {
      await page.goto(ORIENTATIONS_TAB_URL);
      await page.getByRole('heading', { level: 1, name: 'Manage', exact: true }).waitFor({
        state: 'visible',
      });

      const orientationsPage = new OrientationsPage(page);

      // Initially the button is disabled (empty name)
      await expect(orientationsPage.createButton).toBeDisabled();

      // Fill with spaces only — the button disabled check is `!newName.trim()`.
      // Since '   '.trim() === '' which is falsy, !'' = true → button stays DISABLED.
      await orientationsPage.nameInput.fill('   ');
      await expect(orientationsPage.createButton).toBeDisabled();

      // Clear the field — button still disabled
      await orientationsPage.nameInput.fill('');
      await expect(orientationsPage.createButton).toBeDisabled();
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Edit orientation
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Orientations tab — edit (Scenario 6)', { tag: '@responsive' }, () => {
  test('Edit orientation "South" → rename to "North" — list updates', async ({
    page,
    testPrefix,
  }) => {
    const originalName = `${testPrefix} South`;
    const updatedName = `${testPrefix} North`;
    let orientationId = '';

    try {
      orientationId = await createOrientationViaApi(page, { name: originalName });

      const orientationsPage = new OrientationsPage(page);
      await orientationsPage.goto();

      // The created row must be visible before editing
      await expect(orientationsPage.getOrientationRow(originalName)).toBeVisible();

      await orientationsPage.editOrientation(originalName, { name: updatedName });

      // Success banner appears
      await expect(orientationsPage.successMessage).toBeVisible();

      // Updated name appears in the list; original name is gone
      await expect(orientationsPage.getOrientationRow(updatedName)).toBeVisible();
      await expect(orientationsPage.getOrientationRow(originalName)).toHaveCount(0);
    } finally {
      if (orientationId) await deleteOrientationViaApi(page, orientationId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Delete orientation
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Orientations tab — delete (Scenario 7)', { tag: '@responsive' }, () => {
  test('Delete orientation — confirmation modal shown, then item removed, success message shown', async ({
    page,
    testPrefix,
  }) => {
    const orientationName = `${testPrefix} ToDelete`;
    let orientationId = '';

    try {
      orientationId = await createOrientationViaApi(page, { name: orientationName });

      const orientationsPage = new OrientationsPage(page);
      await orientationsPage.goto();

      // Item exists before deletion
      await expect(orientationsPage.getOrientationRow(orientationName)).toBeVisible();

      // Verify confirmation modal appears — click Delete button (found in panel by aria-label)
      await orientationsPage.panel
        .getByRole('button', { name: `Delete ${orientationName}`, exact: true })
        .click();

      const modal = page.locator('[role="dialog"]');
      await modal.waitFor({ state: 'visible' });
      // Modal title
      await expect(modal.getByRole('heading', { name: 'Delete orientation' })).toBeVisible();

      // Confirm deletion
      const responsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/orientations/${orientationId}`) &&
          resp.request().method() === 'DELETE',
      );
      await modal.locator('[class*="confirmDeleteButton"]').click();
      await responsePromise;
      await modal.waitFor({ state: 'hidden' });

      // Success message appears
      await expect(orientationsPage.successMessage).toBeVisible();

      // Item no longer in list
      await expect(orientationsPage.getOrientationRow(orientationName)).toHaveCount(0);

      // Already deleted — skip cleanup
      orientationId = '';
    } finally {
      if (orientationId) await deleteOrientationViaApi(page, orientationId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Sort order
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Orientations tab — sort order (Scenario 8)', { tag: '@responsive' }, () => {
  test('Two orientations with different sort orders appear in ascending order in the list', async ({
    page,
    testPrefix,
  }) => {
    const nameFirst = `${testPrefix} First`;
    const nameSecond = `${testPrefix} Second`;
    let idFirst = '';
    let idSecond = '';

    try {
      // Create with higher sort order first, then lower — to verify server sorting
      idSecond = await createOrientationViaApi(page, { name: nameSecond, sortOrder: 20 });
      idFirst = await createOrientationViaApi(page, { name: nameFirst, sortOrder: 10 });

      const orientationsPage = new OrientationsPage(page);
      await orientationsPage.goto();

      const panel = orientationsPage.panel;
      const itemNames = await panel.locator('[class*="itemName"]').allTextContents();
      const trimmed = itemNames.map((n) => n.trim());

      // nameFirst (sortOrder 10) must appear before nameSecond (sortOrder 20)
      const indexFirst = trimmed.findIndex((n) => n === nameFirst);
      const indexSecond = trimmed.findIndex((n) => n === nameSecond);
      expect(indexFirst).toBeGreaterThanOrEqual(0);
      expect(indexSecond).toBeGreaterThanOrEqual(0);
      expect(indexFirst).toBeLessThan(indexSecond);
    } finally {
      if (idFirst) await deleteOrientationViaApi(page, idFirst);
      if (idSecond) await deleteOrientationViaApi(page, idSecond);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tab navigation: Orientations tab activatable from ManagePage
// (also validates the Orientations tab exists in the tab list — extends
// settings-manage.spec.ts coverage to include the new tab)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('ManagePage — Orientations tab navigation', { tag: '@responsive' }, () => {
  test('Clicking Orientations tab from another tab activates the Orientations panel', async ({
    page,
  }) => {
    await page.goto(MANAGE_ROUTE); // default: Areas tab
    await page.getByRole('heading', { level: 1, name: 'Manage', exact: true }).waitFor({
      state: 'visible',
    });

    await page.getByRole('tab', { name: 'Orientations', exact: true }).click();

    // URL param updated
    await expect(page).toHaveURL(/\?tab=orientations/);

    // The create form heading appears inside the active panel
    const orientationsPage = new OrientationsPage(page);
    await expect(orientationsPage.createFormHeading).toBeVisible();
  });

  test('ManagePage now has 6 tabs (Household, Areas, Trades, Orientations, Budget Categories, HI Categories)', async ({
    page,
  }) => {
    await page.goto(MANAGE_ROUTE);
    await page.getByRole('heading', { level: 1, name: 'Manage', exact: true }).waitFor({
      state: 'visible',
    });

    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(6);

    // Verify Orientations tab exists
    await expect(page.getByRole('tab', { name: 'Orientations', exact: true })).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dark mode
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Orientations tab — dark mode', () => {
  test('Orientations tab renders correctly in dark mode', async ({ browser }) => {
    const context = await browser.newContext({
      colorScheme: 'dark',
      storageState: 'test-results/.auth/admin.json',
    });
    const page = await context.newPage();

    try {
      await page.goto(ORIENTATIONS_TAB_URL);
      await page.getByRole('heading', { level: 1, name: 'Manage', exact: true }).waitFor({
        state: 'visible',
      });

      const orientationsPage = new OrientationsPage(page);
      await expect(orientationsPage.createFormHeading).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
