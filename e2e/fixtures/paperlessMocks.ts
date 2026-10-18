/**
 * Small Paperless route mocks shared by the Documents-section specs (#2217).
 *
 * The E2E container has Paperless off. Since #2217 a Documents section with Paperless off shows
 * nothing when there are no links, and a read-only list plus one muted line when there are.
 * These helpers move one page into the other state without a Paperless container. All data is
 * synthetic.
 */

import { expect } from '@playwright/test';
import type { Locator, Page, Route } from '@playwright/test';

/** A configured, reachable Paperless: the Documents section renders with its Add button. */
export async function mockPaperlessConfigured(page: Page): Promise<void> {
  await page.route('**/api/paperless/status', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        configured: true,
        reachable: true,
        error: null,
        paperlessUrl: 'http://paperless.example.test:8000',
        filterTag: null,
      }),
    });
  });
}

/**
 * Paperless stays off (the real container state) but the entity has `count` kept links.
 * The links carry no document metadata, as the server returns them when Paperless is off.
 */
export async function mockKeptDocumentLinks(
  page: Page,
  entityType: string,
  entityId: string,
  count: number,
): Promise<void> {
  await page.route('**/api/document-links?*', async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const documentLinks = Array.from({ length: count }, (_, index) => ({
      id: `mock-kept-link-${index + 1}`,
      entityType,
      entityId,
      paperlessDocumentId: 9000 + index,
      attachmentType: null,
      createdBy: { id: 'user-1', displayName: 'E2E Admin' },
      createdAt: '2026-01-15T10:00:00.000Z',
      document: null,
    }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ documentLinks }),
    });
  });
}

const DOCUMENTS_HEADING = { level: 2, name: 'Documents', exact: true } as const;
const PAPERLESS_ENV_NAMES = /PAPERLESS_URL|PAPERLESS_API_TOKEN/;

/**
 * Runs `open` and resolves once both the Paperless status and the document links have been
 * answered, so an "absent" assertion cannot pass just because the section had not loaded yet.
 */
export async function openAndSettle(page: Page, open: () => Promise<void>): Promise<void> {
  const status = page.waitForResponse(
    (r) => r.url().includes('/api/paperless/status') && r.request().method() === 'GET',
  );
  const links = page.waitForResponse(
    (r) => r.url().includes('/api/document-links?') && r.request().method() === 'GET',
  );
  await open();
  await Promise.all([status, links]);
}

/** Nothing of the Documents section is on the page. */
export async function expectNoDocumentsSection(scope: Page | Locator): Promise<void> {
  await expect(scope.getByRole('heading', DOCUMENTS_HEADING)).toHaveCount(0);
  await expect(scope.locator('#documents-section-title')).toHaveCount(0);
  await expect(scope.getByRole('button', { name: '+ Add Document', exact: true })).toHaveCount(0);
  await expect(scope.getByText(/not configured/i)).toHaveCount(0);
  await expect(scope.getByText(PAPERLESS_ENV_NAMES)).toHaveCount(0);
}
