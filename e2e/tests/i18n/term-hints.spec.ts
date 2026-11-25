/**
 * E2E: in-place definitions of the glossary hint terms (#2258, AC3).
 *
 * One registry (`client/src/lib/termHints.ts`) feeds three shapes: an underlined term with a
 * tooltip (`TermHint`), an ⓘ button with a panel (`TermHintPopover`, several terms or a column
 * header), and a native `title` on a chip. Definitions are read from the locale files.
 *
 * Scenarios
 * H1 underlined hint: on a loan card the "Allocated" term shows its definition on focus (tap on a
 *    phone) and hides on Escape (a second tap on a phone). The bubble is shown with `opacity`, so
 *    the check is the computed opacity, not `toBeVisible()`
 * H2 chip title: a late task's "Late" chip has the Late definition as its `title`
 * H3 popover: the Schedule legend's ⓘ opens a panel named "What these terms mean" with "Late" and
 *    "Held up"; Escape closes only the panel and focus returns to the ⓘ; on a phone the legend is a
 *    sheet, which a second Escape closes
 * H4 a column-header ⓘ opens the panel and does not sort (Milestones › Waits for; the header is a
 *    sort button, the ⓘ sits beside it, not inside it). Card surface (phone) has no headers: skipped
 * H5 German: with a German interface the same hint shows the German definition (desktop only)
 *
 * Deviation from the spec text: the Invoices "Split" column is hidden by default and not sortable,
 * so the "does not sort" check runs on the sortable Milestones "Waits for" header instead.
 *
 * Data is synthetic (names carry the `testPrefix`) and removed in `finally`. H3 and H5 sign in as a
 * fresh member (`openAsLocaleUser`): the Schedule legend writes the per-user `schedule.view`
 * preference and German needs its own `locale` row, neither of which the shared admin may change.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import {
  createMilestoneViaApi,
  createWorkItemViaApi,
  deleteMilestoneViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import {
  createInvoice,
  createLinkedCostLine,
  createTask,
  createVendor,
  newCleanup,
  runCleanup,
} from '../../fixtures/costLineSeed.js';
import { createSource } from '../../fixtures/financingSeed.js';
import { dayOffset } from '../../fixtures/homeMocks.js';
import { i18nValue, projectContextOptions } from '../../fixtures/i18nValue.js';
import { openAsLocaleUser } from '../../fixtures/localeUser.js';
import { buildScheduleScenario } from '../../fixtures/timelineMocks.js';
import { FINANCING_ROUTE, FinancingPage } from '../../pages/FinancingPage.js';
import { MilestonesPage } from '../../pages/MilestonesPage.js';
import { TimelinePage } from '../../pages/TimelinePage.js';
import { TermHintControl } from '../../pages/components/TermHintControl.js';
import { WorkItemsPage } from '../../pages/WorkItemsPage.js';

const PHONE_MAX_WIDTH = 767;

const definition = (lang: 'en' | 'de', term: string) =>
  i18nValue(lang, 'common', `termHint.definition.${term}`);

/** A loan with one paid invoice split to it, so its card shows real figures. */
async function seedLoanCard(
  page: Page,
  cleanup: ReturnType<typeof newCleanup>,
  testPrefix: string,
): Promise<string> {
  const sourceId = await createSource(page, cleanup, {
    name: `${testPrefix} Example Bank Loan`,
    totalAmount: 100000,
    interestRate: 3.5,
  });
  const vendorId = await createVendor(page, cleanup, `${testPrefix} Example Company`);
  const taskId = await createTask(page, cleanup, `${testPrefix} Test Kitchen Task`);
  const invoice = await createInvoice(page, cleanup, vendorId, {
    amount: 1200,
    status: 'paid',
    invoiceNumber: `${testPrefix}-H1`,
  });
  await createLinkedCostLine(page, invoice.id, {
    kind: 'work_item',
    hostId: taskId,
    budgetSourceId: sourceId,
    description: 'Kitchen work',
    plannedAmount: 1200,
    itemizedAmount: 1200,
  });
  return sourceId;
}

test.describe('Term hints', () => {
  test('H1: an underlined term shows its definition on focus and hides on Escape', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const sourceId = await seedLoanCard(page, cleanup, testPrefix);
      const financing = new FinancingPage(page);
      await financing.goto();
      await expect(financing.sourceCard(sourceId)).toBeVisible();

      const term = financing.termHint(sourceId, 'Allocated');
      const bubble = financing.termHints.bubble(term);
      await expect(term).toBeVisible();
      await expect(bubble).toHaveCSS('opacity', '0');

      const phone = (page.viewportSize()?.width ?? 1920) <= PHONE_MAX_WIDTH;
      if (phone) {
        await term.click();
      } else {
        await term.focus();
      }
      await expect(bubble).toHaveCSS('opacity', '1');
      await expect(bubble).toHaveText(definition('en', 'allocated'));

      if (phone) {
        // A tap toggles: the second tap closes the pinned bubble
        await term.click();
      } else {
        await page.keyboard.press('Escape');
      }
      await expect(bubble).toHaveCSS('opacity', '0');
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('H2: a late task chip carries the Late definition as its title', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const title = `${testPrefix} H2 Late Kitchen Task`;
      // Started 5 days ago for 3 days: the planned end is past
      const taskId = await createWorkItemViaApi(page, {
        title,
        status: 'not_started',
        startDate: dayOffset(-5),
        durationDays: 3,
      });
      cleanup.fns.push(async () => {
        await deleteWorkItemViaApi(page, taskId);
      });

      const list = new WorkItemsPage(page);
      await list.openSearch(`${testPrefix} H2`);
      const chip = list.scheduleSignal(taskId);
      await expect(chip).toContainText('Late');
      await expect(chip).toHaveAttribute('title', definition('en', 'late'));
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('H3: the Schedule legend ⓘ lists Late and Held up; Escape closes only the panel', async ({
    browser,
    page: admin,
    testPrefix,
  }, testInfo) => {
    const session = await openAsLocaleUser(
      browser,
      admin,
      testPrefix,
      '/',
      'en',
      projectContextOptions(testInfo),
    );
    try {
      const { page } = session;
      const timeline = new TimelinePage(page);
      const hints = new TermHintControl(page);
      await timeline.mockTimeline(buildScheduleScenario());
      await timeline.goto();
      await timeline.showChart();
      await timeline.legendToggle.click();
      await expect(timeline.legend).toBeVisible();

      const button = timeline.legendExplainButton;
      await expect(button).toBeVisible();
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await button.click();
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      await expect(hints.popover).toBeVisible();
      await expect(hints.popover.locator('dt')).toHaveText(['Late', 'Held up']);
      await expect(hints.popoverEntry('Late').definition).toHaveText(definition('en', 'late'));
      await expect(hints.popoverEntry('Held up').definition).toHaveText(definition('en', 'heldUp'));

      // First Escape: the panel closes, the legend stays, focus is on the ⓘ
      await page.keyboard.press('Escape');
      await expect(hints.popover).toHaveCount(0);
      await expect(button).toBeFocused();
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await expect(timeline.legend).toBeVisible();

      if ((page.viewportSize()?.width ?? 1920) <= PHONE_MAX_WIDTH) {
        // The phone legend is a sheet: the second Escape closes it
        await page.keyboard.press('Escape');
        await expect(timeline.legend).toBeHidden();
      }
    } finally {
      await session.dispose();
    }
  });

  test('H4: a column-header ⓘ opens the panel and does not sort', async ({ page, testPrefix }) => {
    const milestoneIds: number[] = [];
    try {
      for (const [index, offset] of [10, 20].entries()) {
        milestoneIds.push(
          await createMilestoneViaApi(page, {
            title: `${testPrefix} H4 Example Milestone ${index + 1}`,
            targetDate: dayOffset(offset),
          }),
        );
      }
      const milestones = new MilestonesPage(page);
      const hints = new TermHintControl(page);
      await milestones.goto();
      await milestones.waitForLoaded();
      test.skip(
        !(await milestones.tableSurface.isVisible()),
        'the card surface has no column headers',
      );

      const header = milestones.columnHeader('Waits for');
      const sortButton = page.getByTestId('milestones-sort-header-waitsFor');
      await expect(sortButton).toBeVisible();
      // The ⓘ sits beside the sort button, never inside it
      await expect(sortButton.getByRole('button')).toHaveCount(0);

      const before = page.url();
      const button = milestones.columnTermHint('Waits for');
      await expect(button).toBeVisible();
      await button.click();
      await expect(hints.popover).toBeVisible();
      await expect(hints.popoverEntry('Waits for').definition).toHaveText(
        definition('en', 'waitsFor'),
      );
      expect(page.url()).toBe(before);
      await expect(header).not.toHaveAttribute('aria-sort', /ascending|descending/);

      await page.keyboard.press('Escape');
      await expect(hints.popover).toHaveCount(0);
      await expect(button).toBeFocused();
      expect(page.url()).toBe(before);
    } finally {
      for (const id of milestoneIds) await deleteMilestoneViaApi(page, id);
    }
  });

  test('H5: a German interface shows the German definition', async ({
    browser,
    page: admin,
    testPrefix,
  }) => {
    const viewport = admin.viewportSize();
    test.skip(viewport !== null && viewport.width < 1200, 'the language is not viewport-bound');
    const cleanup = newCleanup();
    let session: Awaited<ReturnType<typeof openAsLocaleUser>> | undefined;
    try {
      const sourceId = await seedLoanCard(admin, cleanup, testPrefix);
      session = await openAsLocaleUser(browser, admin, testPrefix, '/', 'de');
      const { page } = session;
      await page.goto(FINANCING_ROUTE);
      const card = page.getByTestId(`financing-source-${sourceId}`);
      await expect(card).toBeVisible();

      const hints = new TermHintControl(page);
      const term = hints.term(card, i18nValue('de', 'budget', 'financing.figures.allocated'));
      const bubble = hints.bubble(term);
      await term.focus();
      await expect(bubble).toHaveCSS('opacity', '1');
      await expect(bubble).toHaveText(definition('de', 'allocated'));
      await expect(bubble).not.toHaveText(definition('en', 'allocated'));
    } finally {
      await session?.dispose();
      await runCleanup(cleanup);
    }
  });
});
