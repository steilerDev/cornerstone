---
name: auth-gate-specs
description: Specs touching the client sign-in gate — what counts as "signed out", catch-all hazards, refresh semantics, focus on the retry panel
metadata:
  type: project
---

`GET /api/auth/me` is public and never 401s: a signed-out visitor gets `200 { user: null }`. The only sign-out signals are that, or a real 401 (only possible from a proxy in front of the app). Before the 2026-10-16 fix, `AuthGuard` had a catch-all that sent every failure to `/login?next=`. `apiClient` wraps aborts, offline errors and 5xx-parse failures into `NetworkError`, so an aborted request during a fast navigation looked like a sign-out.

**Why:** the #2215 live E2E run bounced to the sign-in page after two quick `page.goto` calls. A real user would see the same after a fast reload or back/forward.

**How to apply:**

- In any spec that adds a `catch` mapping to a terminal UI state (signed out, not found, no access), classify the error explicitly. A catch-all is a review blocker.
- A refresh that fails while a user is known keeps the user. Refresh never flips to `loading`, because that would unmount a focused Retry button and drop focus to `<body>`.
- Keep the gate fail-closed: never render the `Outlet` on error. Security review triggers for gate changes.
- For an E2E regression of the abort path, use `page.route('**/api/auth/me', r => r.abort('aborted'), { times: 1 })`. It is deterministic; a double `goto` alone is racy. Related: [[command-search-specs]].
