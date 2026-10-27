/**
 * E2E: Financing layout and touch targets on every viewport (#2242, EPIC-21 P4.10).
 *
 * Scenarios
 * F11 (AC12)              1280×800: header + strip end at or above 450 px on the source and grant pages and
 *                         the strip wraps to at most two rows; 390×844: the strip ends above the bottom bar
 *                         and is two columns wide; no horizontal overflow down to 320 px on all three pages
 * F12 (@responsive)       on touch widths the Add buttons, the loan card ⋯, Documents and Link, the grant
 *                         chip remove and Move lines… are at least 44 px; dark mode renders the three pages
 *                         legibly
 *
 * Real data through the API; Paperless "on" is a status mock so the strip shows its Documents fact.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Locator, Page } from '@playwright/test';
import { createCostLine, createTask, newCleanup, runCleanup } from '../../fixtures/costLineSeed.js';
import type { SeedCleanup } from '../../fixtures/costLineSeed.js';
import { enableDarkTheme, expectLegibleInDark } from '../../fixtures/darkMode.js';
import { createGrant, createSource } from '../../fixtures/financingSeed.js';
import { mockPaperlessConfigured } from '../../fixtures/paperlessMocks.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { FinancingFormDialog } from '../../pages/FinancingFormDialog.js';
import { FinancingPage } from '../../pages/FinancingPage.js';
import { FundingSourcePage } from '../../pages/FundingSourcePage.js';
import { GrantPage } from '../../pages/GrantPage.js';

interface Seeded {
  readonly sourceId: string;
  readonly grantId: string;
  readonly taskId: string;
}

/** A loan with a long name and one grant covering a task: the widest strips the pages show. */
async function seed(page: Page, cleanup: SeedCleanup, prefix: string): Promise<Seeded> {
  const sourceId = await createSource(page, cleanup, {
    name: `${prefix} Responsive Construction Loan With A Rather Long Name`,
    totalAmount: 250000,
    interestRate: 3.25,
  });
  const taskId = await createTask(page, cleanup, `${prefix} Responsive Task`);
  const grantId = await createGrant(page, cleanup, {
    name: `${prefix} Responsive Energy Efficiency Grant`,
    reductionValue: 20,
    maximumAmount: 12000,
    applicationStatus: 'approved',
    applicationDeadline: '2031-06-30',
    items: [{ type: 'work_item', id: taskId }],
  });
  return { sourceId, grantId, taskId };
}

async function hasSidewaysScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

async function expectTarget(locator: Locator, label: string): Promise<void> {
  await expect(locator, label).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label}: box`).not.toBeNull();
  // 2.75rem can lay out as 43.99998px: allow sub-pixel rounding
  expect(box!.height, `${label}: height`).toBeGreaterThanOrEqual(43.99);
  expect(box!.width, `${label}: width`).toBeGreaterThanOrEqual(43.99);
}

test.describe('Financing layout (AC12)', () => {
  test('F11: at 1280×800 header and strip stay above 450 px in at most two rows', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const { sourceId, grantId } = await seed(page, cleanup, testPrefix);
      await page.setViewportSize({ width: 1280, height: 800 });
      await mockPaperlessConfigured(page);

      const source = new FundingSourcePage(page);
      await source.goto(sourceId);
      await expect.poll(() => source.summary.factIds()).toHaveLength(7);
      expect((await source.summary.stripBox()).bottom).toBeLessThanOrEqual(450);
      expect(await source.summary.rowCount()).toBeLessThanOrEqual(2);

      const grant = new GrantPage(page);
      await grant.goto(grantId);
      await expect.poll(() => grant.summary.factIds()).toHaveLength(5);
      expect((await grant.summary.stripBox()).bottom).toBeLessThanOrEqual(450);
      expect(await grant.summary.rowCount()).toBeLessThanOrEqual(2);
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F11: at 390×844 the strip is two columns wide and ends above the bottom bar', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const { sourceId, grantId } = await seed(page, cleanup, testPrefix);
      await page.setViewportSize({ width: 390, height: 844 });
      await mockPaperlessConfigured(page);
      const shell = new AppShellPage(page);

      const source = new FundingSourcePage(page);
      await source.goto(sourceId);
      await expect(shell.bottomBar).toBeVisible();
      await expect.poll(() => source.summary.factIds()).toHaveLength(7);
      const barTop = (await shell.bottomBar.boundingBox())!.y;
      expect((await source.summary.stripBox()).bottom).toBeLessThanOrEqual(barTop);
      expect(await source.summary.columnCount()).toBe(2);

      const grant = new GrantPage(page);
      await grant.goto(grantId);
      await expect.poll(() => grant.summary.factIds()).toHaveLength(5);
      expect((await grant.summary.stripBox()).bottom).toBeLessThanOrEqual(barTop);
      expect(await grant.summary.columnCount()).toBe(2);
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F11: no horizontal overflow down to 320 px on Financing, a source and a grant', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const { sourceId, grantId } = await seed(page, cleanup, testPrefix);
      await page.setViewportSize({ width: 320, height: 700 });
      await mockPaperlessConfigured(page);

      const financing = new FinancingPage(page);
      await financing.goto();
      await expect(financing.sourceCard(sourceId)).toBeVisible();
      await expect(financing.grantCard(grantId)).toBeVisible();
      expect(await hasSidewaysScroll(page), 'Financing').toBe(false);

      const source = new FundingSourcePage(page);
      await source.goto(sourceId);
      await expect.poll(() => source.summary.factIds()).toHaveLength(7);
      expect(await hasSidewaysScroll(page), 'Funding source').toBe(false);

      const grant = new GrantPage(page);
      await grant.goto(grantId);
      await expect.poll(() => grant.summary.factIds()).toHaveLength(5);
      expect(await hasSidewaysScroll(page), 'Grant').toBe(false);
    } finally {
      await runCleanup(cleanup);
    }
  });
});

test.describe('Financing touch targets and dark mode', { tag: '@responsive' }, () => {
  test('F12: Add buttons, the card ⋯, Documents and Link are 44 px on touch widths', async ({
    page,
    testPrefix,
  }) => {
    const width = page.viewportSize()?.width ?? 1440;
    test.skip(width >= 1024, 'the 44 px rule is for touch layouts');
    const cleanup = newCleanup();
    try {
      const { sourceId, grantId } = await seed(page, cleanup, testPrefix);
      await mockPaperlessConfigured(page);
      const financing = new FinancingPage(page);
      await financing.goto();

      await expectTarget(financing.addSource, 'Add funding source');
      await expectTarget(financing.addGrant, 'Add grant');
      await expectTarget(financing.cardMenu(sourceId), 'card ⋯');
      await expectTarget(financing.docsButton(sourceId), 'Documents (n)');
      await expectTarget(financing.docsLink(sourceId), 'Link');
      await expectTarget(financing.grantDocsButton(grantId), 'grant Documents (n)');
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F12: the chip remove and Move lines… are 44 px on touch widths', async ({
    page,
    testPrefix,
  }) => {
    const width = page.viewportSize()?.width ?? 1440;
    test.skip(width >= 1024, 'the 44 px rule is for touch layouts');
    const cleanup = newCleanup();
    try {
      // Move lines…: a savings source used beyond its amount
      const overId = await createSource(page, cleanup, {
        name: `${testPrefix} F12 Overdrawn`,
        sourceType: 'savings',
        totalAmount: 1000,
      });
      const overTask = await createTask(page, cleanup, `${testPrefix} F12 Overrun Task`);
      await createCostLine(page, {
        kind: 'work_item',
        hostId: overTask,
        budgetSourceId: overId,
        description: 'F12 line over the source',
        plannedAmount: 1250,
        includesVat: true,
      });
      const source = new FundingSourcePage(page);
      await source.goto(overId);
      await expectTarget(source.moveLines, 'Move lines…');

      // The chip remove of the New grant dialog
      const financing = new FinancingPage(page);
      const dialog = new FinancingFormDialog(page, 'grant');
      await financing.goto();
      await financing.addGrant.click();
      await dialog.waitForOpen();
      await dialog.settled();
      await dialog.pickItems([`${testPrefix} F12 Overrun Task`]);
      await expectTarget(
        dialog.itemChips.getByRole('button', { name: /^Remove / }).first(),
        'chip remove',
      );
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('F12: dark mode renders Financing, a source and a grant legibly', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const { sourceId, grantId } = await seed(page, cleanup, testPrefix);
      const financing = new FinancingPage(page);
      await financing.goto();
      await enableDarkTheme(page);
      await expectLegibleInDark(financing.sourceCard(sourceId).getByRole('heading', { level: 3 }));
      await expectLegibleInDark(financing.grantCard(grantId).getByRole('heading', { level: 3 }));

      const source = new FundingSourcePage(page);
      await source.goto(sourceId);
      await enableDarkTheme(page);
      await expectLegibleInDark(source.heading);
      await expectLegibleInDark(source.summary.fact('amount'));

      const grant = new GrantPage(page);
      await grant.goto(grantId);
      await enableDarkTheme(page);
      await expectLegibleInDark(grant.heading);
      await expectLegibleInDark(grant.summary.fact('expected'));
    } finally {
      await runCleanup(cleanup);
    }
  });
});
