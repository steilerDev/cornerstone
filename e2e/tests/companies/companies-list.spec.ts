/**
 * E2E tests for the rebuilt Companies list (#2213, AC1, AC3, AC4).
 *
 * L1  Columns in order, "Last on site" from the latest saved daily log, exactly one current entry
 * L2  Search: umlaut folding ("Oeko"), contact person, phone digit run, English trade name; fast
 *     typing keeps focus and every keystroke
 * L3  German UI: the German name of a built-in trade finds a company of that trade; chip labels
 * L4  Trade chips (#2246: top four + More trades): pressed state, URL `tradeId`, history entry
 *     replaced (Back leaves the page), chip + search combine, "All" resets
 * L5  Call: `tel:` link, accessible names, exact sizes (32px fine pointer, 44px coarse, full-width
 *     phone card), the phone-card path through the More sheet
 * L6  Sort by "Last on site" puts companies without a value last in both directions
 * L7  Touch sizes of chips and the row menu trigger at 1023px and below
 * L8  Dark mode and 320px reflow
 *
 * All names, numbers and e-mails are synthetic. The E2E database is shared by parallel workers, so
 * every assertion is scoped by a unique search text (the per-worker `testPrefix`), never by
 * "the first row".
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { createDiaryEntryViaApi, deleteDiaryEntryViaApi } from '../../fixtures/apiHelpers.js';
import { openAsLocaleUser } from '../../fixtures/localeUser.js';
import type { LocaleSession } from '../../fixtures/localeUser.js';
import { API } from '../../fixtures/testData.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { CommandSearchPanel } from '../../pages/components/CommandSearchPanel.js';
import { VendorDetailPage } from '../../pages/VendorDetailPage.js';
import { VendorsPage } from '../../pages/VendorsPage.js';
import { routeUrl } from '../../../shared/src/routes/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface CompanySeed {
  name: string;
  tradeId?: string | null;
  phone?: string | null;
  email?: string | null;
}

async function createCompany(page: Page, data: CompanySeed): Promise<string> {
  const response = await page.request.post(API.vendors, { data });
  expect(response.ok(), `POST company "${data.name}": ${response.status()}`).toBeTruthy();
  return ((await response.json()) as { vendor: { id: string } }).vendor.id;
}

async function createContact(
  page: Page,
  companyId: string,
  data: { firstName: string; lastName: string; phone?: string },
): Promise<void> {
  const response = await page.request.post(`${API.vendors}/${companyId}/contacts`, { data });
  expect(response.ok(), `POST contact: ${response.status()}`).toBeTruthy();
}

async function deleteCompanies(page: Page, ids: string[]): Promise<void> {
  for (const id of ids) await page.request.delete(`${API.vendors}/${id}`);
}

/** A saved daily log that names the company. */
async function createDailyLog(
  page: Page,
  companyId: string,
  entryDate: string,
  body: string,
): Promise<string> {
  return createDiaryEntryViaApi(page, {
    entryType: 'daily_log',
    entryDate,
    body,
    metadata: { vendorId: companyId },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// L1 - columns, Last on site, one current entry
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Companies list - columns (AC1)', { tag: '@responsive' }, () => {
  test('L1: columns in order, Last on site is the latest saved daily log, one current entry', async ({
    page,
    testPrefix,
  }) => {
    const list = new VendorsPage(page);
    const shell = new AppShellPage(page);
    const name = `${testPrefix} Sample Tiling Ltd`;
    const quietName = `${testPrefix} Sample Quiet Ltd`;
    const ids: string[] = [];
    const entries: string[] = [];

    try {
      const id = await createCompany(page, { name, tradeId: 'trade-tiling', phone: '555-0131' });
      ids.push(id, await createCompany(page, { name: quietName }));
      await createContact(page, id, { firstName: 'Alex', lastName: 'Sample' });
      await createContact(page, id, { firstName: 'Sam', lastName: 'Sample' });
      entries.push(await createDailyLog(page, id, '2026-03-14', `${testPrefix} older log`));
      entries.push(await createDailyLog(page, id, '2026-04-02', `${testPrefix} newer log`));

      await list.goto({ q: `${testPrefix} Sample` });
      await expect(list.heading).toHaveText(/^Companies \(/);
      await list.waitForVendorsLoaded();
      await expect(list.row(name)).toBeVisible();

      if (await list.isTableSurface()) {
        // Table: Company, Trade, Phone, Still to pay, Offers, Contact persons, Last on site
        // (#2244), then the row-actions column (its header is visually hidden text). E-mail,
        // Address, Notes, Date added and Last updated are hidden by default (#2246 D10).
        await expect(list.tableHeaders).toHaveText([
          /^Company/,
          /^Trade/,
          /^Phone/,
          /^Still to pay/,
          /^Offers/,
          /^Contact persons/,
          /^Last on site/,
          /^Actions$/,
        ]);
      }

      // The later of the two saved daily logs wins; the company without a log shows a dash
      // (Last on site and Contact persons are table columns; the card shows Trade, Still to pay
      // and Call)
      await expect(list.row(name)).toContainText('Tiling');
      if (await list.isTableSurface()) {
        await expect(list.row(name)).toContainText('Apr 2, 2026');
        await expect(list.row(name)).not.toContainText('Mar 14, 2026');
        await expect(list.row(name)).toContainText('2');
        await expect(list.row(quietName)).not.toContainText('2026');
      }

      // Exactly one entry is current: Companies, on the list and on a company page
      await expect(shell.activeEntries).toHaveCount(1);
      await expect(shell.sectionLink('companies')).toHaveAttribute('aria-current', 'page');
      await list.nameLink(name).click();
      await new VendorDetailPage(page).pageTitle.waitFor({ state: 'visible' });
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('company', { id }));
      await expect(shell.activeEntries).toHaveCount(1);
      await expect(shell.sectionLink('companies')).toHaveAttribute('aria-current', 'page');
    } finally {
      for (const entryId of entries) await deleteDiaryEntryViaApi(page, entryId);
      await deleteCompanies(page, ids);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L2 - search
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Companies list - search (AC3)', { tag: '@responsive' }, () => {
  test('L2: finds umlauts, contact persons, phone digit runs and English trade names', async ({
    page,
    testPrefix,
  }) => {
    const list = new VendorsPage(page);
    const token = testPrefix.replace(/\W/g, '');
    const oeko = `${testPrefix} Öko Testbau 2213`;
    const plain = `${testPrefix} Bauer Alpha 2213`;
    const phoned = `${testPrefix} Phone Beta 2213`;
    const tiled = `${testPrefix} Tile Gamma 2213`;
    const ids: string[] = [];

    try {
      ids.push(await createCompany(page, { name: oeko }));
      const plainId = await createCompany(page, { name: plain });
      ids.push(plainId);
      ids.push(await createCompany(page, { name: phoned, phone: '555-0142' }));
      ids.push(await createCompany(page, { name: tiled, tradeId: 'trade-tiling' }));
      await createContact(page, plainId, { firstName: 'Quirin', lastName: `Kontakt${token}` });

      await list.goto();

      // "Oeko" finds "Öko" (folded) and only that company among ours
      await list.search(`${testPrefix} Oeko`);
      await expect(list.row(oeko)).toBeVisible();
      await expect(list.row(plain)).toHaveCount(0);
      // ... and the umlaut itself finds it too
      await list.search(`${testPrefix} Öko`);
      await expect(list.row(oeko)).toBeVisible();

      // A contact person's name finds its company
      await list.search(`Kontakt${token}`);
      await expect(list.row(plain)).toBeVisible();
      await expect(list.row(oeko)).toHaveCount(0);

      // A phone digit run without separators finds the company
      await list.search('5550142');
      await expect(list.row(phoned)).toBeVisible();

      // The English name of a built-in trade finds a company of that trade
      await list.search(`Tiling`);
      await expect(list.row(tiled)).toBeVisible();
      await expect(list.row(plain)).toHaveCount(0);

      // The search is in the URL
      await expect(page).toHaveURL((url) => url.searchParams.get('q') === 'Tiling');
    } finally {
      await deleteCompanies(page, ids);
    }
  });

  test('L2b: fast typing keeps focus and loses no keystroke', async ({ page, testPrefix }) => {
    const list = new VendorsPage(page);
    const name = `${testPrefix} Fast Typist 2213`;
    const id = await createCompany(page, { name });
    try {
      await list.goto();
      await list.searchInput.click();
      const typed = `${testPrefix} Fast Typ`;
      await list.searchInput.pressSequentially(typed, { delay: 15 });
      await expect(list.searchInput).toHaveValue(typed);
      await expect(list.row(name)).toBeVisible();
      await expect(list.searchInput).toBeFocused();
      await expect(list.searchInput).toHaveValue(typed);
    } finally {
      await deleteCompanies(page, [id]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L3 - German UI
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Companies list - German UI (AC3)', () => {
  test('L3: the German name of a built-in trade finds a company of that trade', async ({
    browser,
    page,
    testPrefix,
  }) => {
    test.slow();
    const viewport = page.viewportSize();
    test.skip(viewport !== null && viewport.width < 1200, 'German locale runs on desktop only');
    const name = `${testPrefix} Fliesen Delta 2213`;
    const id = await createCompany(page, { name, tradeId: 'trade-tiling' });
    const other = await createCompany(page, { name: `${testPrefix} Ohne Gewerk 2213` });
    let session: LocaleSession | null = null;
    try {
      session = await openAsLocaleUser(browser, page, testPrefix, routeUrl('companies'));
      const de = session.page;
      const list = new VendorsPage(de);
      await expect(de.getByRole('heading', { level: 1, name: /^Firmen(\s|$)/ })).toBeVisible();

      // The chip group and its "All" chip are German (a trade has a chip only among the four
      // most used, so the trade name itself is checked on the row below)
      await expect(de.getByRole('group', { name: 'Gewerk', exact: true })).toBeVisible();
      await expect(
        de.getByRole('group', { name: 'Gewerk' }).getByRole('button', { name: 'Alle' }),
      ).toHaveAttribute('aria-pressed', 'true');

      // The German name finds the company (the stored name is English)
      await de.getByRole('searchbox').fill('Fliesenarbeiten');
      await expect(list.row(name)).toBeVisible();
      await expect(list.row(`${testPrefix} Ohne Gewerk 2213`)).toHaveCount(0);
      await expect(list.row(name)).toContainText('Fliesenarbeiten');
      // The command search sends the same trade ids: the German name finds the company there too
      const palette = new CommandSearchPanel(de);
      await palette.openWithShortcut();
      await palette.search('Fliesenarbeiten');
      await expect(palette.option('vendor', id)).toBeVisible();
      await expect(palette.option('vendor', id)).toContainText(name);
      await de.keyboard.press('Escape');

      // Never a raw translation key
      await expect(de.locator('main')).not.toContainText(/trades\.|companies\./);
    } finally {
      if (session) await session.dispose();
      await deleteCompanies(page, [id, other]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L4 - trade chips
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Companies list - Trade chips (AC3)', { tag: '@responsive' }, () => {
  test('L4: a chip filters, lives in the URL, replaces history, and combines with the search', async ({
    page,
    testPrefix,
  }) => {
    const list = new VendorsPage(page);
    const tiled = `${testPrefix} Chip Tiler 2213`;
    const bare = `${testPrefix} Chip Bare 2213`;
    const ids: string[] = [];
    try {
      ids.push(await createCompany(page, { name: tiled, tradeId: 'trade-tiling' }));
      ids.push(await createCompany(page, { name: bare }));

      // Another page first, so "Back" has somewhere to go
      await page.goto(routeUrl('home'));
      await expect(page.getByRole('main')).toBeVisible();
      await list.goto({ q: `${testPrefix} Chip` });
      await expect(list.row(tiled)).toBeVisible();
      await expect(list.row(bare)).toBeVisible();
      await expect(list.chip('all')).toHaveAttribute('aria-pressed', 'true');

      // Pressing a chip filters and writes tradeId (the search stays)
      await list.selectTrade('trade-tiling');
      await expect(list.chip('all')).toHaveAttribute('aria-pressed', 'false');
      await expect(list.row(tiled)).toBeVisible();
      await expect(list.row(bare)).toHaveCount(0);
      await expect(page).toHaveURL(
        (url) =>
          url.searchParams.get('tradeId') === 'trade-tiling' &&
          url.searchParams.get('q') === `${testPrefix} Chip`,
      );

      // Chip + search combine: a search that matches only the other company empties the list
      await list.search(`${testPrefix} Chip Bare`);
      await expect(list.row(bare)).toHaveCount(0);
      await expect(list.emptyState).toBeVisible();
      await expect(list.chip('trade-tiling')).toHaveAttribute('aria-pressed', 'true');
      await list.search(`${testPrefix} Chip`);
      await expect(list.row(tiled)).toBeVisible();

      // "All" resets the chip and removes the parameter
      await list.selectChip('all');
      await expect(list.row(bare)).toBeVisible();
      // (the template writes an explicit `tradeId=all` for the All chip)
      await expect(page).toHaveURL((url) => (url.searchParams.get('tradeId') ?? 'all') === 'all');

      // The chip press replaced its history entry: Back leaves the page, it does not un-press
      await list.selectTrade('trade-tiling');
      await expect(list.row(bare)).toHaveCount(0);
      await page.goBack();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('home'));
    } finally {
      await deleteCompanies(page, ids);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L5 - Call
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Companies list - Call (AC4)', { tag: '@responsive' }, () => {
  test('L5: Call is a tel: link with an exact size and reaches the phone card through More', async ({
    page,
    testPrefix,
  }) => {
    const list = new VendorsPage(page);
    const shell = new AppShellPage(page);
    const name = `${testPrefix} Callable Co 2213`;
    const id = await createCompany(page, { name, phone: '+1 555-0152' });
    try {
      await page.goto(routeUrl('home'));
      await expect(page.getByRole('main')).toBeVisible();
      // The shell's own navigation: sidebar from 1024px, bottom bar / More sheet below
      await shell.navigateTo('companies');
      await list.heading.waitFor({ state: 'visible' });
      await list.search(name);

      const call = list.callLink(name);
      await expect(call).toBeVisible();
      await expect(call).toHaveAttribute('href', 'tel:+15550152');

      // The card or the table follows the list's own width, not the viewport (tablet: cards)
      const isTable = await list.isTableSurface();
      const coarse = await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
      const box = (await call.boundingBox())!;

      if (!isTable) {
        // Phone card: one full-width "Call <number>" button, at least 44px high
        await expect(call).toHaveText('Call +1 555-0152');
        await expect(call).toHaveAccessibleName(`Call +1 555-0152, ${name}`);
        expect(box.height).toBeGreaterThanOrEqual(44);
        const gap = await call.evaluate((el) => {
          const parent = el.parentElement as HTMLElement;
          const style = getComputedStyle(parent);
          const inner =
            parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
          return Math.abs(el.getBoundingClientRect().width - inner);
        });
        expect(gap).toBeLessThanOrEqual(1);
        // The number is not repeated as separate text on the card
        await expect(list.row(name).getByText('+1 555-0152', { exact: true })).toHaveCount(0);
      } else {
        // Table row: "Call" beside the number, 32px with a fine pointer, 44px with a coarse one
        await expect(call).toHaveText('Call');
        await expect(call).toHaveAccessibleName(`Call ${name} on +1 555-0152`);
        await expect(list.row(name)).toContainText('+1 555-0152');
        if (coarse) expect(box.height).toBeGreaterThanOrEqual(44);
        else expect(Math.round(box.height)).toBe(32);
      }

      // Activating Call must not also open the company (the row click is stopped)
      await call.evaluate((el) => el.addEventListener('click', (e) => e.preventDefault()));
      await call.click();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('companies'));
    } finally {
      await deleteCompanies(page, [id]);
    }
  });

  test('L5b: a company with neither its own phone nor a contact phone shows a dash and no Call', async ({
    page,
    testPrefix,
  }) => {
    const list = new VendorsPage(page);
    const name = `${testPrefix} Silent Co 2213`;
    const id = await createCompany(page, { name });
    try {
      await list.goto({ q: name });
      await expect(list.row(name)).toBeVisible();
      await expect(list.callLink(name)).toHaveCount(0);
    } finally {
      await deleteCompanies(page, [id]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L6 - sort by Last on site
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Companies list - sort (AC1)', { tag: '@responsive' }, () => {
  test('L6: companies without a Last on site date come last in both directions', async ({
    page,
    testPrefix,
  }) => {
    const list = new VendorsPage(page);
    const visited = `${testPrefix} Sort Visited 2213`;
    const never = `${testPrefix} Sort Aaa Never 2213`;
    const ids: string[] = [];
    const entries: string[] = [];
    try {
      const visitedId = await createCompany(page, { name: visited });
      ids.push(visitedId, await createCompany(page, { name: never }));
      entries.push(await createDailyLog(page, visitedId, '2026-02-10', `${testPrefix} sort log`));

      for (const direction of ['asc', 'desc'] as const) {
        await list.goto({ q: `${testPrefix} Sort`, sortBy: 'last_on_site', sortOrder: direction });
        await expect(list.row(visited)).toBeVisible();
        // "Aaa Never" sorts before "Visited" by name, yet comes after it with a missing value
        expect((await list.getVendorNames()).filter((n) => n.includes('2213'))).toEqual([
          visited,
          never,
        ]);
      }
    } finally {
      for (const entryId of entries) await deleteDiaryEntryViaApi(page, entryId);
      await deleteCompanies(page, ids);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L7 - touch sizes at 1023px and below
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Companies list - touch targets', { tag: '@responsive' }, () => {
  test('L7: chips and the row ⋯ trigger are at least 44px at 1023px and below', async ({
    page,
    testPrefix,
  }) => {
    const list = new VendorsPage(page);
    const name = `${testPrefix} Touch Co 2213`;
    const id = await createCompany(page, { name, tradeId: 'trade-tiling' });
    try {
      // The selected trade always has a chip (it need not be among the four most used)
      await list.goto({ q: name, tradeId: 'trade-tiling' });
      await list.waitForVendorsLoaded();
      await expect(list.row(name)).toBeVisible();
      const width = (await page.viewportSize())!.width;
      test.skip(width >= 1024, 'the 44px floor applies at 1023px and below');

      const chip = (await list.chip('trade-tiling').boundingBox())!;
      expect(chip.height).toBeGreaterThanOrEqual(44);
      const trigger = (await list.rowActions(name).boundingBox())!;
      expect(Math.round(trigger.width)).toBe(44);
      expect(Math.round(trigger.height)).toBe(44);
    } finally {
      await deleteCompanies(page, [id]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L8 - dark mode, 320px reflow
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Companies list - dark mode and reflow', { tag: '@responsive' }, () => {
  test('L8: the list renders in dark mode and reflows at 320px without sideways scroll', async ({
    page,
    testPrefix,
  }) => {
    const list = new VendorsPage(page);
    const name = `${testPrefix} Dark Reflow Co 2213`;
    const id = await createCompany(page, { name, phone: '555-0161', tradeId: 'trade-tiling' });
    try {
      await list.goto({ q: name });
      await list.waitForVendorsLoaded();
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      await expect(list.row(name)).toBeVisible();
      await expect(list.newCompanyButton).toBeVisible();
      await expect(list.pageMenuButton).toBeVisible();
      const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(background).not.toBe('rgb(255, 255, 255)');

      await page.setViewportSize({ width: 320, height: 800 });
      await expect(list.row(name)).toBeVisible();
      // The layout switches (table -> cards) after the resize; poll until it has settled
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
        .toBe(false);
    } finally {
      await deleteCompanies(page, [id]);
    }
  });
});
