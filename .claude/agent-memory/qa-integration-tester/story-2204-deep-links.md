---
name: story-2204-deep-links
description: Story #2204 tests - jsdom cannot capture window.location.href; hash-only mock trick, authApi mock needs every export, title hook needs a Router, recordingRouter for ManagePage
metadata:
  type: project
---

- **window.location cannot be redefined in this jsdom** (`Cannot redefine property: location`). To assert what a page assigns to `window.location.href`, mock the URL builder (`oidcLoginUrl`) to return a hash-only URL (`#sso-start:<arg>`); jsdom applies hash changes, so assert `window.location.hash`. The real URL format is covered in `authApi.test.ts`.
- **Adding `useDocumentTitle` to a page breaks its old tests twice**: (1) it calls `useLocation`, so tests that `render(<Page />)` bare need a MemoryRouter; (2) it reaches `HouseNameContext` -> `AuthContext` -> `authApi`, so a partial `authApi` mock must also export `logout`/`getAuthMe` (ESM link error "does not provide an export named").
- **Refresh-before-navigate order test**: make the 3rd `getAuthMe` call (provider mount, page check, then `refreshAuth`) a deferred promise; assert `log.actions` is empty while pending, then resolve and expect `REPLACE <next>`.
- ManagePage tab sync tests now use `client/src/test/recordingRouter.tsx` + `OriginProbe`; `log.entries.length` proves replace-not-push.
- A "Back" link is NOT suppressed when the origin is an ancestor above the nearest parent (diary list origin on entry edit shows "Back to Site diary" next to the same trail item); `null` object name removes the entry ancestor and then it is suppressed.
- Shell guard refuses heredoc-append (`cat >> f <<EOF`) in compound commands; use Edit/python-in-one-command instead, and keep temp files in the job tmp dir.
