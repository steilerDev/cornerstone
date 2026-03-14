/**
 * Shared API helpers for E2E tests.
 *
 * Each helper creates or deletes a resource via the REST API using
 * `page.request`, which inherits the authenticated session cookie from the
 * test's storageState.  All helpers assert that the creation request
 * succeeds so that test setup failures surface with a clear message rather
 * than a cryptic null-reference error later in the test.
 *
 * Pattern mirrors the inline helpers in e2e/tests/budget/vendors.spec.ts but
 * lives here so multiple spec files can share them without duplication.
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { API } from './testData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Work Items
// ─────────────────────────────────────────────────────────────────────────────

export async function createWorkItemViaApi(
  page: Page,
  data: { title: string; [key: string]: unknown },
): Promise<string> {
  const response = await page.request.post(API.workItems, { data });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { id: string };
  return body.id;
}

export async function deleteWorkItemViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`${API.workItems}/${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tags
// ─────────────────────────────────────────────────────────────────────────────

export async function createTagViaApi(
  page: Page,
  data: { name: string; color?: string },
): Promise<string> {
  const response = await page.request.post(API.tags, { data });
  if (response.ok()) {
    const body = (await response.json()) as { id: string; name: string; color: string | null };
    return body.id;
  }
  // On 409 (tag name already exists due to parallel shard workers), fall back
  // to fetching all tags and finding the pre-existing one by name.
  if (response.status() === 409) {
    const listResponse = await page.request.get(API.tags);
    expect(listResponse.ok()).toBeTruthy();
    const tags = (await listResponse.json()) as Array<{ id: string; name: string }>;
    const existing = tags.find((t) => t.name === data.name);
    expect(existing).toBeDefined();
    return existing!.id;
  }
  // Unexpected failure — surface the error
  expect(response.ok()).toBeTruthy();
  // This line is unreachable but satisfies TypeScript
  return '';
}

export async function deleteTagViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`${API.tags}/${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Budget Sources
// ─────────────────────────────────────────────────────────────────────────────

export async function createBudgetSourceViaApi(
  page: Page,
  data: { name: string; sourceType?: string; totalAmount: number; status?: string },
): Promise<string> {
  const response = await page.request.post(API.budgetSources, {
    data: { sourceType: 'savings', status: 'active', ...data },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { budgetSource: { id: string } };
  return body.budgetSource.id;
}

export async function deleteBudgetSourceViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`${API.budgetSources}/${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Subsidy Programs
// ─────────────────────────────────────────────────────────────────────────────

export async function createSubsidyProgramViaApi(
  page: Page,
  data: {
    name: string;
    reductionType?: string;
    reductionValue: number;
    [key: string]: unknown;
  },
): Promise<string> {
  const response = await page.request.post(API.subsidyPrograms, {
    data: { reductionType: 'percentage', ...data },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { subsidyProgram: { id: string } };
  return body.subsidyProgram.id;
}

export async function deleteSubsidyProgramViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`${API.subsidyPrograms}/${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Milestones
// ─────────────────────────────────────────────────────────────────────────────

export async function createMilestoneViaApi(
  page: Page,
  data: { title: string; targetDate: string; description?: string | null },
): Promise<number> {
  const response = await page.request.post(API.milestones, { data });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { milestone: { id: number } };
  return body.milestone.id;
}

export async function deleteMilestoneViaApi(page: Page, id: number): Promise<void> {
  await page.request.delete(`${API.milestones}/${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Household Items
// ─────────────────────────────────────────────────────────────────────────────

export async function createHouseholdItemViaApi(
  page: Page,
  data: {
    name: string;
    category?: string;
    status?: string;
    room?: string;
    quantity?: number;
    [key: string]: unknown;
  },
): Promise<string> {
  const response = await page.request.post(API.householdItems, {
    data: { category: 'hic-other', status: 'planned', ...data },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { householdItem: { id: string } };
  return body.householdItem.id;
}

export async function deleteHouseholdItemViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`${API.householdItems}/${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Diary Entries
// ─────────────────────────────────────────────────────────────────────────────

export async function createDiaryEntryViaApi(
  page: Page,
  data: {
    entryType: 'daily_log' | 'site_visit' | 'delivery' | 'issue' | 'general_note';
    entryDate: string;
    body: string;
    title?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<string> {
  const response = await page.request.post(API.diaryEntries, { data });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { id: string };
  return body.id;
}

export async function deleteDiaryEntryViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`${API.diaryEntries}/${id}`);
}
