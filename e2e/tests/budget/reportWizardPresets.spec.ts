/**
 * E2E: the bank report wizard's entry, step 1 and step 3 after the #2243 restructure
 * ("Draw-down request"): the landing rule for `?type=` / `?sourceId=`, the step 1 order, the
 * company-grouped, paged invoice list, the zero-selection guard, the sender helper and German.
 * The Mark / Revert flows are in `reportWizardSubmission.spec.ts`.
 *
 * The shared E2E database holds other tests' loans, so every scenario whose result depends on the
 * set of funding sources (type-only presets) mocks `GET /api/budget-sources`; the paging scenarios
 * mock the report too (27 invoices of two companies). The rest runs against real data. Synthetic
 * names only, made unique with `testPrefix`.
 *
 * Scenarios
 * - A1  AC1: step 1 lists Draw-down request, Budget overview, Proof of funds in that order with
 *       their helper texts and a sentence-case stepper
 * - A2a AC2: the funding source page's primary opens step 3 (steps 1-2 completed); Back shows the
 *       source checked
 * - A2b AC2: the Financing loan card ⋯ › Prepare bank report does the same
 * - A2c AC2: the Home N8 attention link (read from GET /api/attention) opens step 3
 * - A2d AC2: an unknown `sourceId` lands on step 2 with the "no longer exists" error
 * - A2e AC2: `?type=claim` alone: two open loans -> step 2; exactly one open loan -> step 3 (a
 *       closed loan and a savings source do not count)
 * - A3  AC3: 27 invoices of two companies: h3 company groups, 25 rows, "Show more invoices", then
 *       27 rows and "All 27 invoices shown"; select all (27); unchecking a group lowers the count
 *       and total including its unloaded rows
 * - A3b AC3: zero selected keeps Next inert (aria-disabled with a reason) and on step 3
 * - A6  AC6: the sender helper links Project setup › House in a new tab; an empty sender shows the
 *       "No sender set" note
 * - A7  German: step 1 reads "Mittelabruf"
 */

import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import type { AttentionResponse } from '../../../shared/src/types/attention.js';
import type { BudgetSource } from '../../../shared/src/types/budgetSource.js';
import type { SourceReportType } from '../../../shared/src/types/sourceReport.js';
import { newCleanup, runCleanup } from '../../fixtures/costLineSeed.js';
import { seedReadyLoan } from '../../fixtures/reportSeed.js';
import { openAsLocaleUser } from '../../fixtures/localeUser.js';
import {
  buildBudgetSource,
  buildReportInvoice,
  buildSourceReport,
  mockBudgetSources,
  mockSourceReports,
} from '../../fixtures/reportWizardMocks.js';
import { FinancingPage } from '../../pages/FinancingPage.js';
import { FundingSourcePage } from '../../pages/FundingSourcePage.js';
import { ReportWizardPage } from '../../pages/ReportWizardPage.js';
import type { Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// A1: step 1
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Bank report: step 1 (A1)', { tag: '@responsive' }, () => {
  test('A1: Draw-down request, Budget overview and Proof of funds, in that order, with helpers', async ({
    page,
  }) => {
    const wizard = new ReportWizardPage(page);
    await wizard.goto();

    await expect(wizard.stepHeading).toHaveText('Report type');
    await expect(wizard.useCaseCards).toHaveCount(3);
    await expect(wizard.useCaseTitles).toHaveText([
      'Draw-down request',
      'Budget overview',
      'Proof of funds',
    ]);
    await expect(wizard.useCaseHelpers).toHaveText([
      'Invoices to pay or paid that are not yet submitted to the bank.',
      'Offers and invoices to pay, paid or submitted.',
      'Only invoices already submitted to the bank.',
    ]);
    // Sentence-case stepper labels (the desktop tree is always in the DOM)
    await expect(wizard.stepItems).toContainText([
      'Report type',
      'Funding source',
      'Select invoices',
      'Settings',
      'Preview and export',
    ]);
    // Nothing is chosen yet, so there is no Next
    await expect(wizard.step1NextButton).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A2: entry links and the landing rule
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Bank report: entry links land past step 1 (A2)', { tag: '@responsive' }, () => {
  test('A2a: the funding source primary opens step 3, and Back shows the source checked', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const seed = await seedReadyLoan(page, cleanup, testPrefix, 'A2a');
      const source = new FundingSourcePage(page);
      const wizard = new ReportWizardPage(page);

      await source.goto(seed.sourceId);
      await source.bankReportPrimary.click();

      await expect(page).toHaveURL(
        (url) =>
          url.pathname === routeUrl('bankReport') &&
          url.searchParams.get('type') === 'claim' &&
          url.searchParams.get('sourceId') === seed.sourceId,
      );
      await wizard.expectOnStep(3, 'Select invoices');
      await expect(wizard.invoiceRow(seed.vendorName, seed.invoices[0]!.number)).toBeVisible();

      await wizard.goBack();
      await wizard.expectOnStep(2, 'Funding source');
      await expect(wizard.sourceRow(seed.sourceId)).toBeChecked();
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('A2b: the Financing loan card ⋯ › Prepare bank report opens step 3', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const seed = await seedReadyLoan(page, cleanup, testPrefix, 'A2b');
      const financing = new FinancingPage(page);
      const wizard = new ReportWizardPage(page);

      await financing.goto();
      await financing.openCardMenu(seed.sourceId);
      await financing.cardMenuBankReport(seed.sourceId).click();

      await wizard.expectOnStep(3, 'Select invoices');
      await expect(wizard.invoiceRow(seed.vendorName, seed.invoices[0]!.number)).toBeVisible();
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('A2c: the Home N8 attention link of a loan with a ready invoice opens step 3', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const seed = await seedReadyLoan(page, cleanup, testPrefix, 'A2c');
      const wizard = new ReportWizardPage(page);

      // The link is read from the server's own N8 row for this loan (the Home row renders
      // exactly this link), so the test covers the link the server builds, not a copy of it.
      const response = await page.request.get('/api/attention');
      expect(response.ok(), `GET /api/attention: ${response.status()}`).toBeTruthy();
      const attention = (await response.json()) as AttentionResponse;
      const row = attention.rows.find(
        (candidate) => candidate.key === `N8:budget_source:${seed.sourceId}`,
      );
      expect(row, 'the loan has an N8 "ready to submit" attention row').toBeDefined();
      expect(row?.link.route).toBe('bankReport');
      expect(row?.link.query).toEqual({ type: 'claim', sourceId: seed.sourceId });

      await page.goto(routeUrl('bankReport', undefined, row?.link.query));
      await wizard.expectOnStep(3, 'Select invoices');
      await expect(wizard.invoiceRow(seed.vendorName, seed.invoices[0]!.number)).toBeVisible();
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('A2d: an unknown sourceId lands on step 2 with the error', async ({ page }) => {
    const wizard = new ReportWizardPage(page);

    await wizard.gotoWithType('claim', 'no-such-funding-source');

    await wizard.expectOnStep(2, 'Funding source');
    await expect(wizard.presetSourceMissingBanner).toBeVisible();
    await expect(wizard.presetSourceMissingBanner).toHaveText(
      'That funding source no longer exists. Choose one.',
    );
    await expect(wizard.step2NextButton).toBeDisabled();
  });

  test('A2e: ?type=claim alone: two open loans land on step 2, exactly one open loan on step 3', async ({
    page,
    testPrefix,
  }) => {
    const wizard = new ReportWizardPage(page);
    const loanA = buildBudgetSource('mock-loan-a', `${testPrefix} Landing Loan A`);
    const loanB = buildBudgetSource('mock-loan-b', `${testPrefix} Landing Loan B`);
    const closed = buildBudgetSource('mock-loan-closed', `${testPrefix} Landing Closed`, {
      status: 'closed',
    });
    const savings = buildBudgetSource('mock-savings', `${testPrefix} Landing Savings`, {
      sourceType: 'savings',
    });
    const vendorName = `${testPrefix} Landing Co`;
    const reportFor = (type: SourceReportType, source: BudgetSource) =>
      buildSourceReport(type, source, [
        buildReportInvoice(1, 'mock-landing-vendor', vendorName, 400),
      ]);

    // Two open loans (the closed loan and the savings source do not count) -> step 2
    await mockBudgetSources(page, [loanA, loanB, closed, savings]);
    await mockSourceReports(page, [loanA, loanB, closed, savings], reportFor);
    await wizard.gotoWithType('claim');
    await wizard.expectOnStep(2, 'Funding source');
    await expect(wizard.sourceRadioGroup).toBeVisible();
    await expect(wizard.step2NextButton).toBeDisabled();

    // Exactly one open loan -> step 3 with that loan's report (routes registered later win)
    await mockBudgetSources(page, [loanA, closed, savings]);
    await mockSourceReports(page, [loanA, closed, savings], reportFor);
    await wizard.gotoWithType('claim');
    await wizard.expectOnStep(3, 'Select invoices');
    await expect(wizard.invoiceRow(vendorName, 'MOCK-mock-landing-vendor-001')).toBeVisible();
    await wizard.goBack();
    await expect(wizard.sourceRow(loanA.id)).toBeChecked();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A3: company groups and paging
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Bank report: step 3 groups and paging (A3)', { tag: '@responsive' }, () => {
  /** 14 invoices of 100 for Alpha and 13 of 50 for Beta: 27 in all, 2,050 in total. */
  async function openPagedReport(page: Page, testPrefix: string) {
    const loan = buildBudgetSource('mock-paging-loan', `${testPrefix} Paging Loan`);
    const alpha = { id: 'mock-vendor-alpha', name: `${testPrefix} Alpha Co` };
    const beta = { id: 'mock-vendor-beta', name: `${testPrefix} Beta Co` };
    const invoices = [
      ...Array.from({ length: 14 }, (_, i) => buildReportInvoice(i + 1, alpha.id, alpha.name, 100)),
      ...Array.from({ length: 13 }, (_, i) => buildReportInvoice(i + 1, beta.id, beta.name, 50)),
    ];
    // A short viewport keeps the footer's sentinel outside the 600 px lookahead, so the first
    // batch is exactly 25 rows and the batch button (not the observer) loads the rest.
    const viewport = page.viewportSize();
    if (viewport) await page.setViewportSize({ width: viewport.width, height: 700 });
    await mockBudgetSources(page, [loan]);
    await mockSourceReports(page, [loan], (type, source) =>
      buildSourceReport(type, source, invoices),
    );
    const wizard = new ReportWizardPage(page);
    await wizard.gotoWithType('claim', loan.id);
    await wizard.expectOnStep(3, 'Select invoices');
    return { wizard, alpha, beta };
  }

  test('A3: 25 rows, then Show more invoices, then 27 and the end message; select all counts every invoice', async ({
    page,
    testPrefix,
  }) => {
    const { wizard, alpha, beta } = await openPagedReport(page, testPrefix);

    // Companies are h3 groups in name order; the first batch holds all of Alpha and 11 of Beta
    await expect(wizard.invoiceGroupHeadings).toHaveCount(2);
    await expect(wizard.invoiceGroupHeadings).toContainText([alpha.name, beta.name]);
    await expect(wizard.invoiceGroupToggle(beta.id)).toContainText('11 of 13');
    await expect(wizard.invoiceRows).toHaveCount(25);
    await expect(wizard.invoicesLoadMoreButton).toHaveText('Show more invoices');
    await expect(wizard.invoicesEndOfList).toHaveCount(0);

    // The selection covers all 27 even though 2 rows are not loaded yet
    await expect(wizard.selectAllCheckboxFor(27)).toBeChecked();
    await expect(wizard.selectionCountLabel).toContainText(
      /27 of 27 invoices selected · Total .*2,050\.00/,
    );

    await wizard.loadMoreInvoices();
    await expect(wizard.invoiceRows).toHaveCount(27);
    await expect(wizard.invoicesEndOfList).toHaveText('All 27 invoices shown');
    await expect(wizard.invoicesLoadMoreButton).toHaveCount(0);
    await expect(wizard.invoiceGroupToggle(beta.id)).not.toContainText('of 13');
  });

  test('A3: unchecking a group before page 2 lowers the count and total, including its unloaded rows', async ({
    page,
    testPrefix,
  }) => {
    const { wizard, alpha, beta } = await openPagedReport(page, testPrefix);

    await expect(wizard.invoiceRows).toHaveCount(25);
    await wizard.invoiceGroupCheckbox(beta.id, beta.name).click();

    // Beta has 13 invoices (11 loaded): 27 - 13 = 14 left, only Alpha's 1,400.00
    await expect(wizard.invoiceGroupCheckbox(beta.id, beta.name)).not.toBeChecked();
    await expect(wizard.invoiceGroupCheckbox(alpha.id, alpha.name)).toBeChecked();
    await expect(wizard.selectionCountLabel).toContainText(
      /14 of 27 invoices selected · Total .*1,400\.00/,
    );
    expect(
      await wizard
        .selectAllCheckboxFor(27)
        .evaluate((el) => (el as HTMLInputElement).indeterminate),
    ).toBe(true);

    // The two rows that load afterwards belong to the unchecked group, so they start unchecked
    await wizard.loadMoreInvoices();
    await expect(wizard.invoiceRows).toHaveCount(27);
    await expect(
      wizard.invoiceRowCheckbox(beta.name, 'MOCK-mock-vendor-beta-013'),
    ).not.toBeChecked();
    await expect(
      wizard.invoiceRowCheckbox(beta.name, 'MOCK-mock-vendor-beta-012'),
    ).not.toBeChecked();
    await expect(wizard.selectionCountLabel).toContainText(
      /14 of 27 invoices selected · Total .*1,400\.00/,
    );

    // Reset selection brings everything back
    await wizard.clearSelectionButton.click();
    await expect(wizard.selectionCountLabel).toContainText(
      /27 of 27 invoices selected · Total .*2,050\.00/,
    );
  });

  test('A3b: with nothing selected Next stays inert and says why', async ({ page, testPrefix }) => {
    const { wizard } = await openPagedReport(page, testPrefix);

    await wizard.selectAllCheckboxFor(27).click();
    await expect(wizard.selectionCountLabel).toContainText(/0 of 27 invoices selected/);

    // Not natively disabled (it stays focusable), but inert and described
    await expect(wizard.step3NextButton).toHaveAttribute('aria-disabled', 'true');
    await expect(wizard.step3NextButton).toHaveAccessibleDescription(
      'Select at least one invoice to proceed',
    );
    // aria-disabled makes Playwright's click wait for "enabled", so force the click: the point is
    // that it does nothing.
    await wizard.step3NextButton.click({ force: true });
    await wizard.expectOnStep(3, 'Select invoices');

    await wizard.selectAllCheckboxFor(27).click();
    await expect(wizard.step3NextButton).not.toHaveAttribute('aria-disabled', 'true');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A6: the sender helper
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Bank report: sender helper (A6)', { tag: '@responsive' }, () => {
  async function reachStep5(wizard: ReportWizardPage, sourceId: string): Promise<void> {
    await wizard.gotoWithType('claim', sourceId);
    await wizard.expectOnStep(3, 'Select invoices');
    await wizard.goNextFromStep3();
    await wizard.goNextFromStep4();
    await expect(wizard.coverLetterCard).toBeVisible();
  }

  test('A6: the helper links Project setup › House and opens it in a new tab', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const cleanup = newCleanup();
    try {
      const seed = await seedReadyLoan(page, cleanup, testPrefix, 'A6');
      // The cover letter exists only for a source with a contact address or a reference
      const patch = await page.request.patch(`/api/budget-sources/${seed.sourceId}`, {
        data: { contactAddress: '1 Synthetic Bank Platz, Berlin', reference: 'Konto 0001' },
      });
      expect(patch.ok(), `PATCH source: ${patch.status()}`).toBeTruthy();
      const wizard = new ReportWizardPage(page);

      await reachStep5(wizard, seed.sourceId);

      await expect(wizard.senderHelp).toContainText('Taken from Project setup › House');
      await expect(wizard.senderHelpLink).toHaveAttribute('href', /\/settings\/manage#house$/);
      await expect(wizard.senderHelpLink).toHaveAttribute('target', '_blank');
      await expect(wizard.senderHelpLink).toHaveAttribute('rel', /noopener/);

      // Clicking opens a new tab and leaves the wizard (and its in-memory state) in place
      const [popup] = await Promise.all([
        page.waitForEvent('popup'),
        wizard.senderHelpLink.click(),
      ]);
      await expect(popup).toHaveURL(/\/settings\/manage#house$/);
      await popup.close();
      await expect(wizard.coverLetterCard).toBeVisible();
      await expect(page).toHaveURL(/\/budget\/reports/);
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('A6: an empty sender shows the "No sender set" note with the same link', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const cleanup = newCleanup();
    try {
      const seed = await seedReadyLoan(page, cleanup, testPrefix, 'A6e');
      const patch = await page.request.patch(`/api/budget-sources/${seed.sourceId}`, {
        data: { contactAddress: '2 Synthetic Bank Platz, Berlin', reference: 'Konto 0002' },
      });
      expect(patch.ok(), `PATCH source: ${patch.status()}`).toBeTruthy();

      // The sender is the user's name plus the House address. Mock both empty: no House address
      // and a blank display name, so nothing is left to print.
      const me = await page.request.get('/api/auth/me');
      expect(me.ok(), `GET /api/auth/me: ${me.status()}`).toBeTruthy();
      const mePayload = (await me.json()) as { user: Record<string, unknown> };
      await page.route('**/api/auth/me', async (route) => {
        await route.fulfill({
          status: 200,
          json: { ...mePayload, user: { ...mePayload.user, displayName: ' ' } },
        });
      });
      await page.route('**/api/settings', async (route) => {
        if (route.request().method() !== 'GET') {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status: 200,
          json: {
            settings: { householdName: null, householdAddress: null, entriesLanguage: 'en' },
          },
        });
      });
      const wizard = new ReportWizardPage(page);

      await reachStep5(wizard, seed.sourceId);

      await expect(wizard.senderHelp).toContainText('No sender set');
      await expect(wizard.senderHelpLink).toHaveAttribute('href', /\/settings\/manage#house$/);
      await expect(wizard.senderHelpLink).toHaveAttribute('target', '_blank');
    } finally {
      await runCleanup(cleanup);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A7: German
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Bank report: German (A7)', { tag: '@responsive' }, () => {
  test('A7: a German user sees Mittelabruf on step 1 and no raw keys', async ({
    page,
    browser,
    testPrefix,
  }) => {
    const session = { dispose: async () => {} };
    try {
      const german = await openAsLocaleUser(
        browser,
        page,
        testPrefix,
        routeUrl('bankReport'),
        'de',
      );
      session.dispose = german.dispose;
      const wizard = new ReportWizardPage(german.page);

      await expect(wizard.stepHeading).toHaveText('Berichtsart');
      await expect(wizard.useCaseTitles).toHaveText([
        'Mittelabruf',
        'Budgetübersicht',
        'Verwendungsnachweis',
      ]);
      await expect(german.page.getByText(/sourceReports\./)).toHaveCount(0);
    } finally {
      await session.dispose();
    }
  });
});
