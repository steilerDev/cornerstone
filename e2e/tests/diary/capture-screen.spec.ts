/**
 * E2E: the capture screen (#2221) - `/diary/new`, `/diary/:id/edit` (draft, saved, locked).
 * Replaces the type-card picker, `PhotoUpload` and the metadata modal.
 *
 * Scenarios (numbers follow the E2E spec; AC = story acceptance criterion)
 * 1.  AC1/AC13  Photo controls come first; no POST /api/diary-entries before the first photo or
 *               character; the first character creates exactly one draft, the URL becomes
 *               /diary/<id>/edit, the Title input keeps focus and the whole word arrives.
 * 2.  AC1       Library pick: tiles upload; a failing upload shows Failed + Retry and recovers;
 *               Remove takes a tile away and moves focus to the next tile.
 * 3.  AC2       Tags: chips tag every photo; a selection tags only the selected photos and clears;
 *               a photo tagged in its sheet keeps its area when the chip changes; New area opens
 *               the area form over the screen and selects the new chip; No orientation.
 * 3b. AC2       A chip tapped while an upload is in flight reaches the server (regression guard).
 * 4.  AC3       Photo sheet -> Annotate -> draw -> save marks the tile and stores annotatedAt.
 * 5.  AC4       h1 follows the date chips; back-dating is at most 2 taps; hint with photos; the
 *               draft PATCH carries entryDate; `?date=` pre-selects.
 * 6.  AC5       A title chip alone saves an entry with empty text; the entry page h1 is focused.
 * 7.  AC6       Company suggestions (title companies by count, then the floor company), none
 *               pressed, Other company opens the picker, Workers 4+ number input, Start/End and
 *               duration, End before Start error.
 * 8.  AC7       More details opens with 1 tap; weather and a signature; Saving locks the entry
 *               (entry page shows it signed, its edit URL shows the signed EmptyState).
 * 9.  AC8       Type chips + More menu; a fresh draft switches without a dialog; the confirm lists
 *               what is dropped, Keep editing keeps the type, Switch type drops the details.
 * 10. AC9       "Saved <time>" after typing; the sticky Save stays in view; Discard entry.
 * 11. AC10      Same title and date: lookup row; ignoring saves a second entry; "Add to that entry
 *               instead" moves photos and text and deletes the draft.
 * 12. AC12      Saved-entry edit: "Edit entry" h1, no type chips, Save changes; Cancel with
 *               changes asks "Discard changes?"; an automatic entry's edit URL is an EmptyState.
 * 13. Validation: site visit needs Inspector and Outcome; a defect needs Severity.
 * 14. Photo Remove on an uploaded tile shows Undo; Undo restores it on the server and in the UI.
 * 15. Routes: /diary/new, /diary/:id/edit as draft, saved, signed, automatic and unknown id.
 *
 * Synthetic data only; each test removes what it created.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import {
  createDiaryEntryViaApi,
  createDraftDiaryEntryViaApi,
  createVendorViaApi,
  createWorkItemViaApi,
  deleteVendorViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { capturePhotos } from '../../fixtures/capturePhotos.js';
import {
  CaptureSeed,
  currentUserId,
  entryStatus,
  findAreaId,
  getEntry,
  listEntryPhotos,
  seedRecentTags,
  todayIso,
  uniqueName,
} from '../../fixtures/captureSeed.js';
import { DiaryCapturePage } from '../../pages/DiaryCapturePage.js';

/** "New entry · Mon, Oct 19" for today plus `offsetDays`, formatted like the app (en-US). */
async function expectedHeading(page: Page, prefix: string, offsetDays: number): Promise<string> {
  return page.evaluate(
    ([lead, offset]) => {
      const now = new Date();
      const date = new Date();
      date.setDate(date.getDate() + (offset as number));
      const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
      const dayMonth = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
      });
      return `${lead} · ${weekday}, ${dayMonth}`;
    },
    [prefix, offsetDays] as const,
  );
}

async function seedChips(
  page: Page,
  recents: { areaIds?: string[]; orientationIds?: string[] },
): Promise<void> {
  await seedRecentTags(page, await currentUserId(page), recents);
}

async function seedSavedEntry(
  page: Page,
  seed: CaptureSeed,
  data: Partial<Parameters<typeof createDiaryEntryViaApi>[1]> & { title: string },
): Promise<string> {
  const id = await createDiaryEntryViaApi(page, {
    entryType: 'general_note',
    entryDate: todayIso(),
    body: 'Seeded',
    status: 'saved',
    ...data,
  });
  return seed.trackEntry(id);
}

test.describe('Capture screen', () => {
  test('1. no draft before the first photo or character; the first character keeps focus', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    const created: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/diary-entries') {
        created.push(request.url());
      }
    });
    try {
      const area = await seed.area('Kitchen');
      await seedChips(page, { areaIds: [area.id] });
      const capture = new DiaryCapturePage(page);
      await capture.goto();

      // Photo controls are the first controls after the ⋯ menu. A fine pointer with no camera
      // shows no Take photos button, so Choose from library is first.
      await expect(capture.takePhotosButton).toBeHidden();
      await capture.menuButton.focus();
      await page.keyboard.press('Tab');
      await expect(capture.chooseButton).toBeFocused();

      // Date, type and tag chips alone create nothing.
      await capture.tap(capture.dateChip('yesterday'));
      await capture.selectType('delivery');
      await capture.setArea(area.name);
      await expect(capture.areaChip(area.name)).toHaveAttribute('aria-pressed', 'true');
      await expect(capture.typeChip('delivery')).toHaveAttribute('aria-pressed', 'true');
      expect(created).toHaveLength(0);
      await expect(page).toHaveURL(/\/diary\/new$/);

      // The first character creates exactly one draft and the page does not remount.
      await capture.typeTitle('Tile');
      const id = await capture.waitForDraft();
      seed.trackEntry(id);
      await expect(capture.titleInput).toBeFocused();
      await expect(capture.titleInput).toHaveValue('Tile');
      expect(created).toHaveLength(1);
    } finally {
      await seed.cleanup();
    }
  });

  test('2. library photos upload; a failed upload offers Retry; Remove moves focus on', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    let failing = true;
    // A 400 is not retried automatically, so the tile settles on Failed at once.
    await page.route('**/api/photos', async (route) => {
      const request = route.request();
      if (
        request.method() === 'POST' &&
        failing &&
        request.postDataBuffer()?.includes('-up-2.png')
      ) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Rejected' } }),
        });
        return;
      }
      await route.continue();
    });
    try {
      const capture = new DiaryCapturePage(page);
      await capture.goto();
      await capture.chooseFromLibrary(capturePhotos(3, `${testPrefix}-up`));
      seed.trackEntry(await capture.waitForDraft());

      await expect(capture.tiles).toHaveCount(3);
      await expect(capture.tile(1)).toHaveAttribute('data-state', 'failed');
      await expect(capture.tile(0)).toHaveAttribute('data-state', 'uploaded');
      await expect(capture.tile(2)).toHaveAttribute('data-state', 'uploaded');
      await expect(capture.tileRetry(1)).toBeVisible();

      failing = false;
      await capture.tap(capture.tileRetry(1));
      await capture.waitForUploaded(3);

      // Remove tile 0: focus moves to the tile that takes its place.
      await capture.removeTile(0);
      await expect(capture.tiles).toHaveCount(2);
      await expect(capture.tileOpen(0)).toBeFocused();
    } finally {
      await seed.cleanup();
    }
  });

  test('3. chips tag photos; a selection tags only the selection; sheet tags are kept', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const areaA = await seed.area('Kitchen');
      const areaB = await seed.area('Bath');
      const areaD = await seed.area('Hall');
      const areaC = await seed.area('Garage');
      const orientation = await seed.orientation('North wall');
      await seedChips(page, {
        areaIds: [areaA.id, areaB.id, areaD.id],
        orientationIds: [orientation.id],
      });
      const capture = new DiaryCapturePage(page);
      await capture.goto();

      await capture.chooseFromLibrary(capturePhotos(3, `${testPrefix}-tag`));
      const id = await capture.waitForDraft();
      seed.trackEntry(id);
      await capture.waitForUploaded(3);
      const labelHas = (index: number, name: string) =>
        expect(capture.tileOpen(index)).toHaveAttribute('aria-label', new RegExp(name));

      // Chips after the pick tag every photo; a later chip re-tags photos that got theirs from one.
      await capture.setArea(areaA.name);
      await capture.setOrientation(orientation.name);
      for (let i = 0; i < 3; i++) {
        await expect(capture.tileOpen(i)).toHaveAttribute(
          'aria-label',
          new RegExp(`${areaA.name}.*${orientation.name}`),
        );
      }
      await capture.setArea(areaB.name);
      for (let i = 0; i < 3; i++) await labelHas(i, areaB.name);

      // A selection tags only the selected photo, then the selection clears.
      await capture.selectTile(1);
      await expect(capture.tagsApplyText).toHaveText('Tags apply to 1 selected photo');
      await capture.setArea(areaA.name);
      await labelHas(1, areaA.name);
      await labelHas(0, areaB.name);
      await labelHas(2, areaB.name);
      await expect(capture.tagsApplyText).toHaveText('Tags apply to new photos');
      await expect(capture.tileSelect(1)).not.toBeChecked();

      // A photo tagged in its own sheet keeps its area when a chip is tapped later.
      await capture.sheet.open(2);
      await capture.sheet.setArea(areaC.name);
      await capture.sheet.close();
      await labelHas(2, areaC.name);
      await capture.setArea(areaD.name);
      await labelHas(0, areaD.name);
      await labelHas(1, areaA.name);
      await labelHas(2, areaC.name);

      await expect
        .poll(async () => (await listEntryPhotos(page, id)).map((p) => p.areaId).sort())
        .toEqual([areaD.id, areaA.id, areaC.id].sort());

      // No orientation is its own pressed chip.
      await capture.tap(capture.noOrientationChip);
      await expect(capture.noOrientationChip).toHaveAttribute('aria-pressed', 'true');
      await expect(capture.orientationChip(orientation.name)).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    } finally {
      await seed.cleanup();
    }
  });

  test('3a. New area opens the area form over the screen and selects the new chip', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const existing = await seed.area('Hall');
      await seedChips(page, { areaIds: [existing.id] });
      const capture = new DiaryCapturePage(page);
      await capture.goto();

      const name = uniqueName(testPrefix, 'Attic');
      await capture.tap(capture.newAreaChip);
      await capture.newTagDialog.waitForOpen();
      // The capture screen stays behind the dialog.
      await expect(capture.heading).toBeVisible();
      await capture.newTagDialog.field('name').fill(name);
      await capture.newTagDialog.save();
      await capture.newTagDialog.waitForClosed();
      seed.trackArea(await findAreaId(page, name));

      await expect(capture.areaChip(name)).toHaveAttribute('aria-pressed', 'true');
      await expect(page).toHaveURL(/\/diary\/new$/);
    } finally {
      await seed.cleanup();
    }
  });

  test('3b. a chip tapped while photos upload still reaches the server', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    // Hold every upload for a moment so the chips are tapped while the requests are in flight.
    await page.route('**/api/photos', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    try {
      const area = await seed.area('Cellar');
      const orientation = await seed.orientation('West wall');
      await seedChips(page, { areaIds: [area.id], orientationIds: [orientation.id] });
      const capture = new DiaryCapturePage(page);
      await capture.goto();

      await capture.chooseFromLibrary(capturePhotos(2, `${testPrefix}-race`));
      const id = await capture.waitForDraft();
      seed.trackEntry(id);
      await expect(capture.tiles).toHaveCount(2);
      await capture.setArea(area.name);
      await capture.setOrientation(orientation.name);
      await capture.waitForUploaded(2);

      await expect
        .poll(async () =>
          (await listEntryPhotos(page, id)).map((p) => [p.areaId, p.orientationId].join('|')),
        )
        .toEqual([`${area.id}|${orientation.id}`, `${area.id}|${orientation.id}`]);
    } finally {
      await seed.cleanup();
    }
  });

  test('4. a photo can be annotated from its sheet', async ({ page, testPrefix }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const capture = new DiaryCapturePage(page);
      await capture.goto();
      await capture.chooseFromLibrary(capturePhotos(1, `${testPrefix}-ann`));
      const id = await capture.waitForDraft();
      seed.trackEntry(id);
      await capture.waitForUploaded(1);

      await capture.sheet.open(0);
      await expect(capture.sheet.annotate).not.toHaveAttribute('aria-disabled', 'true');
      await capture.tap(capture.sheet.annotate);
      await expect(capture.annotator.dialog).toBeVisible();
      await capture.annotator.draw();

      await capture.sheet.close();
      await expect(capture.tileOpen(0)).toHaveAttribute('aria-label', /annotated/);
      await expect
        .poll(async () => (await listEntryPhotos(page, id))[0]?.annotatedAt ?? null)
        .not.toBeNull();
    } finally {
      await seed.cleanup();
    }
  });

  test('5. the heading follows the date chips; back-dating takes at most 2 taps', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const capture = new DiaryCapturePage(page);
      await capture.goto();
      await expect(capture.heading).toHaveText(await expectedHeading(page, 'New entry', 0));
      await expect(capture.dateChip('today')).toHaveAttribute('aria-pressed', 'true');

      await capture.tap(capture.dateChip('yesterday'));
      await expect(capture.heading).toHaveText(await expectedHeading(page, 'New entry', -1));
      await expect(capture.dateChip('yesterday')).toHaveAttribute('aria-pressed', 'true');

      // Back-dating to any earlier day: Pick chip + the date input.
      capture.resetTaps();
      await capture.pickDate(todayIso(-6));
      expect(capture.taps).toBeLessThanOrEqual(2);
      await expect(capture.heading).toHaveText(await expectedHeading(page, 'New entry', -6));

      // With photos the hint appears; on a draft the date goes to the server.
      await capture.tap(capture.dateChip('today'));
      await capture.chooseFromLibrary(capturePhotos(1, `${testPrefix}-date`));
      const id = await capture.waitForDraft();
      seed.trackEntry(id);
      await expect(capture.dateHint).toBeVisible();
      const target = todayIso(-1);
      const patched = page.waitForRequest(
        (request) =>
          request.method() === 'PATCH' &&
          request.url().includes(`/api/diary-entries/${id}`) &&
          (request.postDataJSON() as { entryDate?: string } | null)?.entryDate === target,
      );
      await capture.tap(capture.dateChip('yesterday'));
      await patched;

      // ?date= pre-selects the day.
      await capture.goto({ date: todayIso(-3) });
      await expect(capture.heading).toHaveText(await expectedHeading(page, 'New entry', -3));
    } finally {
      await seed.cleanup();
    }
  });

  test('6. a title chip alone saves the entry with empty text', async ({ page, testPrefix }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const title = uniqueName(testPrefix, 'Screed');
      await seedSavedEntry(page, seed, { title });
      const capture = new DiaryCapturePage(page);
      await capture.goto();
      await capture.setTitleChip(title);
      await capture.saveEntry();
      const id = capture.entryIdFromUrl();
      seed.trackEntry(id);

      await expect(capture.heading).toBeFocused();
      await expect(capture.heading).toContainText(title);
      const entry = await getEntry(page, id);
      expect(entry.status).toBe('saved');
      expect(entry.title).toBe(title);
      expect(entry.body).toBe('');
    } finally {
      await seed.cleanup();
    }
  });

  test('7. daily log suggestions, workers, and the start and end times', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    const vendors: string[] = [];
    let workItemId: string | null = null;
    try {
      const floor = await seed.area('Ground floor');
      await seedChips(page, { areaIds: [floor.id] });
      const names = {
        v1: uniqueName(testPrefix, 'Alpha Tiling'),
        v2: uniqueName(testPrefix, 'Beta Plaster'),
        v3: uniqueName(testPrefix, 'Gamma Floors'),
      };
      const v1 = await createVendorViaApi(page, { name: names.v1 });
      const v2 = await createVendorViaApi(page, { name: names.v2 });
      const v3 = await createVendorViaApi(page, { name: names.v3 });
      vendors.push(v1, v2, v3);
      const title = uniqueName(testPrefix, 'Wall prep');
      for (const vendorId of [v1, v1, v2]) {
        await seedSavedEntry(page, seed, {
          entryType: 'daily_log',
          title,
          metadata: { vendorId },
        });
      }
      workItemId = await createWorkItemViaApi(page, {
        title: uniqueName(testPrefix, 'Floor task'),
        areaId: floor.id,
        assignedVendorId: v3,
      });

      const capture = new DiaryCapturePage(page);
      await capture.goto();
      await capture.selectType('daily_log');
      await capture.setTitleChip(title);
      await capture.setArea(floor.name);

      // Title companies by count, then the floor company; none is pressed.
      const group = page.getByTestId('capture-company');
      const buttons = group.getByRole('button');
      await expect(buttons).toHaveCount(4);
      await expect(buttons.nth(0)).toHaveText(names.v1);
      await expect(buttons.nth(1)).toHaveText(names.v2);
      await expect(buttons.nth(2)).toHaveText(names.v3);
      for (let i = 0; i < 3; i++)
        await expect(buttons.nth(i)).toHaveAttribute('aria-pressed', 'false');
      await capture.tap(capture.otherCompanyChip);
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);

      // Workers: 4+ reveals the number input.
      await expect(capture.workersExact).toHaveCount(0);
      await capture.tap(capture.workersChip('4+'));
      await expect(capture.workersExact).toBeVisible();

      // Start Now stores the current time; End after Start shows the duration, before it an error.
      await capture.tap(capture.startNow);
      await capture.tap(capture.startOther);
      await capture.startInput.fill('08:00');
      await capture.tap(capture.endChip('Other time'));
      await capture.endInput.fill('16:30');
      await expect(capture.duration).toContainText('Duration:');
      await capture.endInput.fill('07:00');
      await expect(page.getByText('End must be after start.')).toBeVisible();
      await expect(capture.duration).toHaveCount(0);

      seed.trackEntry(await capture.waitForDraft());
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      await seed.cleanup();
      for (const id of vendors) await deleteVendorViaApi(page, id).catch(() => {});
    }
  });

  test('8. More details, a signature and the lock after saving', async ({ page, testPrefix }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const capture = new DiaryCapturePage(page);
      await capture.goto();
      await capture.selectType('daily_log');
      await capture.typeTitle(uniqueName(testPrefix, 'Signed day'));
      seed.trackEntry(await capture.waitForDraft());

      capture.resetTaps();
      await capture.openMoreDetails();
      expect(capture.taps).toBe(1);
      await capture.tap(capture.weatherChip('sunny'));
      await expect(capture.weatherChip('sunny')).toHaveAttribute('aria-pressed', 'true');

      await capture.tap(capture.addSignatureButton);
      await capture.drawSignature();
      await expect(capture.signedNote).toBeVisible();

      await capture.saveEntry();
      const id = capture.entryIdFromUrl();
      const entry = await getEntry(page, id);
      expect(entry.status).toBe('saved');
      expect((entry.metadata?.signatures as unknown[] | undefined)?.length).toBe(1);

      // A signed entry is locked: its edit URL shows the EmptyState instead of the form.
      await capture.gotoLocked(id);
      await expect(capture.lockedMessage).toContainText(
        "This entry is signed and can't be changed.",
      );
      await expect(capture.saveButton).toHaveCount(0);
    } finally {
      await seed.cleanup();
    }
  });

  test('9. switching the entry type asks only when details would be dropped', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const capture = new DiaryCapturePage(page);
      await capture.goto();
      await capture.typeTitle(uniqueName(testPrefix, 'Type switch'));
      const id = await capture.waitForDraft();
      seed.trackEntry(id);

      // Nothing set: no dialog.
      await capture.selectType('site_visit');
      await expect(capture.typeChip('site_visit')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      await capture.selectType('issue');
      await expect(capture.moreTypeTrigger).toHaveAttribute('data-current', 'true');
      await capture.selectType('daily_log');
      await expect(capture.typeChip('daily_log')).toHaveAttribute('aria-pressed', 'true');

      // Workers and a signature would be dropped by Delivery.
      await capture.tap(capture.workersChip('2'));
      await capture.openMoreDetails();
      await capture.tap(capture.addSignatureButton);
      await capture.drawSignature();

      await capture.tap(capture.typeChip('delivery'));
      await capture.switchDialog.waitForOpen();
      await expect(capture.switchDialog.dialog).toContainText('Switch to Delivery?');
      await expect(capture.switchDialog.dialog).toContainText('Workers');
      await expect(capture.switchDialog.dialog).toContainText('Signatures (1)');

      // Keep editing: the type stays and focus returns to the pressed chip.
      await capture.switchDialog.cancel();
      await expect(capture.typeChip('daily_log')).toHaveAttribute('aria-pressed', 'true');
      await expect(capture.typeChip('daily_log')).toBeFocused();

      // Switch type: the draft is patched and the details are gone.
      await capture.tap(capture.typeChip('delivery'));
      await capture.switchDialog.waitForOpen();
      const patched = page.waitForRequest(
        (request) =>
          request.method() === 'PATCH' &&
          request.url().includes(`/api/diary-entries/${id}`) &&
          (request.postDataJSON() as { entryType?: string } | null)?.entryType === 'delivery',
      );
      await capture.switchDialog.confirmAndWaitClosed();
      await patched;
      await expect(capture.typeChip('delivery')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('capture-workers')).toHaveCount(0);
      expect((await getEntry(page, id)).entryType).toBe('delivery');
    } finally {
      await seed.cleanup();
    }
  });

  test('10. autosave status, a sticky Save and Discard entry', async ({ page, testPrefix }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const capture = new DiaryCapturePage(page);
      await capture.goto();
      await capture.typeText('Notes on the east wall.\n'.repeat(40));
      const id = await capture.waitForDraft();
      seed.trackEntry(id);
      await expect(capture.savedText).toBeVisible();

      await capture.chooseFromLibrary(capturePhotos(1, `${testPrefix}-disc`));
      await capture.waitForUploaded(1);

      // The Save button stays in view while the page scrolls.
      await page.mouse.wheel(0, 3000);
      await expect(capture.saveButton).toBeInViewport();

      await capture.tap(capture.menuButton);
      await capture.tap(capture.discardItem);
      await capture.discardDialog.waitForOpen();
      await expect(capture.discardDialog.dialog).toContainText('Discard this entry?');
      await expect(capture.discardDialog.dialog).toContainText('Its 1 photo is deleted too.');
      await capture.discardDialog.confirm();
      await expect(page).toHaveURL(/\/diary$/);
      await expect.poll(() => entryStatus(page, id)).toBe(404);
    } finally {
      await seed.cleanup();
    }
  });

  test('11. same title and day: lookup, a second entry, and Add to that entry instead', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const title = uniqueName(testPrefix, 'Tiling west wall');
      const first = await seedSavedEntry(page, seed, { title, body: 'First' });
      const capture = new DiaryCapturePage(page);

      // A new capture is empty, even right after saving an entry.
      await capture.goto();
      await expect(capture.titleInput).toHaveValue('');
      await expect(capture.tiles).toHaveCount(0);

      // Typing the same title shows the lookup; "Add to that entry instead" moves everything.
      await capture.chooseFromLibrary(capturePhotos(1, `${testPrefix}-move`));
      const draftId = await capture.waitForDraft();
      seed.trackEntry(draftId);
      await capture.waitForUploaded(1);
      await capture.typeTitle(title);
      await capture.typeText('Moved text');
      await expect(capture.lookupRows).toHaveCount(1);
      await expect(capture.lookupRows).toContainText('You already have an entry called');
      await capture.tap(capture.addToThatButton);
      await expect(page).toHaveURL(new RegExp(`/diary/${first}$`));
      await expect.poll(async () => (await listEntryPhotos(page, first)).length).toBe(1);
      expect((await getEntry(page, first)).body).toContain('Moved text');
      await expect.poll(() => entryStatus(page, draftId)).toBe(404);

      // Ignoring the lookup saves a second entry (no extra tap).
      await capture.goto();
      await capture.typeTitle(title);
      seed.trackEntry(await capture.waitForDraft());
      await expect(capture.lookupRows).toHaveCount(1);
      await capture.saveEntry();
      const second = capture.entryIdFromUrl();
      seed.trackEntry(second);
      expect(second).not.toBe(first);
      expect((await getEntry(page, second)).status).toBe('saved');
      expect((await getEntry(page, first)).status).toBe('saved');
    } finally {
      await seed.cleanup();
    }
  });

  test('12. editing a saved entry: Save changes, Discard changes? and the automatic lock', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const title = uniqueName(testPrefix, 'Saved entry');
      const id = await seedSavedEntry(page, seed, { title, entryDate: todayIso(-2) });
      const capture = new DiaryCapturePage(page);
      await capture.gotoEdit(id);

      await expect(capture.heading).toHaveText(await expectedHeading(page, 'Edit entry', -2));
      // The type is a badge, not chips; no Save entry, only Save changes and Cancel.
      await expect(page.getByTestId('capture-entry-type')).toHaveCount(0);
      await expect(capture.typeChip('daily_log')).toHaveCount(0);
      await expect(capture.saveButton).toHaveText('Save changes');
      await expect(capture.titleInput).toHaveValue(title);

      // Cancel without changes leaves at once; with changes it asks first.
      await capture.titleInput.fill(`${title} edited`);
      await capture.tap(capture.cancelButton);
      await capture.cancelDialog.waitForOpen();
      await expect(capture.cancelDialog.dialog).toContainText('Discard changes?');
      await capture.cancelDialog.cancel();
      await expect(capture.titleInput).toHaveValue(`${title} edited`);

      await capture.saveChanges();
      await expect(page).toHaveURL(new RegExp(`/diary/${id}$`));
      await expect.poll(async () => (await getEntry(page, id)).title).toBe(`${title} edited`);

      await capture.gotoEdit(id);
      await capture.titleInput.fill('Throwaway');
      await capture.tap(capture.cancelButton);
      await capture.cancelDialog.waitForOpen();
      await capture.cancelDialog.confirm();
      await expect(page).toHaveURL(new RegExp(`/diary/${id}$`));
      expect((await getEntry(page, id)).title).toBe(`${title} edited`);

      // An automatic entry cannot be edited: its edit URL is an EmptyState.
      await page.route(`**/api/diary-entries/${id}`, async (route) => {
        if (route.request().method() !== 'GET') {
          await route.continue();
          return;
        }
        const response = await route.fetch();
        const entry = (await response.json()) as Record<string, unknown>;
        await route.fulfill({ response, json: { ...entry, isAutomatic: true } });
      });
      await capture.gotoLocked(id);
      await expect(capture.lockedMessage).toContainText("Automatic entries can't be changed.");
    } finally {
      await seed.cleanup();
    }
  });

  test('13. a site visit needs Inspector and Outcome; a defect needs Severity', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const capture = new DiaryCapturePage(page);
      await capture.goto();
      await capture.selectType('site_visit');
      await capture.typeTitle(uniqueName(testPrefix, 'Inspection'));
      seed.trackEntry(await capture.waitForDraft());

      await capture.tap(capture.saveButton);
      await expect(page.getByText('Enter the inspector.')).toBeVisible();
      await expect(page.getByText('Choose an outcome.')).toBeVisible();
      await expect(capture.inspectorInput).toBeFocused();
      await expect(capture.statusRegion).toHaveText('2 things to fix.');
      await expect(page).toHaveURL(/\/diary\/[^/]+\/edit$/);

      await capture.selectType('issue');
      await capture.tap(capture.saveButton);
      await expect(page.getByText('Choose a severity.')).toBeVisible();
      await capture.tap(capture.severityChip('high'));
      await expect(capture.severityChip('high')).toHaveAttribute('aria-pressed', 'true');
    } finally {
      await seed.cleanup();
    }
  });

  test('14. removing an uploaded photo can be undone, on the server and in the strip', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const capture = new DiaryCapturePage(page);
      await capture.goto();
      await capture.chooseFromLibrary(capturePhotos(2, `${testPrefix}-undo`));
      const id = await capture.waitForDraft();
      seed.trackEntry(id);
      await capture.waitForUploaded(2);

      await capture.removeTile(0);
      await expect(capture.tiles).toHaveCount(1);
      await expect(capture.toasts.undoToastWith('Photo removed.')).toBeVisible();
      await expect.poll(async () => (await listEntryPhotos(page, id)).length).toBe(1);

      await capture.toasts.undoViaButton();
      await expect(capture.tiles).toHaveCount(2);
      await expect.poll(async () => (await listEntryPhotos(page, id)).length).toBe(2);
    } finally {
      await seed.cleanup();
    }
  });

  test('15. every state of the capture routes renders', async ({ page, testPrefix }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const capture = new DiaryCapturePage(page);

      // /diary/new
      await capture.goto();
      await expect(capture.heading).toHaveText(await expectedHeading(page, 'New entry', 0));
      await expect(capture.saveButton).toHaveText('Save entry');

      // /diary/:id/edit as a draft
      const draftId = seed.trackEntry(
        await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' }),
      );
      await capture.gotoEdit(draftId);
      await expect(capture.heading).toContainText('New entry · ');
      await expect(capture.saveButton).toHaveText('Save entry');

      // Unknown id
      await capture.gotoLocked('00000000-0000-4000-8000-000000000000');
      await expect(capture.lockedMessage).toContainText("This entry doesn't exist.");
    } finally {
      await seed.cleanup();
    }
  });
});
