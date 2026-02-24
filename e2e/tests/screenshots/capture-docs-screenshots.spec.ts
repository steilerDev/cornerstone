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
import { ROUTES } from '../../fixtures/testData.js';

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
  const tags = [
    { name: 'Electrical', color: '#f59e0b' },
    { name: 'Plumbing', color: '#3b82f6' },
    { name: 'Exterior', color: '#10b981' },
  ];

  const tagIds: number[] = [];
  for (const tag of tags) {
    const res = await request.post(`${baseUrl}/api/tags`, { data: tag });
    if (res.ok()) {
      const body = (await res.json()) as { id: number };
      tagIds.push(body.id);
    }
  }

  const workItems = [
    {
      title: 'Install kitchen cabinets',
      description: 'Upper and lower cabinets in main kitchen area.',
      status: 'in_progress',
      startDate: '2026-03-01',
      endDate: '2026-03-15',
      tagIds: tagIds.slice(0, 1),
    },
    {
      title: 'Rough electrical wiring',
      description: 'First fix electrical work throughout the house.',
      status: 'completed',
      startDate: '2026-02-01',
      endDate: '2026-02-20',
      tagIds: [tagIds[0]],
    },
    {
      title: 'Plumbing rough-in',
      description: 'Water supply and drain lines for all bathrooms.',
      status: 'completed',
      startDate: '2026-02-05',
      endDate: '2026-02-25',
      tagIds: [tagIds[1]],
    },
    {
      title: 'Pour concrete foundation',
      description: 'Main structural foundation.',
      status: 'completed',
      startDate: '2026-01-10',
      endDate: '2026-01-25',
      tagIds: [],
    },
    {
      title: 'Install exterior windows',
      description: 'All exterior window frames and glazing.',
      status: 'not_started',
      startDate: '2026-04-01',
      endDate: '2026-04-15',
      tagIds: [tagIds[2]],
    },
    {
      title: 'Drywall installation',
      description: 'Hanging, taping, and finishing drywall on all interior walls.',
      status: 'not_started',
      startDate: '2026-04-20',
      endDate: '2026-05-10',
      tagIds: [],
    },
    {
      title: 'Paint interior rooms',
      description: 'Prime and paint all interior rooms.',
      status: 'not_started',
      startDate: '2026-05-15',
      endDate: '2026-06-01',
      tagIds: [],
    },
    {
      title: 'Schedule building inspection',
      description: 'Arrange final inspection with the local building authority.',
      status: 'not_started',
      startDate: '2026-06-15',
      endDate: '2026-06-15',
      tagIds: [],
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

test.describe('Documentation screenshots', () => {
  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';

  test.beforeAll(async ({ request }) => {
    await seedWorkItems(request, baseUrl);
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

  test('Work items list', async ({ page }) => {
    await page.goto(`${baseUrl}${ROUTES.workItems}`);
    await page.waitForLoadState('networkidle');

    // Ensure list is populated before screenshotting
    await expect(page.getByRole('heading', { name: /work items/i })).toBeVisible();
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

  test('Tags page', async ({ page }) => {
    await page.goto(`${baseUrl}/tags`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.waitForTimeout(300);
      await saveScreenshot(page, 'tags', theme);
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
});
