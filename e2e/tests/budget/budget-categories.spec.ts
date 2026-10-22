/**
 * E2E tests for the Cost categories and Purchase categories sections of Settings > Project setup
 * (#2215, EPIC-21; formerly the Budget Categories and Household Item Categories tabs, Story #142)
 *
 * Both lists are `ReferenceList` sections: a New button, a ⋯ menu per row (Edit, Move up,
 * Move down, Delete), reorder by drag or keyboard, "No color" instead of an empty swatch. The
 * New/Edit dialog is a Modal from 768px (448px wide) and a bottom Sheet below. Deleting a
 * category that is still used turns the confirm into a blocked dialog with a fixed sentence and
 * no counts (the server hides the counts: #315 hardening).
 *
 * Each scenario runs for both lists (`LISTS` below) unless it needs the cost-only description.
 *
 * Scenarios:
 * 1. [smoke] Built-in categories are listed (translated names) with no "#N" order numbers
 * 2. Create: dialog type per viewport, "No color" is the default, a color shows as a swatch,
 *    the row is announced, validation and duplicate-name errors keep the dialog open
 * 3. Edit: rename persists after a reload, saving unchanged sends nothing, a built-in category
 *    shows the translated-name hint
 * 4. Delete: confirm, focus on the neighbour's ⋯; Cancel keeps the row
 * 5. Delete blocked: a category used by a cost line / purchase cannot be deleted
 * 6. Empty and error states (mocked)
 * 7. Reorder through ⋯ Move up/down hits the right endpoint with the full id list (mocked)
 * 8. Dark mode: the dialog is usable
 *
 * The category lists are shared by every worker: all created categories carry a unique
 * `testPrefix` and are removed in `finally`. Reorder is mocked (see fixtures/referenceListMocks).
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import {
  createHouseholdItemViaApi,
  createWorkItemViaApi,
  deleteHouseholdItemViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { mockReferenceList } from '../../fixtures/referenceListMocks.js';
import { API } from '../../fixtures/testData.js';
import { PROJECT_SETUP_URL, ProjectSetupPage } from '../../pages/ProjectSetupPage.js';
import type { ReferenceListControl } from '../../pages/ProjectSetupPage.js';

interface ListCase {
  readonly key: 'costCategories' | 'purchaseCategories';
  readonly api: string;
  readonly title: string;
  readonly newLabel: string;
  readonly editLabel: string;
  readonly empty: string;
  readonly loadFailed: string;
  readonly duplicate: string;
  readonly builtIns: readonly string[];
  readonly blocked: (name: string) => string;
  readonly hasDescription: boolean;
}

const LISTS: readonly ListCase[] = [
  {
    key: 'costCategories',
    api: API.budgetCategories,
    title: 'Cost categories',
    newLabel: 'New cost category',
    editLabel: 'Edit cost category',
    empty: 'No cost categories yet.',
    loadFailed: "Couldn't load the cost categories.",
    duplicate: 'A cost category with this name already exists.',
    // Default categories after EPIC-05 seeding + EPIC-18 migration 0028
    builtIns: ['Materials', 'Labor', 'Permits', 'Design', 'Waste', 'Other'],
    blocked: (name) => `${name} is still used by cost lines or grants, so it can't be deleted.`,
    hasDescription: true,
  },
  {
    key: 'purchaseCategories',
    api: '/api/household-item-categories',
    title: 'Purchase categories',
    newLabel: 'New purchase category',
    editLabel: 'Edit purchase category',
    empty: 'No purchase categories yet.',
    loadFailed: "Couldn't load the purchase categories.",
    duplicate: 'A purchase category with this name already exists.',
    builtIns: ['Furniture', 'Appliances', 'Fixtures', 'Decor'],
    blocked: (name) => `${name} is still used by purchases, so it can't be deleted.`,
    hasDescription: false,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────────────────────────────────────

async function createCategoryViaApi(
  page: Page,
  list: ListCase,
  name: string,
  color?: string,
): Promise<string> {
  const response = await page.request.post(list.api, {
    data: { name, ...(color ? { color } : {}) },
  });
  expect(response.ok(), `POST ${list.api} "${name}"`).toBeTruthy();
  // Budget categories answer `{ budgetCategory }`, household item categories the bare entity
  const body = (await response.json()) as { id?: string; budgetCategory?: { id: string } };
  return (body.budgetCategory ?? (body as { id: string })).id;
}

async function deleteCategoryViaApi(page: Page, list: ListCase, id: string): Promise<void> {
  await page.request.delete(`${list.api}/${id}`);
}

/** Delete every category with this name through the API (cleanup after a UI create). */
async function deleteCategoriesByName(page: Page, list: ListCase, name: string): Promise<void> {
  const response = await page.request.get(list.api);
  const body = (await response.json()) as { categories: { id: string; name: string }[] };
  for (const category of body.categories.filter((c) => c.name === name)) {
    await deleteCategoryViaApi(page, list, category.id);
  }
}

function controlFor(setup: ProjectSetupPage, list: ListCase): ReferenceListControl {
  return setup[list.key];
}

for (const list of LISTS) {
  // ───────────────────────────────────────────────────────────────────────────
  // Scenario 1: the built-in categories
  // ───────────────────────────────────────────────────────────────────────────
  test.describe(`${list.title} — built-in categories (Scenario 1)`, { tag: '@responsive' }, () => {
    test(
      `The built-in ${list.title.toLowerCase()} are listed without order numbers`,
      { tag: '@smoke' },
      async ({ page }) => {
        const setup = new ProjectSetupPage(page);
        await setup.goto(list.key === 'costCategories' ? 'cost-categories' : 'purchase-categories');
        const control = controlFor(setup, list);

        await expect(control.heading).toContainText(list.title);
        // Other workers may add categories, so assert presence rather than the exact count
        await expect(control.items.first()).toBeVisible();
        const names = await control.orderOfNames();
        for (const builtIn of list.builtIns) expect(names).toContain(builtIn);
        // "#N" sort-order numbers are no longer shown anywhere in the section
        await expect(control.section.getByText(/#\d/)).toHaveCount(0);
        await expect(control.newButton).toHaveAccessibleName(list.newLabel);
      },
    );

    test('A built-in category shows the translated-name hint in its Edit dialog', async ({
      page,
    }) => {
      const setup = new ProjectSetupPage(page);
      await setup.goto();
      const control = controlFor(setup, list);
      const builtIn = list.builtIns[0]!;

      await control.clickMenuItem(builtIn, 'Edit');
      await control.dialog.waitFor({ state: 'visible' });
      await expect(control.dialog).toContainText(
        'This name is translated. If you change it, your text is shown in every language.',
      );
      // Nothing was changed: Cancel closes without asking
      await control.cancelButton.click();
      await expect(control.dialog).toHaveCount(0);
      await expect(control.row(builtIn)).toBeVisible();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Scenario 2: create
  // ───────────────────────────────────────────────────────────────────────────
  test.describe(`${list.title} — create (Scenario 2)`, { tag: '@responsive' }, () => {
    test('New opens the dialog as a Modal (448px) from 768px and a bottom Sheet below', async ({
      page,
    }) => {
      const setup = new ProjectSetupPage(page);
      const control = controlFor(setup, list);
      const widths = test.info().project.name === 'mobile' ? [375] : [768, 1280];

      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await setup.goto();
        await control.openNewDialog();
        await expect(control.dialog.getByRole('heading', { name: list.newLabel })).toBeVisible();
        await expect(control.nameInput).toBeFocused();

        const box = await control.dialogPanel().boundingBox();
        if (!box) throw new Error('dialog panel has no box');
        if (width >= 768) {
          expect(
            Math.abs(box.width - 448),
            `Modal width at ${width}px: ${box.width}`,
          ).toBeLessThanOrEqual(1);
        } else {
          // A bottom Sheet is full width and sits on the bottom edge
          expect(Math.abs(box.width - width), `Sheet width: ${box.width}`).toBeLessThanOrEqual(1);
          expect(Math.abs(box.y + box.height - 900), 'Sheet bottom edge').toBeLessThanOrEqual(1);
        }
        await control.cancelButton.click();
        await expect(control.dialog).toHaveCount(0);
      }
    });

    test('A new category has "No color" ticked and shows no swatch; a colored one shows its color', async ({
      page,
      testPrefix,
    }) => {
      const plain = `${testPrefix} Tiles`;
      const colored = `${testPrefix} Paint`;
      const setup = new ProjectSetupPage(page);
      const control = controlFor(setup, list);
      await setup.goto();

      try {
        await control.openNewDialog();
        await expect(control.noColor).toBeChecked();
        await expect(control.colorInput).toBeDisabled();
        await control.fillDialog({ name: plain });
        await control.save();

        await expect(control.row(plain)).toBeVisible();
        await expect(setup.statusRegion).toHaveText(`${plain} added.`);
        await expect(control.menuTrigger(plain)).toBeFocused();
        await expect(control.swatch(plain)).toHaveCount(0);

        await control.create({ name: colored, color: '#336699' });
        await expect(control.swatch(colored)).toHaveCount(1);
        await expect(control.swatch(colored)).toHaveCSS('background-color', 'rgb(51, 102, 153)');

        // Neither row shows an order number, and new rows go to the end in creation order
        await expect(control.row(plain)).not.toContainText(/#\d/);
        await expect(control.row(colored)).not.toContainText(/#\d/);
        const names = await control.orderOfNames();
        expect(names.indexOf(plain)).toBeLessThan(names.indexOf(colored));
      } finally {
        await deleteCategoriesByName(page, list, plain);
        await deleteCategoriesByName(page, list, colored);
      }
    });

    if (list.hasDescription) {
      test('A description is saved and shown under the name', async ({ page, testPrefix }) => {
        const name = `${testPrefix} Described`;
        const setup = new ProjectSetupPage(page);
        const control = controlFor(setup, list);
        await setup.goto();

        try {
          await control.create({ name, description: 'Sample description text' });
          await expect(control.row(name)).toContainText('Sample description text');
        } finally {
          await deleteCategoriesByName(page, list, name);
        }
      });
    }

    test('An empty name shows "Enter a name." and keeps focus on the field', async ({ page }) => {
      const setup = new ProjectSetupPage(page);
      const control = controlFor(setup, list);
      await setup.goto();

      await control.openNewDialog();
      await control.saveButton.click();
      await expect(control.dialog).toContainText('Enter a name.');
      await expect(control.nameInput).toBeFocused();
      await expect(control.nameInput).toHaveAttribute('aria-invalid', 'true');
    });

    test('A duplicate name shows the duplicate message and keeps the dialog open', async ({
      page,
      testPrefix,
    }) => {
      const name = `${testPrefix} Duplicate`;
      const id = await createCategoryViaApi(page, list, name);
      const setup = new ProjectSetupPage(page);
      const control = controlFor(setup, list);

      try {
        await setup.goto();
        await control.openNewDialog();
        await control.fillDialog({ name });
        await control.saveButton.click();

        await expect(control.dialog).toContainText(list.duplicate);
        await expect(control.dialog).toBeVisible();
        await expect(control.nameInput).toBeFocused();
      } finally {
        await deleteCategoryViaApi(page, list, id);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Scenario 3: edit
  // ───────────────────────────────────────────────────────────────────────────
  test.describe(`${list.title} — edit (Scenario 3)`, { tag: '@responsive' }, () => {
    test('Rename and recolor a category: the change persists after a reload', async ({
      page,
      testPrefix,
    }) => {
      const original = `${testPrefix} Old Name`;
      const renamed = `${testPrefix} New Name`;
      const id = await createCategoryViaApi(page, list, original);
      const setup = new ProjectSetupPage(page);
      const control = controlFor(setup, list);

      try {
        await setup.goto();
        await control.clickMenuItem(original, 'Edit');
        await expect(control.dialog.getByRole('heading', { name: list.editLabel })).toBeVisible();
        await expect(control.nameInput).toHaveValue(original);
        await expect(control.noColor).toBeChecked();
        await control.fillDialog({ name: renamed, color: '#aa5500' });
        await control.save();

        await expect(control.row(renamed)).toBeVisible();
        await expect(control.row(original)).toHaveCount(0);
        await expect(setup.statusRegion).toHaveText(`${renamed} saved.`);
        await expect(control.menuTrigger(renamed)).toBeFocused();

        await page.goto(page.url());
        await setup.waitForLoaded();
        await expect(control.row(renamed)).toBeVisible();
        await expect(control.swatch(renamed)).toHaveCSS('background-color', 'rgb(170, 85, 0)');
      } finally {
        await deleteCategoryViaApi(page, list, id);
      }
    });

    test('Switching a color back to "No color" removes the swatch', async ({
      page,
      testPrefix,
    }) => {
      const name = `${testPrefix} Colored`;
      const id = await createCategoryViaApi(page, list, name, '#336699');
      const setup = new ProjectSetupPage(page);
      const control = controlFor(setup, list);

      try {
        await setup.goto();
        await expect(control.swatch(name)).toHaveCount(1);
        await control.clickMenuItem(name, 'Edit');
        await control.dialog.waitFor({ state: 'visible' });
        await expect(control.noColor).not.toBeChecked();
        await control.fillDialog({ color: null });
        await control.save();

        await expect(control.swatch(name)).toHaveCount(0);
      } finally {
        await deleteCategoryViaApi(page, list, id);
      }
    });

    test('Saving without a change closes the dialog and sends nothing', async ({
      page,
      testPrefix,
    }) => {
      const name = `${testPrefix} Unchanged`;
      const id = await createCategoryViaApi(page, list, name);
      const setup = new ProjectSetupPage(page);
      const control = controlFor(setup, list);
      const writes: string[] = [];
      page.on('request', (request) => {
        if (request.url().includes(`${list.api}/${id}`) && request.method() !== 'GET') {
          writes.push(request.method());
        }
      });

      try {
        await setup.goto();
        await control.clickMenuItem(name, 'Edit');
        await control.dialog.waitFor({ state: 'visible' });
        await control.save();
        await expect(control.row(name)).toBeVisible();
        expect(writes).toEqual([]);
      } finally {
        await deleteCategoryViaApi(page, list, id);
      }
    });

    test('Escape on a dirty dialog opens the discard confirm; a second Escape closes only the confirm', async ({
      page,
      testPrefix,
    }) => {
      const name = `${testPrefix} Stacked`;
      const id = await createCategoryViaApi(page, list, name);
      const setup = new ProjectSetupPage(page);
      const control = controlFor(setup, list);

      try {
        await setup.goto();
        await control.clickMenuItem(name, 'Edit');
        await control.dialog.waitFor({ state: 'visible' });
        await control.nameInput.fill(`${name} edited`);

        await page.keyboard.press('Escape');
        await expect(control.discardDialog.dialog).toBeVisible();
        await expect(control.dialog).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(page.getByRole('alertdialog')).toHaveCount(0);
        await expect(control.dialog).toBeVisible();

        await page.keyboard.press('Escape');
        await control.discardDialog.confirm();
        await expect(control.dialog).toHaveCount(0);
        await expect(control.row(name)).toBeVisible();
        await expect
          .poll(() =>
            page.evaluate(
              () => document.activeElement !== null && document.activeElement !== document.body,
            ),
          )
          .toBe(true);
      } finally {
        await deleteCategoryViaApi(page, list, id);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Scenario 4: delete
  // ───────────────────────────────────────────────────────────────────────────
  test.describe(`${list.title} — delete (Scenario 4)`, { tag: '@responsive' }, () => {
    test('Confirming deletes an unused category and moves focus to a neighbour', async ({
      page,
      testPrefix,
    }) => {
      const name = `${testPrefix} Disposable`;
      const id = await createCategoryViaApi(page, list, name);
      const setup = new ProjectSetupPage(page);
      const control = controlFor(setup, list);

      try {
        await setup.goto();
        const names = await control.orderOfNames();
        const index = names.indexOf(name);
        const neighbour = names[index + 1] ?? names[index - 1];

        await control.openDelete(name);
        await expect(control.deleteDialog.dialog).toHaveAccessibleName(`Delete ${name}?`);
        await expect(control.deleteDialog.dialog).toContainText("This can't be undone.");
        await expect(control.deleteDialog.cancelButton).toBeFocused();
        await control.deleteDialog.confirmAndWaitClosed();

        await expect(control.row(name)).toHaveCount(0);
        await expect(setup.statusRegion).toHaveText(`${name} deleted.`);
        await expect(control.menuTrigger(neighbour!)).toBeFocused();
      } finally {
        await deleteCategoryViaApi(page, list, id);
      }
    });

    test('Cancel keeps the category', async ({ page, testPrefix }) => {
      const name = `${testPrefix} KeepMe`;
      const id = await createCategoryViaApi(page, list, name);
      const setup = new ProjectSetupPage(page);
      const control = controlFor(setup, list);

      try {
        await setup.goto();
        await control.openDelete(name);
        await control.deleteDialog.cancel();
        await expect(control.row(name)).toBeVisible();
      } finally {
        await deleteCategoryViaApi(page, list, id);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Scenario 5: delete blocked while in use
  // ───────────────────────────────────────────────────────────────────────────
  test.describe(`${list.title} — delete blocked (Scenario 5)`, { tag: '@responsive' }, () => {
    test('A category that is still used cannot be deleted: fixed sentence, no counts, no Delete button', async ({
      page,
      testPrefix,
    }) => {
      const name = `${testPrefix} In Use`;
      const categoryId = await createCategoryViaApi(page, list, name);
      let cleanup: () => Promise<void>;

      if (list.key === 'costCategories') {
        const workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} Sample task` });
        const line = await page.request.post(`${API.workItems}/${workItemId}/budgets`, {
          data: {
            description: `${testPrefix} Sample cost line`,
            plannedAmount: 100,
            confidence: 'own_estimate',
            budgetSourceId: 'discretionary-system',
            budgetCategoryId: categoryId,
          },
        });
        expect(line.ok(), `POST cost line: ${line.status()}`).toBeTruthy();
        cleanup = () => deleteWorkItemViaApi(page, workItemId);
      } else {
        const purchaseId = await createHouseholdItemViaApi(page, {
          name: `${testPrefix} Sample purchase`,
          category: categoryId,
        });
        cleanup = () => deleteHouseholdItemViaApi(page, purchaseId);
      }

      const setup = new ProjectSetupPage(page);
      const control = controlFor(setup, list);
      try {
        await setup.goto();
        await control.openDelete(name);
        const deleteRequest = page.waitForResponse(
          (resp) =>
            resp.url().includes(`${list.api}/${categoryId}`) &&
            resp.request().method() === 'DELETE',
        );
        await control.deleteDialog.confirm();
        expect((await deleteRequest).status()).toBe(409);

        const dialog = control.deleteDialog.dialog;
        await expect(dialog).toContainText(list.blocked(name));
        await expect(control.deleteDialog.confirmButton).toHaveCount(0);
        await expect(control.deleteDialog.consequencesList).toHaveCount(0);
        await expect(control.deleteDialog.cancelButton).toBeVisible();

        await control.deleteDialog.cancel();
        await expect(control.row(name)).toBeVisible();
      } finally {
        await cleanup();
        await deleteCategoryViaApi(page, list, categoryId);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Scenario 6: empty and error states (mocked)
  // ───────────────────────────────────────────────────────────────────────────
  test.describe(
    `${list.title} — empty and error states (Scenario 6)`,
    { tag: '@responsive' },
    () => {
      test('An empty list shows the empty state', async ({ page }) => {
        await mockReferenceList(page, list.key, []);
        const setup = new ProjectSetupPage(page);
        await setup.goto();
        await expect(controlFor(setup, list).section).toContainText(list.empty);
        await expect(controlFor(setup, list).items).toHaveCount(0);
      });

      test('A failed load shows an error with Retry, and Retry loads the list', async ({
        page,
        testPrefix,
      }) => {
        let fail = true;
        await page.route(
          (url) => url.pathname === list.api,
          async (route) => {
            if (route.request().method() === 'GET' && fail) {
              await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({
                  error: { code: 'INTERNAL_ERROR', message: 'Internal error' },
                }),
              });
            } else {
              await route.continue();
            }
          },
        );
        const name = `${testPrefix} After Retry`;
        const id = await createCategoryViaApi(page, list, name);
        const setup = new ProjectSetupPage(page);
        const control = controlFor(setup, list);

        try {
          await page.goto(PROJECT_SETUP_URL);
          await setup.heading.waitFor({ state: 'visible' });
          await expect(control.section).toContainText(list.loadFailed);
          // New is inert until the list is loaded
          await expect(control.newButton).toHaveAttribute('aria-disabled', 'true');

          fail = false;
          await control.retryButton.click();
          await expect(control.row(name)).toBeVisible();
        } finally {
          await deleteCategoryViaApi(page, list, id);
        }
      });
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Scenario 7: reorder through the ⋯ menu (mocked, the list is global)
  // ───────────────────────────────────────────────────────────────────────────
  test.describe(`${list.title} — reorder (Scenario 7)`, { tag: '@responsive' }, () => {
    test('⋯ Move down sends one PATCH with every id in the new order', async ({
      page,
      testPrefix,
    }) => {
      const rows = [
        { id: 'mock-category-a', name: `${testPrefix} Alpha`, color: '#336699' },
        { id: 'mock-category-b', name: `${testPrefix} Bravo` },
        { id: 'mock-category-c', name: `${testPrefix} Charlie` },
      ];
      const mock = await mockReferenceList(page, list.key, rows);
      const setup = new ProjectSetupPage(page);
      const control = controlFor(setup, list);
      await setup.goto();

      await control.openMenu(rows[0]!.name);
      await expect(control.menuItem('Move up')).toHaveAttribute('aria-disabled', 'true');
      await control.menuItem('Move down').click();

      await expect.poll(() => mock.requests.length).toBe(1);
      expect(mock.requests[0]).toEqual([rows[1]!.id, rows[0]!.id, rows[2]!.id]);
      await expect
        .poll(() => control.orderOfNames())
        .toEqual([rows[1]!.name, rows[0]!.name, rows[2]!.name]);
      await expect(control.menuTrigger(rows[0]!.name)).toBeFocused();
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: dark mode
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Cost categories — dark mode (Scenario 8)', () => {
  test('The New dialog is usable in dark mode', async ({ browser, testPrefix }) => {
    const context = await browser.newContext({
      colorScheme: 'dark',
      storageState: 'test-results/.auth/admin.json',
    });
    const page = await context.newPage();
    const name = `${testPrefix} Dark Category`;

    try {
      const setup = new ProjectSetupPage(page);
      await setup.goto();
      await setup.costCategories.openNewDialog();

      const colors = await setup.costCategories.dialogPanel().evaluate((panel) => ({
        background: getComputedStyle(panel).backgroundColor,
        text: getComputedStyle(panel).color,
      }));
      expect(colors.background, 'dialog text is readable on its background').not.toBe(colors.text);

      await setup.costCategories.fillDialog({ name, color: '#336699' });
      await setup.costCategories.save();
      await expect(setup.costCategories.row(name)).toBeVisible();
    } finally {
      await deleteCategoriesByName(page, LISTS[0]!, name);
      await context.close();
    }
  });
});
