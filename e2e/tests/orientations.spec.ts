/**
 * E2E tests for the Photo orientations section of Settings > Project setup (#2215, EPIC-21;
 * formerly the Orientations tab of Story #1674).
 *
 * Photo orientations are a `ReferenceList` section (name and description, no color): a New
 * button, a ⋯ menu per row (Edit, Move up, Move down, Delete) and reorder by drag or keyboard.
 * The New/Edit dialog is a Modal from 768px and a bottom Sheet below. Delete asks first and lists
 * the photos that lose their orientation.
 *
 * Scenarios:
 * 1. [smoke] The section loads with its heading, description and New button
 * 2. Empty state (mocked list)
 * 3. Create with a name only: row appears, "added" is announced, focus lands on the row's ⋯
 * 4. Create with name and description: both shown in the row
 * 5. Validation: empty and whitespace-only name, duplicate name
 * 6. Edit: rename persists; saving without a change closes without a request
 * 7. Delete: counts of photos that lose the orientation, focus on the neighbour, Cancel keeps it
 * 8. New rows are appended at the end
 * 9. Reorder (mocked list): drag, ⋯ Move up/down, keyboard pick-up and drop, Escape cancels,
 *    a failed reorder rolls back with an alert and re-fetches, reorder persists (real backend)
 * 10. Dialog stacking: Escape on a dirty dialog opens the discard confirm; a second Escape closes
 *     only the confirm
 * 11. Dark mode: row border and the drop line are visible
 *
 * The orientation list is GLOBAL: reorder behaviour is asserted against a mocked list so other
 * workers creating or deleting orientations cannot race it (a reorder answers 409
 * REORDER_SET_MISMATCH when the id set changed); the one real-backend check retries once.
 * Synthetic names only, unique per test via `testPrefix`.
 */

import { test, expect } from '../fixtures/auth.js';
import type { Locator, Page } from '@playwright/test';
import {
  createDiaryEntryViaApi,
  createOrientationViaApi,
  deleteDiaryEntryViaApi,
  deleteOrientationViaApi,
  uploadDiaryPhotoViaApi,
} from '../fixtures/apiHelpers.js';
import { mockReferenceList } from '../fixtures/referenceListMocks.js';
import { PROJECT_SETUP_URL, ProjectSetupPage } from '../pages/ProjectSetupPage.js';

/** Fail the test when focus is on the body (focus must always land somewhere meaningful). */
async function expectFocusNotOnBody(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.activeElement !== null && document.activeElement !== document.body,
      ),
    )
    .toBe(true);
}

/** Press the mouse on `handle`, drag over `target` (top or bottom edge) and release. */
async function dragHandleOver(
  page: Page,
  handle: Locator,
  target: Locator,
  edge: 'top' | 'bottom',
): Promise<void> {
  // The list is far below the fold: bring it into the viewport before using page coordinates
  await handle.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('drag source or target has no box');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  const y = edge === 'top' ? to.y + 4 : to.y + to.height - 4;
  await page.mouse.move(from.x + from.width / 2, y, { steps: 12 });
  await page.mouse.up();
}

/** Three synthetic rows for the mocked-list scenarios. */
function mockedRows(testPrefix: string) {
  return [
    { id: 'mock-orientation-a', name: `${testPrefix} Alpha`, description: 'first' },
    { id: 'mock-orientation-b', name: `${testPrefix} Bravo` },
    { id: 'mock-orientation-c', name: `${testPrefix} Charlie` },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: the section loads
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Photo orientations — section (Scenario 1)', { tag: '@responsive' }, () => {
  test(
    'The Photo orientations section shows its heading, description and New button',
    { tag: '@smoke' },
    async ({ page }) => {
      const setup = new ProjectSetupPage(page);
      await setup.goto('orientations');
      const list = setup.orientations;

      await expect(list.heading).toHaveText('Photo orientations');
      await expect(list.section).toContainText('Name the viewing directions you tag photos with.');
      await expect(list.newButton).toBeVisible();
      await expect(list.newButton).toHaveAccessibleName('New orientation');
      // Tabs and "#N" numbers are gone
      await expect(page.getByRole('tab')).toHaveCount(0);
      await expect(list.section.getByText(/#\d/)).toHaveCount(0);
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: empty state
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Photo orientations — empty state (Scenario 2)', { tag: '@responsive' }, () => {
  test('Shows "No orientations yet." when the list is empty', async ({ page }) => {
    // The real list is shared; mock the GET so it is empty
    await mockReferenceList(page, 'orientations', []);
    const setup = new ProjectSetupPage(page);
    await setup.goto();

    await expect(setup.orientations.section).toContainText('No orientations yet.');
    await expect(setup.orientations.items).toHaveCount(0);
  });

  test('A failed load shows an error and Retry loads the list', async ({ page, testPrefix }) => {
    let fail = true;
    await page.route(
      (url) => url.pathname === '/api/orientations',
      async (route) => {
        if (route.request().method() === 'GET' && fail) {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Internal error' } }),
          });
        } else {
          await route.continue();
        }
      },
    );
    const setup = new ProjectSetupPage(page);
    await page.goto(PROJECT_SETUP_URL);
    await setup.heading.waitFor({ state: 'visible' });
    const list = setup.orientations;

    await expect(list.section).toContainText("Couldn't load the orientations.");
    fail = false;
    const name = `${testPrefix} After Retry`;
    const id = await createOrientationViaApi(page, { name });
    try {
      await list.retryButton.click();
      await expect(list.row(name)).toBeVisible();
    } finally {
      await deleteOrientationViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 3 + 4: create
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Photo orientations — create (Scenarios 3 and 4)', { tag: '@responsive' }, () => {
  test('Create with a name only: the row appears, "added" is announced, focus is on its ⋯', async ({
    page,
    testPrefix,
  }) => {
    const name = `${testPrefix} South`;
    const setup = new ProjectSetupPage(page);
    const list = setup.orientations;
    await setup.goto();

    try {
      await list.openNewDialog();
      await expect(list.dialog.getByRole('heading', { name: 'New orientation' })).toBeVisible();
      await expect(list.nameInput).toBeFocused();
      await list.fillDialog({ name });
      await list.save();

      await expect(list.row(name)).toBeVisible();
      await expect(list.row(name).locator('[title]')).toHaveText(name);
      await expect(setup.statusRegion).toHaveText(`${name} added.`);
      await expect(list.menuTrigger(name)).toBeFocused();
    } finally {
      await deleteByName(page, name);
    }
  });

  test('Create with name and description: both are shown in the row', async ({
    page,
    testPrefix,
  }) => {
    const name = `${testPrefix} South Street`;
    const description = 'Faces the street';
    const setup = new ProjectSetupPage(page);
    const list = setup.orientations;
    await setup.goto();

    try {
      await list.create({ name, description });
      await expect(list.row(name)).toContainText(description);
      // An orientation has no color: no swatch in the row
      await expect(list.row(name).locator('[data-color]')).toHaveCount(0);
      await expect(list.row(name).locator('span[class*="swatch"]')).toHaveCount(0);
    } finally {
      await deleteByName(page, name);
    }
  });
});

/** Delete the orientation with this name through the API (cleanup). */
async function deleteByName(page: Page, name: string): Promise<void> {
  const response = await page.request.get('/api/orientations');
  const body = (await response.json()) as { orientations: { id: string; name: string }[] };
  for (const orientation of body.orientations.filter((o) => o.name === name)) {
    await deleteOrientationViaApi(page, orientation.id);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: validation
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Photo orientations — validation (Scenario 5)', { tag: '@responsive' }, () => {
  test('An empty or whitespace-only name shows "Enter a name." and keeps focus on the field', async ({
    page,
  }) => {
    const setup = new ProjectSetupPage(page);
    const list = setup.orientations;
    await setup.goto();

    await list.openNewDialog();
    await list.saveButton.click();
    await expect(list.dialog).toContainText('Enter a name.');
    await expect(list.nameInput).toBeFocused();
    await expect(list.nameInput).toHaveAttribute('aria-invalid', 'true');

    await list.nameInput.fill('   ');
    await list.saveButton.click();
    await expect(list.dialog).toContainText('Enter a name.');
    await expect(list.dialog).toBeVisible();
  });

  test('A duplicate name shows the duplicate message and keeps the dialog open', async ({
    page,
    testPrefix,
  }) => {
    const name = `${testPrefix} Duplicate`;
    const id = await createOrientationViaApi(page, { name });
    const setup = new ProjectSetupPage(page);
    const list = setup.orientations;

    try {
      await setup.goto();
      await list.openNewDialog();
      await list.fillDialog({ name });
      await list.saveButton.click();

      await expect(list.dialog).toContainText('An orientation with this name already exists.');
      await expect(list.dialog).toBeVisible();
      await expect(list.nameInput).toBeFocused();
    } finally {
      await deleteOrientationViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: edit
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Photo orientations — edit (Scenario 6)', { tag: '@responsive' }, () => {
  test('Rename an orientation: the row updates and the change persists after a reload', async ({
    page,
    testPrefix,
  }) => {
    const original = `${testPrefix} South`;
    const renamed = `${testPrefix} North`;
    const id = await createOrientationViaApi(page, { name: original });
    const setup = new ProjectSetupPage(page);
    const list = setup.orientations;

    try {
      await setup.goto();
      await list.clickMenuItem(original, 'Edit');
      await expect(list.dialog.getByRole('heading', { name: 'Edit orientation' })).toBeVisible();
      await expect(list.nameInput).toHaveValue(original);
      await list.fillDialog({ name: renamed });
      await list.save();

      await expect(list.row(renamed)).toBeVisible();
      await expect(list.row(original)).toHaveCount(0);
      await expect(setup.statusRegion).toHaveText(`${renamed} saved.`);
      await expect(list.menuTrigger(renamed)).toBeFocused();

      await page.goto(page.url());
      await setup.waitForLoaded();
      await expect(list.row(renamed)).toBeVisible();
    } finally {
      await deleteOrientationViaApi(page, id);
    }
  });

  test('Saving an edit without a change closes the dialog and sends nothing', async ({
    page,
    testPrefix,
  }) => {
    const name = `${testPrefix} Unchanged`;
    const id = await createOrientationViaApi(page, { name });
    const setup = new ProjectSetupPage(page);
    const list = setup.orientations;
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes(`/api/orientations/${id}`) && request.method() !== 'GET') {
        writes.push(request.method());
      }
    });

    try {
      await setup.goto();
      await list.clickMenuItem(name, 'Edit');
      await list.dialog.waitFor({ state: 'visible' });
      await list.save();

      await expect(list.row(name)).toBeVisible();
      expect(writes).toEqual([]);
    } finally {
      await deleteOrientationViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: delete
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Photo orientations — delete (Scenario 7)', { tag: '@responsive' }, () => {
  test('Delete lists the photos that lose the orientation, removes the row and moves focus to a neighbour', async ({
    page,
    testPrefix,
  }) => {
    const name = `${testPrefix} ToDelete`;
    const orientationId = await createOrientationViaApi(page, { name });
    const entryId = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: '2026-01-15',
      body: `${testPrefix} orientation photo`,
    });
    await uploadDiaryPhotoViaApi(page, entryId, { orientationId });
    const setup = new ProjectSetupPage(page);
    const list = setup.orientations;

    try {
      await setup.goto();
      const names = await list.orderOfNames();
      const index = names.indexOf(name);
      const neighbour = names[index + 1] ?? names[index - 1];
      expect(neighbour, 'a neighbouring row exists').toBeDefined();

      await list.openDelete(name);
      await expect(list.deleteDialog.dialog).toHaveAccessibleName(`Delete ${name}?`);
      await expect(
        list.deleteDialog.consequence(/Photos that lose their orientation/),
      ).toContainText('1');
      await expect(list.deleteDialog.dialog).toContainText("This can't be undone.");
      await expect(list.deleteDialog.cancelButton).toBeFocused();

      await list.deleteDialog.confirmAndWaitClosed();
      await expect(list.row(name)).toHaveCount(0);
      await expect(setup.statusRegion).toHaveText(`${name} deleted.`);
      await expect(list.menuTrigger(neighbour!)).toBeFocused();
    } finally {
      await deleteDiaryEntryViaApi(page, entryId);
      await deleteOrientationViaApi(page, orientationId);
    }
  });

  test('Cancel keeps the orientation and returns focus to the section', async ({
    page,
    testPrefix,
  }) => {
    const name = `${testPrefix} KeepMe`;
    const id = await createOrientationViaApi(page, { name });
    const setup = new ProjectSetupPage(page);
    const list = setup.orientations;

    try {
      await setup.goto();
      await list.openDelete(name);
      await list.deleteDialog.cancel();

      await expect(list.row(name)).toBeVisible();
      await expectFocusNotOnBody(page);
    } finally {
      await deleteOrientationViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: order of new rows
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Photo orientations — order (Scenario 8)', { tag: '@responsive' }, () => {
  test('Orientations are listed in creation order, new ones at the end', async ({
    page,
    testPrefix,
  }) => {
    const first = `${testPrefix} First`;
    const second = `${testPrefix} Second`;
    const firstId = await createOrientationViaApi(page, { name: first });
    const secondId = await createOrientationViaApi(page, { name: second });

    try {
      const setup = new ProjectSetupPage(page);
      await setup.goto();
      const names = await setup.orientations.orderOfNames();
      expect(names.indexOf(first)).toBeGreaterThanOrEqual(0);
      expect(names.indexOf(first)).toBeLessThan(names.indexOf(second));
    } finally {
      await deleteOrientationViaApi(page, firstId);
      await deleteOrientationViaApi(page, secondId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: reorder
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Photo orientations — reorder (Scenario 9)', { tag: '@responsive' }, () => {
  test('Drag a handle over another row: the order changes and one PATCH carries every id', async ({
    page,
    testPrefix,
  }) => {
    test.skip(test.info().project.name !== 'desktop', 'mouse drag runs on the desktop project');
    const rows = mockedRows(testPrefix);
    const mock = await mockReferenceList(page, 'orientations', rows);
    const setup = new ProjectSetupPage(page);
    const list = setup.orientations;
    await setup.goto();

    await dragHandleOver(page, list.handle(rows[2]!.name), list.row(rows[0]!.name), 'top');

    await expect.poll(() => mock.requests.length).toBe(1);
    expect(mock.requests[0]).toEqual([rows[2]!.id, rows[0]!.id, rows[1]!.id]);
    await expect
      .poll(() => list.orderOfNames())
      .toEqual([rows[2]!.name, rows[0]!.name, rows[1]!.name]);
    await expect(list.handle(rows[2]!.name)).toBeFocused();
  });

  test('⋯ Move down sends one PATCH with the full list; Move up on the first row is disabled', async ({
    page,
    testPrefix,
  }) => {
    const rows = mockedRows(testPrefix);
    const mock = await mockReferenceList(page, 'orientations', rows);
    const setup = new ProjectSetupPage(page);
    const list = setup.orientations;
    await setup.goto();

    await list.openMenu(rows[0]!.name);
    await expect(list.menuItem('Move up')).toHaveAttribute('aria-disabled', 'true');
    await list.menuItem('Move down').click();

    await expect.poll(() => mock.requests.length).toBe(1);
    expect(mock.requests[0]).toEqual([rows[1]!.id, rows[0]!.id, rows[2]!.id]);
    await expect
      .poll(() => list.orderOfNames())
      .toEqual([rows[1]!.name, rows[0]!.name, rows[2]!.name]);
    await expect(setup.statusRegion).toContainText('moved to position 2 of 3');
    // Focus stays on the moved row's ⋯
    await expect(list.menuTrigger(rows[0]!.name)).toBeFocused();

    // The moved row now has a row above it: Move up is available, Move down on the last is not
    await list.openMenu(rows[2]!.name);
    await expect(list.menuItem('Move down')).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
    await expect(list.menuTrigger(rows[2]!.name)).toBeFocused();
  });

  test('Keyboard: Space picks up, ArrowDown moves, Space drops — one PATCH, the handle keeps focus', async ({
    page,
    testPrefix,
  }) => {
    test.skip(test.info().project.name !== 'desktop', 'keyboard reorder runs on the desktop');
    const rows = mockedRows(testPrefix);
    const mock = await mockReferenceList(page, 'orientations', rows);
    const setup = new ProjectSetupPage(page);
    const list = setup.orientations;
    await setup.goto();

    await list.focusHandle(rows[0]!.name);
    await page.keyboard.press('Space');
    await expect(list.handle(rows[0]!.name)).toHaveAttribute('aria-pressed', 'true');
    await expect(setup.statusRegion).toContainText('picked up. Position 1 of 3.');
    await page.keyboard.press('ArrowDown');
    await expect(setup.statusRegion).toContainText('position 2 of 3');
    expect(mock.requests, 'nothing is sent while the row is held').toEqual([]);
    await page.keyboard.press('Space');

    await expect.poll(() => mock.requests.length).toBe(1);
    expect(mock.requests[0]).toEqual([rows[1]!.id, rows[0]!.id, rows[2]!.id]);
    await expect(setup.statusRegion).toContainText('moved to position 2 of 3');
    await expect(list.handle(rows[0]!.name)).toBeFocused();
    await expect(list.handle(rows[0]!.name)).toHaveAttribute('aria-pressed', 'false');
  });

  test('Escape after picking up cancels: no PATCH and the order is unchanged', async ({
    page,
    testPrefix,
  }) => {
    test.skip(test.info().project.name !== 'desktop', 'keyboard reorder runs on the desktop');
    const rows = mockedRows(testPrefix);
    const mock = await mockReferenceList(page, 'orientations', rows);
    const setup = new ProjectSetupPage(page);
    const list = setup.orientations;
    await setup.goto();

    await list.focusHandle(rows[0]!.name);
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');

    await expect(setup.statusRegion).toContainText('Reorder canceled');
    await expect(setup.statusRegion).toContainText('back at position 1.');
    await expect(list.handle(rows[0]!.name)).toBeFocused();
    expect(mock.requests).toEqual([]);
    expect(await list.orderOfNames()).toEqual(rows.map((row) => row.name));
  });
});

test.describe('Photo orientations — reorder failure (Scenario 9)', { tag: '@responsive' }, () => {
  test('A rejected reorder rolls the order back, shows an alert and loads the list again', async ({
    page,
    testPrefix,
  }) => {
    const rows = mockedRows(testPrefix);
    const mock = await mockReferenceList(page, 'orientations', rows, {
      reorderFailure: { status: 409, code: 'REORDER_SET_MISMATCH' },
    });
    const setup = new ProjectSetupPage(page);
    const list = setup.orientations;
    await setup.goto();
    expect(mock.getCount()).toBe(1);

    await list.clickMenuItem(rows[0]!.name, 'Move down');

    await expect(list.reorderError).toBeVisible();
    await expect(list.reorderError).toHaveText("Couldn't save the new order. Try again.");
    await expect.poll(() => mock.getCount()).toBe(2);
    await expect.poll(() => list.orderOfNames()).toEqual(rows.map((row) => row.name));
    await expectFocusNotOnBody(page);
  });
});

test.describe('Photo orientations — reorder persistence (real backend)', () => {
  test('Move up keeps the order after a reload', async ({ page, testPrefix }) => {
    test.skip(test.info().project.name !== 'desktop', 'real reorder runs once, on the desktop');
    const first = `${testPrefix} Persist One`;
    const second = `${testPrefix} Persist Two`;
    const firstId = await createOrientationViaApi(page, { name: first });
    const secondId = await createOrientationViaApi(page, { name: second });
    const setup = new ProjectSetupPage(page);
    const list = setup.orientations;

    try {
      // Other workers share this list: a reorder racing a create or delete answers 409, which is
      // legitimate. Reload and try once more.
      await expect(async () => {
        await setup.goto();
        const before = await list.orderOfNames((name) => name === first || name === second);
        expect(before).toEqual([first, second]);
        const reorder = page.waitForResponse(
          (resp) =>
            resp.url().includes('/api/orientations/reorder') && resp.request().method() === 'PATCH',
        );
        await list.clickMenuItem(second, 'Move up');
        expect((await reorder).status()).toBe(200);
      }).toPass({ intervals: [500], timeout: 20_000 });

      await page.goto(page.url());
      await setup.waitForLoaded();
      expect(await list.orderOfNames((name) => name === first || name === second)).toEqual([
        second,
        first,
      ]);
    } finally {
      await deleteOrientationViaApi(page, firstId);
      await deleteOrientationViaApi(page, secondId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: dialog stacking
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Photo orientations — dialog stacking (Scenario 10)', { tag: '@responsive' }, () => {
  test('Escape on a dirty dialog opens the discard confirm; a second Escape closes only the confirm', async ({
    page,
    testPrefix,
  }) => {
    const name = `${testPrefix} Stacked`;
    const id = await createOrientationViaApi(page, { name });
    const setup = new ProjectSetupPage(page);
    const list = setup.orientations;

    try {
      await setup.goto();
      await list.clickMenuItem(name, 'Edit');
      await list.dialog.waitFor({ state: 'visible' });
      await list.nameInput.fill(`${name} edited`);

      await page.keyboard.press('Escape');
      await expect(page.getByRole('alertdialog')).toBeVisible();
      await expect(list.discardDialog.dialog).toHaveAccessibleName('Discard changes?');
      await expect(list.dialog).toBeVisible();

      // The second Escape closes only the confirm; the edit dialog is still there
      await page.keyboard.press('Escape');
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      await expect(list.dialog).toBeVisible();
      await expect(list.nameInput).toHaveValue(`${name} edited`);

      // Escape again, then Discard closes both and leaves the row unchanged
      await page.keyboard.press('Escape');
      await list.discardDialog.confirm();
      await expect(list.dialog).toHaveCount(0);
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      await expect(list.row(name)).toBeVisible();
      await expectFocusNotOnBody(page);
    } finally {
      await deleteOrientationViaApi(page, id);
    }
  });

  test('Cancel on a pristine dialog closes it without asking', async ({ page }) => {
    const setup = new ProjectSetupPage(page);
    const list = setup.orientations;
    await setup.goto();

    await list.openNewDialog();
    await list.cancelButton.click();
    await expect(list.dialog).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(list.newButton).toBeFocused();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 11: dark mode
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Photo orientations — dark mode (Scenario 11)', () => {
  test('The row border and the drop line are visible against the card in dark mode', async ({
    browser,
    testPrefix,
  }) => {
    test.skip(test.info().project.name !== 'desktop', 'drag runs on the desktop project');
    const context = await browser.newContext({
      colorScheme: 'dark',
      storageState: 'test-results/.auth/admin.json',
    });
    const page = await context.newPage();

    try {
      const rows = mockedRows(testPrefix);
      await mockReferenceList(page, 'orientations', rows);
      const setup = new ProjectSetupPage(page);
      const list = setup.orientations;
      await setup.goto();

      const style = await list.row(rows[1]!.name).evaluate((row) => {
        const section = row.closest('section') as HTMLElement;
        return {
          card: getComputedStyle(section).backgroundColor,
          border: getComputedStyle(row).borderTopColor,
        };
      });
      expect(style.border, 'row border differs from the card').not.toBe(style.card);

      // Hold a drag over the first row: its drop line is an inset shadow in the primary color
      await list.handle(rows[2]!.name).scrollIntoViewIfNeeded();
      await list.row(rows[0]!.name).scrollIntoViewIfNeeded();
      const from = await list.handle(rows[2]!.name).boundingBox();
      const to = await list.row(rows[0]!.name).boundingBox();
      if (!from || !to) throw new Error('no boxes');
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + from.width / 2, to.y + 4, { steps: 12 });
      const target = list.row(rows[0]!.name);
      await expect(target).toHaveAttribute('data-drop', 'before');
      const drop = await target.evaluate((row) => ({
        shadow: getComputedStyle(row).boxShadow,
        card: getComputedStyle(row.closest('section') as HTMLElement).backgroundColor,
      }));
      expect(drop.shadow, 'the drop line is drawn').not.toBe('none');
      expect(drop.shadow, 'the drop line differs from the card').not.toContain(drop.card);
      await page.mouse.up();
    } finally {
      await context.close();
    }
  });
});
