---
name: url-state-specs
description: Hazards when moving page state into the URL or making a controlled list search robust (history.state survives reload, waitForURL globs break on new query params, RR7 transition-driven controlled inputs drop keystrokes, scanner flags invented phone numbers)
metadata:
  type: feedback
---

Moving state from history `state` into a query param, or speccing URL-driven inputs, has four traps. All four came up while speccing #2197 (EPIC-21 P0.6).

1. **`history.state` survives a plain reload.** A "reload loses the page" defect usually comes from a _new navigation_ to the URL: a bookmark, a new tab, or a login redirect.
   - **Why:** an E2E that only calls `page.reload()` passes even on the broken code.
   - **How to apply:** the E2E also does `page.goto(page.url())`.
2. **Playwright `waitForURL('**/path')` globs match the whole URL.** Appending `?param=` breaks every existing wait on that route.
   - **How to apply:** before speccing a new query param, grep `e2e/` for `waitForURL('**/<path>')`. List each occurrence for e2e-test-engineer with a regex replacement (#2197: 13 hits in 7 files).
3. **React Router 7 `BrowserRouter` applies location updates inside `startTransition`.** An input controlled by a URL-derived value gets reset to the old value on the urgent re-render, so fast typing drops keystrokes.
   - **How to apply:** keep a local draft plus a debounced commit, and sync from props only when no commit is pending.
   - Also check for any `isLoading && items.length === 0` early return that unmounts the toolbar. That is how DataTable lost focus at 0 results.
4. **`scan-privacy.mjs --profile full` flags any `+CC …` or `0…`-prefixed number, even an invented one.**
   - **How to apply:** use `555-01NN`-style synthetic phones in specs, fixtures and tests, then scan the spec itself before handing it over.

Related: [[restructure-baseline-hazards]], [[shared-component-extension-specs]]
