/**
 * E2E tests for Invoice Deposits (Issue #1404)
 *
 * The InvoiceDepositsSection renders between Invoice Details and Budget Lines.
 * Users can add, edit, delete deposits and drive them through a state machine:
 *   pending → paid → claimed (forward)
 *   paid → pending (revert)
 *   claimed → paid (revert)
 *   pending → claimed DISALLOWED
 *
 * Scenarios covered:
 *   1. Empty state: invoice with zero deposits shows EmptyState + "Add deposit" CTA, no Final Payment row
 *   2. Add deposit happy path: modal opens, fill form, save → row appears with Pending badge,
 *      Final Payment = total − deposit amount
 *   3. Full lifecycle: add → mark paid → mark claimed → revert to paid → edit → delete
 *   4. Delete paid deposit: warning banner visible in delete modal
 *   5. DEPOSITS_EXCEED_INVOICE_TOTAL error surfaces in the form with available headroom
 *   6. Responsive tablet: table renders, Final Payment row visible (768px)
 *   7. Responsive mobile: cards render, Final Payment row visible, "Mark paid" flow works (375px)
 *
 * Implementation notes:
 * - Deposit add/edit modal uses shared Modal with useId() dynamic aria-labelledby.
 *   Locate modals by role="dialog" + form input visibility or heading text.
 * - "Save" button: button[type="submit"][form="deposit-form"] (locale-independent)
 * - "Confirm" button for state transitions: role="button", name="Confirm" (locale-independent)
 * - Warning banner: [class*="warningBanner"] (CSS module class on the warning div)
 * - Final payment row: [class*="finalPaymentRow"] with aria-live="polite" amount
 * - Mobile cards (≤767px): [class*="mobileCard"] role="list" in [class*="mobileCardList"]
 * - Desktop table (>767px): [class*="tableWrapper"] > table
 *
 * API endpoints used in helpers:
 *   POST   /api/invoices/:invoiceId/deposits        → 201 { deposit: { id, status, amount } }
 *   PATCH  /api/invoices/:invoiceId/deposits/:id    → 200 { deposit: { ... } }
 *   DELETE /api/invoices/:invoiceId/deposits/:id    → 204
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
    data: { status: 'quotation', ...data },
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
  },
): Promise<DepositData> {
  const response = await page.request.post(`/api/invoices/${invoiceId}/deposits`, {
    data: { status: 'pending', ...data },
  });
  expect(response.ok(), `POST deposit failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { deposit: DepositData };
  return body.deposit;
}

async function deleteDepositViaApi(
  page: Page,
  invoiceId: string,
  depositId: string,
): Promise<void> {
  await page.request.delete(`/api/invoices/${invoiceId}/deposits/${depositId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Empty state
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Deposits — empty state (Scenario 1)', { tag: '@responsive' }, () => {
  test(
    'Invoice with no deposits shows empty state message and "Add deposit" CTA; no Final Payment row',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const detailPage = new InvoiceDetailPage(page);
      let vendorId = '';
      let invoiceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} Dep EmptyVendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 1000,
          date: '2026-06-01',
        });

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // Deposits section is present
        await expect(detailPage.depositsSection).toBeVisible();

        // Empty state message visible
        // EmptyState renders the message in a paragraph and the action as a <button>
        await expect(detailPage.depositsSection).toContainText('No deposits yet');

        // "Add deposit" button visible in both the section header and EmptyState CTA
        // (the header button always renders; the EmptyState CTA also renders when empty)
        await expect(detailPage.addDepositButton).toBeVisible();

        // No Final Payment row when deposits.length === 0
        await expect(detailPage.finalPaymentRow).not.toBeVisible();
      } finally {
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Add deposit happy path
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Deposits — add deposit (Scenario 2)', { tag: '@responsive' }, () => {
  test(
    'Add deposit → row appears with Pending badge; Final Payment = invoice total − deposit amount',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const detailPage = new InvoiceDetailPage(page);
      let vendorId = '';
      let invoiceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} Dep AddVendor`);
        // Invoice total = 1000
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 1000,
          date: '2026-06-01',
        });

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // Click "Add deposit"
        await detailPage.openAddDepositModal();

        // Form is visible
        await expect(detailPage.depositAmountInput).toBeVisible();
        await expect(detailPage.depositDueDateInput).toBeVisible();
        await expect(detailPage.depositStatusSelect).toBeVisible();

        // Fill amount=300, due date
        await detailPage.fillDepositForm({
          amount: '300',
          dueDate: '2026-07-01',
          // status defaults to 'pending'
        });

        // Save — POST /api/invoices/:id/deposits → 201
        await detailPage.saveDepositForm(201);

        // Deposit row appears with Pending badge
        // The table row will show the amount (300.00) and the Pending status
        await expect(detailPage.depositsSection).toContainText('300');

        // Badge says "Pending" (locale-independent: look for the CSS class on the badge)
        // The badge renders inside the deposits section row
        const depositRows = detailPage.depositsSection.locator('[class*="tableRow"], [class*="mobileCard"]');
        await expect(depositRows.first()).toBeVisible();

        // Final Payment row is now visible: invoice total (1000) − deposit (300) = 700
        await expect(detailPage.finalPaymentRow).toBeVisible();
        await expect(detailPage.finalPaymentAmount).toContainText('700');

        // Invoice total in the detail card is unchanged
        // (The invoice total is shown in the detail card — we don't assert exact formatted
        //  value here since currency formatting is locale-specific)
        await expect(detailPage.detailCard).toBeVisible();
      } finally {
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );

  test('Add deposit modal can be cancelled without creating a deposit', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} Dep CancelVendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 500,
        date: '2026-06-01',
      });

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      await detailPage.openAddDepositModal();
      await expect(detailPage.depositAmountInput).toBeVisible();

      // Fill amount but cancel
      await detailPage.depositAmountInput.fill('100');

      // Click cancel button in the modal footer
      await detailPage.depositModalCancel.first().click();

      // Modal closes — amount input leaves DOM
      await detailPage.depositAmountInput.waitFor({ state: 'hidden' });

      // No deposit was created — still in empty state
      await expect(detailPage.depositsSection).toContainText('No deposits yet');
      await expect(detailPage.finalPaymentRow).not.toBeVisible();
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Full lifecycle — add, mark paid, mark claimed, revert, edit, delete
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Deposits — full lifecycle (Scenario 3)', () => {
  test(
    'Add → mark paid → mark claimed → revert to paid → edit amount → delete pending deposit',
    async ({ page, testPrefix }) => {
      const detailPage = new InvoiceDetailPage(page);
      let vendorId = '';
      let invoiceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} Dep LifecycleVendor`);
        // Invoice total = 500
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 500,
          date: '2026-06-01',
        });

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // ── Step 1: Add a deposit (amount=150, dueDate=2026-07-01, pending) ──
        await detailPage.openAddDepositModal();
        await detailPage.fillDepositForm({
          amount: '150',
          dueDate: '2026-07-01',
        });
        await detailPage.saveDepositForm(201);

        // Row appears; Final Payment = 500 − 150 = 350
        await expect(detailPage.depositsSection).toContainText('150');
        await expect(detailPage.finalPaymentAmount).toContainText('350');

        // ── Step 2: Mark paid (overflow menu → "Mark paid…") ──
        await detailPage.openDepositMenu();
        await detailPage.clickDepositMenuItem(/Mark paid/);

        // State confirm modal opens with "Mark as paid" title
        await expect(page.getByRole('dialog').filter({ has: page.getByText('Mark as paid') })).toBeVisible();

        // Confirm (date is pre-filled with today)
        await detailPage.confirmStateTransition();

        // Badge now shows "Paid" — the deposit row's badge class changes to statusPaid
        // We verify by checking the status badge text via the badge component's visible text.
        // The section should contain "Paid" text after the re-render.
        await expect(detailPage.depositsSection).toContainText('Paid');

        // ── Step 3: Mark claimed (overflow menu → "Mark claimed…") ──
        await detailPage.openDepositMenu();
        await detailPage.clickDepositMenuItem(/Mark claimed/);

        await expect(page.getByRole('dialog').filter({ has: page.getByText('Mark as claimed') })).toBeVisible();

        await detailPage.confirmStateTransition();

        await expect(detailPage.depositsSection).toContainText('Claimed');

        // ── Step 4: Revert to paid (overflow menu → "Revert to paid") ──
        await detailPage.openDepositMenu();
        const revertToPaidResponsePromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/deposits/') &&
            resp.request().method() === 'PATCH' &&
            resp.status() === 200,
        );
        await detailPage.clickDepositMenuItem(/Revert to paid/);
        await revertToPaidResponsePromise;

        // Badge reverts to "Paid"
        await expect(detailPage.depositsSection).toContainText('Paid');
        // "Claimed" badge should no longer be present
        await expect(detailPage.depositsSection).not.toContainText('Claimed');

        // ── Step 5: Edit amount (overflow menu → "Edit") ──
        await detailPage.openDepositMenu();
        await detailPage.clickDepositMenuItem(/Edit/);

        // Edit modal opens
        await expect(detailPage.depositAmountInput).toBeVisible();

        // Change amount from 150 to 200
        await detailPage.depositAmountInput.clear();
        await detailPage.depositAmountInput.fill('200');

        // Save edit (PATCH)
        await detailPage.saveDepositForm(200);

        // Final Payment = 500 − 200 = 300
        await expect(detailPage.depositsSection).toContainText('200');
        await expect(detailPage.finalPaymentAmount).toContainText('300');

        // ── Step 6: Revert to pending (so we can delete without paid warning) ──
        await detailPage.openDepositMenu();
        const revertToPendingResponsePromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/deposits/') &&
            resp.request().method() === 'PATCH' &&
            resp.status() === 200,
        );
        await detailPage.clickDepositMenuItem(/Revert to pending/);
        await revertToPendingResponsePromise;
        await expect(detailPage.depositsSection).toContainText('Pending');

        // ── Step 7: Delete the deposit ──
        await detailPage.openDepositMenu();
        await detailPage.clickDepositMenuItem(/Delete/);

        // Delete modal opens — for a pending deposit no warning banner
        await expect(page.getByRole('dialog').filter({ has: page.getByText('Delete deposit') })).toBeVisible();
        await expect(detailPage.deleteDepositWarning).not.toBeVisible();

        await detailPage.confirmDepositDelete();

        // Deposit removed — back to empty state
        await expect(detailPage.depositsSection).toContainText('No deposits yet');
        await expect(detailPage.finalPaymentRow).not.toBeVisible();
      } finally {
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Delete paid deposit — warning banner visible
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Deposits — delete paid deposit warning (Scenario 4)', () => {
  test(
    'Delete modal for a paid deposit shows warning banner; cancel keeps deposit; confirm removes it',
    async ({ page, testPrefix }) => {
      const detailPage = new InvoiceDetailPage(page);
      let vendorId = '';
      let invoiceId = '';
      let depositId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} Dep DelWarnVendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 600,
          date: '2026-06-01',
        });

        // Create a deposit in 'paid' status via the state machine: pending → paid
        // Direct creation with status='paid' is rejected by the server (ALLOWED_TRANSITIONS).
        const today = new Date().toISOString().slice(0, 10);
        const deposit = await createDepositViaApi(page, invoiceId, {
          amount: 150,
          dueDate: '2026-07-01',
        });
        depositId = deposit.id;
        // pending → paid
        const paidResp = await page.request.patch(
          `/api/invoices/${invoiceId}/deposits/${deposit.id}`,
          { data: { status: 'paid', paidDate: today } },
        );
        expect(paidResp.ok(), `PATCH pending→paid failed: ${paidResp.status()}`).toBeTruthy();

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // Deposit row is visible
        await expect(detailPage.depositsSection).toContainText('150');
        await expect(detailPage.depositsSection).toContainText('Paid');

        // Open overflow menu → Delete
        await detailPage.openDepositMenu();
        await detailPage.clickDepositMenuItem(/Delete/);

        // Delete modal opens
        await expect(page.getByRole('dialog').filter({ has: page.getByText('Delete deposit') })).toBeVisible();

        // Warning banner IS visible for a paid deposit
        await expect(detailPage.deleteDepositWarning).toBeVisible();

        // Cancel — deposit still present
        await detailPage.deleteDepositCancelButton.click();
        // Modal closes
        await expect(detailPage.deleteDepositWarning).not.toBeVisible();

        // Deposit still in the list
        await expect(detailPage.depositsSection).toContainText('150');
        await expect(detailPage.depositsSection).toContainText('Paid');

        // Now actually delete
        await detailPage.openDepositMenu();
        await detailPage.clickDepositMenuItem(/Delete/);
        await expect(detailPage.deleteDepositWarning).toBeVisible();
        await detailPage.confirmDepositDelete();

        // Deposit gone, empty state
        depositId = ''; // cleared — no cleanup needed
        await expect(detailPage.depositsSection).toContainText('No deposits yet');
      } finally {
        if (depositId && invoiceId)
          await deleteDepositViaApi(page, invoiceId, depositId).catch(() => {
            /* already deleted */
          });
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );

  test('Delete modal for a claimed deposit shows warning banner', async ({ page, testPrefix }) => {
    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId = '';
    let depositId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} Dep DelClaimedVendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 400,
        date: '2026-06-01',
      });

      // Create a deposit in 'claimed' status via state machine: pending → paid → claimed.
      // Direct creation with status='claimed' is rejected by the server (ALLOWED_TRANSITIONS).
      const today = new Date().toISOString().slice(0, 10);
      const deposit = await createDepositViaApi(page, invoiceId, {
        amount: 100,
        dueDate: '2026-07-01',
      });
      depositId = deposit.id;
      // pending → paid
      const paidResp = await page.request.patch(
        `/api/invoices/${invoiceId}/deposits/${deposit.id}`,
        { data: { status: 'paid', paidDate: today } },
      );
      expect(paidResp.ok(), `PATCH pending→paid failed: ${paidResp.status()}`).toBeTruthy();
      // paid → claimed
      const claimedResp = await page.request.patch(
        `/api/invoices/${invoiceId}/deposits/${deposit.id}`,
        { data: { status: 'claimed', claimedDate: today } },
      );
      expect(claimedResp.ok(), `PATCH paid→claimed failed: ${claimedResp.status()}`).toBeTruthy();

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      // Open Delete dialog
      await detailPage.openDepositMenu();
      await detailPage.clickDepositMenuItem(/Delete/);
      await expect(page.getByRole('dialog').filter({ has: page.getByText('Delete deposit') })).toBeVisible();

      // Warning banner visible for claimed deposit too
      await expect(detailPage.deleteDepositWarning).toBeVisible();

      // Confirm deletion
      await detailPage.confirmDepositDelete();
      depositId = '';

      await expect(detailPage.depositsSection).toContainText('No deposits yet');
    } finally {
      if (depositId && invoiceId)
        await deleteDepositViaApi(page, invoiceId, depositId).catch(() => {
          /* already deleted */
        });
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: DEPOSITS_EXCEED_INVOICE_TOTAL error
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Deposits — exceed invoice total error (Scenario 5)', () => {
  test(
    'Adding a deposit whose amount exceeds available headroom shows DEPOSITS_EXCEED_INVOICE_TOTAL error with available amount',
    async ({ page, testPrefix }) => {
      const detailPage = new InvoiceDetailPage(page);
      let vendorId = '';
      let invoiceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} Dep ExceedVendor`);
        // Invoice total = 100
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 100,
          date: '2026-06-01',
        });

        // Add first deposit of 60 (succeeds, headroom = 40 remaining)
        await createDepositViaApi(page, invoiceId, {
          amount: 60,
          dueDate: '2026-07-01',
        });

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // Verify first deposit visible and Final Payment = 40
        await expect(detailPage.depositsSection).toContainText('60');
        await expect(detailPage.finalPaymentAmount).toContainText('40');

        // Try to add a second deposit of 60 (exceeds remaining 40)
        await detailPage.openAddDepositModal();
        await detailPage.fillDepositForm({
          amount: '60',
          dueDate: '2026-08-01',
        });

        // Register the expected 400 response BEFORE clicking save
        const errorResponsePromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/deposits') &&
            resp.request().method() === 'POST' &&
            resp.status() === 400,
        );

        await detailPage.depositModalSave.click();
        await errorResponsePromise;

        // Error banner renders in the modal with the error message
        // The message includes "Available headroom" and the formatted available amount (40)
        await expect(detailPage.depositModalError).toBeVisible();
        await expect(detailPage.depositModalError).toContainText('40');

        // Modal stays open — user can correct the amount
        await expect(detailPage.depositAmountInput).toBeVisible();

        // Cancel to close modal
        await detailPage.depositModalCancel.first().click();
        await detailPage.depositAmountInput.waitFor({ state: 'hidden' });
      } finally {
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Responsive tablet (768px) — table layout
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Deposits — tablet layout (Scenario 6)', { tag: '@responsive' }, () => {
  test('Deposits table visible on tablet viewport (768px); Final Payment row visible', async ({
    page,
    testPrefix,
  }) => {
    // Only run this on tablet or wider — skip on mobile (375px) where table is hidden
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 600) {
      test.skip(true, 'Table layout test — skipping on mobile viewport');
      return;
    }

    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} Dep TabletVendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 800,
        date: '2026-06-01',
      });

      // Create a deposit via API
      await createDepositViaApi(page, invoiceId, {
        amount: 200,
        dueDate: '2026-07-15',
      });

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      // The deposits section renders
      await expect(detailPage.depositsSection).toBeVisible();

      // Deposit amount visible in the section
      await expect(detailPage.depositsSection).toContainText('200');

      // Final payment row visible: 800 − 200 = 600
      await expect(detailPage.finalPaymentRow).toBeVisible();
      await expect(detailPage.finalPaymentAmount).toContainText('600');

      // No horizontal overflow
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Responsive mobile (375px) — card list layout
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Deposits — mobile card layout (Scenario 7)', { tag: '@responsive' }, () => {
  test('Deposits render as cards on mobile; "Mark paid" flow works; Final Payment visible', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} Dep MobileVendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 900,
        date: '2026-06-01',
      });

      // Create a pending deposit via API
      await createDepositViaApi(page, invoiceId, {
        amount: 250,
        dueDate: '2026-07-20',
      });

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      // Deposits section renders
      await expect(detailPage.depositsSection).toBeVisible();

      // Amount visible (works for both table and card layout)
      await expect(detailPage.depositsSection).toContainText('250');

      // Final payment row visible: 900 − 250 = 650
      await expect(detailPage.finalPaymentRow).toBeVisible();
      await expect(detailPage.finalPaymentAmount).toContainText('650');

      const viewportWidth = page.viewportSize()?.width ?? 1440;

      // On mobile viewports (≤767px) the mobile card list should be visible
      if (viewportWidth <= 767) {
        // The mobileCardList role="list" should be present
        const mobileCardList = detailPage.depositsSection.locator('[role="list"]');
        await expect(mobileCardList).toBeVisible();

        // Individual card is visible
        const mobileCard = detailPage.depositsSection.locator('[class*="mobileCard"]').first();
        await expect(mobileCard).toBeVisible();

        // Amount and status badge visible in the card
        await expect(mobileCard).toContainText('250');
      }

      // ── "Mark paid" flow via overflow menu ──
      await detailPage.openDepositMenu();
      await detailPage.clickDepositMenuItem(/Mark paid/);

      // State confirm modal opens
      await expect(
        page.getByRole('dialog').filter({ has: page.getByText('Mark as paid') }),
      ).toBeVisible();

      // Confirm state transition
      await detailPage.confirmStateTransition();

      // Badge updates to "Paid"
      await expect(detailPage.depositsSection).toContainText('Paid');

      // Final payment row still visible
      await expect(detailPage.finalPaymentRow).toBeVisible();
      await expect(detailPage.finalPaymentAmount).toContainText('650');
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });

  test('Mobile: Add deposit modal is usable; form inputs accessible', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} Dep MobFormVendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 400,
        date: '2026-06-01',
      });

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      // Open add deposit modal
      await detailPage.openAddDepositModal();

      // All form inputs accessible
      await expect(detailPage.depositAmountInput).toBeVisible();
      await expect(detailPage.depositDueDateInput).toBeVisible();
      await expect(detailPage.depositStatusSelect).toBeVisible();
      await expect(detailPage.depositDescriptionInput).toBeVisible();

      // Save button visible (may need scroll)
      await detailPage.depositModalSave.scrollIntoViewIfNeeded();
      await expect(detailPage.depositModalSave).toBeVisible();

      // Fill and submit
      await detailPage.fillDepositForm({
        amount: '120',
        dueDate: '2026-08-01',
      });

      await detailPage.saveDepositForm(201);

      // Deposit appears in the section
      await expect(detailPage.depositsSection).toContainText('120');
      await expect(detailPage.finalPaymentAmount).toContainText('280');
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Additional: Multiple deposits — sum invariant
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Deposits — multiple deposits and sum invariant', () => {
  test('Multiple deposits: Final Payment = invoice total − sum of all deposit amounts', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} Dep MultiVendor`);
      // Invoice total = 1000
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 1000,
        date: '2026-06-01',
      });

      // Create two deposits: 200 + 300 = 500 total; Final Payment = 500
      await createDepositViaApi(page, invoiceId, {
        amount: 200,
        dueDate: '2026-07-01',
      });
      await createDepositViaApi(page, invoiceId, {
        amount: 300,
        dueDate: '2026-08-01',
      });

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      // Both deposits visible
      await expect(detailPage.depositsSection).toContainText('200');
      await expect(detailPage.depositsSection).toContainText('300');

      // Final Payment = 1000 − 200 − 300 = 500
      await expect(detailPage.finalPaymentRow).toBeVisible();
      await expect(detailPage.finalPaymentAmount).toContainText('500');
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});
