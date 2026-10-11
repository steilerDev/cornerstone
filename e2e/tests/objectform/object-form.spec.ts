/**
 * E2E ObjectForm create dialog (Story #2212 / EPIC-21, P1.6)
 *
 * New task, New purchase and New milestone are one schema-driven dialog over the page you came
 * from: a Modal from 768px, a full-screen Sheet below. The URL is the real `/…/new`; Back
 * closes it; Save replaces it with the new object.
 *
 * Scenarios:
 * - O1  (all)      opened from the Schedule: URL, page behind, title, tab title; Back closes;
 *                  reload re-opens over the Schedule; a fresh visit shows it over the list
 * - O2  (all)      container: Modal <= 640px wide from 768px, full-screen Sheet below with a 56px
 *                  header and 44px Cancel/Save side by side, Cancel left of Save
 * - O3  (all)      validation: first invalid field focused, inline error, no alert
 * - O4  (all)      Save lands on the new object with its h1 focused; Back returns to the list
 * - O5  (all)      Add another: stays open, status line, area kept, focus on the title, the list
 *                  behind shows both tasks without a reload
 * - O6  (all)      dirty: Escape asks "Discard changes?" (focus on Keep editing); browser Back
 *                  asks too and Keep editing returns to /new with the input; Discard closes and
 *                  focuses the opener
 * - O7  (desktop)  resizing across 768px keeps the input and the focused field
 * - O8  (all)      dark mode and reduced motion
 *
 * Data: synthetic names under the per-worker `testPrefix`, removed through the API.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { routeUrl } from '../../../shared/src/routes/index.js';
import {
  createAreaViaApi,
  deleteAreaViaApi,
  deleteHouseholdItemViaApi,
  deleteMilestoneViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { CreateMenu } from '../../pages/components/CreateMenu.js';
import { HouseholdItemCreatePage } from '../../pages/HouseholdItemCreatePage.js';
import { MilestoneCreatePage } from '../../pages/MilestoneCreatePage.js';
import { TimelinePage } from '../../pages/TimelinePage.js';
import { WorkItemCreatePage } from '../../pages/WorkItemCreatePage.js';
import { WorkItemsPage } from '../../pages/WorkItemsPage.js';

const MODAL_FROM = 768;

function pathnameIs(path: string) {
  return (url: URL) => url.pathname === path;
}

function isWide(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) >= MODAL_FROM;
}

function noSidewaysScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
}

/** Pick the area named `name` in the dialog's area picker. */
async function pickArea(createPage: WorkItemCreatePage, page: Page, name: string): Promise<void> {
  await createPage.areaPickerInput.click();
  await createPage.areaPickerInput.fill(name);
  const option = page.getByRole('listbox').getByRole('option', { name: new RegExp(name) });
  await expect(option).toBeVisible();
  await option.click();
  await expect(createPage.areaClearButton).toBeVisible();
}

test.describe('ObjectForm dialog (#2212)', { tag: '@responsive' }, () => {
  // ───────────────────────────────────────────────────────────────────────────
  // O1 — a real URL over the page you came from
  // ───────────────────────────────────────────────────────────────────────────

  test('O1: from the Schedule, New › Task opens the dialog over it; Back closes; reload re-opens', async ({
    page,
  }) => {
    const timeline = new TimelinePage(page);
    const createMenu = new CreateMenu(page);
    const createPage = new WorkItemCreatePage(page);

    await page.goto(routeUrl('scheduleGantt'));
    await timeline.waitForLoaded();
    await createMenu.choose('task');

    await page.waitForURL(pathnameIs(routeUrl('workItemNew')));
    await createPage.form.waitForOpen();
    await expect(createPage.heading).toHaveText('New task');
    await expect(timeline.heading).toBeVisible();
    await expect(page).toHaveTitle(/^New task · Tasks · .+/);

    // A reload keeps the history state: the dialog opens over the Schedule again
    await page.reload();
    await createPage.form.waitForOpen();
    await expect(timeline.heading).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(routeUrl('workItemNew'));

    // Browser Back closes the (clean) dialog and lands on the Schedule
    await page.goBack();
    await page.waitForURL(pathnameIs(routeUrl('scheduleGantt')));
    await createPage.form.waitForClosed();
    await expect(timeline.heading).toBeVisible();
  });

  test('O1: a fresh visit to the create URL shows the dialog over the Tasks list', async ({
    page,
  }) => {
    const fresh = await page.context().newPage();
    try {
      const createPage = new WorkItemCreatePage(fresh);
      await fresh.goto(routeUrl('workItemNew'));
      await createPage.form.waitForOpen();
      await expect(
        fresh.getByRole('heading', { level: 1, name: 'Tasks', exact: true }),
      ).toBeVisible();
    } finally {
      await fresh.close();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // O2 — Modal from 768px, full-screen Sheet below
  // ───────────────────────────────────────────────────────────────────────────

  test('O2: the container fits the viewport; actions are Cancel then Save', async ({ page }) => {
    const createPage = new WorkItemCreatePage(page);
    await createPage.goto();
    await createPage.form.settled();

    const viewport = page.viewportSize()!;
    const surface = await createPage.dialog.evaluate((el) => {
      // Sheet: the dialog is the panel. Modal: the dialog is the overlay, its content is child 2.
      const target =
        el.getAttribute('data-testid') === 'object-form-sheet'
          ? el
          : (el.children[1] as HTMLElement);
      const box = target.getBoundingClientRect();
      const header = target.firstElementChild as HTMLElement;
      return {
        sheet: el.getAttribute('data-testid') === 'object-form-sheet',
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        headerHeight: header.getBoundingClientRect().height,
      };
    });
    const cancel = await createPage.cancelButton.boundingBox();
    const save = await createPage.submitButton.boundingBox();

    expect(surface.sheet).toBe(!isWide(page));
    if (isWide(page)) {
      expect(surface.width).toBeLessThanOrEqual(640);
      expect(surface.height).toBeLessThan(viewport.height);
    } else {
      // Full-screen sheet: the whole viewport, a 56px header, 44px side-by-side actions
      expect(surface.x).toBe(0);
      expect(surface.y).toBe(0);
      expect(surface.width).toBe(viewport.width);
      expect(surface.height).toBe(viewport.height);
      expect(surface.headerHeight).toBe(56);
      expect(cancel?.height).toBe(44);
      expect(save?.height).toBe(44);
      expect(Math.abs((cancel?.y ?? 0) - (save?.y ?? 99))).toBeLessThan(1);
    }
    // Cancel before Save, left to right
    expect(cancel?.x ?? 0).toBeLessThan(save?.x ?? 0);
    expect(await noSidewaysScroll(page)).toBe(true);
  });

  test('O2: the page behind does not scroll while the dialog is open', async ({ page }) => {
    const createPage = new WorkItemCreatePage(page);
    await createPage.goto();

    await expect(page.locator('html')).toHaveAttribute('data-scroll-locked', 'true');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // O3 — validation
  // ───────────────────────────────────────────────────────────────────────────

  test('O3: an empty milestone focuses the first invalid field; errors are inline, not alerts', async ({
    page,
  }) => {
    const createPage = new MilestoneCreatePage(page);
    await createPage.goto();

    await createPage.submit();

    await expect(createPage.titleErrorText).toBeVisible();
    await expect(createPage.targetDateErrorText).toBeVisible();
    await expect(createPage.titleInput).toHaveAttribute('aria-invalid', 'true');
    await expect(createPage.titleInput).toBeFocused();
    await expect(createPage.errorBanner).toHaveCount(0);
    // Each field points at its own error text
    await expect(createPage.titleInput).toHaveAttribute('aria-describedby', 'title-error');
    expect(new URL(page.url()).pathname).toBe(routeUrl('milestoneNew'));

    // Fixing the title moves on to the date
    await createPage.fillTitle('Ready');
    await createPage.submit();
    await expect(createPage.targetDateInput).toBeFocused();
  });

  test('O3: an end date before the start date is a field error on the later date', async ({
    page,
  }) => {
    const createPage = new WorkItemCreatePage(page);
    await createPage.goto();

    await createPage.fillForm({
      title: 'Constraint check',
      startAfter: '2026-06-30',
      startBefore: '2026-03-01',
    });
    await createPage.submit();

    await expect(createPage.form.fieldError('startBefore')).toBeVisible();
    await expect(createPage.startBeforeInput).toBeFocused();
    await expect(createPage.errorBanner).toHaveCount(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // O4 — Save lands on the object
  // ───────────────────────────────────────────────────────────────────────────

  test('O4: Save opens the new task with its h1 focused; Back returns to the list, not the form', async ({
    page,
    testPrefix,
  }) => {
    const tasks = new WorkItemsPage(page);
    const createPage = new WorkItemCreatePage(page);
    const title = `${testPrefix} O4 saved task`;
    let createdId: string | null = null;

    try {
      await page.goto(routeUrl('workItems'));
      await tasks.waitForLoaded();
      await tasks.newWorkItemButton.click();
      await createPage.form.waitForOpen();
      expect(new URL(page.url()).pathname).toBe(routeUrl('workItemNew'));

      await createPage.fillTitle(title);
      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/work-items') && resp.request().method() === 'POST',
      );
      await createPage.submit();
      const body = (await (await responsePromise).json()) as {
        workItem?: { id: string };
        id?: string;
      };
      createdId = body.workItem?.id ?? body.id ?? null;
      expect(createdId).not.toBeNull();

      await page.waitForURL(pathnameIs(routeUrl('workItem', { id: createdId! })));
      const heading = page.getByRole('heading', { level: 1, name: title, exact: true });
      await expect(heading).toBeVisible();
      await expect(heading).toBeFocused();
      await expect(createPage.form.dialog).toHaveCount(0);

      // Back is the page you came from, never the empty form
      await page.goBack();
      await page.waitForURL(pathnameIs(routeUrl('workItems')));
      await expect(createPage.form.dialog).toHaveCount(0);
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });

  test('O4: a milestone and a purchase save the same way', async ({ page, testPrefix }) => {
    const milestone = new MilestoneCreatePage(page);
    let milestoneId: number | null = null;
    let purchaseId = '';

    try {
      await milestone.goto();
      const milestoneTitle = `${testPrefix} O4 milestone`;
      await milestone.fillForm({ title: milestoneTitle, targetDate: '2027-04-01' });
      const created = page.waitForResponse(
        (resp) => resp.url().includes('/api/milestones') && resp.request().method() === 'POST',
      );
      await milestone.submit();
      milestoneId = ((await (await created).json()) as { id: number }).id;
      await page.waitForURL(pathnameIs(routeUrl('milestone', { id: milestoneId })));
      await expect(page.getByRole('heading', { level: 1, name: milestoneTitle })).toBeVisible();

      const fresh = await page.context().newPage();
      try {
        const freshPurchase = new HouseholdItemCreatePage(fresh);
        await freshPurchase.goto();
        await freshPurchase.fillForm({ name: `${testPrefix} O4 purchase` });
        purchaseId = await freshPurchase.submitAndWaitForDetail();
        await expect(
          fresh.getByRole('heading', { level: 1, name: `${testPrefix} O4 purchase` }),
        ).toBeVisible();
      } finally {
        await fresh.close();
      }
    } finally {
      if (milestoneId !== null) await deleteMilestoneViaApi(page, milestoneId);
      if (purchaseId) await deleteHouseholdItemViaApi(page, purchaseId);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // O5 — Add another
  // ───────────────────────────────────────────────────────────────────────────

  test('O5: Add another keeps the dialog, the area and the list behind current', async ({
    page,
    testPrefix,
  }) => {
    const tasks = new WorkItemsPage(page);
    const createPage = new WorkItemCreatePage(page);
    const areaName = `${testPrefix} O5 area`;
    const unique = `${testPrefix} O5 ${Date.now().toString(36)}`;
    const first = `${unique} first`;
    const second = `${unique} second`;
    const createdIds: string[] = [];
    let areaId = '';

    page.on('response', (resp) => {
      if (resp.url().includes('/api/work-items') && resp.request().method() === 'POST') {
        void resp
          .json()
          .then((body: { workItem?: { id: string }; id?: string }) => {
            const id = body.workItem?.id ?? body.id;
            if (id) createdIds.push(id);
          })
          .catch(() => undefined);
      }
    });

    try {
      areaId = await createAreaViaApi(page, { name: areaName });
      // The list behind the dialog is filtered to this test's tasks
      await page.goto(routeUrl('workItems', undefined, { q: unique }));
      await tasks.waitForLoaded();
      await tasks.newWorkItemButton.click();
      await createPage.form.waitForOpen();

      await expect(createPage.form.addAnotherCheckbox).not.toBeChecked();
      await createPage.form.addAnotherCheckbox.check();
      await pickArea(createPage, page, areaName);
      await createPage.fillTitle(first);
      await createPage.submit();

      // The dialog stays on /new, confirms the save, keeps the area and focuses the title
      await expect(createPage.form.addedStatus).toContainText(`Task ‘${first}’ added.`);
      await expect(createPage.titleInput).toHaveValue('');
      await expect(createPage.titleInput).toBeFocused();
      await expect(createPage.areaClearButton).toBeVisible();
      await expect(createPage.form.addAnotherCheckbox).toBeChecked();
      expect(new URL(page.url()).pathname).toBe(routeUrl('workItemNew'));

      await createPage.fillTitle(second);
      await createPage.submit();
      await expect(createPage.form.addedStatus).toContainText(`Task ‘${second}’ added.`);

      // The list behind shows both without a reload (the dialog is still open over it)
      await expect(tasks.workItemRow(first)).toBeVisible();
      await expect(tasks.workItemRow(second)).toBeVisible();
      expect(createdIds).toHaveLength(2);

      // The reset form is pristine: Cancel closes without a prompt
      await createPage.cancel();
      await page.waitForURL(pathnameIs(routeUrl('workItems')));
      await expect(createPage.form.discardConfirm.dialog).toHaveCount(0);
    } finally {
      for (const id of createdIds) await deleteWorkItemViaApi(page, id);
      if (areaId) await deleteAreaViaApi(page, areaId);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // O6 — unsaved input
  // ───────────────────────────────────────────────────────────────────────────

  test('O6: Escape on typed input asks to discard; Keep editing returns to the field', async ({
    page,
  }) => {
    const tasks = new WorkItemsPage(page);
    const createPage = new WorkItemCreatePage(page);
    await page.goto(routeUrl('workItems'));
    await tasks.waitForLoaded();
    await tasks.newWorkItemButton.click();
    await createPage.form.waitForOpen();

    await createPage.fillTitle('Half typed');
    await page.keyboard.press('Escape');

    const confirm = createPage.form.discardConfirm;
    await confirm.waitForOpen();
    await expect(confirm.dialog).toContainText('Discard changes?');
    await expect(confirm.cancelButton).toHaveText('Keep editing');
    await expect(confirm.cancelButton).toBeFocused();

    await confirm.cancel();
    await expect(createPage.titleInput).toBeFocused();
    await expect(createPage.titleInput).toHaveValue('Half typed');
    expect(new URL(page.url()).pathname).toBe(routeUrl('workItemNew'));
  });

  test('O6: browser Back on typed input asks first; Keep editing returns to /new with the input', async ({
    page,
  }) => {
    const tasks = new WorkItemsPage(page);
    const createPage = new WorkItemCreatePage(page);
    await page.goto(routeUrl('workItems'));
    await tasks.waitForLoaded();
    await tasks.newWorkItemButton.click();
    await createPage.form.waitForOpen();
    await createPage.fillTitle('Kept across Back');

    await page.goBack();

    const confirm = createPage.form.discardConfirm;
    await confirm.waitForOpen();
    await confirm.cancel();

    await page.waitForURL(pathnameIs(routeUrl('workItemNew')));
    await createPage.form.waitForOpen();
    await expect(createPage.titleInput).toHaveValue('Kept across Back');
  });

  test('O6: Discard closes the dialog and focuses the opener', async ({ page }) => {
    const tasks = new WorkItemsPage(page);
    const createPage = new WorkItemCreatePage(page);
    await page.goto(routeUrl('workItems'));
    await tasks.waitForLoaded();
    await tasks.newWorkItemButton.click();
    await createPage.form.waitForOpen();
    await createPage.fillTitle('To be discarded');

    await createPage.cancelButton.click();
    await createPage.form.discardConfirm.waitForOpen();
    await createPage.form.discardConfirm.confirm();

    await page.waitForURL(pathnameIs(routeUrl('workItems')));
    await createPage.form.waitForClosed();
    await expect(tasks.newWorkItemButton).toBeFocused();
  });

  test('O6: browser Back then Discard closes the dialog on the list', async ({ page }) => {
    const tasks = new WorkItemsPage(page);
    const createPage = new WorkItemCreatePage(page);
    await page.goto(routeUrl('workItems'));
    await tasks.waitForLoaded();
    await tasks.newWorkItemButton.click();
    await createPage.form.waitForOpen();
    await createPage.fillTitle('Gone after Discard');

    await page.goBack();
    await createPage.form.discardConfirm.waitForOpen();
    await createPage.form.discardConfirm.confirm();

    await createPage.form.waitForClosed();
    expect(new URL(page.url()).pathname).toBe(routeUrl('workItems'));
  });

  // ───────────────────────────────────────────────────────────────────────────
  // O7 — resize across the container switch
  // ───────────────────────────────────────────────────────────────────────────

  test('O7: resizing across 768px keeps the input and the focused field', async ({ page }) => {
    test.skip(
      test.info().project.name !== 'desktop',
      'drives the viewport itself, so it runs on the desktop project only',
    );
    const createPage = new WorkItemCreatePage(page);
    await page.setViewportSize({ width: 1024, height: 800 });
    await createPage.goto();
    await expect(page.getByTestId('object-form-sheet')).toHaveCount(0);

    await createPage.titleInput.fill('Typed before the resize');
    await expect(createPage.titleInput).toBeFocused();

    // Below 768px the Modal becomes the full-screen sheet; values and focus carry over
    await page.setViewportSize({ width: 700, height: 800 });
    await expect(page.getByTestId('object-form-sheet')).toBeVisible();
    await createPage.form.settled();
    await expect(createPage.titleInput).toHaveValue('Typed before the resize');
    await expect(createPage.titleInput).toBeFocused();

    // And back
    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(page.getByTestId('object-form-sheet')).toHaveCount(0);
    await expect(createPage.titleInput).toHaveValue('Typed before the resize');
    await expect(createPage.titleInput).toBeFocused();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // O8 — dark mode and reduced motion
  // ───────────────────────────────────────────────────────────────────────────

  test('O8: dark mode and reduced motion render the dialog without sideways scroll', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    const createPage = new HouseholdItemCreatePage(page);
    await createPage.goto();
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    await expect(createPage.heading).toBeVisible();
    await expect(createPage.submitButton).toBeVisible();
    await expect(createPage.submitButton).toBeInViewport();
    expect(await noSidewaysScroll(page)).toBe(true);
  });
});
