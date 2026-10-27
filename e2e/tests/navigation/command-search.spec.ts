/**
 * E2E command search (Story #2211 / EPIC-21, P1.5)
 *
 * One palette answers "find anything": it opens with Ctrl/Cmd+K, `/` (where no list owns it),
 * the top bar's Search button or a list's "Search everywhere for ..." row. From 1024px it is a
 * 640px palette; below, a full-screen sheet. Results are grouped (Go to, then one group per
 * type), accent-insensitive and keyboard driven; focus never lands on <body>.
 *
 * Scenarios (desktop unless tagged @responsive):
 * - S1  open from anywhere; the shortcut toggles; focus returns to the page heading
 * - S2  open from a text field; Escape returns to the list search
 * - S3  top bar button; Escape returns to the button
 * - S4  grouped results, <mark>, Call link, German folding (gruener / grüner)
 * - S5  area path on line 2 (last level emphasised) and the status chip
 * - S5b an area result opens the Areas page (#2218)
 * - S6  keyboard: arrows, Enter opens the company page (heading focused), Back returns
 * - S7  "Go to" destinations with the former name; replace vs push history (D12)
 * - S8  one character: hint only, no request
 * - S9  no results: EmptyState and live status
 * - S10 "Show n more" inside the group keeps the dialog open, active row = first new row
 * - S11 documents unavailable note, request failure with retry
 * - S12 list coupling: "Search everywhere for ..." row, prefilled palette, query clears on close
 * - S13 `/` focuses the list search and selects its text; on Home it opens the palette
 * - S14 `n` per list; New menu on Home; typed into the input while the palette is open
 * - S15 (@responsive) top bar magnifier opens the full-screen sheet; Close returns focus
 * - S16 Tab cycle input -> Clear (-> Close on the sheet) -> input; options are never tab stops
 * - S17 exactly one search field per screen; the list field is inert while the palette is open
 * - S18 history: Back closes the palette; opening adds no entry
 * - S19 exact sizes at 1920x1080: 640 panel, 56 input row, 44 row, footer
 * - S20 dark mode: active row background and underlined <mark>
 * - S21 German locale: group header "Firmen", folding finds Grüner
 *
 * Data: synthetic companies, tasks and areas created through the API per test (unique tag from
 * the `testPrefix` fixture) and removed in afterEach. No preference rows are written: dark mode
 * and German use a fresh browser context (prefers-color-scheme / browser locale).
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { routeUrl } from '../../../shared/src/routes/index.js';
import {
  createAreaViaApi,
  createVendorViaApi,
  createWorkItemViaApi,
  deleteAreaViaApi,
  deleteVendorViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { API, ROUTES } from '../../fixtures/testData.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { CommandSearchPanel } from '../../pages/components/CommandSearchPanel.js';
import { CreateMenu } from '../../pages/components/CreateMenu.js';
import { ObjectFormDialog } from '../../pages/components/ObjectFormDialog.js';
import { InvoicesPage } from '../../pages/InvoicesPage.js';
import { VendorsPage } from '../../pages/VendorsPage.js';
import { WorkItemsPage } from '../../pages/WorkItemsPage.js';

const ADMIN_STATE = 'test-results/.auth/admin.json';

/** Every kind of search field a screen could carry (AC7). */
const SEARCH_FIELD_SELECTOR =
  'input[type="search"], input[data-page-search], input[role="combobox"], input[role="searchbox"]';

let cleanups: Array<() => Promise<void>> = [];

test.afterEach(async () => {
  const pending = cleanups.reverse();
  cleanups = [];
  for (const cleanup of pending) {
    try {
      await cleanup();
    } catch {
      // best-effort teardown; the entity may already be gone
    }
  }
});

/** A per-test unique tag so parallel workers and retries never see each other's rows. */
function newTag(testPrefix: string): string {
  return `${testPrefix}-${Math.random().toString(36).slice(2, 8)}`;
}

async function seedCompany(
  page: Page,
  name: string,
  extra: { phone?: string } = {},
): Promise<string> {
  const id = await createVendorViaApi(page, { name, ...extra });
  cleanups.push(() => deleteVendorViaApi(page, id));
  return id;
}

async function seedTask(page: Page, title: string, areaId?: string): Promise<string> {
  const id = await createWorkItemViaApi(page, { title, ...(areaId ? { areaId } : {}) });
  cleanups.push(() => deleteWorkItemViaApi(page, id));
  return id;
}

async function pageHeading(page: Page) {
  const heading = page.locator('main h1').first();
  await expect(heading).toBeVisible();
  return heading;
}

/** Focus is on a real element, never on <body>. */
async function expectFocusNotOnBody(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName ?? 'NONE'))
    .not.toMatch(/^(BODY|NONE|HTML)$/);
}

function historyLength(page: Page): Promise<number> {
  return page.evaluate(() => window.history.length);
}

/** Visible search fields that are not inside an inert subtree. */
function liveSearchFieldCount(page: Page): Promise<number> {
  return page.evaluate(
    (selector) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(
        (el) =>
          !el.closest('[inert]') &&
          el.getClientRects().length > 0 &&
          getComputedStyle(el).visibility !== 'hidden',
      ).length,
    SEARCH_FIELD_SELECTOR,
  );
}

test.describe('Command search', () => {
  test('S1: Ctrl/Cmd+K opens from anywhere, toggles, and focus returns to the heading', async ({
    page,
  }) => {
    const search = new CommandSearchPanel(page);
    await page.goto(ROUTES.home);
    const heading = await pageHeading(page);

    await search.openWithShortcut();
    await expect(search.dialog).toBeVisible();
    await expect(search.input).toBeFocused();
    await expect(search.input).toHaveValue('');

    await page.keyboard.press('ControlOrMeta+k');
    await expect(search.dialog).toBeHidden();
    await expect(heading).toBeFocused();
    await expectFocusNotOnBody(page);
  });

  test('S2: opens from a text field and Escape returns to that field', async ({ page }) => {
    const search = new CommandSearchPanel(page);
    const tasks = new WorkItemsPage(page);
    await page.goto(routeUrl('workItems'));
    await pageHeading(page);

    await tasks.searchInput.focus();
    await expect(tasks.searchInput).toBeFocused();
    await search.openWithShortcut();
    await search.closeWithEscape();
    await expect(tasks.searchInput).toBeFocused();
  });

  test('S3: the top bar Search button opens it and Escape returns to the button', async ({
    page,
  }) => {
    const search = new CommandSearchPanel(page);
    const appShell = new AppShellPage(page);
    await page.goto(ROUTES.home);
    await pageHeading(page);

    await expect(search.topBarButton).not.toHaveAttribute('aria-disabled');
    await expect(search.topBarButton).toHaveAttribute('aria-haspopup', 'dialog');
    await appShell.openSearch();
    await expect(search.input).toBeFocused();
    await search.closeWithEscape();
    await expect(search.topBarButton).toBeFocused();
    await expectFocusNotOnBody(page);
  });

  test('S4: grouped results, highlight, Call link and German folding', async ({
    page,
    testPrefix,
  }) => {
    const tag = newTag(testPrefix);
    const name = `Grüner Testbau ${tag}`;
    const companyId = await seedCompany(page, name, { phone: '555-0142' });
    const contactName = `Kontakt Person ${tag}`;
    const contact = await page.request.post(`${API.vendors}/${companyId}/contacts`, {
      data: { firstName: 'Anna', lastName: contactName },
    });
    expect(contact.ok(), 'POST company contact').toBeTruthy();

    const search = new CommandSearchPanel(page);
    await page.goto(ROUTES.home);
    await pageHeading(page);
    await search.openWithShortcut();

    await search.search(`gruener testbau ${tag}`);
    const row = search.option('vendor', companyId);
    await expect(search.group('vendor')).toContainText('Companies');
    await expect(row).toBeVisible();
    await expect(row).toContainText(name);
    const mark = row.locator('mark').first();
    await expect(mark).toBeVisible();
    await expect(mark).toContainText('Testbau');
    const call = search.call(companyId);
    await expect(call).toHaveAttribute('href', 'tel:5550142');
    await expect(call).toHaveAttribute('tabindex', '-1');
    // The shared CallButton (#2213): its accessible name starts with the visible text "Call"
    await expect(call).toHaveText('Call');
    await expect(call).toHaveAccessibleName(`Call ${name} on 555-0142`);

    // The same company through the umlaut spelling
    await search.search(`grüner testbau ${tag}`);
    await expect(search.option('vendor', companyId)).toBeVisible();

    // A contact person's name finds the company and says where it matched
    await search.search(contactName);
    await expect(search.option('vendor', companyId)).toContainText('Contact person');
  });

  test('S5: line 2 shows the area path with an emphasised last level, and the status chip', async ({
    page,
    testPrefix,
  }) => {
    const tag = newTag(testPrefix);
    const house = `Haus ${tag}`;
    const floor = `Erdgeschoss ${tag}`;
    const kitchen = `Küche ${tag}`;
    const houseId = await createAreaViaApi(page, { name: house });
    cleanups.push(() => deleteAreaViaApi(page, houseId));
    const floorId = await createAreaViaApi(page, { name: floor, parentId: houseId });
    cleanups.push(() => deleteAreaViaApi(page, floorId));
    const kitchenId = await createAreaViaApi(page, { name: kitchen, parentId: floorId });
    cleanups.push(() => deleteAreaViaApi(page, kitchenId));
    const title = `Estrich Fläche ${tag}`;
    const taskId = await seedTask(page, title, kitchenId);

    const search = new CommandSearchPanel(page);
    await page.goto(ROUTES.home);
    await pageHeading(page);
    await search.openWithShortcut();
    await search.search(title);

    const row = search.option('work_item', taskId);
    await expect(row).toBeVisible();
    const first = row.getByText(house, { exact: true });
    const middle = row.getByText(floor, { exact: true });
    const last = row.getByText(kitchen, { exact: true });
    await expect(first).toBeVisible();
    await expect(middle).toBeVisible();
    await expect(last).toBeVisible();
    await expect(last).toHaveCSS('font-weight', '600');
    const colours = await Promise.all([
      first.evaluate((el) => getComputedStyle(el).color),
      last.evaluate((el) => getComputedStyle(el).color),
    ]);
    expect(colours[0], 'ancestor levels use a quieter colour').not.toBe(colours[1]);
    await expect(row).toContainText('Not started');
  });

  test('S5b: an area result opens the Areas page (#2218)', async ({ page, testPrefix }) => {
    const tag = newTag(testPrefix);
    const name = `Keller ${tag}`;
    const areaId = await createAreaViaApi(page, { name });
    cleanups.push(() => deleteAreaViaApi(page, areaId));

    const search = new CommandSearchPanel(page);
    await page.goto(ROUTES.home);
    await pageHeading(page);
    await search.openWithShortcut();
    await search.search(name);

    const row = search.option('area', areaId);
    await expect(row).toBeVisible();
    await row.click();

    await page.waitForURL((url) => url.pathname === routeUrl('areas'));
    await expect(search.dialog).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: 'Areas', exact: true })).toBeVisible();
  });

  test('S6: arrows move the active row, Enter opens the company, Back returns', async ({
    page,
    testPrefix,
  }) => {
    const tag = newTag(testPrefix);
    await seedCompany(page, `Grüner Testbau ${tag} A`);
    await seedCompany(page, `Grüner Testbau ${tag} B`);

    const search = new CommandSearchPanel(page);
    await page.goto(ROUTES.home);
    await pageHeading(page);
    await search.openWithShortcut();
    await search.search(`gruener testbau ${tag}`);
    await expect(search.options('vendor')).toHaveCount(2);

    await expect(search.input).toHaveAttribute('aria-activedescendant', /.+/);
    const firstActive = await search.activeDescendant();
    await expect(search.activeOption()).toHaveCount(1);

    await page.keyboard.press('ArrowDown');
    await expect.poll(() => search.activeDescendant()).not.toBe(firstActive);
    await expect(search.activeOption()).toHaveCount(1);
    const secondActive = await search.activeDescendant();
    expect(await search.activeOption().getAttribute('id')).toBe(secondActive);

    await page.keyboard.press('ArrowUp');
    await expect.poll(() => search.activeDescendant()).toBe(firstActive);

    const testId = await search.activeOption().getAttribute('data-testid');
    const companyId = (testId ?? '').replace('command-search-option-vendor-', '');
    expect(companyId).not.toBe('');
    await page.keyboard.press('Enter');

    await page.waitForURL((url) => url.pathname === routeUrl('company', { id: companyId }));
    await expect(search.dialog).toBeHidden();
    await expect(page.locator('main h1').first()).toBeFocused();

    await page.goBack();
    await page.waitForURL((url) => url.pathname === ROUTES.home);
    await expect(search.dialog).toBeHidden();
  });

  test('S7a: a "Go to" destination shows the former name and replaces from its own section', async ({
    page,
  }) => {
    const search = new CommandSearchPanel(page);
    await page.goto(routeUrl('workItems'));
    await pageHeading(page);
    const before = await historyLength(page);

    await search.openWithShortcut();
    await search.search('gantt');
    await expect(search.gotoGroup).toBeVisible();
    const schedule = search.destByLabel('Schedule');
    await expect(schedule).toBeVisible();
    await expect(schedule).toContainText('Formerly “Gantt”');

    await page.keyboard.press('Enter');
    await page.waitForURL((url) => url.pathname === routeUrl('scheduleGantt'));
    await expect(search.dialog).toBeHidden();
    expect(await historyLength(page), 'same-section jump replaces the entry').toBe(before);
  });

  test('S7b: a "Go to" destination from another section pushes a history entry', async ({
    page,
  }) => {
    const search = new CommandSearchPanel(page);
    await page.goto(ROUTES.home);
    await pageHeading(page);
    const before = await historyLength(page);

    await search.openWithShortcut();
    await search.search('gantt');
    await expect(search.destByLabel('Schedule')).toBeVisible();
    await page.keyboard.press('Enter');
    await page.waitForURL((url) => url.pathname === routeUrl('scheduleGantt'));
    expect(await historyLength(page), 'cross-section jump pushes').toBe(before + 1);
  });

  test('S8: one character shows the hint and sends no request', async ({ page }) => {
    const search = new CommandSearchPanel(page);
    const queries: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/search')) {
        queries.push(new URL(request.url()).searchParams.get('q') ?? '');
      }
    });
    await page.goto(ROUTES.home);
    await pageHeading(page);
    await search.openWithShortcut();

    await search.input.fill('x');
    await expect(page.getByText('Type at least 2 characters', { exact: false })).toBeVisible();

    // A second character sends exactly one request, for "xq" - none was sent for "x"
    await search.search('xq');
    expect(queries).toEqual(['xq']);
  });

  test('S9: no results shows the EmptyState and a matching live status', async ({
    page,
    testPrefix,
  }) => {
    const token = `zzqnomatch${newTag(testPrefix).replace(/[^a-z0-9]/gi, '')}`;
    const search = new CommandSearchPanel(page);
    await page.goto(ROUTES.home);
    await pageHeading(page);
    await search.openWithShortcut();
    await search.search(token);

    await expect(search.empty).toContainText(`No results for “${token}”`);
    await expect(search.status).toContainText(`No results for ${token}`);
  });

  test('S10: "Show n more" expands the group, keeps the dialog open and activates the new row', async ({
    page,
    testPrefix,
  }) => {
    const tag = newTag(testPrefix);
    for (let i = 1; i <= 7; i += 1) {
      await seedTask(page, `Estrich Probe ${tag} ${i}`);
    }
    const search = new CommandSearchPanel(page);
    await page.goto(ROUTES.home);
    await pageHeading(page);
    await search.openWithShortcut();
    await search.search(`Estrich Probe ${tag}`);

    await expect(search.group('work_item')).toContainText('5 of 7');
    await expect(search.options('work_item')).toHaveCount(5);
    await expect(search.more('work_item')).toContainText('Show 2 more');

    // Arrow down to the "Show 2 more" row, then Enter
    for (let step = 0; step < 12; step += 1) {
      if ((await search.more('work_item').getAttribute('aria-selected')) === 'true') break;
      await page.keyboard.press('ArrowDown');
    }
    await expect(search.more('work_item')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');

    await expect(search.options('work_item')).toHaveCount(7);
    await expect(search.dialog).toBeVisible();
    const sixth = await search.options('work_item').nth(5).getAttribute('id');
    await expect.poll(() => search.activeDescendant()).toBe(sixth);
  });

  test('S11: unavailable documents show a note; a failed request offers Try again', async ({
    page,
    testPrefix,
  }) => {
    const tag = newTag(testPrefix);
    const title = `Estrich Probe ${tag} 1`;
    const taskId = await seedTask(page, title);

    let mode: 'unavailable' | 'abort' | 'real' = 'unavailable';
    await page.route(/\/api\/search\?/, async (route) => {
      if (mode === 'abort') {
        await route.abort();
        return;
      }
      if (mode === 'real') {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const body = (await response.json()) as { groups: unknown[] };
      body.groups.push({ type: 'paperless_document', total: 0, status: 'unavailable', items: [] });
      await route.fulfill({ response, json: body });
    });

    const search = new CommandSearchPanel(page);
    await page.goto(ROUTES.home);
    await pageHeading(page);
    await search.openWithShortcut();

    await search.search(`Estrich Probe ${tag}`);
    await expect(search.documentsUnavailable).toBeVisible();
    await expect(search.status).toContainText('Documents are not available right now.');

    mode = 'abort';
    await search.input.fill(title);
    await expect(page.getByText("Search didn't work", { exact: false })).toBeVisible();
    await expect(search.retry).toBeVisible();

    mode = 'real';
    await page.unroute(/\/api\/search\?/);
    await search.retry.click();
    await expect(search.option('work_item', taskId)).toBeVisible();
    await expect(search.retry).toBeHidden();
  });

  test('S12: a list search offers "Search everywhere" and the query clears on close', async ({
    page,
    testPrefix,
  }) => {
    const tag = newTag(testPrefix);
    const title = `Estrich Probe ${tag}`;
    const taskId = await seedTask(page, title);

    const search = new CommandSearchPanel(page);
    const tasks = new WorkItemsPage(page);
    await page.goto(routeUrl('workItems'));
    await pageHeading(page);

    await tasks.search(title);
    await expect(search.everywhereRow).toBeVisible();
    await expect(search.everywhereRow).toContainText(`Search everywhere for “${title}”`);
    await expect(tasks.searchInput).toHaveValue(title);

    // A token the list cannot match keeps both the field and the row on screen
    const miss = `zzqmiss${tag.replace(/[^a-z0-9]/gi, '')}`;
    await tasks.search(miss);
    await expect(tasks.searchInput).toBeVisible();
    await expect(search.everywhereRow).toBeVisible();

    await tasks.search(title);
    await search.everywhereRow.click();
    await search.waitForOpen();
    await expect(search.input).toHaveValue(title);
    await expect(search.option('work_item', taskId)).toBeVisible();

    await search.closeWithEscape();
    await expect(tasks.searchInput).toBeFocused();

    await search.openWithShortcut();
    await expect(search.input).toHaveValue('');
    await search.closeWithEscape();

    // The users list is not searchable from the palette: no row
    await page.goto(ROUTES.userManagement);
    await pageHeading(page);
    const usersField = page.getByLabel('Search items');
    await usersField.fill('ab');
    await expect(usersField).toHaveValue('ab');
    await expect(search.everywhereRow).toHaveCount(0);
  });

  test('S13: "/" focuses and selects the list search; on Home it opens the palette', async ({
    page,
  }) => {
    const search = new CommandSearchPanel(page);
    const tasks = new WorkItemsPage(page);
    await page.goto(routeUrl('workItems'));
    await pageHeading(page);

    await tasks.search('abc');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(tasks.searchInput).not.toBeFocused();
    await page.keyboard.press('/');
    await expect(tasks.searchInput).toBeFocused();
    const selection = await tasks.searchInput.evaluate((el: HTMLInputElement) => ({
      start: el.selectionStart,
      end: el.selectionEnd,
      length: el.value.length,
    }));
    expect(selection).toEqual({ start: 0, end: 3, length: 3 });
    await expect(search.dialog).toBeHidden();

    await page.goto(ROUTES.home);
    await pageHeading(page);
    await page.keyboard.press('/');
    await search.waitForOpen();
  });

  test('S14: "n" creates on each list, opens the New menu on Home, and types into the palette', async ({
    page,
  }) => {
    const search = new CommandSearchPanel(page);
    const newMenu = new CreateMenu(page);

    await page.goto(routeUrl('householdItems'));
    await pageHeading(page);
    await page.keyboard.press('n');
    await expect(new ObjectFormDialog(page, 'New purchase').dialog).toBeVisible();

    await page.goto(routeUrl('companies'));
    await pageHeading(page);
    await page.keyboard.press('n');
    await expect(new VendorsPage(page).createDialog.dialog).toBeVisible();

    await page.goto(routeUrl('invoices'));
    await pageHeading(page);
    // `n` follows the New invoice button: both wait for the integration status to load
    await expect(new InvoicesPage(page).newInvoiceButton).toBeEnabled();
    await page.keyboard.press('n');
    await expect(new InvoicesPage(page).createModal).toBeVisible();

    await page.goto(routeUrl('diary'));
    await pageHeading(page);
    await page.keyboard.press('n');
    await page.waitForURL((url) => url.pathname === routeUrl('diaryEntryNew'));

    await page.goto(ROUTES.home);
    await pageHeading(page);
    await page.keyboard.press('n');
    await expect(newMenu.menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(newMenu.menu).toBeHidden();

    // With the palette open, `n` is just a letter
    await search.openWithShortcut();
    await page.keyboard.press('n');
    await expect(search.input).toHaveValue('n');
    await expect(search.dialog).toBeVisible();
    await expect(newMenu.menu).toBeHidden();
    expect(new URL(page.url()).pathname).toBe(ROUTES.home);
  });

  test('S16a: Tab cycles input, Clear, input and never stops on an option', async ({
    page,
    testPrefix,
  }) => {
    const tag = newTag(testPrefix);
    await seedCompany(page, `Grüner Testbau ${tag}`, { phone: '555-0142' });
    const search = new CommandSearchPanel(page);
    await page.goto(ROUTES.home);
    await pageHeading(page);
    await search.openWithShortcut();
    await search.search(`gruener testbau ${tag}`);
    await expect(search.options('vendor')).toHaveCount(1);

    await page.keyboard.press('Tab');
    await expect(search.clear).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(search.input).toBeFocused();
  });

  test('S17: one search field per screen, and the list field is inert while the palette is open', async ({
    page,
  }) => {
    const search = new CommandSearchPanel(page);
    const screens: Array<{ route: string; fields: number }> = [
      { route: ROUTES.home, fields: 0 },
      { route: routeUrl('workItems'), fields: 1 },
      { route: routeUrl('householdItems'), fields: 1 },
      { route: routeUrl('invoices'), fields: 1 },
      { route: routeUrl('companies'), fields: 1 },
      { route: routeUrl('milestones'), fields: 1 },
      { route: routeUrl('diary'), fields: 1 },
    ];

    for (const screen of screens) {
      await page.goto(screen.route);
      await pageHeading(page);
      await expect
        .poll(() => liveSearchFieldCount(page), { message: `fields on ${screen.route}` })
        .toBe(screen.fields);

      await search.openWithShortcut();
      await expect
        .poll(() => liveSearchFieldCount(page), {
          message: `fields with palette on ${screen.route}`,
        })
        .toBe(1);
      await expect(search.input).toHaveAttribute('role', 'combobox');
      if (screen.fields === 1) {
        const inert = await page.evaluate(() => {
          const field = document.querySelector('[data-page-search]');
          return field !== null && field.closest('[inert]') !== null;
        });
        expect(inert, `list field inert on ${screen.route}`).toBe(true);
      }
      await search.closeWithEscape();
    }

    expect(await search.topBarButton.evaluate((el) => el.tagName)).toBe('BUTTON');
  });

  test('S18: Back closes the palette and opening it adds no history entry', async ({ page }) => {
    const search = new CommandSearchPanel(page);
    const appShell = new AppShellPage(page);
    await page.goto(ROUTES.home);
    await pageHeading(page);
    await appShell.navigateTo('workItems');
    await page.waitForURL((url) => url.pathname === routeUrl('workItems'));
    const before = await historyLength(page);

    await search.openWithShortcut();
    expect(await historyLength(page)).toBe(before);

    await page.goBack();
    await page.waitForURL((url) => url.pathname === ROUTES.home);
    await expect(search.dialog).toBeHidden();
  });

  test('S19: palette sizes at 1920x1080', async ({ page }) => {
    const search = new CommandSearchPanel(page);
    await page.goto(ROUTES.home);
    await pageHeading(page);
    await search.openWithShortcut();
    await search.search('photos');

    const panel = search.dialog.locator(':scope > div').nth(1);
    expect((await panel.boundingBox())?.width).toBe(640);
    expect((await search.inputRow.boundingBox())?.height).toBe(56);
    expect((await search.input.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    const photos = search.destByLabel('Photos');
    await expect(photos).toBeVisible();
    expect((await photos.boundingBox())?.height).toBe(44);
    await expect(search.footer).toBeVisible();
  });
});

test.describe('Command search - themes and languages', () => {
  test('S20: dark mode highlights the active row and underlines the match', async ({
    page,
    browser,
    testPrefix,
  }) => {
    const tag = newTag(testPrefix);
    const companyId = await seedCompany(page, `Grüner Testbau ${tag}`);
    const context = await browser.newContext({ colorScheme: 'dark', storageState: ADMIN_STATE });
    const dark = await context.newPage();
    try {
      const search = new CommandSearchPanel(dark);
      await dark.goto(ROUTES.home);
      await pageHeading(dark);
      await search.openWithShortcut();
      await search.search(`gruener testbau ${tag}`);
      const row = search.option('vendor', companyId);
      await expect(row).toBeVisible();
      await expect(search.activeOption()).toHaveAttribute(
        'data-testid',
        `command-search-option-vendor-${companyId}`,
      );

      const expected = await dark.evaluate(() => {
        const probe = document.createElement('div');
        probe.style.backgroundColor = 'var(--color-primary-bg)';
        document.body.appendChild(probe);
        const colour = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return colour;
      });
      await expect(row).toHaveCSS('background-color', expected);
      await expect(row.locator('mark').first()).toHaveCSS('text-decoration-line', 'underline');
    } finally {
      await context.close();
    }
  });

  test('S21: German locale shows "Firmen" and folding finds Grüner', async ({
    page,
    browser,
    testPrefix,
  }) => {
    const tag = newTag(testPrefix);
    const companyId = await seedCompany(page, `Grüner Testbau ${tag}`);
    const context = await browser.newContext({ locale: 'de-DE', storageState: ADMIN_STATE });
    const german = await context.newPage();
    try {
      const search = new CommandSearchPanel(german);
      await german.goto(ROUTES.home);
      await pageHeading(german);
      await search.openWithShortcut();
      await search.search(`gruner testbau ${tag}`);
      await expect(search.option('vendor', companyId)).toBeVisible();
      await expect(search.group('vendor')).toContainText('Firmen');
    } finally {
      await context.close();
    }
  });
});

test.describe('Command search on phone and tablet', { tag: '@responsive' }, () => {
  test.beforeEach(({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 1024, 'the full-screen sheet is below 1024px');
  });

  test('S15: the magnifier opens a full-screen sheet and Close returns focus to it', async ({
    page,
    testPrefix,
  }) => {
    const tag = newTag(testPrefix);
    const name = `Grüner Testbau ${tag}`;
    const companyId = await seedCompany(page, name);
    const search = new CommandSearchPanel(page);
    const appShell = new AppShellPage(page);

    await page.goto(ROUTES.home);
    await pageHeading(page);
    await appShell.navigateTo('workItems');

    const trigger = await search.topBarButton.boundingBox();
    expect(trigger?.width).toBeGreaterThanOrEqual(44);
    expect(trigger?.height).toBeGreaterThanOrEqual(44);
    await search.topBarButton.click();
    await search.waitForOpen();

    const viewport = page.viewportSize();
    const sheet = await search.sheet.boundingBox();
    expect(sheet?.x).toBe(0);
    expect(sheet?.y).toBe(0);
    expect(sheet?.width).toBe(viewport?.width);
    expect(sheet?.height).toBe(viewport?.height);
    // The sheet header (input row wrapper -> header) is exactly 56px
    const header = search.inputRow.locator('xpath=../..');
    expect((await header.boundingBox())?.height).toBe(56);
    // The input fills the row: a real tap target, not a 21px strip
    expect((await search.input.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    // The row fills the header's content box (56px minus the header's 1px bottom border)
    expect((await search.inputRow.boundingBox())?.height).toBeGreaterThanOrEqual(55);
    await expect(search.input).toBeFocused();

    await search.search(`gruener testbau ${tag}`);
    await expect(search.option('vendor', companyId)).toBeVisible();
    const results = await search.results.boundingBox();
    expect(results?.width).toBeLessThanOrEqual(640);

    await search.sheetClose.click();
    await expect(search.dialog).toBeHidden();
    await expect(search.topBarButton).toBeFocused();
  });

  test('S16b: Tab cycles input, Clear, Close and back to the input', async ({
    page,
    testPrefix,
  }) => {
    const tag = newTag(testPrefix);
    await seedCompany(page, `Grüner Testbau ${tag}`, { phone: '555-0142' });
    const search = new CommandSearchPanel(page);
    await page.goto(ROUTES.home);
    await pageHeading(page);
    await search.topBarButton.click();
    await search.waitForOpen();
    await search.search(`gruener testbau ${tag}`);
    await expect(search.options('vendor')).toHaveCount(1);

    await page.keyboard.press('Tab');
    await expect(search.clear).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(search.sheetClose).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(search.input).toBeFocused();
  });
});
