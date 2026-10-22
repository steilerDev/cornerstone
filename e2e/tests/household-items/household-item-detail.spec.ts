/**
 * E2E tests for the Household Item Detail page (/project/household-items/:id)
 *
 * EPIC-04 Stories covered:
 * - 4.5: Detail Page
 * - 4.6: Budget Integration (budget lines, subsidies)
 * - 4.7: Work Item Linking (timeline dependencies)
 * - 8.6: Document Linking for Household Items
 * - 4.8: Responsive & Accessibility
 *
 * Scenarios covered:
 * 1.  Page loads with item name as heading
 * 2.  "Purchases" breadcrumb navigates to /project/household-items
 * 3.  Edit button navigates to /project/household-items/:id/edit
 * 4.  Budget section is visible on the detail page
 * 5.  Documents button "Documents (0)" is visible (Paperless connected, mocked)
 * 6.  Paperless off, no links: no Documents button, no setup text
 * 7.  Paperless off, kept links: read-only notice (admin gets the Integrations link)
 * 8.  404 / error state for non-existent item ID
 * 9.  Responsive — no horizontal scroll on current viewport
 * 10. Dark mode rendering
 * 11. Documents panel has an accessible dialog title
 */

import { test, expect } from '../../fixtures/auth.js';
import { HouseholdItemDetailPage } from '../../pages/HouseholdItemDetailPage.js';
import { DocumentsPanel } from '../../pages/DocumentsPanel.js';
import { createHouseholdItemViaApi, deleteHouseholdItemViaApi } from '../../fixtures/apiHelpers.js';
import {
  expectNoDocumentsButton,
  mockKeptDocumentLinks,
  mockPaperlessConfigured,
  openAndSettle,
} from '../../fixtures/paperlessMocks.js';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Page loads with item name as heading
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Page load (Scenario 1)', { tag: '@responsive' }, () => {
  test(
    'Household Item detail page loads with the item name as the h1 heading',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const detailPage = new HouseholdItemDetailPage(page);
      let createdId: string | null = null;
      const name = `${testPrefix} HI Detail Heading Test`;

      try {
        createdId = await createHouseholdItemViaApi(page, { name });

        await detailPage.goto(createdId);

        await expect(detailPage.heading).toBeVisible();
        const headingText = await detailPage.getHeadingText();
        expect(headingText.trim()).toContain(name);
      } finally {
        if (createdId) await deleteHouseholdItemViaApi(page, createdId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: "Purchases" breadcrumb navigates to /project/household-items
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Breadcrumb navigation (Scenario 2)', { tag: '@responsive' }, () => {
  test('"Purchases" breadcrumb navigates to /project/household-items', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new HouseholdItemDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createHouseholdItemViaApi(page, {
        name: `${testPrefix} HI Back Link Test`,
      });

      await detailPage.goto(createdId);

      await detailPage.breadcrumbs.trailLink('Purchases').click();

      await page.waitForURL('**/project/household-items');
      expect(page.url()).toContain('/project/household-items');
      // Should not be on the detail page
      expect(page.url()).not.toMatch(/\/project\/household-items\/[a-zA-Z0-9-]+$/);
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Edit button navigates to edit page
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Edit button navigation (Scenario 3)', { tag: '@responsive' }, () => {
  test('"Edit" button navigates to /project/household-items/:id/edit', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new HouseholdItemDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createHouseholdItemViaApi(page, {
        name: `${testPrefix} HI Edit Button Test`,
      });

      await detailPage.goto(createdId);

      await detailPage.editButton.click();

      await page.waitForURL(`**/project/household-items/${createdId}/edit`);
      expect(page.url()).toContain('/edit');
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Budget section visible (Story 4.6)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Budget section visible (Scenario 4 — Story 4.6)', { tag: '@responsive' }, () => {
  test('Budget section is present on the household item detail page', async ({
    page,
    testPrefix,
  }) => {
    let createdId: string | null = null;

    try {
      createdId = await createHouseholdItemViaApi(page, {
        name: `${testPrefix} HI Budget Section Test`,
      });

      await page.goto(`/project/household-items/${createdId}`);
      await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible', timeout: 10000 });

      // The budget section heading should be visible
      // HouseholdItemDetailPage renders a Budget section with h2
      const budgetHeading = page.getByRole('heading', { name: /budget/i, level: 2 });
      await expect(budgetHeading).toBeVisible({ timeout: 10000 });
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });

  test('"Add Budget Line" or similar button is visible in the budget section', async ({
    page,
    testPrefix,
  }) => {
    let createdId: string | null = null;

    try {
      createdId = await createHouseholdItemViaApi(page, {
        name: `${testPrefix} HI Budget Add Test`,
      });

      await page.goto(`/project/household-items/${createdId}`);
      await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible', timeout: 10000 });

      // The budget section should have an "Add Budget Line" button
      const addBudgetButton = page.getByRole('button', {
        name: /add budget line|add line/i,
      });
      await expect(addBudgetButton).toBeVisible({ timeout: 10000 });
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 5–7, 11: Documents section (Story 8.6)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Documents section — Story 8.6 (Scenarios 5–7, 11)', { tag: '@responsive' }, () => {
  test('"Documents" section heading is visible on household item detail', async ({
    page,
    testPrefix,
  }) => {
    let createdId: string | null = null;

    try {
      createdId = await createHouseholdItemViaApi(page, {
        name: `${testPrefix} HI Doc Section Heading`,
      });
      await mockPaperlessConfigured(page);

      const detailPage = new HouseholdItemDetailPage(page);
      await detailPage.goto(createdId);

      await expect(page.getByTestId('documents-panel-button')).toHaveText('Documents (0)');
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });

  test('With Paperless off and no links the Documents button and the setup text are absent', async ({
    page,
    testPrefix,
  }) => {
    let createdId: string | null = null;

    try {
      createdId = await createHouseholdItemViaApi(page, {
        name: `${testPrefix} HI Doc Absent`,
      });

      const detailPage = new HouseholdItemDetailPage(page);
      await openAndSettle(page, () => detailPage.goto(createdId as string));

      await expect(detailPage.heading).toBeVisible();
      await expectNoDocumentsButton(page);
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });

  test('With Paperless off and kept links the panel is read-only with a notice and no Link document', async ({
    page,
    testPrefix,
  }) => {
    let createdId: string | null = null;

    try {
      createdId = await createHouseholdItemViaApi(page, {
        name: `${testPrefix} HI Doc Kept`,
      });
      await mockKeptDocumentLinks(page, 'household_item', createdId, 1);

      const detailPage = new HouseholdItemDetailPage(page);
      await detailPage.goto(createdId);
      const panel = new DocumentsPanel(page);
      await panel.open();

      await expect(panel.notice).toContainText('Paperless is not connected. 1 link is kept.');
      await expect(panel.integrationsLink).toBeVisible();
      await expect(panel.linkDocumentButton).toHaveCount(0);
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });

  test('Documents panel has an accessible dialog title', async ({ page, testPrefix }) => {
    let createdId: string | null = null;

    try {
      createdId = await createHouseholdItemViaApi(page, {
        name: `${testPrefix} HI Doc A11y Title`,
      });
      await mockPaperlessConfigured(page);

      const detailPage = new HouseholdItemDetailPage(page);
      await detailPage.goto(createdId);

      const panel = new DocumentsPanel(page);
      await panel.open();

      await expect(panel.title).toHaveText('Documents (0)');
      await expect(panel.dialog).toHaveAttribute('aria-labelledby', /.+/);
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: 404 / error state for non-existent item ID
// ─────────────────────────────────────────────────────────────────────────────
test.describe('404 / error state (Scenario 8)', { tag: '@responsive' }, () => {
  test('Navigating to a non-existent household item shows error state', async ({ page }) => {
    await page.goto('/project/household-items/non-existent-id-000');

    // The page should either show a not-found message or redirect
    // The HouseholdItemDetailPage shows "not found" text when item doesn't exist.
    // Use .first() to avoid strict mode violation: the page renders both a heading
    // and a description element that match the pattern.
    const notFoundText = page.getByText(/not found|doesn't exist|has been removed/i).first();
    await expect(notFoundText).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Responsive — no horizontal scroll
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout (Scenario 9)', { tag: '@responsive' }, () => {
  test('Household Item detail page renders without horizontal scroll', async ({
    page,
    testPrefix,
  }) => {
    let createdId: string | null = null;

    try {
      createdId = await createHouseholdItemViaApi(page, {
        name: `${testPrefix} HI Detail Responsive`,
      });

      const detailPage = new HouseholdItemDetailPage(page);
      await detailPage.goto(createdId);

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      expect(hasHorizontalScroll).toBe(false);
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Dark mode rendering
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dark mode rendering (Scenario 10)', { tag: '@responsive' }, () => {
  test('Household Item detail page renders correctly in dark mode', async ({
    page,
    testPrefix,
  }) => {
    let createdId: string | null = null;

    try {
      createdId = await createHouseholdItemViaApi(page, {
        name: `${testPrefix} HI Detail Dark Mode`,
      });

      await page.goto(`/project/household-items/${createdId}`);
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
      });

      const detailPage = new HouseholdItemDetailPage(page);
      await detailPage.heading.waitFor({ state: 'visible', timeout: 10000 });

      await expect(detailPage.heading).toBeVisible();

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });

  test('Documents section renders in dark mode on HI detail', async ({ page, testPrefix }) => {
    let createdId: string | null = null;

    try {
      createdId = await createHouseholdItemViaApi(page, {
        name: `${testPrefix} HI Doc Dark Mode`,
      });
      await mockPaperlessConfigured(page);

      await page.goto(`/project/household-items/${createdId}`);
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
      });

      const detailPage = new HouseholdItemDetailPage(page);
      await detailPage.heading.waitFor({ state: 'visible', timeout: 10000 });

      const panel = new DocumentsPanel(page);
      await expect(panel.button()).toBeVisible();
      await panel.open();

      await expect(panel.linkDocumentButton).toBeVisible();
      await expect(panel.linkDocumentButton).toBeEnabled();
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });
});
