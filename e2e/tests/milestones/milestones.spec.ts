/**
 * E2E tests for Milestones CRUD (/project/milestones)
 *
 * Scenarios covered:
 * 1.  List page loads with heading "Project" and "New Milestone" button
 * 2.  Empty state when no milestones exist (mocked)
 * 3.  "New Milestone" button navigates to /project/milestones/new
 * 4.  Create milestone with title + targetDate only — happy path, redirects to detail
 * 5.  Create milestone with all fields (title, targetDate, description)
 * 6.  Create form validation — title required
 * 7.  Create form validation — targetDate required
 * 8.  Create form cancel / back link navigation
 * 9.  Milestone created via API appears in list
 * 10. Row click navigates to detail page
 * 11. Detail page loads with correct title and status badge
 * 12. Edit milestone — change title and targetDate, save via PATCH
 * 13. Mark milestone as completed via edit form
 * 14. Delete milestone from list (via actions menu + modal confirm)
 * 15. Delete modal — cancel leaves milestone in list
 * 16. Delete milestone from detail page (via delete button + modal confirm)
 * 17. Detail page 404 — not found state rendered
 * 18. Responsive — list page no horizontal scroll on current viewport
 * 19. Responsive — create page no horizontal scroll on current viewport
 * 20. Responsive — detail page no horizontal scroll on current viewport
 * 21. Dark mode — list page renders correctly
 */

import { test, expect } from '../../fixtures/auth.js';
import { MilestonesPage, MILESTONES_ROUTE } from '../../pages/MilestonesPage.js';
import { MilestoneCreatePage, MILESTONE_CREATE_ROUTE } from '../../pages/MilestoneCreatePage.js';
import { MilestoneDetailPage } from '../../pages/MilestoneDetailPage.js';
import { API } from '../../fixtures/testData.js';
import { createMilestoneViaApi, deleteMilestoneViaApi } from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: List page loads
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Milestones list page load (Scenario 1)', { tag: '@responsive' }, () => {
  test(
    'Milestones list page loads with "Project" heading and "New Milestone" button',
    { tag: '@smoke' },
    async ({ page }) => {
      const milestonesPage = new MilestonesPage(page);

      await milestonesPage.goto();

      await expect(milestonesPage.heading).toBeVisible();
      await expect(milestonesPage.heading).toHaveText('Project');
      await expect(milestonesPage.newMilestoneButton).toBeVisible();
    },
  );

  test('Milestones page URL is /project/milestones', async ({ page }) => {
    await page.goto(MILESTONES_ROUTE);
    await page.waitForURL('/project/milestones');
    expect(page.url()).toContain('/project/milestones');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Empty state
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Empty state (Scenario 2)', { tag: '@responsive' }, () => {
  test('Empty state shown when no milestones exist (mocked empty response)', async ({ page }) => {
    const milestonesPage = new MilestonesPage(page);

    // Mock the milestones API to return an empty list
    await page.route(`${API.milestones}*`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ milestones: [] }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await milestonesPage.goto();

      await expect(milestonesPage.emptyState).toBeVisible();

      const emptyText = await milestonesPage.emptyState.textContent();
      expect(emptyText?.toLowerCase()).toMatch(/no milestones yet/i);

      // CTA to create first milestone
      const ctaButton = milestonesPage.emptyState.getByRole('button', {
        name: /Create First Milestone/i,
      });
      await expect(ctaButton).toBeVisible();
    } finally {
      await page.unroute(`${API.milestones}*`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: "New Milestone" button navigation
// ─────────────────────────────────────────────────────────────────────────────
test.describe('"New Milestone" navigation (Scenario 3)', { tag: '@responsive' }, () => {
  test('"New Milestone" button navigates to the create page', async ({ page }) => {
    const milestonesPage = new MilestonesPage(page);

    await milestonesPage.goto();
    await expect(milestonesPage.newMilestoneButton).toBeVisible();

    await milestonesPage.newMilestoneButton.click();

    await page.waitForURL('**/project/milestones/new');
    expect(page.url()).toContain('/project/milestones/new');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Create milestone with title + targetDate only — happy path
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create milestone — title + date only (Scenario 4)', { tag: '@responsive' }, () => {
  test(
    'Creating a milestone with title and targetDate redirects to the detail page',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const createPage = new MilestoneCreatePage(page);
      let createdId: number | null = null;

      try {
        await createPage.goto();

        const title = `${testPrefix} Minimal Milestone`;

        await createPage.fillForm({
          title,
          targetDate: '2027-06-30',
        });

        // Register response listener BEFORE submit to avoid missing fast responses
        const responsePromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/api/milestones') && resp.request().method() === 'POST',
        );

        await createPage.submit();

        const response = await responsePromise;
        expect(response.ok()).toBeTruthy();
        const body = (await response.json()) as { milestone: { id: number } };
        createdId = body.milestone?.id ?? null;

        // Should redirect to /project/milestones/:id
        await page.waitForURL('**/project/milestones/**');
        expect(page.url()).toMatch(/\/project\/milestones\/\d+$/);
        expect(page.url()).not.toContain('/project/milestones/new');

        // Detail page shows the correct h1 title
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
      } finally {
        if (createdId !== null) await deleteMilestoneViaApi(page, createdId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Create milestone with all fields
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create milestone — all fields (Scenario 5)', { tag: '@responsive' }, () => {
  test('Creating a milestone with title, targetDate, and description succeeds', async ({
    page,
    testPrefix,
  }) => {
    const createPage = new MilestoneCreatePage(page);
    let createdId: number | null = null;

    try {
      await createPage.goto();

      const title = `${testPrefix} Full Milestone`;
      const description = 'E2E test milestone with all fields populated.';

      await createPage.fillForm({
        title,
        targetDate: '2027-09-15',
        description,
      });

      const responsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/milestones') && resp.request().method() === 'POST',
      );

      await createPage.submit();

      const response = await responsePromise;
      expect(response.ok()).toBeTruthy();
      const body = (await response.json()) as { milestone: { id: number } };
      createdId = body.milestone?.id ?? null;

      // Should redirect to detail page
      await page.waitForURL('**/project/milestones/**');

      // Detail page shows the correct title
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    } finally {
      if (createdId !== null) await deleteMilestoneViaApi(page, createdId);
    }
  });

  test('Form heading shows "Create Milestone" and required fields are visible', async ({ page }) => {
    const createPage = new MilestoneCreatePage(page);

    await createPage.goto();

    await expect(createPage.formHeading).toBeVisible();
    await expect(createPage.formHeading).toHaveText('Create Milestone');
    await expect(createPage.titleInput).toBeVisible();
    await expect(createPage.targetDateInput).toBeVisible();
    await expect(createPage.descriptionInput).toBeVisible();
    await expect(createPage.submitButton).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Create form validation — title required
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create form validation — title required (Scenario 6)', { tag: '@responsive' }, () => {
  test('Submitting without title shows "Title is required." error', async ({ page }) => {
    const createPage = new MilestoneCreatePage(page);

    await createPage.goto();

    // Fill only the date, leave title empty
    await createPage.fillForm({ targetDate: '2027-06-01' });

    await createPage.submit();

    // Error banner should appear with the title validation message
    const errorText = await createPage.getErrorBannerText();
    expect(errorText).toBeTruthy();
    expect(errorText?.toLowerCase()).toMatch(/title is required/i);

    // Still on the create page
    expect(page.url()).toContain('/project/milestones/new');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Create form validation — targetDate required
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Create form validation — targetDate required (Scenario 7)',
  { tag: '@responsive' },
  () => {
    test('Submitting without targetDate shows "Target date is required." error', async ({
      page,
    }) => {
      const createPage = new MilestoneCreatePage(page);

      await createPage.goto();

      // Fill only the title, leave targetDate empty
      await createPage.fillForm({ title: 'Incomplete Milestone' });

      await createPage.submit();

      // Error banner should appear with the targetDate validation message
      const errorText = await createPage.getErrorBannerText();
      expect(errorText).toBeTruthy();
      expect(errorText?.toLowerCase()).toMatch(/target date is required/i);

      // Still on the create page
      expect(page.url()).toContain('/project/milestones/new');
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Create form cancel / back link navigation
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create form navigation (Scenario 8)', { tag: '@responsive' }, () => {
  test('"Cancel" link navigates back to /project/milestones', async ({ page }) => {
    const createPage = new MilestoneCreatePage(page);

    await createPage.goto();

    // Click the Cancel link (anchor → navigation)
    await createPage.cancelLink.click();

    await page.waitForURL('**/project/milestones');
    expect(page.url()).toContain('/project/milestones');
    expect(page.url()).not.toContain('/project/milestones/new');
  });

  test('"← Milestones" back link navigates to /project/milestones', async ({ page }) => {
    const createPage = new MilestoneCreatePage(page);

    await createPage.goto();

    // Click the back link
    await createPage.backLink.click();

    await page.waitForURL('**/project/milestones');
    expect(page.url()).toContain('/project/milestones');
    expect(page.url()).not.toContain('/project/milestones/new');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Milestone created via API appears in list
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Milestone appears in list after API creation (Scenario 9)',
  { tag: '@responsive' },
  () => {
    test('Milestone created via API is visible in the milestones list', async ({
      page,
      testPrefix,
    }) => {
      const milestonesPage = new MilestonesPage(page);
      let createdId: number | null = null;
      const title = `${testPrefix} API Created Milestone`;

      try {
        createdId = await createMilestoneViaApi(page, {
          title,
          targetDate: '2027-07-01',
        });

        await milestonesPage.goto();
        await milestonesPage.waitForLoaded();

        // Search for the specific milestone (client-side filter)
        await milestonesPage.search(title);

        const titles = await milestonesPage.getMilestoneTitles();
        expect(titles).toContain(title);
      } finally {
        if (createdId !== null) await deleteMilestoneViaApi(page, createdId);
      }
    });

    test('Table shows Title, Target Date, Status, Linked Items columns (desktop+tablet)', async ({
      page,
      testPrefix,
    }) => {
      const viewport = page.viewportSize();
      if (!viewport || viewport.width < 768) {
        test.skip();
        return;
      }

      const milestonesPage = new MilestonesPage(page);
      let createdId: number | null = null;

      try {
        createdId = await createMilestoneViaApi(page, {
          title: `${testPrefix} Column Check Milestone`,
          targetDate: '2027-08-01',
        });

        await milestonesPage.goto();
        await milestonesPage.waitForLoaded();

        await expect(milestonesPage.tableContainer).toBeVisible();

        const table = milestonesPage.tableContainer.locator('table');
        await expect(table.getByRole('columnheader', { name: 'Title' })).toBeVisible();
        await expect(table.getByRole('columnheader', { name: 'Target Date' })).toBeVisible();
        await expect(table.getByRole('columnheader', { name: 'Status' })).toBeVisible();
        await expect(table.getByRole('columnheader', { name: 'Linked Items' })).toBeVisible();
      } finally {
        if (createdId !== null) await deleteMilestoneViaApi(page, createdId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Row click navigates to detail page
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Row click navigates to detail (Scenario 10)', { tag: '@responsive' }, () => {
  test('Clicking a milestone row navigates to the detail page', async ({ page, testPrefix }) => {
    const milestonesPage = new MilestonesPage(page);
    let createdId: number | null = null;
    const title = `${testPrefix} Clickable Milestone`;

    try {
      createdId = await createMilestoneViaApi(page, {
        title,
        targetDate: '2027-08-15',
      });

      await milestonesPage.goto();
      await milestonesPage.waitForLoaded();

      // Search for this specific milestone
      await milestonesPage.search(title);

      await milestonesPage.clickMilestoneRow(title);

      // Should navigate to /project/milestones/:id
      await page.waitForURL(`**/project/milestones/${createdId}`);
      expect(page.url()).toContain(`/project/milestones/${createdId}`);
    } finally {
      if (createdId !== null) await deleteMilestoneViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 11: Detail page loads with correct title and status badge
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Detail page load (Scenario 11)', { tag: '@responsive' }, () => {
  test(
    'Detail page shows milestone title, target date field, and Pending status badge',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const detailPage = new MilestoneDetailPage(page);
      let createdId: number | null = null;
      const title = `${testPrefix} Detail View Milestone`;

      try {
        createdId = await createMilestoneViaApi(page, {
          title,
          targetDate: '2027-09-01',
          description: 'A milestone for detail page testing.',
        });

        await detailPage.goto(createdId);

        // h1 = milestone title
        await expect(detailPage.heading).toHaveText(title);

        // Status badge should say "Pending" (new milestone is not completed)
        const statusText = await detailPage.getStatusText();
        expect(statusText.toLowerCase()).toMatch(/pending/i);

        // Back button is visible
        await expect(detailPage.backButton).toBeVisible();

        // Edit button is visible
        await expect(detailPage.editButton).toBeVisible();

        // Delete button is visible
        await expect(detailPage.deleteButton).toBeVisible();
      } finally {
        if (createdId !== null) await deleteMilestoneViaApi(page, createdId);
      }
    },
  );

  test('"← Back to Milestones" button navigates back to the list', async ({ page, testPrefix }) => {
    const detailPage = new MilestoneDetailPage(page);
    let createdId: number | null = null;

    try {
      createdId = await createMilestoneViaApi(page, {
        title: `${testPrefix} Back Navigation Milestone`,
        targetDate: '2027-09-15',
      });

      await detailPage.goto(createdId);
      await expect(detailPage.backButton).toBeVisible();

      await detailPage.backButton.click();

      await page.waitForURL('**/project/milestones');
      expect(page.url()).toContain('/project/milestones');
      expect(page.url()).not.toMatch(/\/project\/milestones\/\d+/);
    } finally {
      if (createdId !== null) await deleteMilestoneViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 12: Edit milestone — change title and targetDate
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Edit milestone (Scenario 12)', { tag: '@responsive' }, () => {
  test(
    'Editing a milestone title and targetDate via the edit form persists the changes',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const detailPage = new MilestoneDetailPage(page);
      let createdId: number | null = null;
      const originalTitle = `${testPrefix} Edit Before Milestone`;
      const updatedTitle = `${testPrefix} Edit After Milestone`;

      try {
        createdId = await createMilestoneViaApi(page, {
          title: originalTitle,
          targetDate: '2027-10-01',
        });

        await detailPage.goto(createdId);
        await expect(detailPage.heading).toHaveText(originalTitle);

        // Enter edit mode
        await detailPage.startEditing();
        await expect(detailPage.titleInput).toBeVisible();

        // Update title and target date
        await detailPage.titleInput.fill(updatedTitle);
        await detailPage.targetDateInput.fill('2027-11-30');

        // Save — waits for PATCH 200 and edit form to close
        await detailPage.saveChanges();

        // h1 should now show the updated title
        await expect(detailPage.heading).toHaveText(updatedTitle);
      } finally {
        if (createdId !== null) await deleteMilestoneViaApi(page, createdId);
      }
    },
  );

  test('Cancelling edit mode restores view mode without saving changes', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new MilestoneDetailPage(page);
    let createdId: number | null = null;
    const originalTitle = `${testPrefix} Cancel Edit Milestone`;

    try {
      createdId = await createMilestoneViaApi(page, {
        title: originalTitle,
        targetDate: '2027-10-15',
      });

      await detailPage.goto(createdId);

      // Enter edit mode
      await detailPage.startEditing();
      await detailPage.titleInput.fill('Should Not Be Saved');

      // Cancel — returns to view mode
      await detailPage.cancelEditing();

      // h1 should still show the original title
      await expect(detailPage.heading).toHaveText(originalTitle);
    } finally {
      if (createdId !== null) await deleteMilestoneViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 13: Mark milestone as completed
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Mark milestone completed (Scenario 13)', { tag: '@responsive' }, () => {
  test('Checking "Mark as completed" and saving changes status badge to Completed', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new MilestoneDetailPage(page);
    let createdId: number | null = null;

    try {
      createdId = await createMilestoneViaApi(page, {
        title: `${testPrefix} Complete Me Milestone`,
        targetDate: '2026-01-01',
      });

      await detailPage.goto(createdId);

      // Verify initial status is Pending
      const statusBefore = await detailPage.getStatusText();
      expect(statusBefore.toLowerCase()).toMatch(/pending/i);

      // Enter edit mode
      await detailPage.startEditing();

      // Check the "Mark as completed" checkbox
      await detailPage.isCompletedCheckbox.check();

      // Save changes
      await detailPage.saveChanges();

      // Status badge should now say "Completed"
      const statusAfter = await detailPage.getStatusText();
      expect(statusAfter.toLowerCase()).toMatch(/completed/i);
    } finally {
      if (createdId !== null) await deleteMilestoneViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 14: Delete milestone from list
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Delete milestone from list — confirm (Scenario 14)', { tag: '@responsive' }, () => {
  test('Confirming delete via the actions menu removes the milestone from the list', async ({
    page,
    testPrefix,
  }) => {
    const milestonesPage = new MilestonesPage(page);
    const title = `${testPrefix} Delete From List Milestone`;

    // Create the item (no cleanup — it is deleted via UI)
    const createdId = await createMilestoneViaApi(page, {
      title,
      targetDate: '2027-11-01',
    });

    await milestonesPage.goto();
    await milestonesPage.waitForLoaded();

    // Search for this specific milestone
    await milestonesPage.search(title);
    const titlesBefore = await milestonesPage.getMilestoneTitles();
    expect(titlesBefore).toContain(title);

    // Open delete modal and confirm
    await milestonesPage.openDeleteModal(title);
    await expect(milestonesPage.deleteModal).toBeVisible();

    // Modal content includes the milestone title
    const modalText = await milestonesPage.deleteModal.textContent();
    expect(modalText).toContain(title);

    // Confirm deletion
    await milestonesPage.confirmDelete();

    // Milestone no longer visible
    await milestonesPage.search(title);
    const titlesAfter = await milestonesPage.getMilestoneTitles();
    expect(titlesAfter).not.toContain(title);

    // No API cleanup — deleted via UI
    void createdId;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 15: Delete modal — cancel leaves milestone in list
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Delete modal — cancel (Scenario 15)', { tag: '@responsive' }, () => {
  test('Cancelling delete modal leaves the milestone in the list', async ({ page, testPrefix }) => {
    const milestonesPage = new MilestonesPage(page);
    let createdId: number | null = null;
    const title = `${testPrefix} Cancel Delete Milestone`;

    try {
      createdId = await createMilestoneViaApi(page, {
        title,
        targetDate: '2027-11-15',
      });

      await milestonesPage.goto();
      await milestonesPage.waitForLoaded();
      await milestonesPage.search(title);

      await milestonesPage.openDeleteModal(title);
      await milestonesPage.cancelDelete();

      // Milestone still present
      const titles = await milestonesPage.getMilestoneTitles();
      expect(titles).toContain(title);
    } finally {
      if (createdId !== null) await deleteMilestoneViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 16: Delete milestone from detail page
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Delete milestone from detail page (Scenario 16)', { tag: '@responsive' }, () => {
  test(
    'Deleting a milestone from the detail page navigates back to the list',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const detailPage = new MilestoneDetailPage(page);
      const title = `${testPrefix} Delete From Detail Milestone`;

      // Create (no cleanup — it is deleted via UI)
      const createdId = await createMilestoneViaApi(page, {
        title,
        targetDate: '2027-12-01',
      });

      await detailPage.goto(createdId);
      await expect(detailPage.heading).toHaveText(title);

      // Delete via modal
      await detailPage.openDeleteModal();
      await expect(detailPage.deleteModal).toBeVisible();

      const modalText = await detailPage.deleteModal.textContent();
      expect(modalText).toContain(title);

      // Confirm — navigates to /project/milestones
      await detailPage.confirmDelete();

      expect(page.url()).toContain('/project/milestones');
      expect(page.url()).not.toMatch(/\/project\/milestones\/\d+$/);

      // No API cleanup — deleted via UI
      void createdId;
    },
  );

  test('Cancelling delete modal on detail page leaves the milestone unchanged', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new MilestoneDetailPage(page);
    let createdId: number | null = null;
    const title = `${testPrefix} Cancel Detail Delete Milestone`;

    try {
      createdId = await createMilestoneViaApi(page, {
        title,
        targetDate: '2027-12-15',
      });

      await detailPage.goto(createdId);
      await expect(detailPage.heading).toHaveText(title);

      await detailPage.openDeleteModal();
      await expect(detailPage.deleteModal).toBeVisible();

      await detailPage.cancelDelete();

      // Still on the detail page
      await expect(detailPage.heading).toHaveText(title);
      expect(page.url()).toContain(`/project/milestones/${createdId}`);
    } finally {
      if (createdId !== null) await deleteMilestoneViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 17: Detail page 404 — not found state
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Detail page 404 (Scenario 17)', () => {
  test('Navigating to a non-existent milestone ID renders the not-found state', async ({
    page,
  }) => {
    const detailPage = new MilestoneDetailPage(page);

    // Use an ID that is extremely unlikely to exist
    await detailPage.goto(999999999);

    const isNotFound = await detailPage.isInNotFoundState();
    expect(isNotFound).toBe(true);

    // "Back to Milestones" link is visible in the not-found state
    await expect(page.getByRole('link', { name: 'Back to Milestones' })).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 18: Responsive — list page no horizontal scroll
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout — list (Scenario 18)', { tag: '@responsive' }, () => {
  test('Milestones list page renders without horizontal scroll on current viewport', async ({
    page,
  }) => {
    const milestonesPage = new MilestonesPage(page);

    await milestonesPage.goto();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });

  test('Mobile: card view is shown when viewport is < 768px', async ({ page, testPrefix }) => {
    const viewport = page.viewportSize();

    if (!viewport || viewport.width >= 768) {
      test.skip();
      return;
    }

    const milestonesPage = new MilestonesPage(page);
    let createdId: number | null = null;

    try {
      createdId = await createMilestoneViaApi(page, {
        title: `${testPrefix} Mobile Card Milestone`,
        targetDate: '2028-01-01',
      });

      await milestonesPage.goto();
      await milestonesPage.waitForLoaded();

      // At least one card should be visible in cardsContainer
      const cards = await milestonesPage.cardsContainer.locator('[class*="card"]').all();
      expect(cards.length).toBeGreaterThan(0);
    } finally {
      if (createdId !== null) await deleteMilestoneViaApi(page, createdId);
    }
  });

  test('Desktop: table is visible when viewport is >= 768px', async ({ page, testPrefix }) => {
    const viewport = page.viewportSize();

    if (!viewport || viewport.width < 768) {
      test.skip();
      return;
    }

    const milestonesPage = new MilestonesPage(page);
    let createdId: number | null = null;

    try {
      createdId = await createMilestoneViaApi(page, {
        title: `${testPrefix} Desktop Table Milestone`,
        targetDate: '2028-01-15',
      });

      await milestonesPage.goto();
      await milestonesPage.waitForLoaded();

      await expect(milestonesPage.tableContainer).toBeVisible();
    } finally {
      if (createdId !== null) await deleteMilestoneViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 19: Responsive — create page no horizontal scroll
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout — create page (Scenario 19)', { tag: '@responsive' }, () => {
  test('Milestone create page renders without horizontal scroll on current viewport', async ({
    page,
  }) => {
    const createPage = new MilestoneCreatePage(page);

    await createPage.goto();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });

  test('Required form fields and submit button are accessible on current viewport', async ({
    page,
  }) => {
    const createPage = new MilestoneCreatePage(page);

    await createPage.goto();

    await createPage.titleInput.scrollIntoViewIfNeeded();
    await expect(createPage.titleInput).toBeVisible();
    await createPage.targetDateInput.scrollIntoViewIfNeeded();
    await expect(createPage.targetDateInput).toBeVisible();
    await createPage.submitButton.scrollIntoViewIfNeeded();
    await expect(createPage.submitButton).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 20: Responsive — detail page no horizontal scroll
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout — detail page (Scenario 20)', { tag: '@responsive' }, () => {
  test('Milestone detail page renders without horizontal scroll on current viewport', async ({
    page,
    testPrefix,
  }) => {
    let createdId: number | null = null;

    try {
      createdId = await createMilestoneViaApi(page, {
        title: `${testPrefix} Responsive Detail Milestone`,
        targetDate: '2028-02-01',
      });

      await page.goto(`/project/milestones/${createdId}`);
      await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      expect(hasHorizontalScroll).toBe(false);
    } finally {
      if (createdId !== null) await deleteMilestoneViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 21: Dark mode — list page renders correctly
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dark mode rendering (Scenario 21)', { tag: '@responsive' }, () => {
  test('Milestones list page renders correctly in dark mode', async ({ page }) => {
    const milestonesPage = new MilestonesPage(page);

    await page.goto(MILESTONES_ROUTE);
    // Apply dark theme before the heading check to avoid flash
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    await milestonesPage.heading.waitFor({ state: 'visible' });

    await expect(milestonesPage.heading).toBeVisible();
    await expect(milestonesPage.newMilestoneButton).toBeVisible();

    // No horizontal scroll in dark mode
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  test('Milestone create page renders correctly in dark mode', async ({ page }) => {
    await page.goto(MILESTONE_CREATE_ROUTE);
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    const createPage = new MilestoneCreatePage(page);
    await createPage.formHeading.waitFor({ state: 'visible' });

    await expect(createPage.formHeading).toBeVisible();
    await expect(createPage.titleInput).toBeVisible();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });
});
