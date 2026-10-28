/**
 * E2E tests for the Task page on the detail template (#2248, EPIC-21 P5.4).
 *
 * The basics (heading, Details card, Add ▾ menu, notes, checklist, delete, 404, dark mode) live in
 * `work-item-detail.spec.ts`. This file holds the acceptance scenarios of the story:
 *
 *  T1  AC1   Start with the date step and Undo; Mark done with a picked date, then Log
 *  T2  AC2   the strip: facts and their order, the When / Where / Who / Cost / Waits for / Holds up values
 *  T3  AC2   Where without an area opens the Who and where card; a REAL click on Call (tel: link)
 *  T4  AC3   tabs and `?tab=`: selecting, deep links, counts, strip facts that open a tab
 *  T5  AC5/10 Waits for: first Add from the empty list, Edit (type and lag), Remove + Undo
 *  T6  AC5/10 Waiting for this task: Add, and the strip's Waits for / Holds up
 *  T7  AC5   Milestones: link both relations, Remove + Undo
 *  T8  AC5   Purchases waiting for this task: a read-only list
 *  T9  AC5   Dates and Constraints cards; Reschedule: preview, Save, Undo
 *  T10 D15   `?depError=` and the `#reschedule` / `#constraints` deep links land on Timing
 *  T11 AC6   Cost: grouped cost lines, Add cost line, New invoice, grants with Undo
 *  T12 AC7   Site diary: the company block, the collapsed `<details>`, "Log for this task"
 *  T13 AC8   Documents fact (Paperless mocked as configured); Delete with counts
 *  T14 AC9   the strip stays short (bounding box)
 *  T15 AC10  New task "Waits for" creates finish-to-start dependencies
 *
 * Data is created through the API with per-test names; every name and phone number is invented.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { API } from '../../fixtures/testData.js';
import {
  createAreaViaApi,
  createHouseholdItemViaApi,
  createMilestoneViaApi,
  createVendorViaApi,
  createWorkItemViaApi,
  deleteAreaViaApi,
  deleteHouseholdItemViaApi,
  deleteMilestoneViaApi,
  deleteVendorViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { todayIso } from '../../fixtures/captureSeed.js';
import {
  newCleanup,
  runCleanup,
  createCostLine,
  createFundingSource,
} from '../../fixtures/costLineSeed.js';
import type { SeedCleanup } from '../../fixtures/costLineSeed.js';
import { seedDiaryFeed } from '../../fixtures/diaryFeedSeed.js';
import { mockPaperlessConfigured } from '../../fixtures/paperlessMocks.js';
import { DiaryCapturePage } from '../../pages/DiaryCapturePage.js';
import { DocumentsPanel } from '../../pages/DocumentsPanel.js';
import { WorkItemDetailPage, dependencyDialogTitles } from '../../pages/WorkItemDetailPage.js';
import { WorkItemCreatePage } from '../../pages/WorkItemCreatePage.js';
import { CostLineFormDialog } from '../../pages/components/CostLineFormDialog.js';
import { EntityPickerControl } from '../../pages/components/EntityPickerControl.js';
import { InvoiceFormDialog } from '../../pages/components/InvoiceFormDialog.js';

let cleanup: SeedCleanup;

test.beforeEach(() => {
  cleanup = newCleanup();
});

test.afterEach(async () => {
  await runCleanup(cleanup);
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Today as YYYY-MM-DD in the browser's local time (what the StatusMenu "Today" chip sends). */
function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A task created through the API; deleted by the per-test cleanup. */
async function makeTask(
  page: Page,
  title: string,
  fields: Record<string, unknown> = {},
): Promise<string> {
  const id = await createWorkItemViaApi(page, { title, ...fields });
  cleanup.fns.push(() => deleteWorkItemViaApi(page, id));
  return id;
}

async function makeCompany(page: Page, name: string, phone?: string): Promise<string> {
  const id = await createVendorViaApi(page, { name, ...(phone ? { phone } : {}) });
  cleanup.fns.push(() => deleteVendorViaApi(page, id));
  return id;
}

async function makeArea(page: Page, name: string): Promise<string> {
  const id = await createAreaViaApi(page, { name });
  cleanup.fns.push(() => deleteAreaViaApi(page, id));
  return id;
}

async function makeMilestone(page: Page, title: string): Promise<number> {
  const id = await createMilestoneViaApi(page, { title, targetDate: todayIso(30) });
  cleanup.fns.push(() => deleteMilestoneViaApi(page, id));
  return id;
}

/** `successorId` waits for `predecessorId`. */
async function makeDependency(
  page: Page,
  successorId: string,
  predecessorId: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const response = await page.request.post(`${API.workItems}/${successorId}/dependencies`, {
    data: { predecessorId, dependencyType: 'finish_to_start', ...extra },
  });
  expect(response.ok(), `POST dependency: ${response.status()}`).toBeTruthy();
}

interface ApiDependency {
  workItem: { id: string };
  dependencyType: string;
  leadLagDays: number;
}
interface ApiTask {
  status: string;
  actualStartDate: string | null;
  actualEndDate: string | null;
  durationDays: number | null;
  startDate: string | null;
  endDate: string | null;
  startAfter: string | null;
  startBefore: string | null;
  dependencies: { predecessors: ApiDependency[]; successors: ApiDependency[] };
}

async function fetchTask(page: Page, id: string): Promise<ApiTask> {
  const response = await page.request.get(`${API.workItems}/${id}`);
  expect(response.ok(), `GET task: ${response.status()}`).toBeTruthy();
  return (await response.json()) as ApiTask;
}

async function createGrant(page: Page, name: string): Promise<string> {
  const response = await page.request.post(API.subsidyPrograms, {
    data: {
      name,
      reductionType: 'percentage',
      reductionValue: 10,
      applicationStatus: 'approved',
      applicationDeadline: null,
      description: null,
      eligibility: null,
      notes: null,
      categoryIds: [],
      maximumAmount: null,
    },
  });
  expect(response.ok(), `POST grant: ${response.status()}`).toBeTruthy();
  const id = ((await response.json()) as { subsidyProgram: { id: string } }).subsidyProgram.id;
  cleanup.fns.push(async () => {
    await page.request.delete(`${API.subsidyPrograms}/${id}`);
  });
  return id;
}

async function fetchGrantIds(page: Page, taskId: string): Promise<string[]> {
  const response = await page.request.get(`${API.workItems}/${taskId}/subsidies`);
  expect(response.ok(), `GET task grants: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { subsidies: Array<{ id: string }> };
  return body.subsidies.map((grant) => grant.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// T1 (AC1): the header primary
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Header primary (T1, AC1)', { tag: '@responsive' }, () => {
  test('Start asks for a date, moves the task to In progress and Undo restores it', async ({
    page,
    testPrefix,
  }) => {
    const title = `${testPrefix} T1 Start Task`;
    const id = await makeTask(page, title, {
      status: 'not_started',
      startDate: todayIso(2),
      endDate: todayIso(9),
    });
    const task = new WorkItemDetailPage(page);

    await task.goto(id);
    // Not started: the one primary is Start; Mark done is not offered yet
    await expect(task.startPrimary.trigger).toContainText('Start');
    await expect(task.donePrimary.trigger).toHaveCount(0);
    await expect(task.logPrimary).toHaveCount(0);

    await task.startPrimary.actionToday();

    await expect(task.statusMenu.trigger).toHaveText('In progress');
    await expect(task.toasts.undoToastWith(`${title} is now “In progress”.`)).toBeVisible();
    // In progress: the primary became Mark done
    await expect(task.donePrimary.trigger).toContainText('Mark done');
    await expect(task.startPrimary.trigger).toHaveCount(0);
    expect((await fetchTask(page, id)).actualStartDate).toBe(localToday());

    await task.toasts.undoViaButton();

    await expect(task.statusMenu.trigger).toHaveText('Not started');
    await expect(task.startPrimary.trigger).toContainText('Start');
    const restored = await fetchTask(page, id);
    expect(restored.status).toBe('not_started');
    expect(restored.actualStartDate).toBeNull();
  });

  test('Mark done with a picked date stores it, the primary becomes Log, Undo brings Mark done back', async ({
    page,
    testPrefix,
  }) => {
    const title = `${testPrefix} T1 Done Task`;
    const id = await makeTask(page, title, { status: 'not_started' });
    const started = await page.request.patch(`${API.workItems}/${id}`, {
      data: { status: 'in_progress', actualStartDate: todayIso(-5) },
    });
    expect(started.ok(), 'PATCH to in_progress').toBeTruthy();
    const task = new WorkItemDetailPage(page);

    await task.goto(id);
    await expect(task.donePrimary.trigger).toContainText('Mark done');

    await task.donePrimary.actionPickedDate(todayIso(-1));

    await expect(task.statusMenu.trigger).toHaveText('Done');
    await expect(task.toasts.undoToastWith(`${title} is now “Done”.`)).toBeVisible();
    // Done: Log replaces the status primary
    await expect(task.logPrimary).toBeVisible();
    await expect(task.logPrimary).toContainText('Log');
    await expect(task.donePrimary.trigger).toHaveCount(0);
    await expect.poll(async () => (await fetchTask(page, id)).actualEndDate).toBe(todayIso(-1));

    await task.toasts.undoViaButton();

    await expect(task.statusMenu.trigger).toHaveText('In progress');
    await expect(task.donePrimary.trigger).toContainText('Mark done');
    await expect(task.logPrimary).toHaveCount(0);
    expect((await fetchTask(page, id)).actualEndDate).toBeNull();
  });

  test("Log on a done task opens the capture screen with the task's area and company", async ({
    page,
    testPrefix,
  }) => {
    const company = `${testPrefix} T1 Log Co`;
    const companyId = await makeCompany(page, company);
    const areaId = await makeArea(page, `${testPrefix} T1 Log Area`);
    const id = await makeTask(page, `${testPrefix} T1 Log Task`, {
      status: 'completed',
      areaId,
      assignedVendorId: companyId,
    });
    const task = new WorkItemDetailPage(page);

    await task.goto(id);
    await task.logPrimary.click();

    await expect(page).toHaveURL(
      (url) =>
        url.pathname === routeUrl('diaryEntryNew') &&
        url.searchParams.get('areaId') === areaId &&
        url.searchParams.get('companyId') === companyId,
    );
    const capture = new DiaryCapturePage(page);
    await capture.waitForForm();
    await expect(capture.companyChip(company)).toHaveAttribute('aria-pressed', 'true');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T2 / T3 (AC2): the strip
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Summary strip (T2, AC2)', { tag: '@responsive' }, () => {
  test('The strip shows When, Where, Who, Expected cost, Waits for and Holds up, in that order', async ({
    page,
    testPrefix,
  }) => {
    const companyName = `${testPrefix} T2 Joinery Ltd`;
    const areaName = `${testPrefix} T2 Kitchen`;
    const grantName = `${testPrefix} T2 Efficiency grant`;
    const companyId = await makeCompany(page, companyName, '+49 30 5550123');
    const areaId = await makeArea(page, areaName);
    const predecessor = await makeTask(page, `${testPrefix} T2 Predecessor`);
    const id = await makeTask(page, `${testPrefix} T2 Main`, {
      status: 'not_started',
      startDate: todayIso(2),
      endDate: todayIso(9),
      areaId,
      assignedVendorId: companyId,
    });
    const successor = await makeTask(page, `${testPrefix} T2 Successor`);
    await makeDependency(page, id, predecessor);
    await makeDependency(page, successor, id);
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} T2 Savings`);
    await createCostLine(page, {
      kind: 'work_item',
      hostId: id,
      budgetSourceId: sourceId,
      description: `${testPrefix} T2 Line`,
      plannedAmount: 1000,
      includesVat: true,
    });
    const grantId = await createGrant(page, grantName);
    const linked = await page.request.post(`${API.workItems}/${id}/subsidies`, {
      data: { subsidyProgramId: grantId },
    });
    expect(linked.ok(), 'POST grant link').toBeTruthy();
    const task = new WorkItemDetailPage(page);

    await task.goto(id);

    // Documents appears only when Paperless is configured or links are kept
    await expect(task.summary.item('when')).toBeVisible();
    expect(await task.summary.factIds()).toEqual([
      'when',
      'where',
      'who',
      'cost',
      'waitsFor',
      'holdsUp',
    ]);

    // When: the shown dates as a range
    await expect(task.summary.fact('when')).toContainText(' – ');
    // Where: the area as a link
    await expect(task.summary.fact('where')).toContainText(areaName);
    await expect(task.summary.fact('where')).toHaveAttribute('href', /^\/areas/);
    // Who: the company, with Call beside it
    await expect(task.summary.fact('who')).toContainText(companyName);
    await expect(task.callButton).toBeVisible();
    // Expected cost: a money figure with the grant named as a remark
    await expect(task.summary.label('cost')).toHaveText('Expected cost');
    await expect(task.summary.fact('cost')).toContainText('€');
    await expect(task.summary.fact('cost')).toContainText(grantName);
    // Waits for: the first unfinished task by name
    await expect(task.summary.fact('waitsFor')).toContainText(`${testPrefix} T2 Predecessor`);
    // Holds up: a count with a figure marker
    await expect(task.summary.fact('holdsUp')).toHaveText('1 task');
    await expect(task.summary.figure('holds-up')).toHaveCount(1);
  });

  test('A task that waits for nothing and holds nothing up says Nothing', async ({
    page,
    testPrefix,
  }) => {
    const id = await makeTask(page, `${testPrefix} T2 Alone`);
    const task = new WorkItemDetailPage(page);

    await task.goto(id);

    await expect(task.summary.fact('waitsFor')).toHaveText('Nothing');
    await expect(task.summary.fact('holdsUp')).toHaveText('Nothing');
    await expect(task.summary.figure('holds-up')).toHaveCount(0);
  });

  test('The Late chip sits in the When fact of a task that started late', async ({
    page,
    testPrefix,
  }) => {
    const id = await makeTask(page, `${testPrefix} T2 Late`, {
      status: 'not_started',
      startDate: todayIso(-6),
      endDate: todayIso(-1),
    });
    const task = new WorkItemDetailPage(page);

    await task.goto(id);

    await expect(task.headerScheduleSignal).toContainText('Late');
    await expect(task.summary.fact('when')).toContainText('Late');
  });
});

test.describe('Where, Who and Call (T3, AC2)', { tag: '@responsive' }, () => {
  test('Without an area, the Where fact opens the Who and where card in edit mode with Who focused', async ({
    page,
    testPrefix,
  }) => {
    const id = await makeTask(page, `${testPrefix} T3 No Area`);
    const task = new WorkItemDetailPage(page);

    // Start on another tab so the fact has to bring the Overview back
    await task.goto(id, { tab: 'timing' });
    await task.summary.fact('where').click();

    await expect(task.tabs.tab('overview')).toHaveAttribute('aria-selected', 'true');
    await expect(task.whoWhereCard.form).toBeVisible();
    await expect(task.whoPicker.input).toBeFocused();
  });

  test('A REAL click on Call follows the tel: link and leaves the page and its tab alone', async ({
    page,
    testPrefix,
  }) => {
    const companyId = await makeCompany(page, `${testPrefix} T3 Plumbing Ltd`, '+49 30 5550199');
    const id = await makeTask(page, `${testPrefix} T3 Call`, { assignedVendorId: companyId });
    const task = new WorkItemDetailPage(page);

    await task.goto(id);
    await expect(task.callButton).toHaveAttribute('href', 'tel:+49305550199');
    const before = page.url();

    await task.callButton.click();

    // The click is the link's own: no tab opened, no card in edit mode, still the same page
    await expect(page).toHaveURL(before);
    await expect(task.tabs.tab('overview')).toHaveAttribute('aria-selected', 'true');
    await expect(task.whoWhereCard.form).toHaveCount(0);
    await expect(task.heading).toBeVisible();
  });

  test('A company without a phone number has no Call button; a person has none either', async ({
    page,
    testPrefix,
  }) => {
    const companyId = await makeCompany(page, `${testPrefix} T3 No Phone Co`);
    const id = await makeTask(page, `${testPrefix} T3 No Call`, { assignedVendorId: companyId });
    const task = new WorkItemDetailPage(page);

    await task.goto(id);

    await expect(task.summary.fact('who')).toContainText(`${testPrefix} T3 No Phone Co`);
    await expect(task.callButton).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T4 (AC3): tabs
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Tabs and ?tab= (T4, AC3)', { tag: '@responsive' }, () => {
  test('Selecting a tab writes ?tab= and a reload keeps it; Overview has no parameter', async ({
    page,
    testPrefix,
  }) => {
    const id = await makeTask(page, `${testPrefix} T4 Tabs`);
    const task = new WorkItemDetailPage(page);

    await task.goto(id);
    await expect(task.tabs.tab('overview')).toHaveAttribute('aria-selected', 'true');
    expect(new URL(page.url()).searchParams.get('tab')).toBeNull();

    for (const tab of ['timing', 'cost', 'diary', 'history'] as const) {
      await task.openTab(tab);
      await expect(page).toHaveURL((url) => url.searchParams.get('tab') === tab);
    }

    await page.reload();
    await expect(task.tabs.tab('history')).toHaveAttribute('aria-selected', 'true');
    await expect(task.historyCreated).toBeVisible();
    await expect(task.historyCreated).toContainText('Created');

    await task.openTab('overview');
    await expect(page).toHaveURL((url) => url.searchParams.get('tab') === null);
  });

  test('A deep link opens its tab; an unknown value falls back to Overview and is removed', async ({
    page,
    testPrefix,
  }) => {
    const id = await makeTask(page, `${testPrefix} T4 Deep`);
    const task = new WorkItemDetailPage(page);

    await task.goto(id, { tab: 'cost' });
    await expect(task.tabs.tab('cost')).toHaveAttribute('aria-selected', 'true');
    await expect(task.costLines.section).toBeVisible();

    await task.goto(id, { query: { tab: 'nonsense' } });
    await expect(task.tabs.tab('overview')).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL((url) => url.searchParams.get('tab') === null);
  });

  test('Strip facts open the tab that explains them', async ({ page, testPrefix }) => {
    const predecessor = await makeTask(page, `${testPrefix} T4 Pre`);
    const id = await makeTask(page, `${testPrefix} T4 Facts`, {
      status: 'not_started',
      startDate: todayIso(2),
      endDate: todayIso(6),
    });
    await makeDependency(page, id, predecessor);
    const task = new WorkItemDetailPage(page);

    await task.goto(id);

    await task.summary.fact('when').click();
    await expect(task.tabs.tab('timing')).toHaveAttribute('aria-selected', 'true');

    await task.tabs.select('overview');
    await task.summary.fact('cost').click();
    await expect(task.tabs.tab('cost')).toHaveAttribute('aria-selected', 'true');

    await task.tabs.select('overview');
    await task.summary.fact('waitsFor').click();
    await expect(task.tabs.tab('timing')).toHaveAttribute('aria-selected', 'true');
    await expect(task.waitsFor.root).toBeVisible();
  });

  test('The Cost tab and the Site diary tab carry their counts', async ({ page, testPrefix }) => {
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} T4 Savings`);
    const id = await makeTask(page, `${testPrefix} T4 Counts`);
    await createCostLine(page, {
      kind: 'work_item',
      hostId: id,
      budgetSourceId: sourceId,
      description: `${testPrefix} T4 Line`,
      plannedAmount: 100,
    });
    const task = new WorkItemDetailPage(page);

    await task.goto(id);

    await expect(task.tabs.tab('cost')).toHaveText(/Cost \(1\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T5 / T6 (AC5, AC10): dependency lists
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Waits for (T5, AC5, AC10)', { tag: '@responsive' }, () => {
  test('First Add from the empty list, Edit type and lag, Remove with Undo', async ({
    page,
    testPrefix,
  }) => {
    const predecessorTitle = `${testPrefix} T5 Predecessor`;
    const predecessor = await makeTask(page, predecessorTitle);
    const id = await makeTask(page, `${testPrefix} T5 Main`);
    const task = new WorkItemDetailPage(page);

    await task.goto(id, { tab: 'timing' });
    await expect(
      task.waitsFor.emptyMessage("This task doesn't wait for another task."),
    ).toBeVisible();

    // Add: the task, how they connect and the lag
    await task.waitsFor.addAction('Add').click();
    const addDialog = task.dependencyDialog(dependencyDialogTitles.addWaitsFor);
    await addDialog.waitForOpen();
    await new EntityPickerControl(page, 'task', addDialog.dialog).pick(predecessorTitle);
    await addDialog.field('type').selectOption('start_to_start');
    await addDialog.field('lag').fill('2');
    await addDialog.save();
    await addDialog.waitForClosed();

    const row = task.waitsFor.row(predecessor);
    await expect(row).toContainText(predecessorTitle);
    await expect(row).toContainText('Starts before this starts');
    await expect(row).toContainText('2 days later');
    // The empty state's button is gone; focus moved to the list's own Add button
    await expect(task.waitsFor.addButton).toBeFocused();
    const saved = (await fetchTask(page, id)).dependencies.predecessors;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ dependencyType: 'start_to_start', leadLagDays: 2 });

    // Edit: type and lag only (the task cannot change)
    await task.waitsFor.editButton(predecessor).click();
    const editDialog = task.dependencyDialog(dependencyDialogTitles.edit(predecessorTitle));
    await editDialog.waitForOpen();
    await expect(editDialog.field('task')).toHaveCount(0);
    await expect(editDialog.field('type')).toHaveValue('start_to_start');
    await expect(editDialog.field('lag')).toHaveValue('2');
    await editDialog.field('type').selectOption('finish_to_finish');
    await editDialog.field('lag').fill('-1');
    await editDialog.save();
    await editDialog.waitForClosed();

    await expect(row).toContainText('Finishes before this finishes');
    await expect(row).toContainText('1 day earlier');
    await expect(task.waitsFor.editButton(predecessor)).toBeFocused();
    const edited = (await fetchTask(page, id)).dependencies.predecessors;
    expect(edited[0]).toMatchObject({ dependencyType: 'finish_to_finish', leadLagDays: -1 });

    // Remove acts at once; Undo brings it back with its type and lag
    await task.waitsFor.remove(predecessor);
    await expect(task.waitsFor.row(predecessor)).toHaveCount(0);
    expect((await fetchTask(page, id)).dependencies.predecessors).toHaveLength(0);
    await task.toasts.undoViaButton();
    await expect(task.waitsFor.row(predecessor)).toBeVisible();
    const restored = (await fetchTask(page, id)).dependencies.predecessors;
    expect(restored[0]).toMatchObject({ dependencyType: 'finish_to_finish', leadLagDays: -1 });
  });

  test('The task chooser leaves out the task itself and the ones already listed', async ({
    page,
    testPrefix,
  }) => {
    const listed = await makeTask(page, `${testPrefix} T5 Listed`);
    const free = await makeTask(page, `${testPrefix} T5 Free`);
    const id = await makeTask(page, `${testPrefix} T5 Chooser`);
    await makeDependency(page, id, listed);
    void free;
    const task = new WorkItemDetailPage(page);

    await task.goto(id, { tab: 'timing' });
    await task.dependencyAdd(task.waitsFor).click();
    const dialog = task.dependencyDialog(dependencyDialogTitles.addWaitsFor);
    await dialog.waitForOpen();
    const picker = new EntityPickerControl(page, 'task', dialog.dialog);
    await picker.type(`${testPrefix} T5`);

    await expect(picker.option(`${testPrefix} T5 Free`)).toBeVisible();
    await expect(picker.option(`${testPrefix} T5 Listed`)).toHaveCount(0);
    await expect(picker.option(`${testPrefix} T5 Chooser`)).toHaveCount(0);
  });

  test('Add asks for a task: saving with none chosen shows the field error', async ({
    page,
    testPrefix,
  }) => {
    const id = await makeTask(page, `${testPrefix} T5 Required`);
    const task = new WorkItemDetailPage(page);

    await task.goto(id, { tab: 'timing' });
    await task.dependencyAdd(task.waitsFor).click();
    const dialog = task.dependencyDialog(dependencyDialogTitles.addWaitsFor);
    await dialog.waitForOpen();
    // The task chooser opens its list on focus and the list covers Save: leave it first
    await dialog.heading.click();
    await expect(new EntityPickerControl(page, 'task', dialog.dialog).dropdown).toBeHidden();
    await dialog.save();

    await expect(dialog.fieldError('task')).toHaveText('Choose a task.');
    await dialog.cancel();
    await dialog.waitForClosed();
  });
});

test.describe('Waiting for this task (T6, AC5, AC10)', { tag: '@responsive' }, () => {
  test('Add a task that waits for this one; the strip then says what it holds up', async ({
    page,
    testPrefix,
  }) => {
    const successorTitle = `${testPrefix} T6 Successor`;
    const successor = await makeTask(page, successorTitle);
    const id = await makeTask(page, `${testPrefix} T6 Main`);
    const task = new WorkItemDetailPage(page);

    await task.goto(id, { tab: 'timing' });
    await expect(task.waiting.heading).toContainText('Waiting for this task');
    await expect(task.summary.fact('holdsUp')).toHaveText('Nothing');

    await task.waiting.addAction('Add').click();
    const dialog = task.dependencyDialog(dependencyDialogTitles.addWaiting);
    await dialog.waitForOpen();
    await new EntityPickerControl(page, 'task', dialog.dialog).pick(successorTitle);
    await dialog.save();
    await dialog.waitForClosed();

    const row = task.waiting.row(successor);
    await expect(row).toContainText(successorTitle);
    await expect(row).toContainText('Starts after this finishes');
    await expect(task.summary.fact('holdsUp')).toHaveText('1 task');
    const saved = (await fetchTask(page, id)).dependencies.successors;
    expect(saved).toHaveLength(1);
    expect(saved[0]!.workItem.id).toBe(successor);

    // Remove + Undo for this list too
    await task.waiting.remove(successor);
    await expect(task.waiting.row(successor)).toHaveCount(0);
    await task.toasts.undoViaButton();
    await expect(task.waiting.row(successor)).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T7 (AC5): milestones
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Milestones (T7, AC5)', { tag: '@responsive' }, () => {
  test('Link a milestone as "waits for" and as "counts toward"; Remove and Undo', async ({
    page,
    testPrefix,
  }) => {
    const gate = `${testPrefix} T7 Shell complete`;
    const goal = `${testPrefix} T7 Handover`;
    const gateId = await makeMilestone(page, gate);
    const goalId = await makeMilestone(page, goal);
    const id = await makeTask(page, `${testPrefix} T7 Main`);
    const task = new WorkItemDetailPage(page);

    await task.goto(id, { tab: 'timing' });
    await expect(task.milestones.emptyMessage('Not linked to a milestone.')).toBeVisible();

    // First link: this task waits for the milestone (the default relation)
    await task.milestoneAdd().click();
    await task.milestoneDialog.waitForOpen();
    await task.milestoneDialog.field('relation').selectOption('required');
    await new EntityPickerControl(page, 'milestone', task.milestoneDialog.dialog).pick(gate);
    await task.milestoneDialog.save();
    await task.milestoneDialog.waitForClosed();
    const gateRow = task.milestones.row(`required:${gateId}`);
    await expect(gateRow).toContainText(gate);
    await expect(gateRow).toContainText('Waits for');

    // Second link: this task counts toward the milestone
    await task.milestoneAdd().click();
    await task.milestoneDialog.waitForOpen();
    await task.milestoneDialog.field('relation').selectOption('linked');
    await new EntityPickerControl(page, 'milestone', task.milestoneDialog.dialog).pick(goal);
    await task.milestoneDialog.save();
    await task.milestoneDialog.waitForClosed();
    const goalRow = task.milestones.row(`linked:${goalId}`);
    await expect(goalRow).toContainText('Counts toward');

    const response = await page.request.get(`${API.workItems}/${id}/milestones`);
    const linked = (await response.json()) as {
      required: Array<{ id: number }>;
      linked: Array<{ id: number }>;
    };
    expect(linked.required.map((milestone) => milestone.id)).toEqual([gateId]);
    expect(linked.linked.map((milestone) => milestone.id)).toEqual([goalId]);

    // Remove acts at once, Undo restores it
    await task.milestones.remove(`linked:${goalId}`);
    await expect(task.milestones.row(`linked:${goalId}`)).toHaveCount(0);
    await task.toasts.undoViaButton();
    await expect(task.milestones.row(`linked:${goalId}`)).toBeVisible();
    // The milestone is a link to its own page
    await expect(task.milestones.link(`linked:${goalId}`)).toHaveAttribute(
      'href',
      routeUrl('milestone', { id: goalId }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T8 (AC5): purchases
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Purchases waiting for this task (T8, AC5)', { tag: '@responsive' }, () => {
  test('A purchase that waits for the task is listed read-only with its status', async ({
    page,
    testPrefix,
  }) => {
    const purchaseName = `${testPrefix} T8 Armchair`;
    const purchaseId = await createHouseholdItemViaApi(page, {
      name: purchaseName,
      category: 'hic-furniture',
      status: 'planned',
    });
    cleanup.fns.push(() => deleteHouseholdItemViaApi(page, purchaseId));
    const id = await makeTask(page, `${testPrefix} T8 Main`);
    const dependency = await page.request.post(`${API.householdItems}/${purchaseId}/dependencies`, {
      data: { predecessorType: 'work_item', predecessorId: id },
    });
    expect(dependency.ok(), 'POST purchase dependency').toBeTruthy();
    const task = new WorkItemDetailPage(page);

    await task.goto(id, { tab: 'timing' });

    await expect(task.purchases.heading).toContainText('Purchases waiting for this task');
    const row = task.purchases.row(purchaseId);
    await expect(row).toContainText(purchaseName);
    await expect(page.getByTestId(`task-purchase-status-${purchaseId}`)).toHaveText('Planned');
    await expect(task.purchases.link(purchaseId)).toHaveAttribute(
      'href',
      routeUrl('householdItem', { id: purchaseId }),
    );
    // Read-only: the dependency belongs to the purchase
    await expect(task.purchases.actionsTrigger(purchaseId)).toHaveCount(0);
    await expect(task.purchases.addButton).toHaveCount(0);
  });

  test('Without purchases the list is not shown', async ({ page, testPrefix }) => {
    const id = await makeTask(page, `${testPrefix} T8 None`);
    const task = new WorkItemDetailPage(page);

    await task.goto(id, { tab: 'timing' });
    await expect(task.waitsFor.root).toBeVisible();

    await expect(task.purchases.root).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T9 (AC5): Dates, Constraints and Reschedule
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dates, Constraints and Reschedule (T9, AC5)', { tag: '@responsive' }, () => {
  test('The Dates card saves the duration; the Constraints card saves Not before and Start by', async ({
    page,
    testPrefix,
  }) => {
    const id = await makeTask(page, `${testPrefix} T9 Cards`, { durationDays: 3 });
    const task = new WorkItemDetailPage(page);

    await task.goto(id, { tab: 'timing' });
    await expect(page.getByTestId('task-duration')).toContainText('3 days');

    await task.datesCard.startEdit();
    await expect(task.input('task-duration-input')).toHaveValue('3');
    await task.input('task-duration-input').fill('7');
    await task.datesCard.save();
    await expect(page.getByTestId('task-duration')).toContainText('7 days');
    expect((await fetchTask(page, id)).durationDays).toBe(7);

    // Start by cannot be before Not before
    await task.constraintsCard.startEdit();
    await task.input('task-not-before-input').fill(todayIso(10));
    await task.input('task-start-by-input').fill(todayIso(5));
    await task.constraintsCard.saveButton.click();
    await expect(page.getByText("Start by can't be before Not before.")).toBeVisible();
    await expect(task.constraintsCard.form).toBeVisible();

    await task.input('task-start-by-input').fill(todayIso(20));
    await task.constraintsCard.save();
    const saved = await fetchTask(page, id);
    expect(saved.startAfter).toBe(todayIso(10));
    expect(saved.startBefore).toBe(todayIso(20));
  });

  test('Reschedule previews a longer duration, Save applies it and Undo restores the dates', async ({
    page,
    testPrefix,
  }) => {
    const id = await makeTask(page, `${testPrefix} T9 Resched`, {
      status: 'not_started',
      startDate: todayIso(1),
      endDate: todayIso(6),
      durationDays: 5,
    });
    const successor = await makeTask(page, `${testPrefix} T9 Successor`, {
      status: 'not_started',
      startDate: todayIso(7),
      endDate: todayIso(9),
    });
    await makeDependency(page, successor, id);
    const before = await fetchTask(page, id);
    const task = new WorkItemDetailPage(page);

    await task.goto(id, { tab: 'timing' });
    await task.rescheduleButton.click();
    await expect(task.rescheduleSection).toBeVisible();
    // The button is replaced by the section while it is open
    await expect(task.rescheduleButton).toHaveCount(0);

    const save = page.getByTestId('reschedule-save');
    await expect(save).toBeDisabled();
    const duration = page.getByTestId('reschedule-duration');
    const original = Number(await duration.inputValue());
    await duration.fill(String(original + 3));
    await expect(save).toBeEnabled();
    await expect(page.getByTestId(`reschedule-preview-item-${successor}`)).toBeVisible();

    await save.click();

    await expect(task.toasts.undoToast).toBeVisible();
    await expect(task.rescheduleSection).toHaveCount(0);
    // Focus returns to the Reschedule button
    await expect(task.rescheduleButton).toBeFocused();
    await expect.poll(async () => (await fetchTask(page, id)).durationDays).toBe(original + 3);

    await task.toasts.undoViaButton();
    await expect.poll(async () => (await fetchTask(page, id)).endDate).toBe(before.endDate);
  });

  test('Cancel closes the Reschedule section without a write', async ({ page, testPrefix }) => {
    const id = await makeTask(page, `${testPrefix} T9 Cancel`, {
      status: 'not_started',
      startDate: todayIso(1),
      endDate: todayIso(4),
      durationDays: 3,
    });
    const before = await fetchTask(page, id);
    const task = new WorkItemDetailPage(page);

    await task.goto(id, { tab: 'timing' });
    await task.rescheduleButton.click();
    await page.getByTestId('reschedule-duration').fill('9');
    await page.getByTestId('reschedule-cancel').click();

    await expect(task.rescheduleSection).toHaveCount(0);
    await expect(task.rescheduleButton).toBeFocused();
    expect((await fetchTask(page, id)).durationDays).toBe(before.durationDays);
  });

  test('A done task cannot be rescheduled', async ({ page, testPrefix }) => {
    const id = await makeTask(page, `${testPrefix} T9 Done`, {
      status: 'completed',
      startDate: todayIso(-6),
      endDate: todayIso(-1),
    });
    const task = new WorkItemDetailPage(page);

    await task.goto(id, { tab: 'timing' });

    await expect(task.datesCard.root).toBeVisible();
    await expect(task.rescheduleButton).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T10 (D15): deep links
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Deep links (T10, D15)', { tag: '@responsive' }, () => {
  test('?depError= lands on Timing with the banner; the parameter is gone and Close hides it', async ({
    page,
    testPrefix,
  }) => {
    const id = await makeTask(page, `${testPrefix} T10 Dep Error`);
    const task = new WorkItemDetailPage(page);

    await task.goto(id, { query: { depError: 'Alpha, Beta' } });

    await expect(task.tabs.tab('timing')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText("Couldn't add these dependencies: Alpha, Beta")).toBeVisible();
    await expect(page).toHaveURL(
      (url) =>
        url.searchParams.get('tab') === 'timing' &&
        url.searchParams.get('depError') === null &&
        url.hash === '',
    );

    await task.depErrorDismiss.click();
    await expect(page.getByText("Couldn't add these dependencies: Alpha, Beta")).toHaveCount(0);
  });

  test('#reschedule opens the Reschedule section of a task that can be rescheduled', async ({
    page,
    testPrefix,
  }) => {
    const id = await makeTask(page, `${testPrefix} T10 Reschedule`, {
      status: 'in_progress',
      startDate: todayIso(-3),
      endDate: todayIso(4),
    });
    const task = new WorkItemDetailPage(page);

    await task.goto(id, { tab: 'timing', hash: '#reschedule' });

    await expect(task.rescheduleSection).toBeVisible();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get('tab') === 'timing' && url.hash === '',
    );
  });

  test('#constraints, and #reschedule on a task that cannot be rescheduled, start editing the Constraints card', async ({
    page,
    testPrefix,
  }) => {
    // An undated task still has forecast dates, so it CAN be rescheduled: a done task cannot
    const id = await makeTask(page, `${testPrefix} T10 Constraints`);
    const done = await makeTask(page, `${testPrefix} T10 Done`, { status: 'completed' });
    const task = new WorkItemDetailPage(page);

    await task.goto(id, { hash: '#constraints' });
    await expect(task.tabs.tab('timing')).toHaveAttribute('aria-selected', 'true');
    await expect(task.constraintsCard.form).toBeVisible();

    await task.goto(done, { query: { tab: 'overview' }, hash: '#reschedule' });
    await expect(task.constraintsCard.form).toBeVisible();
    await expect(task.rescheduleSection).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T11 (AC6): Cost tab
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Cost tab (T11, AC6)', { tag: '@responsive' }, () => {
  test('Cost lines show Estimates first; Add cost line adds a row; New invoice opens with the task', async ({
    page,
    testPrefix,
  }) => {
    const title = `${testPrefix} T11 Cost Task`;
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} T11 Savings`);
    const id = await makeTask(page, title);
    await createCostLine(page, {
      kind: 'work_item',
      hostId: id,
      budgetSourceId: sourceId,
      description: `${testPrefix} T11 Estimate line`,
      plannedAmount: 400,
    });
    const task = new WorkItemDetailPage(page);

    await task.goto(id, { tab: 'cost' });
    await task.costLines.waitForLoaded();
    await expect(task.costLines.groupHeading('Estimates')).toBeVisible();
    await expect(
      task.costLines.stateChip(task.costLines.row(`${testPrefix} T11 Estimate line`)),
    ).toHaveText('Estimate');

    // Add cost line
    const form = new CostLineFormDialog(page, 'New cost line');
    await task.costLines.addButton.click();
    await form.waitForOpen();
    await form.fillDirect(`${testPrefix} T11 Added line`, '250');
    await form.save();
    await form.waitForClosed();
    await expect(task.costLines.row(`${testPrefix} T11 Added line`)).toBeVisible();
    await expect(task.tabs.tab('cost')).toHaveText(/Cost \(2\)/);

    // New invoice opens with the task preset; Cancel returns focus to the button
    const invoice = new InvoiceFormDialog(page, 'invoice');
    await task.costLines.newInvoiceButton.click();
    await invoice.waitForOpen();
    await expect(invoice.itemChip()).toContainText(title);
    await invoice.cancel();
    await invoice.waitForClosed();
    await expect(task.costLines.newInvoiceButton).toBeFocused();
  });

  test('Grants: Add from the empty list, the strip names the grant, Remove and Undo', async ({
    page,
    testPrefix,
  }) => {
    const grantName = `${testPrefix} T11 Heat pump grant`;
    const grantId = await createGrant(page, grantName);
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} T11 Grant Savings`);
    const id = await makeTask(page, `${testPrefix} T11 Grant Task`);
    await createCostLine(page, {
      kind: 'work_item',
      hostId: id,
      budgetSourceId: sourceId,
      description: `${testPrefix} T11 Grant line`,
      plannedAmount: 1000,
      includesVat: true,
    });
    const task = new WorkItemDetailPage(page);

    await task.goto(id, { tab: 'cost' });
    await expect(task.grants.emptyMessage('No grant covers this task.')).toBeVisible();

    await task.grants.addAction('Add').click();
    await task.grantPicker.pick(grantName);

    const row = task.grants.row(grantId);
    await expect(row).toContainText(grantName);
    await expect(row).toContainText('Approved');
    await expect(task.grants.link(grantId)).toHaveAttribute(
      'href',
      routeUrl('grant', { id: grantId }),
    );
    expect(await fetchGrantIds(page, id)).toEqual([grantId]);
    // AC2: the strip names the grant next to the expected cost
    await expect(task.summary.fact('cost')).toContainText(grantName);

    await task.grants.remove(grantId);
    await expect(task.grants.row(grantId)).toHaveCount(0);
    expect(await fetchGrantIds(page, id)).toEqual([]);
    await task.toasts.undoViaButton();
    await expect(task.grants.row(grantId)).toBeVisible();
    expect(await fetchGrantIds(page, id)).toEqual([grantId]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T12 (AC7): Site diary
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Site diary tab (T12, AC7)', { tag: '@responsive' }, () => {
  test('The company block and the collapsed "other entries" block; Log for this task pre-selects area and company', async ({
    page,
    testPrefix,
  }) => {
    const seed = await seedDiaryFeed(page, testPrefix, { photoCount: 2 });
    cleanup.fns.push(seed.cleanup);
    const id = await makeTask(page, `${testPrefix} T12 Diary Task`, {
      status: 'in_progress',
      startDate: todayIso(-10),
      endDate: todayIso(3),
      areaId: seed.areaId,
      assignedVendorId: seed.companyId,
    });
    const task = new WorkItemDetailPage(page);

    await task.goto(id, { tab: 'diary' });

    // Block 1: the entries that name the task's company within the task's dates
    await expect(task.diaryCompanyBlock).toBeVisible();
    await expect(task.diaryCompanyBlock).toContainText(seed.dailyLogTitle);
    await expect(task.diaryCompanyBlock).toContainText(seed.singleWorkerLogTitle);
    await expect(task.diaryCompanyBlock).not.toContainText(seed.photoNoteTitle);

    // Block 2: photo-tagged entries of the task's area, collapsed and labelled
    await expect(task.diaryOther).toBeVisible();
    await expect(task.diaryOther).not.toHaveAttribute('open', '');
    await expect(task.diaryOtherSummary).toContainText('Other entries');
    await expect(task.diaryOtherSummary).toContainText('from photo tags and dates');
    await expect(task.diaryOtherFeed).toBeHidden();
    await task.diaryOtherSummary.click();
    await expect(task.diaryOtherFeed).toBeVisible();
    await expect(task.diaryOtherFeed).toContainText(seed.photoNoteTitle);

    // Log for this task: the capture screen opens with the area and the company chosen
    await task.diaryLog.click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === routeUrl('diaryEntryNew') &&
        url.searchParams.get('areaId') === seed.areaId &&
        url.searchParams.get('companyId') === seed.companyId,
    );
    const capture = new DiaryCapturePage(page);
    await capture.waitForForm();
    await expect(capture.companyChip(seed.companyName)).toHaveAttribute('aria-pressed', 'true');
  });

  test('A task without a company, an area or dates shows the empty state with Log for this task', async ({
    page,
    testPrefix,
  }) => {
    const id = await makeTask(page, `${testPrefix} T12 Empty`);
    const task = new WorkItemDetailPage(page);

    await task.goto(id, { tab: 'diary' });

    await expect(page.getByText('No entries for this task yet.')).toBeVisible();
    await expect(task.diaryLog).toBeVisible();
    await expect(task.diaryOther).toHaveCount(0);
  });

  test('Log for this task drops a company id that no longer exists: no company chip is selected', async ({
    page,
    testPrefix,
  }) => {
    const id = await makeTask(page, `${testPrefix} T12 Unknown Company`);
    const unknownCompanyId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    // The detail answer names a company the capture screen cannot find
    await page.route(`**${API.workItems}/${id}`, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      const response = await route.fetch();
      const body = (await response.json()) as Record<string, unknown>;
      await route.fulfill({
        response,
        json: {
          ...body,
          assignedVendor: { id: unknownCompanyId, name: 'Ghost Company', phone: null },
        },
      });
    });
    const task = new WorkItemDetailPage(page);

    await task.goto(id, { tab: 'diary' });
    await task.diaryLog.click();

    await expect(page).toHaveURL(
      (url) =>
        url.pathname === routeUrl('diaryEntryNew') &&
        url.searchParams.get('companyId') === unknownCompanyId,
    );
    const capture = new DiaryCapturePage(page);
    await capture.waitForForm();
    const companies = page.getByTestId('capture-company');
    await expect(companies).toBeVisible();
    await expect(companies.locator('[aria-pressed="true"]')).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T13 (AC8): Documents fact and Delete with counts
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Documents and Delete (T13, AC8)', { tag: '@responsive' }, () => {
  test('With Paperless configured the strip ends with a Documents fact that opens the panel', async ({
    page,
    testPrefix,
  }) => {
    const id = await makeTask(page, `${testPrefix} T13 Documents`);
    await mockPaperlessConfigured(page);
    const task = new WorkItemDetailPage(page);

    await task.goto(id);

    await expect(task.summary.fact('documents')).toBeVisible();
    const ids = await task.summary.factIds();
    expect(ids.at(-1)).toBe('documents');
    await expect(task.summary.fact('documents')).toHaveText('0');

    const panel = new DocumentsPanel(page);
    await panel.open('summary-fact-documents');
    await expect(panel.title).toHaveText('Documents (0)');
  });

  test('Delete names what goes with the task; Cancel keeps it, Delete removes it and lands on the list', async ({
    page,
    testPrefix,
  }) => {
    const title = `${testPrefix} T13 Delete Task`;
    const predecessor = await makeTask(page, `${testPrefix} T13 Predecessor`);
    const milestoneId = await makeMilestone(page, `${testPrefix} T13 Milestone`);
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} T13 Savings`);
    const id = await createWorkItemViaApi(page, { title });
    cleanup.fns.push(() => deleteWorkItemViaApi(page, id));
    await makeDependency(page, id, predecessor);
    await createCostLine(page, {
      kind: 'work_item',
      hostId: id,
      budgetSourceId: sourceId,
      description: `${testPrefix} T13 Line`,
      plannedAmount: 100,
    });
    for (const [position, itemTitle] of ['One', 'Two'].entries()) {
      const seeded = await page.request.post(`${API.workItems}/${id}/subtasks`, {
        data: { title: `${testPrefix} ${itemTitle}`, position },
      });
      expect(seeded.ok(), 'POST subtask').toBeTruthy();
    }
    const note = await page.request.post(`${API.workItems}/${id}/notes`, {
      data: { content: `${testPrefix} T13 Note` },
    });
    expect(note.ok(), 'POST note').toBeTruthy();
    const linked = await page.request.post(
      `${API.workItems}/${id}/milestones/linked/${milestoneId}`,
    );
    expect(linked.ok(), 'POST milestone link').toBeTruthy();
    const task = new WorkItemDetailPage(page);

    await task.goto(id);
    await task.openDeleteModal();

    await expect(task.deleteDialog.consequence(/Subtasks deleted with it/)).toContainText('2');
    await expect(task.deleteDialog.consequence(/Notes deleted with it/)).toContainText('1');
    await expect(task.deleteDialog.consequence(/Cost lines deleted with it/)).toContainText('1');
    await expect(task.deleteDialog.consequence(/Dependencies removed with it/)).toContainText('1');
    await expect(
      task.deleteDialog.consequence(/Milestones it no longer counts toward/),
    ).toContainText('1');

    await task.cancelDelete();
    await expect(task.heading).toHaveText(title);
    expect((await page.request.get(`${API.workItems}/${id}`)).status()).toBe(200);

    await task.openDeleteModal();
    await task.deleteDialog.confirm();
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('workItems'));
    expect((await page.request.get(`${API.workItems}/${id}`)).status()).toBe(404);
    // Back must not land on the deleted task
    await page.goBack();
    await expect(page).not.toHaveURL(new RegExp(`${escapeRegExp(id)}`));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T14 (AC9): the strip stays short
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Strip height (T14, AC9)', { tag: '@responsive' }, () => {
  test('The fullest strip ends within 450px on a desktop and within 844px on a phone', async ({
    page,
    testPrefix,
  }) => {
    const companyId = await makeCompany(page, `${testPrefix} T14 Roofing Ltd`, '+49 30 5550142');
    const areaId = await makeArea(page, `${testPrefix} T14 Roof`);
    const predecessor = await makeTask(page, `${testPrefix} T14 Predecessor`);
    const id = await makeTask(page, `${testPrefix} T14 Main`, {
      status: 'not_started',
      startDate: todayIso(2),
      endDate: todayIso(6),
      areaId,
      assignedVendorId: companyId,
    });
    const successor = await makeTask(page, `${testPrefix} T14 Successor`);
    await makeDependency(page, id, predecessor);
    await makeDependency(page, successor, id);
    const sourceId = await createFundingSource(page, cleanup, `${testPrefix} T14 Savings`);
    await createCostLine(page, {
      kind: 'work_item',
      hostId: id,
      budgetSourceId: sourceId,
      description: `${testPrefix} T14 Line`,
      plannedAmount: 5000,
    });
    const grantId = await createGrant(page, `${testPrefix} T14 Roof grant`);
    await page.request.post(`${API.workItems}/${id}/subsidies`, {
      data: { subsidyProgramId: grantId },
    });
    await mockPaperlessConfigured(page);
    const task = new WorkItemDetailPage(page);

    await task.goto(id);
    await expect(task.summary.fact('documents')).toBeVisible();
    await expect(task.callButton).toBeVisible();
    // Call + grant + Documents: all seven facts are in
    expect(await task.summary.factIds()).toHaveLength(7);

    const box = await task.summary.stripBox();
    const width = page.viewportSize()?.width ?? 1280;
    // A desktop strip ends within 450px of the top; below 1024px the facts stack, so the limit
    // is a phone screen's height (844px)
    const limit = width >= 1024 ? 450 : 844;
    expect(box.bottom, `strip bottom at width ${width}`).toBeLessThanOrEqual(limit);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T15 (AC10): New task "Waits for"
// ─────────────────────────────────────────────────────────────────────────────

test.describe('New task: Waits for (T15, D16)', { tag: '@responsive' }, () => {
  test('Chosen tasks become finish-to-start dependencies and the new page lists them', async ({
    page,
    testPrefix,
  }) => {
    const firstTitle = `${testPrefix} T15 First`;
    const secondTitle = `${testPrefix} T15 Second`;
    const first = await makeTask(page, firstTitle);
    const second = await makeTask(page, secondTitle);
    const created = `${testPrefix} T15 Created`;
    const create = new WorkItemCreatePage(page);

    await create.goto();
    await create.fillTitle(created);
    await create.expandMoreDetails();
    await expect(create.waitsFor).toBeVisible();
    await create.waitsForPicker.pick(firstTitle);
    await create.waitsForPicker.pick(secondTitle);
    await expect(create.waitsForChip(first)).toBeVisible();
    await expect(create.waitsForChip(second)).toBeVisible();

    const responsePromise = page.waitForResponse(
      (resp) => resp.url().endsWith(API.workItems) && resp.request().method() === 'POST',
    );
    await create.submit();
    const posted = (await (await responsePromise).json()) as {
      workItem?: { id: string };
      id?: string;
    };
    const body = { id: (posted.workItem?.id ?? posted.id)! };
    expect(body.id).toBeTruthy();
    cleanup.fns.push(() => deleteWorkItemViaApi(page, body.id));

    await page.waitForURL((url) => url.pathname === routeUrl('workItem', { id: body.id }));
    const task = new WorkItemDetailPage(page);
    await expect(task.heading).toHaveText(created);

    const saved = (await fetchTask(page, body.id)).dependencies.predecessors;
    expect(saved.map((dependency) => dependency.workItem.id).sort()).toEqual(
      [first, second].sort(),
    );
    for (const dependency of saved) {
      expect(dependency).toMatchObject({ dependencyType: 'finish_to_start', leadLagDays: 0 });
    }

    await task.openTab('timing');
    await expect(task.waitsFor.row(first)).toBeVisible();
    await expect(task.waitsFor.row(second)).toBeVisible();
  });

  test('The create form uses the renamed labels', async ({ page }) => {
    const create = new WorkItemCreatePage(page);

    await create.goto();
    await create.expandMoreDetails();

    const dialog = create.dialog;
    await expect(dialog.getByText('Who', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Not before', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Start by', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Waits for', { exact: true })).toBeVisible();
    for (const former of ['Assigned To', 'Start After', 'Start Before', 'Dependencies']) {
      await expect(dialog.getByText(former, { exact: true })).toHaveCount(0);
    }
    await expect(create.titleInput).toHaveAttribute('placeholder', 'What needs doing?');
  });
});
