/**
 * API seeding for the cost line specs (#2235): companies, offers/invoices, cost lines on tasks
 * and purchases, and their links. Everything is synthetic; callers name records with the
 * `testPrefix` fixture and delete them in `afterEach` through the `cleanup` list.
 */

import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { API } from './testData.js';

export type InvoiceStatus = 'quotation' | 'pending' | 'paid' | 'claimed';
export type CostLineHostKind = 'work_item' | 'household_item';

export interface SeedCleanup {
  readonly fns: Array<() => Promise<void>>;
}

export function newCleanup(): SeedCleanup {
  return { fns: [] };
}

/** Run the cleanup functions newest first; a failing delete never hides the test's own result. */
export async function runCleanup(cleanup: SeedCleanup): Promise<void> {
  for (const fn of [...cleanup.fns].reverse()) {
    try {
      await fn();
    } catch {
      // best effort
    }
  }
  cleanup.fns.length = 0;
}

export async function createVendor(
  page: Page,
  cleanup: SeedCleanup,
  name: string,
): Promise<string> {
  const response = await page.request.post(API.vendors, { data: { name } });
  expect(response.ok(), `POST vendor failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { vendor: { id: string } };
  cleanup.fns.push(async () => {
    await page.request.delete(`${API.vendors}/${body.vendor.id}`);
  });
  return body.vendor.id;
}

export interface CreatedInvoice {
  readonly id: string;
  readonly vendorId: string;
}

/** An offer (`quotation`) or invoice of a company. */
export async function createInvoice(
  page: Page,
  cleanup: SeedCleanup,
  vendorId: string,
  data: { amount: number; date?: string; status?: InvoiceStatus; invoiceNumber?: string },
): Promise<CreatedInvoice> {
  const response = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
    data: { status: 'pending', date: '2026-06-01', ...data },
  });
  expect(response.ok(), `POST invoice failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { invoice: { id: string } };
  cleanup.fns.push(async () => {
    await page.request.delete(`${API.vendors}/${vendorId}/invoices/${body.invoice.id}`);
  });
  return { id: body.invoice.id, vendorId };
}

export async function createTask(page: Page, cleanup: SeedCleanup, title: string): Promise<string> {
  const response = await page.request.post(API.workItems, { data: { title } });
  expect(response.ok(), `POST work item failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { id: string };
  cleanup.fns.push(async () => {
    await page.request.delete(`${API.workItems}/${body.id}`);
  });
  return body.id;
}

export async function createPurchase(
  page: Page,
  cleanup: SeedCleanup,
  name: string,
): Promise<string> {
  const response = await page.request.post(API.householdItems, {
    data: { name, category: 'hic-other', status: 'planned' },
  });
  expect(response.ok(), `POST household item failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { householdItem: { id: string } };
  cleanup.fns.push(async () => {
    await page.request.delete(`${API.householdItems}/${body.householdItem.id}`);
  });
  return body.householdItem.id;
}

export async function createFundingSource(
  page: Page,
  cleanup: SeedCleanup,
  name: string,
  totalAmount = 1_000_000,
): Promise<string> {
  const response = await page.request.post(API.budgetSources, {
    data: { name, sourceType: 'savings', status: 'active', totalAmount },
  });
  expect(response.ok(), `POST budget source failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { budgetSource: { id: string } };
  cleanup.fns.push(async () => {
    await page.request.delete(`${API.budgetSources}/${body.budgetSource.id}`);
  });
  return body.budgetSource.id;
}

export interface CostLineSeedOptions {
  readonly kind: CostLineHostKind;
  readonly hostId: string;
  readonly budgetSourceId: string;
  readonly description: string;
  readonly plannedAmount: number;
  readonly confidence?: string;
  readonly quantity?: number;
  readonly unit?: string;
  readonly unitPrice?: number;
  readonly includesVat?: boolean;
  readonly budgetCategoryId?: string | null;
  readonly vendorId?: string | null;
}

/** An unlinked cost line (an Estimate) on a task or purchase. */
export async function createCostLine(page: Page, options: CostLineSeedOptions): Promise<string> {
  const base = options.kind === 'work_item' ? API.workItems : API.householdItems;
  const { kind: _kind, hostId, ...data } = options;
  const response = await page.request.post(`${base}/${hostId}/budgets`, {
    data: { confidence: 'own_estimate', ...data },
  });
  expect(response.ok(), `POST cost line failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { budget: { id: string } };
  return body.budget.id;
}

/** Link an existing cost line to an offer or invoice; returns the invoice-budget-line id. */
export async function linkCostLine(
  page: Page,
  invoiceId: string,
  kind: CostLineHostKind,
  lineId: string,
  itemizedAmount: number,
): Promise<string> {
  const response = await page.request.post(`/api/invoices/${invoiceId}/budget-lines`, {
    data: {
      ...(kind === 'work_item' ? { workItemBudgetId: lineId } : { householdItemBudgetId: lineId }),
      itemizedAmount,
    },
  });
  expect(response.ok(), `POST invoice budget line failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { budgetLine: { id: string } };
  return body.budgetLine.id;
}

/** A cost line created and linked in one step. */
export async function createLinkedCostLine(
  page: Page,
  invoiceId: string,
  options: CostLineSeedOptions & { readonly itemizedAmount: number },
): Promise<{ lineId: string; linkId: string }> {
  const { itemizedAmount, ...rest } = options;
  const lineId = await createCostLine(page, rest);
  const linkId = await linkCostLine(page, invoiceId, options.kind, lineId, itemizedAmount);
  return { lineId, linkId };
}
