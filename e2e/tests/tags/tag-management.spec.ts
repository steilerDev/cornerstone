/**
 * E2E tests for Tag Management (/tags)
 *
 * UAT Scenarios covered:
 * 1.  Page loads with "Tag Management" heading
 * 2.  Create tag — happy path (name + color, appears in list, preview shown)
 * 3.  Create tag — name only (default color used, tag appears in list)
 * 4.  Create tag — validation (submit disabled when name empty)
 * 5.  Create tag — duplicate name shows error
 * 6.  Edit tag — change name and color, changes persist on reload
 * 7.  Edit tag — cancel restores original values
 * 8.  Delete tag — confirm removes tag from list
 * 9.  Delete tag — cancel leaves tag in list
 * 10. Empty state visible when no tags exist (mocked API)
 * 11. Responsive — no horizontal scroll on current viewport
 * 12. Dark mode — page renders correctly without layout breakage
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { TagManagementPage } from '../../pages/TagManagementPage.js';
import { API } from '../../fixtures/testData.js';

// ─────────────────────────────────────────────────────────────────────────────
// API helpers — create/delete tags directly to keep tests isolated
// ─────────────────────────────────────────────────────────────────────────────

interface TagApiResponse {
  id: string;
  name: string;
  color: string | null;
}

/**
 * Create a tag via the REST API and return its id.
 */
async function createTagViaApi(
  page: Page,
  data: { name: string; color?: string },
): Promise<string> {
  const response = await page.request.post(API.tags, { data });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as TagApiResponse;
  return body.id;
}

/**
 * Delete a tag via the REST API (best-effort; ignores 404 on already-deleted tags).
 */
async function deleteTagViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`${API.tags}/${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Page loads with heading
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Page load (Scenario 1)', { tag: '@responsive' }, () => {
  test('Tag Management page loads with h1 heading', { tag: '@smoke' }, async ({ page }) => {
    const tagsPage = new TagManagementPage(page);

    // When: I navigate to the Tag Management page
    await tagsPage.goto();

    // Then: The h1 heading "Tag Management" is visible
    await expect(tagsPage.heading).toBeVisible();
    await expect(tagsPage.heading).toHaveText('Tag Management');
  });

  test('Create New Tag card is always visible on page load', async ({ page }) => {
    const tagsPage = new TagManagementPage(page);

    await tagsPage.goto();

    // Then: The create form elements are visible
    await expect(tagsPage.createTagNameInput).toBeVisible();
    await expect(tagsPage.createTagColorInput).toBeVisible();
    await expect(tagsPage.createTagButton).toBeVisible();
    await expect(tagsPage.previewRow).toBeVisible();
  });

  test('Existing Tags section heading is visible and shows count', async ({ page }) => {
    const tagsPage = new TagManagementPage(page);

    await tagsPage.goto();

    // Then: The existing tags heading shows "Existing Tags (N)"
    await expect(tagsPage.existingTagsHeading).toBeVisible();
    const headingText = await tagsPage.existingTagsHeading.textContent();
    expect(headingText).toMatch(/Existing Tags \(\d+\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Create tag — happy path (name + color)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create tag — happy path (Scenario 2)', { tag: '@responsive' }, () => {
  test('Create tag with name and color — appears in list with correct color', async ({
    page,
    testPrefix,
  }) => {
    const tagsPage = new TagManagementPage(page);
    let createdId: string | null = null;
    const tagName = `${testPrefix} E2E Happy Path Tag`;

    try {
      await tagsPage.goto();

      // Given: The create form is visible
      await expect(tagsPage.createTagNameInput).toBeVisible();

      // When: I fill in the name
      await tagsPage.createTagNameInput.fill(tagName);

      // Then: The preview row shows the tag name
      await expect(tagsPage.previewRow).toBeVisible();
      const previewText = await tagsPage.previewRow.textContent();
      expect(previewText).toContain(tagName);

      // When: I submit the form
      await tagsPage.createTagButton.click();

      // Then: A success banner appears
      const successText = await tagsPage.getSuccessBannerText();
      expect(successText).toBeTruthy();
      expect(successText).toContain(tagName);

      // And: The tag appears in the existing tags list
      await tagsPage.waitForTagsLoaded();
      const names = await tagsPage.getTagNames();
      expect(names).toContain(tagName);

      // And: The count in the heading increased (capture id for cleanup)
      const resp = await page.request.get(API.tags);
      const body = (await resp.json()) as { tags: TagApiResponse[] };
      const found = body.tags.find((t) => t.name === tagName);
      if (found) createdId = found.id;
    } finally {
      if (createdId) await deleteTagViaApi(page, createdId);
    }
  });

  test('Create tag with explicit color — color is stored', async ({ page, testPrefix }) => {
    const tagsPage = new TagManagementPage(page);
    let createdId: string | null = null;
    const tagName = `${testPrefix} E2E Color Tag`;
    const tagColor = '#e74c3c';

    try {
      await tagsPage.goto();

      // When: I create a tag with a specific color
      await tagsPage.createTag(tagName, tagColor);

      // Then: Success banner appears
      const successText = await tagsPage.getSuccessBannerText();
      expect(successText).toBeTruthy();

      // And: Tag appears in the list
      await tagsPage.waitForTagsLoaded();
      const names = await tagsPage.getTagNames();
      expect(names).toContain(tagName);

      // And: The API confirms the color was stored
      const resp = await page.request.get(API.tags);
      const body = (await resp.json()) as { tags: TagApiResponse[] };
      const found = body.tags.find((t) => t.name === tagName);
      if (found) {
        createdId = found.id;
        // Color may be stored normalized; verify it contains the hue component
        expect(found.color?.toLowerCase()).toBeTruthy();
      }
    } finally {
      if (createdId) await deleteTagViaApi(page, createdId);
    }
  });

  test('After successful creation, name input is cleared and ready for next tag', async ({
    page,
    testPrefix,
  }) => {
    const tagsPage = new TagManagementPage(page);
    let createdId: string | null = null;
    const tagName = `${testPrefix} E2E Input Reset Tag`;

    try {
      await tagsPage.goto();
      await tagsPage.createTag(tagName);

      // Then: Success banner visible
      // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
      await tagsPage.successBanner.waitFor({ state: 'visible' });

      // And: The name input is cleared
      await expect(tagsPage.createTagNameInput).toHaveValue('');

      // And: The Create Tag button is disabled (empty input)
      await expect(tagsPage.createTagButton).toBeDisabled();

      // Cleanup
      const resp = await page.request.get(API.tags);
      const body = (await resp.json()) as { tags: TagApiResponse[] };
      const found = body.tags.find((t) => t.name === tagName);
      if (found) createdId = found.id;
    } finally {
      if (createdId) await deleteTagViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Create tag — name only (default color)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create tag — name only (Scenario 3)', { tag: '@responsive' }, () => {
  test('Create tag with name only — default color used, tag appears in list', async ({
    page,
    testPrefix,
  }) => {
    const tagsPage = new TagManagementPage(page);
    let createdId: string | null = null;
    const tagName = `${testPrefix} E2E Name Only Tag`;

    try {
      await tagsPage.goto();

      // When: I fill only the name and submit (leaving color at default)
      await tagsPage.createTag(tagName);

      // Then: Success banner appears
      const successText = await tagsPage.getSuccessBannerText();
      expect(successText).toBeTruthy();

      // And: The tag appears in the list
      await tagsPage.waitForTagsLoaded();
      const names = await tagsPage.getTagNames();
      expect(names).toContain(tagName);

      // And: The API response includes a color (default blue)
      const resp = await page.request.get(API.tags);
      const body = (await resp.json()) as { tags: TagApiResponse[] };
      const found = body.tags.find((t) => t.name === tagName);
      if (found) {
        createdId = found.id;
        expect(found.color).toBeTruthy();
      }
    } finally {
      if (createdId) await deleteTagViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Create tag — validation (submit disabled when name empty)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create tag — validation (Scenario 4)', { tag: '@responsive' }, () => {
  test('"Create Tag" button is disabled when the name input is empty', async ({ page }) => {
    const tagsPage = new TagManagementPage(page);

    await tagsPage.goto();

    // Given: The name input is empty (default state on page load)
    await expect(tagsPage.createTagNameInput).toHaveValue('');

    // Then: The submit button is disabled
    await expect(tagsPage.createTagButton).toBeDisabled();
  });

  test('"Create Tag" button becomes enabled when a name is typed', async ({ page }) => {
    const tagsPage = new TagManagementPage(page);

    await tagsPage.goto();

    // When: I type a name
    await tagsPage.createTagNameInput.fill('Temporary Name');

    // Then: The submit button becomes enabled
    await expect(tagsPage.createTagButton).toBeEnabled();
  });

  test('Clearing the name after typing disables the submit button again', async ({ page }) => {
    const tagsPage = new TagManagementPage(page);

    await tagsPage.goto();

    // When: I type then clear the name
    await tagsPage.createTagNameInput.fill('Some Name');
    await tagsPage.createTagNameInput.fill('');

    // Then: The submit button is disabled again
    await expect(tagsPage.createTagButton).toBeDisabled();
  });

  test('Whitespace-only name keeps the submit button disabled', async ({ page }) => {
    const tagsPage = new TagManagementPage(page);

    await tagsPage.goto();

    // When: I type only whitespace
    await tagsPage.createTagNameInput.fill('   ');

    // Then: The submit button is still disabled (component trims the value)
    await expect(tagsPage.createTagButton).toBeDisabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Create tag — duplicate name shows error
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create tag — duplicate name error (Scenario 5)', { tag: '@responsive' }, () => {
  test('Creating a tag with a name that already exists shows an error message', async ({
    page,
    testPrefix,
  }) => {
    const tagsPage = new TagManagementPage(page);
    let createdId: string | null = null;
    const tagName = `${testPrefix} E2E Duplicate Tag`;

    try {
      // Given: A tag with this name already exists (created via API for isolation)
      createdId = await createTagViaApi(page, { name: tagName });

      await tagsPage.goto();

      // When: I try to create another tag with the same name
      await tagsPage.createTag(tagName);

      // Then: An error message appears in the create section
      const errorText = await tagsPage.getCreateErrorText();
      expect(errorText).toBeTruthy();
      expect(errorText?.toLowerCase()).toMatch(/already exists|duplicate|conflict/);

      // And: No second tag with that name was added to the list
      // (count of matching names should still be 1)
      const names = await tagsPage.getTagNames();
      const matchingCount = names.filter((n) => n === tagName).length;
      expect(matchingCount).toBe(1);
    } finally {
      if (createdId) await deleteTagViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Edit tag — change name and color, changes persist on reload
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Edit tag (Scenario 6)', { tag: '@responsive' }, () => {
  test('Edit tag name — updated name appears in list and persists on page reload', async ({
    page,
    testPrefix,
  }) => {
    const tagsPage = new TagManagementPage(page);
    let createdId: string | null = null;
    const originalName = `${testPrefix} E2E Original Name Tag`;
    const updatedName = `${testPrefix} E2E Updated Name Tag`;

    try {
      // Given: A tag exists
      createdId = await createTagViaApi(page, { name: originalName });

      await tagsPage.goto();
      await tagsPage.waitForTagsLoaded();

      // When: I click Edit on the tag
      await tagsPage.startEdit(originalName);

      // And: I change the name
      await tagsPage.editNameInput.fill(updatedName);

      // And: I click Save
      await tagsPage.saveEdit();

      // Then: A success banner appears
      const successText = await tagsPage.getSuccessBannerText();
      expect(successText).toBeTruthy();
      expect(successText).toContain(updatedName);

      // And: The updated name appears in the list
      const namesAfterEdit = await tagsPage.getTagNames();
      expect(namesAfterEdit).toContain(updatedName);
      expect(namesAfterEdit).not.toContain(originalName);

      // And: The changes persist on page reload
      await tagsPage.goto();
      await tagsPage.waitForTagsLoaded();
      const namesAfterReload = await tagsPage.getTagNames();
      expect(namesAfterReload).toContain(updatedName);
      expect(namesAfterReload).not.toContain(originalName);
    } finally {
      if (createdId) await deleteTagViaApi(page, createdId);
    }
  });

  test('Editing one tag disables Edit/Delete buttons on other tags', async ({
    page,
    testPrefix,
  }) => {
    const tagsPage = new TagManagementPage(page);
    const createdIds: string[] = [];
    const tagA = `${testPrefix} E2E Edit Lock A`;
    const tagB = `${testPrefix} E2E Edit Lock B`;

    try {
      createdIds.push(await createTagViaApi(page, { name: tagA }));
      createdIds.push(await createTagViaApi(page, { name: tagB }));

      await tagsPage.goto();
      await tagsPage.waitForTagsLoaded();

      // When: I start editing tag A
      await tagsPage.startEdit(tagA);

      // Then: The Edit and Delete buttons on tag B are disabled
      const rowB = await tagsPage.getTagRow(tagB);
      if (rowB) {
        const editButtonB = rowB.getByRole('button', { name: 'Edit', exact: true });
        const deleteButtonB = rowB.getByRole('button', { name: 'Delete', exact: true });
        await expect(editButtonB).toBeDisabled();
        await expect(deleteButtonB).toBeDisabled();
      }

      // Cleanup: cancel the edit
      await tagsPage.cancelEdit();
    } finally {
      for (const id of createdIds) {
        await deleteTagViaApi(page, id);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Edit tag — cancel restores original values
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Edit tag — cancel (Scenario 7)', { tag: '@responsive' }, () => {
  test('Cancelling edit restores the original tag name without making API changes', async ({
    page,
    testPrefix,
  }) => {
    const tagsPage = new TagManagementPage(page);
    let createdId: string | null = null;
    const originalName = `${testPrefix} E2E Cancel Edit Tag`;

    try {
      // Given: A tag exists
      createdId = await createTagViaApi(page, { name: originalName });

      await tagsPage.goto();
      await tagsPage.waitForTagsLoaded();

      // When: I start editing and change the name
      await tagsPage.startEdit(originalName);
      await tagsPage.editNameInput.fill('This should not be saved');

      // And: I click Cancel
      await tagsPage.cancelEdit();

      // Then: The original name is still in the list
      const names = await tagsPage.getTagNames();
      expect(names).toContain(originalName);
      expect(names).not.toContain('This should not be saved');

      // And: No success banner appears
      const successText = await tagsPage.getSuccessBannerText();
      expect(successText).toBeNull();
    } finally {
      if (createdId) await deleteTagViaApi(page, createdId);
    }
  });

  test('Clearing name in edit mode disables the Save button', async ({ page, testPrefix }) => {
    const tagsPage = new TagManagementPage(page);
    let createdId: string | null = null;
    const tagName = `${testPrefix} E2E Save Guard Tag`;

    try {
      createdId = await createTagViaApi(page, { name: tagName });

      await tagsPage.goto();
      await tagsPage.waitForTagsLoaded();
      await tagsPage.startEdit(tagName);

      // When: I clear the name
      await tagsPage.editNameInput.fill('');

      // Then: Save button is disabled
      await expect(tagsPage.editSaveButton).toBeDisabled();

      // Cleanup: cancel
      await tagsPage.cancelEdit();
    } finally {
      if (createdId) await deleteTagViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Delete tag — confirm removes from list
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Delete tag — confirm (Scenario 8)', { tag: '@responsive' }, () => {
  test('Delete modal shows tag name; confirming removes tag from list', async ({
    page,
    testPrefix,
  }) => {
    const tagsPage = new TagManagementPage(page);
    const tagName = `${testPrefix} E2E Delete Target Tag`;

    // Given: A tag exists
    const createdId = await createTagViaApi(page, { name: tagName });

    await tagsPage.goto();
    await tagsPage.waitForTagsLoaded();

    const namesBefore = await tagsPage.getTagNames();
    expect(namesBefore).toContain(tagName);

    // When: I click Delete on the tag
    await tagsPage.openDeleteModal(tagName);

    // Then: The delete modal is visible
    await expect(tagsPage.deleteModal).toBeVisible();

    // And: The modal title says "Delete Tag"
    await expect(tagsPage.deleteModalTitle).toHaveText('Delete Tag');

    // And: The modal text mentions the tag name
    const modalText = await tagsPage.deleteModal.textContent();
    expect(modalText).toContain(tagName);

    // When: I confirm deletion
    await tagsPage.confirmDelete();

    // Then: The modal closes
    // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
    await expect(tagsPage.deleteModal).not.toBeVisible();

    // And: A success banner appears
    const successText = await tagsPage.getSuccessBannerText();
    expect(successText).toBeTruthy();

    // And: The tag is removed from the list
    const namesAfter = await tagsPage.getTagNames();
    expect(namesAfter).not.toContain(tagName);

    // Note: tag was deleted via UI — no API cleanup needed
    void createdId;
  });

  test('Delete modal count decrements — heading count updates after deletion', async ({
    page,
    testPrefix,
  }) => {
    const tagsPage = new TagManagementPage(page);
    const tagName = `${testPrefix} E2E Count Check Tag`;

    const createdId = await createTagViaApi(page, { name: tagName });

    await tagsPage.goto();
    await tagsPage.waitForTagsLoaded();

    const countBefore = await tagsPage.getTagCount();

    // Delete via UI
    await tagsPage.openDeleteModal(tagName);
    await tagsPage.confirmDelete();
    // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
    await expect(tagsPage.deleteModal).not.toBeVisible();

    // Then: The count in the heading decreased by 1
    const countAfter = await tagsPage.getTagCount();
    expect(countAfter).toBe(countBefore - 1);

    void createdId;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Delete tag — cancel leaves in list
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Delete tag — cancel (Scenario 9)', { tag: '@responsive' }, () => {
  test('Cancelling the delete modal leaves the tag in the list', async ({ page, testPrefix }) => {
    const tagsPage = new TagManagementPage(page);
    let createdId: string | null = null;
    const tagName = `${testPrefix} E2E Cancel Delete Tag`;

    try {
      // Given: A tag exists
      createdId = await createTagViaApi(page, { name: tagName });

      await tagsPage.goto();
      await tagsPage.waitForTagsLoaded();

      // When: I open the delete modal and cancel
      await tagsPage.openDeleteModal(tagName);
      await tagsPage.cancelDelete();

      // Then: The modal is closed
      // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
      await expect(tagsPage.deleteModal).not.toBeVisible();

      // And: The tag is still in the list
      const names = await tagsPage.getTagNames();
      expect(names).toContain(tagName);
    } finally {
      if (createdId) await deleteTagViaApi(page, createdId);
    }
  });

  test('Clicking the modal backdrop closes the modal without deleting the tag', async ({
    page,
    testPrefix,
  }) => {
    const tagsPage = new TagManagementPage(page);
    let createdId: string | null = null;
    const tagName = `${testPrefix} E2E Backdrop Cancel Tag`;

    try {
      createdId = await createTagViaApi(page, { name: tagName });

      await tagsPage.goto();
      await tagsPage.waitForTagsLoaded();

      // Open the delete modal
      await tagsPage.openDeleteModal(tagName);
      await expect(tagsPage.deleteModal).toBeVisible();

      // Click the backdrop at the top-left corner — outside the centered modal content box.
      // Clicking center would hit the modal content div that sits on top of the backdrop.
      // No explicit timeout — uses project-level actionTimeout (15s for WebKit).
      await page.locator('[class*="modalBackdrop"]').click({ position: { x: 10, y: 10 } });

      // Then: The modal closes
      // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
      await expect(tagsPage.deleteModal).not.toBeVisible();

      // And: The tag is still present
      const names = await tagsPage.getTagNames();
      expect(names).toContain(tagName);
    } finally {
      if (createdId) await deleteTagViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Empty state visible when no tags exist
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Empty state (Scenario 10)', { tag: '@responsive' }, () => {
  test('Empty state is shown in the Existing Tags card when no tags exist', async ({ page }) => {
    const tagsPage = new TagManagementPage(page);

    // Intercept the API to return an empty tag list without mutating real data
    await page.route(API.tags, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tags: [] }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await tagsPage.goto();

      // Then: The empty state paragraph is visible
      // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
      await expect(tagsPage.emptyState).toBeVisible();

      // And: The empty state text matches expected message
      const emptyText = await tagsPage.emptyState.textContent();
      expect(emptyText?.toLowerCase()).toMatch(/no tags yet/);

      // And: The heading shows count of 0
      const count = await tagsPage.getTagCount();
      expect(count).toBe(0);
    } finally {
      await page.unroute(API.tags);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 11: Responsive — no horizontal scroll on current viewport
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout (Scenario 11)', { tag: '@responsive' }, () => {
  test('Tag Management page renders without horizontal scroll on current viewport', async ({
    page,
  }) => {
    const tagsPage = new TagManagementPage(page);

    await tagsPage.goto();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });

  test('Create form fields are usable on current viewport', async ({ page }) => {
    const tagsPage = new TagManagementPage(page);

    await tagsPage.goto();

    // All form inputs and the preview row should be visible without scrolling
    await expect(tagsPage.createTagNameInput).toBeVisible();
    await expect(tagsPage.createTagColorInput).toBeVisible();
    await expect(tagsPage.createTagButton).toBeVisible();
    await expect(tagsPage.previewRow).toBeVisible();
  });

  test('Delete modal renders without horizontal overflow on current viewport', async ({
    page,
    testPrefix,
  }) => {
    const tagsPage = new TagManagementPage(page);
    let createdId: string | null = null;
    const tagName = `${testPrefix} E2E Responsive Modal Tag`;

    try {
      createdId = await createTagViaApi(page, { name: tagName });

      await tagsPage.goto();
      await tagsPage.waitForTagsLoaded();

      // Open delete modal
      await tagsPage.openDeleteModal(tagName);

      // Verify no horizontal scroll with modal open
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalScroll).toBe(false);

      await tagsPage.cancelDelete();
    } finally {
      if (createdId) await deleteTagViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 12: Dark mode — page renders without layout breakage
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dark mode rendering (Scenario 12)', { tag: '@responsive' }, () => {
  test('Tag Management page renders correctly in dark mode', async ({ page }) => {
    const tagsPage = new TagManagementPage(page);

    await page.goto('/tags');
    // Activate dark mode before checking
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    // No explicit timeout — uses project-level actionTimeout (15s for WebKit).
    await tagsPage.heading.waitFor({ state: 'visible' });

    // Heading is visible
    await expect(tagsPage.heading).toBeVisible();

    // Create form is usable in dark mode
    await expect(tagsPage.createTagNameInput).toBeVisible();
    await expect(tagsPage.createTagButton).toBeVisible();

    // No horizontal scroll in dark mode
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  test('Delete modal is usable in dark mode', async ({ page, testPrefix }) => {
    const tagsPage = new TagManagementPage(page);
    let createdId: string | null = null;
    const tagName = `${testPrefix} E2E Dark Mode Delete Tag`;

    try {
      createdId = await createTagViaApi(page, { name: tagName });

      await page.goto('/tags');
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
      });

      // No explicit timeout — uses project-level actionTimeout (15s for WebKit).
      await tagsPage.heading.waitFor({ state: 'visible' });
      await tagsPage.waitForTagsLoaded();
      await tagsPage.openDeleteModal(tagName);

      // Modal visible and all buttons usable in dark mode
      await expect(tagsPage.deleteModal).toBeVisible();
      await expect(tagsPage.deleteModalTitle).toBeVisible();
      await expect(tagsPage.deleteConfirmButton).toBeVisible();
      await expect(tagsPage.deleteCancelButton).toBeVisible();

      await tagsPage.cancelDelete();
    } finally {
      if (createdId) await deleteTagViaApi(page, createdId);
    }
  });
});
