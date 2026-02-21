/**
 * E2E tests for Work Item Detail page (/work-items/:id)
 *
 * Scenarios covered:
 * 1.  Page loads with work item title as heading
 * 2.  Back button navigates to /work-items
 * 3.  Notes — add a note and verify it appears
 * 4.  Subtasks — add a subtask and verify it appears
 * 5.  Vendor linking regression — vendor dropdown loads without error
 *     (regression test for fetchVendors pageSize bug)
 * 6.  Inline edit description — click to edit, save, verify updated
 * 7.  Delete work item — confirm modal + redirect to list
 * 8.  404/error state for non-existent work item ID
 * 9.  Responsive — no horizontal scroll on current viewport
 * 10. Dark mode rendering
 */

import { test, expect } from '../../fixtures/auth.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';
import { API } from '../../fixtures/testData.js';
import { createWorkItemViaApi, deleteWorkItemViaApi } from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Page loads with work item title as heading
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Page load (Scenario 1)', { tag: '@responsive' }, () => {
  test('Work Item detail page loads with the work item title as the h1 heading', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;
    const title = `${testPrefix} Detail Heading Test`;

    try {
      createdId = await createWorkItemViaApi(page, { title });

      await detailPage.goto(createdId);

      await expect(detailPage.heading).toBeVisible();
      await expect(detailPage.heading).toHaveText(title);
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  test('All key sections are visible on page load', async ({ page, testPrefix }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} All Sections Test`,
      });

      await detailPage.goto(createdId);

      // Left column sections
      await expect(detailPage.descriptionSection).toBeVisible();
      await expect(detailPage.scheduleSection).toBeVisible();
      await expect(detailPage.budgetSection).toBeVisible();

      // Right column sections
      await expect(detailPage.notesSection).toBeVisible();
      await expect(detailPage.subtasksSection).toBeVisible();
      await expect(detailPage.dependenciesSection).toBeVisible();
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  test('Status select is visible and shows the work item status', async ({ page, testPrefix }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Status Test`,
        status: 'in_progress',
      });

      await detailPage.goto(createdId);

      await expect(detailPage.statusSelect).toBeVisible();
      // The select should show "In Progress"
      await expect(detailPage.statusSelect).toHaveValue('in_progress');
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Back button navigates to /work-items
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Back button navigation (Scenario 2)', { tag: '@responsive' }, () => {
  test('"← Back to Work Items" button navigates to the work items list', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createWorkItemViaApi(page, { title: `${testPrefix} Back Nav Test` });

      await detailPage.goto(createdId);

      await detailPage.backButton.click();

      await page.waitForURL('**/work-items', { timeout: 5000 });
      expect(page.url()).toContain('/work-items');
      expect(page.url()).not.toMatch(/\/work-items\/[a-z0-9]/);
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Notes — add a note and verify it appears
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Add note (Scenario 3)', { tag: '@responsive' }, () => {
  test('Adding a note to a work item displays it in the notes list', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;
    const noteText = `${testPrefix} This is a test note added by E2E.`;

    try {
      createdId = await createWorkItemViaApi(page, { title: `${testPrefix} Note Add Test` });

      await detailPage.goto(createdId);

      // Notes section is visible and initially empty
      await expect(detailPage.notesSection).toBeVisible();
      await expect(detailPage.noteTextarea).toBeVisible();

      // Add the note
      await detailPage.addNote(noteText);

      // Note content appears in the notes list
      await expect(
        detailPage.notesSection.locator('[class*="noteContent"]').filter({ hasText: noteText }),
      ).toBeVisible();
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  test('Add Note button is disabled when note textarea is empty', async ({ page, testPrefix }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createWorkItemViaApi(page, { title: `${testPrefix} Note Button Test` });

      await detailPage.goto(createdId);

      // Button should be disabled when textarea is empty
      await expect(detailPage.addNoteButton).toBeDisabled();

      // After filling, button should be enabled
      await detailPage.noteTextarea.fill('Test note text');
      await expect(detailPage.addNoteButton).toBeEnabled();
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Subtasks — add a subtask and verify it appears
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Add subtask (Scenario 4)', { tag: '@responsive' }, () => {
  test('Adding a subtask to a work item displays it in the subtasks list', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;
    const subtaskTitle = `${testPrefix} Install foundation forms`;

    try {
      createdId = await createWorkItemViaApi(page, { title: `${testPrefix} Subtask Add Test` });

      await detailPage.goto(createdId);

      await expect(detailPage.subtasksSection).toBeVisible();
      await expect(detailPage.subtaskInput).toBeVisible();

      // Add the subtask
      await detailPage.addSubtask(subtaskTitle);

      // Subtask title appears in the list
      await expect(
        detailPage.subtasksSection
          .locator('[class*="subtaskTitle"]')
          .filter({ hasText: subtaskTitle }),
      ).toBeVisible();
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  test('Subtask checkbox is visible and can be toggled', async ({ page, testPrefix }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;
    const subtaskTitle = `${testPrefix} Toggleable Subtask`;

    try {
      createdId = await createWorkItemViaApi(page, { title: `${testPrefix} Subtask Toggle Test` });

      await detailPage.goto(createdId);

      // Add a subtask
      await detailPage.addSubtask(subtaskTitle);

      // Find and toggle the checkbox
      const subtaskItem = detailPage.subtasksSection
        .locator('[class*="subtaskItem"]')
        .filter({ hasText: subtaskTitle });

      const checkbox = subtaskItem.locator('input[type="checkbox"]');
      await expect(checkbox).not.toBeChecked();

      // Toggle on
      await checkbox.click();
      await expect(checkbox).toBeChecked({ timeout: 5000 });
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Vendor linking regression test
// Regression: fetchVendors was called with pageSize=500 (previously 500 — was an old bug
// that caused a 400 response). This test ensures the vendor picker loads without error.
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Vendor picker loads without error (Scenario 5 — regression)',
  { tag: '@responsive' },
  () => {
    test('Work item detail page loads without error banner (vendor API call succeeds)', async ({
      page,
      testPrefix,
    }) => {
      const detailPage = new WorkItemDetailPage(page);
      let createdId: string | null = null;

      try {
        createdId = await createWorkItemViaApi(page, {
          title: `${testPrefix} Vendor Picker Regression`,
        });

        // Monitor for any failed vendor API requests
        const vendorApiErrors: string[] = [];
        page.on('response', (response) => {
          if (response.url().includes('/api/vendors') && !response.ok()) {
            vendorApiErrors.push(`${response.status()} ${response.url()}`);
          }
        });

        await detailPage.goto(createdId);

        // The page should load without an error banner
        const errorText = await detailPage.getInlineErrorText();
        expect(errorText).toBeNull();

        // No vendor API errors (regression: was 400 for pageSize=500 before fix)
        expect(vendorApiErrors).toHaveLength(0);

        // The Budget section should be visible and not show an error state
        await expect(detailPage.budgetSection).toBeVisible();

        // The Vendors subsection heading is visible
        await expect(
          detailPage.budgetSection.getByRole('heading', { level: 3, name: 'Vendors', exact: true }),
        ).toBeVisible();
      } finally {
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });

    test('Vendor picker dropdown renders under the Vendors section when vendors exist', async ({
      page,
      testPrefix,
    }) => {
      const detailPage = new WorkItemDetailPage(page);
      let workItemId: string | null = null;
      let vendorId: string | null = null;

      try {
        // Create a vendor to ensure the picker appears
        const vendorResp = await page.request.post(API.vendors, {
          data: { name: `${testPrefix} E2E Regression Vendor` },
        });
        expect(vendorResp.ok()).toBeTruthy();
        const vendorBody = (await vendorResp.json()) as { vendor: { id: string } };
        vendorId = vendorBody.vendor.id;

        workItemId = await createWorkItemViaApi(page, {
          title: `${testPrefix} Vendor Picker Visible Test`,
        });

        await detailPage.goto(workItemId);

        // No error banner
        const errorText = await detailPage.getInlineErrorText();
        expect(errorText).toBeNull();

        // Vendor picker select is visible (because availableVendors.length > 0)
        await expect(detailPage.vendorPicker).toBeVisible({ timeout: 7000 });
      } finally {
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
        if (vendorId) await page.request.delete(`${API.vendors}/${vendorId}`);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Inline edit description
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Inline description edit (Scenario 6)', { tag: '@responsive' }, () => {
  test('Clicking description section opens inline editor; saving updates the description', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;
    const initialDescription = `${testPrefix} Original description text.`;
    const updatedDescription = `${testPrefix} Updated description via inline edit.`;

    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Description Edit Test`,
        description: initialDescription,
      });

      await detailPage.goto(createdId);

      // Start editing description
      await detailPage.startEditingDescription();

      // The description textarea should be visible and contain the current description
      const textarea = detailPage.descriptionSection.locator('[class*="descriptionTextarea"]');
      await expect(textarea).toBeVisible();
      await expect(textarea).toHaveValue(initialDescription);

      // Update the description
      await textarea.fill(updatedDescription);

      // Save
      await detailPage.saveDescription();

      // The updated description is now visible in the display view
      await expect(
        detailPage.descriptionSection.locator('[class*="description"]').filter({
          hasText: updatedDescription,
        }),
      ).toBeVisible({ timeout: 5000 });

      // Verify it persisted by reloading
      await detailPage.goto(createdId);
      await expect(
        detailPage.descriptionSection.locator('[class*="description"]').filter({
          hasText: updatedDescription,
        }),
      ).toBeVisible();
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  test('Cancelling description edit restores the original text', async ({ page, testPrefix }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;
    const originalDescription = `${testPrefix} Cancel edit original text.`;

    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Description Cancel Test`,
        description: originalDescription,
      });

      await detailPage.goto(createdId);

      await detailPage.startEditingDescription();

      const textarea = detailPage.descriptionSection.locator('[class*="descriptionTextarea"]');
      await textarea.fill('This change will be discarded');

      // Cancel
      await detailPage.descriptionSection
        .getByRole('button', { name: 'Cancel', exact: true })
        .click();

      // Original description should still be visible
      await expect(
        detailPage.descriptionSection
          .locator('[class*="description"]')
          .filter({ hasText: originalDescription }),
      ).toBeVisible({ timeout: 5000 });
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Delete work item — confirm + redirect to list
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Delete work item (Scenario 7)', { tag: '@responsive' }, () => {
  test('Confirming delete redirects to /work-items list', async ({ page, testPrefix }) => {
    const detailPage = new WorkItemDetailPage(page);

    // Create the item (no cleanup — deleted via UI)
    const createdId = await createWorkItemViaApi(page, {
      title: `${testPrefix} Delete Redirect Test`,
    });

    await detailPage.goto(createdId);

    // Footer delete button is visible
    await expect(detailPage.deleteButton).toBeVisible();
    await detailPage.openDeleteModal();

    // Modal shows the correct heading
    await expect(
      detailPage.deleteModal.getByRole('heading', { name: /Delete Work Item\?/i }),
    ).toBeVisible();

    // Confirm deletion — navigates to /work-items
    await detailPage.confirmDelete();

    await page.waitForURL('**/work-items', { timeout: 7000 });
    expect(page.url()).toContain('/work-items');
    expect(page.url()).not.toMatch(/\/work-items\/[a-z0-9]/);

    // Work item no longer exists
    const checkResp = await page.request.get(`${API.workItems}/${createdId}`);
    expect(checkResp.status()).toBe(404);

    // Note: item deleted via UI — no API cleanup needed
    void createdId;
  });

  test('Cancelling delete modal keeps user on the detail page', async ({ page, testPrefix }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Cancel Delete Detail Test`,
      });

      await detailPage.goto(createdId);

      await detailPage.openDeleteModal();
      await detailPage.cancelDelete();

      // Should still be on the detail page
      expect(page.url()).toContain(`/work-items/${createdId}`);

      // Modal is closed
      await expect(detailPage.deleteConfirmButton).not.toBeVisible({ timeout: 3000 });
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: 404/error state for non-existent work item ID
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Error state for non-existent ID (Scenario 8)', { tag: '@responsive' }, () => {
  test('Navigating to a non-existent work item ID shows an error state', async ({ page }) => {
    const detailPage = new WorkItemDetailPage(page);

    await page.goto('/work-items/nonexistent-work-item-id-12345');

    // Wait for the error state to appear
    const isError = await detailPage.isInErrorState();
    expect(isError).toBe(true);

    // Error state includes a "Back to Work Items" button
    const backButton = detailPage.errorState.getByRole('button', {
      name: /Back to Work Items/i,
    });
    await expect(backButton).toBeVisible({ timeout: 7000 });
  });

  test('Error state "Back to Work Items" button navigates to the list', async ({ page }) => {
    const detailPage = new WorkItemDetailPage(page);

    await page.goto('/work-items/nonexistent-id-abc');

    const isError = await detailPage.isInErrorState();
    expect(isError).toBe(true);

    const backButton = detailPage.errorState.getByRole('button', {
      name: /Back to Work Items/i,
    });
    await backButton.click();

    await page.waitForURL('**/work-items', { timeout: 5000 });
    expect(page.url()).toContain('/work-items');
    expect(page.url()).not.toMatch(/\/work-items\/[a-z0-9]/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Responsive — no horizontal scroll
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout (Scenario 9)', { tag: '@responsive' }, () => {
  test('Work Item detail page renders without horizontal scroll on current viewport', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Responsive Detail Test`,
      });

      await detailPage.goto(createdId);

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      expect(hasHorizontalScroll).toBe(false);
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  test('Budget section is accessible (scrolled into view) on current viewport', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Budget Accessibility Test`,
      });

      await detailPage.goto(createdId);

      // Scroll to budget section
      await detailPage.budgetSection.scrollIntoViewIfNeeded();
      await expect(detailPage.editBudgetButton).toBeVisible();
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Dark mode rendering
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dark mode rendering (Scenario 10)', { tag: '@responsive' }, () => {
  test('Work Item detail page renders correctly in dark mode', async ({ page, testPrefix }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Dark Mode Detail Test`,
      });

      await page.goto(`/work-items/${createdId}`);
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
      });

      await detailPage.heading.waitFor({ state: 'visible', timeout: 7000 });

      // Key elements visible in dark mode
      await expect(detailPage.heading).toBeVisible();
      await expect(detailPage.backButton).toBeVisible();
      await expect(detailPage.deleteButton).toBeVisible();

      // No horizontal scroll
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  test('Delete modal is usable in dark mode', async ({ page, testPrefix }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Dark Modal Test`,
      });

      await page.goto(`/work-items/${createdId}`);
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
      });

      await detailPage.heading.waitFor({ state: 'visible', timeout: 7000 });
      await detailPage.openDeleteModal();

      // Modal confirm and cancel buttons visible in dark mode
      await expect(detailPage.deleteConfirmButton).toBeVisible();
      await expect(detailPage.deleteCancelButton).toBeVisible();

      // Cancel without deleting
      await detailPage.cancelDelete();
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});
