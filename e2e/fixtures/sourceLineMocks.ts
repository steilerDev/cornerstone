/**
 * Mocks for GET /api/budget-sources/:id/budget-lines (the Cost tab of a funding source) and the
 * move endpoint. The tree is area › item › line; lines are tagged with the kind of item (task or
 * purchase) by the list they come in (`workItemLines` / `householdItemLines`). Synthetic data.
 *
 * Register the mock BEFORE navigating: the source page loads the lines for its "Cost (n)" count
 * as soon as it mounts. Playwright uses the last-registered match, so register these after any
 * broader `**` glob mock of the same page.
 */

import type { Page, Route } from '@playwright/test';

export interface MockLine {
  readonly id: string;
  readonly description: string;
  readonly plannedAmount: number;
  readonly parentId: string;
  readonly parentName: string;
  readonly areaName: string;
  readonly hasClaimedInvoice?: boolean;
}

function toApiLine(line: MockLine) {
  return {
    id: line.id,
    description: line.description,
    plannedAmount: line.plannedAmount,
    confidence: 'quote',
    confidenceMargin: 1.0,
    invoiceLink: null,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    parentId: line.parentId,
    parentName: line.parentName,
    area: {
      id: `area-${line.areaName.replace(/\W+/g, '-').toLowerCase()}`,
      name: line.areaName,
      color: '#4CAF50',
      ancestors: [],
    },
    hasClaimedInvoice: line.hasClaimedInvoice ?? false,
  };
}

export function linesUrl(sourceId: string): string {
  return `**/api/budget-sources/${sourceId}/budget-lines`;
}

export function moveUrl(sourceId: string): string {
  return `**/api/budget-sources/${sourceId}/budget-lines/move`;
}

export async function mockSourceLines(
  page: Page,
  sourceId: string,
  lines: { readonly tasks?: readonly MockLine[]; readonly purchases?: readonly MockLine[] },
): Promise<void> {
  await page.route(linesUrl(sourceId), async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        workItemLines: (lines.tasks ?? []).map(toApiLine),
        householdItemLines: (lines.purchases ?? []).map(toApiLine),
      }),
    });
  });
}

/** The move endpoint: 200 with the counts, or an error status with an error code. */
export async function mockSourceMove(
  page: Page,
  sourceId: string,
  outcome:
    | { readonly status: 200; readonly moved: number }
    | { readonly status: 409; readonly code: string },
): Promise<void> {
  await page.route(moveUrl(sourceId), async (route: Route) => {
    if (route.request().method() !== 'PATCH') {
      await route.fallback();
      return;
    }
    if (outcome.status === 200) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ movedWorkItemLines: outcome.moved, movedHouseholdItemLines: 0 }),
      });
      return;
    }
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: outcome.code, message: 'Stale ownership.' } }),
    });
  });
}
