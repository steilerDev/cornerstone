---
name: story-2214-account-relayout
description: #2214 Settings > Account E2E: POM sections/testids, token mocking, Playwright aria-disabled traps, phone gutter defect, DAV `lock`.
metadata:
  type: project
---

- Section testids: `account-profile|sync|preferences|password`; Profile h2 text is "Your details" (owner decision, the spec text said "Profile"). `ProfilePage.mockTokenEndpoints(token, initiallyActive)` mocks GET/POST/DELETE of `/api/users/me/dav/token` (real POST is 10/hour).
- Playwright `toBeDisabled()`/click treat `aria-disabled="true"` as disabled: assert `not.toHaveAttribute('disabled')` for "never natively disabled"; use `click({ force: true })` for a no-op Save.
- Real-token DAV tests race across workers/projects on the shared admin (one worker's `DELETE` removes another's token): the describe holds `{ lock: 'admin-dav-token' }`.
- Preference-write mocking: `**/api/users/me/preferences**` (GET -> `{preferences: []}`, PATCH echoes `{preference}`), so the shared admin's theme/locale is untouched.
- Open defect at handback: column is 279px wide at 375 (AppShell `.pageContent` 32px + PageLayout 16px per side, not 16px total), UX spec says 343. Test `the sections column is 343px wide at 375px` is expected-red until the phone gutter is fixed.
- Desktop project viewport is 1920, tablet 810 (iPad gen 7), mobile 390: explicit widths need `page.setViewportSize`.
