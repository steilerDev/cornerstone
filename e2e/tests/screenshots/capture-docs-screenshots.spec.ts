/**
 * Documentation screenshot capture script.
 *
 * Captures screenshots of key application pages in light and dark mode
 * and saves them to docs/static/img/screenshots/ for use in the docs site.
 *
 * Run with: npm run docs:screenshots
 * (configured to run only on the desktop project at 1920x1080)
 *
 * Uses the existing testcontainer infrastructure and pre-authenticated
 * admin session for consistent, populated screenshots.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';
import { ROUTES, API } from '../../fixtures/testData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.resolve(__dirname, '../../../docs/static/img/screenshots');

// Helpers

async function setTheme(page: Parameters<typeof test>[1], theme: 'light' | 'dark') {
  await page.evaluate((t) => {
    localStorage.setItem('color-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
}

async function saveScreenshot(
  page: Parameters<typeof test>[1],
  name: string,
  theme: 'light' | 'dark',
) {
  const filename = `${name}-${theme}.png`;
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, filename),
    fullPage: false,
  });
}

// Seed data via API to make pages look populated

async function seedWorkItems(request: Parameters<typeof test>[2], baseUrl: string) {
  // Note: tags were removed in EPIC-18 (tagging system removed)
  const workItems = [
    {
      title: 'Install kitchen cabinets',
      description: 'Upper and lower cabinets in main kitchen area.',
      status: 'in_progress',
      startDate: '2026-03-01',
      endDate: '2026-03-15',
    },
    {
      title: 'Rough electrical wiring',
      description: 'First fix electrical work throughout the house.',
      status: 'completed',
      startDate: '2026-02-01',
      endDate: '2026-02-20',
    },
    {
      title: 'Plumbing rough-in',
      description: 'Water supply and drain lines for all bathrooms.',
      status: 'completed',
      startDate: '2026-02-05',
      endDate: '2026-02-25',
    },
    {
      title: 'Pour concrete foundation',
      description: 'Main structural foundation.',
      status: 'completed',
      startDate: '2026-01-10',
      endDate: '2026-01-25',
    },
    {
      title: 'Install exterior windows',
      description: 'All exterior window frames and glazing.',
      status: 'not_started',
      startDate: '2026-04-01',
      endDate: '2026-04-15',
    },
    {
      title: 'Drywall installation',
      description: 'Hanging, taping, and finishing drywall on all interior walls.',
      status: 'not_started',
      startDate: '2026-04-20',
      endDate: '2026-05-10',
    },
    {
      title: 'Paint interior rooms',
      description: 'Prime and paint all interior rooms.',
      status: 'not_started',
      startDate: '2026-05-15',
      endDate: '2026-06-01',
    },
    {
      title: 'Schedule building inspection',
      description: 'Arrange final inspection with the local building authority.',
      status: 'not_started',
      startDate: '2026-06-15',
      endDate: '2026-06-15',
    },
  ];

  const createdIds: number[] = [];
  for (const item of workItems) {
    const res = await request.post(`${baseUrl}/api/work-items`, { data: item });
    if (res.ok()) {
      const body = (await res.json()) as { id: number };
      createdIds.push(body.id);
    }
  }
  return createdIds;
}

async function seedBudgetData(
  request: Parameters<typeof test>[2],
  baseUrl: string,
  workItemIds: number[],
) {
  // Create budget categories
  const categories = [
    { name: 'Electrical', description: 'All electrical work and materials' },
    { name: 'Plumbing', description: 'Water supply, drainage, and fixtures' },
    { name: 'Windows & Doors', description: 'Exterior and interior openings' },
    { name: 'Structural', description: 'Foundation, framing, and load-bearing elements' },
  ];
  const categoryIds: number[] = [];
  for (const cat of categories) {
    const res = await request.post(`${baseUrl}${API.budgetCategories}`, { data: cat });
    if (res.ok()) {
      const body = (await res.json()) as { id: number };
      categoryIds.push(body.id);
    }
  }

  // Create financing sources
  const sources = [
    { name: 'Construction Loan', totalAmount: 250000 },
    { name: 'Savings', totalAmount: 50000 },
  ];
  const sourceIds: number[] = [];
  for (const src of sources) {
    const res = await request.post(`${baseUrl}${API.budgetSources}`, { data: src });
    if (res.ok()) {
      const body = (await res.json()) as { id: number };
      sourceIds.push(body.id);
    }
  }

  // Create a subsidy program
  await request.post(`${baseUrl}${API.subsidyPrograms}`, {
    data: {
      name: 'Energy Efficiency Rebate',
      type: 'percentage',
      rate: 15,
      budgetCategoryId: categoryIds[0],
      status: 'approved',
    },
  });

  // Create vendors
  const vendors = [
    { name: 'Sparky Electric Co.' },
    { name: 'ProPlumb Solutions' },
    { name: 'ClearView Windows' },
  ];
  const vendorIds: number[] = [];
  for (const v of vendors) {
    const res = await request.post(`${baseUrl}${API.vendors}`, { data: v });
    if (res.ok()) {
      const body = (await res.json()) as { id: number };
      vendorIds.push(body.id);
    }
  }

  // Add budget lines to work items
  if (workItemIds.length >= 5 && categoryIds.length >= 4 && sourceIds.length >= 2) {
    const budgetLines = [
      {
        workItemId: workItemIds[1],
        categoryId: categoryIds[0],
        sourceId: sourceIds[0],
        amount: 18500,
        confidence: 'professional_estimate',
      },
      {
        workItemId: workItemIds[2],
        categoryId: categoryIds[1],
        sourceId: sourceIds[0],
        amount: 12000,
        confidence: 'quote',
      },
      {
        workItemId: workItemIds[4],
        categoryId: categoryIds[2],
        sourceId: sourceIds[1],
        amount: 22000,
        confidence: 'own_estimate',
      },
      {
        workItemId: workItemIds[3],
        categoryId: categoryIds[3],
        sourceId: sourceIds[0],
        amount: 35000,
        confidence: 'invoice',
      },
    ];
    for (const line of budgetLines) {
      await request.post(`${baseUrl}/api/work-items/${line.workItemId}/budgets`, {
        data: {
          budgetCategoryId: line.categoryId,
          budgetSourceId: line.sourceId,
          estimatedAmount: line.amount,
          confidence: line.confidence,
        },
      });
    }
  }

  // Create invoices on vendors
  const invoiceIds: number[] = [];
  if (vendorIds.length >= 2) {
    const invoices = [
      {
        vendorId: vendorIds[0],
        invoiceNumber: 'INV-2026-001',
        date: '2026-02-15',
        status: 'paid',
        lineItems: [{ description: 'First fix wiring labor', amount: 9500 }],
      },
      {
        vendorId: vendorIds[0],
        invoiceNumber: 'INV-2026-002',
        date: '2026-02-28',
        status: 'pending',
        lineItems: [{ description: 'Electrical materials', amount: 4200 }],
      },
      {
        vendorId: vendorIds[1],
        invoiceNumber: 'PP-4401',
        date: '2026-02-20',
        status: 'paid',
        lineItems: [
          { description: 'Pipe fittings and connectors', amount: 3100 },
          { description: 'Plumbing labor - bathrooms', amount: 6800 },
        ],
      },
    ];
    for (const inv of invoices) {
      const res = await request.post(`${baseUrl}${API.vendors}/${inv.vendorId}/invoices`, {
        data: {
          invoiceNumber: inv.invoiceNumber,
          date: inv.date,
          status: inv.status,
          lineItems: inv.lineItems,
        },
      });
      if (res.ok()) {
        const body = (await res.json()) as { id: number };
        invoiceIds.push(body.id);
      }
    }
  }

  return { vendorIds, invoiceIds };
}

async function seedTimelineData(
  request: Parameters<typeof test>[2],
  baseUrl: string,
  workItemIds: number[],
) {
  // Create dependencies between work items
  if (workItemIds.length >= 7) {
    // Foundation -> Plumbing rough-in (FS)
    await request.post(`${baseUrl}/api/work-items/${workItemIds[2]}/dependencies`, {
      data: { predecessorId: workItemIds[3], type: 'finish_to_start' },
    });
    // Foundation -> Electrical rough-in (FS)
    await request.post(`${baseUrl}/api/work-items/${workItemIds[1]}/dependencies`, {
      data: { predecessorId: workItemIds[3], type: 'finish_to_start' },
    });
    // Electrical -> Drywall (FS)
    await request.post(`${baseUrl}/api/work-items/${workItemIds[5]}/dependencies`, {
      data: { predecessorId: workItemIds[1], type: 'finish_to_start' },
    });
    // Drywall -> Paint (FS)
    await request.post(`${baseUrl}/api/work-items/${workItemIds[6]}/dependencies`, {
      data: { predecessorId: workItemIds[5], type: 'finish_to_start' },
    });
  }

  // Create milestones
  const milestones = [
    { title: 'Foundation Complete', targetDate: '2026-01-25' },
    { title: 'Rough-ins Complete', targetDate: '2026-02-28' },
    { title: 'Final Inspection', targetDate: '2026-06-30' },
  ];
  for (const ms of milestones) {
    await request.post(`${baseUrl}${API.milestones}`, { data: ms });
  }

  // Trigger auto-schedule
  await request.post(`${baseUrl}${API.schedule}/auto`);
}

async function seedHouseholdItems(request: Parameters<typeof test>[2], baseUrl: string) {
  // Note: room field removed in EPIC-18 (replaced by AreaPicker; areas are not seeded here)
  const items = [
    {
      name: 'Kitchen island pendant lights',
      category: 'fixtures',
      status: 'purchased',
      quantity: 3,
      description: 'Brass pendant lights for above the kitchen island.',
    },
    {
      name: 'Dishwasher',
      category: 'appliances',
      status: 'scheduled',
      quantity: 1,
      description: 'Energy Star rated built-in dishwasher.',
    },
    {
      name: 'Living room sofa',
      category: 'furniture',
      status: 'planned',
      quantity: 1,
      description: 'L-shaped sectional sofa in charcoal grey.',
    },
    {
      name: 'Smart thermostat',
      category: 'electronics',
      status: 'arrived',
      quantity: 1,
      description: 'Wi-Fi connected programmable thermostat.',
    },
    {
      name: 'Bathroom vanity mirror',
      category: 'fixtures',
      status: 'planned',
      quantity: 2,
      description: 'LED backlit vanity mirrors with anti-fog.',
    },
  ];

  const householdItemIds: number[] = [];
  for (const item of items) {
    const res = await request.post(`${baseUrl}${API.householdItems}`, { data: item });
    if (res.ok()) {
      const body = (await res.json()) as { id: number };
      householdItemIds.push(body.id);
    }
  }
  return householdItemIds;
}

async function seedDiaryEntries(request: Parameters<typeof test>[2], baseUrl: string) {
  const entries = [
    {
      type: 'daily_log',
      date: '2026-03-10',
      title: 'Foundation inspection passed',
      body: 'Building inspector confirmed the foundation meets all code requirements. Ready to proceed with framing.',
      weather: { temperature: 18, conditions: 'sunny' },
    },
    {
      type: 'site_visit',
      date: '2026-03-08',
      title: 'Pre-pour walkthrough with contractor',
      body: 'Met with general contractor to review rebar placement and form alignment before the concrete pour.',
      weather: { temperature: 14, conditions: 'cloudy' },
    },
    {
      type: 'delivery',
      date: '2026-03-06',
      title: 'Lumber delivery for framing',
      items: '2x4 studs (200), 2x6 joists (80), 4x4 posts (12), plywood sheathing (40 sheets)',
      weather: { temperature: 10, conditions: 'cloudy' },
    },
  ];

  for (const entry of entries) {
    await request.post(`${baseUrl}${API.diaryEntries}`, { data: entry });
  }
}

test.describe('Documentation screenshots', () => {
  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';

  let workItemIds: number[] = [];
  let vendorIds: number[] = [];
  let householdItemIds: number[] = [];

  test.beforeAll(async ({ request }) => {
    workItemIds = await seedWorkItems(request, baseUrl);
    const budgetResult = await seedBudgetData(request, baseUrl, workItemIds);
    vendorIds = budgetResult.vendorIds;
    await seedTimelineData(request, baseUrl, workItemIds);
    householdItemIds = await seedHouseholdItems(request, baseUrl);
    await seedDiaryEntries(request, baseUrl);
  });

  test.describe('Unauthenticated screenshots', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('Login page', async ({ page }) => {
      await page.goto(`${baseUrl}${ROUTES.login}`);
      // Wait for the lazy-loaded LoginPage component to render — networkidle
      // fires before React finishes parsing and hydrating on slow CI runners,
      // so rely on the heading assertion with an explicit timeout instead.
      await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible({
        timeout: 15000,
      });

      for (const theme of ['light', 'dark'] as const) {
        await setTheme(page, theme);
        await page.waitForTimeout(300);
        await saveScreenshot(page, 'login', theme);
      }
    });
  });

  test('Dashboard', async ({ page }) => {
    await page.goto(`${baseUrl}${ROUTES.home}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1, name: 'Project' })).toBeVisible();
    await page.waitForTimeout(500);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(300);
      await saveScreenshot(page, 'dashboard', theme);
    }
  });

  test('Work items list', async ({ page }) => {
    await page.goto(`${baseUrl}${ROUTES.workItems}`);
    await page.waitForLoadState('networkidle');

    // Ensure list is populated before screenshotting.
    // Use level: 1 to target only the page h1, not the sidebar nav link which
    // also matches /work items/i and would cause a strict-mode violation.
    await expect(page.getByRole('heading', { level: 1, name: /project/i })).toBeVisible();
    await page.waitForTimeout(500);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(300);
      await saveScreenshot(page, 'work-items-list', theme);
    }
  });

  test('Work item detail', async ({ page, request }) => {
    // Get first work item
    const res = await request.get(`${baseUrl}/api/work-items?limit=1`);
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { items: Array<{ id: number }> };
    const firstId = body.items[0]?.id;
    if (!firstId) {
      test.skip(true, 'No work items available');
      return;
    }

    // Add a note for a richer detail view
    await request.post(`${baseUrl}/api/work-items/${firstId}/notes`, {
      data: { content: 'Cabinets arrived from supplier. Starting installation Monday.' },
    });

    // Add subtasks
    await request.post(`${baseUrl}/api/work-items/${firstId}/subtasks`, {
      data: { title: 'Order cabinet hardware', position: 0 },
    });
    await request.post(`${baseUrl}/api/work-items/${firstId}/subtasks`, {
      data: { title: 'Verify measurements', position: 1 },
    });
    await request.post(`${baseUrl}/api/work-items/${firstId}/subtasks`, {
      data: { title: 'Schedule installer', position: 2 },
    });

    await page.goto(`${baseUrl}${ROUTES.workItems}/${firstId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForTimeout(500);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(300);
      await saveScreenshot(page, 'work-item-detail', theme);
    }
  });

  test('Manage page', async ({ page }) => {
    // Note: renamed from 'Tags page' in EPIC-18 (tagging system removed; page now shows Areas)
    await page.goto(`${baseUrl}/settings/manage`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(300);
      await saveScreenshot(page, 'manage', theme);
    }
  });

  test('User profile page', async ({ page }) => {
    await page.goto(`${baseUrl}${ROUTES.profile}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(300);
      await saveScreenshot(page, 'profile', theme);
    }
  });

  test('Admin user management page', async ({ page }) => {
    await page.goto(`${baseUrl}${ROUTES.userManagement}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(300);
      await saveScreenshot(page, 'admin-users', theme);
    }
  });

  // Budget screenshots

  test('Budget overview', async ({ page }) => {
    await page.goto(`${baseUrl}${ROUTES.budget}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1, name: /budget/i })).toBeVisible();
    await page.waitForTimeout(500);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(300);
      await saveScreenshot(page, 'budget-overview', theme);
    }
  });

  test('Budget categories', async ({ page }) => {
    await page.goto(`${baseUrl}${ROUTES.budgetCategories}`);
    await page.waitForLoadState('networkidle');
    // Visual cleanup #1185: the h1 "Manage" heading was removed from ManagePage.
    // Wait for the always-visible create form heading as the readiness indicator.
    await expect(
      page.getByRole('heading', { level: 2, name: 'Create New Budget Category' }),
    ).toBeVisible();
    await page.waitForTimeout(500);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(300);
      await saveScreenshot(page, 'budget-categories', theme);
    }
  });

  test('Budget financing sources', async ({ page }) => {
    await page.goto(`${baseUrl}${ROUTES.budgetSources}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1, name: /budget/i })).toBeVisible();
    await page.waitForTimeout(500);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(300);
      await saveScreenshot(page, 'budget-sources', theme);
    }
  });

  test('Budget subsidies', async ({ page }) => {
    await page.goto(`${baseUrl}${ROUTES.budgetSubsidies}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1, name: /budget/i })).toBeVisible();
    await page.waitForTimeout(500);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(300);
      await saveScreenshot(page, 'budget-subsidies', theme);
    }
  });

  test('Vendor detail', async ({ page }) => {
    const vendorId = vendorIds[0];
    if (!vendorId) {
      test.skip(true, 'No vendors available');
      return;
    }

    await page.goto(`${baseUrl}${ROUTES.settingsVendors}/${vendorId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForTimeout(500);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(300);
      await saveScreenshot(page, 'budget-vendor-detail', theme);
    }
  });

  test('Invoice detail', async ({ page }) => {
    const vendorId = vendorIds[0];
    if (!vendorId) {
      test.skip(true, 'No vendors available');
      return;
    }

    await page.goto(`${baseUrl}${ROUTES.settingsVendors}/${vendorId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Click the first invoice row to navigate to invoice detail
    const invoiceLink = page.getByRole('link', { name: /INV-2026-001/i });
    if ((await invoiceLink.count()) > 0) {
      await invoiceLink.click();
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForTimeout(500);

      for (const theme of ['light', 'dark'] as const) {
        await setTheme(page, theme);
        await page.waitForTimeout(300);
        await saveScreenshot(page, 'budget-invoice-detail', theme);
      }
    }
  });

  // Timeline screenshots

  test('Timeline Gantt chart', async ({ page }) => {
    await page.goto(`${baseUrl}${ROUTES.timeline}`);
    await page.waitForLoadState('networkidle');
    // Wait for SVG bars to render
    await expect(page.locator('svg rect').first()).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(300);
      await saveScreenshot(page, 'timeline-gantt', theme);
    }
  });

  test('Timeline Gantt dependencies', async ({ page }) => {
    await page.goto(`${baseUrl}${ROUTES.timeline}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('svg rect').first()).toBeVisible({ timeout: 10000 });

    // Ensure dependency arrows are visible (toggle on if needed)
    const arrowPath = page.locator('svg path.dependency-arrow, svg path[marker-end]').first();
    if ((await arrowPath.count()) === 0) {
      // Try toggling the dependency arrows button
      const toggleBtn = page.locator('[aria-label*="dependencies"], [aria-label*="arrows"]');
      if ((await toggleBtn.count()) > 0) {
        await toggleBtn.first().click();
        await page.waitForTimeout(500);
      }
    }

    // Also toggle critical path on if available
    const criticalPathBtn = page.locator(
      '[aria-label*="critical path"], [aria-label*="Critical path"]',
    );
    if ((await criticalPathBtn.count()) > 0) {
      await criticalPathBtn.first().click();
      await page.waitForTimeout(500);
    }

    await page.waitForTimeout(300);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(300);
      await saveScreenshot(page, 'timeline-gantt-dependencies', theme);
    }
  });

  test('Timeline calendar view', async ({ page }) => {
    await page.goto(`${baseUrl}${ROUTES.timeline}?view=calendar`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(300);
      await saveScreenshot(page, 'timeline-calendar', theme);
    }
  });

  test('Timeline milestones panel', async ({ page }) => {
    await page.goto(`${baseUrl}${ROUTES.timeline}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('svg rect').first()).toBeVisible({ timeout: 10000 });

    // Open milestones panel
    const milestonesBtn = page.locator('[data-testid="milestones-panel-button"]');
    if ((await milestonesBtn.count()) > 0) {
      await milestonesBtn.click();
      await page.waitForTimeout(500);
    }

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(300);
      await saveScreenshot(page, 'timeline-milestones', theme);
    }
  });

  // Household items screenshots

  test('Household items list', async ({ page }) => {
    await page.goto(`${baseUrl}${ROUTES.householdItems}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1, name: /project/i })).toBeVisible();
    await page.waitForTimeout(500);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(300);
      await saveScreenshot(page, 'household-items-list', theme);
    }
  });

  // Diary screenshots

  test('Diary list', async ({ page }) => {
    await page.goto(`${baseUrl}${ROUTES.diary}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1, name: /diary/i })).toBeVisible();
    await page.waitForTimeout(500);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(300);
      await saveScreenshot(page, 'diary-list', theme);
    }
  });

  test('Diary entry detail', async ({ page }) => {
    // Navigate to first diary entry
    await page.goto(`${baseUrl}${ROUTES.diary}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1, name: /diary/i })).toBeVisible();

    // Click first entry to navigate to detail
    const firstEntry = page.locator('[data-testid="diary-entry-card"]').first();
    if ((await firstEntry.count()) > 0) {
      await firstEntry.click();
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForTimeout(500);

      for (const theme of ['light', 'dark'] as const) {
        await setTheme(page, theme);
        await page.waitForTimeout(300);
        await saveScreenshot(page, 'diary-entry-detail', theme);
      }
    }
  });

  test('Household item detail', async ({ page }) => {
    const itemId = householdItemIds[0];
    if (!itemId) {
      test.skip(true, 'No household items available');
      return;
    }

    await page.goto(`${baseUrl}${ROUTES.householdItems}/${itemId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForTimeout(500);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(300);
      await saveScreenshot(page, 'household-item-detail', theme);
    }
  });
});
