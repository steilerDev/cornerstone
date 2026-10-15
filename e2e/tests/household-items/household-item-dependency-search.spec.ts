/**
 * E2E tests for the purchase detail dependency picker (in-session fix under EPIC-21).
 *
 * `#household-item-dependency-search` is a SearchPicker in add mode that searches the server for
 * tasks (milestones are listed in full): choosing a result adds the dependency, the input empties
 * and keeps focus, and a linked predecessor is no longer offered.
 *
 * D1  Add a task by typing part of its unique title: it is listed, the input is empty and focused,
 *     and a new search no longer offers it
 * D2  Add a milestone the same way
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import {
  createHouseholdItemViaApi,
  createMilestoneViaApi,
  createWorkItemViaApi,
  deleteHouseholdItemViaApi,
  deleteMilestoneViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { HouseholdItemDetailPage } from '../../pages/HouseholdItemDetailPage.js';

async function focusIsOnBody(page: Page): Promise<boolean> {
  return page.evaluate(() => document.activeElement === document.body);
}

test.describe('Purchase dependency picker - server search (D1, D2)', { tag: '@responsive' }, () => {
  test('D1: add a task dependency by typing part of its title', async ({ page, testPrefix }) => {
    const taskTitle = `${testPrefix} Dependency Task Unique`;
    const purchaseId = await createHouseholdItemViaApi(page, {
      name: `${testPrefix} Dependency Purchase`,
    });
    const taskId = await createWorkItemViaApi(page, { title: taskTitle });
    try {
      const detail = new HouseholdItemDetailPage(page);
      const picker = detail.dependencyPicker;
      await detail.goto(purchaseId);

      // Part of the title, then ArrowDown and Enter
      await picker.pick(`${testPrefix} Dependency Task`, taskTitle);
      await expect(page.locator('[class*="depRow"]').filter({ hasText: taskTitle })).toBeVisible();
      await expect(picker.input).toHaveValue('');
      await expect(picker.input).toBeFocused();
      expect(await focusIsOnBody(page)).toBe(false);

      // The linked task is no longer offered
      await picker.type(taskTitle);
      await expect(picker.option(taskTitle)).toHaveCount(0);
    } finally {
      await deleteHouseholdItemViaApi(page, purchaseId);
      await deleteWorkItemViaApi(page, taskId);
    }
  });

  test('D2: add a milestone dependency the same way', async ({ page, testPrefix }) => {
    const milestoneTitle = `${testPrefix} Dependency Milestone Unique`;
    const purchaseId = await createHouseholdItemViaApi(page, {
      name: `${testPrefix} Dependency Purchase M`,
    });
    const milestoneId = await createMilestoneViaApi(page, {
      title: milestoneTitle,
      targetDate: '2026-10-30',
    });
    try {
      const detail = new HouseholdItemDetailPage(page);
      const picker = detail.dependencyPicker;
      await detail.goto(purchaseId);

      await picker.pick(milestoneTitle);
      await expect(
        page.locator('[class*="depRow"]').filter({ hasText: milestoneTitle }),
      ).toBeVisible();
      await expect(picker.input).toBeFocused();
      expect(await focusIsOnBody(page)).toBe(false);

      await picker.type(milestoneTitle);
      await expect(picker.option(milestoneTitle)).toHaveCount(0);
    } finally {
      await deleteHouseholdItemViaApi(page, purchaseId);
      await deleteMilestoneViaApi(page, milestoneId);
    }
  });
});
