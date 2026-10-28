/**
 * E2E tests for the Task page (/project/work-items/:id), rebuilt on the detail template in
 * #2248 (EPIC-21 P5.4). The header, strip, tabs, Timing, Cost and Site diary scenarios live in
 * `task-page.spec.ts`; this file keeps the basics every task page needs.
 *
 * Scenarios covered:
 * 1.  Page loads with the task title as heading, the strip, the tabs and the Overview cards
 * 2.  "Tasks" breadcrumb navigates to /project/work-items
 * 3.  Notes: Add ▾ › Note, Add note, Edit, Delete (with the confirm dialog)
 * 4.  Checklist: Add ▾ › Checklist item, add, toggle, rename, reorder, delete
 * 5.  Cost tab loads without error and offers Add cost line and the Grants list
 * 6.  Details card: edit the description and the title, cancel, validation, `e` shortcut
 * 7.  Delete the task from the ⋯ menu: confirm + redirect, cancel, Delete key
 * 8.  404/error state for a non-existent task id
 * 9.  Responsive: no horizontal scroll on any tab
 * 10. Dark mode rendering
 */

import { test, expect } from '../../fixtures/auth.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';
import type { TaskTab } from '../../pages/WorkItemDetailPage.js';
import { API } from '../../fixtures/testData.js';
import { createWorkItemViaApi, deleteWorkItemViaApi } from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Page loads with the task title as heading
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Page load (Scenario 1)', { tag: '@responsive' }, () => {
  test('The task page loads with the task title as the h1 heading', async ({
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

  test('The strip, the tabs and the Overview cards are visible on page load', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createWorkItemViaApi(page, { title: `${testPrefix} All Sections Test` });

      await detailPage.goto(createdId);

      await expect(detailPage.summary.root).toBeVisible();
      for (const tab of ['overview', 'timing', 'cost', 'diary', 'history'] as const) {
        await expect(detailPage.tabs.tab(tab)).toBeVisible();
      }
      // Overview is the default tab
      await expect(detailPage.tabs.tab('overview')).toHaveAttribute('aria-selected', 'true');
      await expect(detailPage.detailsCard.root).toBeVisible();
      await expect(detailPage.whoWhereCard.root).toBeVisible();
      // Nothing to show yet: no Checklist and no Notes card
      await expect(detailPage.checklistCard.root).toHaveCount(0);
      await expect(detailPage.notesCard.root).toHaveCount(0);
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  test('Status chip is visible and shows the task status', async ({ page, testPrefix }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Status Test`,
        status: 'in_progress',
      });

      await detailPage.goto(createdId);

      await expect(detailPage.statusMenu.trigger).toBeVisible();
      await expect(detailPage.statusMenu.trigger).toHaveText('In progress');
      await expect(page.locator('[class*="statusSelect"]')).toHaveCount(0);
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: "Tasks" breadcrumb navigates to /project/work-items
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Breadcrumb navigation (Scenario 2)', { tag: '@responsive' }, () => {
  test('"Tasks" breadcrumb navigates to the task list', async ({ page, testPrefix }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createWorkItemViaApi(page, { title: `${testPrefix} Back Nav Test` });

      await detailPage.goto(createdId);

      await detailPage.breadcrumbs.trailLink('Tasks').click();

      await page.waitForURL('**/project/work-items');
      expect(page.url()).toContain('/project/work-items');
      expect(page.url()).not.toMatch(/\/project\/work-items\/[a-z0-9]/);
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Notes
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Notes (Scenario 3)', { tag: '@responsive' }, () => {
  test('Add ▾ › Note adds a note: the Notes card appears and "Add note" holds focus', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;
    const noteText = `${testPrefix} This is a test note added by E2E.`;

    try {
      createdId = await createWorkItemViaApi(page, { title: `${testPrefix} Note Add Test` });

      await detailPage.goto(createdId);
      await expect(detailPage.notesCard.root).toHaveCount(0);

      await detailPage.chooseAdd('Note');
      await detailPage.saveNoteInDialog(noteText);

      // The card exists now and the note is in it
      await expect(detailPage.notesCard.root).toBeVisible();
      await expect(detailPage.notesCard.root).toContainText(noteText);
      // Focus lands on the card's "Add note" button, never on the body
      await expect(detailPage.notesAddButton).toBeFocused();
      // The Add ▾ menu now only offers the Checklist item
      await detailPage.addMenu.click();
      await expect(page.getByRole('menuitem', { name: 'Note', exact: true })).toHaveCount(0);
      await expect(
        page.getByRole('menuitem', { name: 'Checklist item', exact: true }),
      ).toBeVisible();
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  test('A note can be added from the card, edited and deleted after a confirmation', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;
    const first = `${testPrefix} First note text`;
    const edited = `${testPrefix} Edited note text`;

    try {
      createdId = await createWorkItemViaApi(page, { title: `${testPrefix} Note Manage Test` });
      const seeded = await page.request.post(`${API.workItems}/${createdId}/notes`, {
        data: { content: first },
      });
      expect(seeded.ok(), 'POST note').toBeTruthy();

      await detailPage.goto(createdId);
      await expect(detailPage.note(first)).toBeVisible();

      // Add a second note from the card
      await detailPage.notesAddButton.click();
      await detailPage.saveNoteInDialog(`${testPrefix} Second note text`);

      // Edit the first note
      await detailPage.chooseNoteAction(first, 'Edit');
      await detailPage.editNoteDialog.waitForOpen();
      await expect(detailPage.editNoteDialog.field('content')).toHaveValue(first);
      await detailPage.editNoteDialog.field('content').fill(edited);
      await detailPage.editNoteDialog.save();
      await detailPage.editNoteDialog.waitForClosed();
      await expect(detailPage.note(edited)).toBeVisible();
      await expect(detailPage.note(first)).toHaveCount(0);

      // Delete asks first; Cancel keeps it, Delete removes it
      await detailPage.chooseNoteAction(edited, 'Delete');
      await detailPage.noteDeleteDialog.waitForOpen();
      await detailPage.noteDeleteDialog.cancel();
      await expect(detailPage.note(edited)).toBeVisible();

      await detailPage.chooseNoteAction(edited, 'Delete');
      await detailPage.noteDeleteDialog.waitForOpen();
      await detailPage.noteDeleteDialog.confirm();
      await expect(detailPage.note(edited)).toHaveCount(0);
      await expect(detailPage.note(`${testPrefix} Second note text`)).toBeVisible();
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  test('The Add note dialog refuses an empty note', async ({ page, testPrefix }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createWorkItemViaApi(page, { title: `${testPrefix} Note Empty Test` });

      await detailPage.goto(createdId);
      await detailPage.chooseAdd('Note');
      await detailPage.noteDialog.waitForOpen();
      await detailPage.noteDialog.save();

      await expect(detailPage.noteDialog.fieldError('content')).toHaveText('Write the note first.');
      await detailPage.noteDialog.cancel();
      await detailPage.noteDialog.waitForClosed();
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Checklist
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Checklist (Scenario 4)', { tag: '@responsive' }, () => {
  test('Add ▾ › Checklist item shows the empty card with its add field focused; adding fills it', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;
    const title = `${testPrefix} Install foundation forms`;

    try {
      createdId = await createWorkItemViaApi(page, { title: `${testPrefix} Checklist Add Test` });

      await detailPage.goto(createdId);
      await detailPage.chooseAdd('Checklist item');

      await expect(detailPage.checklistCard.root).toBeVisible();
      await expect(detailPage.checklistAddInput).toBeFocused();

      await detailPage.addChecklistItem(title);
      await expect(detailPage.checklistItem(title)).toBeVisible();
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  test('A checklist item can be ticked, renamed, moved and deleted', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;
    const alpha = `${testPrefix} Alpha step`;
    const beta = `${testPrefix} Beta step`;
    const renamed = `${testPrefix} Alpha renamed`;

    try {
      createdId = await createWorkItemViaApi(page, { title: `${testPrefix} Checklist Manage` });
      for (const [position, itemTitle] of [alpha, beta].entries()) {
        const seeded = await page.request.post(`${API.workItems}/${createdId}/subtasks`, {
          data: { title: itemTitle, position },
        });
        expect(seeded.ok(), 'POST subtask').toBeTruthy();
      }

      await detailPage.goto(createdId);
      const items = page.locator('[data-testid^="task-checklist-item-"]');
      await expect(items).toHaveText([alpha, beta].map((text) => new RegExp(text)));

      // Tick
      const checkbox = detailPage.checklistItem(alpha).getByRole('checkbox');
      await expect(checkbox).not.toBeChecked();
      await checkbox.check();
      await expect(checkbox).toBeChecked();

      // Rename
      await detailPage.chooseChecklistAction(alpha, 'Rename');
      await detailPage.checklistRenameDialog.waitForOpen();
      await detailPage.checklistRenameDialog.field('title').fill(renamed);
      await detailPage.checklistRenameDialog.save();
      await detailPage.checklistRenameDialog.waitForClosed();
      await expect(detailPage.checklistItem(renamed)).toBeVisible();

      // Move down: the renamed item is second
      await detailPage.chooseChecklistAction(renamed, 'Move down');
      await expect(items).toHaveText([beta, renamed].map((text) => new RegExp(text)));

      // Delete asks first
      await detailPage.chooseChecklistAction(beta, 'Delete');
      await detailPage.subtaskDeleteDialog.waitForOpen();
      await detailPage.subtaskDeleteDialog.confirm();
      await expect(detailPage.checklistItem(beta)).toHaveCount(0);
      await expect(detailPage.checklistItem(renamed)).toBeVisible();
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  test('Deleting the last checklist item hides the card and brings the Add ▾ entry back', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;
    const only = `${testPrefix} Only step`;

    try {
      createdId = await createWorkItemViaApi(page, { title: `${testPrefix} Checklist Last` });
      const seeded = await page.request.post(`${API.workItems}/${createdId}/subtasks`, {
        data: { title: only, position: 0 },
      });
      expect(seeded.ok(), 'POST subtask').toBeTruthy();

      await detailPage.goto(createdId);
      await detailPage.chooseChecklistAction(only, 'Delete');
      await detailPage.subtaskDeleteDialog.waitForOpen();
      await detailPage.subtaskDeleteDialog.confirm();

      await expect(detailPage.checklistCard.root).toHaveCount(0);
      // Focus moves to the Add ▾ menu, never to the body
      await expect(detailPage.addMenu).toBeFocused();
      await detailPage.addMenu.click();
      await expect(
        page.getByRole('menuitem', { name: 'Checklist item', exact: true }),
      ).toBeVisible();
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Cost tab loads without error
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Cost tab loads without error (Scenario 5)', { tag: '@responsive' }, () => {
  test('The Cost tab shows the cost lines with Add cost line and the Grants list', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createWorkItemViaApi(page, { title: `${testPrefix} Cost Tab Test` });

      await detailPage.goto(createdId);
      await detailPage.openTab('cost');
      await detailPage.costLines.waitForLoaded();

      await expect(detailPage.addBudgetLineButton).toBeVisible();
      await expect(detailPage.grants.heading).toContainText('Grants');
      // The cost overview left the page: the strip carries the Expected cost
      await expect(detailPage.summary.label('cost')).toHaveText('Expected cost');
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Details card
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Details card (Scenario 6)', { tag: '@responsive' }, () => {
  test('Edit opens the card form; saving updates the description and it persists', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;
    const initialDescription = `${testPrefix} Original description text.`;
    const updatedDescription = `${testPrefix} Updated description via the card.`;

    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Description Edit Test`,
        description: initialDescription,
      });

      await detailPage.goto(createdId);
      await expect(detailPage.descriptionText).toHaveText(initialDescription);

      await detailPage.detailsCard.startEdit();
      await expect(detailPage.descriptionInput).toHaveValue(initialDescription);
      // Nothing changed yet: Save is off
      await expect(detailPage.detailsCard.saveButton).toHaveAttribute('aria-disabled', 'true');

      await detailPage.descriptionInput.fill(updatedDescription);
      await detailPage.detailsCard.save();
      await expect(detailPage.descriptionText).toHaveText(updatedDescription);

      // Persisted: a fresh load shows it
      await detailPage.goto(createdId);
      await expect(detailPage.descriptionText).toHaveText(updatedDescription);
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  test('A task without a description reads "No description yet"', async ({ page, testPrefix }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createWorkItemViaApi(page, { title: `${testPrefix} No Description` });

      await detailPage.goto(createdId);
      await expect(detailPage.descriptionText).toHaveText('No description yet');
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  test('Cancelling the edit restores the original text', async ({ page, testPrefix }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;
    const originalDescription = `${testPrefix} Cancel edit original text.`;

    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Description Cancel Test`,
        description: originalDescription,
      });

      await detailPage.goto(createdId);
      await detailPage.detailsCard.startEdit();
      await detailPage.descriptionInput.fill('This change will be discarded');

      await detailPage.detailsCard.cancel();
      // A changed form asks before it discards
      await detailPage.detailsCard.discardConfirm.waitForOpen();
      await detailPage.detailsCard.discardConfirm.confirm();

      await expect(detailPage.detailsCard.form).toBeHidden();
      await expect(detailPage.descriptionText).toHaveText(originalDescription);
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  test('Renaming the task updates the heading; an empty title is refused', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;
    const renamed = `${testPrefix} Renamed task`;

    try {
      createdId = await createWorkItemViaApi(page, { title: `${testPrefix} Rename Test` });

      await detailPage.goto(createdId);
      await detailPage.detailsCard.startEdit();
      await detailPage.titleInput.fill('');
      await detailPage.detailsCard.saveButton.click();
      await expect(page.getByText('Enter a title.')).toBeVisible();
      await expect(detailPage.detailsCard.form).toBeVisible();

      await detailPage.titleInput.fill(renamed);
      await detailPage.detailsCard.save();
      await expect(detailPage.heading).toHaveText(renamed);
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  test('The "e" shortcut opens the Details card for editing', async ({ page, testPrefix }) => {
    test.skip((page.viewportSize()?.width ?? 1280) < 1024, 'Keyboard shortcut: desktop only');
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createWorkItemViaApi(page, { title: `${testPrefix} Shortcut Edit` });

      await detailPage.goto(createdId);
      await page.keyboard.press('e');

      await expect(detailPage.detailsCard.form).toBeVisible();
      await expect(detailPage.titleInput).toBeFocused();
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Delete the task
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Delete task (Scenario 7)', { tag: '@responsive' }, () => {
  test('Confirming delete redirects to the task list', async ({ page, testPrefix }) => {
    const detailPage = new WorkItemDetailPage(page);

    // Created through the API; deleted through the UI (no cleanup)
    const createdId = await createWorkItemViaApi(page, {
      title: `${testPrefix} Delete Redirect Test`,
    });

    await detailPage.goto(createdId);

    // Delete lives in the ⋯ menu of the header
    await detailPage.openDeleteModal();

    // The dialog asks "Delete <title>?" (names the task)
    await expect(
      detailPage.deleteModal.getByRole('heading', {
        name: `Delete ${testPrefix} Delete Redirect Test?`,
      }),
    ).toBeVisible();

    await detailPage.confirmDelete();

    expect(page.url()).toContain('/project/work-items');
    expect(page.url()).not.toMatch(/\/project\/work-items\/[a-z0-9]/);

    // The task no longer exists
    const checkResp = await page.request.get(`${API.workItems}/${createdId}`);
    expect(checkResp.status()).toBe(404);
  });

  test('Cancelling the dialog keeps the user on the task page', async ({ page, testPrefix }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Cancel Delete Detail Test`,
      });

      await detailPage.goto(createdId);

      await detailPage.openDeleteModal();
      await detailPage.cancelDelete();

      expect(page.url()).toContain(`/project/work-items/${createdId}`);
      await expect(detailPage.deleteConfirmButton).not.toBeVisible();
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  test('The Delete key opens the same confirmation', async ({ page, testPrefix }) => {
    test.skip((page.viewportSize()?.width ?? 1280) < 1024, 'Keyboard shortcut: desktop only');
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createWorkItemViaApi(page, { title: `${testPrefix} Delete Key Test` });

      await detailPage.goto(createdId);
      await page.keyboard.press('Delete');

      await detailPage.deleteDialog.waitForOpen();
      await detailPage.cancelDelete();
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: 404/error state for a non-existent id
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Error state for non-existent ID (Scenario 8)', { tag: '@responsive' }, () => {
  test('Navigating to a non-existent task id shows the not-found state', async ({ page }) => {
    const detailPage = new WorkItemDetailPage(page);

    await page.goto('/project/work-items/nonexistent-work-item-id-12345');

    expect(await detailPage.isInErrorState()).toBe(true);

    // The h1 reads "Task not found" and the card offers "Back to Tasks"
    await expect(page.getByRole('heading', { level: 1, name: 'Task not found' })).toBeVisible();
    await expect(
      detailPage.errorState.getByRole('button', { name: 'Back to Tasks' }),
    ).toBeVisible();
    // A 404 offers no Retry
    await expect(detailPage.errorState.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  });

  test('"Back to Tasks" navigates to the list', async ({ page }) => {
    const detailPage = new WorkItemDetailPage(page);

    await page.goto('/project/work-items/nonexistent-id-abc');

    expect(await detailPage.isInErrorState()).toBe(true);

    await detailPage.errorState.getByRole('button', { name: 'Back to Tasks' }).click();

    await page.waitForURL('**/project/work-items');
    expect(page.url()).not.toMatch(/\/project\/work-items\/[a-z0-9]/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Responsive, no horizontal scroll
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout (Scenario 9)', { tag: '@responsive' }, () => {
  const TABS: readonly TaskTab[] = ['overview', 'timing', 'cost', 'diary', 'history'];

  for (const tab of TABS) {
    test(`The ${tab} tab renders without horizontal scroll on the current viewport`, async ({
      page,
      testPrefix,
    }) => {
      const detailPage = new WorkItemDetailPage(page);
      let createdId: string | null = null;

      try {
        createdId = await createWorkItemViaApi(page, {
          title: `${testPrefix} Responsive Detail ${tab}`,
        });

        await detailPage.goto(createdId, { tab });
        await expect(detailPage.tabs.panel(tab)).toBeVisible();

        const hasHorizontalScroll = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        );
        expect(hasHorizontalScroll).toBe(false);
      } finally {
        if (createdId) await deleteWorkItemViaApi(page, createdId);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Dark mode rendering
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dark mode rendering (Scenario 10)', { tag: '@responsive' }, () => {
  test('The task page renders correctly in dark mode', async ({ page, testPrefix }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Dark Mode Detail Test`,
      });

      await page.goto(`/project/work-items/${createdId}`);
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
      });

      await detailPage.heading.waitFor({ state: 'visible' });

      await expect(detailPage.heading).toBeVisible();
      await expect(detailPage.breadcrumbs.trailLink('Tasks')).toBeVisible();
      await expect(detailPage.summary.root).toBeVisible();
      await expect(detailPage.detailsCard.root).toBeVisible();

      const hasHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(hasHorizontalScroll).toBe(false);
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  test('The delete dialog is usable in dark mode', async ({ page, testPrefix }) => {
    const detailPage = new WorkItemDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createWorkItemViaApi(page, { title: `${testPrefix} Dark Modal Test` });

      await page.goto(`/project/work-items/${createdId}`);
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
      });

      await detailPage.heading.waitFor({ state: 'visible' });
      await detailPage.openDeleteModal();

      await expect(detailPage.deleteConfirmButton).toBeVisible();
      await expect(detailPage.deleteCancelButton).toBeVisible();

      await detailPage.cancelDelete();
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});
