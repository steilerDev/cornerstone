/**
 * Seeding for the bank report specs (#2243): an open loan with invoices allocated to it, so the
 * claim report lists them and the source counts them as ready to submit. Synthetic data only;
 * records are deleted through the caller's `SeedCleanup`.
 */

import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createInvoice, createLinkedCostLine, createTask, createVendor } from './costLineSeed.js';
import type { SeedCleanup } from './costLineSeed.js';
import { createSource } from './financingSeed.js';
import { API } from './testData.js';

export interface ReadyInvoice {
  readonly id: string;
  readonly number: string;
  readonly amount: number;
}

export interface ReadyLoan {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly vendorName: string;
  readonly invoices: readonly ReadyInvoice[];
}

/**
 * A fresh open loan of `totalAmount` 50,000 with one pending invoice per entry of `amounts`, each
 * allocated in full to the loan through a cost line on one task. Names carry `label` so a test's
 * rows are findable among other tests' data.
 */
export async function seedReadyLoan(
  page: Page,
  cleanup: SeedCleanup,
  testPrefix: string,
  label: string,
  amounts: readonly number[] = [1000],
): Promise<ReadyLoan> {
  const sourceName = `${testPrefix} ${label} Loan`;
  const sourceId = await createSource(page, cleanup, { name: sourceName, totalAmount: 50000 });
  const vendorName = `${testPrefix} ${label} Co`;
  const vendorId = await createVendor(page, cleanup, vendorName);
  const taskId = await createTask(page, cleanup, `${testPrefix} ${label} task`);
  const invoices: ReadyInvoice[] = [];
  for (const [index, amount] of amounts.entries()) {
    const number = `${testPrefix}-${label}-${String(index + 1).padStart(3, '0')}`;
    const invoice = await createInvoice(page, cleanup, vendorId, {
      amount,
      invoiceNumber: number,
    });
    await createLinkedCostLine(page, invoice.id, {
      kind: 'work_item',
      hostId: taskId,
      budgetSourceId: sourceId,
      description: `${testPrefix} ${label} line ${index + 1}`,
      plannedAmount: amount,
      includesVat: true,
      itemizedAmount: amount,
    });
    invoices.push({ id: invoice.id, number, amount });
  }
  return { sourceId, sourceName, vendorName, invoices };
}

/** Submits the invoices to the bank through the API; returns the batch id of the submission. */
export async function markSubmitted(
  page: Page,
  sourceId: string,
  invoiceIds: readonly string[],
): Promise<string> {
  const response = await page.request.post(API.sourceReportsMarkClaimed, {
    data: { sourceId, invoiceIds, depositIds: [] },
  });
  expect(response.ok(), `POST mark-claimed: ${response.status()}`).toBeTruthy();
  return ((await response.json()) as { batchId: string }).batchId;
}

/** The live status of an invoice. */
export async function invoiceStatus(page: Page, invoiceId: string): Promise<string> {
  const response = await page.request.get(`/api/invoices/${invoiceId}`);
  expect(response.ok(), `GET invoice: ${response.status()}`).toBeTruthy();
  return ((await response.json()) as { invoice: { status: string } }).invoice.status;
}
