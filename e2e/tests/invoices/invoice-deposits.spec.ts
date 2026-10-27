/**
 * E2E tests for progress payments and refunds on the offer / invoice page (Issue #1404, #1876,
 * rebuilt on the detail template in #2239).
 *
 * The Payments tab holds two RelatedLists: "Progress payments (n)" (rows "Progress payment n",
 * closed by a "Final payment" row once the first progress payment exists) and "Refunds (n)".
 * Rows carry a status chip (`payment-status-<id>`), a pencil (Edit) and a ⋯ menu (Remove, with
 * Undo). The strip shows Paid and Still to pay.
 *
 *   pending → paid → claimed (forward, with a Today / Pick date step)
 *   paid → pending, claimed → paid (reverse, no date step)
 *   pending → claimed DISALLOWED
 *
 * Scenarios:
 *   1.  Both lists empty: message + action each, no final-payment row
 *   2.  Add a progress payment → "Progress payment 1", chip To pay, "Due <date>", final-payment
 *       row appears, the heading count excludes it
 *   3.  Cancel the add dialog
 *   4.  Lifecycle: Mark paid (Today) → "Paid <date>" and the strip updates → Mark submitted →
 *       back to Paid → edit the amount with the pencil
 *   5.  Remove a pending progress payment → row gone → Undo brings it back
 *   6.  Over-payment shows a live, non-blocking warning
 *   7.  Reverse move fails with INVALID_DEPOSIT_STATUS_TRANSITION → error toast, status unchanged
 *   8.  Refund: add → Refunds row with a minus amount; paid refund reduces the final payment
 *   9.  Refund above the headroom shows REFUND_EXCEEDS_INVOICE and keeps the dialog open
 *   10. Edit a refund: type is locked, amount edit saves
 *   11. Refund lifecycle reuses the same chip vocabulary
 *   12. Headroom is net of refunds (#2109)
 *
 * Invoices are seeded as `pending` (an offer has no chip and a different primary). API helpers:
 *   POST   /api/invoices/:invoiceId/deposits        → 201 { deposit: { id, status, amount } }
 *   PATCH  /api/invoices/:invoiceId/deposits/:id    → 200 { deposit: { ... } }
 */

import { test, expect } from '../../fixtures/auth.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import { API } from '../../fixtures/testData.js';
import type { Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────────────────────────────────────

interface DepositData {
  id: string;
  status: string;
  amount: number;
  entryType?: string;
}

async function createVendorViaApi(page: Page, name: string): Promise<string> {
  const response = await page.request.post(API.vendors, { data: { name } });
  expect(response.ok(), `POST vendor "${name}" failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { vendor: { id: string } };
  return body.vendor.id;
}

async function deleteVendorViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`${API.vendors}/${id}`);
}

async function createInvoiceViaApi(
  page: Page,
  vendorId: string,
  data: { amount: number; date: string; status?: string; invoiceNumber?: string },
): Promise<string> {
  const response = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
    data: { status: 'pending', ...data },
  });
  expect(response.ok(), `POST invoice failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { invoice: { id: string } };
  return body.invoice.id;
}

async function createDepositViaApi(
  page: Page,
  invoiceId: string,
  data: {
    amount: number;
    dueDate: string;
    status?: 'pending' | 'paid' | 'claimed';
    paidDate?: string;
    claimedDate?: string;
    description?: string;
    entryType?: 'deposit' | 'refund';
  },
): Promise<DepositData> {
  const response = await page.request.post(`/api/invoices/${invoiceId}/deposits`, {
    data: { status: 'pending', ...data },
  });
  expect(response.ok(), `POST deposit failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { deposit: DepositData };
  return body.deposit;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Empty states
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Payments — empty states (Scenario 1)', { tag: '@responsive' }, () => {
  test(
    'Both lists show their message and action; no final-payment row',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const detail = new InvoiceDetailPage(page);
      let vendorId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} Pay EmptyVendor`);
        const invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 1000,
          date: '2026-06-01',
        });

        await detail.goto(invoiceId);
        await detail.openPayments();

        await expect(detail.progressPayments.heading).toHaveText('Progress payments (0)');
        await expect(detail.refunds.heading).toHaveText('Refunds (0)');
        await expect(
          detail.progressPayments.emptyMessage('No progress payments yet. Add a progress payment.'),
        ).toBeVisible();
        await expect(detail.refunds.emptyMessage('No refunds yet. Add a refund.')).toBeVisible();
        await expect(detail.progressPayments.addAction('Add progress payment')).toBeVisible();
        await expect(detail.refunds.addAction('Add refund')).toBeVisible();

        // The final-payment row exists only once a progress payment does
        await expect(detail.finalPaymentRow).toHaveCount(0);
        // The tab label carries the count
        await expect(detail.tabs.tab('payments')).toHaveText('Payments (0)');
      } finally {
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2-3: Add a progress payment
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Payments — add a progress payment (Scenarios 2 and 3)',
  { tag: '@responsive' },
  () => {
    test(
      'Add → "Progress payment 1" with chip To pay and a due date; the final-payment row closes the list',
      { tag: '@smoke' },
      async ({ page, testPrefix }) => {
        const detail = new InvoiceDetailPage(page);
        let vendorId = '';

        try {
          vendorId = await createVendorViaApi(page, `${testPrefix} Pay AddVendor`);
          const invoiceId = await createInvoiceViaApi(page, vendorId, {
            amount: 1000,
            date: '2026-06-01',
          });

          await detail.goto(invoiceId);
          await detail.openAddProgressPayment();
          await expect(detail.depositModal).toBeVisible();
          await expect(
            detail.depositModal.getByRole('heading', { name: 'Add progress payment' }),
          ).toBeVisible();
          await detail.fillDepositForm({ amount: '600', dueDate: '2026-07-01' });
          await detail.saveDepositForm(201);

          const [id] = await detail.paymentIds();
          expect(id, 'the new progress payment has a row').toBeTruthy();
          const row = detail.progressPayments.row(id!);
          await expect(row).toContainText('Progress payment 1');
          await expect(row).toContainText('600.00');
          await expect(row).toContainText(/Due /);
          await expect(detail.paymentStatusMenu(id!).trigger).toHaveText('To pay');

          // The final payment closes the list: the invoice minus the payment; it is not counted
          await expect(detail.finalPaymentRow).toBeVisible();
          await expect(detail.finalPaymentRow).toContainText('Final payment');
          await expect(detail.finalPaymentRow).toContainText('400.00');
          await expect(detail.progressPayments.heading).toHaveText('Progress payments (1)');
          await expect(detail.tabs.tab('payments')).toHaveText('Payments (1)');
          // Neither a pencil nor a menu on the final payment
          await expect(detail.progressPayments.editButton('final-payment')).toHaveCount(0);
          await expect(detail.progressPayments.actionsTrigger('final-payment')).toHaveCount(0);

          // The header's secondary opens the same dialog
          await detail.addPaymentSecondary.click();
          await expect(detail.depositAmountInput).toBeVisible();
          await detail.depositModalCancel.click();
          await detail.depositAmountInput.waitFor({ state: 'hidden' });
        } finally {
          if (vendorId) await deleteVendorViaApi(page, vendorId);
        }
      },
    );

    test('The add dialog can be cancelled without creating a payment', async ({
      page,
      testPrefix,
    }) => {
      const detail = new InvoiceDetailPage(page);
      let vendorId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} Pay CancelVendor`);
        const invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 500,
          date: '2026-06-01',
        });

        await detail.goto(invoiceId);
        await detail.openAddProgressPayment();
        await detail.fillDepositForm({ amount: '100', dueDate: '2026-07-01' });
        await detail.depositModalCancel.click();
        await detail.depositAmountInput.waitFor({ state: 'hidden' });

        await expect(detail.progressPayments.heading).toHaveText('Progress payments (0)');
        await expect(detail.progressPayments.rows).toHaveCount(0);
      } finally {
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Payments — lifecycle (Scenario 4)', { tag: '@responsive' }, () => {
  test('Mark paid → Paid <date> and the strip updates → Mark submitted → back to Paid → edit amount', async ({
    page,
    testPrefix,
  }) => {
    const detail = new InvoiceDetailPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} Pay LifecycleVendor`);
      const invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 1000,
        date: '2026-06-01',
      });
      const deposit = await createDepositViaApi(page, invoiceId, {
        amount: 300,
        dueDate: '2026-07-01',
      });

      await detail.goto(invoiceId);
      await expect(detail.summary.fact('paid')).toContainText('0.00');
      await detail.openPayments();
      const row = detail.progressPayments.row(deposit.id);
      const chip = detail.paymentStatusMenu(deposit.id);
      await expect(chip.trigger).toHaveText('To pay');

      // Mark paid > Today: the row reads "Paid <date>", the strip's Paid and Still to pay follow
      await detail.changePaymentStatus(deposit.id, 'paid', { date: 'today' });
      await expect(chip.trigger).toHaveText('Paid');
      await expect(row).toContainText(/Paid /);
      await expect(detail.summary.fact('paid')).toContainText('300.00');
      await expect(detail.summary.fact('stillToPay')).toContainText('700.00');

      // Mark submitted > Today
      await detail.changePaymentStatus(deposit.id, 'claimed', { date: 'today' });
      await expect(chip.trigger).toHaveText('Submitted');
      await expect(row).toContainText(/Submitted /);

      // Back to Paid has no date step
      await detail.changePaymentStatus(deposit.id, 'paid');
      await expect(chip.trigger).toHaveText('Paid');
      await expect(chip.dateToday).toBeHidden();

      // The pencil opens "Edit Progress payment 1"; the entry type is locked and the status is
      // not an add-only field any more
      await detail.openEditPayment(deposit.id);
      await expect(
        detail.depositModal.getByRole('heading', { name: 'Edit Progress payment 1' }),
      ).toBeVisible();
      await expect(detail.depositEntryTypeDepositRadio).toBeChecked();
      await expect(detail.depositEntryTypeDepositRadio).toBeDisabled();
      await expect(detail.depositStatusSelect).toHaveCount(0);
      await detail.depositAmountInput.fill('250');
      await detail.saveDepositForm(200);
      await expect(row).toContainText('250.00');
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Remove with Undo
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Payments — remove with Undo (Scenario 5)', { tag: '@responsive' }, () => {
  test('⋯ › Remove deletes the row at once; Undo brings it back', async ({ page, testPrefix }) => {
    const detail = new InvoiceDetailPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} Pay RemoveVendor`);
      const invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 800,
        date: '2026-06-01',
      });
      const deposit = await createDepositViaApi(page, invoiceId, {
        amount: 200,
        dueDate: '2026-07-01',
      });

      await detail.goto(invoiceId);
      await detail.openPayments();
      await expect(detail.progressPayments.row(deposit.id)).toBeVisible();

      await detail.removePayment(deposit.id);

      // No confirmation dialog: the row is gone, an Undo toast shows
      await expect(detail.progressPayments.row(deposit.id)).toHaveCount(0);
      await expect(detail.progressPayments.heading).toHaveText('Progress payments (0)');
      await expect(detail.toasts.undoToast).toBeVisible();
      await expect(detail.finalPaymentRow).toHaveCount(0);

      await detail.toasts.undoViaButton();
      await expect(detail.progressPayments.row(deposit.id)).toBeVisible();
      await expect(detail.progressPayments.heading).toHaveText('Progress payments (1)');
      await expect(detail.finalPaymentRow).toBeVisible();
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Over-payment warning
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Payments — over-payment warning, non-blocking (Scenario 6)', () => {
  test('A payment above the invoice amount shows a live warning and still saves', async ({
    page,
    testPrefix,
  }) => {
    const detail = new InvoiceDetailPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} Pay ExceedVendor`);
      const invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 100,
        date: '2026-06-01',
      });
      await createDepositViaApi(page, invoiceId, { amount: 60, dueDate: '2026-07-01' });

      await detail.goto(invoiceId);
      await detail.openPayments();
      await expect(detail.finalPaymentRow).toContainText('40.00');

      await detail.openAddProgressPayment();
      await detail.fillDepositForm({ amount: '60', dueDate: '2026-08-01' });

      // 60 + 60 - 100 = 20 over
      await expect(detail.depositExceedsWarning).toBeVisible();
      await expect(detail.depositExceedsWarning).toContainText(
        'Progress payments will exceed the invoice amount by',
      );
      await expect(detail.depositExceedsWarning).toContainText('20');
      await expect(detail.depositExceedsWarning).toContainText('You can still save.');
      await expect(detail.depositAmountInput).toHaveAttribute(
        'aria-describedby',
        'deposit-amount-warning',
      );
      await expect(detail.depositModalSave).toBeEnabled();

      // 40 fits exactly -> warning disappears; back to 60 -> it returns
      await detail.depositAmountInput.fill('40');
      await expect(detail.depositExceedsWarning).toBeHidden();
      await detail.depositAmountInput.fill('60');
      await expect(detail.depositExceedsWarning).toBeVisible();

      // Save is not blocked
      await detail.saveDepositForm(201);
      await expect(detail.depositModalError).toBeHidden();
      await expect(detail.progressPayments.heading).toHaveText('Progress payments (2)');
      await expect(detail.finalPaymentRow).toContainText(/0[.,]00/);
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Reverse move fails
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Payments — reverse move fails (Scenario 7)', () => {
  test('INVALID_DEPOSIT_STATUS_TRANSITION shows an error toast and the status is unchanged', async ({
    page,
    testPrefix,
  }) => {
    // One behaviour, viewport-independent: run it once on the desktop project
    test.skip((page.viewportSize()?.width ?? 1440) < 1024, 'desktop viewport only');

    const detail = new InvoiceDetailPage(page);
    let vendorId = '';
    const routePattern = '**/api/invoices/*/deposits/*';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} Pay RevertErrVendor`);
      const invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 500,
        date: '2026-06-01',
      });
      const deposit = await createDepositViaApi(page, invoiceId, {
        amount: 200,
        dueDate: '2026-07-01',
      });
      const today = new Date().toISOString().slice(0, 10);
      const paid = await page.request.patch(`/api/invoices/${invoiceId}/deposits/${deposit.id}`, {
        data: { status: 'paid', paidDate: today },
      });
      expect(paid.ok(), `PATCH pending→paid failed: ${paid.status()}`).toBeTruthy();

      await detail.goto(invoiceId);
      await detail.openPayments();
      const chip = detail.paymentStatusMenu(deposit.id);
      await expect(chip.trigger).toHaveText('Paid');

      await page.route(routePattern, async (route) => {
        if (route.request().method() === 'PATCH') {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              error: { code: 'INVALID_DEPOSIT_STATUS_TRANSITION', message: 'Cannot revert' },
            }),
          });
        } else {
          await route.continue();
        }
      });

      await chip.pickRow('pending');

      await expect(detail.toasts.errorToast).toBeVisible();
      await expect(chip.trigger).toHaveText('Paid');
    } finally {
      await page.unroute(routePattern);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Refunds
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Refunds — add and mark paid (Scenario 8, #1876)', { tag: '@responsive' }, () => {
  test(
    'Add refund → Refunds row with a minus amount; paid refund reduces the final payment',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const detail = new InvoiceDetailPage(page);
      let vendorId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} Refund AddVendor`);
        const invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 2000,
          date: '2026-06-01',
        });
        // A progress payment first: the final-payment row exists only with one
        await createDepositViaApi(page, invoiceId, { amount: 500, dueDate: '2026-06-15' });

        await detail.goto(invoiceId);
        await detail.openAddRefund();
        await expect(
          detail.depositModal.getByRole('heading', { name: 'Add refund' }),
        ).toBeVisible();
        // The entry type is fixed by the list the dialog was opened from
        await expect(detail.depositEntryTypeRefundRadio).toBeChecked();
        await expect(detail.depositEntryTypeRefundRadio).toBeDisabled();
        await detail.fillDepositForm({ amount: '300', dueDate: '2026-07-01' });
        await detail.saveDepositForm(201);

        const [refundId] = await detail.paymentIds('refund');
        expect(refundId, 'the new refund has a row').toBeTruthy();
        const row = detail.refunds.row(refundId!);
        await expect(detail.refunds.heading).toHaveText('Refunds (1)');
        await expect(row).toContainText('Refund 1');
        await expect(row).toContainText('Refund');
        // Shown as a minus amount: the sign is a hyphen-minus or a true minus sign
        await expect(row).toContainText(/[-−]\s?€?\s?300\.00/);

        // The refund is pending: the final payment is unchanged (2000 - 500)
        await expect(detail.finalPaymentRow).toContainText('1,500.00');

        // Mark the refund paid: a received refund reduces the final payment (2000 - 500 - 300)
        await detail.changePaymentStatus(refundId!, 'paid', { date: 'today' });
        await expect(detail.paymentStatusMenu(refundId!).trigger).toHaveText('Paid');
        await expect(row).toContainText(/Paid /);
        await expect(detail.finalPaymentRow).toContainText('1,200.00');
      } finally {
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: REFUND_EXCEEDS_INVOICE
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Refunds — exceed the headroom (Scenario 9, #1876)', () => {
  test('A refund above the available headroom shows REFUND_EXCEEDS_INVOICE with the amount', async ({
    page,
    testPrefix,
  }) => {
    const detail = new InvoiceDetailPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} Refund ExceedVendor`);
      const invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 100,
        date: '2026-06-01',
      });
      // First refund of 70: 30 of headroom remain (the refund sum counts any status)
      await createDepositViaApi(page, invoiceId, {
        entryType: 'refund',
        amount: 70,
        dueDate: '2026-07-01',
      });

      await detail.goto(invoiceId);
      await detail.openPayments();
      await expect(detail.refunds.rows).toHaveCount(1);

      await detail.openAddRefund();
      await detail.fillDepositForm({ amount: '50', dueDate: '2026-08-01' });
      const failed = page.waitForResponse(
        (resp) =>
          resp.url().includes('/deposits') &&
          resp.request().method() === 'POST' &&
          resp.status() === 400,
      );
      await detail.depositModalSave.click();
      await failed;

      // The error names the available headroom (30); the dialog stays open
      await expect(detail.depositModalError).toBeVisible();
      await expect(detail.depositModalError).toContainText('30');
      await expect(detail.depositAmountInput).toBeVisible();

      await detail.depositModalCancel.click();
      await detail.depositAmountInput.waitFor({ state: 'hidden' });
      await expect(detail.refunds.rows).toHaveCount(1);
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10-11: Edit and lifecycle of a refund
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Refunds — edit and lifecycle (Scenarios 10 and 11, #1876)', () => {
  test('Editing a refund locks the type (Refund checked, both radios disabled); the amount saves', async ({
    page,
    testPrefix,
  }) => {
    test.skip((page.viewportSize()?.width ?? 1440) < 1024, 'desktop viewport only');
    const detail = new InvoiceDetailPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} Refund EditVendor`);
      const invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 1000,
        date: '2026-06-01',
      });
      const refund = await createDepositViaApi(page, invoiceId, {
        entryType: 'refund',
        amount: 200,
        dueDate: '2026-07-01',
      });

      await detail.goto(invoiceId);
      await detail.openEditPayment(refund.id, 'refund');
      await expect(
        detail.depositModal.getByRole('heading', { name: 'Edit Refund 1' }),
      ).toBeVisible();

      await expect(detail.depositEntryTypeRefundRadio).toBeChecked();
      await expect(detail.depositEntryTypeRefundRadio).toBeDisabled();
      await expect(detail.depositEntryTypeDepositRadio).toBeDisabled();

      await detail.depositAmountInput.fill('250');
      await detail.saveDepositForm(200);

      const row = detail.refunds.row(refund.id);
      await expect(row).toContainText('250.00');
      await expect(row).toContainText('Refund');
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });

  test('A refund goes pending → paid → submitted → back to paid with the same chip vocabulary', async ({
    page,
    testPrefix,
  }) => {
    const detail = new InvoiceDetailPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} Refund LifecycleVendor`);
      const invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 1000,
        date: '2026-06-01',
      });
      const refund = await createDepositViaApi(page, invoiceId, {
        entryType: 'refund',
        amount: 100,
        dueDate: '2026-07-01',
      });

      await detail.goto(invoiceId);
      await detail.openPayments();
      const chip = detail.paymentStatusMenu(refund.id);
      await expect(chip.trigger).toHaveText('To pay');

      await detail.changePaymentStatus(refund.id, 'paid', { date: 'today' });
      await expect(chip.trigger).toHaveText('Paid');
      await detail.changePaymentStatus(refund.id, 'claimed', { date: 'today' });
      await expect(chip.trigger).toHaveText('Submitted');
      await detail.changePaymentStatus(refund.id, 'paid');
      await expect(chip.trigger).toHaveText('Paid');
      await expect(detail.refunds.row(refund.id)).toContainText(/[-−]\s?€?\s?100\.00/);
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 12: Headroom is net of refunds (#2109)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Payments — headroom is net of refunds (Scenario 12, #2109)', () => {
  test('With a payment of 100 and a refund of 30 on a 100 invoice, adding a payment of 30 succeeds', async ({
    page,
    testPrefix,
  }) => {
    const detail = new InvoiceDetailPage(page);
    let vendorId = '';
    const description = `${testPrefix} net-of-refund payment`;

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} NetRefund Vendor`);
      const invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 100,
        date: '2026-06-01',
      });
      await createDepositViaApi(page, invoiceId, { amount: 100, dueDate: '2026-07-01' });
      await createDepositViaApi(page, invoiceId, {
        entryType: 'refund',
        amount: 30,
        dueDate: '2026-07-02',
      });

      await detail.goto(invoiceId);
      await detail.openAddProgressPayment();
      await detail.fillDepositForm({ amount: '30', dueDate: '2026-08-01', description });
      await detail.saveDepositForm();

      // The dialog closed without an error and the entry is listed under its own name
      await expect(detail.depositModalError).toBeHidden();
      await expect(detail.progressPayments.rowWith(description)).toBeVisible();
      await expect(detail.progressPayments.heading).toHaveText('Progress payments (2)');
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});
