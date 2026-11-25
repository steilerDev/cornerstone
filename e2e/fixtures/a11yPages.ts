/**
 * The page table of the accessibility suites (Story #2261): every served page of the route map
 * with a URL builder and a ready locator, the synthetic seed, and the completeness exemptions.
 *
 * Seeds are synthetic (`E2E A11y <tag> ...`), created through the API in `seedA11y` and removed
 * in `cleanupA11y`. The tag carries the project and worker index, so parallel workers that each
 * seed their own copy never collide in the shared E2E database.
 */

import type { Browser, Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ROUTE_MAP, routeUrl } from '../../shared/src/routes/index.js';
import {
  createAreaViaApi,
  createBudgetSourceViaApi,
  createDiaryEntryViaApi,
  createHouseholdItemViaApi,
  createMilestoneViaApi,
  createOrientationViaApi,
  createSubsidyProgramViaApi,
  createVendorViaApi,
  createWorkItemViaApi,
  deleteAreaViaApi,
  deleteBudgetSourceViaApi,
  deleteDiaryEntryViaApi,
  deleteHouseholdItemViaApi,
  deleteMilestoneViaApi,
  deleteOrientationViaApi,
  deleteSubsidyProgramViaApi,
  deleteVendorViaApi,
  deleteWorkItemViaApi,
  uploadDiaryPhotoViaApi,
} from './apiHelpers.js';
import { API } from './testData.js';

export interface A11ySeed {
  tag: string;
  workItemId: string;
  householdItemId: string;
  milestoneId: number;
  diaryId: string;
  vendorId: string;
  invoiceId: string;
  areaId: string;
  orientationId: string;
  sourceId: string;
  grantId: string;
}

export function emptySeed(tag: string): A11ySeed {
  return {
    tag,
    workItemId: '',
    householdItemId: '',
    milestoneId: 0,
    diaryId: '',
    vendorId: '',
    invoiceId: '',
    areaId: '',
    orientationId: '',
    sourceId: '',
    grantId: '',
  };
}

const runId = Date.now().toString(36);

/** Unique per run, project and worker. */
export function seedTag(projectName: string, workerIndex: number): string {
  return `${runId}${projectName.slice(0, 3)}${workerIndex}`;
}

const AUTH_STATE = 'test-results/.auth/admin.json';

function localToday(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Creates the synthetic records the table's detail pages need. */
export async function seedA11y(browser: Browser, seed: A11ySeed): Promise<void> {
  const context = await browser.newContext({ storageState: AUTH_STATE });
  const page = await context.newPage();
  const n = (what: string) => `E2E A11y ${seed.tag} ${what}`;
  const today = localToday();
  try {
    seed.workItemId = await createWorkItemViaApi(page, {
      title: n('task'),
      startDate: today,
      endDate: today,
    });
    seed.householdItemId = await createHouseholdItemViaApi(page, { name: n('purchase') });
    seed.milestoneId = await createMilestoneViaApi(page, {
      title: n('milestone'),
      targetDate: today,
    });
    seed.areaId = await createAreaViaApi(page, { name: n('Area') });
    seed.orientationId = await createOrientationViaApi(page, { name: n('North') });
    seed.diaryId = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: today,
      title: n('diary'),
      body: n('body'),
    });
    await uploadDiaryPhotoViaApi(page, seed.diaryId, {
      areaId: seed.areaId,
      orientationId: seed.orientationId,
    });
    seed.vendorId = await createVendorViaApi(page, { name: n('company') });
    const invoice = await page.request.post(`${API.vendors}/${seed.vendorId}/invoices`, {
      data: {
        amount: 1200,
        date: '2026-03-01',
        status: 'pending',
        invoiceNumber: `A11Y-${seed.tag}`,
      },
    });
    expect(invoice.ok(), `POST invoice failed: ${invoice.status()}`).toBeTruthy();
    seed.invoiceId = ((await invoice.json()) as { invoice: { id: string } }).invoice.id;
    seed.sourceId = await createBudgetSourceViaApi(page, {
      name: n('loan'),
      sourceType: 'bank_loan',
      totalAmount: 50000,
    });
    seed.grantId = await createSubsidyProgramViaApi(page, {
      name: n('grant'),
      reductionValue: 10,
    });
  } finally {
    await context.close();
  }
}

/** Removes everything `seedA11y` created. */
export async function cleanupA11y(browser: Browser, seed: A11ySeed): Promise<void> {
  const context = await browser.newContext({ storageState: AUTH_STATE });
  const page = await context.newPage();
  const quiet = (promise: Promise<unknown>) => promise.catch(() => undefined);
  try {
    if (seed.invoiceId && seed.vendorId) {
      await quiet(
        page.request.delete(`${API.vendors}/${seed.vendorId}/invoices/${seed.invoiceId}`),
      );
    }
    if (seed.vendorId) await quiet(deleteVendorViaApi(page, seed.vendorId));
    if (seed.sourceId) await quiet(deleteBudgetSourceViaApi(page, seed.sourceId));
    if (seed.grantId) await quiet(deleteSubsidyProgramViaApi(page, seed.grantId));
    if (seed.diaryId) await quiet(deleteDiaryEntryViaApi(page, seed.diaryId));
    if (seed.areaId) await quiet(deleteAreaViaApi(page, seed.areaId));
    if (seed.orientationId) await quiet(deleteOrientationViaApi(page, seed.orientationId));
    if (seed.milestoneId) await quiet(deleteMilestoneViaApi(page, seed.milestoneId));
    if (seed.householdItemId) await quiet(deleteHouseholdItemViaApi(page, seed.householdItemId));
    if (seed.workItemId) await quiet(deleteWorkItemViaApi(page, seed.workItemId));
  } finally {
    await context.close();
  }
}

export interface A11yRow {
  /** Route-map id. */
  id: string;
  path: (seed: A11ySeed) => string;
  /** Visit without a session (the login page). */
  public?: boolean;
}

export const A11Y_ROWS: readonly A11yRow[] = [
  { id: 'home', path: () => routeUrl('home') },
  { id: 'workItems', path: () => routeUrl('workItems') },
  { id: 'workItem', path: (s) => routeUrl('workItem', { id: s.workItemId }) },
  { id: 'householdItems', path: () => routeUrl('householdItems') },
  { id: 'householdItem', path: (s) => routeUrl('householdItem', { id: s.householdItemId }) },
  { id: 'milestones', path: () => routeUrl('milestones') },
  { id: 'milestone', path: (s) => routeUrl('milestone', { id: s.milestoneId }) },
  { id: 'budgetOverview', path: () => routeUrl('budgetOverview') },
  { id: 'invoices', path: () => routeUrl('invoices') },
  { id: 'invoice', path: (s) => routeUrl('invoice', { id: s.invoiceId }) },
  { id: 'bankReport', path: () => routeUrl('bankReport') },
  { id: 'financing', path: () => routeUrl('financing') },
  { id: 'fundingSource', path: (s) => routeUrl('fundingSource', { id: s.sourceId }) },
  { id: 'grant', path: (s) => routeUrl('grant', { id: s.grantId }) },
  { id: 'scheduleGantt', path: () => routeUrl('scheduleGantt') },
  { id: 'scheduleCalendar', path: () => routeUrl('scheduleCalendar') },
  { id: 'diary', path: () => routeUrl('diary') },
  { id: 'diaryEntry', path: (s) => routeUrl('diaryEntry', { id: s.diaryId }) },
  { id: 'photos', path: () => routeUrl('photos') },
  {
    id: 'photoSpot',
    path: (s) => routeUrl('photoSpot', { areaKey: s.areaId, orientationKey: s.orientationId }),
  },
  { id: 'companies', path: () => routeUrl('companies') },
  { id: 'company', path: (s) => routeUrl('company', { id: s.vendorId }) },
  { id: 'areas', path: () => routeUrl('areas') },
  { id: 'area', path: (s) => routeUrl('area', { id: s.areaId }) },
  { id: 'history', path: () => routeUrl('history') },
  { id: 'settingsProfile', path: () => routeUrl('settingsProfile') },
  { id: 'settingsManage', path: () => routeUrl('settingsManage') },
  { id: 'settingsUsers', path: () => routeUrl('settingsUsers') },
  { id: 'settingsBackups', path: () => routeUrl('settingsBackups') },
  { id: 'settingsIntegrations', path: () => routeUrl('settingsIntegrations') },
  { id: 'notFound', path: () => `/does-not-exist-${runId}` },
  { id: 'login', path: () => routeUrl('login'), public: true },
];

/** First half of the table (axe-pages-a). */
export const A11Y_ROWS_A = A11Y_ROWS.slice(0, 16);
/** Second half of the table (axe-pages-b). */
export const A11Y_ROWS_B = A11Y_ROWS.slice(16);

/** Served pages the table skips, each with its reason. */
export const A11Y_EXEMPT: Readonly<Record<string, string>> = {
  setup: 'only served while the instance has no user; the E2E instance always has one',
  workItemNew: 'create dialog over the Tasks list; the overlay spec covers the shared Modal',
  householdItemNew: 'create dialog over the Purchases list; covered through the shared Modal',
  milestoneNew: 'create dialog over the Milestones list; covered through the shared Modal',
  companyNew: 'create dialog over the Companies list; covered through the shared Modal',
  diaryEntryNew: 'entry form; same form chrome as the diary entry page, covered by diaryEntry',
  diaryEntryEdit: 'entry form; same form chrome as the diary entry page, covered by diaryEntry',
  invoicePaperlessReview: 'Paperless is off in E2E, so the route redirects away',
  invoiceAutoItemize: 'Paperless and the LLM are off in E2E, so the route redirects away',
  documents: 'Paperless is off in E2E, so the route redirects away',
  invoiceConvert: 'needs an offer and redirects when none exists; same chrome as the invoice page',
};

/** Ids of the pages the route map serves today (kind page, or a redirect whose interim is a page). */
export function servedPageIds(): string[] {
  const entries = ROUTE_MAP as unknown as ReadonlyArray<{
    id?: string;
    kind: string;
    stage: string;
    interim?: string;
  }>;
  return entries
    .filter(
      (e) =>
        e.id !== undefined && e.stage !== 'planned' && (e.kind === 'page' || e.interim === 'page'),
    )
    .map((e) => e.id as string);
}

/** The page's h1 (the "ready" signal every page of the table renders). */
export function readyLocator(page: Page): Locator {
  return page.getByRole('heading', { level: 1 }).first();
}

/** Opens a row, signs out first for public rows, and waits until the page is ready. */
export async function openRow(page: Page, row: A11yRow, seed: A11ySeed): Promise<void> {
  if (row.public) await page.context().clearCookies();
  await page.goto(row.path(seed));
  await expect(readyLocator(page)).toBeVisible();
  // Data-driven pages settle after their requests; scan the loaded page, not a skeleton
  await page.waitForLoadState('networkidle');
}
