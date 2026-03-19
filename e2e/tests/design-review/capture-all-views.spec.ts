/**
 * Design Review Screenshot Capture
 *
 * Captures comprehensive screenshots of EVERY view in the Cornerstone application
 * across desktop, tablet, and mobile viewports in both light and dark themes.
 *
 * This test is ISOLATED from the main E2E suite — it uses design-review.config.ts
 * and is triggered only via the design-review-screenshots GitHub workflow.
 *
 * Output structure:
 *   design-review-screenshots/
 *     {viewport}/
 *       {light|dark}/
 *         {NN}-{view-name}.png
 *
 * The numbered prefix ensures a natural review order matching the app's IA.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';
import type { Page, APIRequestContext } from '@playwright/test';
import { API } from '../../fixtures/testData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_BASE = path.resolve(__dirname, '../../design-review-screenshots');

// ─── Helpers ────────────────────────────────────────────────────────────────

function getViewportName(): string {
  const name = test.info().project.name;
  if (name === 'auth-setup') return 'desktop';
  return name; // 'desktop' | 'tablet' | 'mobile'
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => {
    localStorage.setItem('color-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  // Allow CSS transitions to settle
  await page.waitForTimeout(400);
}

async function captureView(page: Page, name: string) {
  const viewport = getViewportName();
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    const dir = path.join(SCREENSHOTS_BASE, viewport, theme);
    await page.screenshot({
      path: path.join(dir, `${name}.png`),
      fullPage: false,
    });
  }
}

async function captureViewFullPage(page: Page, name: string) {
  const viewport = getViewportName();
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    const dir = path.join(SCREENSHOTS_BASE, viewport, theme);
    await page.screenshot({
      path: path.join(dir, `${name}.png`),
      fullPage: true,
    });
  }
}

async function waitForPage(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500); // Allow React to finish rendering
}

/** Open the sidebar on tablet/mobile viewports */
async function openSidebarIfNeeded(page: Page) {
  const viewport = getViewportName();
  if (viewport === 'tablet' || viewport === 'mobile') {
    const menuButton = page.getByRole('button', { name: /menu/i });
    if (await menuButton.isVisible()) {
      await menuButton.click();
      await page.waitForTimeout(300);
    }
  }
}

// ─── Seed Data ──────────────────────────────────────────────────────────────

interface SeedResult {
  workItemIds: number[];
  vendorIds: number[];
  invoiceIds: number[];
  householdItemIds: number[];
  milestoneIds: number[];
  diaryEntryIds: number[];
  budgetCategoryIds: number[];
  budgetSourceIds: number[];
  hiCategoryIds: number[];
}

async function seedAllData(request: APIRequestContext, baseUrl: string): Promise<SeedResult> {
  const result: SeedResult = {
    workItemIds: [],
    vendorIds: [],
    invoiceIds: [],
    householdItemIds: [],
    milestoneIds: [],
    diaryEntryIds: [],
    budgetCategoryIds: [],
    budgetSourceIds: [],
    hiCategoryIds: [],
  };

  // Note: tags were removed in EPIC-18 (tagging system removed)

  // ── Budget Categories ──
  const categories = [
    { name: 'DR-Electrical', description: 'All electrical work and materials' },
    { name: 'DR-Plumbing', description: 'Water supply, drainage, and fixtures' },
    { name: 'DR-Windows & Doors', description: 'Exterior and interior openings' },
    { name: 'DR-Structural', description: 'Foundation, framing, and load-bearing elements' },
    { name: 'DR-Interior Finish', description: 'Drywall, paint, trim, and finishing' },
  ];
  for (const cat of categories) {
    const res = await request.post(`${baseUrl}${API.budgetCategories}`, { data: cat });
    if (res.ok()) {
      const body = (await res.json()) as { id: number };
      result.budgetCategoryIds.push(body.id);
    }
  }

  // ── Budget Sources ──
  const sources = [
    { name: 'DR-Construction Loan', totalAmount: 250000 },
    { name: 'DR-Savings', totalAmount: 75000 },
    { name: 'DR-Family Contribution', totalAmount: 25000 },
  ];
  for (const src of sources) {
    const res = await request.post(`${baseUrl}${API.budgetSources}`, { data: src });
    if (res.ok()) {
      const body = (await res.json()) as { id: number };
      result.budgetSourceIds.push(body.id);
    }
  }

  // ── Subsidy Programs ──
  await request.post(`${baseUrl}${API.subsidyPrograms}`, {
    data: {
      name: 'DR-Energy Efficiency Rebate',
      type: 'percentage',
      rate: 15,
      budgetCategoryId: result.budgetCategoryIds[0],
      status: 'approved',
    },
  });
  await request.post(`${baseUrl}${API.subsidyPrograms}`, {
    data: {
      name: 'DR-Renewable Energy Grant',
      type: 'fixed',
      amount: 5000,
      budgetCategoryId: result.budgetCategoryIds[0],
      status: 'pending',
    },
  });

  // ── Work Items (diverse statuses for richer views) ──
  // Note: tagIds removed in EPIC-18 (tagging system removed)
  const workItems = [
    {
      title: 'DR-Install kitchen cabinets',
      description:
        'Upper and lower cabinets in main kitchen area. Custom maple with soft-close hinges.',
      status: 'in_progress',
      startDate: '2026-03-01',
      endDate: '2026-03-15',
    },
    {
      title: 'DR-Rough electrical wiring',
      description: 'First fix electrical work throughout the house, including panel upgrade.',
      status: 'completed',
      startDate: '2026-02-01',
      endDate: '2026-02-20',
    },
    {
      title: 'DR-Plumbing rough-in',
      description: 'Water supply and drain lines for all bathrooms and kitchen.',
      status: 'completed',
      startDate: '2026-02-05',
      endDate: '2026-02-25',
    },
    {
      title: 'DR-Pour concrete foundation',
      description: 'Main structural foundation with reinforced concrete.',
      status: 'completed',
      startDate: '2026-01-10',
      endDate: '2026-01-25',
    },
    {
      title: 'DR-Install exterior windows',
      description: 'All exterior window frames and triple-pane glazing.',
      status: 'not_started',
      startDate: '2026-04-01',
      endDate: '2026-04-15',
    },
    {
      title: 'DR-Drywall installation',
      description: 'Hanging, taping, and finishing drywall on all interior walls and ceilings.',
      status: 'not_started',
      startDate: '2026-04-20',
      endDate: '2026-05-10',
    },
    {
      title: 'DR-Paint interior rooms',
      description: 'Prime and paint all interior rooms. Color scheme per design spec.',
      status: 'not_started',
      startDate: '2026-05-15',
      endDate: '2026-06-01',
    },
    {
      title: 'DR-Install HVAC system',
      description: 'Heat pump installation with ductwork for all zones.',
      status: 'in_progress',
      startDate: '2026-03-10',
      endDate: '2026-04-05',
    },
    {
      title: 'DR-Roof shingling',
      description: 'Install architectural shingles on main roof and garage.',
      status: 'completed',
      startDate: '2026-01-28',
      endDate: '2026-02-10',
    },
    {
      title: 'DR-Landscaping',
      description: 'Grade lot, install sod, plant trees and shrubs per landscape plan.',
      status: 'not_started',
      startDate: '2026-06-10',
      endDate: '2026-06-30',
    },
  ];
  for (const item of workItems) {
    const res = await request.post(`${baseUrl}/api/work-items`, { data: item });
    if (res.ok()) {
      const body = (await res.json()) as { id: number };
      result.workItemIds.push(body.id);
    }
  }

  // ── Add budget lines to work items ──
  if (
    result.workItemIds.length >= 5 &&
    result.budgetCategoryIds.length >= 4 &&
    result.budgetSourceIds.length >= 2
  ) {
    const budgetLines = [
      { wiIdx: 1, catIdx: 0, srcIdx: 0, amount: 18500, confidence: 'professional_estimate' },
      { wiIdx: 2, catIdx: 1, srcIdx: 0, amount: 12000, confidence: 'quote' },
      { wiIdx: 3, catIdx: 3, srcIdx: 0, amount: 35000, confidence: 'invoice' },
      { wiIdx: 4, catIdx: 2, srcIdx: 1, amount: 22000, confidence: 'own_estimate' },
      { wiIdx: 5, catIdx: 4, srcIdx: 0, amount: 8500, confidence: 'own_estimate' },
      { wiIdx: 7, catIdx: 0, srcIdx: 1, amount: 15000, confidence: 'quote' },
      { wiIdx: 8, catIdx: 2, srcIdx: 0, amount: 9800, confidence: 'invoice' },
    ];
    for (const line of budgetLines) {
      if (
        result.workItemIds[line.wiIdx] &&
        result.budgetCategoryIds[line.catIdx] &&
        result.budgetSourceIds[line.srcIdx]
      ) {
        await request.post(`${baseUrl}/api/work-items/${result.workItemIds[line.wiIdx]}/budgets`, {
          data: {
            budgetCategoryId: result.budgetCategoryIds[line.catIdx],
            budgetSourceId: result.budgetSourceIds[line.srcIdx],
            estimatedAmount: line.amount,
            confidence: line.confidence,
          },
        });
      }
    }
  }

  // ── Notes and subtasks on first work item ──
  if (result.workItemIds[0]) {
    await request.post(`${baseUrl}/api/work-items/${result.workItemIds[0]}/notes`, {
      data: { content: 'Cabinets arrived from supplier. Starting installation Monday.' },
    });
    await request.post(`${baseUrl}/api/work-items/${result.workItemIds[0]}/notes`, {
      data: { content: 'Hardware delivery delayed — new ETA Wednesday.' },
    });
    const subtasks = [
      'Order cabinet hardware',
      'Verify measurements',
      'Schedule installer',
      'Final punch list',
    ];
    for (let i = 0; i < subtasks.length; i++) {
      await request.post(`${baseUrl}/api/work-items/${result.workItemIds[0]}/subtasks`, {
        data: { title: subtasks[i], position: i },
      });
    }
  }

  // ── Dependencies ──
  if (result.workItemIds.length >= 7) {
    await request.post(`${baseUrl}/api/work-items/${result.workItemIds[2]}/dependencies`, {
      data: { predecessorId: result.workItemIds[3], type: 'finish_to_start' },
    });
    await request.post(`${baseUrl}/api/work-items/${result.workItemIds[1]}/dependencies`, {
      data: { predecessorId: result.workItemIds[3], type: 'finish_to_start' },
    });
    await request.post(`${baseUrl}/api/work-items/${result.workItemIds[5]}/dependencies`, {
      data: { predecessorId: result.workItemIds[1], type: 'finish_to_start' },
    });
    await request.post(`${baseUrl}/api/work-items/${result.workItemIds[6]}/dependencies`, {
      data: { predecessorId: result.workItemIds[5], type: 'finish_to_start' },
    });
    await request.post(`${baseUrl}/api/work-items/${result.workItemIds[4]}/dependencies`, {
      data: { predecessorId: result.workItemIds[8], type: 'finish_to_start' },
    });
  }

  // ── Vendors ──
  const vendors = [
    { name: 'DR-Sparky Electric Co.' },
    { name: 'DR-ProPlumb Solutions' },
    { name: 'DR-ClearView Windows' },
    { name: 'DR-Interior Designs LLC' },
  ];
  for (const v of vendors) {
    const res = await request.post(`${baseUrl}${API.vendors}`, { data: v });
    if (res.ok()) {
      const body = (await res.json()) as { id: number };
      result.vendorIds.push(body.id);
    }
  }

  // ── Invoices ──
  if (result.vendorIds.length >= 2) {
    const invoices = [
      {
        vendorId: result.vendorIds[0],
        data: {
          invoiceNumber: 'DR-INV-001',
          date: '2026-02-15',
          status: 'paid',
          lineItems: [
            { description: 'First fix wiring labor', amount: 9500 },
            { description: 'Electrical panel upgrade', amount: 3200 },
          ],
        },
      },
      {
        vendorId: result.vendorIds[0],
        data: {
          invoiceNumber: 'DR-INV-002',
          date: '2026-02-28',
          status: 'pending',
          lineItems: [{ description: 'Electrical materials', amount: 4200 }],
        },
      },
      {
        vendorId: result.vendorIds[1],
        data: {
          invoiceNumber: 'DR-PP-4401',
          date: '2026-02-20',
          status: 'paid',
          lineItems: [
            { description: 'Pipe fittings and connectors', amount: 3100 },
            { description: 'Plumbing labor - bathrooms', amount: 6800 },
          ],
        },
      },
      {
        vendorId: result.vendorIds[1],
        data: {
          invoiceNumber: 'DR-PP-4402',
          date: '2026-03-05',
          status: 'pending',
          lineItems: [{ description: 'Kitchen plumbing rough-in', amount: 4500 }],
        },
      },
    ];
    for (const inv of invoices) {
      const res = await request.post(`${baseUrl}${API.vendors}/${inv.vendorId}/invoices`, {
        data: inv.data,
      });
      if (res.ok()) {
        const body = (await res.json()) as { id: number };
        result.invoiceIds.push(body.id);
      }
    }
  }

  // ── Milestones ──
  const milestones = [
    { title: 'DR-Foundation Complete', targetDate: '2026-01-25' },
    { title: 'DR-Rough-ins Complete', targetDate: '2026-02-28' },
    { title: 'DR-Drywall Complete', targetDate: '2026-05-15' },
    { title: 'DR-Final Inspection', targetDate: '2026-06-30' },
  ];
  for (const ms of milestones) {
    const res = await request.post(`${baseUrl}${API.milestones}`, { data: ms });
    if (res.ok()) {
      const body = (await res.json()) as { id: number };
      result.milestoneIds.push(body.id);
    }
  }

  // ── Auto-schedule ──
  await request.post(`${baseUrl}${API.schedule}/auto`);

  // ── Household Items ──
  // Note: room field removed in EPIC-18 (replaced by AreaPicker; areas are not seeded here)
  const householdItems = [
    {
      name: 'DR-Kitchen island pendant lights',
      category: 'fixtures',
      status: 'purchased',
      quantity: 3,
      description: 'Brass pendant lights for above the kitchen island.',
    },
    {
      name: 'DR-Dishwasher',
      category: 'appliances',
      status: 'scheduled',
      quantity: 1,
      description: 'Energy Star rated built-in dishwasher.',
    },
    {
      name: 'DR-Living room sofa',
      category: 'furniture',
      status: 'planned',
      quantity: 1,
      description: 'L-shaped sectional sofa in charcoal grey.',
    },
    {
      name: 'DR-Smart thermostat',
      category: 'electronics',
      status: 'arrived',
      quantity: 1,
      description: 'Wi-Fi connected programmable thermostat.',
    },
    {
      name: 'DR-Bathroom vanity mirror',
      category: 'fixtures',
      status: 'planned',
      quantity: 2,
      description: 'LED backlit vanity mirrors with anti-fog.',
    },
    {
      name: 'DR-Dining table',
      category: 'furniture',
      status: 'purchased',
      quantity: 1,
      description: 'Solid oak dining table, seats 8.',
    },
  ];
  for (const item of householdItems) {
    const res = await request.post(`${baseUrl}${API.householdItems}`, { data: item });
    if (res.ok()) {
      const body = (await res.json()) as { id: number };
      result.householdItemIds.push(body.id);
    }
  }

  // ── Household item categories ──
  const hiCategories = [{ name: 'DR-Lighting' }, { name: 'DR-Bathroom' }];
  for (const cat of hiCategories) {
    const res = await request.post(`${baseUrl}/api/household-item-categories`, { data: cat });
    if (res.ok()) {
      const body = (await res.json()) as { id: number };
      result.hiCategoryIds.push(body.id);
    }
  }

  // ── Diary Entries ──
  const diaryEntries = [
    {
      type: 'daily_log',
      date: '2026-03-10',
      title: 'DR-Foundation inspection passed',
      body: 'Building inspector confirmed the foundation meets all code requirements. Ready to proceed with framing.',
      weather: { temperature: 18, conditions: 'sunny' },
    },
    {
      type: 'site_visit',
      date: '2026-03-08',
      title: 'DR-Pre-pour walkthrough with contractor',
      body: 'Met with general contractor to review rebar placement and form alignment before the concrete pour.',
      weather: { temperature: 14, conditions: 'cloudy' },
    },
    {
      type: 'delivery',
      date: '2026-03-06',
      title: 'DR-Lumber delivery for framing',
      items: '2x4 studs (200), 2x6 joists (80), 4x4 posts (12), plywood sheathing (40 sheets)',
      weather: { temperature: 10, conditions: 'cloudy' },
    },
    {
      type: 'issue',
      date: '2026-03-12',
      title: 'DR-Water damage in basement corner',
      body: 'Noticed water seepage in the northeast corner of the basement after heavy rain. Need to investigate waterproofing.',
      weather: { temperature: 8, conditions: 'rainy' },
    },
    {
      type: 'general_note',
      date: '2026-03-11',
      title: 'DR-Color selection finalized',
      body: 'Met with interior designer. Finalized paint colors for all rooms. Samples ordered.',
    },
  ];
  for (const entry of diaryEntries) {
    const res = await request.post(`${baseUrl}${API.diaryEntries}`, { data: entry });
    if (res.ok()) {
      const body = (await res.json()) as { id: number };
      result.diaryEntryIds.push(body.id);
    }
  }

  return result;
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

test.describe('Design Review Screenshots', () => {
  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';

  let seed: SeedResult;

  test.beforeAll(async ({ request }) => {
    seed = await seedAllData(request, baseUrl);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 01 — Authentication
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('01 - Authentication', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('01-login-page', async ({ page }) => {
      await page.goto(`${baseUrl}/login`);
      await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible({ timeout: 15000 });
      await captureView(page, '01-login-page');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 02 — Dashboard / Project Overview
  // ═══════════════════════════════════════════════════════════════════════════

  test('02-dashboard', async ({ page }) => {
    await page.goto(`${baseUrl}/project/overview`);
    await waitForPage(page);
    await captureView(page, '02-dashboard');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 03 — Navigation / App Shell
  // ═══════════════════════════════════════════════════════════════════════════

  test('03-sidebar-navigation', async ({ page }) => {
    await page.goto(`${baseUrl}/project/overview`);
    await waitForPage(page);
    await openSidebarIfNeeded(page);
    await captureView(page, '03-sidebar-navigation');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10 — Work Items
  // ═══════════════════════════════════════════════════════════════════════════

  test('10-work-items-list', async ({ page }) => {
    await page.goto(`${baseUrl}/project/work-items`);
    await waitForPage(page);
    await captureView(page, '10-work-items-list');
  });

  test('11-work-item-create', async ({ page }) => {
    await page.goto(`${baseUrl}/project/work-items/new`);
    await waitForPage(page);
    await captureView(page, '11-work-item-create');
  });

  test('12-work-item-detail', async ({ page }) => {
    const id = seed.workItemIds[0];
    test.skip(!id, 'No work items seeded');
    await page.goto(`${baseUrl}/project/work-items/${id}`);
    await waitForPage(page);
    await captureViewFullPage(page, '12-work-item-detail');
  });

  test('13-work-item-detail-completed', async ({ page }) => {
    // Show a completed work item for different visual state
    const id = seed.workItemIds[1]; // Rough electrical wiring — completed
    test.skip(!id, 'No completed work items seeded');
    await page.goto(`${baseUrl}/project/work-items/${id}`);
    await waitForPage(page);
    await captureView(page, '13-work-item-detail-completed');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 20 — Household Items
  // ═══════════════════════════════════════════════════════════════════════════

  test('20-household-items-list', async ({ page }) => {
    await page.goto(`${baseUrl}/project/household-items`);
    await waitForPage(page);
    await captureView(page, '20-household-items-list');
  });

  test('21-household-item-create', async ({ page }) => {
    await page.goto(`${baseUrl}/project/household-items/new`);
    await waitForPage(page);
    await captureView(page, '21-household-item-create');
  });

  test('22-household-item-detail', async ({ page }) => {
    const id = seed.householdItemIds[0];
    test.skip(!id, 'No household items seeded');
    await page.goto(`${baseUrl}/project/household-items/${id}`);
    await waitForPage(page);
    await captureViewFullPage(page, '22-household-item-detail');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 25 — Milestones
  // ═══════════════════════════════════════════════════════════════════════════

  test('25-milestones-list', async ({ page }) => {
    await page.goto(`${baseUrl}/project/milestones`);
    await waitForPage(page);
    await captureView(page, '25-milestones-list');
  });

  test('26-milestone-create', async ({ page }) => {
    await page.goto(`${baseUrl}/project/milestones/new`);
    await waitForPage(page);
    await captureView(page, '26-milestone-create');
  });

  test('27-milestone-detail', async ({ page }) => {
    const id = seed.milestoneIds[0];
    test.skip(!id, 'No milestones seeded');
    await page.goto(`${baseUrl}/project/milestones/${id}`);
    await waitForPage(page);
    await captureView(page, '27-milestone-detail');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 30 — Budget
  // ═══════════════════════════════════════════════════════════════════════════

  test('30-budget-overview', async ({ page }) => {
    await page.goto(`${baseUrl}/budget/overview`);
    await waitForPage(page);
    await captureView(page, '30-budget-overview');
  });

  test('31-budget-sources', async ({ page }) => {
    await page.goto(`${baseUrl}/budget/sources`);
    await waitForPage(page);
    await captureView(page, '31-budget-sources');
  });

  test('32-budget-subsidies', async ({ page }) => {
    await page.goto(`${baseUrl}/budget/subsidies`);
    await waitForPage(page);
    await captureView(page, '32-budget-subsidies');
  });

  test('33-vendors-list', async ({ page }) => {
    await page.goto(`${baseUrl}/budget/vendors`);
    await waitForPage(page);
    await captureView(page, '33-vendors-list');
  });

  test('34-vendor-detail', async ({ page }) => {
    const id = seed.vendorIds[0];
    test.skip(!id, 'No vendors seeded');
    await page.goto(`${baseUrl}/budget/vendors/${id}`);
    await waitForPage(page);
    await captureViewFullPage(page, '34-vendor-detail');
  });

  test('35-invoices-list', async ({ page }) => {
    await page.goto(`${baseUrl}/budget/invoices`);
    await waitForPage(page);
    await captureView(page, '35-invoices-list');
  });

  test('36-invoice-detail', async ({ page }) => {
    const id = seed.invoiceIds[0];
    test.skip(!id, 'No invoices seeded');
    await page.goto(`${baseUrl}/budget/invoices/${id}`);
    await waitForPage(page);
    await captureViewFullPage(page, '36-invoice-detail');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 40 — Schedule / Timeline
  // ═══════════════════════════════════════════════════════════════════════════

  test('40-gantt-chart', async ({ page }) => {
    await page.goto(`${baseUrl}/schedule/gantt`);
    await waitForPage(page);
    // Wait for SVG bars to render
    await expect(page.locator('svg rect').first()).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);
    await captureView(page, '40-gantt-chart');
  });

  test('41-gantt-dependencies', async ({ page }) => {
    await page.goto(`${baseUrl}/schedule/gantt`);
    await waitForPage(page);
    await expect(page.locator('svg rect').first()).toBeVisible({ timeout: 10000 });

    // Toggle dependency arrows on
    const arrowPath = page.locator('svg path.dependency-arrow, svg path[marker-end]').first();
    if ((await arrowPath.count()) === 0) {
      const toggleBtn = page.locator('[aria-label*="dependencies"], [aria-label*="arrows"]');
      if ((await toggleBtn.count()) > 0) {
        await toggleBtn.first().click();
        await page.waitForTimeout(500);
      }
    }

    // Toggle critical path on
    const criticalPathBtn = page.locator(
      '[aria-label*="critical path"], [aria-label*="Critical path"]',
    );
    if ((await criticalPathBtn.count()) > 0) {
      await criticalPathBtn.first().click();
      await page.waitForTimeout(500);
    }

    await captureView(page, '41-gantt-dependencies');
  });

  test('42-calendar-view', async ({ page }) => {
    await page.goto(`${baseUrl}/schedule/calendar`);
    await waitForPage(page);
    await captureView(page, '42-calendar-view');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 50 — Diary
  // ═══════════════════════════════════════════════════════════════════════════

  test('50-diary-list', async ({ page }) => {
    await page.goto(`${baseUrl}/diary`);
    await waitForPage(page);
    await captureView(page, '50-diary-list');
  });

  test('51-diary-entry-create-type-selector', async ({ page }) => {
    await page.goto(`${baseUrl}/diary/new`);
    await waitForPage(page);
    // Step 1: type selector
    await captureView(page, '51-diary-create-type-selector');
  });

  test('52-diary-entry-create-form', async ({ page }) => {
    await page.goto(`${baseUrl}/diary/new`);
    await waitForPage(page);
    // Click 'Daily Log' to get to step 2
    const dailyLogOption = page
      .getByRole('button', { name: /daily log/i })
      .or(page.locator('[data-testid*="daily"]').first());
    if (await dailyLogOption.isVisible()) {
      await dailyLogOption.click();
      await page.waitForTimeout(500);
    }
    await captureView(page, '52-diary-create-form');
  });

  test('53-diary-entry-detail', async ({ page }) => {
    const id = seed.diaryEntryIds[0];
    test.skip(!id, 'No diary entries seeded');
    await page.goto(`${baseUrl}/diary/${id}`);
    await waitForPage(page);
    await captureViewFullPage(page, '53-diary-entry-detail');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 60 — Settings
  // ═══════════════════════════════════════════════════════════════════════════

  test('60-profile-page', async ({ page }) => {
    await page.goto(`${baseUrl}/settings/profile`);
    await waitForPage(page);
    await captureViewFullPage(page, '60-profile-page');
  });

  test('61-manage-areas', async ({ page }) => {
    // Note: renamed from '61-manage-tags' in EPIC-18 (tagging system removed; page now shows Areas)
    await page.goto(`${baseUrl}/settings/manage`);
    await waitForPage(page);
    await captureView(page, '61-manage-areas');
  });

  test('62-manage-budget-categories', async ({ page }) => {
    await page.goto(`${baseUrl}/settings/manage?tab=budget-categories`);
    await waitForPage(page);
    await captureView(page, '62-manage-budget-categories');
  });

  test('63-manage-hi-categories', async ({ page }) => {
    await page.goto(`${baseUrl}/settings/manage?tab=hi-categories`);
    await waitForPage(page);
    await captureView(page, '63-manage-hi-categories');
  });

  test('64-user-management', async ({ page }) => {
    await page.goto(`${baseUrl}/settings/users`);
    await waitForPage(page);
    await captureView(page, '64-user-management');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 70 — Error / Empty States
  // ═══════════════════════════════════════════════════════════════════════════

  test('70-not-found-page', async ({ page }) => {
    await page.goto(`${baseUrl}/this-page-does-not-exist`);
    await waitForPage(page);
    await captureView(page, '70-not-found-page');
  });
});
