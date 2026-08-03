/**
 * E2E tests for Invoice Deposit UX fixes (Issues #1423, #1424)
 *
 * #1424 — Deposit add/edit/state-confirm modals must show translated "Cancel" /
 *          "Save" / "Confirm" labels.  The i18n key path was fixed from
 *          `common:buttons.*` → `common:button.*`.  These tests assert that the
 *          buttons render the expected translated text (not the raw key strings
 *          like "buttons.cancel" or "buttons.save").
 *
 * #1423 — Deposit OverflowMenu uses usePortal=true so the menu is rendered via
 *          createPortal() to document.body.  On pages with a scrollable deposit
 *          list the menu must not be clipped by the container.  We assert that
 *          after clicking the LAST deposit row's kebab the menu's bounding box
 *          is fully within the viewport (top, right, bottom, left all within
 *          viewport dimensions).
 *
 * Scenarios covered:
 *   1. Add deposit modal shows "Cancel" and "Save" button text (not raw keys)
 *   2. Edit deposit modal shows "Cancel" and "Save" button text
 *   3. State confirm modal shows "Confirm" button text (not raw key)
 *   4. Portal: last deposit row kebab menu bounding box fully within viewport
 *
 * Refund entries (Issue #1876) — responsive + dark-mode rendering:
 *   5. Mobile: refund card shows red "Refund" badge and negative amount in cardAmount
 *   6. Dark mode: refund badge and negative amount are legible
 *
 * Setup mirrors invoice-deposits.spec.ts.
 */

import { test, expect } from '../../fixtures/auth.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import { API } from '../../fixtures/testData.js';
import type { Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// API helpers (mirrors invoice-deposits.spec.ts)
// ─────────────────────────────────────────────────────────────────────────────

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
  data: { amount: number; date: string; status?: string },
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
    description?: string;
    entryType?: 'deposit' | 'refund';
  },
): Promise<{ id: string }> {
  const response = await page.request.post(`/api/invoices/${invoiceId}/deposits`, {
    data: { status: 'pending', ...data },
  });
  expect(response.ok(), `POST deposit failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { deposit: { id: string } };
  return body.deposit;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 (#1424): Add deposit modal — translated button labels
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Deposit modal i18n — Add deposit buttons (#1424)', { tag: '@responsive' }, () => {
  test(
    'Add deposit modal footer shows "Cancel" and "Save" (not raw i18n keys)',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const detailPage = new InvoiceDetailPage(page);
      let vendorId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} i18n Add Vendor`);
        const invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 500,
          date: '2026-06-01',
        });

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // Open the Add deposit modal via the section header button
        await detailPage.openAddDepositModal();
        await expect(detailPage.depositAmountInput).toBeVisible();

        // The modal footer must show translated button labels.
        // Before the fix, the buttons rendered "buttons.cancel" / "buttons.save".
        // After the fix, they render "Cancel" / "Save".

        // Cancel button: data-testid="deposit-modal-cancel" with text "Cancel"
        const cancelBtn = page.getByTestId('deposit-modal-cancel');
        await expect(cancelBtn).toBeVisible();
        await expect(cancelBtn).toHaveText('Cancel');
        // Assert the raw key text is NOT rendered
        await expect(cancelBtn).not.toHaveText('buttons.cancel');
        await expect(cancelBtn).not.toHaveText(/^buttons\./);

        // Save button: data-testid="deposit-modal-save" with text "Save"
        const saveBtn = page.getByTestId('deposit-modal-save');
        await saveBtn.scrollIntoViewIfNeeded();
        await expect(saveBtn).toBeVisible();
        await expect(saveBtn).toHaveText('Save');
        await expect(saveBtn).not.toHaveText('buttons.save');
        await expect(saveBtn).not.toHaveText(/^buttons\./);

        // Close modal without saving
        await cancelBtn.click();
        await detailPage.depositAmountInput.waitFor({ state: 'hidden' });
      } finally {
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2 (#1424): Edit deposit modal — translated button labels
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Deposit modal i18n — Edit deposit buttons (#1424)', () => {
  test('Edit deposit modal footer shows "Cancel" and "Save" (not raw i18n keys)', async ({
    page,
    testPrefix,
  }) => {
    // Desktop only — i18n rendering is viewport-independent
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 1024) {
      test.skip(true, 'i18n label test — desktop only');
      return;
    }

    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} i18n Edit Vendor`);
      const invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 600,
        date: '2026-06-01',
      });

      // Create a deposit so we can edit it
      await createDepositViaApi(page, invoiceId, {
        amount: 150,
        dueDate: '2026-07-01',
        description: `${testPrefix} i18n deposit`,
      });

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      // Open overflow menu → Edit
      await detailPage.openDepositMenu();
      await detailPage.clickDepositMenuItem(/Edit/);

      // Edit modal opens
      await expect(detailPage.depositAmountInput).toBeVisible();

      // Cancel and Save buttons must show translated text
      const cancelBtn = page.getByTestId('deposit-modal-cancel');
      await expect(cancelBtn).toBeVisible();
      await expect(cancelBtn).toHaveText('Cancel');
      await expect(cancelBtn).not.toHaveText(/^buttons\./);

      const saveBtn = page.getByTestId('deposit-modal-save');
      await expect(saveBtn).toBeVisible();
      await expect(saveBtn).toHaveText('Save');
      await expect(saveBtn).not.toHaveText(/^buttons\./);

      // Close
      await cancelBtn.click();
      await detailPage.depositAmountInput.waitFor({ state: 'hidden' });
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3 (#1424): State confirm modal — translated "Confirm" button
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Deposit modal i18n — State confirm button (#1424)', () => {
  test('Mark-paid state confirm modal shows "Confirm" button (not raw i18n key)', async ({
    page,
    testPrefix,
  }) => {
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 1024) {
      test.skip(true, 'i18n label test — desktop only');
      return;
    }

    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} i18n Confirm Vendor`);
      const invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 400,
        date: '2026-06-01',
      });

      await createDepositViaApi(page, invoiceId, {
        amount: 100,
        dueDate: '2026-07-01',
        description: `${testPrefix} i18n confirm`,
      });

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      // Open overflow menu → "Mark paid…"
      await detailPage.openDepositMenu();
      await detailPage.clickDepositMenuItem(/Mark paid/);

      // State confirm modal appears
      await expect(
        page.getByRole('dialog').filter({ has: page.getByText('Mark as paid') }),
      ).toBeVisible();

      // The Confirm button must show "Confirm", not "buttons.confirm"
      const confirmBtn = page.getByTestId('state-confirm-button');
      await expect(confirmBtn).toBeVisible();
      await expect(confirmBtn).toHaveText('Confirm');
      await expect(confirmBtn).not.toHaveText(/^buttons\./);

      // The Cancel button in the state confirm modal should also be translated
      const stateConfirmCancelBtn = page.getByTestId('state-confirm-cancel');
      await expect(stateConfirmCancelBtn).toBeVisible();
      await expect(stateConfirmCancelBtn).toHaveText('Cancel');
      await expect(stateConfirmCancelBtn).not.toHaveText(/^buttons\./);

      // Cancel out of the state confirm
      await stateConfirmCancelBtn.click();
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4 (#1423): Portal — last deposit row menu not clipped by container
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Deposit OverflowMenu portal — not clipped (#1423)', () => {
  test('Clicking the kebab on the LAST deposit row shows a menu fully within the viewport', async ({
    page,
    testPrefix,
  }) => {
    // Desktop only — viewport clipping is most obvious on desktop where the
    // deposits section is taller (table layout).
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 1024) {
      test.skip(true, 'Portal clipping test — desktop only');
      return;
    }

    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} Portal Vendor`);
      const invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 2000,
        date: '2026-06-01',
      });

      // Create 4 deposits so the section has multiple rows
      const descriptions = ['First', 'Second', 'Third', 'Last'];
      for (let i = 0; i < descriptions.length; i++) {
        await createDepositViaApi(page, invoiceId, {
          amount: 100,
          dueDate: `2026-${String(i + 7).padStart(2, '0')}-01`,
          description: `${testPrefix} ${descriptions[i]} deposit`,
        });
      }

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      // All deposits visible
      await expect(detailPage.depositsSection).toContainText('First');
      await expect(detailPage.depositsSection).toContainText('Last');

      // Click the LAST deposit row's overflow menu trigger.
      // On desktop the table layout renders rows sequentially; the LAST row's
      // trigger is the last visible button[aria-haspopup="true"] in the section.
      const triggers = detailPage.depositsSection
        .locator('button[aria-haspopup="true"]')
        .filter({ visible: true });

      const count = await triggers.count();
      expect(count).toBeGreaterThan(0);

      // Click the LAST trigger
      await triggers.nth(count - 1).click();

      // Wait for the portal-rendered menu
      const menu = page.locator('[role="menu"]').filter({ visible: true }).first();
      await expect(menu).toBeVisible();

      // Assert the menu's bounding box is fully within the viewport
      const menuBox = await menu.boundingBox();
      expect(menuBox, 'Menu bounding box must be non-null').not.toBeNull();

      const viewportSize = page.viewportSize();
      expect(viewportSize, 'Viewport size must be non-null').not.toBeNull();

      const { width: vw, height: vh } = viewportSize!;

      // Menu must be fully within the viewport on all sides
      expect(menuBox!.x, 'Menu left edge must be >= 0').toBeGreaterThanOrEqual(0);
      expect(menuBox!.y, 'Menu top edge must be >= 0').toBeGreaterThanOrEqual(0);
      expect(
        menuBox!.x + menuBox!.width,
        'Menu right edge must be within viewport width',
      ).toBeLessThanOrEqual(vw);
      expect(
        menuBox!.y + menuBox!.height,
        'Menu bottom edge must be within viewport height',
      ).toBeLessThanOrEqual(vh);

      // Dismiss menu by pressing Escape
      await page.keyboard.press('Escape');
      await expect(menu).not.toBeVisible();
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5 (#1876): Mobile — refund card shows the "Refund" badge and negative
// amount inside cardAmount
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Refund entry — mobile card layout (Scenario 5, #1876)',
  { tag: '@responsive' },
  () => {
    test('Mobile: refund card shows red "Refund" badge and negative amount in cardAmount', async ({
      page,
      testPrefix,
    }) => {
      // Mobile-only: the desktop/tablet table-row equivalent is covered by
      // invoice-deposits.spec.ts Scenario 9. This test asserts the mobile CARD markup
      // specifically ([class*="cardAmount"], [class*="mobileCard"]).
      const viewportWidth = page.viewportSize()?.width ?? 1440;
      if (viewportWidth > 767) {
        test.skip(true, 'Refund card layout — mobile viewport only');
        return;
      }

      const detailPage = new InvoiceDetailPage(page);
      let vendorId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} Refund Mobile Vendor`);
        const invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 800,
          date: '2026-06-01',
        });

        await createDepositViaApi(page, invoiceId, {
          entryType: 'refund',
          amount: 150,
          dueDate: '2026-07-20',
          description: `${testPrefix} mobile refund`,
        });

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // Mobile card is visible
        const mobileCard = detailPage.depositsSection.locator('[class*="mobileCard"]').first();
        await expect(mobileCard).toBeVisible();

        // Refund badge + negative amount are both inside the card's cardAmount block
        const cardAmount = mobileCard.locator('[class*="cardAmount"]');
        await expect(cardAmount).toBeVisible();
        await expect(cardAmount).toContainText('Refund');
        await expect(cardAmount.locator('[class*="amountNegative"]')).toContainText('150');
        const negativeText =
          (await cardAmount.locator('[class*="amountNegative"]').textContent()) ?? '';
        expect(negativeText.trim().startsWith('-')).toBe(true);
      } finally {
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6 (#1876): Dark mode — refund badge and negative amount are legible
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Refund entry — dark mode (Scenario 6, #1876)', () => {
  test('Dark mode: refund badge and negative amount render visibly', async ({
    browser,
    page: p,
  }) => {
    const vendorName = `DM-Refund-${Date.now()} Vendor`;
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(p, vendorName);
      const invoiceId = await createInvoiceViaApi(p, vendorId, {
        amount: 600,
        date: '2026-06-01',
      });

      await createDepositViaApi(p, invoiceId, {
        entryType: 'refund',
        amount: 120,
        dueDate: '2026-07-01',
      });

      const context = await browser.newContext({
        colorScheme: 'dark',
        storageState: 'test-results/.auth/admin.json',
      });
      const darkPage = await context.newPage();
      const detailPage = new InvoiceDetailPage(darkPage);

      try {
        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        await expect(detailPage.refundBadge.first()).toBeVisible();
        await expect(detailPage.refundBadge.first()).toContainText('Refund');
        await expect(detailPage.refundAmountNegative.first()).toBeVisible();
        await expect(detailPage.refundAmountNegative.first()).toContainText('120');
      } finally {
        await context.close();
      }
    } finally {
      if (vendorId) await deleteVendorViaApi(p, vendorId);
    }
  });
});
