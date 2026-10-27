/**
 * E2E tests for the area breadcrumb in the cost lines of an invoice (Story #1272, #2235)
 *
 * On an offer or invoice page the cost lines are grouped by task or purchase (#2239): the group
 * heading shows the task or purchase as a link and, when it has an area, a compact AreaBreadcrumb
 * beside it (an item without an area shows the link and the muted "No area"). There is no
 * Belongs to column in document mode.
 *
 *   Scenario 1: a line whose task has an area -> breadcrumb in the group heading
 *   Scenario 2: a line whose task has no area -> link plus the muted "No area" text
 *   Scenario 3: a line whose purchase has no area -> link plus the muted "No area" text
 *
 * Setup path for each budget line:
 *   1. Create vendor  → POST /api/vendors
 *   2. Create invoice → POST /api/vendors/:vendorId/invoices
 *   3. Create work item (or household item) with/without area
 *   4. Create work item budget → POST /api/work-items/:id/budgets
 *   5. Create invoice budget line → POST /api/invoices/:invoiceId/budget-lines
 *   6. Navigate to invoice detail → assert breadcrumb in the group heading
 *

 * The row is found by its description (`CostLinesPanel.row`), on the table or the card list.
 */

import { test, expect } from '../../fixtures/auth.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import {
  createWorkItemViaApi,
  deleteWorkItemViaApi,
  createAreaViaApi,
  deleteAreaViaApi,
  createHouseholdItemViaApi,
  deleteHouseholdItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { API } from '../../fixtures/testData.js';
import type { Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Inline helpers for vendor, invoice, work item budget, and invoice budget line
// (no shared apiHelpers entries for these yet — created inline per existing pattern)
// ─────────────────────────────────────────────────────────────────────────────

async function createVendorViaApi(page: Page, name: string): Promise<string> {
  const response = await page.request.post(API.vendors, { data: { name } });
  expect(response.ok(), `POST vendor "${name}"`).toBeTruthy();
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
  expect(response.ok(), 'POST invoice').toBeTruthy();
  const body = (await response.json()) as { invoice: { id: string } };
  return body.invoice.id;
}

async function deleteInvoiceViaApi(page: Page, vendorId: string, invoiceId: string): Promise<void> {
  await page.request.delete(`${API.vendors}/${vendorId}/invoices/${invoiceId}`);
}

async function createBudgetSourceViaApi(
  page: Page,
  name: string,
  totalAmount = 100000,
): Promise<string> {
  const response = await page.request.post(API.budgetSources, {
    data: { name, sourceType: 'savings', totalAmount },
  });
  expect(response.ok(), `POST budget source "${name}"`).toBeTruthy();
  const body = (await response.json()) as { budgetSource: { id: string } };
  return body.budgetSource.id;
}

async function deleteBudgetSourceViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`${API.budgetSources}/${id}`);
}

async function createWorkItemBudgetViaApi(
  page: Page,
  workItemId: string,
  data: { plannedAmount: number; budgetSourceId: string; description?: string },
): Promise<string> {
  const response = await page.request.post(`${API.workItems}/${workItemId}/budgets`, {
    data: { confidence: 'own_estimate', ...data },
  });
  expect(response.ok(), `POST work item budget for ${workItemId}`).toBeTruthy();
  const body = (await response.json()) as { budget: { id: string } };
  return body.budget.id;
}

async function createHouseholdItemBudgetViaApi(
  page: Page,
  householdItemId: string,
  data: { plannedAmount: number; budgetSourceId: string; description?: string },
): Promise<string> {
  const response = await page.request.post(`/api/household-items/${householdItemId}/budgets`, {
    data: { confidence: 'own_estimate', ...data },
  });
  expect(response.ok(), `POST household item budget for ${householdItemId}`).toBeTruthy();
  const body = (await response.json()) as { budget: { id: string } };
  return body.budget.id;
}

async function createInvoiceBudgetLineViaApi(
  page: Page,
  invoiceId: string,
  data: { workItemBudgetId?: string; householdItemBudgetId?: string; itemizedAmount: number },
): Promise<string> {
  const response = await page.request.post(`/api/invoices/${invoiceId}/budget-lines`, {
    data: { invoiceId, ...data },
  });
  expect(response.ok(), 'POST invoice budget line').toBeTruthy();
  const body = (await response.json()) as { budgetLine: { id: string } };
  return body.budgetLine.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: work_item budget line with area → breadcrumb visible
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Cost line — task with an area shows the breadcrumb (Scenario 1)', () => {
  test('the group heading shows a compact breadcrumb when the task has an area', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new InvoiceDetailPage(page);

    let vendorId: string | null = null;
    let invoiceId: string | null = null;
    let workItemId: string | null = null;
    let rootAreaId: string | null = null;
    let childAreaId: string | null = null;
    let budgetSourceId: string | null = null;

    const rootName = `${testPrefix} Structure`;
    const childName = `${testPrefix} Foundation`;
    const wiTitle = `${testPrefix} Budget Line WI With Area`;

    try {
      rootAreaId = await createAreaViaApi(page, { name: rootName });
      childAreaId = await createAreaViaApi(page, { name: childName, parentId: rootAreaId });
      workItemId = await createWorkItemViaApi(page, { title: wiTitle, areaId: childAreaId });
      vendorId = await createVendorViaApi(page, `${testPrefix} Vendor BL`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 5000,
        date: '2026-06-01',
        invoiceNumber: `${testPrefix.substring(0, 8)}-INV`,
      });
      // budgetSourceId is required on POST /api/work-items/:id/budgets as of the
      // budget-sources feature rollout. Create a dedicated source per test.
      budgetSourceId = await createBudgetSourceViaApi(page, `${testPrefix} Source BL`);

      // Create a work item budget line first (unlinked)
      const workItemBudgetId = await createWorkItemBudgetViaApi(page, workItemId, {
        plannedAmount: 5000,
        budgetSourceId,
        description: `${testPrefix} Budget`,
      });

      // Link the work item budget line to the invoice
      await createInvoiceBudgetLineViaApi(page, invoiceId, {
        workItemBudgetId,
        itemizedAmount: 5000,
      });

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      // Wait for budget lines section to load
      await expect(detailPage.budgetLinesSection).toBeVisible();

      // The line sits under its task's group heading (task link + compact area breadcrumb);
      // document mode has no Belongs to column (#2239)
      await expect(detailPage.costLines.row(`${testPrefix} Budget`)).toBeVisible();
      const groupHeading = detailPage.costLines.groupHeading(wiTitle);
      await expect(groupHeading).toBeVisible();

      // The compact breadcrumb span should be visible inside the group heading
      const breadcrumbSpan = groupHeading.locator('[class*="compact"]');
      await expect(breadcrumbSpan).toBeVisible();

      const breadcrumbText = await breadcrumbSpan.textContent();
      expect(breadcrumbText).toContain(rootName);
      expect(breadcrumbText).toContain(childName);
      expect(breadcrumbText).toContain('›');
    } finally {
      // Clean up in reverse order (budget lines are cascade-deleted with invoice)
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
      if (childAreaId) await deleteAreaViaApi(page, childAreaId);
      if (rootAreaId) await deleteAreaViaApi(page, rootAreaId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: work_item budget line without area → "No area" visible
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Cost line — task without an area shows no breadcrumb (Scenario 2)', () => {
  test('a task without an area shows its link and "No area"', async ({ page, testPrefix }) => {
    const detailPage = new InvoiceDetailPage(page);

    let vendorId: string | null = null;
    let invoiceId: string | null = null;
    let workItemId: string | null = null;
    let budgetSourceId: string | null = null;

    const wiTitle = `${testPrefix} Budget Line WI No Area`;

    try {
      // Work item with no area
      workItemId = await createWorkItemViaApi(page, { title: wiTitle });
      vendorId = await createVendorViaApi(page, `${testPrefix} Vendor BL2`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 2000,
        date: '2026-06-02',
        invoiceNumber: `${testPrefix.substring(0, 8)}-N`,
      });
      budgetSourceId = await createBudgetSourceViaApi(page, `${testPrefix} Source BL2`);

      const workItemBudgetId = await createWorkItemBudgetViaApi(page, workItemId, {
        plannedAmount: 2000,
        budgetSourceId,
        description: `${testPrefix} Budget No Area`,
      });

      await createInvoiceBudgetLineViaApi(page, invoiceId, {
        workItemBudgetId,
        itemizedAmount: 2000,
      });

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      await expect(detailPage.budgetLinesSection).toBeVisible();

      await expect(detailPage.costLines.row(`${testPrefix} Budget No Area`)).toBeVisible();
      const groupHeading = detailPage.costLines.groupHeading(wiTitle);
      await expect(groupHeading).toBeVisible();

      // The task link is there; an item without an area shows the muted "No area" text
      // (rendered by AreaBreadcrumb when the area is null), never a breadcrumb path
      await expect(groupHeading.getByRole('link', { name: wiTitle })).toBeVisible();
      await expect(groupHeading.getByText('No area', { exact: true })).toBeVisible();
      await expect(groupHeading.locator('[class*="compact"]')).toHaveCount(0);
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: household_item budget line → no breadcrumb in that row
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Cost line — purchase without an area shows "No area" (Scenario 3)', () => {
  test('the group heading of a purchase line shows "No area", no breadcrumb path', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new InvoiceDetailPage(page);

    let vendorId: string | null = null;
    let invoiceId: string | null = null;
    let householdItemId: string | null = null;
    let budgetSourceId: string | null = null;

    const hiName = `${testPrefix} HI For Budget Line`;

    try {
      householdItemId = await createHouseholdItemViaApi(page, { name: hiName });
      vendorId = await createVendorViaApi(page, `${testPrefix} Vendor BL3`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 1500,
        date: '2026-06-03',
        invoiceNumber: `${testPrefix.substring(0, 8)}-H`,
      });
      budgetSourceId = await createBudgetSourceViaApi(page, `${testPrefix} Source BL3`);

      const hiBudgetId = await createHouseholdItemBudgetViaApi(page, householdItemId, {
        plannedAmount: 1500,
        budgetSourceId,
        description: `${testPrefix} HI Budget`,
      });

      await createInvoiceBudgetLineViaApi(page, invoiceId, {
        householdItemBudgetId: hiBudgetId,
        itemizedAmount: 1500,
      });

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      await expect(detailPage.budgetLinesSection).toBeVisible();

      // The row of our purchase's line, under the purchase's group heading
      await expect(detailPage.costLines.row(`${testPrefix} HI Budget`)).toBeVisible();
      const groupHeading = detailPage.costLines.groupHeading(hiName);
      await expect(groupHeading).toBeVisible();
      await expect(groupHeading.getByRole('link', { name: hiName })).toBeVisible();

      // No compact breadcrumb span for a purchase without an area
      await expect(groupHeading.locator('[class*="compact"]')).toHaveCount(0);

      // A purchase with no area shows the muted "No area" text, like a task does
      await expect(groupHeading.getByText('No area', { exact: true })).toBeVisible();
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (householdItemId) await deleteHouseholdItemViaApi(page, householdItemId);
      if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
    }
  });
});
