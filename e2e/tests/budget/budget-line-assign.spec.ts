/**
 * E2E tests for Issue #1545: Unassigned budget lines & one-shot parent assignment.
 *
 * An "unassigned" budget line is a work_item_budgets row with work_item_id = NULL
 * linked to an invoice via invoice_budget_lines. These rows can arise from
 * auto-itemization (Story C, not yet implemented) or test seeding.
 *
 * Since there is no REST API that creates a work_item_budgets row with NULL
 * work_item_id (POST /api/work-items/:id/budgets always requires a real work item),
 * the test setup uses Docker exec to insert the orphan row directly into SQLite.
 * This mirrors the approach in e2e/containers/teardown.ts which also uses
 * execSync / docker CLI against the running container.
 *
 * Scenarios (rebuilt on the cost line table and form in #2235):
 *   1. A line without a task or purchase shows "Not assigned" and an Assign action
 *   2. Assign to a task: Assign opens "Assign cost line", pick the task, Save, the row links it
 *   3. Assign to a purchase: the same with a purchase
 *   4. Edit on an already-assigned line: Belongs to shows the current task and there is no Assign
 *   5. POST /api/budget-lines/:id/assign on already-assigned line → 409 BUDGET_LINE_ALREADY_ASSIGNED
 *   6. Mobile responsive: scenarios 1 and 2 at 375px
 *
 * Setup conventions (mirrors invoice-budget-line-edit-remove.spec.ts):
 *   - Vendor, invoice, work item created via REST API helpers
 *   - Orphan budget line inserted via Docker exec (container node -e "...")
 *   - All resources cleaned up in finally blocks
 *   - testPrefix isolates data across parallel workers
 *   - waitForResponse registered BEFORE the action that triggers the network call
 */

import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { CostLineFormDialog } from '../../pages/components/CostLineFormDialog.js';
import { CostLinesPanel } from '../../pages/components/CostLinesPanel.js';
import {
  createWorkItemViaApi,
  deleteWorkItemViaApi,
  createHouseholdItemViaApi,
  deleteHouseholdItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { API } from '../../fixtures/testData.js';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import type { Page } from '@playwright/test';
import { randomUUID } from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Container state helpers — reads the cornerstoneContainerId written by
// e2e/containers/setup.ts so we can docker exec into the running container.
// ─────────────────────────────────────────────────────────────────────────────

interface ContainerState {
  cornerstoneContainerId: string;
}

let _containerState: ContainerState | null = null;

function getContainerState(): ContainerState {
  if (_containerState) return _containerState;
  try {
    const raw = readFileSync('e2e/test-results/.state/containers.json', 'utf-8');
    _containerState = JSON.parse(raw) as ContainerState;
    return _containerState;
  } catch {
    // In local development the state file may not exist — skip gracefully
    throw new Error(
      'Container state file not found (e2e/test-results/.state/containers.json). ' +
        'Run via `npm run test:e2e` or the CI E2E job to start testcontainers first.',
    );
  }
}

/**
 * Insert an orphan work_item_budget row and link it to an invoice via docker exec.
 *
 * Returns { wibId } — the work_item_budget ID used as `:id` in assign calls.
 *
 * Implementation: Runs a Node.js one-liner inside the Cornerstone container that
 * uses better-sqlite3 to INSERT directly into SQLite. The container has Node.js
 * (confirmed by its healthcheck CMD) and better-sqlite3 in /app/server/node_modules/.
 */
function seedOrphanBudgetLine(opts: {
  invoiceId: string;
  itemizedAmount: number;
  plannedAmount: number;
  description: string;
}): { wibId: string; iblId: string } {
  const state = getContainerState();
  const wibId = 'wib-e2e-' + randomUUID();
  const iblId = 'ibl-e2e-' + randomUUID();
  const now = new Date().toISOString();

  // Node one-liner that inserts into work_item_budgets (workItemId=null) and
  // invoice_budget_lines. Uses createRequire to load better-sqlite3 from the
  // server workspace. Paths are those in the production Docker image.
  const script = [
    `const{createRequire}=require('module');`,
    `const req=createRequire('/app/server/dist/server.js');`,
    `const DB=req('better-sqlite3');`,
    `const db=new DB('/app/data/cornerstone.db');`,
    // Insert orphan work_item_budget (workItemId = NULL)
    `db.prepare("INSERT INTO work_item_budgets(id,work_item_id,description,planned_amount,confidence,budget_category_id,budget_source_id,vendor_id,quantity,unit,unit_price,includes_vat,created_by,created_at,updated_at,origin) VALUES (?,NULL,?,?,?,NULL,NULL,NULL,NULL,NULL,NULL,1,NULL,?,?,?)")`,
    `.run(${JSON.stringify(wibId)},${JSON.stringify(opts.description)},${opts.plannedAmount},'own_estimate',${JSON.stringify(now)},${JSON.stringify(now)},'manual');`,
    // Insert invoice_budget_lines junction
    `db.prepare("INSERT INTO invoice_budget_lines(id,invoice_id,work_item_budget_id,household_item_budget_id,itemized_amount,created_at,updated_at) VALUES (?,?,?,NULL,?,?,?)")`,
    `.run(${JSON.stringify(iblId)},${JSON.stringify(opts.invoiceId)},${JSON.stringify(wibId)},${opts.itemizedAmount},${JSON.stringify(now)},${JSON.stringify(now)});`,
    `db.close();`,
    `console.log('ok');`,
  ].join('');

  const result = execSync(
    `docker exec ${state.cornerstoneContainerId} node -e ${JSON.stringify(script)}`,
    {
      encoding: 'utf-8',
      timeout: 15_000,
    },
  );

  if (!result.trim().includes('ok')) {
    throw new Error(`Failed to seed orphan budget line: ${result}`);
  }

  return { wibId, iblId };
}

/**
 * Delete an orphan work_item_budget row by ID via docker exec.
 * Used in cleanup (finally blocks) to avoid leaving orphan rows in the DB.
 */
function deleteOrphanWorkItemBudget(wibId: string): void {
  const state = getContainerState();
  const script = [
    `const{createRequire}=require('module');`,
    `const req=createRequire('/app/server/dist/server.js');`,
    `const DB=req('better-sqlite3');`,
    `const db=new DB('/app/data/cornerstone.db');`,
    `db.prepare("DELETE FROM work_item_budgets WHERE id=?").run(${JSON.stringify(wibId)});`,
    `db.close();`,
  ].join('');

  try {
    execSync(`docker exec ${state.cornerstoneContainerId} node -e ${JSON.stringify(script)}`, {
      encoding: 'utf-8',
      timeout: 10_000,
    });
  } catch {
    // Best-effort cleanup — do not throw in finally blocks
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline REST helpers (mirrors invoice-budget-line-edit-remove.spec.ts pattern)
// ─────────────────────────────────────────────────────────────────────────────

async function createVendorViaApi(page: Page, name: string): Promise<string> {
  const resp = await page.request.post(API.vendors, { data: { name } });
  expect(resp.ok(), `POST vendor "${name}" failed: ${resp.status()}`).toBeTruthy();
  const body = (await resp.json()) as { vendor: { id: string } };
  return body.vendor.id;
}

async function deleteVendorViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`${API.vendors}/${id}`);
}

async function createInvoiceViaApi(
  page: Page,
  vendorId: string,
  data: { amount: number; date: string; invoiceNumber?: string },
): Promise<string> {
  const resp = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
    data: { status: 'pending', ...data },
  });
  expect(resp.ok(), `POST invoice failed: ${resp.status()}`).toBeTruthy();
  const body = (await resp.json()) as { invoice: { id: string } };
  return body.invoice.id;
}

async function deleteInvoiceViaApi(page: Page, vendorId: string, invoiceId: string): Promise<void> {
  await page.request.delete(`${API.vendors}/${vendorId}/invoices/${invoiceId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Page helpers
// ─────────────────────────────────────────────────────────────────────────────

async function openAssignForm(page: Page, panel: CostLinesPanel, description: string) {
  const form = new CostLineFormDialog(page, 'Assign cost line');
  await panel.chooseAction(panel.row(description), 'Assign');
  await form.waitForOpen();
  return form;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Not assigned badge renders
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Unassigned cost line badge (Scenario 1)', { tag: ['@smoke', '@responsive'] }, () => {
  test(
    'the Belongs to cell shows "Not assigned" and the menu offers Assign for orphan lines',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const panel = new CostLinesPanel(page);
      let vendorId = '';
      let invoiceId = '';
      let wibId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} UBA Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 1000,
          date: '2026-06-01',
          invoiceNumber: `${testPrefix}-UBA-001`,
        });

        // Seed orphan budget line via Docker exec (no REST API for null workItemId)
        const seeded = seedOrphanBudgetLine({
          invoiceId,
          plannedAmount: 350,
          itemizedAmount: 300,
          description: `${testPrefix} Unassigned Line`,
        });
        wibId = seeded.wibId;

        await page.goto(routeUrl('invoice', { id: invoiceId }));
        await panel.waitForLoaded();

        const row = panel.row(`${testPrefix} Unassigned Line`);
        await expect(row).toBeVisible();
        await expect(row).toContainText('Not assigned');
        await expect(panel.gross(row)).toHaveText('€300.00');

        await panel.menuTrigger(row).click();
        await expect(panel.menuItem('Assign')).toBeVisible();
      } finally {
        // Orphan wibId cleanup — if the work_item_budget wasn't assigned, delete it
        if (wibId) deleteOrphanWorkItemBudget(wibId);
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Assign to a task
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Assign unassigned cost line to a task (Scenario 2)', { tag: '@responsive' }, () => {
  test(
    'Assign opens the form with Belongs to; picking a task and saving removes "Not assigned"',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const panel = new CostLinesPanel(page);
      let vendorId = '';
      let invoiceId = '';
      let workItemId = '';
      let wibId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} AssWI Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, { amount: 800, date: '2026-06-01' });
        workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} AssWI Work Item` });
        const seeded = seedOrphanBudgetLine({
          invoiceId,
          plannedAmount: 500,
          itemizedAmount: 400,
          description: `${testPrefix} AssWI Line`,
        });
        wibId = seeded.wibId;

        await page.goto(routeUrl('invoice', { id: invoiceId }));
        await panel.waitForLoaded();
        await expect(panel.row(`${testPrefix} AssWI Line`)).toContainText('Not assigned');

        const form = await openAssignForm(page, panel, `${testPrefix} AssWI Line`);
        // Belongs to is an essential field of the assign form
        await form.target.pick(`${testPrefix} AssWI Work Item`);

        const assigned = page.waitForResponse(
          (resp) =>
            resp.url().includes('/budget-lines/') &&
            resp.url().includes('/assign') &&
            resp.request().method() === 'POST' &&
            resp.status() === 200,
        );
        await form.save();
        await assigned;
        await form.waitForClosed();

        const row = panel.row(`${testPrefix} AssWI Line`);
        await expect(row).not.toContainText('Not assigned');
        const link = row.getByRole('link', { name: `${testPrefix} AssWI Work Item` });
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', /\/project\/work-items\//);

        // wibId is now assigned — cleaned up through the work item
        wibId = '';
      } finally {
        if (wibId) deleteOrphanWorkItemBudget(wibId);
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Assign to a purchase
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Assign unassigned cost line to a purchase (Scenario 3)',
  { tag: '@responsive' },
  () => {
    test('picking a purchase for Belongs to assigns the line to it', async ({
      page,
      testPrefix,
    }) => {
      const panel = new CostLinesPanel(page);
      let vendorId = '';
      let invoiceId = '';
      let householdItemId = '';
      let wibId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} AssHI Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, { amount: 600, date: '2026-06-01' });
        householdItemId = await createHouseholdItemViaApi(page, {
          name: `${testPrefix} AssHI Item`,
        });
        const seeded = seedOrphanBudgetLine({
          invoiceId,
          plannedAmount: 200,
          itemizedAmount: 180,
          description: `${testPrefix} AssHI Line`,
        });
        wibId = seeded.wibId;

        await page.goto(routeUrl('invoice', { id: invoiceId }));
        await panel.waitForLoaded();

        const form = await openAssignForm(page, panel, `${testPrefix} AssHI Line`);
        await form.target.pick(`${testPrefix} AssHI Item`);

        const assigned = page.waitForResponse(
          (resp) =>
            resp.url().includes('/budget-lines/') &&
            resp.url().includes('/assign') &&
            resp.request().method() === 'POST' &&
            resp.status() === 200,
        );
        await form.save();
        await assigned;
        await form.waitForClosed();

        const row = panel.row(`${testPrefix} AssHI Line`);
        await expect(row).not.toContainText('Not assigned');
        const link = row.getByRole('link', { name: `${testPrefix} AssHI Item` });
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', /\/project\/household-items\//);

        // The original work_item_budget row is deleted by the assign service
        wibId = '';
      } finally {
        if (wibId) deleteOrphanWorkItemBudget(wibId);
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
        if (householdItemId) await deleteHouseholdItemViaApi(page, householdItemId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Edit on an already-assigned line — Belongs to shows the task, no Assign
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Edit for an assigned cost line (Scenario 4)', { tag: '@responsive' }, () => {
  test('the menu has no Assign; the edit form shows the current task under Belongs to', async ({
    page,
    testPrefix,
  }) => {
    const panel = new CostLinesPanel(page);
    const form = new CostLineFormDialog(page, 'Edit cost line');
    let vendorId = '';
    let invoiceId = '';
    let workItemId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} CollapsedPicker Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, { amount: 500, date: '2026-06-01' });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} CollapsedPicker WI` });

      const budgetResp = await page.request.post(`${API.workItems}/${workItemId}/budgets`, {
        data: {
          plannedAmount: 250,
          confidence: 'own_estimate',
          description: `${testPrefix} Assigned Line`,
          budgetSourceId: 'discretionary-system',
        },
      });
      expect(budgetResp.ok(), `POST budget failed: ${budgetResp.status()}`).toBeTruthy();
      const budgetBody = (await budgetResp.json()) as { budget: { id: string } };
      const linkResp = await page.request.post(`/api/invoices/${invoiceId}/budget-lines`, {
        data: { workItemBudgetId: budgetBody.budget.id, itemizedAmount: 200 },
      });
      expect(linkResp.ok(), `POST budget-line failed: ${linkResp.status()}`).toBeTruthy();

      await page.goto(routeUrl('invoice', { id: invoiceId }));
      await panel.waitForLoaded();
      const row = panel.row(`${testPrefix} Assigned Line`);
      await expect(row).toBeVisible();

      await panel.menuTrigger(row).click();
      await expect(panel.menuItem('Edit')).toBeVisible();
      await expect(panel.menuItem('Assign')).toHaveCount(0);
      await panel.menuItem('Edit').click();

      await form.waitForOpen();
      await form.expandMoreDetails();
      await expect(form.dialog).toContainText(`${testPrefix} CollapsedPicker WI`);
      await form.cancel();
      await form.waitForClosed();
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: 409 BUDGET_LINE_ALREADY_ASSIGNED via direct API call
// ─────────────────────────────────────────────────────────────────────────────

test.describe('POST assign on already-assigned line → 409 (Scenario 5)', () => {
  test('Calling POST /api/budget-lines/:id/assign on an assigned line returns 409 BUDGET_LINE_ALREADY_ASSIGNED', async ({
    page,
    testPrefix,
  }) => {
    // This is an API-level test — no viewport constraint
    let vendorId = '';
    let invoiceId = '';
    let workItemId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} Already Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 400,
        date: '2026-06-01',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} Already WI` });

      // Create an ASSIGNED budget line
      const budgetResp = await page.request.post(`${API.workItems}/${workItemId}/budgets`, {
        data: {
          plannedAmount: 200,
          confidence: 'own_estimate',
          description: `${testPrefix} Already Assigned`,
          budgetSourceId: 'discretionary-system',
        },
      });
      expect(budgetResp.ok()).toBeTruthy();
      const budgetBody = (await budgetResp.json()) as { budget: { id: string } };
      const budgetId = budgetBody.budget.id;

      // Link it to the invoice
      const linkResp = await page.request.post(`/api/invoices/${invoiceId}/budget-lines`, {
        data: {
          workItemBudgetId: budgetId,
          itemizedAmount: 150,
        },
      });
      expect(linkResp.ok()).toBeTruthy();

      // Now attempt to POST /api/budget-lines/:id/assign with the already-assigned budget line ID
      // The `:id` param is the work_item_budget ID (not the invoice_budget_line ID)
      const assignResp = await page.request.post(`/api/budget-lines/${budgetId}/assign`, {
        data: {
          targetType: 'work_item',
          targetId: workItemId,
        },
      });

      // Expect 409 Conflict
      expect(assignResp.status()).toBe(409);

      const errorBody = (await assignResp.json()) as {
        error: { code: string; message: string };
      };
      expect(errorBody.error.code).toBe('BUDGET_LINE_ALREADY_ASSIGNED');
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Mobile responsive — badge renders and assign flow works
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Mobile viewport — badge and assign flow (Scenario 6)', () => {
  test('Not assigned shows on a phone and the assign-to-task flow completes', async ({
    page,
    testPrefix,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const panel = new CostLinesPanel(page);
    let vendorId = '';
    let invoiceId = '';
    let workItemId = '';
    let wibId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} MobAss Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, { amount: 700, date: '2026-06-01' });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} MobAss WI` });
      const seeded = seedOrphanBudgetLine({
        invoiceId,
        plannedAmount: 300,
        itemizedAmount: 250,
        description: `${testPrefix} MobAss Line`,
      });
      wibId = seeded.wibId;

      await page.goto(routeUrl('invoice', { id: invoiceId }));
      await panel.waitForLoaded();
      await expect(panel.row(`${testPrefix} MobAss Line`)).toContainText('Not assigned');

      const form = await openAssignForm(page, panel, `${testPrefix} MobAss Line`);
      await expect(page.getByTestId('cost-line-form-sheet')).toBeVisible();
      await form.target.pick(`${testPrefix} MobAss WI`);
      await form.save();
      await form.waitForClosed();

      await expect(panel.row(`${testPrefix} MobAss Line`)).not.toContainText('Not assigned');
      wibId = '';
    } finally {
      if (wibId) deleteOrphanWorkItemBudget(wibId);
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});
