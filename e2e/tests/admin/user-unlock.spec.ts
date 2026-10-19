/**
 * E2E tests for Story #2219 [P1.12] Users: unlock and role guards (EPIC-21), the unlock half.
 *
 * Scenarios (admin storage state; the E2E container sets AUTH_RATE_LIMIT_MAX=1000, so the 11
 * login attempts per locked account are safe):
 *   U1. A local member is locked with 10 wrong-password logins from a signed-out request context
 *       (the 11th, with the right password, is 423 ACCOUNT_LOCKED). Settings > Users shows the
 *       "Locked" badge and an "Until ..." line; Unlock in the row menu shows the toast, clears
 *       the badge, returns focus to the trigger, and the member can sign in again.
 *   U2. The Status filter has a Locked option; unlocking the only row inside a Locked filter
 *       moves focus to the list search field (never <body>). Table viewports only: the phone card
 *       list has no column headers.
 *   U3. Keyboard: Enter on the trigger focuses the first item, ArrowDown reaches Unlock, Enter
 *       unlocks, and Escape on a reopened menu returns focus to the trigger. Desktop only.
 *   U4. No Unlock without a lock; a deactivated (and locked) user shows Deactivated, Edit is
 *       aria-disabled and there is no Unlock.
 *   U5. Dark mode: the Locked badge is legible (text and background differ). Desktop only.
 *   U6. Sort by Status: Active, then Locked, then Deactivated. Table viewports only.
 *
 * Data: synthetic local members created and deactivated through the API; every lookup is scoped
 * by the account's unique e-mail.
 */

import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { createLocalUserViaApi, deleteUserViaApi } from '../../fixtures/apiHelpers.js';
import { API } from '../../fixtures/testData.js';
import { UserManagementPage } from '../../pages/UserManagementPage.js';
import { ToastRegion } from '../../pages/components/ToastRegion.js';

const PASSWORD = 'e2e-lock-pw-12345!';
const WRONG_PASSWORD = 'e2e-definitely-wrong-pw!';

interface LockedUser {
  id: string;
  email: string;
  displayName: string;
}

const createdIds: string[] = [];

test.afterEach(async ({ page }) => {
  const ids = createdIds.splice(0);
  for (const id of ids) {
    await deleteUserViaApi(page, id).catch(() => undefined);
  }
});

async function createMember(page: Page, testPrefix: string, label: string): Promise<LockedUser> {
  const token = Math.random().toString(36).slice(2, 8);
  const email = `e2e-lock-${label}-${testPrefix}-${token}@example.test`.toLowerCase();
  const displayName = `E2E Lock ${label} ${testPrefix} ${token}`;
  const user = await createLocalUserViaApi(page, { email, displayName, password: PASSWORD });
  createdIds.push(user.id);
  return { id: user.id, email, displayName };
}

/** Locks the account with 10 wrong logins from a signed-out context (never `page.request`). */
async function lockAccount(api: APIRequestContext, email: string): Promise<void> {
  for (let attempt = 1; attempt <= 10; attempt++) {
    const wrong = await api.post(API.login, { data: { email, password: WRONG_PASSWORD } });
    expect(wrong.status(), `wrong login #${attempt}`).toBe(401);
  }
  const locked = await api.post(API.login, { data: { email, password: PASSWORD } });
  expect(locked.status(), 'correct password on a locked account').toBe(423);
  const body = (await locked.json()) as { error: { code: string } };
  expect(body.error.code).toBe('ACCOUNT_LOCKED');
}

async function findRow(users: UserManagementPage, email: string): Promise<void> {
  await users.searchInput.fill(email);
  await expect(users.rowScope(email)).toHaveCount(1);
}

test.describe('Users: unlock a locked account (#2219)', { tag: '@responsive' }, () => {
  test('U1: a locked account shows Locked and Until, Unlock clears it and sign-in works again', async ({
    page,
    playwright,
    baseURL,
    testPrefix,
  }) => {
    const user = await createMember(page, testPrefix, 'u1');
    const anon = await playwright.request.newContext({ baseURL });
    try {
      await lockAccount(anon, user.email);

      const users = new UserManagementPage(page);
      const toasts = new ToastRegion(page);
      await users.goto();
      await findRow(users, user.email);

      await expect(users.statusCell(user.email)).toContainText('Locked');
      await expect(users.lockedUntilText(user.email)).toBeVisible();
      await expect(users.statusCell(user.email)).not.toContainText('Active');

      await users.openRowMenu(user.email);
      await expect(users.rowMenu.getByRole('menuitem')).toHaveText([
        'Edit',
        'Unlock',
        'Deactivate',
      ]);
      await users.menuItem('Unlock').click();

      await expect(
        toasts.successToast.filter({
          hasText: `Unlocked ${user.displayName}. They can sign in again.`,
        }),
      ).toBeVisible();
      await expect(users.statusCell(user.email)).toContainText('Active');
      await expect(users.statusCell(user.email)).not.toContainText('Locked');
      await expect(users.lockedUntilText(user.email)).toHaveCount(0);
      await expect(users.rowMenuTrigger(user.email)).toBeFocused();
      await expect(users.rowMenuTrigger(user.email)).toHaveAccessibleName(
        `Actions for ${user.displayName}`,
      );

      const again = await anon.post(API.login, { data: { email: user.email, password: PASSWORD } });
      expect(again.status(), 'sign in after unlock').toBe(200);
    } finally {
      await anon.dispose();
    }
  });

  test('U2: the Locked filter lists only locked rows and focus goes to the search field after unlocking', async ({
    page,
    playwright,
    baseURL,
    testPrefix,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Column filters need the table (>= 768px)');
    const user = await createMember(page, testPrefix, 'u2');
    const other = await createMember(page, testPrefix, 'u2o');
    const anon = await playwright.request.newContext({ baseURL });
    try {
      await lockAccount(anon, user.email);

      const users = new UserManagementPage(page);
      const toasts = new ToastRegion(page);
      await users.goto();
      await users.filterStatus('Locked');

      await users.searchInput.fill('E2E Lock u2');
      await expect(users.rowScope(user.email)).toHaveCount(1);
      await expect(users.rowScope(other.email)).toHaveCount(0);

      await users.unlock(user.email);
      await expect(toasts.successToast).toBeVisible();
      await expect(users.rowScope(user.email)).toHaveCount(0);
      await expect(page.locator('[data-page-search]')).toBeFocused();
    } finally {
      await anon.dispose();
    }
  });

  test('U3: the row menu works with the keyboard', async ({
    page,
    playwright,
    baseURL,
    testPrefix,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Keyboard flow: desktop only');
    const user = await createMember(page, testPrefix, 'u3');
    const anon = await playwright.request.newContext({ baseURL });
    try {
      await lockAccount(anon, user.email);

      const users = new UserManagementPage(page);
      const toasts = new ToastRegion(page);
      await users.goto();
      await findRow(users, user.email);

      const trigger = users.rowMenuTrigger(user.email);
      await trigger.focus();
      await page.keyboard.press('Enter');
      await expect(users.menuItem('Edit')).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(users.menuItem('Unlock')).toBeFocused();
      await page.keyboard.press('Enter');

      await expect(
        toasts.successToast.filter({ hasText: `Unlocked ${user.displayName}` }),
      ).toBeVisible();
      await expect(users.statusCell(user.email)).toContainText('Active');
      // UX spec: after Unlock the menu closes and focus returns to the row's trigger
      await expect(trigger).toBeFocused();

      await trigger.focus();
      await page.keyboard.press('Enter');
      await expect(users.rowMenu).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(users.rowMenu).toBeHidden();
      await expect(trigger).toBeFocused();
    } finally {
      await anon.dispose();
    }
  });

  test('U4: no Unlock for an unlocked user, and none for a deactivated one (Edit is aria-disabled)', async ({
    page,
    playwright,
    baseURL,
    testPrefix,
  }) => {
    const active = await createMember(page, testPrefix, 'u4a');
    const gone = await createMember(page, testPrefix, 'u4d');
    const anon = await playwright.request.newContext({ baseURL });
    try {
      await lockAccount(anon, gone.email);
      await deleteUserViaApi(page, gone.id);

      const users = new UserManagementPage(page);
      await users.goto();

      await findRow(users, active.email);
      await users.openRowMenu(active.email);
      await expect(users.rowMenu.getByRole('menuitem')).toHaveText(['Edit', 'Deactivate']);
      await expect(users.menuItem('Unlock')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(users.rowMenu).toBeHidden();

      await findRow(users, gone.email);
      await expect(users.statusCell(gone.email)).toContainText('Deactivated');
      await expect(users.statusCell(gone.email)).not.toContainText('Locked');
      await users.openRowMenu(gone.email);
      await expect(users.menuItem('Edit')).toHaveAttribute('aria-disabled', 'true');
      await expect(users.menuItem('Unlock')).toHaveCount(0);
      await expect(users.menuItem('Deactivate')).toHaveCount(0);
    } finally {
      await anon.dispose();
    }
  });

  test('U5: the Locked badge is legible in dark mode', async ({
    page,
    playwright,
    baseURL,
    testPrefix,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Computed colour spot check: desktop only');
    const user = await createMember(page, testPrefix, 'u5');
    const anon = await playwright.request.newContext({ baseURL });
    try {
      await lockAccount(anon, user.email);

      const users = new UserManagementPage(page);
      await users.goto();
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      await findRow(users, user.email);

      const badge = users.statusCell(user.email).getByText('Locked', { exact: true });
      await expect(badge).toBeVisible();
      const colours = await badge.evaluate((el) => {
        const s = getComputedStyle(el);
        return { color: s.color, background: s.backgroundColor };
      });
      expect(colours.color).not.toBe(colours.background);
      expect(colours.background).not.toBe('rgba(0, 0, 0, 0)');
    } finally {
      await anon.dispose();
    }
  });

  test('U6: sorting by Status lists Active, then Locked, then Deactivated', async ({
    page,
    playwright,
    baseURL,
    testPrefix,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Sorting needs the table (>= 768px)');
    const active = await createMember(page, testPrefix, 'u6a');
    const locked = await createMember(page, testPrefix, 'u6l');
    const gone = await createMember(page, testPrefix, 'u6d');
    const anon = await playwright.request.newContext({ baseURL });
    try {
      await lockAccount(anon, locked.email);
      await deleteUserViaApi(page, gone.id);

      const users = new UserManagementPage(page);
      await users.goto();
      await users.searchInput.fill(`${testPrefix.toLowerCase()}`);
      for (const u of [active, locked, gone]) {
        await expect(users.rowScope(u.email)).toHaveCount(1);
      }
      await users.sortByStatus();

      const emails = await users.table.locator('tbody tr td:nth-child(2)').allTextContents();
      const order = [active.email, locked.email, gone.email].map((e) => emails.indexOf(e));
      expect(
        order.every((i) => i >= 0),
        `rows present in ${emails.join(', ')}`,
      ).toBe(true);
      expect(order).toEqual([...order].sort((a, b) => a - b));
    } finally {
      await anon.dispose();
    }
  });
});
