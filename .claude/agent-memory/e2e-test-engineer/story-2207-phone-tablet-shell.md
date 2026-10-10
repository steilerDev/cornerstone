---
name: story-2207-phone-tablet-shell
description: #2207 phone/tablet shell E2E facts - AppShellPage shim design, title-menu check-mark text trap, compact breadcrumb single link, sign-out mocking, scenario list
metadata:
  type: project
---

- Below 1024px: bottom bar (`bottom-bar-<home|diary|new|photos|more>`), More sheet (`more-sheet*`, always mounted, `inert`, `role=dialog` only while open, `data-open`), title menu (`view-menu-trigger` inside the h1, `view-menu`, items `view-menu-item-<route>`, main row `view-menu-main-<route>`). `AppShellPage` getters are per-call viewport-aware (`isCompact()`); shims marked `@deprecated` are removed in #2208.
- Trap: the current title-menu item renders an aria-hidden check mark inside its text, so `toHaveText('Grants')` fails on the current row. Use `toContainText` for view-menu assertions (done in budget/invoices/timeline specs).
- Trap: compact breadcrumb is ONE link inside the "You are here" nav; with an origin it is the Back link (named after the origin, not a parent). `BreadcrumbsBar.expectTrail` only asserts the last parent when there is no `breadcrumbs-back`.
- Focus trap order: the sheet's Close button precedes the body rows, so Shift+Tab from the first row lands on Close; the next one wraps to Log out.
- Sign-out is mocked (POST logout 204 + stub /login document) in `phone-tablet-shell.spec.ts` so the shared per-worker session survives (login rate limit); real sign-out stays in auth/login-logout.spec.ts via the shim.
- The spec reuses `isolatedUserPerWorker: { emailPrefix: 'i18n-switch', ... }` (same value as i18n/user-menu specs) = no extra user/login/worker group. Only `@responsive` tests run on tablet/mobile projects, so desktop-only specs need no skip.
- Written without a live browser run; validated with tsc, eslint, prettier, `--list`, plan:check only.
