/**
 * E2E tests for the Companies list on the object-list template (#2246, EPIC-21 P5.2).
 *
 * Scenarios covered:
 * O1  Flat A-Z by default (no groups)
 * O2  Group by Trade shows trade headers and hides the Trade column
 * O3  Trade chips are the four trades with the most companies; More trades selects a fifth,
 *     which then shows as a selected chip (D8; the trades answer is rewritten so the counts are
 *     ours alone)
 * O4  One primary "New company"; the page ⋯ menu holds Trades (AC5: Escape returns focus to ⋯)
 * O5  Call is present on the row and on the card
 * O6  A legacy ?page=2&pageSize=10 URL is ignored
 *
 * All names are synthetic; the database is shared by parallel workers, so every assertion is
 * scoped by the per-worker `testPrefix`.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { API } from '../../fixtures/testData.js';
import { VendorsPage } from '../../pages/VendorsPage.js';

const isTradesList = (url: URL): boolean => url.pathname === API.trades;

async function createCompany(
  page: Page,
  data: { name: string; tradeId?: string | null; phone?: string },
): Promise<string> {
  const response = await page.request.post(API.vendors, { data });
  expect(response.ok(), `POST company "${data.name}": ${response.status()}`).toBeTruthy();
  return ((await response.json()) as { vendor: { id: string } }).vendor.id;
}

async function createTrade(page: Page, name: string): Promise<string> {
  const response = await page.request.post(API.trades, { data: { name } });
  expect(response.ok(), `POST trade "${name}": ${response.status()}`).toBeTruthy();
  return ((await response.json()) as { trade: { id: string } }).trade.id;
}

async function deleteAll(page: Page, companyIds: string[], tradeIds: string[]): Promise<void> {
  for (const id of companyIds) await page.request.delete(`${API.vendors}/${id}`);
  for (const id of tradeIds) await page.request.delete(`${API.trades}/${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// O1 / O2 - flat A-Z, Group by Trade
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Companies list - order and grouping', { tag: '@responsive' }, () => {
  test.describe.configure({ timeout: 60_000 });

  test('O1: the list is flat and A-Z by default', async ({ page, testPrefix }) => {
    const list = new VendorsPage(page);
    const names = [
      `${testPrefix} Order Charlie`,
      `${testPrefix} Order Alpha`,
      `${testPrefix} Order Bravo`,
    ];
    const ids: string[] = [];
    try {
      for (const name of names) ids.push(await createCompany(page, { name }));

      await list.open({ q: `${testPrefix} Order` });

      await expect
        .poll(() => list.getVendorNames())
        .toEqual([...names].sort((a, b) => a.localeCompare(b)));
      // Flat: no group headers
      await expect(list.olist.groupToggles()).toHaveCount(0);
    } finally {
      await deleteAll(page, ids, []);
    }
  });

  test('O2: Group by Trade shows a header per trade and hides the Trade column', async ({
    page,
    testPrefix,
  }) => {
    const list = new VendorsPage(page);
    const tradeNames = [`${testPrefix} Trade Aaa`, `${testPrefix} Trade Bbb`];
    const tradeIds: string[] = [];
    const companyIds: string[] = [];
    try {
      for (const name of tradeNames) tradeIds.push(await createTrade(page, name));
      companyIds.push(
        await createCompany(page, { name: `${testPrefix} Group One`, tradeId: tradeIds[0] }),
        await createCompany(page, { name: `${testPrefix} Group Two`, tradeId: tradeIds[1] }),
        await createCompany(page, { name: `${testPrefix} Group Three` }),
      );

      // Narrowed to our rows: grouping needs the whole list (100 or fewer rows)
      await list.open({ q: `${testPrefix} Group` });
      if (await list.isTableSurface()) {
        await expect(list.columnHeader('Trade')).toBeVisible();
      }

      await list.setGroupBy('trade');

      await expect(list.groupToggle(tradeIds[0]!)).toContainText(tradeNames[0]!);
      await expect(list.groupToggle(tradeIds[1]!)).toContainText(tradeNames[1]!);
      // Companies without a trade form their own, last group
      await expect(list.groupToggle('__none__')).toContainText('No trade');
      expect((await list.groupKeys()).at(-1)).toBe('__none__');
      await expect(page).toHaveURL((url) => url.searchParams.get('group') === 'trade');
      // The Trade column would repeat the header, so it is hidden while grouped
      if (await list.isTableSurface()) {
        await expect(list.columnHeader('Trade')).toHaveCount(0);
      }

      await list.setGroupBy('none');
      await expect(list.olist.groupToggles()).toHaveCount(0);
    } finally {
      await deleteAll(page, companyIds, tradeIds);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O3 - trade chips and More trades
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Companies list - trade chips', { tag: '@responsive' }, () => {
  test.describe.configure({ timeout: 90_000 });

  test('O3: the chips are the top four trades; More trades selects a fifth, shown as a selected chip', async ({
    page,
    testPrefix,
  }) => {
    const list = new VendorsPage(page);
    const names = [1, 2, 3, 4, 5].map((n) => `${testPrefix} Chip Trade ${n}`);
    // Distinct counts, the fifth trade is the least used
    const counts = [50, 40, 30, 20, 10];
    const tradeIds: string[] = [];
    const companyIds: string[] = [];
    try {
      for (const name of names) tradeIds.push(await createTrade(page, name));
      companyIds.push(
        await createCompany(page, { name: `${testPrefix} Chip Co`, tradeId: tradeIds[4] }),
      );

      // The trades are shared with every worker: rewrite the answer so the counts are ours alone
      const ours = new Map(tradeIds.map((id, index) => [id, counts[index]!]));
      await page.route(isTradesList, async (route) => {
        if (route.request().method() !== 'GET') {
          await route.continue();
          return;
        }
        const response = await route.fetch();
        const body = (await response.json()) as {
          trades: Array<{ id: string; vendorCount: number }>;
        };
        body.trades = body.trades.map((trade) => ({
          ...trade,
          vendorCount: ours.get(trade.id) ?? 0,
        }));
        await route.fulfill({ response, json: body });
      });

      await list.open();

      // The four most used trades have a chip, the fifth does not
      for (const id of tradeIds.slice(0, 4)) await expect(list.chip(id)).toBeVisible();
      await expect(list.chip(tradeIds[4]!)).toHaveCount(0);
      await expect(list.chip('all')).toHaveAttribute('aria-pressed', 'true');
      await expect(list.chipMoreButton).toBeVisible();

      // More trades lists every trade in use; picking the fifth selects it
      await list.chooseMoreTrade(tradeIds[4]!);
      await expect(page).toHaveURL((url) => url.searchParams.get('tradeId') === tradeIds[4]);
      await expect(list.chip(tradeIds[4]!)).toBeVisible();
      await expect(list.chip(tradeIds[4]!)).toHaveAttribute('aria-pressed', 'true');
      await expect(list.chip(tradeIds[4]!)).toContainText(names[4]!);
      await expect(list.chip('all')).toHaveAttribute('aria-pressed', 'false');
      await expect(list.row(`${testPrefix} Chip Co`)).toBeVisible();

      // Selecting another chip lets the fifth fall back out of the row of chips
      await list.selectChip(tradeIds[0]!);
      await expect(list.chip(tradeIds[4]!)).toHaveCount(0);
    } finally {
      await page.unroute(isTradesList);
      await deleteAll(page, companyIds, tradeIds);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O4 - header and ⋯ menu
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Companies list - header', { tag: '@responsive' }, () => {
  test('O4: one primary "New company"; ⋯ › Trades opens ?trades=1 and Escape returns focus to ⋯', async ({
    page,
  }) => {
    const list = new VendorsPage(page);

    await list.open();

    // Exactly one "New company" button, and no "Trades" button beside it
    await expect(page.getByRole('button', { name: 'New company' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Trades', exact: true })).toHaveCount(0);

    await list.pageMenuButton.click();
    await expect(list.tradesMenuItem).toBeVisible();
    await list.tradesMenuItem.click();

    await list.tradesSheet.waitForOpen();
    await expect(page).toHaveURL((url) => url.searchParams.get('trades') === '1');

    await page.keyboard.press('Escape');
    await list.tradesSheet.waitForClosed();
    await expect(list.pageMenuButton).toBeFocused();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O5 - Call on row and card
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Companies list - Call', { tag: '@responsive' }, () => {
  test('O5: a company with a phone has a Call button on its row and on its card', async ({
    page,
    testPrefix,
  }) => {
    const list = new VendorsPage(page);
    const name = `${testPrefix} Call Co`;
    const id = await createCompany(page, { name, phone: '555-0188' });
    try {
      await list.open({ q: name });

      // Same test id family on both surfaces (the card id carries `mobile`)
      await expect(list.callButton(id)).toBeVisible();
      await expect(list.callButton(id)).toHaveAttribute('href', 'tel:5550188');
      await expect(list.callLink(name)).toHaveCount(1);
    } finally {
      await deleteAll(page, [id], []);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O6 - legacy URL
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Companies list - legacy URL', { tag: '@responsive' }, () => {
  test('O6: ?page=2&pageSize=10 is ignored: the parameters go and the list renders', async ({
    page,
  }) => {
    const list = new VendorsPage(page);

    await list.open({ page: 2, pageSize: 10 });

    await page.waitForURL(
      (url) => !url.searchParams.has('page') && !url.searchParams.has('pageSize'),
    );
    await expect(list.heading).toBeVisible();
    await expect(list.olist.retryButton).toHaveCount(0);
  });
});
