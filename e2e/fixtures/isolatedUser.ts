/**
 * Dedicated-user isolation for preference-mutating E2E specs (Issue #1957).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 * `playwright.config.ts` runs with `fullyParallel: true` and every project
 * authenticates as the SAME shared admin user (`test-results/.auth/admin.json`).
 * Per-user preference rows (`user_preferences`, keyed by user id) are therefore a
 * single mutable row shared by every concurrently running test in the suite.
 *
 * This is not merely "a test reads stale data" — it actively corrupts a running
 * test's UI. `LocaleContext.syncWithServer` (client/src/contexts/LocaleContext.tsx)
 * treats the SERVER value as authoritative: on every page load it fetches
 * `/api/users/me/preferences` and, when a `locale` row exists, applies the server
 * value AND deletes the `locale` key from `localStorage`. So if test A is asserting
 * English text and test B (different file, different worker) PATCHes `locale='de'`
 * on the shared admin, test A's next navigation flips to German and the
 * `localStorage` override that would otherwise have protected it has just been
 * deleted by the same sync call. Same class of failure for
 * `dashboard.hiddenCards` (cards vanish/reappear mid-test) and
 * `table.<name>.columns` (columns appear/disappear mid-test).
 *
 * `test.describe.configure({ mode: 'serial' })` cannot fix this: it only
 * serializes a file against ITSELF and has no knowledge of writes coming from
 * other files running concurrently in other workers.
 *
 * The remedy is to give preference-mutating tests their own disposable user, so
 * the row they write is unreachable by any other test in the suite. This module
 * packages that pattern (previously hand-rolled in `dashboard.spec.ts`,
 * `i18n-categories.spec.ts` and `change-password.spec.ts`) as a fixture, so the
 * spec bodies keep using the plain `page` fixture and keep Playwright's automatic
 * trace/video/screenshot instrumentation (a hand-made `browser.newContext()` does
 * not get those artifacts).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AUDIT — every spec that writes /api/users/me/preferences (Issue #1957, AC1)
 * ─────────────────────────────────────────────────────────────────────────────
 * Reproduce the file list with: `grep -rl "users/me/preferences" e2e/tests/`
 * (`e2e/pages/DashboardPage.ts` and `e2e/pages/InvoicesPage.ts` also match that
 * string, but only inside `waitForResponse()` predicates — they observe the
 * app's own requests, they never issue one, so they are not audit entries.)
 *
 * 1. e2e/tests/navigation/dashboard.spec.ts
 *    Keys: `dashboard.hiddenCards`, `locale` (top-level `beforeEach` reset, ran
 *    for all ~34 tests) + `dashboard.hiddenCards` written by the app itself when
 *    Scenario 6/7 click a card's dismiss/re-enable button.
 *    Admin-gated? No. The dashboard, `/project/work-items`, `/budget/invoices`,
 *    `/diary/new` and the Add/Customize dropdowns have no role checks (server:
 *    `requireRole('admin')` guards only `/api/users` mutations and
 *    `/api/backups/*`; client: only the Settings sub-nav "User Management" and
 *    "Backups" tabs and work-item note edit/delete are role-gated).
 *    Resolution (AC2): `isolatedUserPerWorker` at file scope.
 *
 * 2. e2e/tests/i18n/i18n.spec.ts
 *    Keys: `locale` (PATCH in `setLanguage()`/`resetToEnglish()`, plus
 *    `DELETE /api/users/me/preferences/locale` in "DELETE preference resets to
 *    system locale").
 *    Admin-gated? No — profile, dashboard, budget, schedule, diary, work items
 *    and the Settings→Vendors tab are all member-visible.
 *    Resolution (AC2, AC4): `isolatedUserPerWorker` at file scope. The file-level
 *    `serial` guard added in PR #1956 is kept only as defence-in-depth against CPU
 *    contention between two slow German-locale tests; it is no longer the
 *    isolation mechanism.
 *
 * 3. e2e/tests/i18n/i18n-categories.spec.ts
 *    Key: `locale`. ALREADY ISOLATED before this issue — creates a dedicated user
 *    per test and logs it into its own browser context. No change needed; listed
 *    here because AC1 requires the audit to cover every file in the grep output.
 *
 * 4. e2e/tests/diary/diary-uat-fixes.spec.ts
 *    Key: `dashboard.hiddenCards` (Scenario 3 "Dashboard shows a Recent Diary
 *    card" and Scenario 7 "Recent Diary View All link", which reset the key so
 *    the card is guaranteed visible). Same key as dashboard.spec.ts's reset —
 *    the second confirmed cross-file collision pair.
 *    Admin-gated? No — both tests only read the dashboard with mocked
 *    `/api/diary-entries`.
 *    Resolution (AC2, AC5): `isolatedUserPerTest` at describe scope for those two
 *    describes; the other six tests in the file touch no preferences and stay on
 *    the shared admin.
 *
 * 5. e2e/tests/invoices/invoices.spec.ts
 *    Key: `table.invoices.columns` (two DELETEs, both inside the single test
 *    "Toggling Effective Amount ..."), plus the app's own debounced PATCH of that
 *    key when `enableColumn()` toggles a column.
 *    Admin-gated? No — the invoices list/detail pages and vendor/invoice/work-item/
 *    budget-source creation have no role checks.
 *    Resolution (AC2): `isolatedUserPerTest` at describe scope for the
 *    "Effective Amount" describe only.
 *
 * No audited spec needs the admin role, so no spec required the AC3 treatment.
 * `role: 'admin'` is supported below for any future case that does.
 *
 * Related shared-state hazards deliberately OUT of scope here (they do not write
 * `/api/users/me/preferences` and so are outside AC1's grep, but the next person
 * should know): the app persists `table.<name>.columns` for every DataTable, so
 * any spec that toggles columns as the shared admin writes a preference row for
 * that table — only a spec asserting the same table's columns can be a victim,
 * and `invoices.spec.ts` is currently the only such spec. Dark-mode specs set
 * `data-theme` on the document instead of persisting a preference, so they are
 * not affected.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * File scope — one dedicated user per worker, shared by every test in the file:
 *
 *   import { test, expect } from '../../fixtures/isolatedUser.js';
 *   test.use({ isolatedUserPerWorker: { emailPrefix: 'dash' } });
 *
 * Describe scope — a fresh dedicated user for each test in that describe:
 *
 *   test.describe('...', () => {
 *     test.use({ isolatedUserPerTest: { emailPrefix: 'diary-dash' } });
 *   });
 *
 * Either way the built-in `page`/`context` fixtures are already authenticated as
 * the dedicated user, so `page.request.patch('/api/users/me/preferences', ...)`
 * inside a test writes that user's row and nothing else's. Tests that need the
 * user's identity can read the `isolatedUserSession` fixture.
 *
 * WHICH SCOPE TO PICK
 * - `isolatedUserPerWorker` is the default choice. A Playwright worker runs one
 *   test at a time, and no other worker shares the user, so the row still cannot
 *   be written concurrently by anything else in the suite — while costing one user
 *   per worker instead of one per test. State CAN carry over between the
 *   sequential tests of one worker, so a file using it must still reset any key it
 *   dirties (see dashboard.spec.ts's `beforeEach` / i18n.spec.ts's `afterEach`).
 * - `isolatedUserPerTest` gives a guaranteed-pristine row per test, at the cost of
 *   one user creation + login per test (~0.5-1s, which counts against the test
 *   timeout). Use it for a handful of tests inside an otherwise shared-admin file,
 *   because a worker-scoped option cannot be set from inside a `describe`
 *   (Playwright rejects it: "Cannot use({...}) in a describe group, because it
 *   forces a new worker").
 *
 * Users are created via `POST /api/users` (admin-only) and removed in fixture
 * teardown via `DELETE /api/users/:id`. Note that DELETE is a SOFT delete
 * (`deactivateUser` + `destroyUserSessions`): the preference row survives, but the
 * account can never be logged into again and its e-mail is never reused, so
 * nothing can read or write that row afterwards. Keep the created-user count
 * modest regardless — `/settings/users` renders 100 rows per page and
 * `edit-user.spec.ts`/`deactivate-user.spec.ts` find their user by scanning the
 * rendered page.
 */

import type { APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test';
import { test as authTest } from './auth.js';
import { API } from './testData.js';

/**
 * Must mirror `use.storageState` in playwright.config.ts. Used as the fallback for
 * tests in a file that imports this `test` object without opting into isolation.
 */
export const ADMIN_STORAGE_STATE = 'test-results/.auth/admin.json';

/** Password given to every dedicated user (>= 8 chars per createUserSchema). */
const ISOLATED_USER_PASSWORD = 'e2e-isolated-pw-123!';

/** Opt-in configuration for a dedicated user. */
export interface IsolatedUserSpec {
  /**
   * Short slug used in the generated e-mail address, for readability in failure
   * output. Keep the string "admin" out of it — `search-users.spec.ts` asserts
   * that every row matching a search for "Admin" has "admin" in its name column.
   */
  emailPrefix: string;
  /** Defaults to 'E2E Isolated User'. Must not contain "admin" (see above). */
  displayName?: string;
  /** Defaults to 'member'. Only set 'admin' for an actual admin-gated dependency. */
  role?: 'admin' | 'member';
  /**
   * `locale` preference to seed on the dedicated user. Defaults to 'en' so specs
   * asserting English strings do not depend on the CI browser's default locale.
   */
  locale?: 'en' | 'de' | 'system';
}

/** Identity of the dedicated user backing the current test's browser context. */
export interface IsolatedUserSession {
  id: string;
  email: string;
  password: string;
  storageState: StorageStateValue;
}

type StorageStateValue = Awaited<ReturnType<APIRequestContext['storageState']>>;

/**
 * Creates a dedicated user, logs it in, seeds its `locale` preference and returns
 * both its identity and a storage state carrying its session cookie.
 *
 * `baseURL` is passed in explicitly: Playwright only merges the project's context
 * options (including `baseURL`) into contexts created *inside a test*, and a
 * worker-scoped fixture runs before that instrumentation is installed.
 */
async function provisionIsolatedUser(
  playwright: PlaywrightWorkerArgs['playwright'],
  baseURL: string,
  spec: IsolatedUserSpec,
  uniqueSuffix: string,
): Promise<{ session: IsolatedUserSession; dispose: () => Promise<void> }> {
  const adminApi = await playwright.request.newContext({
    baseURL,
    storageState: ADMIN_STORAGE_STATE,
  });

  const email = `${spec.emailPrefix}-${uniqueSuffix}@e2e-test.local`;
  let userId: string | null = null;

  try {
    const createResponse = await adminApi.post(API.users, {
      data: {
        email,
        displayName: spec.displayName ?? 'E2E Isolated User',
        password: ISOLATED_USER_PASSWORD,
        role: spec.role ?? 'member',
      },
    });
    if (!createResponse.ok()) {
      throw new Error(
        `isolatedUser: POST ${API.users} for "${email}" failed with ${createResponse.status()}: ${await createResponse.text()}`,
      );
    }
    const created = (await createResponse.json()) as { user: { id: string } };
    userId = created.user.id;

    const userApi = await playwright.request.newContext({ baseURL });
    let storageState: StorageStateValue;
    try {
      const loginResponse = await userApi.post(API.login, {
        data: { email, password: ISOLATED_USER_PASSWORD },
      });
      if (!loginResponse.ok()) {
        throw new Error(
          `isolatedUser: login as "${email}" failed with ${loginResponse.status()}: ${await loginResponse.text()}`,
        );
      }
      const localeResponse = await userApi.patch('/api/users/me/preferences', {
        data: { key: 'locale', value: spec.locale ?? 'en' },
      });
      if (!localeResponse.ok()) {
        throw new Error(
          `isolatedUser: seeding locale for "${email}" failed with ${localeResponse.status()}`,
        );
      }
      storageState = await userApi.storageState();
    } finally {
      // The session lives on the server; disposing the client is safe.
      await userApi.dispose();
    }

    return {
      session: { id: userId, email, password: ISOLATED_USER_PASSWORD, storageState },
      dispose: async () => {
        // Soft-delete (deactivate) the user and drop its sessions, then release
        // the admin client. Failures are non-fatal: the account is never reused.
        await adminApi.delete(`${API.users}/${userId}`);
        await adminApi.dispose();
      },
    };
  } catch (error) {
    if (userId) await adminApi.delete(`${API.users}/${userId}`);
    await adminApi.dispose();
    throw error;
  }
}

/**
 * Base URL of the app under test. Mirrors playwright.config.ts's
 * `use.baseURL`; `containers/setup.ts` sets APP_BASE_URL to the proxy URL in
 * globalSetup, which worker processes inherit. Needed because a worker-scoped
 * fixture cannot depend on the test-scoped `baseURL` fixture.
 */
function resolveBaseURL(): string {
  return process.env.APP_BASE_URL || 'http://localhost:3000';
}

export const test = authTest.extend<
  {
    isolatedUserPerTest: IsolatedUserSpec | null;
    isolatedUserSession: IsolatedUserSession | null;
    isolatedUserGuard: void;
  },
  {
    isolatedUserPerWorker: IsolatedUserSpec | null;
    workerIsolatedUserSession: IsolatedUserSession | null;
  }
>({
  // ── Options ───────────────────────────────────────────────────────────────
  isolatedUserPerWorker: [null, { scope: 'worker', option: true }],
  isolatedUserPerTest: [null, { option: true }],

  // ── One dedicated user per worker (file-scope opt-in) ──────────────────────
  workerIsolatedUserSession: [
    async ({ playwright, isolatedUserPerWorker }, use, workerInfo) => {
      if (!isolatedUserPerWorker) {
        await use(null);
        return;
      }
      const { session, dispose } = await provisionIsolatedUser(
        playwright,
        resolveBaseURL(),
        isolatedUserPerWorker,
        `${workerInfo.project.name}-w${workerInfo.workerIndex}-${Date.now()}`,
      );
      try {
        await use(session);
      } finally {
        await dispose();
      }
    },
    { scope: 'worker' },
  ],

  // ── The session backing this test's browser context ───────────────────────
  isolatedUserSession: async (
    { playwright, baseURL, isolatedUserPerTest, workerIsolatedUserSession },
    use,
    testInfo,
  ) => {
    if (isolatedUserPerTest && workerIsolatedUserSession) {
      throw new Error(
        'isolatedUser: set either isolatedUserPerWorker (file scope) or isolatedUserPerTest (file/describe scope), not both.',
      );
    }
    if (!isolatedUserPerTest) {
      await use(workerIsolatedUserSession);
      return;
    }
    const { session, dispose } = await provisionIsolatedUser(
      playwright,
      baseURL ?? resolveBaseURL(),
      isolatedUserPerTest,
      `${testInfo.project.name}-w${testInfo.workerIndex}-${Date.now()}`,
    );
    try {
      await use(session);
    } finally {
      await dispose();
    }
  },

  // ── Point the built-in context/page fixtures at that session ──────────────
  storageState: async ({ isolatedUserSession }, use, testInfo) => {
    await use(
      isolatedUserSession?.storageState ?? testInfo.project.use.storageState ?? ADMIN_STORAGE_STATE,
    );
  },

  // ── Fail loudly if the override above ever stops taking effect ────────────
  //
  // The whole point of this module is that `page` belongs to the dedicated user.
  // If that silently regressed (a Playwright change to how the `storageState`
  // option feeds `_combinedContextOptions`, or a spec passing an explicit
  // storageState to `browser.newContext()`), the specs would quietly go back to
  // mutating the shared admin and the collisions this fixture prevents would
  // return unnoticed — every test would still pass. One cheap request per test
  // turns that into an immediate, explicit failure.
  isolatedUserGuard: [
    async ({ page, isolatedUserSession }, use) => {
      if (isolatedUserSession) {
        const response = await page.request.get(API.authMe);
        const body = (await response.json()) as { user: { email: string } | null };
        if (body.user?.email !== isolatedUserSession.email) {
          throw new Error(
            `isolatedUser: expected the test's browser context to be authenticated as "${isolatedUserSession.email}", but /api/auth/me reports "${body.user?.email ?? 'nobody'}". The storageState override is not taking effect — preference writes would hit the shared admin user.`,
          );
        }
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
