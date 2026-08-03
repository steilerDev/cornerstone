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
 *    `/diary/new` and the Add/Customize dropdowns have no role checks. The complete
 *    role-gating inventory in the app: server — `requireRole('admin')` on
 *    `/api/users` mutations and `/api/backups/*`, plus work-item note
 *    update/delete, which pass `request.user.role === 'admin'` into `noteService`
 *    as an ownership override (`server/src/routes/notes.ts`); client — the Settings
 *    sub-nav "User Management" and "Backups" tabs, and work-item note edit/delete
 *    on other users' notes. Nothing else in `client/src` or `server/src` branches
 *    on role.
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
 * !! EXPECT AN UNRELATED SHARD TO GO RED WHEN YOU OPT A FILE IN !!
 * Adding `test.use()` for either option changes the affected tests' `_workerHash`.
 * `createTestGroups` (node_modules/playwright/lib/runner/index.js) buckets tests by
 * worker hash FIRST and emits groups in bucket insertion order; `filterForShard`
 * then slices that list by cumulative test count. So opting one file in
 * redistributes shard MEMBERSHIP across the whole suite — not just this file's —
 * even when the total test count is unchanged. Any latent cross-file shared-state
 * assumption in a newly co-located pair surfaces as a failure that looks unrelated
 * to your change. #1957 hit exactly this: `no-area-filter.spec.ts` moved from shard
 * 15 to shard 14 next to `area-filter.spec.ts` and its suite-global "no area-less
 * household item exists" precondition broke. Diagnose before blaming the change
 * itself, by diffing shard membership between base and head:
 *   git archive <base-sha> e2e | tar -x -C /tmp/base && ln -s <repo>/node_modules /tmp/base/node_modules
 *   (cd /tmp/base && npx playwright test --list --shard=N/16)   # vs the same in the worktree
 * Do NOT respond by pinning or reordering shards (#1957's Notes rule that out) —
 * fix the test that assumes suite-global state.
 *
 * Users are created via `POST /api/users` (admin-only) and removed in fixture
 * teardown via `DELETE /api/users/:id`. Note that DELETE is a SOFT delete
 * (`deactivateUser` + `destroyUserSessions`): the preference row survives, but the
 * account can never be logged into again and its e-mail is never reused, so
 * nothing can read or write that row afterwards. Accumulation is bounded per
 * SHARD, not per run — each shard is its own CI job with its own container and DB
 * (`containers/setup.ts` runs in globalSetup) — so `/settings/users`' 100-row page
 * is never in reach. The reason to prefer per-worker is the login rate limit
 * (`POST /api/auth/login`: 20 requests / 15 min, keyed on `request.ip`, one bucket
 * per shard), not user-table size.
 */

import type { APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test';
import { test as authTest } from './auth.js';
import { API } from './testData.js';

/**
 * Shared-admin storage state written by `auth.setup.ts`; mirrors `use.storageState`
 * in playwright.config.ts. Used here to authenticate the admin API context that
 * provisions and deactivates dedicated users. (Non-opted-in tests get their state
 * from `testInfo.project.use.storageState`, not from this constant.)
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
  //
  // The `testInfo.project.use.storageState` fallback is load-bearing, not
  // defensive: playwright.config.ts sets `storageState` per project, and once the
  // option is overridden here the config value is no longer consulted — without it,
  // non-opted-in tests in an importing file would lose admin auth entirely.
  // Deliberately resolves to `undefined` rather than forcing ADMIN_STORAGE_STATE if
  // a project ever sets no storageState, so a future unauthenticated project keeps
  // its intended state.
  storageState: async ({ isolatedUserSession }, use, testInfo) => {
    await use(isolatedUserSession?.storageState ?? testInfo.project.use.storageState);
  },

  // ── Fail loudly if the override above ever stops taking effect ────────────
  //
  // The whole point of this module is that `page` belongs to the dedicated user.
  // If that silently regressed (e.g. a Playwright change to how the `storageState`
  // option feeds `_combinedContextOptions`), the specs would quietly go back to
  // mutating the shared admin and the collisions this fixture prevents would
  // return unnoticed — every test would still pass. One cheap request per test
  // turns that into an immediate, explicit failure.
  //
  // Two limits, both deliberate:
  //   (a) It validates the `page` fixture only. A context a test builds itself via
  //       `browser.newContext()` is outside its reach — such a context inherits
  //       this override unless it passes an explicit `storageState` (as
  //       invoices.spec.ts's Dark mode describe does, which is why that
  //       non-converted describe is unaffected).
  //   (b) It is `auto` and depends on `page`, so every test in an importing file
  //       gets a browser context — including one a `beforeEach` immediately
  //       `test.skip()`s, since fixtures resolve before hooks run.
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
