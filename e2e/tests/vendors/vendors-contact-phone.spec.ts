/**
 * E2E test for the vendor list phone fallback (Story #2197, AC4).
 *
 * A vendor with no phone of its own shows the first contact person's phone in the
 * "Contact" column (as a tel: link). A vendor with its own phone keeps it and does not
 * show a contact person's number. Runs on desktop, tablet and mobile (card layout).
 *
 * All names and numbers are synthetic (555-01NN form).
 */

import { test, expect } from '../../fixtures/auth.js';
import { VendorsPage } from '../../pages/VendorsPage.js';
import { API } from '../../fixtures/testData.js';
import type { Page } from '@playwright/test';

async function createVendor(page: Page, data: { name: string; phone?: string }): Promise<string> {
  const resp = await page.request.post(API.vendors, { data });
  expect(resp.ok(), `POST vendor "${data.name}" failed: ${resp.status()}`).toBeTruthy();
  return ((await resp.json()) as { vendor: { id: string } }).vendor.id;
}

async function createContact(
  page: Page,
  vendorId: string,
  data: { firstName: string; lastName: string; phone: string },
): Promise<void> {
  const resp = await page.request.post(`${API.vendors}/${vendorId}/contacts`, { data });
  expect(resp.ok(), `POST contact failed: ${resp.status()}`).toBeTruthy();
}

test.describe('Vendor list phone fallback', { tag: '@responsive' }, () => {
  test('shows the first contact phone when the vendor has none, and the vendor phone when it has one', async ({
    page,
    testPrefix,
  }) => {
    const vendorIds: string[] = [];
    try {
      const drywallName = `${testPrefix} Sample Drywall Ltd`;
      const roofingName = `${testPrefix} Test Roofing Co`;

      const drywallId = await createVendor(page, { name: drywallName });
      vendorIds.push(drywallId);
      await createContact(page, drywallId, {
        firstName: 'Alex',
        lastName: 'Example',
        phone: '555-0101',
      });

      const roofingId = await createVendor(page, { name: roofingName, phone: '555-0102' });
      vendorIds.push(roofingId);
      await createContact(page, roofingId, {
        firstName: 'Sam',
        lastName: 'Example',
        phone: '555-0103',
      });

      const vendorsPage = new VendorsPage(page);
      await vendorsPage.goto();
      await vendorsPage.search(testPrefix);

      const drywallPhone = vendorsPage.phoneLink(drywallName);
      await expect(drywallPhone).toHaveText('555-0101');
      await expect(drywallPhone).toHaveAttribute('href', 'tel:555-0101');

      const roofingPhone = vendorsPage.phoneLink(roofingName);
      await expect(roofingPhone).toHaveText('555-0102');
      await expect(roofingPhone).toHaveAttribute('href', 'tel:555-0102');
      await expect(vendorsPage.contactCell(roofingName)).not.toContainText('555-0103');
    } finally {
      for (const id of vendorIds) {
        await page.request.delete(`${API.vendors}/${id}`);
      }
    }
  });
});
