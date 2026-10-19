---
name: users-unlock-specs
description: Hazards found speccing EPIC-21 #2219 (Users unlock, role guards, Phase 1 exit) — GET /api/users is member-visible, union-key namespace limits, portaled OverflowMenu breaks row-scoped POMs, dead sortKey, closure baseline is not a per-page primary count
metadata:
  type: feedback
---

Found while speccing #2219 (P1.12). Each item was a premise in the UX or orchestrator text that the code contradicted.

1. **"Admin list response" did not exist.** `GET /api/users` has no role check, because member pickers use it (#2122 decision). An admin-only field must be emitted per caller role, with the key omitted for members (not `null`). That is a contract change, so it goes to the architect.
2. **`UnionKeyNamespace` is a closed list** (`budget|documents|householdItems|diary|auth|common`). Putting a set in `settings` also forces `LOCALE_JSON` in `unionKeys.test.ts` to change. Non-record system states go in `common` (precedent: `integrationStatus`, `backupRun`).
3. **`OverflowMenu usePortal` moves the items to `<body>`.** E2E POMs that look items up row-scoped (`row.getByTestId(/^x-edit-/)`) break. Spec page-wide `getByRole('menuitem')` lookups.
4. **`sortKey` with no matching client sort branch is a silent no-op.** Check this when touching any client-sorted DataTable column.
5. **A PATCH response that lacks a list-only field wipes that field** when the row is replaced instead of merged (`{...u, ...updated}`).
6. **`baseline.json` `primaryButtons` is closure-wide.** It includes every dialog's Save button: 24 of 36 screens are above 1. "One primary per page" needs a live E2E count (visible `[class*="btnPrimary"]` in `main`, outside dialogs). The ratchet values do not measure it.
7. **`summary.json` `dailyWeeklyInSettings` is reported, not gated.** A regenerated 1 still passes `plan:check`.

**How to apply:** for any admin-only field, any new union-key set, any row-menu migration, and any exit-criteria check.

Related: [[integrations-page-specs]], [[status-vocabulary-switch-specs]], [[restructure-baseline-hazards]]
