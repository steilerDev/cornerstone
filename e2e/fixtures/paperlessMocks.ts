/**
 * Small Paperless route mocks shared by the Documents-panel specs (#2217, #2233).
 *
 * The E2E container has Paperless off. With Paperless off a host shows no Documents trigger when
 * there are no links, and (#2233) the trigger plus a read-only panel with one notice when there are.
 * These helpers move one page into the other state without a Paperless container. All data is
 * synthetic.
 */

import { expect } from '@playwright/test';
import type { Locator, Page, Route } from '@playwright/test';

/** A configured, reachable Paperless: the Documents panel offers Link document. */
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

const PAPERLESS_ENV_NAMES = /PAPERLESS_URL|PAPERLESS_API_TOKEN/;

/**
 * Runs `open` and resolves once both the Paperless status and the document links have been
 * answered, so an "absent" assertion cannot pass just because the host had not loaded yet.
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

/**
 * Nothing of the Documents panel is reachable: no "Documents (n)" trigger (the single-panel
 * default or any per-row id matching `testIdPattern`), no panel, no "not configured" text and no
 * environment variable names. (#2233: Paperless off + no kept links hides the trigger.)
 */
export async function expectNoDocumentsButton(
  scope: Page | Locator,
  testIdPattern: RegExp = /^documents-panel-button$/,
): Promise<void> {
  await expect(scope.getByTestId(testIdPattern)).toHaveCount(0);
  await expect(scope.getByRole('button', { name: /^Documents \(\d+\)/ })).toHaveCount(0);
  await expect(scope.getByRole('dialog', { name: /Documents \(\d+\)/ })).toHaveCount(0);
  await expect(scope.getByText(/not configured/i)).toHaveCount(0);
  await expect(scope.getByText(PAPERLESS_ENV_NAMES)).toHaveCount(0);
}

/**
 * Like `openAndSettle`, for pages with several Documents hosts (rows): waits for THIS record's
 * links (`entityId`), then lets React render twice, so an "absent trigger" assertion cannot pass
 * before the host has loaded.
 */
export async function settleDocumentsHost(
  page: Page,
  entityId: string,
  open: () => Promise<void>,
): Promise<void> {
  const status = page.waitForResponse(
    (r) => r.url().includes('/api/paperless/status') && r.request().method() === 'GET',
  );
  const links = page.waitForResponse(
    (r) =>
      r.url().includes('/api/document-links?') &&
      r.url().includes(`entityId=${entityId}`) &&
      r.request().method() === 'GET',
  );
  await open();
  await Promise.all([status, links]);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
