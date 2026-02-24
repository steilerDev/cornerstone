/**
 * E2E tests for Milestone CRUD flows on the Timeline page (/timeline)
 *
 * Scenarios covered:
 * 1.  Open milestones panel — empty state message
 * 2.  Create a milestone via the panel UI
 * 3.  Edit milestone name and date
 * 4.  Delete a milestone via the panel
 * 5.  Milestone diamond markers appear on the Gantt chart
 * 6.  Milestone filter dropdown filters the Gantt chart
 * 7.  Milestone form validation — required fields
 */

import { test, expect } from '../../fixtures/auth.js';
import { TimelinePage, TIMELINE_ROUTE } from '../../pages/TimelinePage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns a date string N months from today in YYYY-MM-DD format. */
function dateMonthsFromNow(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Open milestones panel — empty state
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Milestone panel opens (Scenario 1)', () => {
  test('Milestones button opens the panel', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();

    await expect(timelinePage.milestonePanelButton).toBeVisible();
    await timelinePage.openMilestonePanel();

    await expect(timelinePage.milestonePanel).toBeVisible();
    // Panel has correct role and title
    await expect(timelinePage.milestonePanel).toHaveAttribute('role', 'dialog');
    await expect(timelinePage.milestonePanel).toHaveAttribute('aria-modal', 'true');
  });

  test('Milestone panel shows empty state when no milestones exist (mocked)', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    // Mock milestones API to return empty list
    await page.route('**/api/milestones', async (route) => {
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
      await timelinePage.goto();
      await timelinePage.openMilestonePanel();

      await expect(timelinePage.milestoneListEmpty).toBeVisible();
      await expect(timelinePage.milestoneListEmpty).toContainText('No milestones yet');
      // "New Milestone" button should be present even when empty
      await expect(timelinePage.milestoneNewButton).toBeVisible();
    } finally {
      await page.unroute('**/api/milestones');
    }
  });

  test('Closing the panel with X button hides the panel', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();
    await timelinePage.openMilestonePanel();
    await expect(timelinePage.milestonePanel).toBeVisible();

    await timelinePage.closeMilestonePanel();
    await expect(timelinePage.milestonePanel).not.toBeVisible();
  });

  test('Closing the panel with Escape key hides the panel', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();
    await timelinePage.openMilestonePanel();
    await expect(timelinePage.milestonePanel).toBeVisible();

    await page.keyboard.press('Escape');
    await timelinePage.milestonePanel.waitFor({ state: 'hidden' });
    await expect(timelinePage.milestonePanel).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Create a milestone via the panel UI
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Create milestone (Scenario 2)', () => {
  test('Create milestone button navigates to the create form', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    // Mock empty milestones list
    await page.route('**/api/milestones', async (route) => {
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
      await timelinePage.goto();
      await timelinePage.openMilestonePanel();
      await expect(timelinePage.milestoneListEmpty).toBeVisible();

      await timelinePage.milestoneNewButton.click();
      await expect(timelinePage.milestoneForm).toBeVisible();

      // Form has correct fields
      await expect(timelinePage.milestoneNameInput).toBeVisible();
      await expect(timelinePage.milestoneDateInput).toBeVisible();
      await expect(timelinePage.milestoneDescriptionInput).toBeVisible();
      await expect(timelinePage.milestoneFormSubmit).toBeVisible();
    } finally {
      await page.unroute('**/api/milestones');
    }
  });

  test('Creating a milestone calls POST /api/milestones and adds it to the list', async ({
    page,
    testPrefix,
  }) => {
    const timelinePage = new TimelinePage(page);
    const milestoneTitle = `${testPrefix} Foundation Complete`;
    const milestoneDate = dateMonthsFromNow(3);
    let createdMilestoneId: number | null = null;

    try {
      await timelinePage.goto();
      await timelinePage.openMilestonePanel();
      await timelinePage.milestoneNewButton.click();
      await timelinePage.milestoneForm.waitFor({ state: 'visible' });

      await timelinePage.milestoneNameInput.fill(milestoneTitle);
      await timelinePage.milestoneDateInput.fill(milestoneDate);

      // Track the API call to capture the created ID
      const createPromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/milestones') && resp.status() === 201,
      );
      await timelinePage.milestoneFormSubmit.click();
      const response = await createPromise;
      const body = (await response.json()) as { milestone?: { id: number } };
      createdMilestoneId = body.milestone?.id ?? null;

      // Form closes, back to list view
      await timelinePage.milestoneForm.waitFor({ state: 'hidden' });
      // New milestone appears in the list
      await expect(timelinePage.milestoneListItems.first()).toBeVisible();
      const listText = await timelinePage.milestoneListItems.first().textContent();
      expect(listText).toContain(milestoneTitle);
    } finally {
      if (createdMilestoneId !== null) {
        await page.request.delete(`/api/milestones/${createdMilestoneId}`);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Edit milestone
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Edit milestone (Scenario 3)', () => {
  test('Clicking edit button on a milestone opens the edit form with existing values', async ({
    page,
    testPrefix,
  }) => {
    const timelinePage = new TimelinePage(page);
    const milestoneTitle = `${testPrefix} Edit Test Milestone`;
    const milestoneDate = dateMonthsFromNow(2);
    let createdMilestoneId: number | null = null;

    try {
      // Create milestone via API
      const createResponse = await page.request.post('/api/milestones', {
        data: { title: milestoneTitle, targetDate: milestoneDate },
      });
      expect(createResponse.ok()).toBeTruthy();
      const body = (await createResponse.json()) as { milestone: { id: number } };
      createdMilestoneId = body.milestone.id;

      await timelinePage.goto();
      await timelinePage.openMilestonePanel();

      // Wait for the milestone to appear in the list
      await expect(timelinePage.milestoneListItems.first()).toBeVisible();

      // Click edit button for our milestone
      const editButton = page.getByLabel(`Edit ${milestoneTitle}`);
      await editButton.click();

      // Edit form should appear with the milestone's title pre-filled
      await timelinePage.milestoneForm.waitFor({ state: 'visible' });
      const titleValue = await timelinePage.milestoneNameInput.inputValue();
      expect(titleValue).toBe(milestoneTitle);

      const dateValue = await timelinePage.milestoneDateInput.inputValue();
      expect(dateValue).toBe(milestoneDate);
    } finally {
      if (createdMilestoneId !== null) {
        await page.request.delete(`/api/milestones/${createdMilestoneId}`);
      }
    }
  });

  test('Saving edits updates the milestone in the list', async ({ page, testPrefix }) => {
    const timelinePage = new TimelinePage(page);
    const originalTitle = `${testPrefix} Original Milestone`;
    const updatedTitle = `${testPrefix} Updated Milestone`;
    const milestoneDate = dateMonthsFromNow(2);
    let createdMilestoneId: number | null = null;

    try {
      const createResponse = await page.request.post('/api/milestones', {
        data: { title: originalTitle, targetDate: milestoneDate },
      });
      expect(createResponse.ok()).toBeTruthy();
      const body = (await createResponse.json()) as { milestone: { id: number } };
      createdMilestoneId = body.milestone.id;

      await timelinePage.goto();
      await timelinePage.openMilestonePanel();
      await expect(timelinePage.milestoneListItems.first()).toBeVisible();

      // Open edit form
      const editButton = page.getByLabel(`Edit ${originalTitle}`);
      await editButton.click();
      await timelinePage.milestoneForm.waitFor({ state: 'visible' });

      // Update the title
      await timelinePage.milestoneNameInput.clear();
      await timelinePage.milestoneNameInput.fill(updatedTitle);

      // Save
      const updatePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/milestones') &&
          resp.request().method() === 'PATCH' &&
          resp.status() === 200,
      );
      await timelinePage.milestoneFormSubmit.click();
      await updatePromise;

      // Back to list, title updated
      await timelinePage.milestoneForm.waitFor({ state: 'hidden' });
      const listText = await timelinePage.milestoneListItems.first().textContent();
      expect(listText).toContain(updatedTitle);
    } finally {
      if (createdMilestoneId !== null) {
        await page.request.delete(`/api/milestones/${createdMilestoneId}`);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Delete milestone
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Delete milestone (Scenario 4)', () => {
  test('Clicking delete button shows confirmation dialog then removes milestone', async ({
    page,
    testPrefix,
  }) => {
    const timelinePage = new TimelinePage(page);
    const milestoneTitle = `${testPrefix} Delete Test Milestone`;
    const milestoneDate = dateMonthsFromNow(4);
    let createdMilestoneId: number | null = null;

    try {
      const createResponse = await page.request.post('/api/milestones', {
        data: { title: milestoneTitle, targetDate: milestoneDate },
      });
      expect(createResponse.ok()).toBeTruthy();
      const body = (await createResponse.json()) as { milestone: { id: number } };
      createdMilestoneId = body.milestone.id;

      await timelinePage.goto();
      await timelinePage.openMilestonePanel();
      await expect(timelinePage.milestoneListItems.first()).toBeVisible();

      // Click delete button
      const deleteButton = page.getByLabel(`Delete ${milestoneTitle}`);
      await deleteButton.click();

      // Delete confirmation dialog appears
      await expect(timelinePage.milestoneDeleteConfirm).toBeVisible();

      // Confirm deletion
      const deletePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/milestones') &&
          resp.request().method() === 'DELETE' &&
          resp.status() === 204,
      );
      await timelinePage.milestoneDeleteConfirm.click();
      await deletePromise;

      // Milestone removed — no need to clean up
      createdMilestoneId = null;

      // Empty state appears
      await expect(timelinePage.milestoneListEmpty).toBeVisible();
    } finally {
      if (createdMilestoneId !== null) {
        await page.request.delete(`/api/milestones/${createdMilestoneId}`);
      }
    }
  });

  test('Cancelling delete confirmation keeps the milestone in the list', async ({
    page,
    testPrefix,
  }) => {
    const timelinePage = new TimelinePage(page);
    const milestoneTitle = `${testPrefix} Cancel Delete Milestone`;
    const milestoneDate = dateMonthsFromNow(4);
    let createdMilestoneId: number | null = null;

    try {
      const createResponse = await page.request.post('/api/milestones', {
        data: { title: milestoneTitle, targetDate: milestoneDate },
      });
      expect(createResponse.ok()).toBeTruthy();
      const body = (await createResponse.json()) as { milestone: { id: number } };
      createdMilestoneId = body.milestone.id;

      await timelinePage.goto();
      await timelinePage.openMilestonePanel();
      await expect(timelinePage.milestoneListItems.first()).toBeVisible();

      const deleteButton = page.getByLabel(`Delete ${milestoneTitle}`);
      await deleteButton.click();
      await expect(timelinePage.milestoneDeleteConfirm).toBeVisible();

      // Cancel
      const cancelButton = page.getByRole('dialog').getByRole('button', {
        name: 'Cancel',
        exact: true,
      });
      await cancelButton.click();
      await timelinePage.milestoneDeleteConfirm.waitFor({ state: 'hidden' });

      // Milestone still in list
      const listText = await timelinePage.milestoneListItems.first().textContent();
      expect(listText).toContain(milestoneTitle);
    } finally {
      if (createdMilestoneId !== null) {
        await page.request.delete(`/api/milestones/${createdMilestoneId}`);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Milestone diamond markers on the Gantt chart
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Milestone diamond markers on Gantt (Scenario 5)', () => {
  test('Milestone diamond markers appear on the Gantt chart when milestones exist', async ({
    page,
  }) => {
    const timelinePage = new TimelinePage(page);

    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);

    // Mock timeline data with a milestone
    await page.route('**/api/timeline', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            workItems: [
              {
                id: 'milestone-chart-item',
                title: 'Milestone Chart Item',
                status: 'not_started',
                startDate,
                endDate,
                durationDays: 30,
                dependencies: [],
                assignedUser: null,
                isCriticalPath: false,
              },
            ],
            dependencies: [],
            criticalPath: [],
            milestones: [
              {
                id: 1,
                title: 'Foundation Complete',
                targetDate: endDate,
                isCompleted: false,
                completedAt: null,
                workItemIds: [],
              },
            ],
            dateRange: { earliest: startDate, latest: endDate },
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await timelinePage.goto();
      await timelinePage.waitForLoaded();

      // Milestones layer should exist
      await expect(timelinePage.ganttMilestonesLayer).toBeVisible();
      // Diamond markers should be present
      await expect(timelinePage.ganttMilestoneDiamonds.first()).toBeVisible();
    } finally {
      await page.unroute('**/api/timeline');
    }
  });

  test('Milestone diamond has correct aria-label', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    const today = new Date();
    const targetDate = new Date(today.getFullYear(), today.getMonth() + 1, 15)
      .toISOString()
      .slice(0, 10);
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

    await page.route('**/api/timeline', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            workItems: [
              {
                id: 'aria-item',
                title: 'ARIA Test Item',
                status: 'not_started',
                startDate,
                endDate: targetDate,
                durationDays: 30,
                dependencies: [],
                assignedUser: null,
                isCriticalPath: false,
              },
            ],
            dependencies: [],
            criticalPath: [],
            milestones: [
              {
                id: 42,
                title: 'Phase 1 Done',
                targetDate,
                isCompleted: false,
                completedAt: null,
                workItemIds: [],
              },
            ],
            dateRange: { earliest: startDate, latest: targetDate },
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await timelinePage.goto();
      await timelinePage.waitForLoaded();

      const diamond = timelinePage.ganttMilestoneDiamonds.first();
      await expect(diamond).toBeVisible();

      const ariaLabel = await diamond.getAttribute('aria-label');
      expect(ariaLabel).toContain('Phase 1 Done');
      expect(ariaLabel).toContain('incomplete');
    } finally {
      await page.unroute('**/api/timeline');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Milestone filter dropdown
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Milestone filter dropdown (Scenario 6)', () => {
  test('Milestone filter button is visible and opens a dropdown', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();

    await expect(timelinePage.milestoneFilterButton).toBeVisible();
    await timelinePage.milestoneFilterButton.click();

    await expect(timelinePage.milestoneFilterDropdown).toBeVisible();
    // "All Milestones" option should always be present
    await expect(timelinePage.milestoneFilterDropdown.getByText('All Milestones')).toBeVisible();
  });

  test('Milestone filter dropdown shows milestones from timeline data', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    const today = new Date();
    const targetDate = new Date(today.getFullYear(), today.getMonth() + 2, 1)
      .toISOString()
      .slice(0, 10);
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

    await page.route('**/api/timeline', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            workItems: [
              {
                id: 'filter-item',
                title: 'Filter Test Item',
                status: 'not_started',
                startDate,
                endDate: targetDate,
                durationDays: 30,
                dependencies: [],
                assignedUser: null,
                isCriticalPath: false,
              },
            ],
            dependencies: [],
            criticalPath: [],
            milestones: [
              {
                id: 10,
                title: 'Milestone Alpha',
                targetDate,
                isCompleted: false,
                completedAt: null,
                workItemIds: ['filter-item'],
              },
            ],
            dateRange: { earliest: startDate, latest: targetDate },
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await timelinePage.goto();
      await timelinePage.waitForLoaded();

      await timelinePage.milestoneFilterButton.click();
      await expect(timelinePage.milestoneFilterDropdown).toBeVisible();
      await expect(timelinePage.milestoneFilterDropdown.getByText('Milestone Alpha')).toBeVisible();
    } finally {
      await page.unroute('**/api/timeline');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Milestone form validation
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Milestone form validation (Scenario 7)', () => {
  test('Submitting create form without name shows validation error', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    await page.route('**/api/milestones', async (route) => {
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
      await timelinePage.goto();
      await timelinePage.openMilestonePanel();
      await timelinePage.milestoneNewButton.click();
      await timelinePage.milestoneForm.waitFor({ state: 'visible' });

      // Leave name blank, fill date only
      await timelinePage.milestoneDateInput.fill(dateMonthsFromNow(1));
      await timelinePage.milestoneFormSubmit.click();

      // Validation error for name should appear
      const nameError = page.locator('#milestone-title-error');
      await expect(nameError).toBeVisible();
      await expect(nameError).toContainText('required');

      // Form stays open
      await expect(timelinePage.milestoneForm).toBeVisible();
    } finally {
      await page.unroute('**/api/milestones');
    }
  });

  test('Submitting create form without date shows validation error', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    await page.route('**/api/milestones', async (route) => {
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
      await timelinePage.goto();
      await timelinePage.openMilestonePanel();
      await timelinePage.milestoneNewButton.click();
      await timelinePage.milestoneForm.waitFor({ state: 'visible' });

      // Fill name only, leave date blank
      await timelinePage.milestoneNameInput.fill('Missing Date Milestone');
      await timelinePage.milestoneFormSubmit.click();

      // Validation error for date
      const dateError = page.locator('#milestone-date-error');
      await expect(dateError).toBeVisible();
      await expect(dateError).toContainText('required');

      await expect(timelinePage.milestoneForm).toBeVisible();
    } finally {
      await page.unroute('**/api/milestones');
    }
  });

  test('Cancelling the create form returns to the list view', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    await page.route('**/api/milestones', async (route) => {
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
      await timelinePage.goto();
      await timelinePage.openMilestonePanel();
      await timelinePage.milestoneNewButton.click();
      await timelinePage.milestoneForm.waitFor({ state: 'visible' });

      // Click Cancel
      const cancelButton = timelinePage.milestonePanel.getByRole('button', {
        name: 'Cancel',
        exact: true,
      });
      await cancelButton.click();

      // Form closes, back to list
      await timelinePage.milestoneForm.waitFor({ state: 'hidden' });
      await expect(timelinePage.milestoneListEmpty).toBeVisible();
    } finally {
      await page.unroute('**/api/milestones');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Milestone panel — URL-based access from Timeline page
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Milestone panel — URL access', { tag: '@smoke' }, () => {
  test('Timeline page renders milestone panel button', async ({ page }) => {
    await page.goto(TIMELINE_ROUTE);
    const timelinePage = new TimelinePage(page);
    await timelinePage.heading.waitFor({ state: 'visible' });

    await expect(timelinePage.milestonePanelButton).toBeVisible();
    await expect(timelinePage.milestonePanelButton).toContainText('Milestones');
  });
});
