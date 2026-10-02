/**
 * E2E test for the circular-dependency error path on the Work Item detail page (#2131).
 *
 * Scenario: A -> B and B -> C exist; adding C -> A in the UI closes a cycle. The real
 * server answers 409 with the top-level CIRCULAR_DEPENDENCY code, and the page shows the
 * translated copy (not the developer-facing server message) in the inline error banner.
 *
 * Note: the dependency builder excludes items that already have a direct dependency with the
 * current item, so a direct B -> A reversal cannot be attempted from the UI. A 3-item cycle
 * keeps C selectable from A's page.
 */

import { test, expect } from '../../fixtures/auth.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';
import { API } from '../../fixtures/testData.js';
import { createWorkItemViaApi, deleteWorkItemViaApi } from '../../fixtures/apiHelpers.js';

test.describe('Circular dependency error', () => {
  test('Adding a dependency that closes a cycle shows the translated circular-dependency error', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    const ids: string[] = [];
    const titleC = `${testPrefix} Cycle C`;

    try {
      const idA = await createWorkItemViaApi(page, { title: `${testPrefix} Cycle A` });
      ids.push(idA);
      const idB = await createWorkItemViaApi(page, { title: `${testPrefix} Cycle B` });
      ids.push(idB);
      const idC = await createWorkItemViaApi(page, { title: titleC });
      ids.push(idC);

      // A -> B (B depends on A), B -> C (C depends on B)
      for (const [successor, predecessor] of [
        [idB, idA],
        [idC, idB],
      ] as const) {
        const response = await page.request.post(`${API.workItems}/${successor}/dependencies`, {
          data: { predecessorId: predecessor, dependencyType: 'finish_to_start' },
        });
        expect(response.ok()).toBeTruthy();
      }

      await detailPage.goto(idA);
      await expect(detailPage.heading).toBeVisible();

      // Sentence builder: "<C> must finish before <this item> can start" -> C -> A closes the cycle
      const picker = detailPage.constraintsSection.getByPlaceholder('Search work items...').first();
      await picker.fill(titleC);
      await page.getByRole('option', { name: titleC }).click();
      await detailPage.dependencyAddButton.click();

      await expect(detailPage.errorBanner).toBeVisible();
      await expect(detailPage.errorBanner).toContainText(
        'This would create a circular dependency.',
      );
      await expect(detailPage.errorBanner).not.toContainText('Circular dependency detected');
    } finally {
      for (const id of ids) await deleteWorkItemViaApi(page, id);
    }
  });
});
