/**
 * E2E tests for the shared EntityPicker (#2236, EPIC-21).
 *
 * One picker replaces eight older ones. This file covers what users see of it:
 *
 *   W1  Who (New task dialog `#assignment`): "Companies" group before "Household members",
 *       ArrowDown from the input reaches the first company option (never a heading), one pick
 *       only (member -> clear -> company), the suffix on the chip, Save persists exactly one
 *   W2  Who on the task page (`#work-item-assignment`): member pick persists across a reload
 *   W3  "New company ‹text›" row: opens the company form prefilled; Cancel refocuses the input,
 *       Save selects the new company and focuses "Clear selection"
 *   W4  An exact (case/umlaut folded) company name shows no create row
 *   S1  Server contract: both an assigned user and an assigned company is a 400 (POST and PATCH)
 *   A1  Area path: options show the full path (muted ancestors, semibold last level), accessible
 *       name "Ground floor, Hallway", closed chip "Ground floor › Hallway"
 *   A2  "New area ‹text›" opens the New area form with the name prefilled; Save selects it
 *   C1  Inline "New orientation ‹text›" (photo Edit tags)
 *   C2  Inline "New trade ‹text›" (New company dialog; Escape closes only the top dialog)
 *   C3  Inline "New category ‹text›" (New purchase dialog)
 *   R1  Picker input and selected chip are 44px tall; Clear selection has a 44px hit area
 *   R2  320px wide: the New task dialog with an area path has no horizontal scroll
 *   R3  Dark mode: the path ancestors stay legible and the colour token changes with the theme
 *
 * All data is synthetic and carries the per-test `testPrefix`; each test removes what it created.
 */

import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../../fixtures/isolatedUser.js';
import {
  createAreaViaApi,
  createDiaryEntryViaApi,
  createOrientationViaApi,
  createWorkItemViaApi,
  deleteAreaViaApi,
  deleteDiaryEntryViaApi,
  deleteOrientationViaApi,
  deleteUserViaApi,
  deleteVendorViaApi,
  deleteWorkItemViaApi,
  uploadDiaryPhotoViaApi,
} from '../../fixtures/apiHelpers.js';
import { expectLegibleInDark, settleTransitions } from '../../fixtures/darkMode.js';
import { API } from '../../fixtures/testData.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { EntityPickerControl } from '../../pages/components/EntityPickerControl.js';
import type { CompanyPickerControl } from '../../pages/components/CompanyPickerControl.js';
import { ObjectFormDialog } from '../../pages/components/ObjectFormDialog.js';
import { HouseholdItemCreatePage } from '../../pages/HouseholdItemCreatePage.js';
import { PhotoSpotViewerPage } from '../../pages/PhotoSpotViewerPage.js';
import { WorkItemCreatePage } from '../../pages/WorkItemCreatePage.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function createCompany(page: Page, name: string): Promise<string> {
  const response = await page.request.post(API.vendors, { data: { name } });
  expect(response.ok(), `POST company "${name}": ${response.status()}`).toBeTruthy();
  return ((await response.json()) as { vendor: { id: string } }).vendor.id;
}

/** Delete records by exact name from a list endpoint that answers `{ <key>: [{ id, name }] }`. */
async function deleteNamed(page: Page, url: string, key: string, names: string[]): Promise<void> {
  const response = await page.request.get(url);
  if (!response.ok()) return;
  const body = (await response.json()) as Record<string, Array<{ id: string; name: string }>>;
  for (const row of (body[key] ?? []).filter((r) => names.includes(r.name))) {
    await page.request.delete(`${url.split('?')[0]}/${row.id}`);
  }
}

async function createMember(page: Page, prefix: string, displayName: string): Promise<string> {
  // A deleted user keeps its e-mail (soft delete), so every call gets a fresh address
  const slug = prefix.toLowerCase().replace(/[^a-z0-9]/g, '');
  const unique = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const response = await page.request.post(API.users, {
    data: {
      email: `${slug}.${unique}@example.test`,
      displayName,
      password: 'E2e-Synthetic-Pass-1!',
      role: 'member',
    },
  });
  expect(
    response.ok(),
    `POST member "${displayName}": ${response.status()} ${await response.text()}`,
  ).toBeTruthy();
  return ((await response.json()) as { user: { id: string } }).user.id;
}

async function getWorkItem(
  page: Page,
  id: string,
): Promise<{
  assignedUser: { displayName: string } | null;
  assignedVendor: { name: string } | null;
}> {
  const response = await page.request.get(`${API.workItems}/${id}`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as Record<string, unknown>;
  return (body.workItem ?? body) as {
    assignedUser: { displayName: string } | null;
    assignedVendor: { name: string } | null;
  };
}

async function savedTaskId(page: Page): Promise<string> {
  await page.waitForURL(/\/project\/work-items\/(?!new)[^/?#]+$/);
  return new URL(page.url()).pathname.split('/').pop()!;
}

async function focusIsOnBody(page: Page): Promise<boolean> {
  return page.evaluate(() => document.activeElement === document.body);
}

// ─────────────────────────────────────────────────────────────────────────────
// Who
// ─────────────────────────────────────────────────────────────────────────────

test.describe('EntityPicker - Who (W1-W4)', { tag: '@responsive' }, () => {
  test('W1: groups, keyboard path, one pick only, chip suffix and persistence', async ({
    page,
    testPrefix,
  }) => {
    const companyName = `${testPrefix} Atlas Roofing`;
    const memberName = `${testPrefix} Atlas Mason`;
    const companyId = await createCompany(page, companyName);
    const memberId = await createMember(page, testPrefix, memberName);
    const taskIds: string[] = [];
    try {
      const task = new WorkItemCreatePage(page);
      const picker = task.assignmentPicker;
      await task.goto();
      await task.fillTitle(`${testPrefix} Who task`);

      // Typing lists the groups in order: Companies, then Household members
      await picker.type(`${testPrefix} Atlas`);
      await expect(picker.dropdown.locator('[class*="groupHeading"]')).toHaveText([
        'Companies',
        'Household members',
      ]);
      await expect(picker.optionsInGroup('Companies')).toHaveCount(1);
      await expect(picker.optionsInGroup('Household members')).toHaveCount(1);

      // ArrowDown from the input lands on the first COMPANY option, never on a heading
      const firstCompany = picker.optionsInGroup('Companies').first();
      await picker.arrowTo(firstCompany);
      await expect(firstCompany).toBeFocused();
      await expect(firstCompany).toHaveAttribute('role', 'option');

      // Pick the member: name plus "Household member"
      await picker.choose(
        picker.optionsInGroup('Household members').filter({ hasText: memberName }),
      );
      await expect(picker.selectedDisplay()).toContainText(memberName);
      await expect(picker.selectedSuffix()).toHaveText('Household member');
      expect(await focusIsOnBody(page)).toBe(false);

      // One pick only: to choose a company the member goes first, then the chip shows "Company"
      await picker.clearButton.click();
      await expect(picker.input).toBeVisible();
      await picker.type(companyName);
      await picker.choose(picker.optionsInGroup('Companies').filter({ hasText: companyName }));
      await expect(picker.selectedDisplay()).toContainText(companyName);
      await expect(picker.selectedSuffix()).toHaveText('Company');
      await expect(picker.selectedDisplay()).not.toContainText(memberName);

      // Save persists exactly one assignee
      await task.submit();
      taskIds.push(await savedTaskId(page));
      const saved = await getWorkItem(page, taskIds[0]!);
      expect(saved.assignedVendor?.name).toBe(companyName);
      expect(saved.assignedUser).toBeNull();
    } finally {
      for (const id of taskIds) await deleteWorkItemViaApi(page, id);
      await deleteVendorViaApi(page, companyId);
      await deleteUserViaApi(page, memberId);
    }
  });

  test('W2: on the task page a household member is saved and shown after a reload', async ({
    page,
    testPrefix,
  }) => {
    const memberName = `${testPrefix} Birch Carpenter`;
    const memberId = await createMember(page, testPrefix, memberName);
    const workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} Who detail` });
    try {
      const detail = new WorkItemDetailPage(page);
      const picker = detail.assignmentPicker;
      await detail.goto(workItemId);

      await picker.type(memberName);
      await expect(picker.optionsInGroup('Household members')).toHaveCount(1);
      await picker.choose(
        picker.optionsInGroup('Household members').filter({ hasText: memberName }),
      );
      await expect(picker.selectedDisplay()).toContainText(memberName);
      await expect(picker.selectedSuffix()).toHaveText('Household member');

      await page.reload();
      await expect(picker.selectedDisplay()).toContainText(memberName);
      const saved = await getWorkItem(page, workItemId);
      expect(saved.assignedUser?.displayName).toBe(memberName);
      expect(saved.assignedVendor).toBeNull();
    } finally {
      await deleteWorkItemViaApi(page, workItemId);
      await deleteUserViaApi(page, memberId);
    }
  });

  test('W3: "New company" opens the form prefilled; Cancel refocuses the input, Save selects it', async ({
    page,
    testPrefix,
  }) => {
    const typed = `${testPrefix} Cedar Plastering`;
    const task = new WorkItemCreatePage(page);
    const picker: CompanyPickerControl = task.assignmentPicker;
    // Inside the New task dialog the company form is a child step: it keeps the parent's test ids
    const childForm = new ObjectFormDialog(page, 'New company');
    try {
      await task.goto();
      await task.fillTitle(`${testPrefix} Who create task`);

      await picker.type(typed);
      await expect(picker.createOption('company', typed)).toBeVisible();
      await picker.arrowToCreateOption(typed);
      await page.keyboard.press('Enter');
      await childForm.waitForOpen();
      await expect(childForm.field('name')).toHaveValue(typed);

      // Cancel (the name is only the prefill, so nothing is discarded): focus is on the input
      await childForm.cancel();
      await childForm.waitForClosed();
      await expect(picker.input).toBeFocused();

      // Again, and Save: the new company is selected and "Clear selection" holds focus
      await picker.openCreateForm(typed);
      await childForm.save();
      await task.form.waitForOpen();
      await expect(picker.selectedDisplay()).toContainText(typed);
      await expect(picker.selectedSuffix()).toHaveText('Company');
      expect(await focusIsOnBody(page)).toBe(false);
    } finally {
      await deleteNamed(page, `${API.vendors}?q=${encodeURIComponent(typed)}`, 'vendors', [typed]);
    }
  });

  // Spec AC: after Save of the child step "Clear selection" holds focus (the picker input is gone
  // once a chip is shown, so ObjectForm falls back to the first focusable in the field).
  test('W3b: after the child step saves, focus lands on "Clear selection"', async ({
    page,
    testPrefix,
  }) => {
    const typed = `${testPrefix} Cedar Mortar`;
    const task = new WorkItemCreatePage(page);
    const picker: CompanyPickerControl = task.assignmentPicker;
    const childForm = new ObjectFormDialog(page, 'New company');
    try {
      await task.goto();
      await task.fillTitle(`${testPrefix} Who focus task`);
      await picker.openCreateForm(typed);
      await childForm.save();
      await task.form.waitForOpen();
      await expect(picker.selectedDisplay()).toContainText(typed);
      await expect(picker.clearButton).toBeFocused({ timeout: 3_000 });
    } finally {
      await deleteNamed(page, `${API.vendors}?q=${encodeURIComponent(typed)}`, 'vendors', [typed]);
    }
  });

  test('W4: an exact name, in another case with a folded umlaut, shows no create row', async ({
    page,
    testPrefix,
  }) => {
    const existing = `${testPrefix} Müller Bau`;
    const variant = `${testPrefix} MULLER BAU`;
    const companyId = await createCompany(page, existing);
    try {
      const task = new WorkItemCreatePage(page);
      await task.goto();
      await task.assignmentPicker.type(variant);
      await expect(task.assignmentPicker.optionNamed(existing)).toBeVisible();
      await expect(task.assignmentPicker.createOption('company')).toHaveCount(0);
    } finally {
      await deleteVendorViaApi(page, companyId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Server contract (AC3)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('EntityPicker - one assignee on the server (S1)', () => {
  test('S1: a task with both an assigned user and an assigned company is a 400', async ({
    page,
    testPrefix,
  }) => {
    const companyId = await createCompany(page, `${testPrefix} Dual Co`);
    const memberId = await createMember(page, testPrefix, `${testPrefix} Dual Member`);
    const workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} Dual task` });
    try {
      const post = await page.request.post(API.workItems, {
        data: {
          title: `${testPrefix} Dual create`,
          assignedUserId: memberId,
          assignedVendorId: companyId,
        },
      });
      expect(post.status()).toBe(400);
      expect(((await post.json()) as { error: { code: string } }).error.code).toBe(
        'VALIDATION_ERROR',
      );

      const patch = await page.request.patch(`${API.workItems}/${workItemId}`, {
        data: { assignedUserId: memberId, assignedVendorId: companyId },
      });
      expect(patch.status()).toBe(400);
      expect(((await patch.json()) as { error: { code: string } }).error.code).toBe(
        'VALIDATION_ERROR',
      );
    } finally {
      await deleteWorkItemViaApi(page, workItemId);
      await deleteVendorViaApi(page, companyId);
      await deleteUserViaApi(page, memberId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Area path
// ─────────────────────────────────────────────────────────────────────────────

interface AreaSeed {
  rootName: string;
  childName: string;
  rootId: string;
  childId: string;
}

async function seedAreas(page: Page, prefix: string): Promise<AreaSeed> {
  const rootName = `${prefix} Ground floor`;
  const childName = `${prefix} Hallway`;
  const rootId = await createAreaViaApi(page, { name: rootName });
  const childId = await createAreaViaApi(page, { name: childName, parentId: rootId });
  return { rootName, childName, rootId, childId };
}

async function removeAreas(page: Page, seed: AreaSeed, extra: string[] = []): Promise<void> {
  await deleteNamed(page, API.areas, 'areas', extra);
  await deleteAreaViaApi(page, seed.childId);
  await deleteAreaViaApi(page, seed.rootId);
}

function areaPicker(page: Page, task: WorkItemCreatePage): EntityPickerControl {
  return new EntityPickerControl(page, 'area', task.dialog);
}

test.describe('EntityPicker - area path (A1-A2)', { tag: '@responsive' }, () => {
  test('A1: options show the full path; the chip reads "Ground floor › Hallway"', async ({
    page,
    testPrefix,
  }) => {
    const seed = await seedAreas(page, testPrefix);
    try {
      const task = new WorkItemCreatePage(page);
      await task.goto();
      const picker = areaPicker(page, task);

      // Two letters or more search the server; the child row carries its ancestors
      await picker.type(`${testPrefix} Hall`);
      const option = picker.optionNamed(`${seed.rootName}, ${seed.childName}`);
      await expect(option).toBeVisible();
      await expect(picker.pathAncestors(option)).toHaveText([seed.rootName]);
      await expect(picker.pathLast(option)).toHaveText(seed.childName);

      // Ancestors are muted, the last level is heavier (same classes, different computed style)
      const weights = await option.evaluate((el) => {
        const ancestor = el.querySelector('[class*="pathSegment"]') as HTMLElement;
        const last = el.querySelector('[class*="pathLast"]') as HTMLElement;
        return {
          ancestorWeight: Number(getComputedStyle(ancestor).fontWeight),
          lastWeight: Number(getComputedStyle(last).fontWeight),
          ancestorColor: getComputedStyle(ancestor).color,
          lastColor: getComputedStyle(last).color,
        };
      });
      expect(weights.lastWeight).toBeGreaterThan(weights.ancestorWeight);
      expect(weights.lastWeight).toBeGreaterThanOrEqual(600);
      expect(weights.ancestorColor).not.toBe(weights.lastColor);

      await picker.choose(option);
      await expect(picker.selectedDisplay()).toHaveText(
        new RegExp(`^${seed.rootName} › ${seed.childName}`),
      );
    } finally {
      await removeAreas(page, seed);
    }
  });

  test('A2: "New area" opens the New area form with the name prefilled; Save selects it', async ({
    page,
    testPrefix,
  }) => {
    const seed = await seedAreas(page, testPrefix);
    const typed = `${testPrefix} Sunroom`;
    try {
      const task = new WorkItemCreatePage(page);
      const form = new ObjectFormDialog(page, 'New area', 'tag-create-form');
      await task.goto();
      const picker = areaPicker(page, task);

      await picker.type(typed);
      await expect(picker.createOption('area', typed)).toBeVisible();
      await picker.choose(picker.createOption('area', typed));
      await form.waitForOpen();
      await expect(form.field('name')).toHaveValue(typed);

      await form.save();
      await form.waitForClosed();
      await expect(picker.selectedDisplay()).toContainText(typed);
      expect(await focusIsOnBody(page)).toBe(false);
    } finally {
      await removeAreas(page, seed, [`${testPrefix} Sunroom`]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Inline create: orientation, trade, category
// ─────────────────────────────────────────────────────────────────────────────

test.describe('EntityPicker - inline create (C1-C3)', { tag: '@responsive' }, () => {
  test('C1: "New orientation" in the photo Edit tags creates and selects it', async ({
    page,
    testPrefix,
  }) => {
    const areaName = `${testPrefix} Annex`;
    const orientationName = `${testPrefix} Nord`;
    const typed = `${testPrefix} Skylight`;
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
      const form = new ObjectFormDialog(page, 'New orientation', 'tag-create-form');
      await viewer.goto(areaId, orientationId, photoId);
      await viewer.openTagsEditor();

      const field = viewer.formField('Orientation');
      await field.getByRole('button', { name: 'Clear selection' }).click();
      const picker = new EntityPickerControl(page, field.locator('input'));
      await picker.input.fill(typed);
      await picker.dropdown.waitFor({ state: 'visible' });
      await expect(picker.createOption('orientation', typed)).toBeVisible();
      await picker.choose(picker.createOption('orientation', typed));
      await form.waitForOpen();
      await expect(form.field('name')).toHaveValue(typed);
      await form.save();
      await form.waitForClosed();

      // Selected in the editor; saving the tags keeps it
      await expect(field).toContainText(typed);
      // (a changed orientation moves the photo to another spot, so check the saved record)
      const patched = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/photos/${photoId}`) &&
          resp.request().method() === 'PATCH' &&
          resp.status() === 200,
      );
      await viewer.saveTagsButton.click();
      const saved = (await (await patched).json()) as { photo: { orientationId: string | null } };
      const orientations = (await (await page.request.get('/api/orientations')).json()) as {
        orientations: Array<{ id: string; name: string }>;
      };
      expect(saved.photo.orientationId).toBe(
        orientations.orientations.find((o) => o.name === typed)?.id,
      );
    } finally {
      await deleteDiaryEntryViaApi(page, entryId);
      await deleteNamed(page, '/api/orientations', 'orientations', [typed, orientationName]);
      await deleteOrientationViaApi(page, orientationId);
      await deleteAreaViaApi(page, areaId);
    }
  });

  test('C2: "New trade" in the New company dialog; Escape closes only the top dialog', async ({
    page,
    testPrefix,
  }) => {
    const typed = `${testPrefix} Glazing`;
    const companyName = `${testPrefix} Glass Works`;
    try {
      await page.goto(routeUrl('companyNew'));
      const company = new ObjectFormDialog(page, 'New company');
      const tradeForm = new ObjectFormDialog(page, 'New trade', 'tag-create-form');
      await company.waitForOpen();
      await company.field('name').fill(companyName);

      const picker = new EntityPickerControl(page, 'tradeId', company.dialog);
      await picker.type(typed);
      await expect(picker.createOption('trade', typed)).toBeVisible();
      await picker.choose(picker.createOption('trade', typed));
      await tradeForm.waitForOpen();
      await expect(tradeForm.field('name')).toHaveValue(typed);

      // Escape closes only the trade dialog; the company dialog stays with its typed name
      await page.keyboard.press('Escape');
      await tradeForm.waitForClosed();
      await expect(company.dialog).toBeVisible();
      await expect(company.field('name')).toHaveValue(companyName);
      await expect(picker.input).toBeFocused();

      // The input still holds the typed text, and re-opening the list filters by it (it does not
      // show the full trade list)
      await expect(picker.input).toHaveValue(typed);
      await picker.input.click();
      await expect(picker.dropdown).toBeVisible();
      await expect(picker.createOption('trade', typed)).toBeVisible();
      await expect(picker.dropdown.getByRole('option').filter({ hasNotText: typed })).toHaveCount(
        0,
      );

      // Create it for real: the trade is selected, then saved with the company.
      await picker.type(typed);
      await picker.choose(picker.createOption('trade', typed));
      await tradeForm.waitForOpen();
      await tradeForm.save();
      await tradeForm.waitForClosed();
      await expect(picker.selectedDisplay()).toContainText(typed);
      await company.save();
      await company.waitForClosed();

      // The trade exists (Trades sheet / API) and is on the company
      const trades = await page.request.get(API.trades);
      const body = (await trades.json()) as { trades: Array<{ id: string; name: string }> };
      expect(body.trades.some((t) => t.name === typed)).toBe(true);
    } finally {
      await deleteNamed(page, `${API.vendors}?q=${encodeURIComponent(companyName)}`, 'vendors', [
        companyName,
      ]);
      await deleteNamed(page, API.trades, 'trades', [typed]);
    }
  });

  test('C3: "New category" in the New purchase dialog creates and selects it', async ({
    page,
    testPrefix,
  }) => {
    const typed = `${testPrefix} Lighting`;
    const purchaseName = `${testPrefix} Hall lamp`;
    try {
      const create = new HouseholdItemCreatePage(page);
      const categoryForm = new ObjectFormDialog(page, 'New purchase category', 'tag-create-form');
      await create.goto();
      await create.nameInput.fill(purchaseName);

      // The category defaults to the first one; clear it, then create a new one
      const picker = new EntityPickerControl(page, 'category', create.dialog);
      if ((await picker.input.count()) === 0) await picker.clearButton.click();
      await picker.type(typed);
      await expect(picker.createOption('category', typed)).toBeVisible();
      await picker.choose(picker.createOption('category', typed));
      await categoryForm.waitForOpen();
      await expect(categoryForm.field('name')).toHaveValue(typed);
      await categoryForm.save();
      await categoryForm.waitForClosed();
      await expect(picker.selectedDisplay()).toContainText(typed);

      // The category is required and now set: the purchase saves
      await create.form.save();
      await create.form.waitForClosed();

      const list = await page.request.get('/api/household-item-categories');
      const body = (await list.json()) as { categories: Array<{ name: string }> };
      expect(body.categories.some((c) => c.name === typed)).toBe(true);
    } finally {
      await deleteNamed(
        page,
        `${API.householdItems}?q=${encodeURIComponent(purchaseName)}`,
        'items',
        [purchaseName],
      );
      await deleteNamed(page, '/api/household-item-categories', 'categories', [typed]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Responsive and dark mode
// ─────────────────────────────────────────────────────────────────────────────

async function heightOf(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no bounding box');
  return box.height;
}

test.describe('EntityPicker - sizes and themes (R1-R3)', { tag: '@responsive' }, () => {
  // R3 switches the theme: a dedicated user keeps any stored theme preference of the shared admin
  // (written by other specs) from racing the server sync with the theme the test sets
  test.use({ isolatedUserPerTest: { emailPrefix: 'picker-theme' } });

  test('R1: the picker input and the selected chip are 44px tall; Clear selection has a 44px hit area', async ({
    page,
    testPrefix,
  }) => {
    const seed = await seedAreas(page, testPrefix);
    try {
      const task = new WorkItemCreatePage(page);
      await task.goto();
      await task.form.settled();
      const picker = areaPicker(page, task);

      expect(await heightOf(picker.input)).toBeGreaterThanOrEqual(44);
      expect(await heightOf(task.assignmentPicker.input)).toBeGreaterThanOrEqual(44);

      await picker.type(`${testPrefix} Hall`);
      await picker.choose(picker.optionNamed(`${seed.rootName}, ${seed.childName}`));
      expect(await heightOf(picker.selectedDisplay())).toBeGreaterThanOrEqual(44);
      // The clear button keeps its small look; its 44 x 44 hit area is a pseudo-element, so probe
      // the points 21px above and below its centre: both must hit the button itself
      const box = (await picker.clearButton.boundingBox())!;
      for (const dy of [-21, 21]) {
        const hit = await picker.clearButton.evaluate(
          (el, point) => {
            const target = document.elementFromPoint(point.x, point.y);
            return target !== null && (el === target || el.contains(target));
          },
          { x: box.x + box.width / 2, y: box.y + box.height / 2 + dy },
        );
        expect(hit, `a point ${dy}px from the Clear selection centre hits the button`).toBe(true);
      }
    } finally {
      await removeAreas(page, seed);
    }
  });

  test('R2: at 320px wide the New task dialog with an area path does not scroll sideways', async ({
    page,
    testPrefix,
  }) => {
    const seed = await seedAreas(page, testPrefix);
    try {
      await page.setViewportSize({ width: 320, height: 640 });
      const task = new WorkItemCreatePage(page);
      await task.goto();
      await task.form.settled();
      const picker = areaPicker(page, task);
      await picker.type(`${testPrefix} Hall`);
      await picker.choose(picker.optionNamed(`${seed.rootName}, ${seed.childName}`));
      await expect(picker.selectedDisplay()).toContainText(seed.childName);

      const overflow = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        dialog: (() => {
          const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
          return dialog ? dialog.scrollWidth - dialog.clientWidth : 0;
        })(),
      }));
      expect(overflow.page).toBeLessThanOrEqual(0);
      expect(overflow.dialog).toBeLessThanOrEqual(0);
    } finally {
      await removeAreas(page, seed);
    }
  });

  test('R3: in dark mode the path ancestors stay legible and use a theme colour', async ({
    page,
    testPrefix,
  }) => {
    const seed = await seedAreas(page, testPrefix);
    try {
      const task = new WorkItemCreatePage(page);
      await task.goto();
      const picker = areaPicker(page, task);
      const ancestorColor = async () => {
        const option = picker.optionNamed(`${seed.rootName}, ${seed.childName}`);
        await expect(option).toBeVisible();
        return picker
          .pathAncestors(option)
          .first()
          .evaluate((el) => getComputedStyle(el).color);
      };

      await picker.type(`${testPrefix} Hall`);
      const light = await ancestorColor();

      // Switch the theme the way the app stores it and load the page again, so the theme provider
      // (not a hand-set attribute that a late preference sync could overwrite) owns the attribute
      await page.evaluate(() => localStorage.setItem('theme', 'dark'));
      await task.goto();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await settleTransitions(page);
      await picker.type(`${testPrefix} Hall`);
      const option = picker.optionNamed(`${seed.rootName}, ${seed.childName}`);
      await expect(option).toBeVisible();
      const dark = await ancestorColor();
      expect(dark).not.toBe(light);
      await expectLegibleInDark(picker.pathAncestors(option).first());
      await expectLegibleInDark(picker.pathLast(option));
    } finally {
      await removeAreas(page, seed);
    }
  });
});
