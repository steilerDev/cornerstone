/**
 * E2E tests for the Area page (`/areas/:id`, Story #2251 / EPIC-21, P5.7).
 *
 * One scrolling page per area: header with Log here, room chips, a four-fact strip, and the
 * sections Now & next here, Latest from the site, Companies here, Rooms and Cost. Every figure
 * covers the area plus all its descendants; items booked on an ancestor are shown as muted context
 * rows and never added.
 *
 * Scenarios:
 *   1. AC1  Breadcrumb, h1, tab title, Log here at every width, New menu pre-fill (desktop), room
 *           chips on a floor (none on a leaf) that open the child page; the Areas index row link
 *   2. AC2  Strip: Tasks "n open · m late", Expected cost with "Paid €…", Photos with the latest
 *           date, Companies; the facts navigate (Tasks list, Photos) or jump to a section
 *   3. AC3  Sections in order; Now & next footer links; Call only for a company with a phone;
 *           Rooms with photo counts; Cost with gross and the net tip
 *   4. AC4  A task booked on the floor / building shows as a context row on a room, is not counted
 *           in the room, and the context row opens that ancestor
 *   6. AC6  "Photos of ‹area›" opens /photos?areaId= with the removable chip; removing it shows
 *           every row; the area page has no spot grid
 *   7. AC7  Cost lines are grouped under their owner's link; the empty state keeps "Open Money"
 *   8. AC8  The same dated late task reads "Late · 5 d" on the area page and the Tasks list
 *   9.      Unknown id: "Area not found" and Back to Areas
 *  10.      Responsive: no sideways scroll at any width, strip columns, chip row scrolls; dark mode
 *
 * (AC5, the Areas index Expected cost column, is covered in `areas-index.spec.ts`; the Paid figure
 * equals the money service in FC9 of `figure-consistency.spec.ts`.)
 *
 * Data: synthetic prefixed areas, tasks, purchases, companies and diary photos created through the
 * API per test; names carry the worker `testPrefix` plus a per-test tag. Late cases use DATED tasks
 * (an undated task projects from today and is never late).
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import {
  createAreaViaApi,
  createDiaryEntryViaApi,
  createHouseholdItemViaApi,
  createVendorViaApi,
  createWorkItemViaApi,
  deleteAreaViaApi,
  deleteDiaryEntryViaApi,
  deleteHouseholdItemViaApi,
  deleteVendorViaApi,
  deleteWorkItemViaApi,
  uploadDiaryPhotoViaApi,
} from '../../fixtures/apiHelpers.js';
import {
  createCostLine,
  createFundingSource,
  createInvoice,
  createLinkedCostLine,
  createVendor,
  newCleanup,
  runCleanup,
} from '../../fixtures/costLineSeed.js';
import type { SeedCleanup } from '../../fixtures/costLineSeed.js';
import { dayOffset } from '../../fixtures/homeMocks.js';
import { parseMoney } from '../../fixtures/figureSurfaces.js';
import { AreaPage } from '../../pages/AreaPage.js';
import { AreasIndexPage } from '../../pages/AreasIndexPage.js';
import { CreateMenu } from '../../pages/components/CreateMenu.js';
import { PhotosPage } from '../../pages/PhotosPage.js';
import { WorkItemsPage } from '../../pages/WorkItemsPage.js';

const NONEXISTENT_UUID = '00000000-0000-4000-8000-000000000000';

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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Per-test tag so two tests of one worker never reuse a name. */
function newTag(testPrefix: string): string {
  return `${testPrefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

function isPhone(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) < 768;
}

function isDesktop(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) >= 1024;
}

interface Tree {
  buildingId: string;
  floorId: string;
  room1Id: string;
  room2Id: string;
  names: { building: string; floor: string; room1: string; room2: string };
}

/**
 * building > floor > (room 1, room 2). Areas are registered first so the (reverse-order) cleanup
 * deletes them last, after the tasks, entries and companies that reference them.
 */
async function seedTree(page: Page, tag: string): Promise<Tree> {
  const names = {
    building: `Haus ${tag}`,
    floor: `Erdgeschoss ${tag}`,
    room1: `Wohnzimmer ${tag}`,
    room2: `Flur ${tag}`,
  };
  const buildingId = await createAreaViaApi(page, { name: names.building });
  cleanup.fns.push(() => deleteAreaViaApi(page, buildingId));
  const floorId = await createAreaViaApi(page, { name: names.floor, parentId: buildingId });
  cleanup.fns.push(() => deleteAreaViaApi(page, floorId));
  const room1Id = await createAreaViaApi(page, {
    name: names.room1,
    parentId: floorId,
    sortOrder: 0,
  });
  cleanup.fns.push(() => deleteAreaViaApi(page, room1Id));
  const room2Id = await createAreaViaApi(page, {
    name: names.room2,
    parentId: floorId,
    sortOrder: 1,
  });
  cleanup.fns.push(() => deleteAreaViaApi(page, room2Id));
  return { buildingId, floorId, room1Id, room2Id, names };
}

async function makeTask(
  page: Page,
  title: string,
  fields: Record<string, unknown> = {},
): Promise<string> {
  const id = await createWorkItemViaApi(page, { title, ...fields });
  cleanup.fns.push(() => deleteWorkItemViaApi(page, id));
  return id;
}

async function makePurchase(
  page: Page,
  name: string,
  fields: Record<string, unknown> = {},
): Promise<string> {
  const id = await createHouseholdItemViaApi(page, { name, ...fields });
  cleanup.fns.push(() => deleteHouseholdItemViaApi(page, id));
  return id;
}

async function makeCompany(page: Page, name: string, phone?: string): Promise<string> {
  const id = await createVendorViaApi(page, { name, ...(phone ? { phone } : {}) });
  cleanup.fns.push(() => deleteVendorViaApi(page, id));
  return id;
}

/** A saved diary entry with one photo tagged with the area. */
async function makePhoto(page: Page, areaId: string, date: string, title: string): Promise<string> {
  const entryId = await createDiaryEntryViaApi(page, {
    entryType: 'daily_log',
    entryDate: date,
    title,
    body: 'Synthetic body',
  });
  cleanup.fns.push(() => deleteDiaryEntryViaApi(page, entryId));
  await uploadDiaryPhotoViaApi(page, entryId, { areaId });
  return entryId;
}

/** A late (dated) task: it started five days ago and runs three days, so it reads "Late · 5 d". */
async function makeLateTask(
  page: Page,
  title: string,
  areaId: string,
  fields: Record<string, unknown> = {},
): Promise<string> {
  return makeTask(page, title, {
    status: 'not_started',
    startDate: dayOffset(-5),
    durationDays: 3,
    areaId,
    ...fields,
  });
}

/** A task in the area whose single cost line (500) is linked to a PAID invoice. */
async function makePaidTask(page: Page, title: string, areaId: string): Promise<string> {
  const vendorId = await createVendor(page, cleanup, `${title} Co`);
  const sourceId = await createFundingSource(page, cleanup, `${title} Source`);
  const taskId = await makeTask(page, title, { areaId });
  const invoice = await createInvoice(page, cleanup, vendorId, {
    amount: 500,
    status: 'paid',
    invoiceNumber: `${title}-INV`.slice(0, 40),
  });
  await createLinkedCostLine(page, invoice.id, {
    kind: 'work_item',
    hostId: taskId,
    budgetSourceId: sourceId,
    description: `${title} line`,
    plannedAmount: 500,
    itemizedAmount: 500,
  });
  return taskId;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. AC1: header, breadcrumb, Log here, chips
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Area page: header (AC1)', { tag: '@responsive' }, () => {
  test(
    'The page shows the area as h1 with the ancestor trail and Log here',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const tree = await seedTree(page, newTag(testPrefix));
      const area = new AreaPage(page);
      await area.goto(tree.room1Id);

      await expect(area.heading).toHaveText(tree.names.room1);
      await expect(page).toHaveTitle(new RegExp(escapeRegExp(tree.names.room1)));
      await area.breadcrumbs.expectTrail(['Areas', tree.names.building, tree.names.floor]);
      if (isDesktop(page)) {
        // Each ancestor is a link to its own page
        await expect(area.breadcrumbs.trailLink(tree.names.floor)).toHaveAttribute(
          'href',
          routeUrl('area', { id: tree.floorId }),
        );
        await expect(area.breadcrumbs.trailLink(tree.names.building)).toHaveAttribute(
          'href',
          routeUrl('area', { id: tree.buildingId }),
        );
      }

      // Log here is the one primary at every width and carries the area (the href gains the
      // param after a re-render, so wait for it)
      await expect(area.logHere).toBeVisible();
      await expect(area.logHere).toHaveText('Log here');
      await expect(area.logHere).toHaveAttribute(
        'href',
        new RegExp(`^/diary/new\\?(.*&)?areaId=${tree.room1Id}(&|$)`),
      );
    },
  );

  test('A top-level area shows just Areas in the trail', async ({ page, testPrefix }) => {
    const tree = await seedTree(page, newTag(testPrefix));
    const area = new AreaPage(page);
    await area.goto(tree.buildingId);
    await expect(area.heading).toHaveText(tree.names.building);
    await area.breadcrumbs.expectTrail(['Areas']);
  });

  test('On desktop the New menu pre-fills the area', async ({ page, testPrefix }) => {
    test.skip(!isDesktop(page), 'the top-bar New menu exists from 1024px');
    const tree = await seedTree(page, newTag(testPrefix));
    const area = new AreaPage(page);
    const createMenu = new CreateMenu(page);
    await area.goto(tree.room1Id);

    await createMenu.open();
    await expect(createMenu.row('task')).toHaveAttribute(
      'href',
      new RegExp(`areaId=${tree.room1Id}`),
    );
    await expect(createMenu.row('diaryEntry')).toHaveAttribute(
      'href',
      new RegExp(`areaId=${tree.room1Id}`),
    );
  });

  test('Room chips appear on a floor and open the child page; a leaf has none', async ({
    page,
    testPrefix,
  }) => {
    const tree = await seedTree(page, newTag(testPrefix));
    const area = new AreaPage(page);

    await area.goto(tree.room1Id);
    await expect(area.chipGroup(tree.names.room1)).toHaveCount(0);

    await area.goto(tree.floorId);
    await expect(area.chipGroup(tree.names.floor)).toBeVisible();
    await expect(area.chip(tree.room1Id)).toHaveAttribute(
      'href',
      routeUrl('area', { id: tree.room1Id }),
    );
    await expect(area.chip(tree.room2Id)).toBeVisible();
    await area.chip(tree.room2Id).click();
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('area', { id: tree.room2Id }));
    await expect(area.heading).toHaveText(tree.names.room2);
  });

  test('An Areas index row name opens the page and Back returns to the index', async ({
    page,
    testPrefix,
  }) => {
    const tree = await seedTree(page, newTag(testPrefix));
    const areas = new AreasIndexPage(page);
    const area = new AreaPage(page);
    await areas.goto();
    await expect(areas.nameLink(tree.room1Id)).toBeVisible();
    await areas.nameLink(tree.room1Id).click();

    await expect(area.heading).toHaveText(tree.names.room1);
    await expect(area.breadcrumbs.backLink).toContainText('Areas');
    await area.breadcrumbs.backLink.click();
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('areas'));
    await expect(areas.heading).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. AC2: the strip
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Area page: summary strip (AC2)', { tag: '@responsive' }, () => {
  test('The strip shows Tasks, Expected cost with Paid, Photos and Companies, and the facts navigate', async ({
    page,
    testPrefix,
  }) => {
    const tag = newTag(testPrefix);
    const tree = await seedTree(page, tag);
    const companyId = await makeCompany(page, `Handwerk ${tag}`);
    // One late task (dated) with the company, one more open task with a paid cost line
    await makeLateTask(page, `Late task ${tag}`, tree.room1Id, { assignedVendorId: companyId });
    await makePaidTask(page, `Paid task ${tag}`, tree.room1Id);
    await makePhoto(page, tree.room1Id, '2026-03-05', `Entry ${tag}`);

    const area = new AreaPage(page);
    await area.goto(tree.room1Id);
    await expect(area.summary.root).toBeVisible();
    await area.expectFactOrder();

    // Tasks: open count with the late remark
    await expect(area.summary.fact('tasks')).toContainText('2 open');
    await expect(area.summary.fact('tasks')).toContainText('1 late');
    // Expected cost with the Paid remark ("€… · Paid €…")
    await expect(area.summary.fact('cost')).toContainText(/€\s?[\d,]+\.\d{2}/);
    await expect(area.summary.fact('cost')).toContainText('Paid');
    await expect(area.summary.figure('paid')).toBeVisible();
    expect(parseMoney(await area.summary.figure('paid').innerText())).toBeGreaterThan(0);
    // Photos: the count and the latest date
    await expect(area.summary.fact('photos')).toContainText('1');
    await expect(area.summary.fact('photos')).toContainText('latest');
    await expect(area.summary.fact('photos')).toContainText('Mar');
    // Companies: the company on the late task (the paid task has none)
    await expect(area.summary.fact('companies')).toContainText('1');

    // Companies jumps to its section and moves focus to the h2
    await area.summary.fact('companies').click();
    await expect(area.companies.heading).toBeFocused();
    // Expected cost jumps to the Cost section
    await area.summary.fact('cost').click();
    await expect(area.sectionHeading('cost')).toBeFocused();

    // Photos opens the Photos page filtered to the area
    await area.summary.fact('photos').click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === routeUrl('photos') && url.searchParams.get('areaId') === tree.room1Id,
    );
    await page.goBack();
    await expect(area.heading).toHaveText(tree.names.room1);

    // Tasks opens the Tasks list filtered to the area
    await area.summary.fact('tasks').click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === routeUrl('workItems') && url.searchParams.get('areaId') === tree.room1Id,
    );
  });

  test('An area with nothing in it shows the empty facts', async ({ page, testPrefix }) => {
    const tree = await seedTree(page, newTag(testPrefix));
    const area = new AreaPage(page);
    await area.goto(tree.room2Id);

    await area.expectFactOrder();
    await expect(area.summary.fact('tasks')).toContainText('No tasks');
    await expect(area.summary.fact('photos')).toContainText('None yet');
    await expect(area.summary.fact('companies')).toContainText('None yet');
    // No cost: the strip default, never a made-up figure
    await expect(area.summary.fact('cost')).not.toContainText('€');
    await expect(area.summary.figure('paid')).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. AC3 + AC7: the sections
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Area page: sections (AC3, AC7)', { tag: '@responsive' }, () => {
  test('The sections appear in order, with their links, Call, room photo counts and the Cost table', async ({
    page,
    testPrefix,
  }) => {
    const tag = newTag(testPrefix);
    const tree = await seedTree(page, tag);
    // The source goes first so the (reverse-order) cleanup removes it after the task's lines
    const sourceId = await createFundingSource(page, cleanup, `Source ${tag}`);
    const callable = await makeCompany(page, `Tischler ${tag}`, '+49 30 5550123');
    const silent = await makeCompany(page, `Maler ${tag}`);
    const taskTitle = `Costed task ${tag}`;
    const taskId = await makeLateTask(page, taskTitle, tree.room1Id, {
      assignedVendorId: callable,
    });
    await makePurchase(page, `Sofa ${tag}`, { areaId: tree.room2Id, vendorId: silent });
    await makePhoto(page, tree.room1Id, '2026-03-05', `Entry ${tag}`);
    // 100.00 entered net at the default VAT rate (19%) is 119.00 gross
    await createCostLine(page, {
      kind: 'work_item',
      hostId: taskId,
      budgetSourceId: sourceId,
      description: `Line ${tag}`,
      plannedAmount: 100,
      includesVat: false,
    });

    const area = new AreaPage(page);
    await area.goto(tree.floorId);

    // Order: Now & next, Latest, Companies, Rooms (a floor has children), Cost
    await expect(page.getByRole('heading', { level: 2 })).toHaveText([
      'Now & next here',
      'Latest from the site',
      /^Companies here \(2\)$/,
      /^Rooms\b/,
      'Cost',
    ]);

    // Now & next: the late task and the purchase, with the footer links and their totals
    await expect(area.nowRow('work_item', taskId)).toContainText(taskTitle);
    await expect(area.nowRow('work_item', taskId)).toContainText('Late · 5 d');
    await expect(area.allTasksLink).toHaveText(/^All tasks here \(1\)/);
    await expect(area.allPurchasesLink).toHaveText(/^All purchases here \(1\)/);

    // Companies: Call (tel:) only for the company with a phone
    await expect(area.companyRow(callable)).toContainText(`Tischler ${tag}`);
    await expect(area.companyRow(silent)).toContainText(`Maler ${tag}`);
    await expect(area.callLink(callable)).toHaveAttribute('href', /^tel:/);
    await expect(area.callLink(callable)).toHaveAccessibleName(`Call Tischler ${tag}`);
    await expect(area.callLink(silent)).toHaveCount(0);

    // Rooms: each child with its photo count
    await expect(area.roomRow(tree.room1Id)).toContainText(tree.names.room1);
    await expect(area.roomRow(tree.room1Id)).toContainText('1 photo');
    await expect(area.roomRow(tree.room2Id)).toContainText('No photos');

    // Cost: gross in the row, the net and VAT in the tip, the owner as a link, Open Money below
    await expect(area.costTable.root).toBeVisible();
    const row = area.costTable.row(`Line ${tag}`);
    await expect(area.costTable.gross(row)).toHaveText(/119\.00/);
    const trigger = area.costTable.netTipButton(row);
    await expect(trigger).toBeVisible();
    if (isPhone(page)) {
      await trigger.tap();
    } else {
      await trigger.hover();
    }
    await expect(area.costTable.tooltip.first()).toHaveCSS('opacity', '1');
    await expect(area.costTable.tooltip.first()).toContainText('100.00');
    await expect(area.costTable.tooltip.first()).toContainText('19%');
    await expect(area.costGroupLink(taskTitle)).toHaveAttribute(
      'href',
      routeUrl('workItem', { id: taskId }),
    );
    await expect(area.costOverviewLink).toHaveText(/^Open Money/);
    await expect(area.costOverviewLink).toHaveAttribute('href', routeUrl('budgetOverview'));

    // Now & next: "All tasks here" lands on the Tasks list filtered by the area
    await area.allTasksLink.click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === routeUrl('workItems') && url.searchParams.get('areaId') === tree.floorId,
    );
  });

  test('A leaf area has no Rooms section; an area without cost lines shows the empty Cost state', async ({
    page,
    testPrefix,
  }) => {
    const tag = newTag(testPrefix);
    const tree = await seedTree(page, tag);
    const area = new AreaPage(page);
    await area.goto(tree.room2Id);

    await expect(area.rooms.root).toHaveCount(0);
    await expect(area.sectionHeading('now')).toHaveText('Now & next here');
    await expect(area.section('now')).toContainText(`Nothing planned in ${tree.names.room2} yet.`);
    await expect(area.section('site')).toContainText(
      `No diary entries or photos for ${tree.names.room2} yet.`,
    );
    await expect(area.photosLink).toHaveCount(0);
    await expect(area.companies.root).toContainText(
      `No company is booked in ${tree.names.room2} yet.`,
    );
    await expect(area.section('cost')).toContainText(`No cost lines in ${tree.names.room2} yet.`);
    // The link to the budget overview stays
    await expect(area.costOverviewLink).toBeVisible();
  });

  test('A cost-line group heading opens its task', async ({ page, testPrefix }) => {
    const tag = newTag(testPrefix);
    const tree = await seedTree(page, tag);
    const title = `Paid task ${tag}`;
    const taskId = await makePaidTask(page, title, tree.room1Id);

    const area = new AreaPage(page);
    await area.goto(tree.room1Id);
    await expect(area.costTable.root).toBeVisible();
    await area.costGroupLink(title).click();
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('workItem', { id: taskId }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. AC4: ancestor context rows
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Area page: ancestor context (AC4)', { tag: '@responsive' }, () => {
  test('Items booked on the floor and the building are context rows on a room, never counted', async ({
    page,
    testPrefix,
  }) => {
    const tag = newTag(testPrefix);
    const tree = await seedTree(page, tag);
    await makeTask(page, `Floor task ${tag}`, { areaId: tree.floorId });
    await makeTask(page, `Building task ${tag}`, { areaId: tree.buildingId });

    const area = new AreaPage(page);
    await area.goto(tree.room2Id);

    // Not counted in the room
    await expect(area.summary.fact('tasks')).toContainText('No tasks');
    await expect(area.section('now')).toContainText(`Nothing planned in ${tree.names.room2} yet.`);
    // Shown as muted context, in the Areas index wording, building first
    await expect(area.context).toBeVisible();
    await expect(area.contextRow(tree.buildingId)).toHaveText('Whole building (no floor) · 1 task');
    await expect(area.contextRow(tree.floorId)).toHaveText('Whole floor (no room) · 1 task');

    // A context row opens that ancestor, which counts the task as its own
    await area.contextRow(tree.floorId).click();
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('area', { id: tree.floorId }));
    await expect(area.heading).toHaveText(tree.names.floor);
    await expect(area.summary.fact('tasks')).toContainText('1 open');
    // The building's own task is that page's context, not part of the floor
    await expect(area.contextRow(tree.buildingId)).toHaveText('Whole building (no floor) · 1 task');
  });

  test('A subtree item rolls up: the floor counts a room task once', async ({
    page,
    testPrefix,
  }) => {
    const tag = newTag(testPrefix);
    const tree = await seedTree(page, tag);
    await makeTask(page, `Room task ${tag}`, { areaId: tree.room1Id });
    await makeTask(page, `Floor task ${tag}`, { areaId: tree.floorId });

    const area = new AreaPage(page);
    await area.goto(tree.floorId);
    await expect(area.summary.fact('tasks')).toContainText('2 open');
    await area.goto(tree.room1Id);
    await expect(area.summary.fact('tasks')).toContainText('1 open');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. AC6: Photos link and the Photos page filter chip
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Area page: photos (AC6)', { tag: '@responsive' }, () => {
  test('"Photos of ‹area›" opens the Photos page filtered by the area; removing the chip shows everything', async ({
    page,
    testPrefix,
  }) => {
    const tag = newTag(testPrefix);
    const tree = await seedTree(page, tag);
    const otherId = await createAreaViaApi(page, { name: `Garten ${tag}` });
    cleanup.fns.push(() => deleteAreaViaApi(page, otherId));
    await makePhoto(page, tree.room1Id, '2026-03-05', `Room entry ${tag}`);
    await makePhoto(page, otherId, '2026-03-06', `Garden entry ${tag}`);

    const area = new AreaPage(page);
    const photos = new PhotosPage(page);
    await area.goto(tree.floorId);

    // The Photos section has a link and the summary, and no second spot grid
    await expect(area.photosLink).toHaveText(
      new RegExp(`^Photos of ${escapeRegExp(tree.names.floor)}`),
    );
    await expect(area.section('site')).toContainText('1 photo · latest');
    await expect(page.getByRole('table', { name: 'Photos by area and orientation' })).toHaveCount(
      0,
    );
    await expect(
      page.locator('[data-testid^="spot-cell-"], [data-testid^="spot-card-"]'),
    ).toHaveCount(0);

    await area.photosLink.click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === routeUrl('photos') && url.searchParams.get('areaId') === tree.floorId,
    );
    await expect(photos.heading).toBeVisible();

    // The chip is a pressed toggle named "<path>, remove filter"; only the subtree's rows remain
    const chip = photos.areaChip(tree.floorId);
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(chip).toHaveAccessibleName(
      new RegExp(`${escapeRegExp(tree.names.floor)}, remove filter$`),
    );
    await expect(photos.areaLink(tree.room1Id)).toBeVisible();
    if (!isPhone(page)) {
      // The filtered area's own row (the group's root band) is shown too
      await expect(photos.areaLink(tree.floorId)).toBeVisible();
    }
    // The unrelated top-level area's row is gone, photos or not
    await expect(photos.areaLink(otherId)).toHaveCount(0);

    // Remove the filter: the chip and the param go, the other area's rows return
    await chip.click();
    await expect(page).toHaveURL(
      (url) => url.pathname === routeUrl('photos') && !url.searchParams.has('areaId'),
    );
    await expect(photos.areaChip()).toHaveCount(0);
    if (!isPhone(page)) {
      // (the phone shows one area group at a time)
      await expect(photos.areaLink(otherId)).toBeVisible();
    }
  });

  test('Select mode is hidden while the Photos page is filtered', async ({ page, testPrefix }) => {
    const tag = newTag(testPrefix);
    const tree = await seedTree(page, tag);
    await makePhoto(page, tree.room1Id, '2026-03-05', `Room entry ${tag}`);

    const photos = new PhotosPage(page);
    await page.goto(routeUrl('photos', undefined, { areaId: tree.room1Id }));
    await expect(photos.areaChip(tree.room1Id)).toBeVisible();
    await expect(photos.noAreaToggle).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. AC8: late parity
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Area page: late parity (AC8)', { tag: '@responsive' }, () => {
  test('The same dated late task reads "Late · 5 d" on the area page and the Tasks list', async ({
    page,
    testPrefix,
  }) => {
    const tag = newTag(testPrefix);
    const tree = await seedTree(page, tag);
    const taskId = await makeLateTask(page, `Late task ${tag}`, tree.room1Id);

    const area = new AreaPage(page);
    await area.goto(tree.room1Id);
    await expect(area.nowRow('work_item', taskId)).toContainText('Late · 5 d');
    await expect(area.summary.fact('tasks')).toContainText('1 late');

    const list = new WorkItemsPage(page);
    await list.goto(`areaId=${tree.room1Id}`);
    await expect(list.scheduleSignal(taskId)).toHaveText('Late · 5 d');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. States
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Area page: states', { tag: '@responsive' }, () => {
  test('An unknown id shows "Area not found" and Back to Areas', async ({ page }) => {
    const area = new AreaPage(page);
    await page.goto(routeUrl('area', { id: NONEXISTENT_UUID }));

    await expect(area.heading).toHaveText('Area not found');
    await expect(area.errorState).toBeVisible();
    await expect(area.backToAreas).toBeVisible();
    await area.backToAreas.click();
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('areas'));
    await expect(new AreasIndexPage(page).heading).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Responsive and dark mode
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Area page: responsive layout', { tag: '@responsive' }, () => {
  test('Nothing scrolls sideways; the strip and chip row adapt to the width', async ({
    page,
    testPrefix,
  }) => {
    const tag = newTag(testPrefix);
    const tree = await seedTree(page, tag);
    // Long names stress the chip row and the strip
    const longRoom = await createAreaViaApi(page, {
      name: `Sehr langer Raumname fuer den Test ${tag}`,
      parentId: tree.floorId,
      sortOrder: 2,
    });
    cleanup.fns.push(() => deleteAreaViaApi(page, longRoom));
    await makeLateTask(page, `Late task ${tag}`, tree.room1Id);

    const area = new AreaPage(page);
    await area.goto(tree.floorId);
    await expect(area.chip(longRoom)).toBeVisible();

    expect(await area.hasHorizontalOverflow()).toBe(false);

    const width = page.viewportSize()?.width ?? 1280;
    if (width < 768) {
      // Two columns of two on a phone; the chip row scrolls inside itself
      expect(await area.summary.columnCount()).toBe(2);
      const overflowX = await area
        .chipGroup(tree.names.floor)
        .evaluate((el) => getComputedStyle(el).overflowX);
      expect(['auto', 'scroll']).toContain(overflowX);
    } else if (width >= 1024) {
      // One row of four on desktop
      expect(await area.summary.rowCount()).toBe(1);
      expect(await area.summary.columnCount()).toBe(4);
    } else {
      expect(await area.summary.rowCount()).toBeLessThanOrEqual(2);
    }

    // Every control stays reachable: the primary and a chip are at least 44px tall below 1024px
    if (width < 1024) {
      for (const target of [area.logHere, area.chip(tree.room1Id)]) {
        const box = await target.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('Dark mode renders the page without horizontal overflow', async ({ page, testPrefix }) => {
    const tag = newTag(testPrefix);
    const tree = await seedTree(page, tag);
    await makeLateTask(page, `Late task ${tag}`, tree.room1Id);
    await page.emulateMedia({ colorScheme: 'dark' });

    const area = new AreaPage(page);
    await area.goto(tree.floorId);
    await expect(area.sectionHeading('now')).toBeVisible();
    expect(await area.hasHorizontalOverflow()).toBe(false);
  });
});
