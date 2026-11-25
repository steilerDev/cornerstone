/**
 * E2E tests for the quick-create schemas of reference objects (#2256, EPIC-21).
 *
 * One schema per object serves Project setup (New / Edit) and the picker's inline create:
 *
 *   Q1  Cost category New / Edit in Project setup: Name first, Description and Colour behind
 *       "More details"; Edit opens with Description expanded when it has a value; an unchanged
 *       Save sends no PATCH
 *   Q2  Purchase category: Project setup New and the picker's inline "New purchase category"
 *       show the same fields (AC1 / AC4); the typed text prefills Name
 *   Q3  Orientation: Project setup New and the photo tag picker's inline "New orientation" show
 *       the same fields
 *   Q4  Trade: the picker's inline "New trade" opens the Name-only dialog; the Trades sheet New
 *       row rejects an empty and a duplicate name with the same messages
 *   Q5  Responsive: the dialogs are full-screen sheets below 768px; Save and Cancel are
 *       reachable; no horizontal overflow
 *
 * New user, duplicate email and Edit user (AC2 / AC3) live in admin/create-user.spec.ts and
 * admin/edit-user.spec.ts, which exercise the same user ObjectForm.
 *
 * All data is synthetic and carries the per-test `testPrefix`; each test removes what it created.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import {
  createAreaViaApi,
  createDiaryEntryViaApi,
  createOrientationViaApi,
  deleteAreaViaApi,
  deleteDiaryEntryViaApi,
  deleteOrientationViaApi,
  uploadDiaryPhotoViaApi,
} from '../../fixtures/apiHelpers.js';
import { API } from '../../fixtures/testData.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { EntityPickerControl } from '../../pages/components/EntityPickerControl.js';
import { ObjectFormDialog } from '../../pages/components/ObjectFormDialog.js';
import { HouseholdItemCreatePage } from '../../pages/HouseholdItemCreatePage.js';
import { PhotoSpotViewerPage } from '../../pages/PhotoSpotViewerPage.js';
import { ProjectSetupPage } from '../../pages/ProjectSetupPage.js';
import type { ReferenceListControl } from '../../pages/ProjectSetupPage.js';
import { VendorsPage } from '../../pages/VendorsPage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Delete every record with one of these names from a list endpoint answering `{ <key>: [...] }`. */
async function deleteNamed(page: Page, url: string, key: string, names: string[]): Promise<void> {
  const response = await page.request.get(url);
  if (!response.ok()) return;
  const body = (await response.json()) as Record<string, Array<{ id: string; name: string }>>;
  for (const row of (body[key] ?? []).filter((r) => names.includes(r.name))) {
    await page.request.delete(`${url.split('?')[0]}/${row.id}`);
  }
}

async function createCostCategoryViaApi(
  page: Page,
  data: { name: string; description?: string },
): Promise<string> {
  const response = await page.request.post(API.budgetCategories, { data });
  expect(response.ok(), `POST cost category "${data.name}"`).toBeTruthy();
  return ((await response.json()) as { budgetCategory: { id: string } }).budgetCategory.id;
}

/** Visible label texts of an open ObjectForm dialog, in DOM order. */
async function fieldLabels(dialog: ObjectFormDialog | ReferenceListControl): Promise<string[]> {
  const labels = await dialog.dialog.locator('[data-field] > label').allTextContents();
  return labels.map((text) => text.trim());
}

// ─────────────────────────────────────────────────────────────────────────────
// Q1 - cost category New / Edit
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Cost category form in Project setup (Q1)', { tag: '@responsive' }, () => {
  test('Q1: New and Edit share the fields; Description and Colour sit behind "More details"; an unchanged Save sends nothing', async ({
    page,
    testPrefix,
  }) => {
    const name = `${testPrefix} Cladding`;
    const description = 'Synthetic description text';
    const setup = new ProjectSetupPage(page);
    const list = setup.costCategories;
    let createdId: string | null = null;
    await setup.goto();

    try {
      await list.openNewDialog();
      await expect(list.dialog.getByRole('heading', { name: 'New cost category' })).toBeVisible();
      await expect(list.nameInput).toBeVisible();
      await expect(list.descriptionInput).toBeHidden();
      await list.moreButton.click();
      await expect(list.descriptionInput).toBeVisible();
      await expect(list.colorInput).toBeVisible();
      const newLabels = await fieldLabels(list);

      const created = page.waitForResponse(
        (r) => r.url().endsWith(API.budgetCategories) && r.request().method() === 'POST',
      );
      await list.fillDialog({ name, description, color: '#336699' });
      await list.save();
      createdId = ((await (await created).json()) as { budgetCategory: { id: string } })
        .budgetCategory.id;
      await expect(list.row(name)).toBeVisible();

      // Edit: same schema; Description has a value, so "More details" starts open
      await list.clickMenuItem(name, 'Edit');
      await expect(list.dialog.getByRole('heading', { name: 'Edit cost category' })).toBeVisible();
      await expect(list.descriptionInput).toBeVisible();
      await expect(list.descriptionInput).toHaveValue(description);
      await expect(list.nameInput).toHaveValue(name);
      expect(await fieldLabels(list)).toEqual(newLabels);

      // Unchanged Save: the dialog closes and no PATCH goes out
      const patches: string[] = [];
      page.on('request', (request) => {
        if (request.url().includes(`${API.budgetCategories}/`) && request.method() === 'PATCH') {
          patches.push(request.url());
        }
      });
      await list.save();
      await expect(list.row(name)).toBeVisible();
      expect(patches).toEqual([]);
    } finally {
      if (createdId) await page.request.delete(`${API.budgetCategories}/${createdId}`);
      await deleteNamed(page, API.budgetCategories, 'categories', [name]);
    }
  });

  test('Q1b: a duplicate name is a field error under Name and the dialog stays open', async ({
    page,
    testPrefix,
  }) => {
    const name = `${testPrefix} Duplicate`;
    const id = await createCostCategoryViaApi(page, { name });
    const setup = new ProjectSetupPage(page);
    const list = setup.costCategories;
    try {
      await setup.goto();
      await list.openNewDialog();
      await list.fillDialog({ name });
      await list.saveButton.click();

      await expect(list.nameError).toHaveText('A cost category with this name already exists.');
      await expect(list.dialog).toBeVisible();
      await expect(list.dialog.getByRole('alert')).toHaveCount(0);
    } finally {
      await page.request.delete(`${API.budgetCategories}/${id}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Q2 / Q3 - one definition in Project setup and in the pickers (AC1, AC4)
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Reference forms are shared with the pickers (Q2, Q3)',
  { tag: '@responsive' },
  () => {
    test('Q2: purchase category - Project setup New and the picker show the same fields', async ({
      page,
      testPrefix,
    }) => {
      const typed = `${testPrefix} Lighting`;
      const setup = new ProjectSetupPage(page);
      const list = setup.purchaseCategories;
      await setup.goto();
      await list.openNewDialog();
      await list.expandMoreDetails();
      await expect(list.colorInput).toBeVisible();
      const setupLabels = await fieldLabels(list);
      expect(setupLabels.length).toBeGreaterThanOrEqual(2);
      await list.cancelButton.click();
      await expect(list.dialog).toHaveCount(0);

      // Inline: the category picker of the New purchase dialog
      const create = new HouseholdItemCreatePage(page);
      const inline = new ObjectFormDialog(page, 'New purchase category', 'tag-create-form');
      await create.goto();
      await create.nameInput.fill(`${testPrefix} Hall lamp`);
      const picker = new EntityPickerControl(page, 'category', create.dialog);
      if ((await picker.input.count()) === 0) await picker.clearButton.click();
      await picker.type(typed);
      await picker.choose(picker.createOption('category', typed));
      await inline.waitForOpen();
      await expect(inline.field('name')).toHaveValue(typed);
      await inline.expandMoreDetails();

      expect(await fieldLabels(inline)).toEqual(setupLabels);
    });

    test('Q3: orientation - Project setup New and the photo tag picker show the same fields', async ({
      page,
      testPrefix,
    }) => {
      const typed = `${testPrefix} Skylight`;
      const areaName = `${testPrefix} Annex`;
      const orientationName = `${testPrefix} Nord`;
      const setup = new ProjectSetupPage(page);
      const list = setup.orientations;
      await setup.goto();
      await list.openNewDialog();
      await list.expandMoreDetails();
      await expect(list.descriptionInput).toBeVisible();
      const setupLabels = await fieldLabels(list);
      expect(setupLabels.length).toBeGreaterThanOrEqual(2);
      await list.cancelButton.click();
      await expect(list.dialog).toHaveCount(0);

      const areaId = await createAreaViaApi(page, { name: areaName });
      const orientationId = await createOrientationViaApi(page, { name: orientationName });
      const entryId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-06-12',
        title: `${testPrefix} Note`,
        body: 'Photo for the orientation picker',
      });
      try {
        const photoId = await uploadDiaryPhotoViaApi(page, entryId, { areaId, orientationId });
        const viewer = new PhotoSpotViewerPage(page);
        const inline = new ObjectFormDialog(page, 'New orientation', 'tag-create-form');
        await viewer.goto(areaId, orientationId, photoId);
        await viewer.openTagsEditor();

        const field = viewer.formField('Orientation');
        await field.getByRole('button', { name: 'Clear selection' }).click();
        const picker = new EntityPickerControl(page, field.locator('input'));
        await picker.input.fill(typed);
        await picker.dropdown.waitFor({ state: 'visible' });
        await picker.choose(picker.createOption('orientation', typed));
        await inline.waitForOpen();
        await expect(inline.field('name')).toHaveValue(typed);
        await inline.expandMoreDetails();

        expect(await fieldLabels(inline)).toEqual(setupLabels);
      } finally {
        await deleteDiaryEntryViaApi(page, entryId);
        await deleteOrientationViaApi(page, orientationId);
        await deleteAreaViaApi(page, areaId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Q4 - trades
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Trade name rules (Q4)', { tag: '@responsive' }, () => {
  test('Q4: the picker opens the Name-only dialog; the Trades sheet gives the same name errors', async ({
    page,
    testPrefix,
  }) => {
    const typed = `${testPrefix} Glazing`;
    const tradeName = `${testPrefix} Roofing`;
    const createdTrade = await page.request.post(API.trades, { data: { name: tradeName } });
    expect(createdTrade.ok(), 'POST trade').toBeTruthy();
    try {
      // Inline: the company dialog's trade picker
      await page.goto(routeUrl('companyNew'));
      const company = new ObjectFormDialog(page, 'New company');
      const tradeForm = new ObjectFormDialog(page, 'New trade', 'tag-create-form');
      await company.waitForOpen();
      const picker = new EntityPickerControl(page, 'tradeId', company.dialog);
      await picker.type(typed);
      await picker.choose(picker.createOption('trade', typed));
      await tradeForm.waitForOpen();
      await expect(tradeForm.field('name')).toHaveValue(typed);
      // Name only: there is no "More details"
      await expect(tradeForm.moreToggle).toHaveCount(0);
      expect(await fieldLabels(tradeForm)).toHaveLength(1);

      // The empty-name rule of the dialog and of the Trades sheet read the same
      await tradeForm.field('name').fill('');
      await tradeForm.save();
      await expect(tradeForm.fieldError('name')).toHaveText('Enter a name.');

      // Trades sheet New row
      const vendors = new VendorsPage(page);
      const sheet = vendors.tradesSheet;
      await page.goto(routeUrl('companies', undefined, { trades: 1 }));
      await sheet.waitForOpen();
      await sheet.addButton.click();
      await expect(sheet.dialog.getByText('Enter a name.')).toBeVisible();
      await sheet.addTrade(tradeName);
      await expect(sheet.dialog.getByText('A trade with this name exists already.')).toBeVisible();
      await expect(sheet.newInput).toHaveAttribute('aria-invalid', 'true');
    } finally {
      await deleteNamed(page, API.trades, 'trades', [tradeName, typed]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Q5 - responsive
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Reference dialogs - responsive (Q5)', { tag: '@responsive' }, () => {
  for (const key of ['costCategories', 'purchaseCategories', 'orientations'] as const) {
    test(`Q5: the ${key} New dialog fits the viewport with Save and Cancel reachable`, async ({
      page,
    }) => {
      const setup = new ProjectSetupPage(page);
      const list = setup[key];
      await setup.goto();
      await list.openNewDialog();

      const viewport = page.viewportSize();
      if (viewport && viewport.width < 768) {
        // A full-screen sheet below 768px
        const box = await list.dialog.boundingBox();
        expect(box).not.toBeNull();
        expect(Math.abs((box?.width ?? 0) - viewport.width)).toBeLessThanOrEqual(1);
        expect(Math.abs((box?.height ?? 0) - viewport.height)).toBeLessThanOrEqual(1);
      }
      await expect(list.saveButton).toBeInViewport();
      await expect(list.cancelButton).toBeInViewport();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        'no horizontal overflow',
      ).toBe(true);
    });
  }
});
