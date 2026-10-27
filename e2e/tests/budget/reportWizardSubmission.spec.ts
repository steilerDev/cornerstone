/**
 * E2E: recording a bank submission and taking it back (#2243): the two step-5 blocks, the Mark
 * dialog, the success banner and its History link, and "Revert submission" from the funding
 * source's History tab and from the History page. Real data throughout; nothing is mocked.
 *
 * Scenarios
 * - B1  AC4: step 5 has "Get the report" (Download is the one primary) and "After you send it"
 *       (Mark is secondary, a different block); Mark opens the dialog with count and total, Cancel
 *       returns focus to Mark, Confirm shows the banner, "Open History" shows the batch row
 * - B2  AC4: Mark with every line of the only invoice excluded: the dialog says nothing can be
 *       marked and offers no action
 * - B3  AC5: source History tab: Keep submission cancels; Revert restores the invoices (API),
 *       shows the toast, the "Reverted" badge and a revert row
 * - B4  AC5: the History page: revert a second batch; the submission row links to the source page
 * - B5  AC5: a batch already reverted elsewhere: the dialog shows "already reverted" with no action
 * - B6  AC5: on a phone the Revert button is full width and at least 44 px high
 */

import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { newCleanup, runCleanup } from '../../fixtures/costLineSeed.js';
import { invoiceStatus, markSubmitted, seedReadyLoan } from '../../fixtures/reportSeed.js';
import { API } from '../../fixtures/testData.js';
import { ConfirmDialogControl } from '../../pages/components/ConfirmDialogControl.js';
import { FundingSourcePage } from '../../pages/FundingSourcePage.js';
import { HistoryPage } from '../../pages/HistoryPage.js';
import { ReportWizardPage } from '../../pages/ReportWizardPage.js';

// ─────────────────────────────────────────────────────────────────────────────
// B1 / B2: Mark as submitted
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Bank report: mark as submitted (B1-B2)', { tag: '@responsive' }, () => {
  test('B1: Download and Mark sit in different blocks; Mark confirms with count and total, then Open History shows the batch', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const cleanup = newCleanup();
    try {
      const seed = await seedReadyLoan(page, cleanup, testPrefix, 'B1', [1000, 500]);
      const wizard = new ReportWizardPage(page);
      const source = new FundingSourcePage(page);

      await wizard.gotoWithType('claim', seed.sourceId);
      await wizard.expectOnStep(3, 'Select invoices');
      await wizard.goNextFromStep3();
      await wizard.goNextFromStep4();
      await expect(wizard.stepHeading).toHaveText('Preview and export');

      // Two blocks: Download (the one primary) with the report, Mark with the "after you send it"
      await expect(
        wizard.getReportBlock.getByRole('button', { name: 'Download PDF' }),
      ).toBeVisible();
      await expect(
        wizard.getReportBlock.getByRole('button', { name: 'Preview PDF' }),
      ).toBeVisible();
      await expect(wizard.afterSendBlock.getByRole('heading', { level: 3 })).toHaveText(
        'After you send it',
      );
      await expect(
        wizard.afterSendBlock.getByRole('button', { name: /^Mark \d+ invoices? as submitted$/ }),
      ).toBeVisible();
      await expect(wizard.getReportBlock.getByRole('button', { name: /^Mark / })).toHaveCount(0);
      await expect(wizard.afterSendBlock.getByRole('button', { name: 'Download PDF' })).toHaveCount(
        0,
      );
      await expect(wizard.downloadButton).toHaveClass(/btnPrimary/);
      await expect(wizard.markClaimedButton).toHaveClass(/btnSecondary/);
      await expect(wizard.markClaimedButton).not.toHaveClass(/btnPrimary/);
      await expect(wizard.finishWithoutMarkingButton).toBeVisible();

      // The dialog names the count and the total; Cancel returns focus to Mark
      await wizard.clickMarkClaimed();
      await expect(wizard.claimConfirmModal).toHaveAccessibleName('Mark 2 invoices as submitted?');
      await expect(wizard.claimConfirmModalBody).toContainText(/Total: .*1,500\.00/);
      await expect(wizard.claimConfirmModalBody).toContainText(
        `They move from To pay or Paid to Submitted for ${seed.sourceName}.`,
      );
      await expect(wizard.claimConfirmCancelButton).toBeFocused();
      await wizard.cancelClaimConfirm();
      await expect(wizard.markClaimedButton).toBeFocused();

      // Confirm: the banner counts what the server marked and offers both links
      await wizard.clickMarkClaimed();
      await wizard.confirmClaim();
      await expect(wizard.claimConfirmModal).toBeHidden();
      await expect(wizard.claimSuccessBanner).toContainText(
        '2 invoices and 0 progress payments marked as submitted',
      );
      await expect(wizard.claimSuccessInvoicesLink).toBeVisible();
      await expect(wizard.afterSendBlock).toHaveCount(0);
      for (const invoice of seed.invoices) {
        expect(await invoiceStatus(page, invoice.id)).toBe('claimed');
      }

      await wizard.claimSuccessHistoryLink.click();
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === routeUrl('fundingSource', { id: seed.sourceId }) &&
          url.searchParams.get('tab') === 'history',
      );
      await expect(source.history).toContainText('2 invoices submitted to the bank');
      await expect(source.history).toContainText(/1,500\.00/);
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('B2: when every line of the only invoice is excluded the dialog says nothing can be marked and has no action', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const cleanup = newCleanup();
    try {
      const seed = await seedReadyLoan(page, cleanup, testPrefix, 'B2', [800]);
      const invoice = seed.invoices[0]!;
      const wizard = new ReportWizardPage(page);

      await wizard.gotoWithType('claim', seed.sourceId);
      await wizard.expectOnStep(3, 'Select invoices');
      await wizard.invoiceExpandToggle(seed.vendorName, invoice.number).click();
      await wizard
        .itemExclusionCheckbox(seed.vendorName, invoice.number, `${testPrefix} B2 line 1`)
        .click();
      await wizard.goNextFromStep3();
      await wizard.goNextFromStep4();

      await wizard.clickMarkClaimed();
      await expect(wizard.markClaimedWarningBlock).toContainText(
        '1 invoice has excluded line items',
      );
      await wizard.confirmClaim();

      // The message sits in the dialog and the action is gone; only Cancel remains
      await expect(wizard.claimErrorBanner).toContainText('Nothing can be marked as submitted');
      await expect(wizard.claimConfirmConfirmButton).toHaveCount(0);
      await wizard.cancelClaimConfirm();
      expect(await invoiceStatus(page, invoice.id)).toBe('pending');
    } finally {
      await runCleanup(cleanup);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B3 - B6: Revert submission
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Bank report: revert a submission (B3-B6)', { tag: '@responsive' }, () => {
  test('B3: on the source History tab, Keep submission cancels and Revert restores the invoices', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const seed = await seedReadyLoan(page, cleanup, testPrefix, 'B3', [1000, 500]);
      const batchId = await markSubmitted(
        page,
        seed.sourceId,
        seed.invoices.map((invoice) => invoice.id),
      );
      const source = new FundingSourcePage(page);
      const dialog = new ConfirmDialogControl(page, 'revert-submission');

      await source.goto(seed.sourceId, { tab: 'history' });
      await expect(source.history).toContainText('2 invoices submitted to the bank');
      await expect(source.revertedBadges()).toHaveCount(0);
      await expect(source.revertButton(batchId)).toHaveText('Revert submission');

      // The dialog: title, what changes, and the neutral way out
      await source.revertButton(batchId).click();
      await dialog.waitForOpen();
      await expect(dialog.dialog).toHaveAccessibleName('Revert submission of 2 invoices?');
      await expect(dialog.dialog).toContainText(/Total .*1,500\.00/);
      await expect(dialog.consequence('Invoices that go back to To pay')).toContainText('2');
      await expect(dialog.cancelButton).toHaveText('Keep submission');
      await expect(dialog.confirmButton).toHaveText('Revert submission');
      await dialog.cancel();
      await expect(source.revertButton(batchId)).toBeFocused();
      for (const invoice of seed.invoices) {
        expect(await invoiceStatus(page, invoice.id)).toBe('claimed');
      }

      // Revert: toast, invoices back to To pay, the row marked Reverted, plus a revert row
      await source.revertButton(batchId).click();
      await dialog.waitForOpen();
      await dialog.confirmAndWaitClosed();
      await expect(source.toasts.infoToast).toContainText(
        'Submission reverted. 2 invoices are back to To pay or Paid.',
      );
      await expect(source.revertedBadges()).toHaveCount(1);
      await expect(source.revertedBadges().first()).toHaveText('Reverted');
      await expect(source.revertButton(batchId)).toHaveCount(0);
      await expect(source.history).toContainText('Submission of 2 invoices reverted');
      await expect(source.history).toContainText('2 invoices submitted to the bank');
      for (const invoice of seed.invoices) {
        expect(await invoiceStatus(page, invoice.id)).toBe('pending');
      }
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('B4: on the History page a second batch is reverted, and the submission row links to the source page', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const seed = await seedReadyLoan(page, cleanup, testPrefix, 'B4', [700]);
      const batchId = await markSubmitted(page, seed.sourceId, [seed.invoices[0]!.id]);
      const history = new HistoryPage(page);
      const dialog = new ConfirmDialogControl(page, 'revert-submission');

      // The invoice number is unique to this test, so `q` isolates its rows
      await history.goto({ q: seed.invoices[0]!.number });
      await expect(history.revertButton(batchId)).toBeVisible();
      await expect(history.revertedBadges()).toHaveCount(0);

      await history.revertButton(batchId).click();
      await dialog.waitForOpen();
      await expect(dialog.dialog).toHaveAccessibleName('Revert submission of 1 invoice?');
      await dialog.confirmAndWaitClosed();

      await expect(history.revertedBadges()).toHaveCount(1);
      await expect(history.revertButton(batchId)).toHaveCount(0);
      expect(await invoiceStatus(page, seed.invoices[0]!.id)).toBe('pending');

      // The "Open ‹source›" link goes to the funding source page, not the bank report
      const link = history.feed.getByRole('link', { name: `Open ${seed.sourceName}` }).first();
      await expect(link).toHaveAttribute('href', routeUrl('fundingSource', { id: seed.sourceId }));
      await link.click();
      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('fundingSource', { id: seed.sourceId }),
      );
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('B5: a batch reverted elsewhere shows "already reverted" in the dialog with no action', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const seed = await seedReadyLoan(page, cleanup, testPrefix, 'B5', [600]);
      const batchId = await markSubmitted(page, seed.sourceId, [seed.invoices[0]!.id]);
      const source = new FundingSourcePage(page);
      const dialog = new ConfirmDialogControl(page, 'revert-submission');

      // The page still shows the button when another session reverts the batch first
      await source.goto(seed.sourceId, { tab: 'history' });
      await expect(source.revertButton(batchId)).toBeVisible();
      const revert = await page.request.post(`${API.sourceReports}/batches/${batchId}/revert`);
      expect(revert.ok(), `POST revert: ${revert.status()}`).toBeTruthy();

      await source.revertButton(batchId).click();
      await dialog.waitForOpen();
      await dialog.confirm();
      await expect(dialog.dialog).toContainText('This submission was already reverted.');
      await expect(dialog.confirmButton).toHaveCount(0);

      // Closing reloads the feed, which now shows the reverted state and no button
      await dialog.cancel();
      await expect(source.revertButton(batchId)).toHaveCount(0);
      await expect(source.revertedBadges()).toHaveCount(1);
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('B6: on a phone the Revert button is full width and at least 44 px high', async ({
    page,
    testPrefix,
  }) => {
    test.skip(test.info().project.name !== 'mobile', 'Phone width only');
    const cleanup = newCleanup();
    try {
      const seed = await seedReadyLoan(page, cleanup, testPrefix, 'B6', [450]);
      const batchId = await markSubmitted(page, seed.sourceId, [seed.invoices[0]!.id]);
      const source = new FundingSourcePage(page);

      await source.goto(seed.sourceId, { tab: 'history' });
      const button = source.revertButton(batchId);
      await expect(button).toBeVisible();

      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(43.99);
      // Full width: as wide as the content box of its parent
      const parentContentWidth = await button.evaluate((el) => {
        const parent = el.parentElement!;
        const style = getComputedStyle(parent);
        return parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      });
      expect(Math.abs(box!.width - parentContentWidth)).toBeLessThanOrEqual(1);
    } finally {
      await runCleanup(cleanup);
    }
  });
});
