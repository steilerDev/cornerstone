/**
 * API seeding for the Financing specs (#2242): funding sources, grants (with covered items) and
 * the Own funds source. Synthetic data only; callers name records with the `testPrefix` fixture
 * and delete them in `finally` through a `SeedCleanup` (see costLineSeed.ts).
 */

import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { FinancingResponse } from '../../shared/src/types/money.js';
import type { SeedCleanup } from './costLineSeed.js';
import { API } from './testData.js';

export interface GrantItemRef {
  readonly type: 'work_item' | 'household_item';
  readonly id: string;
}

export async function createSource(
  page: Page,
  cleanup: SeedCleanup,
  data: {
    name: string;
    sourceType?: string;
    totalAmount: number;
    status?: string;
    interestRate?: number | null;
  },
): Promise<string> {
  const response = await page.request.post(API.budgetSources, {
    data: { sourceType: 'bank_loan', status: 'active', ...data },
  });
  expect(response.ok(), `POST budget source failed: ${response.status()}`).toBeTruthy();
  const id = ((await response.json()) as { budgetSource: { id: string } }).budgetSource.id;
  cleanup.fns.push(async () => {
    await page.request.delete(`${API.budgetSources}/${id}`);
  });
  return id;
}

/** A grant; `items` link tasks / purchases at creation. `fixed` is legacy: only the API sends it. */
export async function createGrant(
  page: Page,
  cleanup: SeedCleanup,
  data: {
    name: string;
    reductionValue: number;
    reductionType?: 'percentage' | 'fixed';
    maximumAmount?: number | null;
    applicationStatus?: string;
    applicationDeadline?: string | null;
    categoryIds?: string[];
    items?: readonly GrantItemRef[];
  },
): Promise<string> {
  const response = await page.request.post(API.subsidyPrograms, {
    data: { reductionType: 'percentage', ...data },
  });
  expect(response.ok(), `POST grant failed: ${response.status()}`).toBeTruthy();
  const id = ((await response.json()) as { subsidyProgram: { id: string } }).subsidyProgram.id;
  cleanup.fns.push(() => deleteGrant(page, id));
  return id;
}

/**
 * Delete a grant. The server refuses (409 SUBSIDY_PROGRAM_IN_USE) while tasks are linked, and
 * cleanup runs newest first (the grant before its tasks), so the covered items are unlinked first.
 */
export async function deleteGrant(page: Page, id: string): Promise<void> {
  const covered = await page.request.get(`${API.subsidyPrograms}/${id}/items`);
  if (covered.ok()) {
    const { items } = (await covered.json()) as { items: GrantItemRef[] };
    for (const item of items) {
      const base = item.type === 'work_item' ? API.workItems : API.householdItems;
      await page.request.delete(`${base}/${item.id}/subsidies/${id}`);
    }
  }
  await page.request.delete(`${API.subsidyPrograms}/${id}`);
}

/** The Financing endpoint's answer (the money service's figures). */
export async function readFinancing(page: Page): Promise<FinancingResponse> {
  const response = await page.request.get('/api/budget/financing');
  expect(response.ok(), `GET /api/budget/financing failed: ${response.status()}`).toBeTruthy();
  return (await response.json()) as FinancingResponse;
}

/** The id of the Own funds (discretionary) source every database has. */
export async function findOwnFundsId(page: Page): Promise<string> {
  const { sources } = await readFinancing(page);
  const own = sources.find((source) => source.isDiscretionary);
  expect(own, 'the Own funds source must exist').toBeTruthy();
  return own!.id;
}
