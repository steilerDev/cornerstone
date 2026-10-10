/**
 * E2E tests for Story #2196 [P0.5] Visual defects (EPIC-21).
 *
 * Scenarios (AC numbers refer to the story):
 *   1.  AC1  — purchase delete dialog is the shared Modal: drawn above the backdrop, usable,
 *              Escape closes it, confirming returns to the purchases list.
 *   2.  AC2  — phone width (390 px, light + dark): no sideways page scroll on (a) the task page
 *              with an expanded invoice group and (b) Settings > Manage, where the six tabs
 *              share one row and the last one is reachable.
 *   3.  AC3  — no empty / raw-id category chips (purchase page, task page), the company edit form
 *              shows the current trade, and diary workers use a plural-aware label (en + de).
 *   4.  AC4  — photo viewer: next arrow never sits under the details panel (desktop) or the
 *              open bottom sheet (phone), and stays clickable.
 *   5.  AC5  — empty-state links navigate in-app (no full page reload).
 *   6.  AC6  — area / trade delete copy comes from the rewritten locale values, and an area in
 *              use cannot be deleted (conflict text shown, area still exists).
 *   7.  AC7  — diary "Created" time uses the locale's own time format (no " at ", 24 h in German).
 *   8.  AC8  — viewport meta allows pinch-zoom.
 *   9.  AC10 — Sources > Show lines rows and Report wizard step 3 rows never overlap their cells.
 *   10. AC11 — the Back / trail navigation links on object pages are not dimmed at rest
 *       (#2202 replaced the "To Schedule" / "To Work Items" buttons with the breadcrumb row).
 *   11. AC9  — creating a task with a user AND a company is rejected with HTTP 400.
 *
 * Visual ACs use geometry (boundingBox, elementFromPoint, scrollWidth, getComputedStyle), never
 * screenshots. All data is synthetic and created / removed through the API with unique names via
 * `testPrefix`.
 *
 * Isolation: German tests change the locale preference, so this file runs as a dedicated
 * per-worker user (same approach as i18n.spec.ts). Every test that switches the locale resets it
 * to English in `afterEach`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../../fixtures/isolatedUser.js';
import { API, ROUTES } from '../../fixtures/testData.js';
import {
  createAreaViaApi,
  deleteAreaViaApi,
  createBudgetSourceViaApi,
  deleteBudgetSourceViaApi,
  createDiaryEntryViaApi,
  deleteDiaryEntryViaApi,
  createHouseholdItemViaApi,
  deleteHouseholdItemViaApi,
  createMilestoneViaApi,
  deleteMilestoneViaApi,
  createVendorViaApi,
  deleteVendorViaApi,
  createWorkItemViaApi,
  deleteWorkItemViaApi,
  uploadDiaryPhotoViaApi,
} from '../../fixtures/apiHelpers.js';
import { BreadcrumbsBar } from '../../pages/BreadcrumbsBar.js';
import { BudgetSourcesPage } from '../../pages/BudgetSourcesPage.js';
import { DashboardPage } from '../../pages/DashboardPage.js';
import { DiaryEntryDetailPage } from '../../pages/DiaryEntryDetailPage.js';
import { HouseholdItemDetailPage } from '../../pages/HouseholdItemDetailPage.js';
import { MilestoneDetailPage } from '../../pages/MilestoneDetailPage.js';
import { PhotoViewerPage } from '../../pages/PhotoViewerPage.js';
import { ReportWizardPage } from '../../pages/ReportWizardPage.js';
import { VendorDetailPage } from '../../pages/VendorDetailPage.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';

test.use({
  isolatedUserPerWorker: { emailPrefix: 'visdef', displayName: 'E2E Visual Defects' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type Cleanup = () => Promise<void>;
let cleanups: Cleanup[] = [];

test.beforeEach(() => {
  cleanups = [];
});

test.afterEach(async ({ page }) => {
  // Reverse order: links / children first, parents last
  for (const fn of cleanups.reverse()) {
    try {
      await fn();
    } catch {
      // best-effort; unique names keep leftovers harmless in the shared database
    }
  }
  // German tests switch the locale; always leave the dedicated user on English.
  try {
    await page.request.patch('/api/users/me/preferences', {
      data: { key: 'locale', value: 'en' },
    });
  } catch {
    // ignore
  }
});

const I18N_DIR = fileURLToPath(new URL('../../../client/src/i18n/', import.meta.url));

/** Reads one string value from a locale file, e.g. i18nValue('en', 'settings', 'manage.areas.deleteWarning'). */
function i18nValue(lang: 'en' | 'de', namespace: string, key: string): string {
  const json = JSON.parse(readFileSync(`${I18N_DIR}${lang}/${namespace}.json`, 'utf8')) as Record<
    string,
    unknown
  >;
  let node: unknown = json;
  for (const part of key.split('.')) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  if (typeof node !== 'string') {
    throw new Error(`i18n key ${lang}/${namespace}:${key} is not a string`);
  }
  return node;
}

async function setLanguage(page: Page, lang: 'en' | 'de'): Promise<void> {
  await page.request.patch('/api/users/me/preferences', { data: { key: 'locale', value: lang } });
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate((locale) => localStorage.setItem('locale', locale), lang);
}

async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate((value) => {
    document.documentElement.setAttribute('data-theme', value);
  }, theme);
}

async function hasSidewaysScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

function skipUnlessPhone(page: Page): void {
  const vp = page.viewportSize();
  test.skip(!vp || vp.width > 400, 'Phone-width (390 px) check');
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function intersects(a: Box, b: Box): boolean {
  const tolerance = 0.5;
  return (
    a.x < b.x + b.width - tolerance &&
    b.x < a.x + a.width - tolerance &&
    a.y < b.y + b.height - tolerance &&
    b.y < a.y + a.height - tolerance
  );
}

/** True when the element at the centre of `locator` is the element itself (or one of its children). */
async function isTopmostAtCentre(locator: Locator): Promise<boolean> {
  return locator.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return top === el || el.contains(top);
  });
}

/** Asserts that no two visible direct children of `row` overlap each other. */
async function expectNoOverlappingChildren(row: Locator, label: string): Promise<void> {
  const children = row.locator(':scope > *');
  const count = await children.count();
  const boxes: Array<{ index: number; box: Box }> = [];
  for (let i = 0; i < count; i++) {
    const box = await children.nth(i).boundingBox();
    if (box && box.width > 0 && box.height > 0) boxes.push({ index: i, box });
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      expect(
        intersects(boxes[i]!.box, boxes[j]!.box),
        `${label}: child ${boxes[i]!.index} overlaps child ${boxes[j]!.index}`,
      ).toBe(false);
    }
  }
}

async function makeVendor(page: Page, name: string): Promise<string> {
  const id = await createVendorViaApi(page, { name });
  cleanups.push(() => deleteVendorViaApi(page, id));
  return id;
}

async function makeWorkItem(
  page: Page,
  title: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const id = await createWorkItemViaApi(page, { title, ...extra });
  cleanups.push(() => deleteWorkItemViaApi(page, id));
  return id;
}

async function makePurchase(page: Page, name: string, category = 'hic-furniture'): Promise<string> {
  const id = await createHouseholdItemViaApi(page, { name, category });
  cleanups.push(() => deleteHouseholdItemViaApi(page, id));
  return id;
}

async function makeSource(page: Page, name: string, totalAmount: number): Promise<string> {
  const id = await createBudgetSourceViaApi(page, { name, totalAmount });
  cleanups.push(() => deleteBudgetSourceViaApi(page, id));
  return id;
}

async function makeInvoice(
  page: Page,
  vendorId: string,
  data: { invoiceNumber: string; amount: number; date: string },
): Promise<string> {
  const resp = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
    data: { status: 'pending', ...data },
  });
  expect(resp.ok(), `POST invoice failed: ${resp.status()}`).toBeTruthy();
  const body = (await resp.json()) as { invoice: { id: string } };
  const id = body.invoice.id;
  cleanups.push(async () => {
    await page.request.delete(`${API.vendors}/${vendorId}/invoices/${id}`);
  });
  return id;
}

async function makeBudgetLine(
  page: Page,
  workItemId: string,
  data: { plannedAmount: number; description: string; budgetSourceId?: string },
): Promise<string> {
  const resp = await page.request.post(`${API.workItems}/${workItemId}/budgets`, {
    data: {
      confidence: 'own_estimate',
      budgetSourceId: 'discretionary-system',
      includesVat: true,
      ...data,
    },
  });
  expect(resp.ok(), `POST budget line failed: ${resp.status()}`).toBeTruthy();
  const body = (await resp.json()) as { budget: { id: string } };
  return body.budget.id;
}

async function linkLine(
  page: Page,
  invoiceId: string,
  workItemBudgetId: string,
  itemizedAmount: number,
): Promise<void> {
  const resp = await page.request.post(`/api/invoices/${invoiceId}/budget-lines`, {
    data: { workItemBudgetId, itemizedAmount },
  });
  expect(resp.ok(), `POST invoice budget-line failed: ${resp.status()}`).toBeTruthy();
}

/** Makes the purchase wait for the task (HI dependency on a work item predecessor). */
async function linkPurchaseToWorkItem(
  page: Page,
  householdItemId: string,
  workItemId: string,
): Promise<void> {
  const resp = await page.request.post(`/api/household-items/${householdItemId}/dependencies`, {
    data: { predecessorType: 'work_item', predecessorId: workItemId },
  });
  expect(resp.ok(), `POST household item dependency failed: ${resp.status()}`).toBeTruthy();
}

const LONG_DESCRIPTION =
  'Complete supply and installation of the ground floor heating circuit including all manifolds and thermostats';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 (AC1): purchase delete dialog
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Visual defects — purchase delete dialog (AC1)', { tag: '@responsive' }, () => {
  test('Dialog is drawn above the backdrop, Escape closes it, confirming returns to the list', async ({
    page,
    testPrefix,
  }) => {
    const itemId = await makePurchase(page, `${testPrefix} Test Kitchen Island`);
    const detail = new HouseholdItemDetailPage(page);
    await detail.goto(itemId);

    // Open, and prove the confirm button is what a user would actually hit
    await detail.deleteButton.click();
    await expect(detail.deleteModal).toBeVisible();
    await expect(detail.deleteConfirmButton).toBeVisible();
    await expect.poll(() => isTopmostAtCentre(detail.deleteConfirmButton)).toBe(true);
    await expect.poll(() => isTopmostAtCentre(detail.deleteCancelButton)).toBe(true);
    await expect(detail.deleteModal).toContainText('Test Kitchen Island');

    // Cancel closes it
    await detail.deleteCancelButton.click();
    await expect(detail.deleteModal).toBeHidden();

    // Reopen: Escape closes it
    await detail.deleteButton.click();
    await expect(detail.deleteModal).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(detail.deleteModal).toBeHidden();

    // Reopen: confirming deletes and returns to the purchases list
    await detail.deleteButton.click();
    await expect(detail.deleteModal).toBeVisible();
    const deleteResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes(`${API.householdItems}/${itemId}`) &&
        resp.request().method() === 'DELETE',
    );
    await detail.deleteConfirmButton.click();
    await deleteResponse;
    await page.waitForURL(/\/project\/household-items$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2 (AC2): phone-width overflow
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Visual defects — no sideways scroll at 390 px (AC2)', { tag: '@responsive' }, () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`Task page with long title and expanded invoice group does not scroll sideways (${theme})`, async ({
      page,
      testPrefix,
    }) => {
      skipUnlessPhone(page);

      const vendorId = await makeVendor(
        page,
        `${testPrefix} Sample Plumbing and Heating Installations Company Limited`,
      );
      const invoiceNumber = `INVTEST0001LONGREFERENCE${'X'.repeat(40)}-${testPrefix}`;
      const invoiceId = await makeInvoice(page, vendorId, {
        invoiceNumber,
        amount: 1000,
        date: '2026-01-15',
      });
      const workItemId = await makeWorkItem(page, `Unbroken${'W'.repeat(70)}${testPrefix}`);
      const lineId = await makeBudgetLine(page, workItemId, {
        plannedAmount: 1000,
        description: LONG_DESCRIPTION,
      });
      await linkLine(page, invoiceId, lineId, 1000);
      const purchaseId = await makePurchase(page, `${testPrefix} Test Kitchen ${'K'.repeat(50)}`);
      await linkPurchaseToWorkItem(page, purchaseId, workItemId);

      const detail = new WorkItemDetailPage(page);
      await detail.goto(workItemId);
      await setTheme(page, theme);

      // Collapsed first, then expanded: both states must fit the viewport
      expect(await hasSidewaysScroll(page), 'before expanding the invoice group').toBe(false);

      const toggle = page
        .locator('[class*="toggleBtn"][aria-expanded]')
        .filter({ hasText: invoiceNumber })
        .first();
      await toggle.scrollIntoViewIfNeeded();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');

      expect(await hasSidewaysScroll(page), 'after expanding the invoice group').toBe(false);
    });

    test(`Settings Manage: one tab row, no sideways page scroll, last tab reachable (${theme})`, async ({
      page,
    }) => {
      skipUnlessPhone(page);

      await page.goto(ROUTES.manage);
      await page
        .getByRole('heading', { level: 1, name: 'Manage', exact: true })
        .waitFor({ state: 'visible' });
      await setTheme(page, theme);

      const tabs = page.getByRole('tab');
      await expect(tabs).toHaveCount(6);

      expect(await hasSidewaysScroll(page), 'Manage page').toBe(false);

      // All six tabs share one line (no second row)
      const offsets = await tabs.evaluateAll((els) =>
        els.map((el) => (el as HTMLElement).offsetTop),
      );
      expect(new Set(offsets).size, `tab offsetTop values: ${offsets.join(',')}`).toBe(1);

      // The tab list itself may scroll; the last tab can be scrolled into the visible area
      const lastTab = tabs.last();
      await lastTab.scrollIntoViewIfNeeded();
      const box = await lastTab.boundingBox();
      const viewportWidth = page.viewportSize()!.width;
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(-1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth + 1);
      expect(await hasSidewaysScroll(page), 'after scrolling the tab list').toBe(false);

      // Keyboard: End moves to (and selects) the last tab
      await tabs.first().focus();
      await page.keyboard.press('End');
      await expect(lastTab).toHaveAttribute('aria-selected', 'true');
      await expect(lastTab).toBeFocused();
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3 (AC3): chips, trade in edit form, plural workers
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Visual defects — names instead of ids and empty chips (AC3)',
  { tag: '@responsive' },
  () => {
    test('Purchase page category chip has readable text, not a raw id', async ({
      page,
      testPrefix,
    }) => {
      const itemId = await makePurchase(page, `${testPrefix} Test Sofa`, 'hic-furniture');
      const detail = new HouseholdItemDetailPage(page);
      await detail.goto(itemId);

      const chip = page.locator('[class*="categoryBadge"]').first();
      await expect(chip).toBeVisible();
      await expect(chip).toHaveText(/\S/);
      await expect(chip).not.toHaveText(/^hic-/);
    });

    test('Task page lists a linked purchase with a category chip that is never empty', async ({
      page,
      testPrefix,
    }) => {
      const workItemId = await makeWorkItem(page, `${testPrefix} Test Task With Purchase`);
      const purchaseId = await makePurchase(page, `${testPrefix} Test Armchair`, 'hic-furniture');
      await linkPurchaseToWorkItem(page, purchaseId, workItemId);

      const detail = new WorkItemDetailPage(page);
      await detail.goto(workItemId);

      const chips = page.locator('[class*="householdItemCategoryBadge"]');
      await expect(chips.first()).toBeVisible();
      const texts = await chips.allTextContents();
      expect(texts.length).toBeGreaterThan(0);
      for (const text of texts) {
        expect(text.trim(), 'every category chip has text').not.toBe('');
        expect(text.trim()).not.toMatch(/^hic-/);
      }
    });

    test('Company edit form shows the current trade', async ({ page, testPrefix }) => {
      const tradeName = `${testPrefix} Test Plumbing Trade`;
      const tradeResp = await page.request.post('/api/trades', { data: { name: tradeName } });
      expect(tradeResp.ok(), 'POST trade').toBeTruthy();
      const { trade } = (await tradeResp.json()) as { trade: { id: string } };
      cleanups.push(async () => {
        await page.request.delete(`/api/trades/${trade.id}`);
      });

      const vendorResp = await page.request.post(API.vendors, {
        data: { name: `${testPrefix} Sample Plumbing Ltd`, tradeId: trade.id },
      });
      expect(vendorResp.ok(), 'POST vendor').toBeTruthy();
      const { vendor } = (await vendorResp.json()) as { vendor: { id: string } };
      cleanups.push(() => deleteVendorViaApi(page, vendor.id));
      // The vendor must go before its trade (reverse order of registration handles that)

      const vendorPage = new VendorDetailPage(page);
      await vendorPage.goto(vendor.id);
      await vendorPage.startEdit();

      // SearchPicker with a current selection renders its title as text (not an input)
      const tradeField = page.locator('label[for="edit-tradeId"]').locator('..');
      await expect(tradeField).toContainText(tradeName);
      await expect(tradeField.getByRole('button', { name: 'Clear selection' })).toBeVisible();
    });

    test('Diary workers use a plural-aware label in English and German', async ({
      page,
      testPrefix,
    }) => {
      const entryId = await createDiaryEntryViaApi(page, {
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        body: `${testPrefix} one worker on site`,
        title: `${testPrefix} Test Daily Log`,
        metadata: { weather: 'sunny', workersOnSite: 1 },
      });
      cleanups.push(() => deleteDiaryEntryViaApi(page, entryId));
      const detail = new DiaryEntryDetailPage(page);

      // English
      await detail.goto(entryId);
      await expect(detail.dailyLogMetadata).toContainText(
        i18nValue('en', 'diary', 'metadata.workerCount_one').replace('{{count}}', '1'),
      );
      await expect(detail.dailyLogMetadata).not.toContainText('1 workers');
      await expect(detail.dailyLogMetadata).toContainText(
        i18nValue('en', 'diary', 'form.weatherOptions.sunny'),
      );

      // German (values read from the locale files, not hard-coded)
      await setLanguage(page, 'de');
      await detail.goto(entryId);
      await expect(detail.dailyLogMetadata).toContainText(
        i18nValue('de', 'diary', 'metadata.workerCount_one').replace('{{count}}', '1'),
      );
      await expect(detail.dailyLogMetadata).toContainText(
        i18nValue('de', 'diary', 'form.weatherOptions.sunny'),
      );
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4 (AC4): photo viewer arrows vs details panel / sheet
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Visual defects — photo viewer arrows (AC4)', { tag: '@responsive' }, () => {
  test('Next arrow does not sit under the details panel (desktop) or the open sheet (phone)', async ({
    page,
    testPrefix,
  }) => {
    const entryId = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: '2026-05-17',
      body: `${testPrefix} two photos for the viewer`,
    });
    cleanups.push(() => deleteDiaryEntryViaApi(page, entryId));
    const firstPhotoId = await uploadDiaryPhotoViaApi(page, entryId);
    await uploadDiaryPhotoViaApi(page, entryId);

    await new DiaryEntryDetailPage(page).goto(entryId);
    const viewer = new PhotoViewerPage(page);
    await page.getByTestId(`photo-card-${firstPhotoId}`).click();
    await expect(viewer.modal).toBeVisible();
    await expect(viewer.nextButton).toBeVisible();

    const width = page.viewportSize()!.width;
    if (width >= 768) {
      // Desktop / tablet: the panel is a fixed side column
      await expect(viewer.sidepanel).toBeVisible();
      const arrow = await viewer.nextButton.boundingBox();
      const panel = await viewer.sidepanel.boundingBox();
      expect(arrow).not.toBeNull();
      expect(panel).not.toBeNull();
      expect(intersects(arrow!, panel!), 'next arrow overlaps the details panel').toBe(false);
      expect(await isTopmostAtCentre(viewer.nextButton)).toBe(true);
    } else {
      // Phone: open the bottom sheet with its toggle
      await viewer.metadataToggle.click();
      await expect(viewer.sidepanel).toBeVisible();
      await expect(viewer.nextButton).toBeVisible();
      await expect
        .poll(async () => {
          const arrow = await viewer.nextButton.boundingBox();
          const sheet = await viewer.sidepanel.boundingBox();
          if (!arrow || !sheet) return false;
          return arrow.y + arrow.height <= sheet.y + 1;
        })
        .toBe(true);
      expect(await isTopmostAtCentre(viewer.nextButton), 'arrow is clickable').toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5 (AC5): empty-state links navigate in-app
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Visual defects — empty-state links (AC5)', { tag: '@responsive' }, () => {
  test('Clicking an empty-state action changes the route without a full page reload', async ({
    page,
  }) => {
    // Force two reliably empty cards (the E2E database is shared)
    await page.route('**/api/subsidy-programs*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ subsidyPrograms: [] }),
        });
      } else {
        await route.continue();
      }
    });
    await page.route('**/api/diary-entries*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [],
            pagination: { total: 0, page: 1, pageSize: 5, totalPages: 0, totalItems: 0 },
          }),
        });
      } else {
        await route.continue();
      }
    });

    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForCardsLoaded();
    await dashboard.openMobileSections();

    // Recent Diary now has its own empty message and a create action (no generic fallback text)
    const diaryLink = page
      .getByRole('link', { name: 'Create first entry' })
      .locator('visible=true')
      .first();
    await expect(diaryLink).toBeVisible();
    await expect(diaryLink).toHaveAttribute('href', /\/diary\/new$/);
    await expect(page.getByText('No data available')).toHaveCount(0);

    const startUrl = page.url();
    const link = page
      .getByRole('link', { name: 'Add a subsidy program' })
      .locator('visible=true')
      .first();
    await expect(link).toBeVisible();

    await page.evaluate(() => {
      (window as unknown as { __e2eNoReload: number }).__e2eNoReload = 1;
    });
    await link.click();

    await page.waitForURL(/\/budget\/subsidies/);
    expect(page.url()).not.toBe(startUrl);
    const marker = await page.evaluate(
      () => (window as unknown as { __e2eNoReload?: number }).__e2eNoReload,
    );
    expect(marker, 'window state survived, so no full reload happened').toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6 (AC6): area / trade delete copy and conflict
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Visual defects — area and trade delete copy (AC6)', { tag: '@responsive' }, () => {
  async function openDeleteDialog(
    page: Page,
    tab: 'areas' | 'trades',
    name: string,
  ): Promise<Locator> {
    await page.goto(`${ROUTES.manage}?tab=${tab}`);
    await page
      .getByRole('heading', { level: 1, name: 'Manage', exact: true })
      .waitFor({ state: 'visible' });
    const panel = page.locator(`#${tab}-panel`);
    const row = panel.locator('[class*="itemRow"]').filter({ hasText: name });
    const button = row.getByRole('button', { name: 'Delete', exact: true });
    await button.waitFor({ state: 'visible' });
    await button.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    return dialog;
  }

  test('Area delete dialog shows the rewritten warning; an area in use cannot be deleted', async ({
    page,
    testPrefix,
  }) => {
    const areaName = `${testPrefix} Test Cellar`;
    const areaId = await createAreaViaApi(page, { name: areaName });
    cleanups.push(() => deleteAreaViaApi(page, areaId));
    await makeWorkItem(page, `${testPrefix} Test Task In Cellar`, { areaId });

    const dialog = await openDeleteDialog(page, 'areas', areaName);
    await expect(dialog).toContainText(i18nValue('en', 'settings', 'manage.areas.deleteWarning'));

    const deleteResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes(`${API.areas}/${areaId}`) && resp.request().method() === 'DELETE',
    );
    await dialog.locator('[class*="confirmDeleteButton"]').click();
    expect((await deleteResponse).status()).toBe(409);

    // The conflict message is the page's error banner (the dialog stays open behind it)
    await expect(
      page.getByRole('alert').filter({
        hasText: i18nValue('en', 'settings', 'manage.areas.messages.deleteConflict'),
      }),
    ).toBeVisible();

    // The area still exists
    const stillThere = await page.request.get(`${API.areas}/${areaId}`);
    expect(stillThere.ok()).toBe(true);
  });

  test('Trade delete dialog shows the rewritten warning; a trade in use cannot be deleted', async ({
    page,
    testPrefix,
  }) => {
    const tradeName = `${testPrefix} Test Roofing Trade`;
    const tradeResp = await page.request.post('/api/trades', { data: { name: tradeName } });
    expect(tradeResp.ok(), 'POST trade').toBeTruthy();
    const { trade } = (await tradeResp.json()) as { trade: { id: string } };
    cleanups.push(async () => {
      await page.request.delete(`/api/trades/${trade.id}`);
    });
    const vendorResp = await page.request.post(API.vendors, {
      data: { name: `${testPrefix} Sample Roofing Ltd`, tradeId: trade.id },
    });
    expect(vendorResp.ok(), 'POST vendor').toBeTruthy();
    const { vendor } = (await vendorResp.json()) as { vendor: { id: string } };
    cleanups.push(() => deleteVendorViaApi(page, vendor.id));

    const dialog = await openDeleteDialog(page, 'trades', tradeName);
    await expect(dialog).toContainText(i18nValue('en', 'settings', 'manage.trades.deleteWarning'));

    const deleteResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/trades/${trade.id}`) && resp.request().method() === 'DELETE',
    );
    await dialog.locator('[class*="confirmDeleteButton"]').click();
    expect((await deleteResponse).status()).toBe(409);

    // The conflict message is the page's error banner (the dialog stays open behind it)
    await expect(
      page.getByRole('alert').filter({
        hasText: i18nValue('en', 'settings', 'manage.trades.messages.deleteConflict'),
      }),
    ).toBeVisible();
    const stillThere = await page.request.get(`/api/trades/${trade.id}`);
    expect(stillThere.ok()).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7 (AC7): locale time format
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Visual defects — locale time format (AC7)', { tag: '@responsive' }, () => {
  test('Diary "Created" time follows the locale: no " at " in English, 24 h in German', async ({
    page,
    testPrefix,
  }) => {
    const entryId = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: '2026-03-14',
      body: `${testPrefix} time format`,
    });
    cleanups.push(() => deleteDiaryEntryViaApi(page, entryId));
    const detail = new DiaryEntryDetailPage(page);
    const created = () => page.locator('[class*="timestamp"]').first();

    // English
    await detail.goto(entryId);
    await expect(created()).toHaveText(/\d{1,2}:\d{2}\s?(AM|PM)/);
    expect(await created().innerText()).not.toContain(' at ');

    // German
    await setLanguage(page, 'de');
    await detail.goto(entryId);
    await expect(created()).toHaveText(/\b\d{1,2}:\d{2}\b/);
    await expect(created()).not.toHaveText(/\b(AM|PM)\b/);
    expect(await created().innerText()).not.toContain(' um ');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8 (AC8): pinch-zoom
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Visual defects — viewport meta (AC8)', { tag: '@responsive' }, () => {
  test('Viewport meta allows pinch-zoom', async ({ page }) => {
    await page.goto(ROUTES.home);
    const content = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(content).toBeTruthy();
    expect(content).not.toContain('user-scalable');
    expect(content).not.toContain('maximum-scale');
    expect(content).toContain('width=device-width');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9 (AC10): Sources > Show lines and Report step 3 rows
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Visual defects — rows never overlap their cells (AC10)',
  { tag: '@responsive' },
  () => {
    test('Sources > Show lines: description and amount do not collide, with and without selection', async ({
      page,
      testPrefix,
    }) => {
      const sourceName = `${testPrefix} Test Savings Account`;
      const sourceId = await makeSource(page, sourceName, 50000);
      const workItemId = await makeWorkItem(page, `${testPrefix} Test Task With Long Lines`);
      await makeBudgetLine(page, workItemId, {
        plannedAmount: 1000,
        budgetSourceId: sourceId,
        description: `${LONG_DESCRIPTION} and all related commissioning work`,
      });
      await makeBudgetLine(page, workItemId, {
        plannedAmount: 250,
        budgetSourceId: sourceId,
        description: `${LONG_DESCRIPTION} second circuit ${'z'.repeat(20)}`,
      });

      const sources = new BudgetSourcesPage(page);
      await page.goto(ROUTES.budgetSources);
      await sources.expandSourceLines(sourceName);

      const rows = sources.getLineRows(sourceId);
      await expect(rows).toHaveCount(2);

      const checkAllRows = async (stage: string) => {
        expect(await hasSidewaysScroll(page), `${stage}: page scroll`).toBe(false);
        for (let i = 0; i < 2; i++) {
          const row = rows.nth(i);
          const description = await row.locator('[class*="lineDescription"]').boundingBox();
          const amount = await row.locator('[class*="linePlannedAmount"]').boundingBox();
          expect(description, `${stage}: description box`).not.toBeNull();
          expect(amount, `${stage}: amount box`).not.toBeNull();
          expect(
            intersects(description!, amount!),
            `${stage}: row ${i} description vs amount`,
          ).toBe(false);
          await expectNoOverlappingChildren(row, `${stage}: row ${i}`);
        }
      };

      await checkAllRows('read view');

      // Selection mode: the lines panel renders checkboxes in the same rows
      const checkbox = rows.first().locator('input[type="checkbox"]');
      if ((await checkbox.count()) > 0) {
        await checkbox.first().check();
        await checkAllRows('with a ticked line');
      }
    });

    test('Report step 3: vendor info never overlaps the status chip or the amount', async ({
      page,
      testPrefix,
    }) => {
      const sourceId = await makeSource(page, `${testPrefix} Test Report Source`, 50000);
      const vendorName = `${testPrefix} Sample Plumbing Heating and Sanitary Installations Ltd`;
      const vendorId = await makeVendor(page, vendorName);
      const workItemId = await makeWorkItem(page, `${testPrefix} Test Report Task`);
      const invoiceNumber = `${testPrefix}-INV-LONG-0001`;
      const invoiceId = await makeInvoice(page, vendorId, {
        invoiceNumber,
        amount: 1000,
        date: '2026-02-01',
      });
      const lineId = await makeBudgetLine(page, workItemId, {
        plannedAmount: 1000,
        budgetSourceId: sourceId,
        description: 'Heating circuit',
      });
      await linkLine(page, invoiceId, lineId, 1000);

      const wizard = new ReportWizardPage(page);
      await wizard.goto();
      await wizard.selectUseCase('claim');
      await wizard.goNextFromStep1();
      await expect(wizard.sourceRadioGroup).toBeVisible();
      await wizard.selectSource(sourceId);
      await wizard.goNextFromStep2();

      const row = wizard.invoiceRow(vendorName, invoiceNumber);
      await expect(row).toBeVisible();
      expect(await hasSidewaysScroll(page), 'step 3 page scroll').toBe(false);

      const vendorInfo = await row.locator('[class*="vendorInfo"]').boundingBox();
      const chip = await row.locator('[class*="statusChip"]').boundingBox();
      const amount = await row.locator('[class*="amountColumn"]').boundingBox();
      expect(vendorInfo).not.toBeNull();
      expect(chip).not.toBeNull();
      expect(amount).not.toBeNull();
      expect(intersects(vendorInfo!, chip!), 'vendor info vs status chip').toBe(false);
      expect(intersects(vendorInfo!, amount!), 'vendor info vs amount').toBe(false);
      expect(intersects(chip!, amount!), 'status chip vs amount').toBe(false);

      // The vendor name wraps inside the row instead of spilling out of it
      const rowBox = await row.boundingBox();
      expect(rowBox).not.toBeNull();
      expect(vendorInfo!.x + vendorInfo!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width + 1);
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10 (AC11): navigation links are not dimmed
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Visual defects — Back and trail links are not dimmed (AC11)', () => {
  test.beforeEach(({ page }) => {
    const vp = page.viewportSize();
    test.skip(!vp || vp.width < 1024, 'Desktop-only');
  });

  async function expectFullOpacity(link: Locator): Promise<void> {
    await expect(link).toBeVisible();
    // Move the pointer away so :hover cannot be what makes it opaque
    await link.page().mouse.move(0, 0);
    await expect.poll(() => link.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  }

  test('Task page', async ({ page, testPrefix }) => {
    const workItemId = await makeWorkItem(page, `${testPrefix} Test Task For Buttons`);
    const detailPage = new WorkItemDetailPage(page);
    await detailPage.goto(workItemId);
    await expectFullOpacity(detailPage.breadcrumbs.trailLink('Tasks'));
  });

  test('Task page opened from the schedule calendar ("Back to Calendar")', async ({
    page,
    testPrefix,
  }) => {
    const today = new Date().toISOString().slice(0, 10);
    const title = `${testPrefix} Test Scheduled Task`;
    await makeWorkItem(page, title, { startDate: today, endDate: today });

    await page.goto('/schedule/calendar');
    // Router state { origin } is set by clicking the calendar item
    const item = page.getByTestId('calendar-item').filter({ hasText: title }).first();
    await expect(item).toBeVisible();
    await item.click();
    await page.waitForURL(/\/project\/work-items\/[^/]+$/);
    const breadcrumbs = new BreadcrumbsBar(page);
    await expectFullOpacity(breadcrumbs.backLink);
    await expect(breadcrumbs.backLink).toContainText('Back to Calendar');
  });

  test('Purchase page', async ({ page, testPrefix }) => {
    const itemId = await makePurchase(page, `${testPrefix} Test Dining Table`);
    const detailPage = new HouseholdItemDetailPage(page);
    await detailPage.goto(itemId);
    await expectFullOpacity(detailPage.breadcrumbs.trailLink('Purchases'));
  });

  test('Milestone page', async ({ page, testPrefix }) => {
    const milestoneId = await createMilestoneViaApi(page, {
      title: `${testPrefix} Test Milestone`,
      targetDate: '2026-12-31',
    });
    cleanups.push(() => deleteMilestoneViaApi(page, milestoneId));
    const detailPage = new MilestoneDetailPage(page);
    await detailPage.goto(milestoneId);
    await expectFullOpacity(detailPage.breadcrumbs.trailLink('Milestones'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 11 (AC9): one assignee per task (API level)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Visual defects — single assignee (AC9)', () => {
  test('Creating a task with a user and a company is rejected with 400', async ({
    page,
    testPrefix,
  }) => {
    const vp = page.viewportSize();
    test.skip(!vp || vp.width < 1024, 'API-level check, run once on desktop');

    const meResp = await page.request.get(API.authMe);
    expect(meResp.ok()).toBeTruthy();
    const { user } = (await meResp.json()) as { user: { id: string } };
    const vendorId = await makeVendor(page, `${testPrefix} Sample Electrics Ltd`);

    const resp = await page.request.post(API.workItems, {
      data: {
        title: `${testPrefix} Test Task Two Assignees`,
        assignedUserId: user.id,
        assignedVendorId: vendorId,
      },
    });
    expect(resp.status()).toBe(400);
    const body = (await resp.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
