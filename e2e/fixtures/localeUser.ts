/**
 * Opens a page as a fresh dedicated member whose `locale` preference is set (#2213).
 *
 * The shared admin's preference row is a single mutable record that every parallel test reads
 * (see `isolatedUser.ts`), so a spec that needs German never flips it on the admin. This helper
 * creates one disposable member, logs it in inside its own browser context (own cookies), seeds
 * the locale on the server, and navigates. It is a plain function, not a fixture: `test.use()`
 * would reshuffle shard membership suite-wide. The login rate limit is 20 per 15 minutes per IP,
 * so call it sparingly (one session per test).
 */

import type { Browser, BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { createLocalUserViaApi, deleteUserViaApi } from './apiHelpers.js';
import { API } from './testData.js';

const PASSWORD = 'e2e-locale-user-123!';

export interface LocaleSession {
  context: BrowserContext;
  page: Page;
  userId: string;
  /** Close the context and deactivate the user. Safe to call once, from `finally`. */
  dispose: () => Promise<void>;
}

/**
 * @param admin  the admin page used for the API calls that create and remove the user
 * @param url    the path to open once the locale is seeded; the page is reloaded afterwards
 *               because the locale is read once at start-up
 */
export async function openAsLocaleUser(
  browser: Browser,
  admin: Page,
  testPrefix: string,
  url: string,
  locale: 'en' | 'de' = 'de',
): Promise<LocaleSession> {
  const user = await createLocalUserViaApi(admin, {
    email: `locale-${locale}-${testPrefix.toLowerCase()}-${Date.now()}@e2e-test.local`,
    displayName: 'E2E Locale User',
    password: PASSWORD,
  });
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  try {
    const login = await page.request.post(API.login, {
      data: { email: user.email, password: PASSWORD },
    });
    expect(login.ok(), `login as ${user.email}: ${login.status()}`).toBeTruthy();
    const pref = await page.request.patch('/api/users/me/preferences', {
      data: { key: 'locale', value: locale },
    });
    expect(pref.ok(), `seed locale: ${pref.status()}`).toBeTruthy();
    await page.goto(url);
    await page.reload({ waitUntil: 'networkidle' });
  } catch (error) {
    await context.close();
    await deleteUserViaApi(admin, user.id);
    throw error;
  }
  return {
    context,
    page,
    userId: user.id,
    dispose: async () => {
      await context.close();
      await deleteUserViaApi(admin, user.id);
    },
  };
}
