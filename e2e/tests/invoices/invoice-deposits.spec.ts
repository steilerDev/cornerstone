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
 * Refund entries (Issue #1876) — deposits carry an `entryType`: 'deposit' | 'refund'.
 * Refunds are entered as a POSITIVE amount but rendered/aggregated as negative:
 *   9.  Add refund, mark paid → red "Refund" badge + negative amount; final payment amount drops
 *   10. Refund exceeding available headroom → REFUND_EXCEEDS_INVOICE inline error, modal stays open
 *   11. Edit refund → entry-type radios disabled (immutable); amount edit saves, type unchanged
 *   12. Status lifecycle on a refund reuses the identical menu items/status badges as a deposit
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
      let invoiceId: string;

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
      let invoiceId: string;

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
        // Filter to visible elements only: on mobile (≤767px) tableRow elements are
        // hidden via CSS (display:none) while mobileCard elements are shown. Without the
        // filter, .first() returns the first DOM-order match — a hidden tableRow — and
        // toBeVisible() fails on mobile viewports.
        const depositRows = detailPage.depositsSection
          .locator('[class*="tableRow"], [class*="mobileCard"]')
          .filter({ visible: true });
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
    let invoiceId: string;

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
  test('Add → mark paid → mark claimed → revert to paid → edit amount → delete pending deposit', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId: string;

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
      await expect(
        page.getByRole('dialog').filter({ has: page.getByText('Mark as paid') }),
      ).toBeVisible();

      // Confirm (date is pre-filled with today)
      await detailPage.confirmStateTransition();

      // Badge now shows "Paid" — the deposit row's badge class changes to statusPaid
      // We verify by checking the status badge text via the badge component's visible text.
      // The section should contain "Paid" text after the re-render.
      await expect(detailPage.depositsSection).toContainText('Paid');

      // ── Step 3: Mark claimed (overflow menu → "Mark claimed…") ──
      await detailPage.openDepositMenu();
      await detailPage.clickDepositMenuItem(/Mark claimed/);

      await expect(
        page.getByRole('dialog').filter({ has: page.getByText('Mark as claimed') }),
      ).toBeVisible();

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

      // Badge reverts to "Paid".
      // Note: we do NOT assert not.toContainText('Claimed') here because the table
      // always renders a "Claimed date" column header that contains the text "Claimed".
      // The containText('Paid') assertion above is sufficient to confirm the badge state.
      await expect(detailPage.depositsSection).toContainText('Paid');

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
      await expect(
        page.getByRole('dialog').filter({ has: page.getByText('Delete deposit') }),
      ).toBeVisible();
      await expect(detailPage.deleteDepositWarning).not.toBeVisible();

      await detailPage.confirmDepositDelete();

      // Deposit removed — back to empty state
      await expect(detailPage.depositsSection).toContainText('No deposits yet');
      await expect(detailPage.finalPaymentRow).not.toBeVisible();
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Delete paid deposit — warning banner visible
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Deposits — delete paid deposit warning (Scenario 4)', () => {
  test('Delete modal for a paid deposit shows warning banner; cancel keeps deposit; confirm removes it', async ({
    page,
    testPrefix,
  }) => {
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
      await expect(
        page.getByRole('dialog').filter({ has: page.getByText('Delete deposit') }),
      ).toBeVisible();

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
  });

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
      await expect(
        page.getByRole('dialog').filter({ has: page.getByText('Delete deposit') }),
      ).toBeVisible();

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
  test('Adding a deposit whose amount exceeds available headroom shows DEPOSITS_EXCEED_INVOICE_TOTAL error with available amount', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId: string;

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
  });
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
    let invoiceId: string;

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
    let invoiceId: string;

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
    let invoiceId: string;

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
    let invoiceId: string;

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

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Revert to pending fails — section-level error banner shown
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Deposits — revert-to-pending API error (Scenario 8)', () => {
  test('Revert to pending fails with INVALID_DEPOSIT_STATUS_TRANSITION → section-level error banner is shown', async ({
    page,
    testPrefix,
  }) => {
    // Desktop-only: error banner is a single behaviour, viewport-independent.
    // Skip on narrow viewports where this test would duplicate coverage unnecessarily.
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 1024) {
      test.skip(true, 'Error banner test — desktop viewport only');
      return;
    }

    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId: string;

    // The page.route() interceptor handle — kept so we can unroute in teardown.
    const routePattern = '**/api/invoices/*/deposits/*';

    try {
      // ── Setup ────────────────────────────────────────────────────────────
      vendorId = await createVendorViaApi(page, `${testPrefix} Dep RevertErrVendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 500,
        date: '2026-06-01',
      });

      // Create a pending deposit, then transition it to 'paid' via the API.
      const today = new Date().toISOString().slice(0, 10);
      const deposit = await createDepositViaApi(page, invoiceId, {
        amount: 200,
        dueDate: '2026-07-01',
      });

      // pending → paid (real API call, before we install the mock)
      const paidResp = await page.request.patch(
        `/api/invoices/${invoiceId}/deposits/${deposit.id}`,
        { data: { status: 'paid', paidDate: today } },
      );
      expect(paidResp.ok(), `PATCH pending→paid failed: ${paidResp.status()}`).toBeTruthy();

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      // Confirm the deposit is showing as Paid before installing the mock.
      await expect(detailPage.depositsSection).toContainText('Paid');

      // ── Mock ─────────────────────────────────────────────────────────────
      // Intercept the next PATCH to /api/invoices/*/deposits/* and return a 400
      // INVALID_DEPOSIT_STATUS_TRANSITION error.  We use page.route() (not
      // page.routeOnce()) so we can call page.unroute() explicitly in teardown.
      await page.route(routePattern, async (route) => {
        if (route.request().method() === 'PATCH') {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              error: {
                code: 'INVALID_DEPOSIT_STATUS_TRANSITION',
                message: 'Cannot revert',
              },
            }),
          });
        } else {
          // Pass non-PATCH requests through unchanged (e.g. GET for page reload).
          await route.continue();
        }
      });

      // ── Action ───────────────────────────────────────────────────────────
      // Open overflow menu for the paid deposit and click "Revert to pending".
      // The menu for a 'paid' deposit contains: "Mark claimed…", "Revert to pending",
      // "Edit", "Delete" — no confirm dialog for "Revert to pending".
      await detailPage.openDepositMenu();
      await detailPage.clickDepositMenuItem(/Revert to pending/);

      // ── Assert ───────────────────────────────────────────────────────────
      // The section-level error banner should appear after the mocked 400 response.
      // The InvoiceDepositsSection renders API errors in a role="alert" element
      // outside the add/edit modal context.
      await expect(page.getByRole('alert')).toBeVisible();
    } finally {
      // ── Teardown ─────────────────────────────────────────────────────────
      // Remove the route interceptor so subsequent tests are unaffected.
      await page.unroute(routePattern);

      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9 (#1876): Refund happy path — add, mark paid, badge + negative amount,
// final payment amount drops by the refund amount
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Refund entries — add and mark paid (Scenario 9, #1876)',
  { tag: '@responsive' },
  () => {
    test(
      'Add refund → red "Refund" badge and negative amount; mark paid → final payment amount drops',
      { tag: '@smoke' },
      async ({ page, testPrefix }) => {
        const detailPage = new InvoiceDetailPage(page);
        let vendorId = '';
        let invoiceId: string;

        try {
          vendorId = await createVendorViaApi(page, `${testPrefix} Refund AddVendor`);
          // Invoice total = 2000
          invoiceId = await createInvoiceViaApi(page, vendorId, {
            amount: 2000,
            date: '2026-06-01',
          });

          await detailPage.goto(invoiceId);
          await expect(detailPage.heading).toBeVisible();

          // Add a refund of 500 via the UI
          await detailPage.openAddDepositModal();
          await detailPage.fillDepositForm({
            entryType: 'refund',
            amount: '500',
            dueDate: '2026-07-01',
          });
          await detailPage.saveDepositForm(201);

          // Refund badge visible with "Refund" label, negative formatted amount
          await expect(detailPage.refundBadge.first()).toBeVisible();
          await expect(detailPage.refundBadge.first()).toContainText('Refund');
          await expect(detailPage.refundAmountNegative.first()).toBeVisible();
          await expect(detailPage.refundAmountNegative.first()).toContainText('500');
          const negativeText = (await detailPage.refundAmountNegative.first().textContent()) ?? '';
          expect(negativeText.trim().startsWith('-')).toBe(true);

          // A pending refund has not yet returned money — final payment amount unchanged (2000)
          await expect(detailPage.finalPaymentRow).toBeVisible();
          await expect(detailPage.finalPaymentAmount).toContainText('2,000');

          // Mark the refund paid — now it reduces the final payment amount
          await detailPage.openDepositMenu();
          await detailPage.clickDepositMenuItem(/Mark paid/);
          await expect(
            page.getByRole('dialog').filter({ has: page.getByText('Mark as paid') }),
          ).toBeVisible();
          await detailPage.confirmStateTransition();

          // Status badge updates to Paid; entry-type badge + negative amount persist
          await expect(detailPage.depositsSection).toContainText('Paid');
          await expect(detailPage.refundBadge.first()).toBeVisible();
          await expect(detailPage.refundAmountNegative.first()).toContainText('500');

          // Final payment = 2000 − 500 (received refund) = 1500
          await expect(detailPage.finalPaymentAmount).toContainText('1,500');
        } finally {
          if (vendorId) await deleteVendorViaApi(page, vendorId);
        }
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10 (#1876): REFUND_EXCEEDS_INVOICE — inline headroom error, modal stays
// open, no row created
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Refund entries — exceed invoice total error (Scenario 10, #1876)', () => {
  test('Adding a refund whose amount exceeds available refund headroom shows REFUND_EXCEEDS_INVOICE with available amount', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId: string;

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} Refund ExceedVendor`);
      // Invoice total = 100
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 100,
        date: '2026-06-01',
      });

      // First refund of 70 (succeeds, refund headroom = 30 remaining). The refund sum
      // invariant is independent of the deposit sum invariant and counts ANY status.
      await createDepositViaApi(page, invoiceId, {
        entryType: 'refund',
        amount: 70,
        dueDate: '2026-07-01',
      });

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      await expect(detailPage.refundBadge.first()).toBeVisible();
      await expect(detailPage.refundAmountNegative.first()).toContainText('70');

      // Count of visible refund rows/cards before the failed attempt — used below to
      // confirm no second row was created.
      const refundBadgeCountBefore = await detailPage.refundBadge.filter({ visible: true }).count();

      // Try to add a second refund of 50 (exceeds remaining 30 headroom)
      await detailPage.openAddDepositModal();
      await detailPage.fillDepositForm({
        entryType: 'refund',
        amount: '50',
        dueDate: '2026-08-01',
      });

      const errorResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/deposits') &&
          resp.request().method() === 'POST' &&
          resp.status() === 400,
      );
      await detailPage.depositModalSave.click();
      await errorResponsePromise;

      // REFUND_EXCEEDS_INVOICE error banner renders with the available headroom (30)
      await expect(detailPage.depositModalError).toBeVisible();
      await expect(detailPage.depositModalError).toContainText('30');

      // Modal stays open — user can correct the amount
      await expect(detailPage.depositAmountInput).toBeVisible();

      // Cancel to close modal
      await detailPage.depositModalCancel.first().click();
      await detailPage.depositAmountInput.waitFor({ state: 'hidden' });

      // No second refund row was created — count is unchanged from before the attempt
      const refundBadgeCountAfter = await detailPage.refundBadge.filter({ visible: true }).count();
      expect(refundBadgeCountAfter).toBe(refundBadgeCountBefore);
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 11 (#1876): Edit refund — entry-type radios disabled (immutable);
// amount edit saves, type unchanged
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Refund entries — edit is entry-type-locked (Scenario 11, #1876)', () => {
  test('Editing a refund shows both entry-type radios disabled with "Refund" checked; amount edit saves and type stays "Refund"', async ({
    page,
    testPrefix,
  }) => {
    // Desktop only — the disabled-radio assertion is viewport-independent; avoid
    // triplicating this check across three viewport projects.
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 1024) {
      test.skip(true, 'Entry-type immutability test — desktop viewport only');
      return;
    }

    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId: string;

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} Refund EditVendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 1000,
        date: '2026-06-01',
      });

      await createDepositViaApi(page, invoiceId, {
        entryType: 'refund',
        amount: 200,
        dueDate: '2026-07-01',
        description: `${testPrefix} refund to edit`,
      });

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();
      await expect(detailPage.refundBadge.first()).toBeVisible();

      // Open Edit
      await detailPage.openDepositMenu();
      await detailPage.clickDepositMenuItem(/Edit/);
      await expect(detailPage.depositAmountInput).toBeVisible();

      // Both radios visible, "Refund" checked, BOTH disabled (immutable after creation)
      await expect(detailPage.depositEntryTypeRefundRadio).toBeChecked();
      await expect(detailPage.depositEntryTypeRefundRadio).toBeDisabled();
      await expect(detailPage.depositEntryTypeDepositRadio).toBeDisabled();

      // Edit the amount — entryType is NOT part of the PATCH payload
      await detailPage.depositAmountInput.clear();
      await detailPage.depositAmountInput.fill('250');
      await detailPage.saveDepositForm(200);

      // Type unchanged — still shows the refund badge and negative amount
      await expect(detailPage.refundBadge.first()).toBeVisible();
      await expect(detailPage.refundAmountNegative.first()).toContainText('250');
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 12 (#1876): Status lifecycle on a refund reuses the identical menu
// items and status-badge labels as a regular deposit
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Refund entries — status lifecycle reuses deposit menu/badges (Scenario 12, #1876)', () => {
  test('Refund: pending → paid → claimed → revert to paid uses the same menu items and status badges as a deposit', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId: string;

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} Refund LifecycleVendor`);
      // Invoice total = 1000
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 1000,
        date: '2026-06-01',
      });

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      // ── Add a refund (amount=100, pending) ──
      await detailPage.openAddDepositModal();
      await detailPage.fillDepositForm({
        entryType: 'refund',
        amount: '100',
        dueDate: '2026-07-01',
      });
      await detailPage.saveDepositForm(201);

      await expect(detailPage.depositsSection).toContainText('Pending');
      await expect(detailPage.refundBadge.first()).toBeVisible();
      // Pending refund does not yet reduce the final payment amount
      await expect(detailPage.finalPaymentAmount).toContainText('1,000');

      // ── Mark paid — same menu item text as a regular deposit ("Mark paid…") ──
      await detailPage.openDepositMenu();
      await detailPage.clickDepositMenuItem(/Mark paid/);
      await expect(
        page.getByRole('dialog').filter({ has: page.getByText('Mark as paid') }),
      ).toBeVisible();
      await detailPage.confirmStateTransition();

      await expect(detailPage.depositsSection).toContainText('Paid');
      await expect(detailPage.refundBadge.first()).toBeVisible();
      await expect(detailPage.finalPaymentAmount).toContainText('900');

      // ── Mark claimed — same menu item text as a regular deposit ("Mark claimed…") ──
      await detailPage.openDepositMenu();
      await detailPage.clickDepositMenuItem(/Mark claimed/);
      await expect(
        page.getByRole('dialog').filter({ has: page.getByText('Mark as claimed') }),
      ).toBeVisible();
      await detailPage.confirmStateTransition();

      await expect(detailPage.depositsSection).toContainText('Claimed');
      await expect(detailPage.refundBadge.first()).toBeVisible();
      // Claimed refunds still count as "received" in the final payment formula
      await expect(detailPage.finalPaymentAmount).toContainText('900');

      // ── Revert to paid — same menu item text as a regular deposit ("Revert to paid") ──
      await detailPage.openDepositMenu();
      const revertResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/deposits/') &&
          resp.request().method() === 'PATCH' &&
          resp.status() === 200,
      );
      await detailPage.clickDepositMenuItem(/Revert to paid/);
      await revertResponsePromise;

      await expect(detailPage.depositsSection).toContainText('Paid');
      await expect(detailPage.refundBadge.first()).toBeVisible();
      await expect(detailPage.refundAmountNegative.first()).toContainText('100');
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});
