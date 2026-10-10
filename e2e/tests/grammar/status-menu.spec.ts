/**
 * E2E tests for the grammar foundations: StatusMenu + UndoToast (Story #2209).
 *
 * Every status control (task, purchase, milestone, invoice, progress payment) is one shared
 * StatusMenu: a chip that opens a popover (from 1024 px) or the bottom Sheet (below). Forward
 * moves that need a date go through a date step (Today / As planned / Pick a date); every
 * change shows a 6 s Undo toast (Ctrl/Cmd+Z works too).
 *
 * Scenarios:
 *   1. Task: Start > Today - chip, toast and the actual start (API)
 *   2. Task: Mark done > Pick a past date, then Undo restores status and date (API); focus
 *   3. Ctrl+Z undoes the newest toast; Ctrl+Z inside a text input does not
 *   4. Purchase: Mark delivered > As planned stores the target date
 *   5. Milestone: Mark reached > Today; Back to "Upcoming"
 *   6. Invoice: Mark paid applies at once, no date step (AC3)
 *   7. Progress payment: Mark submitted > Today (table row or mobile card, per viewport)
 *   8. Surface is the Sheet below 1024 px and a popover above; Escape returns focus to the chip
 *   9. Keyboard only: Enter opens, ArrowDown + Enter picks, Today applies, focus never on body
 *  10. Pick rejects a future date (inline error, no request)
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';
import { HouseholdItemDetailPage } from '../../pages/HouseholdItemDetailPage.js';
import { MilestoneDetailPage } from '../../pages/MilestoneDetailPage.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import { ToastRegion } from '../../pages/components/ToastRegion.js';
import { API } from '../../fixtures/testData.js';
import {
  createWorkItemViaApi,
  deleteWorkItemViaApi,
  createHouseholdItemViaApi,
  deleteHouseholdItemViaApi,
  createMilestoneViaApi,
  deleteMilestoneViaApi,
  createVendorViaApi,
  deleteVendorViaApi,
} from '../../fixtures/apiHelpers.js';

/** Today as YYYY-MM-DD in the browser's local time (what the StatusMenu "Today" chip sends). */
function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

interface WorkItemRecord {
  status: string;
  actualStartDate: string | null;
  actualEndDate: string | null;
}

async function fetchWorkItem(page: Page, id: string): Promise<WorkItemRecord> {
  const resp = await page.request.get(`${API.workItems}/${id}`);
  expect(resp.ok(), `GET work item ${id}`).toBeTruthy();
  return (await resp.json()) as WorkItemRecord;
}

async function createInvoiceViaApi(
  page: Page,
  vendorId: string,
  data: { amount: number; date: string; status: string },
): Promise<string> {
  const resp = await page.request.post(`${API.vendors}/${vendorId}/invoices`, { data });
  expect(resp.ok(), `POST invoice failed: ${resp.status()}`).toBeTruthy();
  const body = (await resp.json()) as { invoice: { id: string } };
  return body.invoice.id;
}

/** Document.activeElement is a real element (never <body>): the AC7 focus rule. */
async function expectFocusNotOnBody(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.activeElement !== null && document.activeElement !== document.body,
      ),
    )
    .toBe(true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 1-3: Task status
// ─────────────────────────────────────────────────────────────────────────────

test.describe('StatusMenu — task status', { tag: '@responsive' }, () => {
  test('Start > Today moves the task to In progress and stores today as the actual start', async ({
    page,
    testPrefix,
  }) => {
    const detail = new WorkItemDetailPage(page);
    const toasts = new ToastRegion(page);
    const title = `${testPrefix} Status Start Task`;
    const id = await createWorkItemViaApi(page, {
      title,
      status: 'not_started',
      startDate: '2026-11-02',
      endDate: '2026-11-20',
    });

    try {
      await detail.goto(id);
      await expect(detail.statusMenu.trigger).toHaveText('Not started');

      await detail.statusMenu.chooseToday('in_progress');

      await expect(detail.statusMenu.trigger).toHaveText('In progress');
      await expect(toasts.undoToastWith(`${title} is now “In progress”.`)).toBeVisible();
      await expect(toasts.undoButton).toBeVisible();

      const record = await fetchWorkItem(page, id);
      expect(record.status).toBe('in_progress');
      expect(record.actualStartDate).toBe(localToday());
    } finally {
      await deleteWorkItemViaApi(page, id);
    }
  });

  test('Mark done > Pick a past date stores it; Undo restores status and date and focus stays on the chip', async ({
    page,
    testPrefix,
  }) => {
    const detail = new WorkItemDetailPage(page);
    const toasts = new ToastRegion(page);
    const id = await createWorkItemViaApi(page, {
      title: `${testPrefix} Status Done Task`,
      status: 'not_started',
    });

    try {
      // Put the task in progress with a known past start through the API
      const started = await page.request.patch(`${API.workItems}/${id}`, {
        data: { status: 'in_progress', actualStartDate: '2026-01-05' },
      });
      expect(started.ok(), 'PATCH to in_progress').toBeTruthy();

      await detail.goto(id);
      await expect(detail.statusMenu.trigger).toHaveText('In progress');

      await detail.statusMenu.choosePickedDate('completed', '2026-01-10');

      await expect(detail.statusMenu.trigger).toHaveText('Done');
      // The chip keeps the keyboard focus after a change (never the body)
      await expect(detail.statusMenu.trigger).toBeFocused();
      await expect
        .poll(async () => (await fetchWorkItem(page, id)).actualEndDate)
        .toBe('2026-01-10');

      // Undo (button) restores the previous status and clears the end date
      await toasts.undoViaButton();
      await expect(toasts.undoneToast).toHaveText(/Change undone\./);
      await expect(detail.statusMenu.trigger).toHaveText('In progress');

      const restored = await fetchWorkItem(page, id);
      expect(restored.status).toBe('in_progress');
      expect(restored.actualEndDate).toBeNull();
      expect(restored.actualStartDate).toBe('2026-01-05');
      await expectFocusNotOnBody(page);
    } finally {
      await deleteWorkItemViaApi(page, id);
    }
  });

  test('Ctrl+Z undoes the newest undo toast; Ctrl+Z inside a text field does not', async ({
    page,
    testPrefix,
  }) => {
    const detail = new WorkItemDetailPage(page);
    const toasts = new ToastRegion(page);
    const id = await createWorkItemViaApi(page, {
      title: `${testPrefix} Status Shortcut Task`,
      status: 'not_started',
    });

    try {
      await detail.goto(id);

      // Keyboard undo with focus on the chip
      await detail.statusMenu.chooseToday('in_progress');
      await expect(toasts.undoToast).toBeVisible();
      await toasts.undoViaShortcut('Control');
      await expect(detail.statusMenu.trigger).toHaveText('Not started');
      expect((await fetchWorkItem(page, id)).status).toBe('not_started');

      // With focus in a text field the shortcut belongs to the field (text undo), not the toast
      await detail.statusMenu.chooseToday('in_progress');
      await expect(toasts.undoToast).toBeVisible();
      await detail.noteTextarea.fill('typing here');
      await expect(detail.noteTextarea).toBeFocused();
      await page.keyboard.press('Control+z');

      await expect(toasts.undoToast).toBeVisible();
      await expect(toasts.undoneToast).toHaveCount(0);
      expect((await fetchWorkItem(page, id)).status).toBe('in_progress');

      // Clean the toast up through its button
      await toasts.undoViaButton();
    } finally {
      await deleteWorkItemViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Purchase status
// ─────────────────────────────────────────────────────────────────────────────

test.describe('StatusMenu — purchase status', { tag: '@responsive' }, () => {
  test('Mark delivered > As planned stores the target delivery date', async ({
    page,
    testPrefix,
  }) => {
    const detail = new HouseholdItemDetailPage(page);
    const toasts = new ToastRegion(page);
    const name = `${testPrefix} Status Delivered Purchase`;
    const id = await createHouseholdItemViaApi(page, {
      name,
      status: 'planned',
      targetDeliveryDate: '2026-02-12',
    });

    try {
      await detail.goto(id);
      await expect(detail.statusMenu.trigger).toHaveText('Planned');

      await detail.statusMenu.choosePlanned('arrived');

      await expect(detail.statusMenu.trigger).toHaveText('Delivered');
      await expect(toasts.undoToastWith(`${name} is now “Delivered”.`)).toBeVisible();

      const resp = await page.request.get(`${API.householdItems}/${id}`);
      const body = (await resp.json()) as {
        householdItem: { status: string; actualDeliveryDate: string | null };
      };
      expect(body.householdItem.status).toBe('arrived');
      expect(body.householdItem.actualDeliveryDate).toBe('2026-02-12');
    } finally {
      await deleteHouseholdItemViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Milestone
// ─────────────────────────────────────────────────────────────────────────────

test.describe('StatusMenu — milestone', { tag: '@responsive' }, () => {
  test('Mark reached > Today completes the milestone; Back to Upcoming reopens it', async ({
    page,
    testPrefix,
  }) => {
    const detail = new MilestoneDetailPage(page);
    const id = await createMilestoneViaApi(page, {
      title: `${testPrefix} Status Milestone`,
      targetDate: '2026-03-01',
    });

    try {
      await detail.goto(id);
      await expect(detail.statusMenu.trigger).toHaveText('Upcoming');

      await detail.statusMenu.chooseToday('reached');
      await expect(detail.statusMenu.trigger).toHaveText('Reached');

      const reached = await page.request.get(`${API.milestones}/${id}`);
      expect(((await reached.json()) as { isCompleted: boolean }).isCompleted).toBe(true);

      // Back to “Upcoming” has no date step
      await detail.statusMenu.pickRow('not_reached');
      await expect(detail.statusMenu.trigger).toHaveText('Upcoming');

      const reopened = await page.request.get(`${API.milestones}/${id}`);
      expect(((await reopened.json()) as { isCompleted: boolean }).isCompleted).toBe(false);
    } finally {
      await deleteMilestoneViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 6-7: Money
// ─────────────────────────────────────────────────────────────────────────────

test.describe('StatusMenu — invoice and progress payment', { tag: '@responsive' }, () => {
  test('Invoice Mark paid applies at once and never asks for a date', async ({
    page,
    testPrefix,
  }) => {
    const detail = new InvoiceDetailPage(page);
    const vendorId = await createVendorViaApi(page, { name: `${testPrefix} Status Invoice Co` });

    try {
      const invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 300,
        date: '2026-06-01',
        status: 'pending',
      });

      await detail.goto(invoiceId);
      await expect(detail.statusMenu.trigger).toHaveText('To pay');

      await detail.statusMenu.open();
      await detail.statusMenu.option('paid').click();

      // AC3: there is no date step for an invoice
      await expect(detail.statusMenu.dateToday).toHaveCount(0);
      await expect(detail.statusMenu.datePick).toHaveCount(0);
      await expect(detail.statusMenu.trigger).toHaveText('Paid');

      const resp = await page.request.get(`${API.vendors}/${vendorId}/invoices/${invoiceId}`);
      const body = (await resp.json()) as { invoice: { status: string } };
      expect(body.invoice.status).toBe('paid');
    } finally {
      await deleteVendorViaApi(page, vendorId);
    }
  });

  test('Progress payment Mark submitted > Today works on the table row and on the mobile card', async ({
    page,
    testPrefix,
  }) => {
    const detail = new InvoiceDetailPage(page);
    const toasts = new ToastRegion(page);
    const vendorId = await createVendorViaApi(page, { name: `${testPrefix} Status Payment Co` });

    try {
      const invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 800,
        date: '2026-06-01',
        status: 'pending',
      });
      const created = await page.request.post(`/api/invoices/${invoiceId}/deposits`, {
        data: {
          amount: 200,
          dueDate: '2026-07-01',
          status: 'pending',
          description: `${testPrefix} first payment`,
        },
      });
      expect(created.ok(), 'POST deposit').toBeTruthy();

      await detail.goto(invoiceId);
      const menu = await detail.depositStatusMenu();

      // Both layouts are mounted; the visible one is the card at phone width, the row otherwise
      const isPhone = (page.viewportSize()?.width ?? 1440) <= 767;
      if (isPhone) {
        expect(menu.testId).toMatch(/^deposit-status-mobile-/);
      } else {
        expect(menu.testId).toMatch(/^deposit-status-(?!mobile-)/);
      }
      await expect(menu.trigger).toHaveText('To pay');

      await detail.changeDepositStatus('claimed', { date: 'today' });

      await expect(menu.trigger).toHaveText('Submitted');
      await expect(toasts.undoToastWith('is now “Submitted”.')).toBeVisible();
    } finally {
      await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 8-10: Surface, keyboard, validation
// ─────────────────────────────────────────────────────────────────────────────

test.describe('StatusMenu — surface, keyboard and validation', { tag: '@responsive' }, () => {
  test('The surface is the bottom Sheet below 1024 px and a popover above; Escape returns focus to the chip', async ({
    page,
    testPrefix,
  }) => {
    const detail = new WorkItemDetailPage(page);
    const id = await createWorkItemViaApi(page, {
      title: `${testPrefix} Status Surface Task`,
      status: 'not_started',
    });

    try {
      await detail.goto(id);
      await detail.statusMenu.open();

      const isCompact = (page.viewportSize()?.width ?? 1440) < 1024;
      if (isCompact) {
        await expect(detail.statusMenu.panel).toHaveAttribute('role', 'dialog');
        await expect(detail.statusMenu.panel).toHaveAttribute('data-open', 'true');
      } else {
        await expect(detail.statusMenu.panel).toHaveAttribute('role', 'menu');
      }
      await expect(detail.statusMenu.trigger).toHaveAttribute('aria-expanded', 'true');

      await page.keyboard.press('Escape');

      await expect(detail.statusMenu.panel).toBeHidden();
      await expect(detail.statusMenu.trigger).toBeFocused();
      await expect(detail.statusMenu.trigger).toHaveAttribute('aria-expanded', 'false');
    } finally {
      await deleteWorkItemViaApi(page, id);
    }
  });

  test('Keyboard only: Enter opens, ArrowDown + Enter picks, Today applies, and focus is never on the body', async ({
    page,
    testPrefix,
  }) => {
    const detail = new WorkItemDetailPage(page);
    const id = await createWorkItemViaApi(page, {
      title: `${testPrefix} Status Keyboard Task`,
      status: 'not_started',
    });

    try {
      await detail.goto(id);

      await detail.statusMenu.trigger.focus();
      await expect(detail.statusMenu.trigger).toBeFocused();

      // Enter opens the list with focus on the first row
      await page.keyboard.press('Enter');
      await detail.statusMenu.waitForSurface();
      await expect(detail.statusMenu.option('in_progress')).toBeFocused();
      await expectFocusNotOnBody(page);

      // ArrowDown moves to "Mark done"; Enter opens its date step with focus on Today
      await page.keyboard.press('ArrowDown');
      await expect(detail.statusMenu.option('completed')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(detail.statusMenu.dateToday).toBeFocused();
      await expectFocusNotOnBody(page);

      // Enter on Today applies and puts focus back on the chip
      const patched = page.waitForResponse(
        (resp) =>
          resp.url().includes(`${API.workItems}/${id}`) &&
          resp.request().method() === 'PATCH' &&
          resp.status() === 200,
      );
      await page.keyboard.press('Enter');
      await patched;

      await expect(detail.statusMenu.trigger).toHaveText('Done');
      await expect(detail.statusMenu.trigger).toBeFocused();
      await expectFocusNotOnBody(page);

      const record = await fetchWorkItem(page, id);
      expect(record.status).toBe('completed');
      expect(record.actualEndDate).toBe(localToday());
    } finally {
      await deleteWorkItemViaApi(page, id);
    }
  });

  test('Pick a date rejects a future date with an inline error and sends nothing', async ({
    page,
    testPrefix,
  }) => {
    const detail = new WorkItemDetailPage(page);
    const id = await createWorkItemViaApi(page, {
      title: `${testPrefix} Status Future Task`,
      status: 'not_started',
    });
    const patches: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'PATCH' && req.url().includes(`${API.workItems}/${id}`)) {
        patches.push(req.url());
      }
    });

    try {
      await detail.goto(id);
      await detail.statusMenu.pickRow('in_progress');
      await detail.statusMenu.datePick.click();
      await detail.statusMenu.dateInput.fill('2099-01-01');
      await detail.statusMenu.dateSet.click();

      await expect(
        detail.statusMenu.panel.getByText('Pick a date on or before today.'),
      ).toBeVisible();
      expect(patches).toHaveLength(0);
      await expect(detail.statusMenu.trigger).toHaveText('Not started');
      expect((await fetchWorkItem(page, id)).status).toBe('not_started');
    } finally {
      await deleteWorkItemViaApi(page, id);
    }
  });
});
