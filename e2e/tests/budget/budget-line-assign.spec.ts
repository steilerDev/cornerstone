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
 * Scenarios:
 *   1. Unassigned badge renders — "Linked Item" column shows "Unassigned" badge + "Assign…"
 *   2. Assign to work item — modal → picker → Work Item tab → pick WI → confirm → row shows link
 *   3. Assign to household item — modal → picker → Household Item tab → pick HI → confirm → row shows link
 *   4. Edit modal on already-assigned line — parent picker section NOT shown
 *   5. POST /api/budget-lines/:id/assign on already-assigned line → 409 BUDGET_LINE_ALREADY_ASSIGNED
 *   6. Mobile responsive — scenarios 1 and 2 at mobile viewport (375px)
 *
 * Setup conventions (mirrors invoice-budget-line-edit-remove.spec.ts):
 *   - Vendor, invoice, work item created via REST API helpers
 *   - Orphan budget line inserted via Docker exec (container node -e "...")
 *   - All resources cleaned up in finally blocks
 *   - testPrefix isolates data across parallel workers
 *   - waitForResponse registered BEFORE the action that triggers the network call
 */

import { test, expect } from '../../fixtures/auth.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
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
// Helper: open the OverflowMenu for a budget line and click a menu item
// (mirrors the helpers in invoice-budget-line-edit-remove.spec.ts)
// ─────────────────────────────────────────────────────────────────────────────

async function openBudgetLineMenu(
  page: Page,
  section: ReturnType<typeof page.locator>,
): Promise<void> {
  const trigger = section.locator('button[aria-haspopup="true"]').filter({ visible: true }).first();
  await trigger.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await trigger.click();
  await page
    .locator('[role="menu"]')
    .filter({ visible: true })
    .first()
    .waitFor({ state: 'visible' });
}

async function clickMenuItemByText(page: Page, text: string | RegExp): Promise<void> {
  const item = page
    .locator('[role="menuitem"]')
    .filter({ visible: true })
    .filter({ hasText: text });
  await item.first().click({ force: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Unassigned badge renders
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Unassigned budget line badge (Scenario 1)',
  { tag: ['@smoke', '@responsive'] },
  () => {
    test(
      'Linked Item column shows "Unassigned" badge and "Assign…" button for orphan budget lines',
      { tag: '@smoke' },
      async ({ page, testPrefix }) => {
        const detailPage = new InvoiceDetailPage(page);
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

          await detailPage.goto(invoiceId);
          await expect(detailPage.heading).toBeVisible();

          // Budget lines section must be visible with the orphan row
          await expect(detailPage.budgetLinesSection).toBeVisible();
          await expect(detailPage.budgetLinesSection).toContainText(
            `${testPrefix} Unassigned Line`,
          );

          // The "Linked Item" column shows the Unassigned badge (text content)
          // Badge renders as <span class="badge ...">Unassigned</span>
          const unassignedBadge = detailPage.budgetLinesSection.locator('[class*="badge"]', {
            hasText: 'Unassigned',
          });
          await expect(unassignedBadge).toBeVisible();

          // The badge has aria-label "Unassigned — no work item or household item linked"
          await expect(unassignedBadge).toHaveAttribute(
            'aria-label',
            'Unassigned — no work item or household item linked',
          );

          // The "Assign…" button is visible next to the badge (class*="assignButton")
          const assignButton = detailPage.budgetLinesSection.locator('[class*="assignButton"]', {
            hasText: 'Assign…',
          });
          await expect(assignButton).toBeVisible();

          // Planned and itemized amounts are displayed in the row
          await expect(detailPage.budgetLinesSection).toContainText('350');
          await expect(detailPage.budgetLinesSection).toContainText('300');
        } finally {
          // Orphan wibId cleanup — if the work_item_budget wasn't assigned, delete it
          if (wibId) deleteOrphanWorkItemBudget(wibId);
          if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
          if (vendorId) await deleteVendorViaApi(page, vendorId);
        }
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Assign to work item
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Assign unassigned budget line to work item (Scenario 2)',
  { tag: '@responsive' },
  () => {
    test(
      'Clicking "Assign…" opens edit modal with parent picker; selecting Work Item and confirming removes the Unassigned badge',
      { tag: '@smoke' },
      async ({ page, testPrefix }) => {
        const detailPage = new InvoiceDetailPage(page);
        let vendorId = '';
        let invoiceId = '';
        let workItemId = '';
        let wibId = '';

        try {
          vendorId = await createVendorViaApi(page, `${testPrefix} AssWI Vendor`);
          invoiceId = await createInvoiceViaApi(page, vendorId, {
            amount: 800,
            date: '2026-06-01',
          });
          workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} AssWI Work Item` });

          const seeded = seedOrphanBudgetLine({
            invoiceId,
            plannedAmount: 500,
            itemizedAmount: 400,
            description: `${testPrefix} AssWI Line`,
          });
          wibId = seeded.wibId;

          await detailPage.goto(invoiceId);
          await expect(detailPage.heading).toBeVisible();

          // Verify orphan badge is visible
          const unassignedBadge = detailPage.budgetLinesSection.locator('[class*="badge"]', {
            hasText: 'Unassigned',
          });
          await expect(unassignedBadge).toBeVisible();

          // Click the "Assign…" button (scoped to this row using its description text)
          const lineRow = detailPage.budgetLinesSection.locator('tr[data-row-id]').filter({
            hasText: `${testPrefix} AssWI Line`,
          });
          const assignBtn = lineRow.locator('[class*="assignButton"]');
          await expect(assignBtn).toBeVisible();
          await assignBtn.click();

          // The edit modal opens with title "Edit Budget Line"
          const editModal = page.getByRole('dialog', { name: 'Edit Budget Line' });
          await expect(editModal).toBeVisible();

          // The parent picker section (fieldset "Assign to work item or household item") IS visible
          const parentPickerFieldset = editModal.locator('fieldset[class*="parentPickerSection"]');
          await expect(parentPickerFieldset).toBeVisible();

          // "Work Item" tab is active by default
          const workItemTab = parentPickerFieldset.getByRole('button', {
            name: 'Work Item',
            exact: true,
          });
          await expect(workItemTab).toBeVisible();

          // Type in the Work Item picker to find our work item
          // WorkItemPicker renders a SearchPicker with a text input
          const wiInput = parentPickerFieldset.locator('input[type="text"]').first();
          await wiInput.fill(`${testPrefix} AssWI Work Item`);

          // Wait for the option to appear and click it
          const option = page.getByRole('option', { name: `${testPrefix} AssWI Work Item` });
          await option.waitFor({ state: 'visible' });
          await option.click();

          // The assign submit button is now enabled — it shows "Work Item" text (current implementation)
          // Scoped to the fieldset so we don't click the tab button
          const assignSubmitBtn = parentPickerFieldset.locator('[class*="assignSubmitButton"]');
          await expect(assignSubmitBtn).toBeVisible();
          await expect(assignSubmitBtn).not.toBeDisabled();

          // Register waitForResponse for POST /api/budget-lines/:id/assign BEFORE clicking
          const assignPromise = page.waitForResponse(
            (resp) =>
              resp.url().includes('/budget-lines/') &&
              resp.url().includes('/assign') &&
              resp.request().method() === 'POST' &&
              resp.status() === 200,
          );
          await assignSubmitBtn.click();
          await assignPromise;

          // Modal should close after successful assignment
          await expect(editModal).not.toBeVisible();

          // The table row should now show a LINK to the work item, not the Unassigned badge
          await expect(unassignedBadge).not.toBeVisible();

          // A link to the work item detail page should appear in the row
          const workItemLink = detailPage.budgetLinesSection.locator('a', {
            hasText: `${testPrefix} AssWI Work Item`,
          });
          await expect(workItemLink).toBeVisible();

          // The link should point to /project/work-items/:id
          await expect(workItemLink).toHaveAttribute('href', new RegExp('/project/work-items/'));

          // wibId is now assigned — the budget line has a workItemId, so deleteOrphanWorkItemBudget
          // is no longer needed (it's cleaned up via deleteWorkItemViaApi cascade)
          wibId = ''; // clear so finally block doesn't try to delete it
        } finally {
          if (wibId) deleteOrphanWorkItemBudget(wibId);
          if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
          if (vendorId) await deleteVendorViaApi(page, vendorId);
          if (workItemId) await deleteWorkItemViaApi(page, workItemId);
        }
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Assign to household item
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Assign unassigned budget line to household item (Scenario 3)', () => {
  test('Selecting "Household Item" tab and picking a household item assigns the line correctly', async ({
    page,
    testPrefix,
  }) => {
    // Skip on mobile viewports — this is a functional test, not a responsive test
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 1024) {
      test.skip(true, 'Functional test — desktop only');
      return;
    }

    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId = '';
    let householdItemId = '';
    let wibId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} AssHI Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 600,
        date: '2026-06-01',
      });
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

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      // Open the assign modal via "Assign…" button on the orphan row
      const lineRow = detailPage.budgetLinesSection.locator('tr[data-row-id]').filter({
        hasText: `${testPrefix} AssHI Line`,
      });
      const assignBtn = lineRow.locator('[class*="assignButton"]');
      await expect(assignBtn).toBeVisible();
      await assignBtn.click();

      const editModal = page.getByRole('dialog', { name: 'Edit Budget Line' });
      await expect(editModal).toBeVisible();

      const parentPickerFieldset = editModal.locator('fieldset[class*="parentPickerSection"]');
      await expect(parentPickerFieldset).toBeVisible();

      // Click the "Household Item" tab to switch the picker
      const hiTab = parentPickerFieldset.getByRole('button', {
        name: 'Household Item',
        exact: true,
      });
      await expect(hiTab).toBeVisible();
      await hiTab.click();

      // HouseholdItemPicker input should now be visible
      const hiInput = parentPickerFieldset.locator('input[type="text"]').first();
      await hiInput.fill(`${testPrefix} AssHI Item`);

      // Wait for the option and click it
      const option = page.getByRole('option', { name: `${testPrefix} AssHI Item` });
      await option.waitFor({ state: 'visible' });
      await option.click();

      // Assign submit button should be enabled
      const assignSubmitBtn = parentPickerFieldset.locator('[class*="assignSubmitButton"]');
      await expect(assignSubmitBtn).not.toBeDisabled();

      // Register waitForResponse BEFORE clicking
      const assignPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/budget-lines/') &&
          resp.url().includes('/assign') &&
          resp.request().method() === 'POST' &&
          resp.status() === 200,
      );
      await assignSubmitBtn.click();
      await assignPromise;

      // Modal closes after success
      await expect(editModal).not.toBeVisible();

      // Unassigned badge gone
      const unassignedBadge = detailPage.budgetLinesSection.locator('[class*="badge"]', {
        hasText: 'Unassigned',
      });
      await expect(unassignedBadge).not.toBeVisible();

      // A link to the household item detail page appears
      const hiLink = detailPage.budgetLinesSection.locator('a', {
        hasText: `${testPrefix} AssHI Item`,
      });
      await expect(hiLink).toBeVisible();
      await expect(hiLink).toHaveAttribute('href', new RegExp('/project/household-items/'));

      // After HI assignment, the original work_item_budget is deleted (cascade via assign service).
      // No need to deleteOrphanWorkItemBudget.
      wibId = ''; // clear so finally block doesn't double-delete
    } finally {
      if (wibId) deleteOrphanWorkItemBudget(wibId);
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (householdItemId) await deleteHouseholdItemViaApi(page, householdItemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Edit modal on already-assigned line — no parent picker
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Edit modal for assigned budget line — collapsed parent picker (Scenario 4)', () => {
  // Behavior updated by PR #1553 ("full edit + linked-item move"): assigned
  // budget lines now render the parent picker in a COLLAPSED state inside
  // the edit modal — the current parent is shown as a pill + label with a
  // "Change" affordance, and the expandable picker body is hidden by default.
  // The picker only expands when the user clicks "Change".
  test('Opening Edit modal on an already-assigned line shows the collapsed parent row with the current parent and a Change button (picker body hidden)', async ({
    page,
    testPrefix,
  }) => {
    // Desktop only — interaction test
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 1024) {
      test.skip(true, 'Functional test — desktop only');
      return;
    }

    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId = '';
    let workItemId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} CollapsedPicker Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 500,
        date: '2026-06-01',
      });
      workItemId = await createWorkItemViaApi(page, {
        title: `${testPrefix} CollapsedPicker WI`,
      });

      // Create and link a NORMAL (assigned) budget line via REST API
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
        data: {
          workItemBudgetId: budgetBody.budget.id,
          itemizedAmount: 200,
        },
      });
      expect(linkResp.ok(), `POST budget-line failed: ${linkResp.status()}`).toBeTruthy();

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      // Budget line table should be visible with the assigned row
      await expect(detailPage.budgetLinesSection).toContainText(`${testPrefix} Assigned Line`);

      // Open the OverflowMenu for the budget line
      await openBudgetLineMenu(page, detailPage.budgetLinesSection);
      await clickMenuItemByText(page, 'Edit');

      const editModal = page.getByRole('dialog', { name: 'Edit Budget Line' });
      await expect(editModal).toBeVisible();

      // The parent picker fieldset IS present (collapsed state)
      const parentPickerFieldset = editModal.locator('fieldset[class*="parentPickerSection"]');
      await expect(parentPickerFieldset).toBeVisible();

      // The collapsed current-parent row shows the current parent name
      const currentParentRow = parentPickerFieldset.locator('[class*="currentParentRow"]');
      await expect(currentParentRow).toBeVisible();
      await expect(currentParentRow).toContainText(`${testPrefix} CollapsedPicker WI`);

      // A "Change" button is available to expand the picker
      const changeButton = currentParentRow.getByRole('button');
      await expect(changeButton).toBeVisible();
      // The button starts collapsed (aria-expanded="false")
      await expect(changeButton).toHaveAttribute('aria-expanded', 'false');

      // The expanded picker body is hidden by default
      const pickerBody = parentPickerFieldset.locator('#parent-picker-body');
      await expect(pickerBody).toBeHidden();

      // The itemized amount input is still shown (full edit form for assigned lines)
      // The field id changed from #budget-line-amount to #budget-itemized-amount in PR #1553
      // when the simple amount-only modal was replaced by the unified BudgetLineForm.
      const amountInput = page.locator('#budget-itemized-amount');
      await expect(amountInput).toBeVisible();

      // Close the modal
      const cancelBtn = editModal.getByRole('button', { name: 'Cancel', exact: true });
      await cancelBtn.click();
      await expect(editModal).not.toBeVisible();
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
  test('Unassigned badge visible on mobile and assign-to-work-item flow completes', async ({
    page,
    testPrefix,
  }) => {
    // This test is specifically for mobile viewports (≤767px)
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth > 600) {
      test.skip(true, 'Mobile-specific test — skip on tablet/desktop viewports');
      return;
    }

    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId = '';
    let workItemId = '';
    let wibId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} MobAss Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 700,
        date: '2026-06-01',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} MobAss WI` });

      const seeded = seedOrphanBudgetLine({
        invoiceId,
        plannedAmount: 300,
        itemizedAmount: 250,
        description: `${testPrefix} MobAss Line`,
      });
      wibId = seeded.wibId;

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      // Scenario 6a: Unassigned badge renders on mobile
      const unassignedBadge = detailPage.budgetLinesSection.locator('[class*="badge"]', {
        hasText: 'Unassigned',
      });
      await expect(unassignedBadge).toBeVisible();

      // Scenario 6b: Assign flow works on mobile
      const assignBtn = detailPage.budgetLinesSection.locator('[class*="assignButton"]', {
        hasText: 'Assign…',
      });
      await assignBtn.scrollIntoViewIfNeeded();
      await expect(assignBtn).toBeVisible();
      await assignBtn.click();

      const editModal = page.getByRole('dialog', { name: 'Edit Budget Line' });
      await expect(editModal).toBeVisible();

      // Parent picker is visible on mobile too
      const parentPickerFieldset = editModal.locator('fieldset[class*="parentPickerSection"]');
      await expect(parentPickerFieldset).toBeVisible();

      // Select work item
      const wiInput = parentPickerFieldset.locator('input[type="text"]').first();
      await wiInput.scrollIntoViewIfNeeded();
      await wiInput.fill(`${testPrefix} MobAss WI`);

      const option = page.getByRole('option', { name: `${testPrefix} MobAss WI` });
      await option.waitFor({ state: 'visible' });
      await option.click();

      const assignSubmitBtn = parentPickerFieldset.locator('[class*="assignSubmitButton"]');
      await assignSubmitBtn.scrollIntoViewIfNeeded();
      await expect(assignSubmitBtn).not.toBeDisabled();

      const assignPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/budget-lines/') &&
          resp.url().includes('/assign') &&
          resp.request().method() === 'POST' &&
          resp.status() === 200,
      );
      await assignSubmitBtn.click();
      await assignPromise;

      // Modal closes
      await expect(editModal).not.toBeVisible();

      // Unassigned badge gone; link to work item appears
      await expect(unassignedBadge).not.toBeVisible();
      const workItemLink = detailPage.budgetLinesSection.locator('a', {
        hasText: `${testPrefix} MobAss WI`,
      });
      await expect(workItemLink).toBeVisible();

      wibId = ''; // cleared — work item cascade will delete the assigned budget line
    } finally {
      if (wibId) deleteOrphanWorkItemBudget(wibId);
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});
