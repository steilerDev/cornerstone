/**
 * E2E test for the circular-dependency error path on the Work Item detail page (#2131).
 *
 * Scenario: A -> B and B -> C exist; adding C -> A in the UI closes a cycle. The real
 * server answers 409 with the top-level CIRCULAR_DEPENDENCY code, and the page shows the
 * translated copy (not the developer-facing server message) in the inline error banner.
 *
 * Note: the dependency dialog excludes tasks that already have a direct dependency with the
 * current task, so a direct B -> A reversal cannot be attempted from the UI. A 3-task cycle
 * keeps C selectable from A's page (Timing tab, "Waits for" Add dialog; the error shows under the
 * Task field since #2248).
 */

import { test, expect } from '../../fixtures/auth.js';
import { WorkItemDetailPage, dependencyDialogTitles } from '../../pages/WorkItemDetailPage.js';
import { EntityPickerControl } from '../../pages/components/EntityPickerControl.js';
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

      await detailPage.goto(idA, { tab: 'timing' });
      await expect(detailPage.heading).toBeVisible();

      // Add dialog of "Waits for": A waits for C closes the cycle A -> B -> C -> A
      await detailPage.dependencyAdd(detailPage.waitsFor).click();
      const dialog = detailPage.dependencyDialog(dependencyDialogTitles.addWaitsFor);
      await dialog.waitForOpen();
      const picker = new EntityPickerControl(page, 'task', dialog.dialog);
      await picker.pick(titleC);
      await dialog.save();

      // The server answers 409 CIRCULAR_DEPENDENCY: the field shows the translated copy
      const error = dialog.fieldError('task');
      await expect(error).toBeVisible();
      await expect(error).toContainText('This would create a circular dependency.');
      await expect(error).not.toContainText('Circular dependency detected');
      // The dialog stays open so the choice can be changed
      await expect(dialog.dialog).toBeVisible();
    } finally {
      for (const id of ids) await deleteWorkItemViaApi(page, id);
    }
  });
});
