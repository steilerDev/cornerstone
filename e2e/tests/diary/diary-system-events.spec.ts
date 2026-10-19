/**
 * E2E: system events in History (#2223, EPIC-21 P2.4).
 *
 * Events land in the shared E2E database, so every assertion is scoped to rows found by id from
 * the API, never by list position or total count. Synthetic data only.
 *
 * Scenarios
 * 1. Real flow: a task status change writes one `v: 1` event that renders as a sentence, in
 *    English on the History page (#2224: it left the Site diary), with an "Open task" link and a
 *    working Back to History.
 * 2. A no-op writes nothing; A to B to A inside 30 s leaves no event (PATCH back, and Undo).
 * 3. Collapsed repeats ("x3" and "3 times, ... to ...") and hidden delay notes (mocked list).
 * 4. A system event opened by URL shows the event layout and no Edit or Delete.
 * 5. German: the same real event renders in German (no English sentence).
 * The progress-payment event and its `?payment=` link are in invoices/invoice-payment-target.spec.ts.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { createWorkItemViaApi, deleteWorkItemViaApi } from '../../fixtures/apiHelpers.js';
import { openAsLocaleUser } from '../../fixtures/localeUser.js';
import { mockDiaryList, mockSystemEvent } from '../../fixtures/systemEventMocks.js';
import { API } from '../../fixtures/testData.js';
import { BreadcrumbsBar } from '../../pages/BreadcrumbsBar.js';
import { DiaryEntryDetailPage } from '../../pages/DiaryEntryDetailPage.js';
import { HistoryPage } from '../../pages/HistoryPage.js';

interface ApiEvent {
  id: string;
  entryType: string;
  title: string | null;
  body: string;
  sourceEntityId: string | null;
  isAutomatic: boolean;
  metadata: Record<string, unknown> | null;
}

/** The task's events from the API, newest first. */
async function taskEvents(page: Page, taskId: string): Promise<ApiEvent[]> {
  const response = await page.request.get(
    `${API.diaryEntries}?type=work_item_status&pageSize=50&showHidden=true`,
  );
  expect(response.ok(), 'GET diary entries').toBeTruthy();
  const body = (await response.json()) as { items: ApiEvent[] };
  return body.items.filter((entry) => entry.sourceEntityId === taskId);
}

async function setTaskStatus(page: Page, taskId: string, status: string): Promise<string | null> {
  const response = await page.request.patch(`${API.workItems}/${taskId}`, { data: { status } });
  expect(response.ok(), `PATCH task to ${status}: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { undo?: { token: string } };
  return body.undo?.token ?? null;
}

/**
 * Open History scoped to the test's own events: the shared database holds events of other tests,
 * so the `q` filter (the unique test prefix, part of every subject label) isolates the rows.
 */
async function openHistory(page: Page, testPrefix: string): Promise<HistoryPage> {
  const history = new HistoryPage(page);
  await history.goto({ type: 'work_item_status', q: testPrefix });
  return history;
}

test.describe('System events (#2223)', { tag: '@responsive' }, () => {
  test('1. a status change writes one event that reads as a sentence on the History filter', async ({
    page,
    testPrefix,
  }) => {
    let taskId = '';
    try {
      const title = `Task E2E-SE-${testPrefix}`;
      taskId = await createWorkItemViaApi(page, { title, status: 'not_started' });
      await setTaskStatus(page, taskId, 'in_progress');

      const events = await taskEvents(page, taskId);
      expect(events).toHaveLength(1);
      const [event] = events as [ApiEvent];
      expect(event.title).toBeNull();
      expect(event.body).toBe('');
      expect(event.isAutomatic).toBe(true);
      expect(event.metadata).toMatchObject({
        v: 1,
        event: 'status_changed',
        from: 'not_started',
        to: 'in_progress',
        subjectLabel: title,
      });

      const history = await openHistory(page, testPrefix);
      await expect(history.typeChip('work_item_status')).toHaveText('Task status');
      await expect(history.typeChip('work_item_status')).toHaveAttribute('aria-pressed', 'true');

      const row = history.systemEventRow(event.id);
      await expect(row).toBeVisible();
      await expect(row).toContainText(`${title} went from Not started to In progress`);
      await expect(history.systemEventType(event.id)).toHaveText('Task status');
      await expect(page.getByText('Automatic', { exact: true })).toHaveCount(0);

      // "Open task" goes to the task; "Back to History" returns to the list.
      await expect(history.systemEventLink(event.id)).toHaveText(/Open task/);
      await history.systemEventLink(event.id).click();
      await expect(page).toHaveURL(new RegExp(`/work-items/${taskId}`));
      const breadcrumbs = new BreadcrumbsBar(page);
      await breadcrumbs.expectBack('History');
      await breadcrumbs.backLink.click();
      await expect(page).toHaveURL(/\/history(\?|$)/);
    } finally {
      if (taskId) await deleteWorkItemViaApi(page, taskId);
    }
  });

  test('2a. a no-op writes nothing; in_progress to completed and back leaves no second event', async ({
    page,
    testPrefix,
  }) => {
    let taskId = '';
    try {
      taskId = await createWorkItemViaApi(page, {
        title: `Task E2E-SE-noop-${testPrefix}`,
        status: 'not_started',
      });
      await setTaskStatus(page, taskId, 'in_progress');
      expect(await taskEvents(page, taskId)).toHaveLength(1);

      // No-op: same status again.
      await setTaskStatus(page, taskId, 'in_progress');
      expect(await taskEvents(page, taskId)).toHaveLength(1);

      // A to B writes an event, B back to A retracts it.
      await setTaskStatus(page, taskId, 'completed');
      expect(await taskEvents(page, taskId)).toHaveLength(2);
      await setTaskStatus(page, taskId, 'in_progress');
      const events = await taskEvents(page, taskId);
      expect(events).toHaveLength(1);
      expect(events[0]?.metadata).toMatchObject({ from: 'not_started', to: 'in_progress' });
    } finally {
      if (taskId) await deleteWorkItemViaApi(page, taskId);
    }
  });

  test('2b. Undo of a status change removes the event it wrote', async ({ page, testPrefix }) => {
    let taskId = '';
    try {
      taskId = await createWorkItemViaApi(page, {
        title: `Task E2E-SE-undo-${testPrefix}`,
        status: 'not_started',
      });
      await setTaskStatus(page, taskId, 'in_progress');
      const token = await setTaskStatus(page, taskId, 'completed');
      expect(token, 'the PATCH returns an undo token').not.toBeNull();
      expect(await taskEvents(page, taskId)).toHaveLength(2);

      const undo = await page.request.post(`/api/undo/${token}`);
      expect(undo.ok(), `POST undo: ${undo.status()}`).toBeTruthy();

      const events = await taskEvents(page, taskId);
      expect(events).toHaveLength(1);
      expect(events[0]?.metadata).toMatchObject({ from: 'not_started', to: 'in_progress' });
    } finally {
      if (taskId) await deleteWorkItemViaApi(page, taskId);
    }
  });

  test('3. collapsed repeats show the count; hidden delay notes appear after "Show hidden"', async ({
    page,
  }) => {
    const delay = (id: string, projected: string, createdAt: string, extra = {}) =>
      mockSystemEvent({
        id,
        entryType: 'milestone_delay',
        sourceEntityType: 'milestone',
        sourceEntityId: '7',
        sourceEntityTitle: 'Roof Complete',
        createdAt,
        metadata: {
          v: 1,
          event: 'milestone_delayed',
          targetDate: '2026-03-01',
          projectedDate: projected,
          delayDays: 9,
          subjectLabel: 'Roof Complete',
        },
        ...extra,
      });
    const repeatRow = delay('mock-se-repeat', '2026-03-10', '2026-03-19T09:00:00.000Z', {
      repeat: { count: 3, firstAt: '2026-03-12T09:00:00.000Z', lastAt: '2026-03-19T09:00:00.000Z' },
    });
    const hiddenRow = delay('mock-se-hidden', '2026-03-12', '2026-03-20T09:00:00.000Z', {
      hidden: true,
    });
    const requests: string[] = [];

    await page.route(/\/api\/history(\?.*)?$/, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      requests.push(route.request().url());
      const showHidden = new URL(route.request().url()).searchParams.get('showHidden') === 'true';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...(showHidden
            ? mockDiaryList([hiddenRow, repeatRow], 1)
            : mockDiaryList([repeatRow], 1)),
          object: null,
        }),
      });
    });

    const diary = new HistoryPage(page);
    await diary.goto();

    // Collapsed repeats: the count is in the visible text, not only in the badge.
    const repeat = diary.systemEventRow('mock-se-repeat');
    await expect(repeat).toBeVisible();
    await expect(repeat).toContainText('×3');
    await expect(repeat).toContainText(/3 times, .+ to .+/);
    await expect(repeat).toContainText('Roof Complete is 9 days late');

    // The hidden note and its toggle sit above the feed; the hidden row is not shown yet.
    await expect(diary.hiddenNote).toContainText('1 later delay note is hidden.');
    await expect(diary.showHiddenToggle).toHaveText('Show hidden');
    await expect(diary.showHiddenToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(diary.systemEventRow('mock-se-hidden')).toHaveCount(0);
    expect(requests.every((url) => !url.includes('showHidden=true'))).toBe(true);

    const reveal = page.waitForRequest(
      (request) =>
        request.url().includes('/api/history') && request.url().includes('showHidden=true'),
    );
    await diary.showHiddenToggle.click();
    await reveal;

    const hidden = diary.systemEventRow('mock-se-hidden');
    await expect(hidden).toBeVisible();
    await expect(hidden).toContainText('After reached');
    await expect(diary.showHiddenToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(diary.showHiddenToggle).toBeFocused();
  });

  test('4. a system event opened by URL shows the event layout, no Edit or Delete', async ({
    page,
    testPrefix,
  }) => {
    let taskId = '';
    try {
      const title = `Task E2E-SE-page-${testPrefix}`;
      taskId = await createWorkItemViaApi(page, { title, status: 'not_started' });
      await setTaskStatus(page, taskId, 'in_progress');
      const [event] = await taskEvents(page, taskId);

      const detail = new DiaryEntryDetailPage(page);
      await detail.goto((event as ApiEvent).id);
      await expect(detail.loaded).toBeVisible();

      const row = detail.systemEventRow((event as ApiEvent).id);
      await expect(row).toContainText(`${title} went from Not started to In progress`);
      await expect(detail.systemEventLink((event as ApiEvent).id)).toHaveText(/Open task/);
      await expect(detail.editButton).toHaveCount(0);
      await expect(detail.deleteButton).toHaveCount(0);
      await expect(detail.sourceSection).toHaveCount(0);
    } finally {
      if (taskId) await deleteWorkItemViaApi(page, taskId);
    }
  });

  test('5. German: the same real event renders in German, not in English', async ({
    page,
    browser,
    testPrefix,
  }) => {
    let taskId = '';
    const session = { dispose: async () => {} };
    try {
      const title = `Task E2E-SE-de-${testPrefix}`;
      taskId = await createWorkItemViaApi(page, { title, status: 'not_started' });
      await setTaskStatus(page, taskId, 'in_progress');
      const [event] = await taskEvents(page, taskId);
      const eventId = (event as ApiEvent).id;

      const german = await openAsLocaleUser(
        browser,
        page,
        testPrefix,
        `/history?type=work_item_status&q=${encodeURIComponent(testPrefix)}`,
        'de',
      );
      session.dispose = german.dispose;
      const diary = new HistoryPage(german.page);

      const row = diary.systemEventRow(eventId);
      await expect(row).toBeVisible();
      await expect(row).toContainText(`${title} wechselte von Nicht begonnen zu In Arbeit`);
      await expect(diary.systemEventType(eventId)).toHaveText('Aufgabenstatus');
      await expect(diary.systemEventLink(eventId)).toContainText('Aufgabe öffnen');
      await expect(german.page.getByRole('heading', { level: 1, name: 'Verlauf' })).toBeVisible();
      await expect(row).not.toContainText('went from');
      await expect(row).not.toContainText('Open task');
    } finally {
      await session.dispose();
      if (taskId) await deleteWorkItemViaApi(page, taskId);
    }
  });
});
