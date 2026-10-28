/**
 * E2E consistency test across money and attention surfaces (#2232, EPIC-21 P3.5, ADR-039 §7):
 * "one answer per question". Every surface registered in fixtures/figureSurfaces.ts must show the
 * server's answer; a figure with one name has one number everywhere.
 *
 * Real data: the shared E2E database is written by other specs, so shared project figures are
 * compared with the read-API / read-page / read-API retry (as home.spec H8d does); exact checks use
 * records this test creates (a company with an invoice, a chain of three tasks). Synthetic names
 * and invented amounts only.
 *
 * Scenarios
 * FC1 (desktop, AC1)       project figures equal the money service on every registered surface
 * FC2 (desktop, AC1)       a company's Still to pay: both page markers and the Companies list cell equal the API balance; Paid equals the API's paid (#2244)
 * FC3 (desktop, AC1)       "Holds up n tasks": API, Home attention row and Schedule tooltip agree
 * FC4 (@responsive, AC4)   at most one Left to spend figure per screen; no former names visible
 * FC5 (desktop, AC3)       a pending surface cannot become served without registering itself
 * FC6 (desktop, #2239)     an invoice page's Paid and Still to pay equal the record's API figures
 * FC7 (desktop, #2242)     a loan's Paid (card and source page) and Ready to submit (card) equal the money service
 */

import fs from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/isolatedUser.js';
import {
  createVendorViaApi,
  createWorkItemViaApi,
  deleteVendorViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { API } from '../../fixtures/testData.js';
import { dayOffset } from '../../fixtures/homeMocks.js';
import {
  COMPANIES_LIST_SURFACE,
  COMPANY_PAID_SURFACE,
  COMPANY_SURFACE,
  FINANCING_READY_SURFACE,
  FINANCING_SOURCE_PAID_SURFACE,
  HOME_ATTENTION_SURFACE,
  INVOICE_PAID_SURFACE,
  INVOICE_STILL_TO_PAY_SURFACE,
  LEFT_SCREENS,
  PENDING_SURFACES,
  PROJECT_SURFACES,
  readFinancingReadyCount,
  SCHEDULE_TOOLTIP_SURFACE,
  TASKS_LIST_HOLDS_UP_SURFACE,
} from '../../fixtures/figureSurfaces.js';
import type { ProjectFigure } from '../../fixtures/figureSurfaces.js';
import { ROUTE_MAP, routeUrl } from '../../../shared/src/routes/index.js';
import { BudgetOverviewPage } from '../../pages/BudgetOverviewPage.js';
import {
  createInvoice,
  createLinkedCostLine,
  createTask,
  createVendor,
  newCleanup,
  runCleanup,
} from '../../fixtures/costLineSeed.js';
import { HomePage } from '../../pages/HomePage.js';

test.use({
  isolatedUserPerWorker: { emailPrefix: 'consistency', displayName: 'E2E Consistency User' },
});

interface MoneyAnswer {
  leftToSpend: { expected: number; verdict: string | null };
  stillToPay: number;
  paid: number;
  stillToPayCount: number;
  readyToSubmit: { amount: number; count: number };
}

const cents = (amount: number): number => Math.round(amount * 100);

async function readMoney(page: Page): Promise<MoneyAnswer> {
  const response = await page.request.get(API.budgetOverview);
  expect(response.ok(), `GET ${API.budgetOverview}: ${response.status()}`).toBeTruthy();
  return ((await response.json()) as { money: MoneyAnswer }).money;
}

function expectedFigures(money: MoneyAnswer): Partial<Record<ProjectFigure, number | null>> {
  return {
    leftToSpend: money.leftToSpend.verdict === null ? null : cents(money.leftToSpend.expected),
    stillToPay: cents(money.stillToPay),
    paid: cents(money.paid),
    stillToPayCount: money.stillToPayCount,
    readyToSubmit: cents(money.readyToSubmit.amount),
  };
}

async function setPreference(page: Page, key: string, value: string): Promise<void> {
  const response = await page.request.patch('/api/users/me/preferences', { data: { key, value } });
  expect(response.ok(), `PATCH preference ${key}: ${response.status()}`).toBeTruthy();
}

/** A company with one pending invoice of 1,234.56 and a paid progress payment of 200.00. */
async function seedCompany(page: Page, testPrefix: string): Promise<{ vendorId: string }> {
  const vendorId = await createVendorViaApi(page, { name: `${testPrefix} Consistency Company` });
  const invoice = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
    data: {
      invoiceNumber: `${testPrefix}-INV-FC`,
      amount: 1234.56,
      date: '2026-03-01',
      status: 'pending',
    },
  });
  expect(invoice.ok(), `POST invoice: ${invoice.status()}`).toBeTruthy();
  const invoiceId = ((await invoice.json()) as { invoice: { id: string } }).invoice.id;
  const deposit = await page.request.post(`/api/invoices/${invoiceId}/deposits`, {
    data: { amount: 200, dueDate: '2026-03-10', status: 'pending' },
  });
  expect(deposit.ok(), `POST progress payment: ${deposit.status()}`).toBeTruthy();
  const depositId = ((await deposit.json()) as { deposit: { id: string } }).deposit.id;
  const paid = await page.request.patch(`/api/invoices/${invoiceId}/deposits/${depositId}`, {
    data: { status: 'paid', paidDate: '2026-03-11' },
  });
  expect(paid.ok(), `PATCH progress payment paid: ${paid.status()}`).toBeTruthy();
  return { vendorId };
}

async function removeCompany(page: Page, vendorId: string): Promise<void> {
  const list = await page.request.get(`${API.vendors}/${vendorId}/invoices`);
  if (list.ok()) {
    const body = (await list.json()) as { invoices?: Array<{ id: string }> };
    for (const invoice of body.invoices ?? []) {
      await page.request.delete(`${API.vendors}/${vendorId}/invoices/${invoice.id}`);
    }
  }
  await deleteVendorViaApi(page, vendorId);
}

test.describe('Figure consistency', () => {
  test.beforeEach(async ({ page }) => {
    await setPreference(page, 'locale', 'en');
    await setPreference(page, 'home.movedNoticeSeen', 'true');
    // A fresh database can be in set-up mode; dismissing it shows the Pulse
    await setPreference(page, 'home.setupDismissed', 'true');
  });

  test('FC1: project figures are identical on every registered surface (AC1)', async ({ page }) => {
    test.skip(
      (page.viewportSize()?.width ?? 1440) < 1024,
      'desktop only (FC4 covers all viewports)',
    );
    const mismatches = async (): Promise<{ stable: boolean; problems: string[] }> => {
      const before = await readMoney(page);
      const expected = expectedFigures(before);
      const problems: string[] = [];
      for (const surface of PROJECT_SURFACES) {
        await surface.open(page);
        if (surface.isAvailable && !(await surface.isAvailable(page))) continue;
        for (const [figure, reader] of Object.entries(surface.read) as Array<
          [ProjectFigure, (p: Page) => Promise<number | null>]
        >) {
          const actual = await reader(page);
          if (actual !== expected[figure]) {
            problems.push(`${surface.id} ${figure}: page ${actual}, API ${expected[figure]}`);
          }
        }
      }
      const after = await readMoney(page);
      return { stable: JSON.stringify(before) === JSON.stringify(after), problems };
    };
    let last: { stable: boolean; problems: string[] } = { stable: false, problems: ['not run'] };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      last = await mismatches();
      // Another worker wrote while the pages were read: the comparison proves nothing, retry
      if (last.stable) break;
    }
    expect(last.stable, 'the money figures kept changing under the read').toBe(true);
    expect(last.problems).toEqual([]);
  });

  test('FC2: a company Still to pay is the same on both markers, the list and the API; Paid too (AC1)', async ({
    page,
    testPrefix,
  }) => {
    test.skip(
      (page.viewportSize()?.width ?? 1440) < 1024,
      'desktop only (FC4 covers all viewports)',
    );
    let vendorId: string | null = null;
    try {
      ({ vendorId } = await seedCompany(page, testPrefix));
      const response = await page.request.get(`${API.vendors}/${vendorId}`);
      expect(response.ok()).toBeTruthy();
      const { stillToPay, paid } = (
        (await response.json()) as {
          vendor: { stillToPay: number; paid: number };
        }
      ).vendor;
      expect(stillToPay).toBeGreaterThan(0);
      expect(paid).toBeGreaterThan(0);

      // The summary strip fact and the Payments totals line (both appear on ?tab=payments)
      const markers = await COMPANY_SURFACE.readAll(page, { companyId: vendorId });
      expect(markers).toEqual([cents(stillToPay), cents(stillToPay)]);
      // The totals line Paid
      expect(await COMPANY_PAID_SURFACE.readAll(page, { companyId: vendorId })).toEqual([
        cents(paid),
      ]);
      // The Still to pay cell of the company's row on the Companies list
      expect(
        await COMPANIES_LIST_SURFACE.readAll(page, {
          companyId: vendorId,
          companyName: `${testPrefix} Consistency Company`,
        }),
      ).toEqual([cents(stillToPay)]);
    } finally {
      if (vendorId) await removeCompany(page, vendorId);
    }
  });

  test("FC6: an invoice page shows the record's Paid and Still to pay from the money service (#2239)", async ({
    page,
    testPrefix,
  }) => {
    test.skip(
      (page.viewportSize()?.width ?? 1440) < 1024,
      'desktop only (the figures are viewport-independent)',
    );
    let vendorId: string | null = null;
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Invoice Figure Company` });
      const created = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
        data: {
          invoiceNumber: `${testPrefix}-INV-FC6`,
          amount: 1234.56,
          date: '2026-03-01',
          status: 'pending',
        },
      });
      expect(created.ok(), `POST invoice: ${created.status()}`).toBeTruthy();
      const invoiceId = ((await created.json()) as { invoice: { id: string } }).invoice.id;

      const first = await page.request.post(`/api/invoices/${invoiceId}/deposits`, {
        data: { amount: 200, dueDate: '2026-03-10', status: 'pending' },
      });
      expect(first.ok(), `POST first progress payment: ${first.status()}`).toBeTruthy();
      const firstId = ((await first.json()) as { deposit: { id: string } }).deposit.id;
      const paid = await page.request.patch(`/api/invoices/${invoiceId}/deposits/${firstId}`, {
        data: { status: 'paid', paidDate: '2026-03-11' },
      });
      expect(paid.ok(), `PATCH progress payment paid: ${paid.status()}`).toBeTruthy();
      const second = await page.request.post(`/api/invoices/${invoiceId}/deposits`, {
        data: { amount: 300, dueDate: '2026-04-10', status: 'pending' },
      });
      expect(second.ok(), `POST second progress payment: ${second.status()}`).toBeTruthy();

      // The record's own figures, from the detail and from the list row
      const detailResponse = await page.request.get(`/api/invoices/${invoiceId}`);
      expect(detailResponse.ok()).toBeTruthy();
      const detail = (
        (await detailResponse.json()) as {
          invoice: { paid: number; openAmount: number };
        }
      ).invoice;
      const listResponse = await page.request.get(`/api/invoices?ids=${invoiceId}`);
      expect(listResponse.ok()).toBeTruthy();
      const row = (
        (await listResponse.json()) as {
          invoices: Array<{ id: string; paid: number; openAmount: number }>;
        }
      ).invoices.find((candidate) => candidate.id === invoiceId);
      expect(row, 'the invoice is in the ids= list').toBeTruthy();
      expect(detail.paid).toBe(row!.paid);
      expect(detail.openAmount).toBe(row!.openAmount);
      expect(cents(detail.paid)).toBe(20000);
      expect(cents(detail.openAmount)).toBe(103456);

      // The page's markers equal them
      expect(await INVOICE_PAID_SURFACE.readAll(page, { invoiceId })).toEqual([20000]);
      expect(await INVOICE_STILL_TO_PAY_SURFACE.readAll(page, { invoiceId })).toEqual([103456]);

      // An offer has a Paid marker and no Still to pay marker
      const offerResponse = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
        data: {
          invoiceNumber: `${testPrefix}-OFR-FC6`,
          amount: 500,
          date: '2026-03-01',
          status: 'quotation',
        },
      });
      expect(offerResponse.ok(), `POST offer: ${offerResponse.status()}`).toBeTruthy();
      const offerId = ((await offerResponse.json()) as { invoice: { id: string } }).invoice.id;
      expect(await INVOICE_PAID_SURFACE.readAll(page, { invoiceId: offerId })).toHaveLength(1);
      expect(await INVOICE_STILL_TO_PAY_SURFACE.readAll(page, { invoiceId: offerId })).toEqual([]);
    } finally {
      if (vendorId) await removeCompany(page, vendorId);
    }
  });

  test("FC7: a loan's Paid and Ready to submit are the money service's figures on the card and the source page (#2242)", async ({
    page,
    testPrefix,
  }) => {
    test.skip(
      (page.viewportSize()?.width ?? 1440) < 1024,
      'desktop only (the figures are viewport-independent)',
    );
    const cleanup = newCleanup();
    try {
      // A bank loan; one paid invoice (not yet submitted) and one still To pay, both on it
      const created = await page.request.post(API.budgetSources, {
        data: {
          name: `${testPrefix} FC7 Loan`,
          sourceType: 'bank_loan',
          status: 'active',
          totalAmount: 100000,
        },
      });
      expect(created.ok(), `POST source: ${created.status()}`).toBeTruthy();
      const sourceId = ((await created.json()) as { budgetSource: { id: string } }).budgetSource.id;
      cleanup.fns.push(async () => {
        await page.request.delete(`${API.budgetSources}/${sourceId}`);
      });
      const vendorId = await createVendor(page, cleanup, `${testPrefix} FC7 Company`);
      const taskId = await createTask(page, cleanup, `${testPrefix} FC7 Task`);
      const paidInvoice = await createInvoice(page, cleanup, vendorId, {
        amount: 500,
        status: 'paid',
        invoiceNumber: `${testPrefix}-FC7-PAID`,
      });
      const openInvoice = await createInvoice(page, cleanup, vendorId, {
        amount: 300,
        status: 'pending',
        invoiceNumber: `${testPrefix}-FC7-OPEN`,
      });
      await createLinkedCostLine(page, paidInvoice.id, {
        kind: 'work_item',
        hostId: taskId,
        budgetSourceId: sourceId,
        description: 'FC7 paid line',
        plannedAmount: 500,
        itemizedAmount: 500,
      });
      await createLinkedCostLine(page, openInvoice.id, {
        kind: 'work_item',
        hostId: taskId,
        budgetSourceId: sourceId,
        description: 'FC7 open line',
        plannedAmount: 300,
        itemizedAmount: 300,
      });

      // The money service's answer: the Financing endpoint and the overview agree
      const financingResponse = await page.request.get('/api/budget/financing');
      expect(financingResponse.ok(), `GET financing: ${financingResponse.status()}`).toBeTruthy();
      const financing = (
        (await financingResponse.json()) as {
          sources: Array<{
            id: string;
            paid: number;
            readyToSubmit: { amount: number; count: number };
          }>;
        }
      ).sources.find((source) => source.id === sourceId);
      expect(financing, 'the loan is in the Financing response').toBeTruthy();
      const overview = (await (await page.request.get(API.budgetOverview)).json()) as {
        money: { sources: Array<{ id: string; paid: number }> };
      };
      const fromOverview = overview.money.sources.find((source) => source.id === sourceId);
      expect(fromOverview?.paid).toBe(financing!.paid);
      expect(cents(financing!.paid)).toBeGreaterThan(0);

      // Card Paid = source page strip Paid = API Paid
      const paid = await FINANCING_SOURCE_PAID_SURFACE.readAll(page, { sourceId });
      expect(paid).toEqual([cents(financing!.paid), cents(financing!.paid)]);

      // Card Ready to submit: amount and count are the API's
      expect(await FINANCING_READY_SURFACE.readAll(page, { sourceId })).toEqual([
        cents(financing!.readyToSubmit.amount),
      ]);
      expect(await readFinancingReadyCount(page, { sourceId })).toBe(
        financing!.readyToSubmit.count,
      );
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('FC3: "Holds up n tasks" is one number on the API, Home and the Schedule (AC1)', async ({
    page,
    testPrefix,
  }) => {
    test.skip(
      (page.viewportSize()?.width ?? 1440) < 1200,
      'Gantt tooltips on hover are desktop-only',
    );
    const ids: string[] = [];
    try {
      // A is late (a distinctive date keeps it out of other specs' N2 groups); B waits for A, C for B
      const a = await createWorkItemViaApi(page, {
        title: `${testPrefix} Holds-up A`,
        status: 'not_started',
        startDate: dayOffset(-11),
        endDate: dayOffset(-9),
      });
      ids.push(a);
      const b = await createWorkItemViaApi(page, {
        title: `${testPrefix} Holds-up B`,
        status: 'not_started',
        startDate: dayOffset(5),
        endDate: dayOffset(7),
      });
      ids.push(b);
      const c = await createWorkItemViaApi(page, {
        title: `${testPrefix} Holds-up C`,
        status: 'not_started',
        startDate: dayOffset(12),
        endDate: dayOffset(14),
      });
      ids.push(c);
      for (const [successor, predecessorId] of [
        [b, a],
        [c, b],
      ] as const) {
        const dependency = await page.request.post(`${API.workItems}/${successor}/dependencies`, {
          data: { predecessorId, dependencyType: 'finish_to_start' },
        });
        expect(dependency.ok(), `POST dependency: ${dependency.status()}`).toBeTruthy();
      }

      // The API: attention row (own row, or an item of its N2 group) and the timeline
      const attention = await page.request.get('/api/attention');
      expect(attention.ok()).toBeTruthy();
      interface Row {
        key: string;
        subject: { id: string };
        holdsUp: { count: number } | null;
        params: { items?: Array<{ id: string; holdsUp: { count: number } }> };
      }
      const rows = ((await attention.json()) as { rows: Row[] }).rows;
      const own = rows.find((row) => row.subject.id === a && row.holdsUp);
      const group = rows.find((row) => row.params.items?.some((item) => item.id === a));
      const apiCount =
        own?.holdsUp?.count ?? group?.params.items?.find((item) => item.id === a)?.holdsUp.count;
      expect(apiCount, 'the late task A is in Needs attention').toBe(2);

      const timeline = await page.request.get('/api/timeline');
      expect(timeline.ok()).toBeTruthy();
      const holdsUp = (
        (await timeline.json()) as {
          holdsUp: { workItems: Record<string, { count: number }> };
        }
      ).holdsUp;
      expect(holdsUp.workItems[a]?.count).toBe(2);

      // Home: the same number in A's row
      const home = await HOME_ATTENTION_SURFACE.readAll(page, {
        workItemId: a,
        groupKey: own ? undefined : group?.key,
      });
      expect(home).toEqual([2]);

      // Tasks list: the same number in the Relations column (table surface only; [] on cards)
      const tasksList = await TASKS_LIST_HOLDS_UP_SURFACE.readAll(page, {
        workItemId: a,
        title: `${testPrefix} Holds-up A`,
      });
      if (tasksList.length > 0) expect(tasksList).toEqual([2]);

      // Schedule: the same number in the tooltip, while the list shows the one direct successor
      const tooltip = await SCHEDULE_TOOLTIP_SURFACE.readAll(page, { workItemId: a });
      expect(tooltip).toEqual([2]);
      await expect(page.getByTestId('gantt-tooltip-holds-up')).toContainText(
        `${testPrefix} Holds-up B`,
      );
      await expect(page.getByTestId('gantt-tooltip-holds-up')).not.toContainText(
        `${testPrefix} Holds-up C`,
      );
    } finally {
      for (const id of ids.reverse()) await deleteWorkItemViaApi(page, id);
    }
  });

  test(
    'FC4: at most one Left to spend figure per screen, and no former name (AC4)',
    { tag: '@responsive' },
    async ({ page, testPrefix }) => {
      const glossary = JSON.parse(
        fs.readFileSync(new URL('../../../client/src/i18n/glossary.json', import.meta.url), 'utf8'),
      ) as { terms: Record<string, { formerly: string[] }> };
      const formerly = glossary.terms['Left to spend']?.formerly ?? [];
      expect(formerly.length).toBeGreaterThan(0);

      let vendorId: string | null = null;
      try {
        ({ vendorId } = await seedCompany(page, testPrefix));
        const urls: Record<(typeof LEFT_SCREENS)[number], string> = {
          home: routeUrl('home'),
          budgetOverview: routeUrl('budgetOverview'),
          invoices: routeUrl('invoices'),
          company: routeUrl('company', { id: vendorId }),
          financing: routeUrl('financing'),
        } as never;

        for (const screen of LEFT_SCREENS) {
          await test.step(`screen ${screen}`, async () => {
            await page.goto(urls[screen]);
            if (screen === 'home') {
              await new HomePage(page).pulseTile('left-to-spend').waitFor({ state: 'visible' });
            } else if (screen === 'budgetOverview') {
              await new BudgetOverviewPage(page).waitForLoaded();
            } else {
              await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
            }
            const figures = page.locator('[data-figure="left-to-spend"]').filter({ visible: true });
            const count = await figures.count();
            expect(count, `${screen}: Left to spend figures`).toBeLessThanOrEqual(1);
            // The Money headline always renders (#2237): exactly one figure, no empty-state case
            if (screen === 'home' || screen === 'budgetOverview') expect(count).toBe(1);
            for (const former of formerly) {
              const exact = new RegExp(
                `^\\s*${former.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`,
                'i',
              );
              await expect(
                page.getByText(exact).filter({ visible: true }),
                `${screen}: former name "${former}"`,
              ).toHaveCount(0);
            }
          });
        }
      } finally {
        if (vendorId) await removeCompany(page, vendorId);
      }
    },
  );
});

test.describe('Figure surface registry', () => {
  test('FC5: a pending surface cannot become served without registering itself (AC3)', async () => {
    const entries = ROUTE_MAP as unknown as ReadonlyArray<{ id: string; stage: string }>;
    const routeIds = new Set(entries.map((entry) => entry.id));
    const gated = PENDING_SURFACES.filter((pending) => routeIds.has(pending.screen));
    // The Financing surface (4.10) and the Company page (4.12) are built: registered, no longer pending
    expect(PENDING_SURFACES.map((pending) => pending.story)).not.toContain('4.10');
    expect(PENDING_SURFACES.map((pending) => pending.story)).not.toContain('4.12');
    expect(COMPANY_SURFACE.story).toBe('4.12');
    expect(COMPANY_PAID_SURFACE.story).toBe('4.12');
    expect(COMPANIES_LIST_SURFACE.story).toBe('4.12');
    expect(FINANCING_SOURCE_PAID_SURFACE.story).toBe('4.10');
    expect(FINANCING_READY_SURFACE.story).toBe('4.10');
    for (const pending of gated) {
      const entry = entries.find((candidate) => candidate.id === pending.screen);
      expect(
        entry?.stage,
        `story ${pending.story} serves "${pending.screen}": move it from PENDING_SURFACES to the registry`,
      ).not.toBe('done');
    }
    // Every pending entry names the story that owns it
    for (const pending of PENDING_SURFACES) expect(pending.story).toMatch(/^\d+\.\d+$/);
  });
});
