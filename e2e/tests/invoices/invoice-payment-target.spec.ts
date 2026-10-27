/**
 * E2E: the progress-payment event and its `?payment=<depositId>` link (#2223, EPIC-21 P2.4).
 *
 * 1. Paying a progress payment writes one event ("Progress payment of ... for invoice ..."); its
 *    "Open progress payment" link goes to `/budget/invoices/<id>?payment=<depositId>`, the page
 *    selects the Payments tab (a link with only `?payment=` carries no `?tab=`), scrolls to,
 *    focuses and highlights the payment's row link, then removes the parameter (#2239).
 * 2. A payment that no longer exists shows the info toast "That progress payment no longer
 *    exists." and the invoice still renders.
 * 3. An unknown payment id gives the same toast.
 *
 * Synthetic data only; the vendor (and with it the invoice) is created and removed per test.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { createVendorViaApi, deleteVendorViaApi } from '../../fixtures/apiHelpers.js';
import { API } from '../../fixtures/testData.js';
import { HistoryPage } from '../../pages/HistoryPage.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';

interface Seeded {
  vendorId: string;
  invoiceId: string;
  invoiceNumber: string;
  depositId: string;
}

async function seedPaidPayment(page: Page, testPrefix: string): Promise<Seeded> {
  const vendorId = await createVendorViaApi(page, { name: `${testPrefix} Payment Vendor` });
  const invoiceNumber = `${testPrefix}-INV-PT`;
  const invoiceResponse = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
    data: { invoiceNumber, amount: 5000, date: '2026-03-01', status: 'pending' },
  });
  expect(invoiceResponse.ok(), `POST invoice: ${invoiceResponse.status()}`).toBeTruthy();
  const invoiceId = ((await invoiceResponse.json()) as { invoice: { id: string } }).invoice.id;

  const depositResponse = await page.request.post(`/api/invoices/${invoiceId}/deposits`, {
    data: { amount: 1250, dueDate: '2026-03-10', status: 'pending' },
  });
  expect(depositResponse.ok(), `POST deposit: ${depositResponse.status()}`).toBeTruthy();
  const depositId = ((await depositResponse.json()) as { deposit: { id: string } }).deposit.id;

  const paid = await page.request.patch(`/api/invoices/${invoiceId}/deposits/${depositId}`, {
    data: { status: 'paid', paidDate: '2026-03-11' },
  });
  expect(paid.ok(), `PATCH deposit paid: ${paid.status()}`).toBeTruthy();
  return { vendorId, invoiceId, invoiceNumber, depositId };
}

async function cleanup(page: Page, seeded: Seeded | null): Promise<void> {
  if (!seeded) return;
  await page.request.delete(`${API.vendors}/${seeded.vendorId}/invoices/${seeded.invoiceId}`);
  await deleteVendorViaApi(page, seeded.vendorId);
}

interface ApiEvent {
  id: string;
  sourceEntityId: string | null;
  metadata: { depositId?: string };
}

test.describe('Progress payment event and link (#2223)', { tag: '@responsive' }, () => {
  test('1. the payment event links to the payment row, which is focused and highlighted', async ({
    page,
    testPrefix,
  }) => {
    let seeded: Seeded | null = null;
    try {
      seeded = await seedPaidPayment(page, testPrefix);
      const { invoiceId, invoiceNumber, depositId } = seeded;

      // The event, from the API: one row, with the payment named in its metadata.
      const response = await page.request.get(
        `${API.diaryEntries}?type=invoice_status&pageSize=50`,
      );
      expect(response.ok()).toBeTruthy();
      const items = ((await response.json()) as { items: ApiEvent[] }).items;
      const events = items.filter((item) => item.sourceEntityId === invoiceId);
      expect(events).toHaveLength(1);
      const [event] = events as [ApiEvent];
      expect(event.metadata).toMatchObject({
        v: 1,
        event: 'status_changed',
        to: 'paid',
        depositId,
      });

      // History, Payment filter: the sentence and the link row. The invoice number (it carries
      // the unique test prefix) isolates this invoice's rows in the shared database.
      const diary = new HistoryPage(page);
      await diary.goto({ type: 'payment', q: invoiceNumber });
      const row = diary.systemEventRow(event.id);
      await expect(row).toBeVisible();
      await expect(row).toContainText(
        new RegExp(
          `Progress payment of .*1,250\\.00.* for invoice ${invoiceNumber} went from To pay to Paid`,
        ),
      );
      await expect(page.getByTestId(`system-event-${event.id}-type`)).toHaveText('Invoice status');
      const link = diary.systemEventLink(event.id);
      await expect(link).toHaveText(/Open progress payment/);
      await expect(link).toHaveAccessibleName(
        new RegExp(`^Open progress payment of .*1,250\\.00.* for invoice ${invoiceNumber}, `),
      );
      await expect(link).toHaveAttribute(
        'href',
        routeUrl('invoice', { id: invoiceId }, { payment: depositId }),
      );

      // The page scrolls to, focuses and highlights the visible row, then drops the parameter.
      await link.click();
      await page.waitForURL(
        (url) =>
          url.pathname === routeUrl('invoice', { id: invoiceId }) &&
          !url.search.includes('payment='),
      );
      const detail = new InvoiceDetailPage(page);
      await expect(detail.tabs.tab('payments')).toHaveAttribute('aria-selected', 'true');
      const target = detail.progressPayments.link(depositId);
      await expect(target).toBeVisible();
      await expect(target).toBeFocused();
      await expect(target).toHaveClass(/paymentTarget/);
      await expect(detail.toasts.infoToast.filter({ hasText: 'no longer exists' })).toHaveCount(0);
      // The tab survives the parameter's removal
      expect(new URL(page.url()).searchParams.get('tab')).toBe('payments');
    } finally {
      await cleanup(page, seeded);
    }
  });

  test('2. a payment that no longer exists shows the info toast and the invoice still renders', async ({
    page,
    testPrefix,
  }) => {
    let seeded: Seeded | null = null;
    try {
      seeded = await seedPaidPayment(page, testPrefix);
      const { invoiceId, invoiceNumber, depositId } = seeded;

      // Delete the payment, then follow the stale link.
      const removed = await page.request.delete(`/api/invoices/${invoiceId}/deposits/${depositId}`);
      expect(removed.ok(), `DELETE deposit: ${removed.status()}`).toBeTruthy();

      await page.goto(routeUrl('invoice', { id: invoiceId }, { payment: depositId }));

      const detail = new InvoiceDetailPage(page);
      await expect(
        detail.toasts.infoToast.filter({ hasText: 'That progress payment no longer exists.' }),
      ).toBeVisible();
      await expect(detail.heading).toContainText(invoiceNumber);
      await page.waitForURL((url) => !url.search.includes('payment='));
    } finally {
      await cleanup(page, seeded);
    }
  });

  test('3. an unknown payment id gives the same notice and still renders the invoice', async ({
    page,
    testPrefix,
  }) => {
    let seeded: Seeded | null = null;
    try {
      seeded = await seedPaidPayment(page, testPrefix);
      const { invoiceId, invoiceNumber } = seeded;

      await page.goto(routeUrl('invoice', { id: invoiceId }, { payment: 'does-not-exist' }));

      const detail = new InvoiceDetailPage(page);
      await expect(
        detail.toasts.infoToast.filter({ hasText: 'That progress payment no longer exists.' }),
      ).toBeVisible();
      await expect(detail.heading).toContainText(invoiceNumber);
    } finally {
      await cleanup(page, seeded);
    }
  });
});
