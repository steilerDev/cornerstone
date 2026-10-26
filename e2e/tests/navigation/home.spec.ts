/**
 * E2E tests for Home (`/`, #2230, EPIC-21 P3.3). Replaces the dashboard spec.
 *
 * Home reads aggregates of the whole (shared) E2E database, so every assertion runs against
 * invented data served through `page.route` (see fixtures/homeMocks.ts); only the preference
 * rows are real, and they belong to a dedicated user (isolatedUser fixture). Synthetic data only.
 *
 * Scenarios
 * H1   Frame: one column, h1 "Home", "house name · date" line, page menu (Customize, What moved
 *      where) [smoke]
 * H1b  D-04: no horizontal overflow from 320 to 1440 px with long content
 * H2   Needs attention: 8 rows + "Show all (10)" / "Show fewer"; D-02: every row is reachable
 * H3   Not now: POST, row leaves, focus moves on, hint, Undo (DELETE, encoded key)
 * H4   Mark done with Today and Undo; with a picked date
 * H5   Catch-up line at 4 late tasks and its dialog: Start, Mark done with a date, Reschedule,
 *      Not now + Undo, Close focus, "All caught up."
 * H6   Tidy up: collapsible, truly hidden when collapsed, persists, not part of the count
 * H7   This week: critical line first, days, no repeats, Next 14 days, Open schedule,
 *      D-01 milestone link opens the milestone page, empty state
 * H8   Pulse: exactly three tiles, verdict / no-verdict states, links; figures equal the linked pages
 * H9   Latest from the site: three people-written entries, "Site diary"
 * H10  Footer: All activity -> History
 * H11  Set up your build: fresh instance checklist, member steps, Skip setup
 * H12  Phone / tablet: "Where are you?" chips and the last log; absent on desktop
 * H13  Customize: hide-only, persists; old dashboard preference is ignored
 * H14  Moved notice: once
 * H15  Reschedule link goes to the task's Constraints section
 * H16  Legacy URLs land on / in one hop
 * H17  Dark mode
 * H18  German
 * H19  Section failures are isolated (retry)
 */

import { InvoicesPage } from '../../pages/InvoicesPage.js';
import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/isolatedUser.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import {
  agendaItem,
  attentionResponse,
  criticalLine,
  dayOffset,
  endedTaskRow,
  installHomeMocks,
  lateStartGroupRow,
  lateTaskRow,
  milestoneRow,
  mockArea,
  mockHomeDiaryEntry,
  newHomeMockState,
  overdueInvoiceRow,
  pulseResponse,
  setupResponse,
  unfinishedLogRow,
  weekResponse,
} from '../../fixtures/homeMocks.js';
import type { HomeMockState } from '../../fixtures/homeMocks.js';
import {
  createMilestoneViaApi,
  createWorkItemViaApi,
  deleteMilestoneViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { installRouteLog, readRouteLog } from '../../fixtures/routeLog.js';
import { HomePage } from '../../pages/HomePage.js';
import { MilestoneDetailPage } from '../../pages/MilestoneDetailPage.js';
import { ToastRegion } from '../../pages/components/ToastRegion.js';

const HELP_URL = 'https://cornerstone.steiler.dev/guides/home/what-moved-where';

test.use({
  isolatedUserPerWorker: { emailPrefix: 'home', displayName: 'E2E Home User' },
});

/** Reset this worker's dedicated user to a clean Home: English, nothing hidden, notice seen. */
async function resetPreferences(page: Page, opts: { noticeSeen?: boolean } = {}): Promise<void> {
  const patch = async (key: string, value: string) => {
    const response = await page.request.patch('/api/users/me/preferences', {
      data: { key, value },
    });
    expect(response.ok(), `reset ${key}: ${response.status()}`).toBeTruthy();
  };
  await patch('locale', 'en');
  await patch('home.hiddenSections', '[]');
  await patch('home.collapsedSections', '[]');
  await page.request.delete('/api/users/me/preferences/home.setupDismissed');
  await page.request.delete('/api/users/me/preferences/dashboard.hiddenCards');
  if (opts.noticeSeen === false) {
    await page.request.delete('/api/users/me/preferences/home.movedNoticeSeen');
  } else {
    await patch('home.movedNoticeSeen', 'true');
  }
}

async function readPreference(page: Page, key: string): Promise<string | undefined> {
  const response = await page.request.get('/api/users/me/preferences');
  const body = (await response.json()) as { preferences: Array<{ key: string; value: string }> };
  return body.preferences.find((p) => p.key === key)?.value;
}

test.beforeEach(async ({ page }) => {
  await resetPreferences(page);
});

/** Open Home with the given mocks installed first. */
async function openHome(page: Page, state: HomeMockState): Promise<HomePage> {
  await installHomeMocks(page, state);
  const home = new HomePage(page);
  await home.goto();
  return home;
}

function isCompact(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1440) < 1024;
}

function tasks(count: number, prefix = 'late') {
  return Array.from({ length: count }, (_, i) =>
    lateTaskRow({ id: `${prefix}-${i + 1}`, title: `Mock task ${prefix} ${i + 1}` }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// H1 Frame
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Home frame (H1)', { tag: '@responsive' }, () => {
  test(
    'H1: one column under h1 "Home", house name and date line, page menu',
    { tag: '@smoke' },
    async ({ page }) => {
      const state = newHomeMockState({
        attention: attentionResponse({
          rows: tasks(1),
          tidyUp: [endedTaskRow({ id: 'ended-1', title: 'Mock ended task' })],
        }),
        week: weekResponse([agendaItem({ id: 'w1', kind: 'starts', date: dayOffset(0) })]),
        diary: [mockHomeDiaryEntry({ id: 'd1', title: 'Mock latest entry' })],
      });
      const home = await openHome(page, state);

      await expect(home.heading).toHaveCount(1);
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('home'));
      await expect(home.root.getByText(/^Mock House · /)).toBeVisible();

      // The sections in order, h2 each
      await expect(home.sectionHeading('Needs attention (1)')).toBeVisible();
      await expect(home.sectionHeading(/^Tidy up/)).toBeVisible();
      await expect(home.sectionHeading('This week')).toBeVisible();
      await expect(home.sectionHeading('Pulse')).toBeVisible();
      await expect(home.sectionHeading('Latest from the site')).toBeVisible();
      await expect(home.pulseTiles()).toHaveCount(3);
      const order = await page
        .locator('main section[data-testid^="home-"]')
        .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
      expect(order.filter((id) => !id?.startsWith('home-week-day-'))).toEqual([
        'home-needs-attention',
        'home-tidy-up',
        'home-this-week',
        'home-pulse',
        'home-latest',
      ]);

      // One column: every section shares the left edge; from desktop the column is capped
      const boxes = await Promise.all(
        [home.needsAttention, home.thisWeek, home.pulse, home.latest].map((l) => l.boundingBox()),
      );
      const lefts = boxes.map((b) => Math.round(b?.x ?? -1));
      expect(new Set(lefts).size, `section left edges ${lefts.join(',')}`).toBe(1);
      const widths = boxes.map((b) => b?.width ?? 0);
      expect(Math.max(...widths)).toBeLessThanOrEqual(880 + 1);

      // The page menu
      await home.openPageMenu();
      await expect(home.customizeItem).toHaveText('Customize…');
      await expect(home.whatMovedLink).toHaveAttribute('target', '_blank');
      await expect(home.whatMovedLink).toHaveAttribute('href', HELP_URL);
      await expect(home.whatMovedLink).toContainText('What moved where');
      await page.keyboard.press('Escape');
      await expect(home.customizeItem).toBeHidden();
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// H1b D-04
// ─────────────────────────────────────────────────────────────────────────────

const LONG = (prefix: string) => `${prefix}${'x'.repeat(120 - prefix.length)}`;

test.describe('Home does not overflow (H1b, D-04)', () => {
  test('D-04: page and sections fit from 320 to 1440 px with long content', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Widths are set explicitly; run once.');
    const area = mockArea('area-long', LONG('Area'), [{ id: 'area-root', name: LONG('Root') }]);
    const state = newHomeMockState({
      houseName: LONG('House'),
      attention: attentionResponse({
        rows: [
          lateTaskRow({ id: 'long-1', title: LONG('Task'), area }),
          overdueInvoiceRow({
            id: 'long-inv',
            title: `INV-${'9'.repeat(36)}`,
            amount: 9999999999.99,
            companyName: LONG('Company'),
          }),
          milestoneRow({ id: 'long-ms', title: LONG('Milestone') }),
        ],
        tidyUp: [unfinishedLogRow({ id: 'long-draft', title: LONG('Draft') })],
        criticalLine: criticalLine({ label: LONG('Critical'), area }),
      }),
      week: weekResponse([
        agendaItem({
          id: 'long-w',
          kind: 'payment',
          date: dayOffset(1),
          amount: 9999999999.99,
          companyName: LONG('Vendor'),
        }),
      ]),
      pulse: pulseResponse({
        leftToSpend: {
          expected: 9999999999.99,
          worst: -9999999999.99,
          best: 9999999999.99,
          verdict: 'on_budget',
        },
        stillToPay: 9999999999.99,
        stillToPayCount: 12345,
        progress: { total: 99999, done: 88888, inProgress: 7777 },
      }),
      diary: [mockHomeDiaryEntry({ id: 'long-d', title: LONG('Diary'), photoAreas: [area] })],
    });
    await installHomeMocks(page, state);
    const home = new HomePage(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await home.goto();
    await home.waitForSectionsLoaded();
    await expect(home.pulseTiles()).toHaveCount(3);

    for (const width of [1440, 1024, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() => home.hasHorizontalOverflow(), { message: `horizontal overflow at ${width}px` })
        .toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H2 Needs attention
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Needs attention (H2 - H5)', { tag: '@responsive' }, () => {
  test('D-02: eight rows, "Show all (10)" reveals every row, "Show fewer" returns', async ({
    page,
  }) => {
    const rows = tasks(10);
    const home = await openHome(page, newHomeMockState({ attention: attentionResponse({ rows }) }));

    await expect(home.sectionHeading('Needs attention (10)')).toBeVisible();
    await expect(home.rows()).toHaveCount(8);
    await expect(home.showAllButton).toHaveText('Show all (10)');
    await expect(home.showAllButton).toHaveAttribute('aria-expanded', 'false');
    // Tier labels are text, not colour alone
    await expect(home.row(rows[0]!.key).getByText('Late', { exact: true })).toBeVisible();

    await home.showAllButton.click();
    await expect(home.rows()).toHaveCount(10);
    await expect(home.showAllButton).toHaveText('Show fewer');
    await expect(home.showAllButton).toBeFocused();
    // D-02: no sampling, every mocked row is reachable with its own link
    for (const row of rows) {
      await expect(home.rowLink(row.key)).toHaveAttribute(
        'href',
        routeUrl('workItem', { id: row.subject.id }),
      );
    }

    await home.showAllButton.click();
    await expect(home.rows()).toHaveCount(8);
    await expect(home.showAllButton).toHaveText('Show all (10)');
    await expect(home.showAllButton).toBeFocused();
  });

  test('Needs attention shows an empty state and one failing section can be retried', async ({
    page,
  }) => {
    const state = newHomeMockState({ attention: attentionResponse(), diary: [] });
    state.fail.attention = true;
    const home = await openHome(page, state);
    await expect(home.needsAttention.getByText("Couldn't load Needs attention.")).toBeVisible();
    // The other sections still render
    await expect(home.pulseTiles()).toHaveCount(3);
    state.fail.attention = false;
    await home.needsAttention.getByRole('button', { name: 'Try again' }).click();
    await expect(home.needsAttention.getByText('Nothing needs you right now.')).toBeVisible();
  });

  test('H3: Not now posts the key, moves focus to the next row and Undo brings the row back', async ({
    page,
  }) => {
    const rows = tasks(3);
    const [a, b, c] = rows as [(typeof rows)[0], (typeof rows)[0], (typeof rows)[0]];
    const state = newHomeMockState({ attention: attentionResponse({ rows }) });
    const home = await openHome(page, state);
    const toast = new ToastRegion(page);

    // The term hint: visible name stays "Not now", the hint is its description
    const notNow = home.rowNotNow(b.key);
    await expect(notNow).toHaveText('Not now');
    await expect(notNow).toHaveAttribute('title', 'Hides this row for 7 days.');
    await expect(notNow).toHaveAccessibleDescription('Hides this row for 7 days.');

    await notNow.click();
    await expect(home.row(b.key)).toHaveCount(0);
    expect(state.calls.notNow).toEqual([b.key]);
    await expect(home.rowLink(c.key)).toBeFocused();
    await expect(home.hiddenLine).toContainText('1 hidden for now');
    await expect(home.sectionHeading('Needs attention (2)')).toBeVisible();

    await expect(toast.undoToast).toContainText('Hidden for 7 days.');
    await toast.undoButton.click();
    await expect(home.row(b.key)).toBeVisible();
    expect(state.calls.undoNotNowPaths).toEqual([encodeURIComponent(b.key)]);
    await expect(home.rows()).toHaveCount(3);
    await expect(home.row(a.key)).toBeVisible();
    await expect(home.hiddenLine).toHaveCount(0);
  });

  test('H4: Mark done with Today sends the date, the row leaves and Undo restores it', async ({
    page,
  }) => {
    const rows = tasks(2);
    const [first, second] = rows as [(typeof rows)[0], (typeof rows)[0]];
    const state = newHomeMockState({ attention: attentionResponse({ rows }) });
    const home = await openHome(page, state);
    const toast = new ToastRegion(page);

    await home.rowStatus(first.key, 'mark_done').actionToday();
    await expect(home.row(first.key)).toHaveCount(0);
    expect(state.calls.workItemPatches).toEqual([
      { id: first.subject.id, body: { status: 'completed', actualEndDate: dayOffset(0) } },
    ]);
    await expect(toast.undoToast).toContainText(first.subject.label!);
    await expect(home.rowLink(second.key)).toBeFocused();

    await toast.undoButton.click();
    await expect(home.row(first.key)).toBeVisible();
    expect(state.calls.undone).toHaveLength(1);
  });

  test('H4b: Mark done with a picked date sends that date', async ({ page }) => {
    const rows = tasks(1);
    const state = newHomeMockState({ attention: attentionResponse({ rows }) });
    const home = await openHome(page, state);
    const picked = dayOffset(-1);

    await home.rowStatus(rows[0]!.key, 'mark_done').actionPickedDate(picked);
    await expect(home.row(rows[0]!.key)).toHaveCount(0);
    expect(state.calls.workItemPatches[0]?.body).toEqual({
      status: 'completed',
      actualEndDate: picked,
    });
    await expect(home.needsAttention.getByText('Nothing needs you right now.')).toBeVisible();
  });

  test('H5: the catch-up line and dialog act on late tasks one by one', async ({ page }) => {
    const n1a = lateTaskRow({ id: 'cu-1', title: 'Mock catch-up one' });
    const n1b = lateTaskRow({ id: 'cu-2', title: 'Mock catch-up two' });
    const group = lateStartGroupRow(dayOffset(-2), [
      { id: 'cu-3', label: 'Mock catch-up three' },
      { id: 'cu-4', label: 'Mock catch-up four' },
    ]);
    const state = newHomeMockState({
      attention: attentionResponse({ rows: [n1a, n1b, group] }),
    });
    const home = await openHome(page, state);

    await expect(home.catchUpLine).toContainText('4 tasks are late');
    await expect(home.reviewAllButton).toHaveText('Review all');
    await home.reviewAllButton.click();
    await expect(home.catchUpDialog).toBeVisible();
    await expect(home.catchUpDialog).toHaveAccessibleName('Late tasks (4)');
    await expect(home.rows('catch-up')).toHaveCount(4);

    // Start (Today) on a group member
    const member = 'N2:work_item:cu-3';
    await home.rowStatus(member, 'start', 'catch-up').actionToday();
    await expect(home.catchUpDialog).toHaveAccessibleName('Late tasks (3)');
    expect(state.calls.workItemPatches.at(-1)).toEqual({
      id: 'cu-3',
      body: { status: 'in_progress', actualStartDate: dayOffset(0) },
    });

    // Not now with Undo, inside the dialog
    await home.rowNotNow(n1b.key, 'catch-up').click();
    await expect(home.catchUpDialog).toHaveAccessibleName('Late tasks (2)');
    expect(state.calls.notNow).toEqual([n1b.key]);
    await new ToastRegion(page)
      .undoToastWith('Hidden for 7 days.')
      .getByTestId('toast-undo-button')
      .click();
    await expect(home.catchUpDialog).toHaveAccessibleName('Late tasks (3)');
    expect(state.calls.undoNotNowPaths).toEqual([encodeURIComponent(n1b.key)]);

    // Reschedule is a link to the task's Constraints
    await expect(home.rowReschedule(n1a.key, 'catch-up')).toHaveAttribute(
      'href',
      `${routeUrl('workItem', { id: 'cu-1' })}#constraints`,
    );

    // Close returns to "Review all"
    await home.catchUpClose.click();
    await expect(home.catchUpDialog).toBeHidden();
    await expect(home.reviewAllButton).toBeFocused();

    // Clear the rest with Mark done and a picked date
    await home.reviewAllButton.click();
    const picked = dayOffset(-1);
    await home.rowStatus(n1a.key, 'mark_done', 'catch-up').actionPickedDate(picked);
    expect(state.calls.workItemPatches.at(-1)?.body).toEqual({
      status: 'completed',
      actualEndDate: picked,
    });
    await home.rowStatus(n1b.key, 'mark_done', 'catch-up').actionToday();
    await home.rowStatus('N2:work_item:cu-4', 'start', 'catch-up').actionToday();
    await expect(home.catchUpDialog.getByText('All caught up.')).toBeVisible();
    await expect(home.catchUpDialog).toHaveAccessibleName('Late tasks (0)');
  });

  test('H5c: the Undo toast of an action inside the catch-up dialog can be clicked', async ({
    page,
  }) => {
    const rows = tasks(3, 'ut');
    const state = newHomeMockState({ attention: attentionResponse({ rows }) });
    const home = await openHome(page, state);
    await home.reviewAllButton.click();
    await home.rowNotNow(rows[0]!.key, 'catch-up').click();
    await expect(home.catchUpDialog).toHaveAccessibleName('Late tasks (2)');
    await new ToastRegion(page)
      .undoToastWith('Hidden for 7 days.')
      .getByTestId('toast-undo-button')
      .click({ timeout: 3000 });
    await expect(home.catchUpDialog).toHaveAccessibleName('Late tasks (3)');
  });

  test('H5e: the Undo toast is reachable with Tab while the catch-up dialog is open', async ({
    page,
  }) => {
    const rows = tasks(3, 'tb');
    const home = await openHome(page, newHomeMockState({ attention: attentionResponse({ rows }) }));
    await home.reviewAllButton.click();
    await home.rowNotNow(rows[0]!.key, 'catch-up').click();
    const undo = new ToastRegion(page)
      .undoToastWith('Hidden for 7 days.')
      .getByTestId('toast-undo-button');
    await expect(undo).toBeVisible();
    for (let i = 0; i < 25; i += 1) {
      if (await undo.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(undo).toBeFocused();
  });

  test('H5d: clearing every late task ends on "All caught up." with focus on Close', async ({
    page,
  }) => {
    const rows = tasks(3, 'cl');
    const state = newHomeMockState({ attention: attentionResponse({ rows }) });
    const home = await openHome(page, state);
    await home.reviewAllButton.click();
    for (const row of rows) {
      await home.rowStatus(row.key, 'mark_done', 'catch-up').actionToday();
    }
    await expect(home.catchUpDialog.getByText('All caught up.')).toBeVisible();
    await expect(home.catchUpClose).toBeFocused({ timeout: 3000 });
  });

  test('H5b: the Reschedule link in the dialog closes it and opens the task', async ({ page }) => {
    const rows = tasks(3, 'rs');
    const home = await openHome(page, newHomeMockState({ attention: attentionResponse({ rows }) }));
    await home.reviewAllButton.click();
    await home.rowReschedule(rows[0]!.key, 'catch-up').click();
    await expect(page).toHaveURL(
      (url) => url.pathname === routeUrl('workItem', { id: 'rs-1' }) && url.hash === '#constraints',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H6 Tidy up
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Tidy up (H6)', { tag: '@responsive' }, () => {
  test('H6: collapses to nothing visible, persists after reload and stays out of the count', async ({
    page,
  }) => {
    const state = newHomeMockState({
      attention: attentionResponse({
        rows: tasks(1),
        tidyUp: [
          unfinishedLogRow({ id: 'draft-1', title: 'Mock draft log' }),
          endedTaskRow({ id: 'ended-1', title: 'Mock ended task' }),
        ],
      }),
    });
    const home = await openHome(page, state);

    // The Needs attention count excludes Tidy up
    await expect(home.sectionHeading('Needs attention (1)')).toBeVisible();
    await expect(home.tidyToggle).toContainText('Tidy up');
    await expect(home.tidyToggle).toContainText('(2)');
    await expect(home.tidyToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(home.rows('tidy-up')).toHaveCount(2);

    const bodyId = await home.tidyBodyId();
    const body = page.locator(`#${bodyId}`);
    await home.tidyToggle.click();
    await expect(home.tidyToggle).toHaveAttribute('aria-expanded', 'false');
    // A real-browser check: the hidden attribute really removes the body from the page
    await expect(body).toBeHidden();
    await expect(body).toHaveCSS('display', 'none');
    await expect(home.rows('tidy-up').first()).toBeHidden();
    await expect.poll(() => readPreference(page, 'home.collapsedSections')).toBe('["tidy-up"]');

    await page.reload();
    await expect(home.tidyToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(`#${bodyId}`)).toBeHidden();

    await home.tidyToggle.click();
    await expect(home.rows('tidy-up')).toHaveCount(2);
  });

  test('H6b: Tidy up rows offer Continue and Discard, Discard asks first', async ({ page }) => {
    const state = newHomeMockState({
      attention: attentionResponse({
        tidyUp: [unfinishedLogRow({ id: 'draft-2', title: 'Mock draft log' })],
      }),
    });
    const home = await openHome(page, state);
    const key = 'H1:diary_entry:draft-2';
    await expect(page.getByTestId(`tidy-up-row-${key}-continue`)).toHaveAttribute(
      'href',
      routeUrl('diaryEntryEdit', { id: 'draft-2' }),
    );
    await page.getByTestId(`tidy-up-row-${key}-discard`).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Keep entry' }).click();
    await expect(dialog).toBeHidden();
    await expect(home.row(key, 'tidy-up')).toBeVisible();
  });

  test('H6c: Tidy up is not mounted without chores', async ({ page }) => {
    const home = await openHome(
      page,
      newHomeMockState({ attention: attentionResponse({ rows: tasks(1) }) }),
    );
    await expect(home.tidyUp).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H7 This week
// ─────────────────────────────────────────────────────────────────────────────

test.describe('This week (H7)', { tag: '@responsive' }, () => {
  test('H7: critical line first, day groups, no repeats, Next 14 days, Open schedule', async ({
    page,
  }) => {
    const dup = lateTaskRow({ id: 'dup-1', title: 'Mock duplicate task' });
    const state = newHomeMockState({
      attention: attentionResponse({ rows: [dup], criticalLine: criticalLine() }),
      week: weekResponse([
        agendaItem({
          id: 'dup-1',
          kind: 'ends',
          date: dayOffset(0),
          schedule: { isLate: false, lateDays: null, isHeldUp: false, isCritical: false },
        }),
        agendaItem({
          id: 'wk-today',
          kind: 'starts',
          date: dayOffset(0),
          schedule: { isLate: false, lateDays: null, isHeldUp: true, isCritical: true },
          heldUpBy: { id: 'cause-1', label: 'Mock cause task' },
        }),
        agendaItem({ id: 'wk-tomorrow', kind: 'delivery', date: dayOffset(1) }),
        agendaItem({
          id: 'wk-pay',
          kind: 'payment',
          date: dayOffset(3),
          amount: 480,
          recordKind: 'invoice',
          companyName: 'Mock Plumbing Ltd',
        }),
        agendaItem({ id: 'wk-later', kind: 'milestone', date: dayOffset(10) }),
      ]),
    });
    const home = await openHome(page, state);

    // The critical line leads
    await expect(home.criticalLine).toContainText('Critical path:');
    await expect(home.criticalLine).toContainText('Roof Trusses');
    await expect(home.criticalLine).toContainText('5 days left');
    await expect(home.criticalLine).toContainText('3 tasks on the critical path');
    const lineBox = await home.criticalLine.boundingBox();
    const firstDay = await home.weekDay(dayOffset(0)).boundingBox();
    expect(lineBox!.y).toBeLessThan(firstDay!.y);

    // Days, in order; today and tomorrow have their names
    await expect(home.weekDay(dayOffset(0)).getByRole('heading', { level: 3 })).toContainText(
      'Today',
    );
    await expect(home.weekDay(dayOffset(1)).getByRole('heading', { level: 3 })).toContainText(
      'Tomorrow',
    );
    await expect(home.weekItem('starts:work_item:wk-today')).toBeVisible();
    await expect(home.weekItem('starts:work_item:wk-today')).toContainText('Waits for');
    await expect(home.weekItem('starts:work_item:wk-today')).toContainText('Mock cause task');
    await expect(
      home.weekItem('starts:work_item:wk-today').getByText('Critical', { exact: true }),
    ).toBeVisible();
    await expect(home.weekItem('delivery:household_item:wk-tomorrow')).toBeVisible();
    await expect(home.weekItem('payment:invoice:wk-pay')).toContainText('480.00');
    // No repeats of an attention row
    await expect(home.weekItem('ends:work_item:dup-1')).toHaveCount(0);

    // Next 14 days
    await expect(home.next14Button).toHaveAttribute('aria-expanded', 'false');
    await expect(home.weekItem('milestone:milestone:wk-later')).toBeHidden();
    await home.next14Button.click();
    await expect(home.next14Button).toHaveAttribute('aria-expanded', 'true');
    await expect(home.weekItem('milestone:milestone:wk-later')).toBeVisible();

    await home.openScheduleLink.click();
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('scheduleGantt'));
  });

  test('D-01: a milestone in This week links to the milestone page, not a 404', async ({
    page,
    testPrefix,
  }) => {
    const title = `${testPrefix} Home Milestone`;
    const milestoneId = await createMilestoneViaApi(page, { title, targetDate: dayOffset(2) });
    try {
      const state = newHomeMockState({
        week: weekResponse([
          {
            ...agendaItem({ id: String(milestoneId), kind: 'milestone', date: dayOffset(2) }),
            subject: { type: 'milestone', id: String(milestoneId), label: title, area: null },
          },
        ]),
      });
      const home = await openHome(page, state);
      const link = home
        .weekItem(`milestone:milestone:${milestoneId}`)
        .getByRole('link', { name: title });
      await expect(link).toHaveAttribute('href', `/project/milestones/${milestoneId}`);
      await link.click();
      await page.waitForURL(new RegExp(`/project/milestones/${milestoneId}$`));
      const detail = new MilestoneDetailPage(page);
      await expect(detail.heading).toHaveText(title);
      await expect(detail.notFoundState).toHaveCount(0);
    } finally {
      await deleteMilestoneViaApi(page, milestoneId);
    }
  });

  test('H7b: nothing planned shows the empty state and keeps Open schedule', async ({ page }) => {
    const home = await openHome(page, newHomeMockState());
    await expect(home.thisWeek.getByText('Nothing is planned for the next 7 days.')).toBeVisible();
    await expect(home.openScheduleLink).toBeVisible();
    await expect(home.next14Button).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H8 Pulse
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Pulse (H8)', { tag: '@responsive' }, () => {
  test('H8: three tiles with figures, verdict badge and links', async ({ page }) => {
    const home = await openHome(page, newHomeMockState());
    await expect(home.pulseTiles()).toHaveCount(3);

    const left = home.pulseTile('left-to-spend');
    await expect(left).toContainText('Left to spend');
    await expect(left).toContainText('12,500.00');
    await expect(left).toContainText('On budget');
    await expect(left).toHaveAttribute('href', routeUrl('budgetOverview'));

    const toPay = home.pulseTile('still-to-pay');
    await expect(toPay).toContainText('3,400.50');
    await expect(toPay).toContainText('4 open invoices');
    await expect(toPay).toHaveAttribute('href', routeUrl('invoices'));

    const progress = home.pulseTile('progress');
    await expect(progress).toContainText('8 of 20 tasks done');
    await expect(progress).toContainText('3 in progress');
    await expect(progress).toHaveAttribute('href', routeUrl('workItems'));

    await toPay.click();
    await expect(page).toHaveURL(
      (url) => url.pathname === routeUrl('invoices') && url.search === '',
    );
  });

  test('H8b: over budget shows the verdict and a minus sign', async ({ page }) => {
    const state = newHomeMockState({
      pulse: pulseResponse({
        leftToSpend: { expected: -2300, worst: -9000, best: 500, verdict: 'over_budget' },
      }),
    });
    const home = await openHome(page, state);
    const left = home.pulseTile('left-to-spend');
    await expect(left).toContainText('Over budget');
    await expect(left.getByTestId('home-pulse-left-to-spend-figure')).toHaveText(
      /^[-−]\s?€?\s?2,300\.00|^[-−]?€2,300\.00/,
    );
    await expect(left.getByTestId('home-pulse-left-to-spend-figure')).toContainText('2,300.00');
  });

  test('H8c: no verdict yet shows a dash, the reason and a link to Funding sources', async ({
    page,
  }) => {
    const state = newHomeMockState({
      pulse: pulseResponse({
        leftToSpend: { expected: 0, worst: 0, best: 0, verdict: null },
        stillToPay: 0,
        stillToPayCount: 0,
        progress: { total: 0, done: 0, inProgress: 0 },
      }),
    });
    const home = await openHome(page, state);
    const left = home.pulseTile('left-to-spend');
    await expect(left.getByRole('img', { name: 'No figure yet' })).toHaveText('–');
    await expect(left).toContainText('Add a funding source and a cost to see this.');
    await expect(left).toHaveAttribute('href', routeUrl('budgetSources'));
    await expect(left).not.toContainText('On budget');
    await expect(left).not.toContainText('Over budget');
  });

  test('H8d: the Still to pay and Progress figures equal the pages they link to', async ({
    page,
  }) => {
    // Real data: other specs write to the shared database, so compare, and retry on a race.
    // A fresh database may still be in set-up mode; skipping the checklist shows the Pulse.
    const skip = await page.request.patch('/api/users/me/preferences', {
      data: { key: 'home.setupDismissed', value: 'true' },
    });
    expect(skip.ok()).toBeTruthy();
    const mismatches = async (): Promise<string[]> => {
      const out: string[] = [];
      const home = new HomePage(page);
      await home.goto();
      await expect(home.pulseTiles()).toHaveCount(3);
      const toPayText = (await home.pulseTile('still-to-pay').innerText()).replace(/\s+/g, ' ');
      const progressText = (await home.pulseTile('progress').innerText()).replace(/\s+/g, ' ');

      await home.pulseTile('still-to-pay').click();
      // The To pay footer carries the same Still to pay figure as the tile
      const footer = new InvoicesPage(page).footerFigure;
      await expect(footer).toBeVisible();
      const cardText = (await footer.innerText()).replace(/\s+/g, ' ');
      const amount = cardText.match(/[\d,]+\.\d{2}/)?.[0];
      if (!toPayText.includes(amount ?? '?')) out.push(`amount: ${toPayText} vs ${cardText}`);

      const tasks = await page.request.get('/api/work-items?pageSize=1');
      const total = ((await tasks.json()) as { pagination: { totalItems: number } }).pagination
        .totalItems;
      if (!progressText.includes(`of ${total} tasks done`))
        out.push(`tasks: ${progressText} vs ${total}`);
      return out;
    };
    let last: string[] = ['not run'];
    for (let attempt = 0; attempt < 4 && last.length > 0; attempt += 1) {
      last = await mismatches();
    }
    expect(last).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H9 - H10 Latest, footer
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Latest from the site and footer (H9, H10)', { tag: '@responsive' }, () => {
  test('H9: the last three people-written entries and the Site diary link', async ({ page }) => {
    const state = newHomeMockState({
      diary: [
        mockHomeDiaryEntry({ id: 'l1', title: 'Mock latest one' }),
        mockHomeDiaryEntry({ id: 'l2', title: 'Mock latest two' }),
        mockHomeDiaryEntry({ id: 'l3', title: 'Mock latest three' }),
        mockHomeDiaryEntry({ id: 'l4', title: 'Mock latest four' }),
        { ...mockHomeDiaryEntry({ id: 'sys', title: 'Mock system event' }), isAutomatic: true },
        mockHomeDiaryEntry({ id: 'dr', title: 'Mock draft', status: 'draft' }),
      ],
    });
    const home = await openHome(page, state);
    await expect(home.latestRows()).toHaveCount(3);
    await expect(home.latest).toContainText('Mock latest one');
    await expect(home.latest).not.toContainText('Mock latest four');
    await expect(home.latest).not.toContainText('Mock system event');
    await expect(home.latest).not.toContainText('Mock draft');
    const query = state.calls.diaryQueries.find((q) => q.includes('status=saved'));
    expect(query).toContain('automatic=false');
    expect(query).toContain('pageSize=3');

    await home.latestMoreLink.click();
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('diary'));
  });

  test('H9b: no entries shows the empty state with a Log today action', async ({ page }) => {
    const home = await openHome(page, newHomeMockState());
    await expect(home.latest.getByText('No entries yet.')).toBeVisible();
    await expect(home.latest.getByRole('link', { name: 'Log today' })).toBeVisible();
  });

  test('H10: the footer goes to History', async ({ page }) => {
    const home = await openHome(page, newHomeMockState());
    await expect(home.footerHistoryLink).toContainText('All activity');
    await expect(home.footerHistoryLink).toContainText('History');
    await home.footerHistoryLink.click();
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('history'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H11 Setup
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Set up your build (H11)', { tag: '@responsive' }, () => {
  test('H11: a fresh instance shows the checklist instead of the sections; Skip setup brings them back', async ({
    page,
  }) => {
    const state = newHomeMockState({ setup: setupResponse(['house', 'areas']) });
    const home = await openHome(page, state);

    await expect(home.setup).toBeVisible();
    await expect(home.sectionHeading(/^Set up your build/)).toContainText('(2 of 8 done)');
    await expect(home.setupRows()).toHaveCount(8);
    await expect(home.setupRows().first()).toContainText('Done:');
    await expect(home.setupRows().nth(2)).toContainText('To do:');
    await expect(home.setupStep('house')).toHaveAttribute(
      'href',
      `${routeUrl('settingsManage')}#house`,
    );
    await expect(home.needsAttention).toHaveCount(0);
    await expect(home.pulse).toHaveCount(0);
    await expect(home.footerHistoryLink).toBeVisible();

    await home.skipSetupButton.click();
    await expect(home.heading).toBeFocused();
    await expect(home.needsAttention).toBeVisible();
    await expect(home.setup).toHaveCount(0);
    await expect.poll(() => readPreference(page, 'home.setupDismissed')).toBe('true');

    await page.reload();
    await expect(home.needsAttention).toBeVisible();
  });

  test('H11b: a member sees six steps (no household, no backups)', async ({ page }) => {
    const state = newHomeMockState({
      setup: setupResponse(['house'], ['household', 'backups']),
    });
    const home = await openHome(page, state);
    await expect(home.setupRows()).toHaveCount(6);
    await expect(home.sectionHeading(/^Set up your build/)).toContainText('(1 of 6 done)');
    await expect(home.setupStep('household')).toHaveCount(0);
    await expect(home.setupStep('backups')).toHaveCount(0);
  });

  test('H11c: once steps 1 to 5 are done the sections show', async ({ page }) => {
    const home = await openHome(page, newHomeMockState());
    await expect(home.needsAttention).toBeVisible();
    await expect(home.setup).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H12 Phone and tablet chips
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Where are you? (H12)', { tag: '@responsive' }, () => {
  const kitchen = mockArea('area-kitchen', 'Kitchen', [
    { id: 'area-ground', name: 'Ground floor' },
  ]);
  const garden = mockArea('area-garden', 'Garden');

  function state(): HomeMockState {
    return newHomeMockState({
      diary: [
        mockHomeDiaryEntry({
          id: 'last-1',
          title: 'Mock last entry',
          photoCount: 2,
          photoAreas: [kitchen, garden],
        }),
        mockHomeDiaryEntry({ id: 'last-2', title: 'Mock older entry', photoAreas: [garden] }),
      ],
    });
  }

  test('H12: area chips lead to a photo in that area, "Other area" has none, the last log links to the entry', async ({
    page,
  }) => {
    test.skip(!isCompact(page), 'phone and tablet only');
    const home = await openHome(page, state());

    await expect(
      home.where.getByRole('heading', { level: 2, name: 'Where are you?' }),
    ).toBeVisible();
    await expect(home.whereChips()).toHaveCount(3);
    await expect(home.whereChip('area-kitchen')).toHaveText('Ground floor › Kitchen');
    await expect(home.whereChip('other')).toHaveText('Other area');
    await expect(home.lastLogLink).toContainText('Last log:');
    await expect(home.lastLogLink).toContainText('Mock last entry');
    await expect(home.lastLogLink).toContainText('2 photos');
    await expect(home.lastLogLink).toHaveAttribute(
      'href',
      routeUrl('diaryEntry', { id: 'last-1' }),
    );

    await home.whereChip('area-garden').click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === routeUrl('diaryEntryNew') &&
        url.searchParams.get('areaId') === 'area-garden' &&
        url.searchParams.get('start') === 'photo',
    );
  });

  test('H12b: "Other area" carries no areaId', async ({ page }) => {
    test.skip(!isCompact(page), 'phone and tablet only');
    const home = await openHome(page, state());
    await home.whereChip('other').click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === routeUrl('diaryEntryNew') &&
        !url.searchParams.has('areaId') &&
        url.searchParams.get('start') === 'photo',
    );
  });

  test('H12c: a draft as the last log links to its edit page', async ({ page }) => {
    test.skip(!isCompact(page), 'phone and tablet only');
    const s = newHomeMockState({
      diary: [
        mockHomeDiaryEntry({
          id: 'draft-last',
          title: 'Mock draft',
          status: 'draft',
          photoAreas: [garden],
        }),
      ],
    });
    const home = await openHome(page, s);
    await expect(home.lastLogLink).toHaveAttribute(
      'href',
      routeUrl('diaryEntryEdit', { id: 'draft-last' }),
    );
  });

  test('H12d: the desktop shows no chips', async ({ page }) => {
    test.skip(isCompact(page), 'desktop only');
    const home = await openHome(page, state());
    await expect(home.pulseTiles()).toHaveCount(3);
    await expect(home.where).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Where are you?' })).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H13 Customize
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Customize (H13)', { tag: '@responsive' }, () => {
  test('H13: sections can be hidden, never Needs attention; the choice persists', async ({
    page,
  }) => {
    const state = newHomeMockState({
      attention: attentionResponse({
        rows: tasks(1),
        tidyUp: [endedTaskRow({ id: 'ended-c', title: 'Mock ended' })],
      }),
    });
    const home = await openHome(page, state);

    await home.openCustomize();
    await expect(home.customizeDialog.getByRole('checkbox')).toHaveCount(4);
    await expect(home.customizeCheckbox('needs-attention')).toHaveCount(0);
    await expect(home.customizeDialog).toContainText('Needs attention always shows.');
    for (const id of ['tidy-up', 'this-week', 'pulse', 'latest-from-site']) {
      await expect(home.customizeCheckbox(id)).toBeChecked();
    }

    await home.customizeCheckbox('pulse').uncheck();
    await expect(home.pulse).toHaveCount(0);
    await expect.poll(() => readPreference(page, 'home.hiddenSections')).toBe('["pulse"]');
    await home.customizeDone.click();
    await expect(home.customizeDialog).toBeHidden();
    await expect(home.pageMenuButton).toBeFocused();

    await page.reload();
    await expect(home.heading).toBeVisible();
    await expect(home.needsAttention).toBeVisible();
    await expect(home.pulse).toHaveCount(0);

    await home.openCustomize();
    await expect(home.customizeCheckbox('pulse')).not.toBeChecked();
    await home.customizeCheckbox('pulse').check();
    await expect(home.pulse).toBeVisible();
    await expect.poll(() => readPreference(page, 'home.hiddenSections')).toBe('[]');
  });

  test('H13b: the retired dashboard preference no longer hides anything', async ({ page }) => {
    const response = await page.request.patch('/api/users/me/preferences', {
      data: {
        key: 'dashboard.hiddenCards',
        value: '["budget-summary","work-item-progress","invoice-pipeline","recent-diary"]',
      },
    });
    expect(response.ok()).toBeTruthy();
    const home = await openHome(
      page,
      newHomeMockState({ attention: attentionResponse({ rows: tasks(1) }) }),
    );
    await expect(home.pulse).toBeVisible();
    await expect(home.latest).toBeVisible();
    await expect(home.thisWeek).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H14 Moved notice
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Moved notice (H14)', { tag: '@responsive' }, () => {
  test('H14: shown once, dismiss returns focus to the heading, gone after reload', async ({
    page,
  }) => {
    await resetPreferences(page, { noticeSeen: false });
    const home = await openHome(page, newHomeMockState());

    await expect(home.notice).toContainText('Home has changed.');
    await expect(home.noticeLink).toHaveAttribute('href', HELP_URL);
    await expect(home.noticeLink).toHaveAttribute('target', '_blank');
    await home.noticeDismiss.click();
    await expect(home.notice).toHaveCount(0);
    await expect(home.heading).toBeFocused();
    await expect.poll(() => readPreference(page, 'home.movedNoticeSeen')).toBe('true');

    await page.reload();
    await expect(home.heading).toBeVisible();
    await expect(home.pulseTiles()).toHaveCount(3);
    await expect(home.notice).toHaveCount(0);
  });

  test('H14b: not shown when already seen', async ({ page }) => {
    const home = await openHome(page, newHomeMockState());
    await expect(home.pulseTiles()).toHaveCount(3);
    await expect(home.notice).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H15 Reschedule, H16 legacy URLs
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Reschedule and legacy URLs (H15, H16)', { tag: '@responsive' }, () => {
  test('H15: Reschedule opens the task at its Constraints section', async ({
    page,
    testPrefix,
  }) => {
    const title = `${testPrefix} Home Reschedule`;
    const id = await createWorkItemViaApi(page, { title, status: 'in_progress' });
    try {
      const row = lateTaskRow({ id, title });
      const home = await openHome(
        page,
        newHomeMockState({ attention: attentionResponse({ rows: [row] }) }),
      );
      const link = home.rowReschedule(row.key);
      await expect(link).toHaveAttribute('href', `${routeUrl('workItem', { id })}#constraints`);
      await link.click();
      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('workItem', { id }) && url.hash === '#constraints',
      );
      const heading = page.locator('#constraints-heading');
      await expect(heading).toHaveText('Constraints');
      await expect(heading).toBeFocused();
    } finally {
      await deleteWorkItemViaApi(page, id);
    }
  });

  test('H16: /project/overview and /project land on / in one hop', async ({ page }) => {
    await installHomeMocks(page, newHomeMockState());
    await installRouteLog(page);
    const home = new HomePage(page);
    for (const legacy of ['/project/overview', '/project']) {
      await page.goto(legacy);
      await expect(page).toHaveURL((url) => url.pathname === '/');
      await expect(home.heading).toBeVisible();
      const log = await readRouteLog(page);
      expect(log.filter((entry) => entry.kind === 'pushState')).toEqual([]);
      expect(log.map((entry) => new URL(entry.url).pathname)).toEqual(['/']);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H17 Dark mode, H18 German
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dark mode and German (H17, H18)', { tag: '@responsive' }, () => {
  test('H17: a row and a tile render with the dark theme and no sideways scroll', async ({
    page,
  }) => {
    const rows = tasks(1);
    const home = await openHome(page, newHomeMockState({ attention: attentionResponse({ rows }) }));
    const paint = async () =>
      page.evaluate(
        ({ rowId, tileId }) => {
          const rowEl = document.querySelector(`[data-testid="${rowId}"]`)!;
          const tileEl = document.querySelector(`[data-testid="${tileId}"]`)!;
          return {
            rowBg: getComputedStyle(rowEl).backgroundColor,
            rowBorder: getComputedStyle(rowEl).borderLeftColor,
            tileBg: getComputedStyle(tileEl).backgroundColor,
            page: getComputedStyle(document.body).backgroundColor,
          };
        },
        { rowId: `needs-attention-row-${rows[0]!.key}`, tileId: 'home-pulse-progress' },
      );
    await expect(home.pulseTiles()).toHaveCount(3);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    const light = await paint();
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const dark = await paint();
    expect(dark.rowBg, 'row fill differs from light').not.toBe(light.rowBg);
    expect(dark.page, 'page background differs from light').not.toBe(light.page);
    expect(dark.rowBg).not.toBe(dark.page);
    expect(await home.hasHorizontalOverflow()).toBe(false);
  });

  test('H18: a German user sees German, no raw keys', async ({ page }) => {
    const rows = tasks(3);
    const state = newHomeMockState({
      attention: attentionResponse({
        rows,
        tidyUp: [endedTaskRow({ id: 'de-ended', title: 'Mock ended' })],
        criticalLine: criticalLine(),
      }),
      week: weekResponse([agendaItem({ id: 'de-w', kind: 'starts', date: dayOffset(0) })]),
      diary: [mockHomeDiaryEntry({ id: 'de-d', title: 'Mock entry' })],
    });
    const patch = await page.request.patch('/api/users/me/preferences', {
      data: { key: 'locale', value: 'de' },
    });
    expect(patch.ok()).toBeTruthy();
    await installHomeMocks(page, state);
    const home = new HomePage(page);
    await page.goto(routeUrl('home'));
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Start', exact: true })).toBeVisible();
    await expect(home.sectionHeading(/^Braucht dich/)).toBeVisible();
    await expect(home.sectionHeading('Diese Woche')).toBeVisible();
    await expect(home.catchUpLine).toContainText('Aufgaben sind verspätet');
    await expect(home.rowNotNow(rows[0]!.key)).toHaveText('Später');
    await expect(home.tidyToggle).toContainText('Aufräumen');
    await expect(home.pulseTiles()).toHaveCount(3);
    await expect(home.pulseTile('left-to-spend')).toContainText('Noch verfügbar');
    await expect(home.pulseTile('still-to-pay')).toContainText('Noch zu zahlen');
    const text = await page.locator('main').innerText();
    expect(text).not.toMatch(
      /\b(?:page|sections|attention|week|pulse|latest|footer|where|setup|customize|notice|catchUp|common)\.[A-Za-z_.]+/,
    );
  });
});
