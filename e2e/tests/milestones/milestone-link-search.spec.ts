/**
 * E2E tests for the milestone detail pickers that search the server (in-session fix under EPIC-21).
 *
 * The linked-items picker (`#milestone-link-search`) and the dependent-tasks picker
 * (`#milestone-dependent-search`) are SearchPickers in add mode: choosing a result adds it, the
 * input empties and keeps focus. Both reach items past the first page because they search the server.
 *
 * M1  Link a task and a purchase through `#milestone-link-search`: both are listed, focus stays in
 *     the input, a linked item is no longer offered, and unlinking makes it findable again
 * M2  Add a dependent task through `#milestone-dependent-search`
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
import { MilestoneDetailPage } from '../../pages/MilestoneDetailPage.js';

async function focusIsOnBody(page: Page): Promise<boolean> {
  return page.evaluate(() => document.activeElement === document.body);
}

test.describe('Milestone link picker - server search (M1)', { tag: '@responsive' }, () => {
  test('M1: link a task and a purchase by typing; focus stays in the input; unlink offers them again', async ({
    page,
    testPrefix,
  }) => {
    const taskTitle = `${testPrefix} Milestone Link Task`;
    const purchaseName = `${testPrefix} Milestone Link Purchase`;
    const milestoneId = await createMilestoneViaApi(page, {
      title: `${testPrefix} Link Milestone`,
      targetDate: '2026-11-15',
    });
    const taskId = await createWorkItemViaApi(page, { title: taskTitle });
    const purchaseId = await createHouseholdItemViaApi(page, { name: purchaseName });
    try {
      const detail = new MilestoneDetailPage(page);
      const picker = detail.linkPicker;
      await detail.goto(milestoneId);

      // A task: listed, the input is empty and still focused
      await picker.pick(taskTitle);
      await expect(page.getByRole('link', { name: taskTitle })).toBeVisible();
      await expect(picker.input).toHaveValue('');
      await expect(picker.input).toBeFocused();

      // A purchase through the same picker
      await picker.pick(purchaseName);
      await expect(page.getByRole('link', { name: purchaseName })).toBeVisible();
      await expect(picker.input).toBeFocused();
      expect(await focusIsOnBody(page)).toBe(false);

      // Linked items are no longer offered
      await picker.type(taskTitle);
      await expect(picker.option(taskTitle)).toHaveCount(0);

      // Unlinking makes the task findable again
      await detail.page.getByTestId(`unlink-work-item-${taskId}`).click();
      await expect(page.getByRole('link', { name: taskTitle })).toHaveCount(0);
      await picker.type(taskTitle);
      await expect(picker.option(taskTitle)).toHaveCount(1);
    } finally {
      await deleteMilestoneViaApi(page, milestoneId);
      await deleteWorkItemViaApi(page, taskId);
      await deleteHouseholdItemViaApi(page, purchaseId);
    }
  });
});

test.describe('Milestone dependent picker - server search (M2)', { tag: '@responsive' }, () => {
  test('M2: add a dependent task by typing; it is listed and the input keeps focus', async ({
    page,
    testPrefix,
  }) => {
    const taskTitle = `${testPrefix} Milestone Dependent Task`;
    const milestoneId = await createMilestoneViaApi(page, {
      title: `${testPrefix} Dependent Milestone`,
      targetDate: '2026-12-01',
    });
    const taskId = await createWorkItemViaApi(page, { title: taskTitle });
    try {
      const detail = new MilestoneDetailPage(page);
      const picker = detail.dependentPicker;
      await detail.goto(milestoneId);

      await picker.pick(taskTitle);
      await expect(
        detail.dependentItemsSection.getByRole('link', { name: taskTitle }),
      ).toBeVisible();
      await expect(picker.input).toHaveValue('');
      await expect(picker.input).toBeFocused();
      expect(await focusIsOnBody(page)).toBe(false);

      // Already dependent: not offered again; removing it offers it again
      await picker.type(taskTitle);
      await expect(picker.option(taskTitle)).toHaveCount(0);
      await page.getByTestId(`remove-dep-work-item-${taskId}`).click();
      await expect(detail.dependentItemsSection.getByRole('link', { name: taskTitle })).toHaveCount(
        0,
      );
      await picker.type(taskTitle);
      await expect(picker.option(taskTitle)).toHaveCount(1);
    } finally {
      await deleteMilestoneViaApi(page, milestoneId);
      await deleteWorkItemViaApi(page, taskId);
    }
  });
});
