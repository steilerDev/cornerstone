---
name: e2e-shared-admin-preference-hazard
description: Recurring class of E2E test-isolation bug — specs writing user_preferences on the one shared admin user race across files under fullyParallel; scoping notes for #1957
metadata:
  type: project
---

Filed **#1957** (2026-08-02/03, Should Have, bug, board Backlog) for a latent cross-file
test-isolation hazard found while `/fix-e2e` was clearing E2E failures blocking the `beta`→`main`
promotion (worktree `fix-e2e`, PR #1956).

**Mechanism**: `playwright.config.ts` has `fullyParallel: true`; nearly all specs authenticate as
one shared admin user. Several specs PATCH/DELETE `/api/users/me/preferences` on that same row.
`LocaleContext.syncWithServer` (`client/src/contexts/LocaleContext.tsx:111-141`) treats the
**server** locale as authoritative and **deletes** the victim's `localStorage` `locale` key when it
applies it — so a colliding write doesn't just leak stale data, it actively flips the victim test's
UI language mid-run.

**Why scoped as a sweep, not a single-file fix**: while researching #1957 I grepped
`users/me/preferences` across `e2e/tests/` and found a **second live instance** of the same
collision class independent of the `locale` key that motivated the issue —
`e2e/tests/diary/diary-uat-fixes.spec.ts` PATCHes `dashboard.hiddenCards='[]'` directly on the
shared admin, the same key `dashboard.spec.ts`'s own top-level `beforeEach` resets on the same
shared admin for its ~26 non-isolated tests. `dashboard.spec.ts`'s Scenario 6/7 isolated-user fix
(PR #1956) only protects those two scenarios from the rest of *its own file* — it does nothing
against `diary-uat-fixes.spec.ts`. That's why #1957's ACs are written as an audit + per-spec
resolution (dedicated user where the test doesn't need admin, explicit documented exception where
it does — `createLocalUserViaApi` defaults to `role: 'member'`) rather than "convert
`i18n.spec.ts`" alone. Precedent for the isolated-user pattern: `loginAsIsolatedDashboardUser()` in
`dashboard.spec.ts`, the isolated-user helper in `i18n-categories.spec.ts`,
`change-password.spec.ts`. `user_preferences.user_id` is `ON DELETE CASCADE` so cleanup is just
`deleteUserViaApi()` in a `finally`.

**Not the same bug as #1955**: #1955 is a *production* debounce/re-sync race in
`useColumnPreferences`/`usePreferences` (client-side). #1957 is purely an E2E test-isolation gap
(shared admin + parallel writes). #1920 is the E2E-side workaround for #1955's symptom in
`invoices.spec.ts` (awaits the PATCH) — it does not fix #1955 and does not overlap with #1957.

If a future sweep converts more specs to dedicated users, check admin-gating per test before
converting — not every assertion in these files is exercisable by a `member`-role user.
