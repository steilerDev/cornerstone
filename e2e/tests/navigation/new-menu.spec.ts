/**
 * E2E New menu (Story #2212 / EPIC-21, P1.6)
 *
 * The top bar's "New v" (from 1024px) and the bottom bar's plus (below 1024px) open one list of
 * create entries: Diary entry, Task, Purchase, Invoice, Offer, Company, Milestone, plus Funding
 * source and Grant on Money pages only. Task, Purchase and Milestone open the ObjectForm dialog
 * over the page you came from (object-form.spec.ts); the rest open an existing create UI via
 * `?create=1`. A page can pre-fill the entries it knows about (company page, calendar date).
 *
 * Scenarios:
 * - N1  (desktop)   menu rows in order, Money rows only on Money pages, 40px rows, 224px+ panel,
 *                   keyboard (Enter, arrows with wrap, Home/End, Escape, `n`), real hrefs,
 *                   focus returns to New after the dialog closes
 * - N2  (< 1024px)  the plus opens the New sheet: Diary entry first, 44px rows, Money group on
 *                   Money pages, Escape and Close return focus to the plus
 * - N3              `n`: the page owning `n` (Tasks) wins, elsewhere it opens the New menu
 * - N4              pre-fill: company page -> Purchase / Invoice / Offer, Calendar date ->
 *                   Milestone; invalid or unknown values are dropped; a pre-filled form that
 *                   was not touched closes without a prompt
 * - N5              Funding source / Grant / Company open their create UI with focus inside
 *
 * Data: synthetic company created through the API and removed in afterAll. No users are created.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { routeUrl } from '../../../shared/src/routes/index.js';
import {
  createAreaViaApi,
  createVendorViaApi,
  deleteAreaViaApi,
  deleteVendorViaApi,
} from '../../fixtures/apiHelpers.js';
import { ROUTES } from '../../fixtures/testData.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { FinancingFormDialog } from '../../pages/FinancingFormDialog.js';
import {
  CREATE_ENTRY_LABELS,
  CreateMenu,
  GENERAL_CREATE_ENTRIES,
  MONEY_CREATE_ENTRIES,
} from '../../pages/components/CreateMenu.js';
import { HouseholdItemCreatePage } from '../../pages/HouseholdItemCreatePage.js';
import { InvoicesPage } from '../../pages/InvoicesPage.js';
import { MilestoneCreatePage } from '../../pages/MilestoneCreatePage.js';
import { TimelinePage } from '../../pages/TimelinePage.js';
import { VendorsPage } from '../../pages/VendorsPage.js';
import { WorkItemCreatePage } from '../../pages/WorkItemCreatePage.js';
import { WorkItemsPage } from '../../pages/WorkItemsPage.js';

const runId = Date.now().toString(36);
const COMPANY = `E2E New menu ${runId} company`;

const GENERAL_LABELS = GENERAL_CREATE_ENTRIES.map((id) => CREATE_ENTRY_LABELS[id]);
const ALL_LABELS = [...GENERAL_CREATE_ENTRIES, ...MONEY_CREATE_ENTRIES].map(
  (id) => CREATE_ENTRY_LABELS[id],
);

/** Today as the browser sees it (the Calendar pre-fills today when it is on screen). */
function localToday(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

function pathnameIs(path: string) {
  return (url: URL) => url.pathname === path;
}

let companyId = '';

test.describe('New menu (#2212)', { tag: '@responsive' }, () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'test-results/.auth/admin.json' });
    const page = await context.newPage();
    try {
      await page.goto(ROUTES.home);
      companyId = await createVendorViaApi(page, { name: COMPANY });
    } finally {
      await context.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    if (!companyId) return;
    const context = await browser.newContext({ storageState: 'test-results/.auth/admin.json' });
    const page = await context.newPage();
    try {
      await page.goto(ROUTES.home);
      await deleteVendorViaApi(page, companyId);
    } finally {
      await context.close();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // N1 — desktop menu (from 1024px)
  // ───────────────────────────────────────────────────────────────────────────

  test.describe('desktop menu', () => {
    test.beforeEach(({ page }) => {
      test.skip(
        (page.viewportSize()?.width ?? 0) < 1024,
        'the top-bar menu exists from 1024px; N2 covers the sheet below',
      );
    });

    test('N1: rows are Diary entry, Task, Purchase, Invoice, Offer, Company, Milestone', async ({
      page,
    }) => {
      const createMenu = new CreateMenu(page);
      await page.goto(ROUTES.home);

      await expect(createMenu.trigger).toHaveAttribute('aria-haspopup', 'menu');
      await expect(createMenu.trigger).toHaveAttribute('aria-expanded', 'false');
      await createMenu.open();
      await expect(createMenu.trigger).toHaveAttribute('aria-expanded', 'true');

      await expect(createMenu.rows()).toHaveText(GENERAL_LABELS);
      await expect(createMenu.rows()).toHaveCount(GENERAL_CREATE_ENTRIES.length);
      for (const id of MONEY_CREATE_ENTRIES) {
        await expect(createMenu.row(id)).toHaveCount(0);
      }
    });

    test('N1: Money pages add a separator, Funding source and Grant', async ({ page }) => {
      const createMenu = new CreateMenu(page);
      await page.goto(routeUrl('budgetOverview'));

      await createMenu.open();

      await expect(createMenu.rows()).toHaveText(ALL_LABELS);
      await expect(createMenu.menu.getByRole('separator')).toHaveCount(1);
      // The separator sits between Milestone and Funding source
      const order = await createMenu.menu
        .locator('[role="menuitem"], [role="separator"]')
        .evaluateAll((els) => els.map((el) => el.getAttribute('role')));
      expect(order).toEqual([
        ...GENERAL_CREATE_ENTRIES.map(() => 'menuitem'),
        'separator',
        ...MONEY_CREATE_ENTRIES.map(() => 'menuitem'),
      ]);
    });

    test('N1: rows are exactly 40px tall and the panel is at least 224px wide', async ({
      page,
    }) => {
      const createMenu = new CreateMenu(page);
      await page.goto(ROUTES.home);
      await createMenu.open();

      for (const id of GENERAL_CREATE_ENTRIES) {
        const box = await createMenu.row(id).boundingBox();
        expect(box?.height, `${id} row height`).toBe(40);
      }
      const panel = await createMenu.menu.boundingBox();
      expect(panel?.width ?? 0).toBeGreaterThanOrEqual(224);
    });

    test('N1: Enter opens with focus on the first row; arrows wrap; Home and End; Escape returns to New', async ({
      page,
    }) => {
      const createMenu = new CreateMenu(page);
      await page.goto(ROUTES.home);

      await createMenu.trigger.focus();
      await page.keyboard.press('Enter');
      await expect(createMenu.menu).toBeVisible();
      await expect(createMenu.row('diaryEntry')).toBeFocused();

      await page.keyboard.press('ArrowUp');
      await expect(createMenu.row('milestone')).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(createMenu.row('diaryEntry')).toBeFocused();
      await page.keyboard.press('End');
      await expect(createMenu.row('milestone')).toBeFocused();
      await page.keyboard.press('Home');
      await expect(createMenu.row('diaryEntry')).toBeFocused();

      await page.keyboard.press('Escape');
      await expect(createMenu.menu).toBeHidden();
      await expect(createMenu.trigger).toBeFocused();
    });

    test('N1: n opens the menu; Escape returns focus to where it was', async ({ page }) => {
      const createMenu = new CreateMenu(page);
      const appShell = new AppShellPage(page);
      await page.goto(ROUTES.home);
      await expect(appShell.userMenuTrigger).toBeVisible();

      await appShell.userMenuTrigger.focus();
      await page.keyboard.press('n');
      await expect(createMenu.menu).toBeVisible();
      await expect(createMenu.row('diaryEntry')).toBeFocused();

      await page.keyboard.press('Escape');
      await expect(createMenu.menu).toBeHidden();
      await expect(appShell.userMenuTrigger).toBeFocused();
    });

    test('N1: n with nothing focused: Escape never leaves focus on <body>', async ({ page }) => {
      const createMenu = new CreateMenu(page);
      await page.goto(ROUTES.home);
      await expect(createMenu.trigger).toBeVisible();

      await page.keyboard.press('n');
      await expect(createMenu.row('diaryEntry')).toBeFocused();
      await page.keyboard.press('Escape');

      await expect(createMenu.menu).toBeHidden();
      await expect(createMenu.trigger).toBeFocused();
    });

    test('N1: every row is a real link (middle-click and copy-link work)', async ({ page }) => {
      const createMenu = new CreateMenu(page);
      await page.goto(ROUTES.home);
      await createMenu.open();

      await expect(createMenu.row('diaryEntry')).toHaveAttribute('href', routeUrl('diaryEntryNew'));
      await expect(createMenu.row('task')).toHaveAttribute('href', routeUrl('workItemNew'));
      await expect(createMenu.row('purchase')).toHaveAttribute(
        'href',
        routeUrl('householdItemNew'),
      );
      await expect(createMenu.row('invoice')).toHaveAttribute(
        'href',
        routeUrl('invoices', undefined, { create: '1' }),
      );
      await expect(createMenu.row('offer')).toHaveAttribute(
        'href',
        routeUrl('invoices', undefined, { create: '1', kind: 'offer' }),
      );
      await expect(createMenu.row('company')).toHaveAttribute('href', routeUrl('companyNew'));
      await expect(createMenu.row('milestone')).toHaveAttribute('href', routeUrl('milestoneNew'));
    });

    test('N1: choosing Task opens the dialog; closing it returns focus to New', async ({
      page,
    }) => {
      const createMenu = new CreateMenu(page);
      const createPage = new WorkItemCreatePage(page);
      await page.goto(ROUTES.home);

      await createMenu.choose('task');

      await page.waitForURL(pathnameIs(routeUrl('workItemNew')));
      await createPage.form.waitForOpen();
      // The Home page stays behind the dialog
      expect(new URL(page.url()).pathname).toBe(routeUrl('workItemNew'));

      await page.keyboard.press('Escape');
      await page.waitForURL(pathnameIs(ROUTES.home));
      await createPage.form.waitForClosed();
      // The menu row that opened it is gone: focus lands on the New button, never on <body>
      await expect(createMenu.trigger).toBeFocused();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // N2 — phone and tablet sheet (below 1024px)
  // ───────────────────────────────────────────────────────────────────────────

  test.describe('sheet below 1024px', () => {
    test.beforeEach(({ page }) => {
      test.skip(
        (page.viewportSize()?.width ?? 0) >= 1024,
        'the plus and the New sheet exist below 1024px only',
      );
    });

    test('N2: the plus opens the New sheet with Diary entry first and 44px rows', async ({
      page,
    }) => {
      const createMenu = new CreateMenu(page);
      await page.goto(ROUTES.home);

      await expect(createMenu.plusButton).toHaveAttribute('aria-haspopup', 'dialog');
      await expect(createMenu.plusButton).toHaveAttribute('aria-expanded', 'false');
      await createMenu.open();
      await expect(createMenu.plusButton).toHaveAttribute('aria-expanded', 'true');

      await expect(createMenu.sheetDialog).toBeVisible();
      await expect(createMenu.rows()).toHaveText(GENERAL_LABELS);
      await expect(createMenu.rows().first()).toHaveText('Diary entry');
      for (const id of GENERAL_CREATE_ENTRIES) {
        const box = await createMenu.row(id).boundingBox();
        expect(box?.height, `${id} row height`).toBe(44);
      }
      for (const id of MONEY_CREATE_ENTRIES) {
        await expect(createMenu.row(id)).toHaveCount(0);
      }
    });

    test('N2: Money pages add a Money group below the general rows', async ({ page }) => {
      const createMenu = new CreateMenu(page);
      await page.goto(routeUrl('budgetOverview'));

      await createMenu.open();

      await expect(createMenu.rows()).toHaveText(ALL_LABELS);
      await expect(createMenu.row('fundingSource')).toBeVisible();
      await expect(createMenu.row('grant')).toBeVisible();
    });

    test('N2: Escape and Close return focus to the plus', async ({ page }) => {
      const createMenu = new CreateMenu(page);
      await page.goto(ROUTES.home);

      await createMenu.open();
      await page.keyboard.press('Escape');
      await expect(createMenu.sheet).toHaveAttribute('data-open', 'false');
      await expect(createMenu.plusButton).toBeFocused();

      await createMenu.open();
      await createMenu.sheetClose.click();
      await expect(createMenu.sheet).toHaveAttribute('data-open', 'false');
      await expect(createMenu.plusButton).toBeFocused();
    });

    test('N2: choosing Task opens the dialog over the page; Escape returns to the plus', async ({
      page,
    }) => {
      const createMenu = new CreateMenu(page);
      const createPage = new WorkItemCreatePage(page);
      await page.goto(ROUTES.home);

      await createMenu.choose('task');

      await page.waitForURL(pathnameIs(routeUrl('workItemNew')));
      await createPage.form.waitForOpen();
      await expect(createMenu.sheet).toHaveAttribute('data-open', 'false');

      await page.keyboard.press('Escape');
      await page.waitForURL(pathnameIs(ROUTES.home));
      await createPage.form.waitForClosed();
      await expect(createMenu.plusButton).toBeFocused();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // N3 — the n shortcut
  // ───────────────────────────────────────────────────────────────────────────

  test('N3: n on Tasks opens the New task dialog; on Home it opens the New menu', async ({
    page,
  }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1024, 'a hardware-keyboard path: desktop only');
    const createMenu = new CreateMenu(page);
    const createPage = new WorkItemCreatePage(page);
    const tasks = new WorkItemsPage(page);

    await page.goto(routeUrl('workItems'));
    await tasks.waitForLoaded();
    await page.keyboard.press('n');
    await page.waitForURL(pathnameIs(routeUrl('workItemNew')));
    await createPage.form.waitForOpen();
    await expect(createMenu.menu).toBeHidden();

    // Page shortcuts are off while the dialog is open: a second n goes nowhere
    await createPage.titleInput.blur();
    await page.keyboard.press('n');
    await expect(page.getByRole('dialog')).toHaveCount(1);
    expect(new URL(page.url()).pathname).toBe(routeUrl('workItemNew'));

    const fresh = await page.context().newPage();
    try {
      await fresh.goto(ROUTES.home);
      await expect(fresh.getByRole('heading', { level: 1 })).toBeVisible();
      await fresh.keyboard.press('n');
      await expect(new CreateMenu(fresh).menu).toBeVisible();
    } finally {
      await fresh.close();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // N4 — pre-fill from the page you are on
  // ───────────────────────────────────────────────────────────────────────────

  test.describe('pre-fill', () => {
    test('N4: from a company page, Purchase starts with that company; Escape needs no prompt', async ({
      page,
    }) => {
      const createMenu = new CreateMenu(page);
      const createPage = new HouseholdItemCreatePage(page);
      const companyPath = routeUrl('company', { id: companyId });
      await page.goto(companyPath);
      await expect(page.getByRole('heading', { level: 1, name: COMPANY })).toBeVisible();

      await createMenu.choose('purchase');

      await createPage.form.waitForOpen();
      await expect(createPage.vendorSelectedDisplay).toContainText(COMPANY);

      // Nothing typed: closing is immediate, back on the company page
      await page.keyboard.press('Escape');
      await createPage.form.waitForClosed();
      await expect(createPage.form.discardConfirm.dialog).toHaveCount(0);
      expect(new URL(page.url()).pathname).toBe(companyPath);
    });

    test('N4: from a company page, Invoice and Offer start with that company', async ({ page }) => {
      const createMenu = new CreateMenu(page);
      const invoices = new InvoicesPage(page);
      const companyPath = routeUrl('company', { id: companyId });

      await page.goto(companyPath);
      await expect(page.getByRole('heading', { level: 1, name: COMPANY })).toBeVisible();
      await createMenu.choose('invoice');

      await page.waitForURL(pathnameIs(routeUrl('invoices')));
      await expect(invoices.createDialog.dialog).toBeVisible();
      await expect(invoices.createDialog.companyChip()).toContainText(COMPANY);
      await expect(invoices.createDialog.status).toHaveValue('pending');
      // The request params are consumed: the URL is clean
      expect(new URL(page.url()).search).toBe('');

      await invoices.closeCreateModal();
      // Back to the company page (a fresh visit, not a same-URL goto)
      const fresh = await page.context().newPage();
      try {
        const freshMenu = new CreateMenu(fresh);
        const freshInvoices = new InvoicesPage(fresh);
        await fresh.goto(companyPath);
        await expect(fresh.getByRole('heading', { level: 1, name: COMPANY })).toBeVisible();
        await freshMenu.choose('offer');

        await fresh.waitForURL(pathnameIs(routeUrl('invoices')));
        // An offer has no Status field: the dialog is titled "New offer" and is sent as an offer
        await expect(freshInvoices.offerDialog.dialog).toBeVisible();
        await expect(freshInvoices.offerDialog.companyChip()).toContainText(COMPANY);
        await expect(freshInvoices.offerDialog.status).toHaveCount(0);
      } finally {
        await fresh.close();
      }
    });

    test('N4: on the Calendar, rows carry the visible date; Milestone starts with it', async ({
      page,
    }) => {
      const createMenu = new CreateMenu(page);
      const timeline = new TimelinePage(page);
      const createPage = new MilestoneCreatePage(page);
      const today = localToday();
      await page.goto(routeUrl('scheduleCalendar'));
      await timeline.calendarView.waitFor({ state: 'visible' });

      await createMenu.open();
      await expect(createMenu.row('diaryEntry')).toHaveAttribute(
        'href',
        routeUrl('diaryEntryNew', undefined, { date: today }),
      );
      // Task takes no date (UX: not task dates)
      await expect(createMenu.row('task')).toHaveAttribute('href', routeUrl('workItemNew'));
      await createMenu.row('milestone').click();

      await createPage.form.waitForOpen();
      await expect(createPage.targetDateInput).toHaveValue(today);
      // The Calendar stays behind the dialog
      await expect(timeline.calendarHeading).toBeVisible();
    });

    test('N4: on the Schedule there is no Add menu; New carries the week on screen and the chosen area (#2247)', async ({
      page,
      testPrefix,
    }) => {
      const createMenu = new CreateMenu(page);
      const timeline = new TimelinePage(page);
      let areaId: string | null = null;

      try {
        areaId = await createAreaViaApi(page, { name: `${testPrefix} Prefill Area` });
        await page.goto(`${routeUrl('scheduleGantt')}?areaId=${areaId}`);
        await timeline.heading.waitFor({ state: 'visible' });
        const surface = await timeline.surface();

        // The Schedule's own Add menu is gone: the global New menu creates objects
        await expect(page.getByTestId('timeline-add-button')).toHaveCount(0);

        await createMenu.open();
        const diaryHref = await createMenu.row('diaryEntry').getAttribute('href');
        const params = new URL(diaryHref!, 'http://localhost').searchParams;
        expect(params.get('areaId')).toBe(areaId);
        const date = params.get('date');
        expect(date, 'the diary entry starts on the week on screen').toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // Always a Monday: the agenda shows the current week, the chart the week at its left edge
        expect(new Date(`${date}T00:00:00Z`).getUTCDay()).toBe(1);
        if (surface === 'agenda') {
          const today = new Date(`${localToday()}T00:00:00Z`);
          const monday = new Date(today);
          monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
          expect(date).toBe(monday.toISOString().slice(0, 10));
        }
        await expect(createMenu.row('task')).toHaveAttribute(
          'href',
          routeUrl('workItemNew', undefined, { areaId }),
        );
      } finally {
        if (areaId) await deleteAreaViaApi(page, areaId);
      }
    });

    test('N4: invalid or unknown pre-fill values are dropped, never shown', async ({ page }) => {
      const badDate = await page.context().newPage();
      try {
        const milestone = new MilestoneCreatePage(badDate);
        await badDate.goto(routeUrl('milestoneNew', undefined, { date: 'bad' }));
        await milestone.form.waitForOpen();
        await expect(milestone.targetDateInput).toHaveValue('');
        // Not a real calendar date either
        await expect(milestone.targetDateInput).toHaveValue('');
      } finally {
        await badDate.close();
      }

      const unknownCompany = await page.context().newPage();
      try {
        const purchase = new HouseholdItemCreatePage(unknownCompany);
        await unknownCompany.goto(
          routeUrl('householdItemNew', undefined, { companyId: 'unknown-id' }),
        );
        await purchase.form.waitForOpen();
        // The picker input appears once the company options have loaded; the unknown id is cleared
        await expect(purchase.vendorSelect).toBeVisible();
        await expect(purchase.vendorSelect).toHaveValue('');
        await expect(purchase.vendorSelectedDisplay).toHaveCount(0);
        // Cleared without touching the form: no discard prompt on Escape
        await unknownCompany.keyboard.press('Escape');
        await purchase.form.waitForClosed();
        await expect(purchase.form.discardConfirm.dialog).toHaveCount(0);
      } finally {
        await unknownCompany.close();
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // N5 — create surfaces (?create=1 for the Money forms, dialog routes elsewhere)
  // ───────────────────────────────────────────────────────────────────────────

  test.describe('create surfaces', () => {
    async function chooseOnMoney(page: Page, entry: 'fundingSource' | 'grant' | 'company') {
      const createMenu = new CreateMenu(page);
      await page.goto(routeUrl('budgetOverview'));
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await createMenu.choose(entry);
    }

    test('N5: Funding source opens the New funding source dialog over Financing', async ({
      page,
    }) => {
      const dialog = new FinancingFormDialog(page, 'source');
      await chooseOnMoney(page, 'fundingSource');

      await page.waitForURL(pathnameIs(routeUrl('financing')));
      await dialog.waitForOpen();
      await expect(dialog.name).toBeFocused();
      // ?create=1&kind=source is consumed
      await expect.poll(() => new URL(page.url()).search).toBe('');
    });

    test('N5: Grant opens the New grant dialog over Financing', async ({ page }) => {
      const dialog = new FinancingFormDialog(page, 'grant');
      await chooseOnMoney(page, 'grant');

      await page.waitForURL(pathnameIs(routeUrl('financing')));
      await dialog.waitForOpen();
      await expect(dialog.name).toBeFocused();
      await expect.poll(() => new URL(page.url()).search).toBe('');
    });

    test('N5: Company opens the New company dialog over the page it was chosen on', async ({
      page,
    }) => {
      const vendors = new VendorsPage(page);
      await chooseOnMoney(page, 'company');

      await page.waitForURL(pathnameIs(routeUrl('companyNew')));
      await vendors.createDialog.waitForOpen();
      expect(new URL(page.url()).search).toBe('');
      // The Money page stays behind the dialog (#2213: Back closes it, nothing else changes)
      await page.goBack();
      await vendors.createDialog.waitForClosed();
      await page.waitForURL(pathnameIs(routeUrl('budgetOverview')));
    });

    test('N5: New › Invoice while already on Invoices opens the modal again', async ({ page }) => {
      const createMenu = new CreateMenu(page);
      const invoices = new InvoicesPage(page);
      await page.goto(routeUrl('invoices'));
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      await createMenu.choose('invoice');
      await expect(invoices.createModal).toBeVisible();
      await invoices.closeCreateModal();

      await createMenu.choose('invoice');
      await expect(invoices.createModal).toBeVisible();
    });
  });
});
