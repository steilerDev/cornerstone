/**
 * E2E tests for the progress payment UX fixes (Issues #1423, #1424), on the Payments tab since
 * #2239
 *
 * #1424 — Progress payment add/edit dialogs must show translated "Cancel" /
 *          "Save" / "Confirm" labels.  The i18n key path was fixed from
 *          `common:buttons.*` → `common:button.*`.  These tests assert that the
 *          buttons render the expected translated text (not the raw key strings
 *          like "buttons.cancel" or "buttons.save").
 *
 * #1423 — The row ⋯ menu is portalled to document.body (RelatedList `usePortal`), so a
 *          list in a scrollable page never clips it.  We assert that after clicking the LAST
 *          row's ⋯ the menu's bounding box is fully within the viewport.
 *
 * Scenarios covered:
 *   1. Add dialog shows "Cancel" and "Save" button text (not raw keys)
 *   2. Edit dialog (pencil) shows "Cancel" and "Save" button text
 *   3. Status menu date step shows translated labels (not raw keys)
 *   4. Portal: last row ⋯ menu bounding box fully within viewport
 *
 * Refund entries (Issue #1876) — responsive + dark-mode rendering:
 *   5. Phone: the refund row shows the "Refund" badge and a minus amount on one list row
 *   6. Dark mode: refund badge and minus amount are legible
 *
 * Setup mirrors invoice-deposits.spec.ts (invoices are seeded `pending`).
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
// Scenario 1 (#1424): Add dialog — translated button labels
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Payment dialog i18n — Add buttons (#1424)', { tag: '@responsive' }, () => {
  test(
    'Add progress payment dialog footer shows "Cancel" and "Save" (not raw i18n keys)',
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
        await detailPage.openAddProgressPayment();
        await expect(detailPage.depositAmountInput).toBeVisible();

        // Before the fix the buttons rendered "buttons.cancel" / "buttons.save"
        const cancelBtn = detailPage.depositModalCancel;
        await expect(cancelBtn).toBeVisible();
        await expect(cancelBtn).toHaveText('Cancel');
        await expect(cancelBtn).not.toHaveText(/^buttons\./);

        const saveBtn = detailPage.depositModalSave;
        await saveBtn.scrollIntoViewIfNeeded();
        await expect(saveBtn).toBeVisible();
        await expect(saveBtn).toHaveText('Save');
        await expect(saveBtn).not.toHaveText(/^buttons\./);

        await cancelBtn.click();
        await detailPage.depositAmountInput.waitFor({ state: 'hidden' });
      } finally {
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2 (#1424): Edit dialog — translated button labels
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Payment dialog i18n — Edit buttons (#1424)', () => {
  test('Edit dialog footer shows "Cancel" and "Save" (not raw i18n keys)', async ({
    page,
    testPrefix,
  }) => {
    // Desktop only — i18n rendering is viewport-independent
    test.skip((page.viewportSize()?.width ?? 1440) < 1024, 'i18n label test — desktop only');

    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} i18n Edit Vendor`);
      const invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 600,
        date: '2026-06-01',
      });
      const deposit = await createDepositViaApi(page, invoiceId, {
        amount: 150,
        dueDate: '2026-07-01',
        description: `${testPrefix} i18n deposit`,
      });

      await detailPage.goto(invoiceId);
      await detailPage.openEditPayment(deposit.id);

      const cancelBtn = detailPage.depositModalCancel;
      await expect(cancelBtn).toBeVisible();
      await expect(cancelBtn).toHaveText('Cancel');
      await expect(cancelBtn).not.toHaveText(/^buttons\./);

      const saveBtn = detailPage.depositModalSave;
      await expect(saveBtn).toBeVisible();
      await expect(saveBtn).toHaveText('Save');
      await expect(saveBtn).not.toHaveText(/^buttons\./);

      await cancelBtn.click();
      await detailPage.depositAmountInput.waitFor({ state: 'hidden' });
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3 (#1424, #2209): status menu date step — translated labels
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Payment status menu i18n — date step (#1424, #2209)', () => {
  test('Mark paid date step shows translated chips and Back (not raw i18n keys)', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} i18n Confirm Vendor`);
      const invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 400,
        date: '2026-06-01',
      });
      const deposit = await createDepositViaApi(page, invoiceId, {
        amount: 100,
        dueDate: '2026-07-01',
        description: `${testPrefix} i18n confirm`,
      });

      await detailPage.goto(invoiceId);
      await detailPage.openPayments();

      // Open the status chip → "Mark paid" (leads to the date step)
      const menu = detailPage.paymentStatusMenu(deposit.id);
      await menu.pickRow('paid');

      // The date step shows translated chips (not raw keys such as "statusMenu.today")
      await expect(menu.dateToday).toHaveText('Today');
      await expect(menu.datePick).toHaveText('Pick a date');
      await expect(menu.back).toContainText('Back');
      await expect(menu.panel).not.toContainText(/statusMenu\./);

      // The old state-confirm modal no longer exists
      await expect(page.getByTestId('state-confirm-button')).toHaveCount(0);

      // Back returns to the list without changing the status
      await menu.back.click();
      await expect(menu.option('paid')).toBeVisible();
      await page.keyboard.press('Escape');
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4 (#1423): Portal — last row menu not clipped by the container
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Payment row menu portal — not clipped (#1423)', () => {
  test('Clicking ⋯ on the LAST progress payment row shows a menu fully within the viewport', async ({
    page,
    testPrefix,
  }) => {
    test.skip((page.viewportSize()?.width ?? 1440) < 1024, 'Portal clipping test — desktop only');

    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} Portal Vendor`);
      const invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 2000,
        date: '2026-06-01',
      });

      // Four payments so the list has several rows; the final-payment row closes it
      const ids: string[] = [];
      const descriptions = ['First', 'Second', 'Third', 'Last'];
      for (let i = 0; i < descriptions.length; i++) {
        const deposit = await createDepositViaApi(page, invoiceId, {
          amount: 100,
          dueDate: `2026-${String(i + 7).padStart(2, '0')}-01`,
          description: `${testPrefix} ${descriptions[i]} payment`,
        });
        ids.push(deposit.id);
      }

      await detailPage.goto(invoiceId);
      await detailPage.openPayments();
      await expect(detailPage.progressPayments.rowWith('First')).toBeVisible();
      await expect(detailPage.progressPayments.rowWith('Last')).toBeVisible();

      await detailPage.progressPayments.actionsTrigger(ids[ids.length - 1]!).click();

      // Wait for the portal-rendered menu
      const menu = page.getByRole('menu').filter({ visible: true }).last();
      await expect(menu).toBeVisible();

      const menuBox = await menu.boundingBox();
      expect(menuBox, 'Menu bounding box must be non-null').not.toBeNull();
      const viewportSize = page.viewportSize();
      expect(viewportSize, 'Viewport size must be non-null').not.toBeNull();
      const { width: vw, height: vh } = viewportSize!;

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

      await page.keyboard.press('Escape');
      await expect(menu).not.toBeVisible();
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5 (#1876): Phone — the refund row on one list row
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Refund entry — phone layout (Scenario 5, #1876)', { tag: '@responsive' }, () => {
  test('Phone: the refund row shows the "Refund" badge and a minus amount, inside the viewport', async ({
    page,
    testPrefix,
  }) => {
    // There is one list surface on every viewport; this checks the phone width specifically
    test.skip((page.viewportSize()?.width ?? 1440) > 767, 'Refund row layout — phone only');

    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} Refund Mobile Vendor`);
      const invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 800,
        date: '2026-06-01',
      });
      const refund = await createDepositViaApi(page, invoiceId, {
        entryType: 'refund',
        amount: 150,
        dueDate: '2026-07-20',
        description: `${testPrefix} mobile refund`,
      });

      await detailPage.goto(invoiceId);
      await detailPage.openPayments();

      const row = detailPage.refunds.row(refund.id);
      await expect(row).toBeVisible();
      await expect(row).toContainText('Refund');
      await expect(row).toContainText(/[-\u2212]\s?€?\s?150\.00/);

      // The row stays inside the viewport width (no horizontal overflow)
      const box = await row.boundingBox();
      const width = page.viewportSize()?.width ?? 0;
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6 (#1876): Dark mode — refund badge and minus amount are legible
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Refund entry — dark mode (Scenario 6, #1876)', () => {
  test('Dark mode: refund row renders visibly', async ({ browser, page: p }) => {
    const vendorName = `DM-Refund-${Date.now()} Vendor`;
    let vendorId = '';

    try {
      vendorId = await createVendorViaApi(p, vendorName);
      const invoiceId = await createInvoiceViaApi(p, vendorId, {
        amount: 600,
        date: '2026-06-01',
      });
      const refund = await createDepositViaApi(p, invoiceId, {
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
        await detailPage.openPayments();

        const row = detailPage.refunds.row(refund.id);
        await expect(row).toBeVisible();
        await expect(row).toContainText('Refund');
        await expect(row).toContainText(/[-\u2212]\s?€?\s?120\.00/);
      } finally {
        await context.close();
      }
    } finally {
      if (vendorId) await deleteVendorViaApi(p, vendorId);
    }
  });
});
