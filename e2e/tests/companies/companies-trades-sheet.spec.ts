/**
 * E2E tests for the Trades sheet on the Companies page (#2213, AC6, AC7).
 *
 * The sheet lives at `/companies?trades=1`: a dialog from 768px, a bottom sheet below. It adds,
 * renames, merges and deletes trades; a trade that companies use cannot be deleted ("Merge
 * instead").
 *
 * T1  Open and close: Trades button, Escape, Done, browser Back; initial focus and focus return
 * T2  Deep link, and Done leaves `/companies`
 * T3  Exact sizes per viewport: T3a dialog width and sheet anchoring, T3b 44px targets and 16px input
 * T4  Add: appears with "No companies"; empty and duplicate names are field errors
 * T5  Rename: list and chips update; unchanged = no request; Escape cancels only the rename
 * T6  Rename of a built-in trade in the German UI shows the typed name (desktop only, destructive)
 * T7  Delete: unused trade goes; a used trade is blocked with "Merge instead"; a 409 race
 * T8  Merge (AC7): counts, disabled action, every moved company, focus, chip fallback
 * T9  Dark mode
 *
 * Trades are global, so every trade here is created through the API with a unique name and
 * removed in `finally` (its companies first).
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { openAsLocaleUser } from '../../fixtures/localeUser.js';
import type { LocaleSession } from '../../fixtures/localeUser.js';
import { API } from '../../fixtures/testData.js';
import { TradesSheet } from '../../pages/TradesSheet.js';
import { VendorsPage } from '../../pages/VendorsPage.js';
import { routeUrl } from '../../../shared/src/routes/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function createTrade(page: Page, name: string): Promise<string> {
  const response = await page.request.post(API.trades, { data: { name } });
  expect(response.ok(), `POST trade "${name}": ${response.status()}`).toBeTruthy();
  return ((await response.json()) as { trade: { id: string } }).trade.id;
}

async function createCompany(page: Page, name: string, tradeId: string): Promise<string> {
  const response = await page.request.post(API.vendors, { data: { name, tradeId } });
  expect(response.ok(), `POST company "${name}": ${response.status()}`).toBeTruthy();
  return ((await response.json()) as { vendor: { id: string } }).vendor.id;
}

/** Remove companies, then trades (a used trade cannot be deleted). */
async function cleanup(page: Page, companyIds: string[], tradeIds: string[]): Promise<void> {
  for (const id of companyIds) await page.request.delete(`${API.vendors}/${id}`);
  for (const id of tradeIds) await page.request.delete(`${API.trades}/${id}`);
}

function tradesUrl(): string {
  return routeUrl('companies', undefined, { trades: 1 });
}

const hasTradesParam = (url: URL): boolean => url.searchParams.get('trades') === '1';

// ─────────────────────────────────────────────────────────────────────────────
// T1 / T2 - open, close, focus
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Trades sheet - open and close (AC6)', { tag: '@responsive' }, () => {
  test('T1: ⋯ › Trades opens it with focus in the New trade field; Escape, Done and Back close it', async ({
    page,
  }) => {
    const list = new VendorsPage(page);
    const sheet = list.tradesSheet;
    await list.goto();

    // Open: the URL gains ?trades=1 and the New trade field has focus
    await list.openTrades();
    await expect(page).toHaveURL(hasTradesParam);
    await expect(sheet.newInput).toBeFocused();

    // Escape closes it and focus returns to the page ⋯ menu (AC5)
    await page.keyboard.press('Escape');
    await sheet.waitForClosed();
    await expect(page).toHaveURL((url) => !url.searchParams.has('trades'));
    await expect(list.pageMenuButton).toBeFocused();

    // Done does the same
    await list.openTrades();
    await sheet.doneButton.click();
    await sheet.waitForClosed();
    await expect(page).toHaveURL((url) => !url.searchParams.has('trades'));
    await expect(list.pageMenuButton).toBeFocused();

    // Browser Back closes it too, and focus never falls to the body
    await list.openTrades();
    await page.goBack();
    await sheet.waitForClosed();
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('companies'));
    await expect(page.locator('body')).not.toBeFocused();
    // The list behind it kept its state: no phantom filter from the trades parameter
    await expect(list.searchInput).toHaveValue('');
  });

  test('T2: a deep link opens the sheet and Done leaves /companies', async ({ page }) => {
    const list = new VendorsPage(page);
    await page.goto(tradesUrl());
    await list.tradesSheet.waitForOpen();
    await expect(list.tradesSheet.newInput).toBeFocused();

    await list.tradesSheet.doneButton.click();
    await list.tradesSheet.waitForClosed();
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('companies'));
    await expect(page).toHaveURL((url) => !url.searchParams.has('trades'));
    await expect(page.locator('body')).not.toBeFocused();
    await expect(list.heading).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T3 - exact sizes
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Trades sheet - layout (AC6)', { tag: '@responsive' }, () => {
  test('T3a: a dialog min(32rem, 100vw - 2rem) wide from 768px, a bottom sheet below', async ({
    page,
    testPrefix,
  }) => {
    const list = new VendorsPage(page);
    const sheet = list.tradesSheet;
    const name = `${testPrefix} Layout Trade 2213`;
    const tradeId = await createTrade(page, name);
    try {
      const sizes = (await page.viewportSize())!.width >= 1920 ? [1440, 1024] : [null];
      for (const size of sizes) {
        if (size !== null) await page.setViewportSize({ width: size, height: 900 });
        await page.goto(tradesUrl());
        await sheet.waitForOpen();
        await expect(sheet.row(name)).toBeVisible();

        const viewport = page.viewportSize()!;
        const box = await sheet.panelBox();
        if (viewport.width >= 768) {
          // A dialog: min(32rem, 100vw - 2rem) wide, centred
          expect(Math.round(box.width), `dialog width at ${viewport.width}px`).toBe(
            Math.min(512, viewport.width - 32),
          );
          expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
        } else {
          // A bottom sheet: the full width, anchored to the bottom edge
          expect(Math.round(box.width)).toBe(viewport.width);
          expect(Math.round(box.x)).toBe(0);
          expect(Math.round(box.y + box.height)).toBe(viewport.height);
        }
      }
    } finally {
      await cleanup(page, [], [tradeId]);
    }
  });

  test('T3b: rows and touch targets are at least 44px at 1023px and below; the input reads 16px', async ({
    page,
    testPrefix,
  }) => {
    const list = new VendorsPage(page);
    const sheet = list.tradesSheet;
    const name = `${testPrefix} Targets Trade 2213`;
    const tradeId = await createTrade(page, name);
    try {
      await page.goto(tradesUrl());
      await sheet.waitForOpen();
      await expect(sheet.row(name)).toBeVisible();

      // Rows are at least 44px high
      const row = (await sheet.row(name).boundingBox())!;
      expect(row.height).toBeGreaterThanOrEqual(44);

      // The input reads 16px (no zoom on focus)
      await expect(sheet.newInput).toHaveCSS('font-size', '16px');

      // The row menu trigger, Add and Done are at least 44px at 1023px and below
      if (page.viewportSize()!.width <= 1023) {
        for (const [label, control] of [
          ['row ⋯ trigger', sheet.rowActions(name)],
          ['Add', sheet.addButton],
          ['Done', sheet.doneButton],
        ] as const) {
          const target = (await control.boundingBox())!;
          expect(target.height, `${label} height`).toBeGreaterThanOrEqual(44);
          expect(target.width, `${label} width`).toBeGreaterThanOrEqual(44);
        }
      }
    } finally {
      await cleanup(page, [], [tradeId]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T4 - add
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Trades sheet - add (AC6)', { tag: '@responsive' }, () => {
  test('T4: Add puts the trade in the list with "No companies"; empty and duplicate names are field errors', async ({
    page,
    testPrefix,
  }) => {
    const list = new VendorsPage(page);
    const sheet = list.tradesSheet;
    const name = `${testPrefix} Added Trade 2213`;
    let tradeId: string | null = null;
    try {
      await page.goto(tradesUrl());
      await sheet.waitForOpen();

      // Empty: a field error, focus stays in the field
      await sheet.addButton.click();
      await expect(sheet.dialog.getByText('Enter a name.')).toBeVisible();
      await expect(sheet.newInput).toBeFocused();
      await expect(sheet.newInput).toHaveAttribute('aria-invalid', 'true');

      // Enter adds
      await sheet.newInput.fill(name);
      const created = page.waitForResponse(
        (r) => r.url().endsWith(API.trades) && r.request().method() === 'POST',
      );
      await sheet.newInput.press('Enter');
      tradeId = ((await (await created).json()) as { trade: { id: string } }).trade.id;

      await expect(sheet.row(name)).toBeVisible();
      await expect(sheet.row(name)).toContainText('No companies');
      await expect(sheet.newInput).toHaveValue('');
      await expect(sheet.newInput).toBeFocused();
      await expect(sheet.dialog.getByRole('status').first()).toContainText(`${name} added`);

      // A trade without a company has no chip (#2246 D8: chips are the trades in use)
      await expect(page.getByTestId(`companies-chip-${tradeId}`)).toHaveCount(0);

      // A duplicate name is a field error and keeps focus
      await sheet.addTrade(name);
      await expect(sheet.dialog.getByText('A trade with this name exists already.')).toBeVisible();
      await expect(sheet.newInput).toHaveAttribute('aria-invalid', 'true');
      await expect(sheet.newInput).toBeFocused();
    } finally {
      await cleanup(page, [], tradeId ? [tradeId] : []);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T5 - rename
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Trades sheet - rename (AC6)', { tag: '@responsive' }, () => {
  test('T5: Rename updates the list and the chips; an unchanged name sends nothing; Escape cancels only the rename', async ({
    page,
    testPrefix,
  }) => {
    const list = new VendorsPage(page);
    const sheet = list.tradesSheet;
    const original = `${testPrefix} Rename Me 2213`;
    const renamed = `${testPrefix} Renamed 2213`;
    const tradeId = await createTrade(page, original);
    const patches: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'PATCH' && request.url().includes(`${API.trades}/`)) {
        patches.push(request.url());
      }
    });
    try {
      // The selected trade always has a chip, even without a company
      await page.goto(`${tradesUrl()}&tradeId=${tradeId}`);
      await sheet.waitForOpen();
      await expect(page.getByTestId(`companies-chip-${tradeId}`)).toContainText(original);

      // Open the rename: prefilled with the current name and selected; no built-in hint here
      await sheet.chooseAction(original, 'Rename');
      await expect(sheet.renameInput).toBeFocused();
      await expect(sheet.renameInput).toHaveValue(original);
      await expect(
        sheet.dialog.getByText('Renaming replaces the built-in translation.'),
      ).toHaveCount(0);

      // Escape cancels only the rename: the sheet stays, focus returns to the row's ⋯
      await page.keyboard.press('Escape');
      await expect(sheet.renameInput).toHaveCount(0);
      await expect(sheet.dialog).toBeVisible();
      await expect(sheet.rowActions(original)).toBeFocused();

      // Unchanged: Save closes the editor without a request
      await sheet.chooseAction(original, 'Rename');
      await sheet.renameSave.click();
      await expect(sheet.renameInput).toHaveCount(0);
      await expect(sheet.rowActions(original)).toBeFocused();
      expect(patches).toEqual([]);

      // Empty: field error, editor stays
      await sheet.chooseAction(original, 'Rename');
      await sheet.renameInput.fill('');
      await sheet.renameSave.click();
      await expect(sheet.dialog.getByText('Enter a name.')).toBeVisible();
      await expect(sheet.renameInput).toBeVisible();

      // A real rename: Enter saves; the list and the chip behind the sheet show the new name
      await sheet.renameInput.fill(renamed);
      await sheet.renameInput.press('Enter');
      await expect(sheet.renameInput).toHaveCount(0);
      await expect(sheet.row(renamed)).toBeVisible();
      await expect(sheet.row(original)).toHaveCount(0);
      await expect(sheet.rowActions(renamed)).toBeFocused();
      await expect(page.getByTestId(`companies-chip-${tradeId}`)).toContainText(renamed);
      await expect(sheet.dialog.getByRole('status').first()).toContainText(`${renamed} renamed`);
      expect(patches).toHaveLength(1);
    } finally {
      await cleanup(page, [], [tradeId]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T6 - built-in trade rename in German (destructive: clears a translation key)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Trades sheet - built-in trades (AC6, PLT-101)', () => {
  test('T6: renaming a built-in trade in the German UI shows the typed name afterwards', async ({
    browser,
    page,
    testPrefix,
  }) => {
    test.slow();
    const viewport = page.viewportSize();
    test.skip(viewport !== null && viewport.width < 1200, 'German locale runs on desktop only');
    // "Excavation" (Erdarbeiten): no other spec reads it. Renaming clears its translation key for
    // good, so the test puts the English name back and tolerates a trade that is already cleared
    // (a retry, or a second run against the same database).
    const tradeId = 'trade-excavation';
    const typed = `Aushub ${testPrefix}`;
    const before = await page.request.get(API.trades);
    const trades = (
      (await before.json()) as {
        trades: Array<{ id: string; name: string; translationKey: string | null }>;
      }
    ).trades;
    const builtIn = trades.find((t) => t.id === tradeId)!;
    const hasTranslation = builtIn.translationKey !== null;

    let session: LocaleSession | null = null;
    try {
      session = await openAsLocaleUser(
        browser,
        page,
        testPrefix,
        `${tradesUrl()}&tradeId=${tradeId}`,
      );
      const de = session.page;
      const sheet = new TradesSheet(de, 'Gewerke');
      await sheet.waitForOpen();
      const heading = sheet.dialog;

      const shownName = hasTranslation ? 'Erdarbeiten' : builtIn.name;
      await expect(heading.getByText(shownName, { exact: true })).toBeVisible();

      // German controls
      await heading.getByRole('button', { name: `Aktionen für ${shownName}` }).click();
      await de.getByRole('menuitem', { name: 'Umbenennen', exact: true }).click();
      if (hasTranslation) {
        await expect(
          heading.getByText('Beim Umbenennen wird die eingebaute Übersetzung ersetzt.'),
        ).toBeVisible();
      }
      const input = heading.getByTestId('trades-manager-rename-input');
      await expect(input).toHaveValue(shownName);
      await input.fill(typed);
      await input.press('Enter');

      // The typed name shows, in German, instead of the translation
      await expect(heading.getByText(typed, { exact: true })).toBeVisible();
      await expect(heading.getByText('Erdarbeiten', { exact: true })).toHaveCount(0);
      await expect(de.getByTestId(`companies-chip-${tradeId}`)).toContainText(typed);
    } finally {
      if (session) await session.dispose();
      // Restore the English name (the translation key stays cleared; that is the feature)
      await page.request.patch(`${API.trades}/${tradeId}`, { data: { name: builtIn.name } });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T7 - delete
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Trades sheet - delete (AC6)', { tag: '@responsive' }, () => {
  test('T7: an unused trade is deleted after confirming, with focus on a named element', async ({
    page,
    testPrefix,
  }) => {
    const list = new VendorsPage(page);
    const sheet = list.tradesSheet;
    // The list is global and sorted A-Z, and focus goes to the deleted row's neighbour. Other workers
    // create and delete trades all the time, so a neighbour of theirs can vanish under the focus.
    // A name that sorts after every other trade (and later than any T7 created earlier) keeps the
    // neighbour a stable row or the New trade field.
    const name = `zzzz ${Date.now()} ${testPrefix} Delete Unused 2213`;
    const tradeId = await createTrade(page, name);
    try {
      await page.goto(tradesUrl());
      await sheet.waitForOpen();
      await expect(sheet.row(name)).toContainText('No companies');

      await sheet.chooseAction(name, 'Delete');
      await expect(sheet.deleteDialog.dialog).toBeVisible();
      await expect(sheet.deleteDialog.dialog).toContainText(`Delete ${name}?`);
      await expect(sheet.deleteDialog.dialog).toContainText("This can't be undone.");
      await expect(sheet.deleteDialog.cancelButton).toBeFocused();

      // Cancel keeps the trade and returns focus to its ⋯
      await sheet.deleteDialog.cancel();
      await expect(sheet.row(name)).toBeVisible();
      await expect(sheet.rowActions(name)).toBeFocused();

      // Confirm removes it from the list and from the chips
      await sheet.chooseAction(name, 'Delete');
      await sheet.deleteDialog.confirmAndWaitClosed();
      await expect(sheet.row(name)).toHaveCount(0);
      await expect(page.getByTestId(`companies-chip-${tradeId}`)).toHaveCount(0);
      // Focus went to a neighbouring row's ⋯ or the New trade field, never the body
      await expect
        .poll(() =>
          page.evaluate(() => {
            const el = document.activeElement;
            return (
              el?.getAttribute('data-testid') ?? `<${el?.tagName.toLowerCase()}> ${el?.className}`
            );
          }),
        )
        .toMatch(/^trades-manager-(actions-.+|new-input)$/);
    } finally {
      await cleanup(page, [], [tradeId]);
    }
  });

  test('T7b: a trade that companies use is blocked and offers "Merge instead"', async ({
    page,
    testPrefix,
  }) => {
    const list = new VendorsPage(page);
    const sheet = list.tradesSheet;
    const used = `${testPrefix} Delete Used 2213`;
    const other = `${testPrefix} Delete Keep 2213`;
    const usedId = await createTrade(page, used);
    const otherId = await createTrade(page, other);
    const companyId = await createCompany(page, `${testPrefix} Uses Trade 2213`, usedId);
    try {
      await page.goto(tradesUrl());
      await sheet.waitForOpen();
      await expect(sheet.row(used)).toContainText('1 company');

      await sheet.chooseAction(used, 'Delete');
      await expect(sheet.deleteDialog.dialog).toContainText(
        '1 company still uses this trade. Merge it into another trade instead, or change that company first.',
      );
      // Blocked: there is no Delete action, only Merge instead (and Cancel)
      await expect(sheet.deleteDialog.confirmButton).toHaveCount(0);
      await expect(sheet.mergeInsteadButton).toBeVisible();

      // "Merge instead" swaps to the Merge dialog for the same trade
      await sheet.mergeInsteadButton.click();
      await expect(sheet.deleteDialog.dialog).toHaveCount(0);
      await expect(sheet.mergeDialog.dialog).toContainText(`Merge ${used} into another trade?`);
      await expect(sheet.mergeDialog.confirmButton).toHaveAttribute('aria-disabled', 'true');
      await sheet.mergeDialog.cancel();
      // The trade is untouched and focus returns to its ⋯
      await expect(sheet.row(used)).toContainText('1 company');
      await expect(sheet.rowActions(used)).toBeFocused();
    } finally {
      await cleanup(page, [companyId], [usedId, otherId]);
    }
  });

  test('T7c: a 409 on delete (assigned by someone else meanwhile) switches to the blocked form', async ({
    page,
    testPrefix,
  }) => {
    const list = new VendorsPage(page);
    const sheet = list.tradesSheet;
    const name = `${testPrefix} Delete Race 2213`;
    const tradeId = await createTrade(page, name);
    await page.route(`**${API.trades}/${tradeId}`, async (route) => {
      if (route.request().method() !== 'DELETE') return route.continue();
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'TRADE_IN_USE',
            message: 'Trade is in use',
            details: { vendorCount: 3 },
          },
        }),
      });
    });
    try {
      await page.goto(tradesUrl());
      await sheet.waitForOpen();
      await sheet.chooseAction(name, 'Delete');
      await sheet.deleteDialog.confirm();

      await expect(sheet.deleteDialog.dialog).toContainText(
        '3 companies still use this trade. Merge it into another trade instead, or change those companies first.',
      );
      await expect(sheet.deleteDialog.confirmButton).toHaveCount(0);
      await expect(sheet.mergeInsteadButton).toBeVisible();
    } finally {
      await page.unroute(`**${API.trades}/${tradeId}`);
      await cleanup(page, [], [tradeId]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T8 - merge (AC7)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Trades sheet - merge duplicates (AC7)', { tag: '@responsive' }, () => {
  test('T8: merging moves every company, updates the counts, and drops an active chip for the merged trade', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const list = new VendorsPage(page);
    const sheet = list.tradesSheet;
    const duplicate = `${testPrefix} Merge Dup 2213`;
    const keeper = `${testPrefix} Merge Keep 2213`;
    const duplicateId = await createTrade(page, duplicate);
    const keeperId = await createTrade(page, keeper);
    const moverOne = `${testPrefix} Mover One 2213`;
    const moverTwo = `${testPrefix} Mover Two 2213`;
    const movers = [moverOne, moverTwo];
    const stayer = `${testPrefix} Stayer 2213`;
    const companyIds = [
      await createCompany(page, moverOne, duplicateId),
      await createCompany(page, moverTwo, duplicateId),
      await createCompany(page, stayer, keeperId),
    ];
    try {
      // The duplicate's chip is the active filter when the merge happens
      await page.goto(
        routeUrl('companies', undefined, { q: `${testPrefix} M`, tradeId: duplicateId }),
      );
      await expect(page.getByTestId(`companies-chip-${duplicateId}`)).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await list.openTrades();
      await expect(sheet.row(duplicate)).toContainText('2 companies');
      await expect(sheet.row(keeper)).toContainText('1 company');

      await sheet.chooseAction(duplicate, 'Merge duplicates…');
      await expect(sheet.mergeDialog.dialog).toContainText(
        `Merge ${duplicate} into another trade?`,
      );
      await expect(sheet.mergeDialog.dialog).toContainText(
        `Pick the trade to keep. The companies of ${duplicate} move to it, and ${duplicate} is removed.`,
      );

      // The action stays aria-disabled until a trade is chosen, and says why
      await expect(sheet.mergeDialog.confirmButton).toHaveAttribute('aria-disabled', 'true');
      await expect(sheet.mergeDialog.confirmButton).toHaveAccessibleDescription(
        'Choose the trade to keep',
      );
      // (force: Playwright treats aria-disabled as not actionable; a real click must do nothing)
      await sheet.mergeDialog.confirmButton.click({ force: true });
      await expect(sheet.mergeDialog.dialog).toBeVisible();

      // The merged trade is not offered as the one to keep
      await sheet.mergePicker.fill(duplicate);
      await expect(page.getByRole('option', { name: duplicate, exact: true })).toHaveCount(0);
      await sheet.chooseMergeTarget(keeper);
      await expect(sheet.mergeDialog.confirmButton).not.toHaveAttribute('aria-disabled', 'true');
      await expect(sheet.mergeStatus).toHaveText(`2 companies move to ${keeper}`);

      await sheet.mergeDialog.confirmAndWaitClosed();

      // The duplicate is gone, the keeper holds the sum, focus is on the keeper's ⋯
      await expect(sheet.row(duplicate)).toHaveCount(0);
      await expect(sheet.row(keeper)).toContainText('3 companies');
      await expect(sheet.rowActions(keeper)).toBeFocused();

      // As soon as the trades refetch returns, with the sheet still open, the active chip falls
      // back to "All" and the list behind is no longer filtered by the merged trade
      await expect(page.getByTestId('companies-chip-all')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId(`companies-chip-${duplicateId}`)).toHaveCount(0);
      // (the reset writes an explicit `tradeId=all`)
      await expect(page).toHaveURL((url) => (url.searchParams.get('tradeId') ?? 'all') === 'all');
      // The stayer (keeper trade) was outside the merged-trade filter and is listed now
      await expect(list.row(stayer)).toBeVisible();

      // Closing the sheet keeps it that way
      await sheet.doneButton.click();
      await sheet.waitForClosed();
      await expect(page.getByTestId('companies-chip-all')).toHaveAttribute('aria-pressed', 'true');
      // (the reset writes an explicit `tradeId=all`)
      await expect(page).toHaveURL((url) => (url.searchParams.get('tradeId') ?? 'all') === 'all');

      // Every former company of the duplicate now shows the keeper's trade
      for (const name of [...movers, stayer]) {
        await expect(list.row(name)).toContainText(keeper);
      }
    } finally {
      await cleanup(page, companyIds, [duplicateId, keeperId]);
    }
  });

  test('T8b: a trade without companies merges with "No companies move"', async ({
    page,
    testPrefix,
  }) => {
    const list = new VendorsPage(page);
    const sheet = list.tradesSheet;
    const empty = `${testPrefix} Merge Empty 2213`;
    const keeper = `${testPrefix} Merge Target 2213`;
    const emptyId = await createTrade(page, empty);
    const keeperId = await createTrade(page, keeper);
    try {
      await page.goto(tradesUrl());
      await sheet.waitForOpen();
      await sheet.chooseAction(empty, 'Merge duplicates…');
      await sheet.chooseMergeTarget(keeper);
      await expect(sheet.mergeStatus).toHaveText(`No companies move to ${keeper}`);
      await sheet.mergeDialog.confirmAndWaitClosed();
      await expect(sheet.row(empty)).toHaveCount(0);
      await expect(sheet.row(keeper)).toContainText('No companies');
      await expect(list.pageMenuButton).toBeAttached();
    } finally {
      await cleanup(page, [], [emptyId, keeperId]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T9 - dark mode
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Trades sheet - dark mode', { tag: '@responsive' }, () => {
  test('T9: the sheet renders in dark mode with readable controls and no sideways scroll', async ({
    page,
  }) => {
    const list = new VendorsPage(page);
    await page.goto(tradesUrl());
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await list.tradesSheet.waitForOpen();
    await expect(list.tradesSheet.newInput).toBeVisible();
    await expect(list.tradesSheet.addButton).toBeVisible();
    await expect(list.tradesSheet.doneButton).toBeVisible();
    const colors = await list.tradesSheet.newInput.evaluate((el) => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, color: style.color };
    });
    expect(colors.background).not.toBe(colors.color);
    expect(colors.background).not.toBe('rgb(255, 255, 255)');
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(sideways).toBe(false);
  });
});
