/**
 * Deterministic mocks for the three Project setup reference lists (#2215).
 *
 * The cost category, purchase category and orientation lists are GLOBAL, so reordering the real
 * lists would race with every other worker that creates or deletes rows (a reorder sends the whole
 * id list and answers 409 REORDER_SET_MISMATCH when the set changed). Reorder tests therefore mock
 * `GET <list>` with synthetic rows and `PATCH <list>/reorder`, and read the recorded bodies.
 */

import type { Page, Route } from '@playwright/test';

export type MockedListKey = 'costCategories' | 'purchaseCategories' | 'orientations';

const LIST_ENDPOINTS: Record<MockedListKey, { path: string; envelope: string }> = {
  costCategories: { path: '/api/budget-categories', envelope: 'categories' },
  purchaseCategories: { path: '/api/household-item-categories', envelope: 'categories' },
  orientations: { path: '/api/orientations', envelope: 'orientations' },
};

export interface MockedRow {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
}

export interface ReorderMock {
  /** The `ids` of every reorder request received, in order. */
  readonly requests: string[][];
  /** Count of GET list requests (the page load counts as one). */
  getCount(): number;
}

function toEntity(key: MockedListKey, row: MockedRow, index: number): Record<string, unknown> {
  const base = {
    id: row.id,
    name: row.name,
    sortOrder: index,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  if (key === 'orientations') return { ...base, description: row.description ?? null };
  if (key === 'costCategories') {
    return {
      ...base,
      description: row.description ?? null,
      color: row.color ?? null,
      translationKey: null,
    };
  }
  return { ...base, color: row.color ?? null, translationKey: null };
}

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/**
 * Mock the list and its reorder endpoint. The reorder echoes the requested order unless
 * `reorderFailure` is set, in which case it answers that status/code.
 */
export async function mockReferenceList(
  page: Page,
  key: MockedListKey,
  rows: readonly MockedRow[],
  options: { reorderFailure?: { status: number; code: string } } = {},
): Promise<ReorderMock> {
  const { path, envelope } = LIST_ENDPOINTS[key];
  const requests: string[][] = [];
  let gets = 0;
  let current = [...rows];

  await page.route(
    (url) => url.pathname === path,
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      gets += 1;
      await json(route, 200, { [envelope]: current.map((row, i) => toEntity(key, row, i)) });
    },
  );
  await page.route(
    (url) => url.pathname === `${path}/reorder`,
    async (route) => {
      const body = route.request().postDataJSON() as { ids: string[] };
      requests.push(body.ids);
      if (options.reorderFailure) {
        await json(route, options.reorderFailure.status, {
          error: { code: options.reorderFailure.code, message: 'Reorder rejected' },
        });
        return;
      }
      const byId = new Map(current.map((row) => [row.id, row]));
      current = body.ids.flatMap((id) => {
        const row = byId.get(id);
        return row ? [row] : [];
      });
      await json(route, 200, { [envelope]: current.map((row, i) => toEntity(key, row, i)) });
    },
  );

  return { requests, getCount: () => gets };
}
