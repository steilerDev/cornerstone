---
name: story-2206-top-bar
description: #2206 desktop top bar/user menu E2E facts - shell breakpoint 1023/1024, viewport-aware AppShellPage.logout(), one-Log-out-per-viewport, shared isolated user trick
metadata:
  type: project
---

- Shell breakpoint is `< 1024` drawer / `>= 1024` top bar; `AppShellPage.needsDrawer()` matches. `logout()` is real UI: user menu (`user-menu-logout`) on desktop, sidebar drawer button `/^(Log out|Abmelden)$/` below. #2207 replaces the sub-1024 path.
- Sidebar footer (`sidebar-footer-legacy`) is `display: none` from 1024px, so role queries find nothing there on desktop.
- `no-tab-rows` must scope breadcrumb navs to `main` (trail lives in the bar at desktop).
- `OverflowMenu` trigger is `aria-haspopup="menu"`.
- `user-menu.spec.ts` reuses `isolatedUserPerWorker: { emailPrefix: 'i18n-switch', displayName: 'E2E i18n User' }` (identical value as i18n.spec) so it shares the worker's user: no extra user/login/worker hash group. Theme/locale PATCH is fire-and-forget in the app, gate on `waitForResponse` before a fresh page.
- The spec said "open from Tasks list so Back exists", which is wrong (list origin has no Back); top-bar.spec opens from the Gantt row instead.
- Written without a live run (no browser in sandbox): the focus ring assertion assumes box-shadow on breadcrumb and bar controls.
