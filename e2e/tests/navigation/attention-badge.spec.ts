/**
 * E2E attention badge (Story #2231 / EPIC-21, P3.4)
 *
 * One shell-level attention state feeds the desktop bell (and its popover), the bottom bar's
 * Home slot, Home's Needs-attention heading and Home's tab title `(n) Home · <house>`.
 * The badge shows the server's `count` only (tidy-up rows and standing figures never count).
 *
 * Counts come from invented data served through `page.route` (fixtures/homeMocks.ts), because
 * the shared E2E database holds attention rows of other specs. Scenario 13 is the one real-data
 * check. Synthetic data only.
 *
 * Scenarios
 * 1  (AC1, desktop)    bell name/badge, popover rows equal Home's rows, h2 focus, Escape
 * 2  (AC1, desktop)    "Open Home" from another page lands on Home and closes the panel
 * 3  (desktop)         "Open Home" on Home closes the panel and focuses the Needs-attention h2
 * 4  (AC3, desktop)    Not now in the popover updates badge, heading and title; Undo restores
 * 5  (desktop)         a row's status menu works inside the popover (panel stays open)
 * 6  (desktop)         Discard's confirm dialog stacks above the panel
 * 7  (desktop)         an outside press closes the panel
 * 8  (desktop)         a failed load shows no badge, the panel offers "Try again"
 * 9  (AC4, all)        tidy-up rows and standing figures do not count
 * 10 (all)             99+ cap with exact names, heading and title
 * 11 (all)             zero: no badge, no title prefix
 * 12 (AC2/AC3, compact) Home slot badge, heading and title agree; no bell
 * 13 (AC2, desktop)    real data: one synthetic late task shows in bell name, visible pill, heading and title
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/isolatedUser.js';
import {
  attentionResponse,
  dayOffset,
  installHomeMocks,
  lateTaskRow,
  newHomeMockState,
  setupResponse,
  unfinishedLogRow,
} from '../../fixtures/homeMocks.js';
import type { HomeMockState } from '../../fixtures/homeMocks.js';
import { createWorkItemViaApi, deleteWorkItemViaApi } from '../../fixtures/apiHelpers.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { HomePage } from '../../pages/HomePage.js';
import { StatusMenuControl } from '../../pages/components/StatusMenuControl.js';
import { ToastRegion } from '../../pages/components/ToastRegion.js';

test.use({
  isolatedUserPerWorker: { emailPrefix: 'attn-badge', displayName: 'E2E Attention User' },
});

function isCompact(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1440) < 1024;
}

function tasks(count: number, prefix = 'late') {
  return Array.from({ length: count }, (_, i) =>
    lateTaskRow({ id: `${prefix}-${i + 1}`, title: `Mock task ${prefix} ${i + 1}` }),
  );
}

test.beforeEach(async ({ page }) => {
  // Home's one-time "What moved where" notice must not sit in the way
  const patch = await page.request.patch('/api/users/me/preferences', {
    data: { key: 'home.movedNoticeSeen', value: 'true' },
  });
  expect(patch.ok()).toBeTruthy();
  const locale = await page.request.patch('/api/users/me/preferences', {
    data: { key: 'locale', value: 'en' },
  });
  expect(locale.ok()).toBeTruthy();
});

async function openHome(
  page: Page,
  state: HomeMockState,
): Promise<{ home: HomePage; shell: AppShellPage }> {
  await installHomeMocks(page, state);
  const home = new HomePage(page);
  await home.goto();
  return { home, shell: new AppShellPage(page) };
}

async function listKeys(rows: ReturnType<Page['locator']>, prefix: string): Promise<string[]> {
  return rows.evaluateAll(
    (els, p) => els.map((el) => (el.getAttribute('data-testid') ?? '').replace(p, '')),
    prefix,
  );
}

test.describe('Attention badge: desktop bell and popover', { tag: '@responsive' }, () => {
  test.beforeEach(({ page }) => {
    test.skip(isCompact(page), 'The bell is desktop only (>= 1024px)');
  });

  test('1 (AC1): the bell shows the count, its popover lists Home’s rows and Escape returns to the bell', async ({
    page,
  }) => {
    const rows = tasks(3);
    const { home, shell } = await openHome(
      page,
      newHomeMockState({ attention: attentionResponse({ rows }) }),
    );

    await expect(shell.attentionBell).toHaveAccessibleName('Needs attention, 3');
    await expect(shell.attentionBell).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(shell.attentionBell).toHaveAttribute('aria-expanded', 'false');
    await expect(shell.attentionBadge).toHaveText('3');
    await expect(shell.attentionPanel).toHaveCount(0);

    await shell.attentionBell.click();
    await expect(shell.attentionBell).toHaveAttribute('aria-expanded', 'true');
    const panel = page.getByRole('dialog', { name: 'Needs attention' });
    await expect(panel).toBeVisible();
    await expect(shell.attentionPanel).toBeVisible();
    await expect(panel.getByRole('heading', { level: 2, name: /^Needs attention/ })).toBeFocused();
    await expect(panel).toContainText('(3)');

    await expect(shell.attentionPanelRows()).toHaveCount(3);
    const bellKeys = await listKeys(shell.attentionPanelRows(), 'bell-attention-row-');
    const homeKeys = await listKeys(home.rows(), 'needs-attention-row-');
    expect(bellKeys).toEqual(rows.map((r) => r.key));
    expect(bellKeys).toEqual(homeKeys);

    await page.keyboard.press('Escape');
    await expect(shell.attentionPanel).toHaveCount(0);
    await expect(shell.attentionBell).toBeFocused();
    await expect(shell.attentionBell).toHaveAttribute('aria-expanded', 'false');
  });

  test('2 (AC1): "Open Home" from another page goes to Home and closes the panel', async ({
    page,
  }) => {
    const rows = tasks(2);
    const state = newHomeMockState({ attention: attentionResponse({ rows }) });
    await installHomeMocks(page, state);
    await page.goto(routeUrl('scheduleGantt'));
    const shell = new AppShellPage(page);
    await expect(shell.attentionBell).toHaveAccessibleName('Needs attention, 2');

    await shell.attentionBell.click();
    await expect(shell.attentionPanel).toBeVisible();
    await shell.openHomeLink.click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Home', exact: true })).toBeVisible();
    await expect(shell.attentionPanel).toHaveCount(0);
  });

  test('3: "Open Home" on Home closes the panel and focuses the Needs-attention heading', async ({
    page,
  }) => {
    const { home, shell } = await openHome(
      page,
      newHomeMockState({ attention: attentionResponse({ rows: tasks(2) }) }),
    );
    await shell.attentionBell.click();
    await expect(shell.attentionPanel).toBeVisible();
    await shell.openHomeLink.click();

    await expect(shell.attentionPanel).toHaveCount(0);
    await expect(home.needsAttentionHeading).toBeFocused();
  });

  test('4 (AC3): Not now in the popover updates badge, heading and title; Undo restores all three', async ({
    page,
  }) => {
    const rows = tasks(3);
    // The mocks remove rows from this array in place, so keep the keys up front
    const keys = rows.map((r) => r.key);
    const state = newHomeMockState({ attention: attentionResponse({ rows }) });
    const { home, shell } = await openHome(page, state);
    const toast = new ToastRegion(page);

    await expect(shell.attentionBadge).toHaveText('3');
    await expect(home.needsAttentionHeading).toContainText('(3)');
    await expect(page).toHaveTitle(/^\(3\) Home · /);

    await shell.attentionBell.click();
    await expect(shell.attentionPanelRows()).toHaveCount(3);
    await page.getByTestId(`bell-attention-row-${keys[1]!}-not-now`).click();

    expect(state.calls.notNow).toEqual([keys[1]!]);
    await expect(shell.attentionBadge).toHaveText('2');
    await expect(shell.attentionBell).toHaveAccessibleName('Needs attention, 2');
    await expect(home.needsAttentionHeading).toContainText('(2)');
    await expect(page).toHaveTitle(/^\(2\) Home · /);

    await expect(toast.undoToast).toBeVisible();
    await toast.undoButton.click();
    // The panel stays open while Undo is used
    await expect(shell.attentionPanel).toBeVisible();
    await expect(shell.attentionBadge).toHaveText('3');
    await expect(home.needsAttentionHeading).toContainText('(3)');
    await expect(page).toHaveTitle(/^\(3\) Home · /);
    await expect(shell.attentionPanelRows()).toHaveCount(3);
  });

  test('5: a row’s status menu works inside the popover and the badge decrements', async ({
    page,
  }) => {
    const rows = tasks(2);
    const first = rows[0]!;
    const state = newHomeMockState({ attention: attentionResponse({ rows }) });
    const { shell } = await openHome(page, state);

    await shell.attentionBell.click();
    await expect(shell.attentionPanelRows()).toHaveCount(2);

    const control = new StatusMenuControl(page, `bell-attention-row-${first.key}-mark_done`);
    await control.actionToday();

    await expect(shell.attentionPanelRow(first.key)).toHaveCount(0);
    expect(state.calls.workItemPatches).toEqual([
      { id: first.subject.id, body: { status: 'completed', actualEndDate: dayOffset(0) } },
    ]);
    await expect(shell.attentionPanel).toBeVisible();
    await expect(shell.attentionBadge).toHaveText('1');
  });

  test('5b: Escape in a row’s status menu closes only the menu, the panel stays', async ({
    page,
  }) => {
    const rows = tasks(2);
    const { shell } = await openHome(
      page,
      newHomeMockState({ attention: attentionResponse({ rows }) }),
    );
    await shell.attentionBell.click();
    const control = new StatusMenuControl(page, `bell-attention-row-${rows[0]!.key}-mark_done`);
    await control.open();
    await page.keyboard.press('Escape');
    await control.waitForClosed();
    await expect(shell.attentionPanel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(shell.attentionPanel).toHaveCount(0);
  });

  test('6: the Discard confirmation opens above the panel and can be used', async ({ page }) => {
    // A log draft is a tidy-up chore on Home; placing it in `rows` lets the popover render it
    const draft = unfinishedLogRow({ id: 'draft-bell-1', title: 'Mock draft log' });
    const { shell } = await openHome(
      page,
      newHomeMockState({ attention: attentionResponse({ rows: [draft] }) }),
    );
    await shell.attentionBell.click();
    await page.getByTestId(`bell-attention-row-${draft.key}-discard`).click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    // Clickable without force: the dialog is not covered by the panel
    await page.getByTestId('bell-attention-discard-cancel').click({ trial: true });
    await page.getByTestId('bell-attention-discard-cancel').click();
    await expect(dialog).toBeHidden();
    await expect(shell.attentionPanel).toBeVisible();
  });

  test('7: pressing outside closes the panel', async ({ page }) => {
    const { home, shell } = await openHome(
      page,
      newHomeMockState({ attention: attentionResponse({ rows: tasks(2) }) }),
    );
    await shell.attentionBell.click();
    await expect(shell.attentionPanel).toBeVisible();
    await home.heading.click();
    await expect(shell.attentionPanel).toHaveCount(0);
    await expect(shell.attentionBell).toHaveAttribute('aria-expanded', 'false');
  });

  test('8: a failed load shows no badge; the panel says so and Try again loads the rows', async ({
    page,
  }) => {
    const rows = tasks(2);
    const state = newHomeMockState({ attention: attentionResponse({ rows }) });
    state.fail.attention = true;
    const { shell } = await openHome(page, state);

    await expect(shell.attentionBell).toHaveAccessibleName('Needs attention');
    await expect(shell.attentionBadge).toHaveCount(0);

    await shell.attentionBell.click();
    await expect(shell.attentionPanel).toContainText("Couldn't load Needs attention.");

    state.fail.attention = false;
    await page.getByTestId('top-bar-attention-retry').click();
    await expect(shell.attentionPanelRows()).toHaveCount(2);
    await expect(shell.attentionBadge).toHaveText('2');
  });

  test('13: real data: a late task shows in the bell, the Home heading and the title', async ({
    page,
    testPrefix,
  }) => {
    const workItemId = await createWorkItemViaApi(page, {
      title: `${testPrefix} E2E late task`,
      status: 'not_started',
      startDate: dayOffset(-3),
      endDate: dayOffset(-1),
    });
    try {
      // A fresh shared database can be in set-up mode (a checklist replaces the sections)
      await page.route('**/api/home/setup', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(setupResponse(['house', 'areas', 'funding', 'companies', 'tasks'])),
        }),
      );
      const home = new HomePage(page);
      const shell = new AppShellPage(page);
      await home.goto();
      await expect(shell.attentionBell).toHaveAccessibleName(/^Needs attention, \d+$/);
      const name = (await shell.attentionBell.getAttribute('aria-label')) ?? '';
      const n = Number(name.replace('Needs attention, ', ''));
      expect(n).toBeGreaterThanOrEqual(1);
      // AC2: the visible pill text equals the exact count (99+ above 99)
      await expect(shell.attentionBadge).toHaveText(n > 99 ? '99+' : String(n));
      await expect(home.needsAttentionHeading).toContainText(`(${n})`);
      await expect(page).toHaveTitle(new RegExp(`^\\(${n}\\) Home · `));
    } finally {
      await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

test.describe('Attention badge: every viewport', { tag: '@responsive' }, () => {
  test('9 (AC4): tidy-up rows and standing figures do not count', async ({ page }) => {
    const rows = tasks(1);
    const state = newHomeMockState({
      attention: attentionResponse({
        rows,
        tidyUp: [1, 2, 3].map((i) =>
          unfinishedLogRow({ id: `tidy-${i}`, title: `Mock tidy ${i}` }),
        ),
        standing: [
          {
            key: 'S1:budget_source:src-1',
            rule: 'S1',
            subject: { type: 'budget_source', id: 'src-1', label: 'Mock source', area: null },
            amount: 1000,
            params: { rule: 'S1', allocated: 1000, sourceAmount: 2000 },
            link: { route: 'budgetSources', params: {}, query: {} },
          },
        ],
      }),
    });
    const { shell } = await openHome(page, state);

    await expect(shell.shellBadge()).toHaveText('1');
    await expect(page).toHaveTitle(/^\(1\) Home · /);
    if (!isCompact(page)) {
      await shell.attentionBell.click();
      await expect(shell.attentionPanelRows()).toHaveCount(1);
      await expect(shell.attentionPanelRow(rows[0]!.key)).toBeVisible();
    }
  });

  test('10: above 99 the badge reads 99+, names and heading keep the exact count', async ({
    page,
  }) => {
    const state = newHomeMockState({
      attention: attentionResponse({ rows: tasks(9), count: 120 }),
    });
    const { home, shell } = await openHome(page, state);

    await expect(shell.shellBadge()).toHaveText('99+');
    if (isCompact(page)) {
      await expect(shell.bottomBarSlot('home')).toHaveAccessibleName('Home, 120 need attention');
    } else {
      await expect(shell.attentionBell).toHaveAccessibleName('Needs attention, 120');
    }
    await expect(home.needsAttentionHeading).toContainText('(120)');
    await expect(page).toHaveTitle(/^\(120\) Home · /);
  });

  test('11: with nothing to do there is no badge and no title prefix', async ({ page }) => {
    const { shell } = await openHome(page, newHomeMockState({ attention: attentionResponse() }));

    await expect(page).toHaveTitle(/^Home · /);
    await expect(shell.homeSlotBadge).toHaveCount(0);
    await expect(shell.attentionBadge).toHaveCount(0);
    if (isCompact(page)) {
      await expect(shell.bottomBarSlot('home')).not.toHaveAttribute('aria-label', /.+/);
    } else {
      await expect(shell.attentionBell).toHaveAccessibleName('Needs attention');
    }
  });
});

test.describe('Attention badge: phone and tablet', { tag: '@responsive' }, () => {
  test('12 (AC2, AC3): the Home slot badge, the heading and the title agree; there is no bell', async ({
    page,
  }) => {
    test.skip(!isCompact(page), 'Compact layouts only (< 1024px)');
    const { home, shell } = await openHome(
      page,
      newHomeMockState({ attention: attentionResponse({ rows: tasks(3) }) }),
    );

    await expect(shell.homeSlotBadge).toHaveText('3');
    await expect(shell.bottomBarSlot('home')).toHaveAccessibleName('Home, 3 need attention');
    await expect(home.needsAttentionHeading).toContainText('(3)');
    await expect(page).toHaveTitle(/^\(3\) Home · /);
    await expect(shell.attentionBell).toHaveCount(0);
  });
});
