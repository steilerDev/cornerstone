/**
 * E2E tests for the New task dialog (/project/work-items/new)
 *
 * The create page was replaced by an ObjectForm dialog in #2212: the URL stays, the dialog opens
 * over the page you came from, and a deep link shows the Tasks list behind it.
 *
 * Scenarios covered:
 * 1. Dialog opens named "New task" with the Tasks list behind it
 * 2. Cancel, Escape and the close button return to the Tasks list, focus never on <body>
 * 3. Create work item with title only — success, redirects to detail
 * 4. Create work item with all major fields
 * 5. Submit without title shows an inline field error
 * 6. Cancel closes the dialog without creating anything
 * 7. Responsive — no horizontal scroll on current viewport, dark mode
 */

import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { WorkItemCreatePage, WORK_ITEM_CREATE_ROUTE } from '../../pages/WorkItemCreatePage.js';
import { WorkItemsPage } from '../../pages/WorkItemsPage.js';
import { deleteWorkItemViaApi } from '../../fixtures/apiHelpers.js';

const LIST_PATH = routeUrl('workItems');
const WORK_ITEM_PATH =
  /\/project\/work-items\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Dialog opens over the Tasks list
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dialog open (Scenario 1)', { tag: '@responsive' }, () => {
  test('New task dialog opens with the Tasks list behind it', async ({ page }) => {
    const createPage = new WorkItemCreatePage(page);

    await createPage.goto();

    await expect(createPage.heading).toBeVisible();
    await expect(createPage.heading).toHaveText('New task');
    // A deep link renders the parent list behind the dialog (a view: no breadcrumb trail).
    await expect(page.getByRole('heading', { level: 1, name: 'Tasks', exact: true })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(WORK_ITEM_CREATE_ROUTE);
  });

  test('All primary form fields are visible; "More details" reveals the rest', async ({ page }) => {
    const createPage = new WorkItemCreatePage(page);

    await createPage.goto();

    await expect(createPage.titleInput).toBeVisible();
    await expect(createPage.durationInput).toBeVisible();
    await expect(createPage.submitButton).toBeVisible();
    await expect(createPage.cancelButton).toBeVisible();

    await expect(createPage.descriptionInput).toBeHidden();
    await createPage.expandMoreDetails();
    await expect(createPage.descriptionInput).toBeVisible();
    await expect(createPage.statusSelect).toBeVisible();
    await expect(createPage.startAfterInput).toBeVisible();
    await expect(createPage.startBeforeInput).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Cancel / Escape / Close return to the list
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Close paths (Scenario 2)', { tag: '@responsive' }, () => {
  test('Escape closes the dialog back to the Tasks list and focuses its heading', async ({
    page,
  }) => {
    const createPage = new WorkItemCreatePage(page);

    await createPage.goto();
    await page.keyboard.press('Escape');

    await page.waitForURL((url) => url.pathname === LIST_PATH);
    await createPage.form.waitForClosed();
    await expect(page.getByRole('heading', { level: 1, name: 'Tasks', exact: true })).toBeFocused();
  });

  test('The close button closes the dialog back to the Tasks list', async ({ page }) => {
    const createPage = new WorkItemCreatePage(page);

    await createPage.goto();
    await createPage.form.settled();
    await createPage.form.closeButton.click();

    await page.waitForURL((url) => url.pathname === LIST_PATH);
    await createPage.form.waitForClosed();
  });
});

test.describe('Unknown pre-fill area (Scenario 2b)', { tag: '@responsive' }, () => {
  test('An unknown areaId is dropped: the task saves with no area and no error', async ({
    page,
    testPrefix,
  }) => {
    const fresh = await page.context().newPage();
    let createdId: string | null = null;
    try {
      const createPage = new WorkItemCreatePage(fresh);
      await fresh.goto(routeUrl('workItemNew', undefined, { areaId: 'unknown-area' }));
      await createPage.form.waitForOpen();
      // The area picker is empty (the unknown id never shows as a selection)
      await expect(createPage.areaPickerInput).toBeVisible();

      await createPage.fillTitle(`${testPrefix} Unknown Area Task`);
      const responsePromise = fresh.waitForResponse(
        (resp) => resp.url().includes('/api/work-items') && resp.request().method() === 'POST',
      );
      await createPage.submit();
      const response = await responsePromise;
      expect(response.ok()).toBeTruthy();
      const body = (await response.json()) as {
        id?: string;
        areaId?: string | null;
        workItem?: { id: string; areaId?: string | null };
      };
      const item = body.workItem ?? body;
      createdId = item.id ?? null;
      expect(item.areaId ?? null).toBeNull();

      await fresh.waitForURL(WORK_ITEM_PATH);
      await expect(createPage.errorBanner).toHaveCount(0);
      await expect(fresh.getByRole('heading', { level: 1 })).toHaveText(
        `${testPrefix} Unknown Area Task`,
      );
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
      await fresh.close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Create work item with title only — success, redirects to detail
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create with title only — happy path (Scenario 3)', { tag: '@responsive' }, () => {
  test(
    'Creating a work item with title only redirects to the detail page',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const createPage = new WorkItemCreatePage(page);
      let createdId: string | null = null;

      try {
        await createPage.goto();

        // Fill only the title
        const title = `${testPrefix} Title Only Work Item`;
        await createPage.fillTitle(title);

        // Capture the response to get the new work item ID
        const responsePromise = page.waitForResponse(
          (resp) => resp.url().includes('/api/work-items') && resp.request().method() === 'POST',
        );

        await createPage.submit();

        const response = await responsePromise;
        const body = (await response.json()) as { workItem?: { id: string }; id?: string };
        createdId = body.workItem?.id ?? body.id ?? null;

        // Should land on /project/work-items/:id (UUID form). The UUID pattern excludes the
        // dialog's own /new URL, which a '**' glob would match immediately.
        await page.waitForURL(WORK_ITEM_PATH);
        expect(new URL(page.url()).pathname).not.toBe(WORK_ITEM_CREATE_ROUTE);

        // Detail page shows the correct title
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
      } finally {
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Create work item with all major fields
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create with all fields (Scenario 4)', { tag: '@responsive' }, () => {
  test('Creating a work item with title, description, status, and dates succeeds', async ({
    page,
    testPrefix,
  }) => {
    const createPage = new WorkItemCreatePage(page);
    let createdId: string | null = null;

    try {
      await createPage.goto();

      const title = `${testPrefix} Full Fields Work Item`;

      await createPage.fillForm({
        title,
        description: 'This is a full-featured work item created by E2E tests.',
        status: 'in_progress',
        durationDays: '30',
        startAfter: '2026-03-01',
        startBefore: '2026-06-30',
      });

      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/work-items') && resp.request().method() === 'POST',
      );

      await createPage.submit();

      const response = await responsePromise;
      expect(response.ok()).toBeTruthy();

      const body = (await response.json()) as { workItem?: { id: string }; id?: string };
      createdId = body.workItem?.id ?? body.id ?? null;

      // Redirect to detail page
      await page.waitForURL(WORK_ITEM_PATH);

      // Title visible on detail page
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  test('Status select contains expected options', async ({ page }) => {
    const createPage = new WorkItemCreatePage(page);

    await createPage.goto();
    await createPage.expandMoreDetails();

    // Verify status select has the 3 expected options (create form does not include "Blocked")
    const options = await createPage.statusSelect.locator('option').allTextContents();
    expect(options).toContain('Not started');
    expect(options).toContain('In progress');
    expect(options).toContain('Done');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Submit without title shows validation error
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Validation — title required (Scenario 5)', { tag: '@responsive' }, () => {
  test('Submitting form with empty title shows an inline error and focuses the title', async ({
    page,
  }) => {
    const createPage = new WorkItemCreatePage(page);

    await createPage.goto();

    await createPage.submitButton.click();

    await expect(createPage.titleErrorText).toBeVisible();
    await expect(createPage.titleErrorText).toContainText(/title is required/i);
    await expect(createPage.titleInput).toHaveAttribute('aria-invalid', 'true');
    await expect(createPage.titleInput).toBeFocused();
    // Field errors are not alerts
    await expect(createPage.errorBanner).toHaveCount(0);

    // The dialog stays open on /new
    expect(new URL(page.url()).pathname).toBe(WORK_ITEM_CREATE_ROUTE);
  });

  test('Validation error clears when the title is filled', async ({ page }) => {
    const createPage = new WorkItemCreatePage(page);

    await createPage.goto();

    await createPage.submitButton.click();
    await expect(createPage.titleErrorText).toBeVisible();

    await createPage.titleInput.fill('Now Has a Title');

    await expect(createPage.titleErrorText).toHaveCount(0);
    await expect(createPage.titleInput).not.toHaveAttribute('aria-invalid', 'true');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Cancel closes the dialog without creating anything
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Cancel navigation (Scenario 6)', { tag: '@responsive' }, () => {
  test('Cancel closes the dialog (after the discard prompt) without creating a work item', async ({
    page,
    testPrefix,
  }) => {
    const createPage = new WorkItemCreatePage(page);
    const workItemsPage = new WorkItemsPage(page);

    await createPage.goto();

    // Fill a title but cancel: typed input asks before it is discarded
    const title = `${testPrefix} Cancelled Work Item`;
    await createPage.fillTitle(title);

    await createPage.cancelButton.click();
    await createPage.form.discardConfirm.waitForOpen();
    await createPage.form.discardConfirm.confirm();

    await page.waitForURL((url) => url.pathname === LIST_PATH);
    await createPage.form.waitForClosed();

    // Verify the cancelled item was NOT created
    await workItemsPage.waitForLoaded();
    await workItemsPage.search(title);
    const titles = await workItemsPage.getWorkItemTitles();
    expect(titles).not.toContain(title);
  });

  test('Cancel on an untouched form closes without a prompt', async ({ page }) => {
    const createPage = new WorkItemCreatePage(page);

    await createPage.goto();
    await createPage.cancel();

    await page.waitForURL((url) => url.pathname === LIST_PATH);
    await expect(createPage.form.discardConfirm.dialog).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Responsive — no horizontal scroll
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout (Scenario 7)', { tag: '@responsive' }, () => {
  test('New task dialog renders without horizontal scroll on current viewport', async ({
    page,
  }) => {
    const createPage = new WorkItemCreatePage(page);

    await createPage.goto();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });

  test('Save and Cancel are reachable on current viewport', async ({ page }) => {
    const createPage = new WorkItemCreatePage(page);

    await createPage.goto();

    await expect(createPage.titleInput).toBeVisible();
    await expect(createPage.submitButton).toBeVisible();
    await expect(createPage.cancelButton).toBeVisible();
    await expect(createPage.submitButton).toBeInViewport();
    await expect(createPage.cancelButton).toBeInViewport();
  });

  test('New task dialog renders in dark mode without horizontal scroll', async ({ page }) => {
    const createPage = new WorkItemCreatePage(page);
    await createPage.goto();
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    await expect(createPage.heading).toBeVisible();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });
});
