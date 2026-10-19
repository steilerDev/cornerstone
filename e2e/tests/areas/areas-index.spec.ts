/**
 * E2E tests for the Areas index (`/areas`, Story #2218 / EPIC-21, P1.11).
 *
 * The page is a tree of the house (building > floor > room) with roll-up counts of tasks,
 * purchases and photos, a filter, keyboard/menu reorder within one parent, a New / Edit form,
 * and a delete that is blocked while anything is booked and otherwise offers Undo.
 *
 * Scenarios:
 *   1. AC1  Counts: "n of m open" for tasks and purchases, photos with latest date; a parent
 *           equals its children plus its quiet row
 *   2. AC2  The quiet "Whole floor (no room)" row; the delete dialog title shows the full path
 *   3. AC3  New area, Add sub-area (Part of pre-filled), Edit; duplicate sibling name -> field
 *           error and focus on Name
 *   4. AC4  Blocked delete (counts, "Show these tasks" lands on the Tasks list with ?areaId=);
 *           photo-only area: confirm with consequences, then Undo restores area and photo tag
 *   5. AC5  Reorder (keyboard handle, or Move down in the menu on the phone) persists after a
 *           reload; the filter folds umlauts and disables reorder while active
 *   6. AC6  /tags and /settings/manage?tab=areas both land on /areas in a single hop
 *   7.      Loading, empty and load-error states; 320px render with long names (phone)
 *
 * Data: synthetic areas, tasks, purchases and diary photos created through the API per test
 * (names carry the worker `testPrefix` plus a per-test tag). The shared database also holds
 * other workers' areas, so every assertion is made on rows located by id.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { API } from '../../fixtures/testData.js';
import {
  createAreaViaApi,
  createDiaryEntryViaApi,
  createHouseholdItemViaApi,
  createWorkItemViaApi,
  deleteAreaViaApi,
  deleteDiaryEntryViaApi,
  deleteHouseholdItemViaApi,
  deleteWorkItemViaApi,
  uploadDiaryPhotoViaApi,
} from '../../fixtures/apiHelpers.js';
import { installRouteLog, readRouteLog } from '../../fixtures/routeLog.js';
import { AreasIndexPage } from '../../pages/AreasIndexPage.js';

const WIDE_MIN = 768;

function isWide(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) >= WIDE_MIN;
}

/** Per-test tag so two tests of one worker never reuse a name. */
function newTag(testPrefix: string): string {
  return `${testPrefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

/** Collects what a test created and removes it in dependency order (items, entries, areas). */
class Seed {
  private readonly tasks: string[] = [];
  private readonly purchases: string[] = [];
  private readonly entries: string[] = [];
  private readonly areas: string[] = [];

  constructor(private readonly page: Page) {}

  async area(
    name: string,
    opts: { parentId?: string | null; sortOrder?: number } = {},
  ): Promise<string> {
    const id = await createAreaViaApi(this.page, { name, ...opts });
    this.areas.push(id);
    return id;
  }

  /** Register an area created through the UI so cleanup removes it. */
  trackArea(id: string): void {
    this.areas.push(id);
  }

  async task(title: string, areaId: string, status = 'not_started'): Promise<string> {
    const id = await createWorkItemViaApi(this.page, { title, areaId, status });
    this.tasks.push(id);
    return id;
  }

  async purchase(name: string, areaId: string, status = 'planned'): Promise<string> {
    const id = await createHouseholdItemViaApi(this.page, { name, areaId, status });
    this.purchases.push(id);
    return id;
  }

  /** A saved diary entry with one photo tagged with the area. Returns entry and photo ids. */
  async photo(areaId: string, entryDate: string, title: string) {
    const entryId = await createDiaryEntryViaApi(this.page, {
      entryType: 'daily_log',
      entryDate,
      title,
      body: 'Synthetic body',
    });
    this.entries.push(entryId);
    const photoId = await uploadDiaryPhotoViaApi(this.page, entryId, { areaId });
    return { entryId, photoId };
  }

  async cleanup(): Promise<void> {
    for (const id of this.tasks) await deleteWorkItemViaApi(this.page, id).catch(() => undefined);
    for (const id of this.purchases) {
      await deleteHouseholdItemViaApi(this.page, id).catch(() => undefined);
    }
    for (const id of this.entries) {
      await deleteDiaryEntryViaApi(this.page, id).catch(() => undefined);
    }
    // Sub-areas go with their parent; deleting a vanished area is a harmless 404
    for (const id of [...this.areas].reverse()) {
      await deleteAreaViaApi(this.page, id).catch(() => undefined);
    }
  }
}

interface Tree {
  buildingId: string;
  floorId: string;
  room1Id: string;
  room2Id: string;
  emptyRoomId: string;
  names: { building: string; floor: string; room1: string; room2: string; emptyRoom: string };
}

/** building > floor > (room 1, room 2, empty room) with tasks, a purchase and a photo. */
async function seedTree(seed: Seed, tag: string): Promise<Tree> {
  const names = {
    building: `Haus ${tag}`,
    floor: `Erdgeschoss ${tag}`,
    room1: `Wohnzimmer ${tag}`,
    room2: `Flur ${tag}`,
    emptyRoom: `Abstellraum ${tag}`,
  };
  const buildingId = await seed.area(names.building);
  const floorId = await seed.area(names.floor, { parentId: buildingId });
  const room1Id = await seed.area(names.room1, { parentId: floorId, sortOrder: 0 });
  const room2Id = await seed.area(names.room2, { parentId: floorId, sortOrder: 1 });
  const emptyRoomId = await seed.area(names.emptyRoom, { parentId: floorId, sortOrder: 2 });

  // Room 1: two tasks (one completed) -> "1 of 2 open"; a purchase -> "1 of 1 open"; a photo
  await seed.task(`Sample task A ${tag}`, room1Id);
  await seed.task(`Sample task B ${tag}`, room1Id, 'completed');
  await seed.purchase(`Sample purchase ${tag}`, room1Id);
  // Room 2: one open task. The floor itself: one open task (shown on its quiet row)
  await seed.task(`Sample task C ${tag}`, room2Id);
  await seed.task(`Sample task D ${tag}`, floorId);
  return { buildingId, floorId, room1Id, room2Id, emptyRoomId, names };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 + 2: counts, roll-up, quiet row, full path in the delete title
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Areas index — counts and quiet rows', { tag: '@responsive' }, () => {
  test('Rows show "n of m open", photos with the latest date, and a parent adds up its children', async ({
    page,
    testPrefix,
  }) => {
    const seed = new Seed(page);
    const tag = newTag(testPrefix);
    try {
      const tree = await seedTree(seed, tag);
      await seed.photo(tree.room1Id, '2026-03-05', `Sample entry ${tag}`);

      const areas = new AreasIndexPage(page);
      await areas.goto();
      await expect(areas.row(tree.room1Id)).toBeVisible();

      // Room 1: its own direct counts
      await expect(areas.cell('tasks', tree.room1Id)).toContainText('1 of 2 open');
      await expect(areas.cell('purchases', tree.room1Id)).toContainText('1 of 1 open');
      await expect(areas.cell('photos', tree.room1Id)).toContainText(/1\b.*(photo|latest)/i);
      await expect(areas.cell('photos', tree.room1Id)).toContainText('Mar');
      // Room 2: no purchases, no photos
      await expect(areas.cell('tasks', tree.room2Id)).toContainText('1 of 1 open');
      await expect(areas.cell('purchases', tree.room2Id)).toContainText('None');
      await expect(areas.cell('photos', tree.room2Id)).toContainText('None');
      // The empty room has nothing at all
      await expect(areas.cell('tasks', tree.emptyRoomId)).toContainText('None');

      // The floor: both rooms (3 tasks, 2 open) plus its own task (quiet row) -> 3 of 4 open
      await expect(areas.cell('tasks', tree.floorId)).toContainText('3 of 4 open');
      await expect(areas.cell('purchases', tree.floorId)).toContainText('1 of 1 open');
      await expect(areas.cell('tasks', tree.floorId, true)).toContainText('1 of 1 open');
      // The building has nothing booked on itself, so it equals the floor
      await expect(areas.cell('tasks', tree.buildingId)).toContainText('3 of 4 open');
      await expect(areas.cell('photos', tree.buildingId)).toContainText('Mar');

      // The column header exists from 768px; below, every count carries its own label
      if (isWide(page)) {
        await expect(areas.header).toBeVisible();
        await expect(areas.header).toContainText('Tasks');
        await expect(areas.header).toContainText('Purchases');
        await expect(areas.header).toContainText('Photos');
      } else {
        await expect(areas.header).toHaveCount(0);
        await expect(areas.cell('tasks', tree.room1Id)).toContainText('Tasks');
      }
    } finally {
      await seed.cleanup();
    }
  });

  test('A photo counts while its diary entry exists and drops out when the entry is deleted', async ({
    page,
    testPrefix,
  }) => {
    const seed = new Seed(page);
    const tag = newTag(testPrefix);
    try {
      const roomId = await seed.area(`Atelier ${tag}`);
      const { entryId } = await seed.photo(roomId, '2026-04-02', `Sample entry ${tag}`);

      const areas = new AreasIndexPage(page);
      await areas.goto();
      await expect(areas.cell('photos', roomId)).toContainText(/1/);

      // Removing the entry removes its photo from the count
      await deleteDiaryEntryViaApi(page, entryId);
      await page.reload();
      await areas.waitForLoaded();
      await expect(areas.cell('photos', roomId)).toContainText('None');
    } finally {
      await seed.cleanup();
    }
  });

  test('The quiet row sits first among the children; the delete dialog title shows the full path', async ({
    page,
    testPrefix,
  }) => {
    const seed = new Seed(page);
    const tag = newTag(testPrefix);
    try {
      const tree = await seedTree(seed, tag);
      const areas = new AreasIndexPage(page);
      await areas.goto();

      // The floor has a task on itself and rooms below: the quiet row appears, first, unlinked
      const quiet = areas.quietRow(tree.floorId);
      await expect(quiet).toBeVisible();
      await expect(quiet).toContainText('Whole floor (no room)');
      await expect(quiet.getByRole('button')).toHaveCount(0);
      await expect(quiet.getByRole('link')).toHaveCount(0);
      await expect(areas.group(tree.floorId).locator(':scope > li').first()).toHaveAttribute(
        'data-reorder-skip',
        'true',
      );
      // The building has no items on itself: no quiet row; the empty room has no children
      await expect(areas.quietRow(tree.buildingId)).toHaveCount(0);
      await expect(areas.quietRow(tree.emptyRoomId)).toHaveCount(0);
      // The quiet row is not part of the reorderable siblings
      expect(await areas.childIds(tree.floorId)).toEqual([
        tree.room1Id,
        tree.room2Id,
        tree.emptyRoomId,
      ]);

      // Delete an empty room: the title is the full path, joined with " › "
      await areas.chooseMenuItem(tree.emptyRoomId, 'delete');
      const { building, floor, emptyRoom } = tree.names;
      await expect(
        page.getByRole('alertdialog', { name: `Delete ${building} › ${floor} › ${emptyRoom}?` }),
      ).toBeVisible();
      await areas.deleteDialog.cancel();
    } finally {
      await seed.cleanup();
    }
  });

  test('Expansion: the first two levels are open; collapsing hides the group and keeps its controls wired', async ({
    page,
    testPrefix,
  }) => {
    const seed = new Seed(page);
    const tag = newTag(testPrefix);
    try {
      const tree = await seedTree(seed, tag);
      const areas = new AreasIndexPage(page);
      await areas.goto();

      const toggle = areas.toggle(tree.floorId);
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(toggle).toHaveAccessibleName(`Sub-areas of ${tree.names.floor}`);
      await expect(areas.row(tree.room1Id)).toBeVisible();

      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).toBeFocused();
      await expect(areas.row(tree.room1Id)).toBeHidden();
      // Hidden, not removed: aria-controls still resolves
      const controls = await toggle.getAttribute('aria-controls');
      await expect(page.locator(`[id="${controls}"]`)).toHaveCount(1);

      await toggle.click();
      await expect(areas.row(tree.room1Id)).toBeVisible();
    } finally {
      await seed.cleanup();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: New area, Add sub-area, Edit, duplicate names
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Areas index — create, add sub-area, edit', { tag: '@responsive' }, () => {
  test('New area, then Add sub-area pre-fills Part of, then Edit renames it', async ({
    page,
    testPrefix,
  }) => {
    const seed = new Seed(page);
    const tag = newTag(testPrefix);
    const parentName = `Anbau ${tag}`;
    const childName = `Werkstatt ${tag}`;
    const renamed = `Werkstatt neu ${tag}`;
    try {
      const areas = new AreasIndexPage(page);
      await areas.goto();

      // New area (top level): the only trigger is the header button
      await areas.newButton.click();
      const form = areas.form('New area');
      await form.waitForOpen();
      await expect(form.field('name')).toBeFocused();
      await form.field('name').fill(parentName);
      const created = page.waitForResponse(
        (resp) =>
          resp.url().includes(API.areas) &&
          resp.request().method() === 'POST' &&
          resp.status() === 201,
      );
      await form.save();
      const parentId = ((await (await created).json()) as { area: { id: string } }).area.id;
      seed.trackArea(parentId);
      await form.waitForClosed();
      await expect(areas.row(parentId)).toBeVisible();
      await expect(areas.status).toContainText(`${parentName} added`);

      // Add sub-area from the row menu: Part of is pre-filled with the parent
      await areas.chooseMenuItem(parentId, 'add-sub');
      const subForm = areas.form('New area');
      await subForm.waitForOpen();
      await expect(subForm.dialog).toContainText(parentName);
      await subForm.field('name').fill(childName);
      const createdChild = page.waitForResponse(
        (resp) =>
          resp.url().includes(API.areas) &&
          resp.request().method() === 'POST' &&
          resp.status() === 201,
      );
      await subForm.save();
      const childId = ((await (await createdChild).json()) as { area: { id: string } }).area.id;
      seed.trackArea(childId);
      await subForm.waitForClosed();
      // The parent is expanded and the child is a row below it
      await expect(areas.row(childId)).toBeVisible();
      await expect(areas.toggle(parentId)).toHaveAttribute('aria-expanded', 'true');
      expect(await areas.childIds(parentId)).toEqual([childId]);

      // Edit: the form starts with the saved values; rename and save
      await areas.chooseMenuItem(childId, 'edit');
      const editForm = areas.form('Edit area');
      await editForm.waitForOpen();
      await expect(editForm.field('name')).toHaveValue(childName);
      await editForm.field('name').fill(renamed);
      await editForm.save();
      await editForm.waitForClosed();
      await expect(areas.rowByName(renamed)).toBeVisible();
      await expect(areas.status).toContainText(`${renamed} saved`);
      expect((await (await page.request.get(`${API.areas}/${childId}`)).json()).area.name).toBe(
        renamed,
      );
    } finally {
      await seed.cleanup();
    }
  });

  test('An empty name and a duplicate sibling name show the field error and focus Name', async ({
    page,
    testPrefix,
  }) => {
    const seed = new Seed(page);
    const tag = newTag(testPrefix);
    const topName = `Nebengebäude ${tag}`;
    const parentName = `Obergeschoss ${tag}`;
    const childName = `Bad ${tag}`;
    try {
      await seed.area(topName);
      const parentId = await seed.area(parentName);
      await seed.area(childName, { parentId });

      const areas = new AreasIndexPage(page);
      await areas.goto();

      // Empty name
      await areas.newButton.click();
      const form = areas.form('New area');
      await form.waitForOpen();
      await form.save();
      await expect(form.fieldError('name')).toHaveText('Enter a name.');
      await expect(form.field('name')).toBeFocused();

      // Duplicate at the top level, ignoring case
      await form.field('name').fill(topName.toUpperCase());
      await form.save();
      await expect(form.fieldError('name')).toHaveText(
        `There is already a top-level area called ${topName.toUpperCase()}.`,
      );
      await expect(form.field('name')).toBeFocused();
      await form.cancel();
      if (await form.discardConfirm.dialog.isVisible()) {
        await form.discardConfirm.confirmButton.click();
      }
      await form.waitForClosed();

      // Duplicate below a parent (Add sub-area): the message names the parent
      await areas.chooseMenuItem(parentId, 'add-sub');
      const subForm = areas.form('New area');
      await subForm.waitForOpen();
      await subForm.field('name').fill(childName.toLowerCase());
      await subForm.save();
      await expect(subForm.fieldError('name')).toHaveText(
        `There is already an area called ${childName.toLowerCase()} in ${parentName}.`,
      );
      await expect(subForm.field('name')).toBeFocused();
    } finally {
      await seed.cleanup();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: delete - blocked, and Undo
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Areas index — delete', { tag: '@responsive' }, () => {
  test('An area with tasks and purchases is blocked: counts, links to the lists, no Delete action', async ({
    page,
    testPrefix,
  }) => {
    const seed = new Seed(page);
    const tag = newTag(testPrefix);
    try {
      const tree = await seedTree(seed, tag);
      const areas = new AreasIndexPage(page);
      await areas.goto();

      // Room 1 holds 2 tasks and 1 purchase
      await areas.chooseMenuItem(tree.room1Id, 'delete');
      const dialog = areas.deleteDialog;
      await dialog.waitForOpen();
      await expect(dialog.dialog).toContainText(`${tree.names.room1} can't be deleted yet.`);
      await expect(dialog.dialog).toContainText(
        '2 tasks and 1 purchase are booked here or in a sub-area.',
      );
      await expect(dialog.confirmButton).toHaveCount(0);
      await expect(dialog.cancelButton).toHaveText('Close');
      await expect(areas.showTasksLink).toHaveText('Show these tasks');
      await expect(areas.showPurchasesLink).toHaveText('Show these purchases');

      // A parent is blocked by what sits anywhere below it
      await dialog.cancel();
      await areas.chooseMenuItem(tree.buildingId, 'delete');
      await dialog.waitForOpen();
      await expect(dialog.dialog).toContainText('4 tasks and 1 purchase');
      await dialog.cancel();

      // "Show these tasks" lands on the Tasks list filtered by this area, and closes the dialog
      await areas.chooseMenuItem(tree.room1Id, 'delete');
      await dialog.waitForOpen();
      await areas.showTasksLink.click();
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === routeUrl('workItems') && url.searchParams.get('areaId') === tree.room1Id,
      );
      await expect(dialog.dialog).toBeHidden();
    } finally {
      await seed.cleanup();
    }
  });

  test('"Show these purchases" lands on the Purchases list filtered by the area', async ({
    page,
    testPrefix,
  }) => {
    const seed = new Seed(page);
    const tag = newTag(testPrefix);
    try {
      const roomId = await seed.area(`Speisekammer ${tag}`);
      await seed.purchase(`Sample shelf ${tag}`, roomId);
      const areas = new AreasIndexPage(page);
      await areas.goto();
      await areas.chooseMenuItem(roomId, 'delete');
      await areas.deleteDialog.waitForOpen();
      await expect(areas.showTasksLink).toHaveCount(0);
      await areas.showPurchasesLink.click();
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === routeUrl('householdItems') && url.searchParams.get('areaId') === roomId,
      );
    } finally {
      await seed.cleanup();
    }
  });

  test('A photo-only area: confirm lists the consequences, delete offers Undo, Undo restores area and photo tag', async ({
    page,
    testPrefix,
  }) => {
    const seed = new Seed(page);
    const tag = newTag(testPrefix);
    const name = `Kellerraum ${tag}`;
    try {
      const areaId = await seed.area(name);
      const { entryId, photoId } = await seed.photo(areaId, '2026-05-10', `Sample entry ${tag}`);

      const areas = new AreasIndexPage(page);
      await areas.goto();
      await areas.chooseMenuItem(areaId, 'delete');

      const dialog = areas.deleteDialog;
      await dialog.waitForOpen();
      await expect(dialog.dialog).toHaveAccessibleName(`Delete ${name}?`);
      await expect(dialog.consequencesList).toContainText('1');
      await expect(dialog.consequencesList).toContainText(/photo/i);
      await expect(dialog.confirmButton).toBeVisible();

      const deleted = page.waitForResponse(
        (resp) =>
          resp.url().includes(`${API.areas}/${areaId}`) && resp.request().method() === 'DELETE',
      );
      await dialog.confirm();
      const response = await deleted;
      // Since #2218 the delete answers 200 with the Undo token (it was 204)
      expect(response.status()).toBe(200);
      expect(((await response.json()) as { undo?: unknown }).undo).toBeDefined();
      await dialog.dialog.waitFor({ state: 'hidden' });

      await expect(areas.toasts.undoToastWith(`${name} deleted`)).toBeVisible();
      await expect(areas.row(areaId)).toHaveCount(0);
      expect((await page.request.get(`${API.areas}/${areaId}`)).status()).toBe(404);
      const photoAfterDelete = await listEntryPhotos(page, entryId);
      expect(photoAfterDelete.find((photo) => photo.id === photoId)?.areaId).toBeNull();

      await areas.toasts.undoViaButton();
      await expect(areas.row(areaId)).toBeVisible();
      await expect(areas.status).toContainText(`${name} restored`);
      expect((await page.request.get(`${API.areas}/${areaId}`)).ok()).toBe(true);
      const photoAfterUndo = await listEntryPhotos(page, entryId);
      expect(photoAfterUndo.find((photo) => photo.id === photoId)?.areaId).toBe(areaId);
    } finally {
      await seed.cleanup();
    }
  });

  test('Deleting an area deletes its sub-areas too, and Undo brings the subtree back', async ({
    page,
    testPrefix,
  }) => {
    const seed = new Seed(page);
    const tag = newTag(testPrefix);
    try {
      const parentId = await seed.area(`Garage ${tag}`);
      const childId = await seed.area(`Werkbank ${tag}`, { parentId });
      const areas = new AreasIndexPage(page);
      await areas.goto();

      await areas.chooseMenuItem(parentId, 'delete');
      await areas.deleteDialog.waitForOpen();
      await expect(areas.deleteDialog.dialog).toContainText('Sub-areas deleted with it: 1');
      await areas.deleteDialog.confirmAndWaitClosed();
      await expect(areas.row(parentId)).toHaveCount(0);
      expect((await page.request.get(`${API.areas}/${childId}`)).status()).toBe(404);

      await areas.toasts.undoViaButton();
      await expect(areas.row(parentId)).toBeVisible();
      await expect(areas.row(childId)).toBeVisible();
    } finally {
      await seed.cleanup();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: reorder and filter
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Areas index — reorder and filter', { tag: '@responsive' }, () => {
  test('Reordering within a parent persists after a reload', async ({ page, testPrefix }) => {
    const seed = new Seed(page);
    const tag = newTag(testPrefix);
    try {
      const parentId = await seed.area(`Dachboden ${tag}`);
      const first = await seed.area(`Erster ${tag}`, { parentId, sortOrder: 0 });
      const second = await seed.area(`Zweiter ${tag}`, { parentId, sortOrder: 1 });
      const third = await seed.area(`Dritter ${tag}`, { parentId, sortOrder: 2 });

      const areas = new AreasIndexPage(page);
      await areas.goto();
      expect(await areas.childIds(parentId)).toEqual([first, second, third]);

      const saved = page.waitForResponse(
        (resp) => resp.url().includes('/areas/reorder') && resp.request().method() === 'PATCH',
      );
      if (isWide(page)) {
        // Keyboard: Space picks the handle up, ArrowDown moves it, Space drops it
        await areas.reorderByKeyboard(first, 'down');
        await expect(areas.status).toContainText('position 2 of 3');
      } else {
        // Phone: no drag handle; the ⋯ menu has Move down
        await expect(areas.handle(first)).toHaveCount(0);
        await areas.chooseMenuItem(first, 'move-down');
      }
      expect((await saved).ok()).toBe(true);
      await expect.poll(() => areas.childIds(parentId)).toEqual([second, first, third]);

      await page.reload();
      await areas.waitForLoaded();
      expect(await areas.childIds(parentId)).toEqual([second, first, third]);

      // Edge rows cannot move past the end: Move up on the first, Move down on the last
      await areas.menuTrigger(second).click();
      await expect(areas.menuItem('move-up', second)).toHaveAttribute('aria-disabled', 'true');
      await expect(areas.menuItem('move-down', second)).not.toHaveAttribute(
        'aria-disabled',
        'true',
      );
      await page.keyboard.press('Escape');
    } finally {
      await seed.cleanup();
    }
  });

  test('The filter ignores case and umlauts, keeps ancestors as context, and disables reorder', async ({
    page,
    testPrefix,
  }) => {
    const seed = new Seed(page);
    const tag = newTag(testPrefix);
    try {
      const parentId = await seed.area(`Erdgeschoss ${tag}`);
      const umlaut = await seed.area(`Küche ${tag}`, { parentId, sortOrder: 0 });
      const spelled = await seed.area(`Kueche ${tag}`, { parentId, sortOrder: 1 });
      const other = await seed.area(`Bad ${tag}`, { parentId, sortOrder: 2 });

      const areas = new AreasIndexPage(page);
      await areas.goto();
      await expect(areas.row(other)).toBeVisible();

      // "Kueche" finds "Küche" (and its own spelling); the rest drops out, the parent stays
      await areas.filter.fill(`Kueche ${tag}`);
      await expect(areas.row(umlaut)).toBeVisible();
      await expect(areas.row(spelled)).toBeVisible();
      await expect(areas.row(other)).toHaveCount(0);
      await expect(areas.row(parentId)).toBeVisible();
      await expect(areas.status).toContainText('2 areas match');
      // The match is marked
      await expect(areas.row(umlaut).locator('mark').first()).toBeVisible();

      // "Kuche" (umlaut dropped) finds "Küche"
      await areas.filter.fill(`Kuche ${tag}`);
      await expect(areas.row(umlaut)).toBeVisible();

      // "Küche" finds both spellings
      await areas.filter.fill(`Küche ${tag}`);
      await expect(areas.row(umlaut)).toBeVisible();
      await expect(areas.row(spelled)).toBeVisible();

      // Reorder is off while filtering
      if (isWide(page)) {
        await expect(areas.handle(umlaut)).toHaveAttribute('aria-disabled', 'true');
      }
      await areas.menuTrigger(umlaut).click();
      await expect(areas.menuItem('move-down', umlaut)).toHaveAttribute('aria-disabled', 'true');
      await page.keyboard.press('Escape');

      // No match: message and Clear filter, focus stays in the field
      await areas.filter.fill(`Nichts ${tag} zzz`);
      await expect(areas.noMatch).toContainText('No areas match');
      await areas.clearFilterButton.click();
      await expect(areas.filter).toBeFocused();
      await expect(areas.filter).toHaveValue('');
      await expect(areas.row(other)).toBeVisible();
      if (isWide(page)) {
        await expect(areas.handle(umlaut)).not.toHaveAttribute('aria-disabled', 'true');
      }
    } finally {
      await seed.cleanup();
    }
  });

  test('The shell "/" shortcut focuses the page filter', async ({ page }) => {
    const areas = new AreasIndexPage(page);
    await areas.goto();
    await page.locator('main').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('/');
    await expect(areas.filter).toBeFocused();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: old URLs
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Areas index — old URLs', { tag: '@responsive' }, () => {
  for (const from of ['/tags', '/settings/manage?tab=areas']) {
    test(`${from} lands on /areas in a single hop`, async ({ page }) => {
      await installRouteLog(page);
      await page.goto(from);
      await expect(new AreasIndexPage(page).heading).toBeVisible();
      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('areas') && !url.searchParams.has('tab'),
      );

      const log = await readRouteLog(page);
      expect(
        log.filter((entry) => entry.kind === 'pushState'),
        'the redirect replaces, never pushes',
      ).toEqual([]);
      expect(
        log.map((entry) => new URL(entry.url).pathname).filter((p) => p !== routeUrl('areas')),
        'no intermediate path appears',
      ).toEqual([]);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: states and narrow screens
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Areas index — states and layout', { tag: '@responsive' }, () => {
  test('Loading shows a skeleton with New area disabled; an empty house shows the empty state', async ({
    page,
  }) => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/areas?include=counts', async (route) => {
      await gate;
      await route.fulfill({ json: { areas: [] } });
    });

    const areas = new AreasIndexPage(page);
    await page.goto(routeUrl('areas'));
    await expect(areas.heading).toBeVisible();
    await expect(page.locator('[role="status"][aria-busy="true"]')).toBeVisible();
    await expect(areas.newButton).toHaveAttribute('aria-disabled', 'true');

    release();
    await expect(areas.emptyState).toBeVisible();
    await expect(areas.newButton).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('A failed load shows an error with Try again, which loads the tree', async ({
    page,
    testPrefix,
  }) => {
    const seed = new Seed(page);
    const tag = newTag(testPrefix);
    try {
      const id = await seed.area(`Retry ${tag}`);
      let fail = true;
      await page.route('**/api/areas?include=counts', async (route) => {
        if (fail) {
          await route.fulfill({
            status: 500,
            json: { error: { code: 'INTERNAL_ERROR', message: 'boom' } },
          });
        } else {
          await route.continue();
        }
      });

      const areas = new AreasIndexPage(page);
      await page.goto(routeUrl('areas'));
      await expect(areas.retryButton).toBeVisible();
      await expect(areas.heading).toBeFocused();

      fail = false;
      await areas.retryButton.click();
      await expect(areas.row(id)).toBeVisible();
    } finally {
      await seed.cleanup();
    }
  });

  test('Phone 320px: long names ellipsize, nothing scrolls sideways', async ({
    browser,
    testPrefix,
  }) => {
    test.skip(test.info().project.name !== 'mobile', 'explicit phone widths run once');
    const context = await browser.newContext({
      viewport: { width: 320, height: 640 },
      storageState: 'test-results/.auth/admin.json',
    });
    const page = await context.newPage();
    const seed = new Seed(page);
    const tag = newTag(testPrefix);
    try {
      const long = `Ein sehr langer Name für ein Gästezimmer im Obergeschoss ${tag} ${'x'.repeat(80)}`;
      const parentId = await seed.area(long);
      const childId = await seed.area(`${long} Nebenraum`, { parentId });
      await seed.task(`Sample task ${tag}`, childId);

      const areas = new AreasIndexPage(page);
      await areas.goto();
      await expect(areas.row(childId)).toBeVisible();
      expect(await areas.hasHorizontalOverflow()).toBe(false);
      // The row stays inside the viewport and the name is cut off with an ellipsis
      const box = await areas.row(parentId).boundingBox();
      expect(box?.width ?? 0).toBeLessThanOrEqual(320);
      const name = areas.row(parentId).locator('[title]').first();
      expect(
        await name.evaluate((el) => el.scrollWidth > el.clientWidth),
        'long name is truncated',
      ).toBe(true);
      // Counts wrap below the name instead of squeezing it
      await expect(areas.cell('tasks', parentId)).toContainText('1 of 1 open');
    } finally {
      await seed.cleanup();
      await context.close();
    }
  });

  test('Touch targets: the toggle, ⋯ and New area are at least 44px', async ({
    page,
    testPrefix,
  }) => {
    test.skip(test.info().project.name !== 'mobile', 'phone sizes run once');
    const seed = new Seed(page);
    const tag = newTag(testPrefix);
    try {
      const parentId = await seed.area(`Touch ${tag}`);
      await seed.area(`Touch child ${tag}`, { parentId });
      const areas = new AreasIndexPage(page);
      await areas.goto();
      for (const locator of [
        areas.newButton,
        areas.toggle(parentId),
        areas.menuTrigger(parentId),
      ]) {
        const box = await locator.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.5);
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(43.5);
      }
    } finally {
      await seed.cleanup();
    }
  });

  test('Dark mode renders the tree without horizontal overflow', async ({ page, testPrefix }) => {
    const seed = new Seed(page);
    const tag = newTag(testPrefix);
    try {
      const parentId = await seed.area(`Dunkel ${tag}`);
      await seed.area(`Dunkel Raum ${tag}`, { parentId });
      await page.emulateMedia({ colorScheme: 'dark' });
      const areas = new AreasIndexPage(page);
      await areas.goto();
      await expect(areas.row(parentId)).toBeVisible();
      expect(await areas.hasHorizontalOverflow()).toBe(false);
    } finally {
      await seed.cleanup();
    }
  });
});

interface PhotoRef {
  id: string;
  areaId: string | null;
}

async function listEntryPhotos(page: Page, entryId: string): Promise<PhotoRef[]> {
  const response = await page.request.get(
    `/api/photos?entityType=diary_entry&entityId=${encodeURIComponent(entryId)}`,
  );
  expect(response.ok(), 'GET photos of the entry').toBeTruthy();
  return ((await response.json()) as { photos: PhotoRef[] }).photos;
}
