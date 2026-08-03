---
name: datatable-column-preference-race
description: Issue #1955 DataTable two-column toggle race — the debounce intuition is backwards (fast clicking is SAFE), and #1920's E2E fix does not fix production
metadata:
  type: project
---

# #1955 — DataTable column-preference race (Should Have, S, Backlog)

**Fact:** Toggling two columns in the `DataTable` column-settings popover can silently hide the
second one. Filed as #1955 (2026-08-02). Affects all six `DataTable` pages — Work Items, Invoices,
Household Items, Milestones, Vendors, User Management. Not invoices-specific.

Mechanism, confirmed against source (`client/src/hooks/useColumnPreferences.ts`,
`client/src/hooks/usePreferences.ts`):

1. `savePreferences()` debounces the preferences `PATCH` by 500ms, `clearTimeout`-ing any pending timer.
2. `usePreferences.upsert()` on resolve does an optimistic `setPreferences()` that always yields a
   **new array reference**.
3. That reference re-triggers `useColumnPreferences`'s load `useEffect` (deps `[preferences, preferenceKey]`),
   which re-applies **that PATCH's own payload** over `visibleColumns`.
4. So a first toggle's already-fired PATCH — carrying only the first column — can resolve after the
   second toggle's local state change and overwrite the second column away.

**Why:** Silent wrong state in a shared component reachable at ordinary interaction speed, with a
plausible durable-loss path (the two PATCHes have no ordering/version guard client- or server-side,
so under jitter the stale single-column write can land last and persist). Usually self-corrects when
the second toggle's own save resolves ~500ms later — that self-healing is what keeps it below Must
Have, but "silent + shared + six pages" is what keeps it above Could Have.

**How to apply:** Two things not to re-litigate.

## 1. The debounce intuition is backwards — I got this wrong

**Clicking fast is the SAFE case.** Two toggles inside 500ms coalesce: the second `clearTimeout`
cancels the first's pending save, and functional `setState` means the one surviving payload carries
the full accumulated set. The race needs a gap **longer** than 500ms — read label, tick, move down
the list, read next label, tick. That is ordinary reading pace.

I initially judged this programmatic-only and argued fast clicking was the trigger; the
`e2e-test-engineer` demonstrated from source that the opposite is true. When triaging a debounce +
optimistic-refetch race, check which side the `clearTimeout` protects before assessing user
reachability — coalescing usually makes rapid input the safe path and *deliberate, unhurried* input
the dangerous one. Do not downgrade such a bug to "only a test artifact" on speed intuition alone.

## 2. A green shard is not a fixed product

#1920 is the E2E manifestation of #1955 (`invoices.spec.ts:841`, shard 5/16, failing every run since
PR #1880 — it merged red for weeks because `E2E Gates` is only required on `main`-targeted PRs). It
is fixed on the test side in `e2e/pages/InvoicesPage.ts` by awaiting the PATCH response in
`enableColumn()` (the convention `DashboardPage.dismissCard()` already uses). That makes CI
deterministic but leaves the production race completely untouched — it only stops the test from
driving the app through the racy window.

Cross-comment posted on #1920 stating this explicitly, so nobody closes #1955 as already-done.
Generalise: when an E2E fix is a *test-harness* change (awaiting a response, adding a retry) rather
than a production change, the underlying defect needs its own tracked issue and the flake issue must
say so in writing.

Related: [standalone-bugs-and-stories.md](standalone-bugs-and-stories.md),
[pr-review-patterns.md](pr-review-patterns.md).
