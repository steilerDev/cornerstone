/**
 * E2E tests for the member side of Settings > Integrations (Story #2217, AC3).
 *
 * Integrations is admin only. A member opening it sees "No access" in place (URL unchanged), no
 * skeletons, no variable names, and the page never requests the integrations. The server refuses
 * the endpoint (403). The Documents notice for kept links reads the same for a member but has no
 * link to Integrations (a member cannot open that page).
 *
 * Uses a REAL member account (the same dedicated user as member-access.spec.ts, so no extra
 * login), not an /api/auth/me mock, so the server half is exercised too.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/isolatedUser.js';
import { API, ROUTES } from '../../fixtures/testData.js';
import { createWorkItemViaApi, deleteWorkItemViaApi } from '../../fixtures/apiHelpers.js';
import { mockKeptDocumentLinks } from '../../fixtures/paperlessMocks.js';
import { NoAccessPage } from '../../pages/NoAccessPage.js';
import { DocumentsPanel } from '../../pages/DocumentsPanel.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';

test.use({
  isolatedUserPerWorker: {
    emailPrefix: 'member-access',
    displayName: 'E2E Member Access',
    role: 'member',
  },
});

const ENV_NAME =
  /\b(PAPERLESS_URL|PAPERLESS_API_TOKEN|OIDC_CLIENT_SECRET|LLM_API_KEY|BACKUP_CADENCE)\b/;

function recordRequests(page: Page): URL[] {
  const seen: URL[] = [];
  page.on('request', (req) => seen.push(new URL(req.url())));
  return seen;
}

test.describe('Integrations for a member (Story #2217)', { tag: '@responsive' }, () => {
  test('A member opening Integrations sees No access in place, with no skeleton and no names', async ({
    page,
  }) => {
    const requests = recordRequests(page);
    const noAccess = new NoAccessPage(page);

    await page.goto(ROUTES.integrations);

    await expect(noAccess.heading).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${ROUTES.integrations}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByTestId('integrations-intro')).toHaveCount(0);
    await expect(page.locator('[data-testid^="integration-"]')).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: /Loading/ })).toHaveCount(0);
    expect(await page.locator('body').innerText()).not.toMatch(ENV_NAME);
    expect(requests.filter((url) => url.pathname === API.integrations)).toHaveLength(0);
  });

  test('The server refuses a member: 403 on the integrations endpoint', async ({ page }) => {
    const response = await page.request.get(API.integrations);

    expect(response.status()).toBe(403);
    const body = await response.text();
    expect(body).not.toMatch(ENV_NAME);
    expect(body).not.toContain('e2e-secret');
  });

  test('Kept links: a member reads the same notice but has no link to Integrations', async ({
    page,
    testPrefix,
  }) => {
    let createdId: string | null = null;
    try {
      createdId = await createWorkItemViaApi(page, { title: `${testPrefix} Member Docs Notice` });
      await mockKeptDocumentLinks(page, 'work_item', createdId, 1);
      const detailPage = new WorkItemDetailPage(page);

      await detailPage.goto(createdId);
      const panel = new DocumentsPanel(page);
      await panel.open();

      await expect(panel.notice).toContainText('Paperless is not connected. 1 link is kept.');
      await expect(panel.integrationsLink).toHaveCount(0);
      await expect(panel.linkDocumentButton).toHaveCount(0);
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});
