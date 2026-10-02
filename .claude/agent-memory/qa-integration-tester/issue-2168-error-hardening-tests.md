---
name: issue-2168-error-hardening-tests
description: PR #2168 error-message hardening — test-side gotchas (ApiClientError.message = code, LocalizedError, duplicate-banner counts, jsdom has no Response, fs error realm)
metadata:
  type: project
---

- `ApiClientError#message` is now the machine code; assert `.error.message`/`.error.code`. Plain `Error`/`TypeError` rejections render the fallback key, only `LocalizedError` passes its message through.
- jsdom env has no `Response` — build fetch stubs as `{ ok, status, json }` objects. A suite that mocks `./apiClient.js` must also export `toApiClientError` or the whole file fails at link time; test real upload paths in a separate file without the mock (`paperlessApi.upload.test.ts`).
- Unmocked `LinkedDocumentsSection` fetches on mount and its NetworkError banner reuses `requestErrors.network` text, skewing exact-count assertions (and racing `findAllByText`). Mock `lib/documentLinksApi.js`.
- Jest VM realm: fs errors fail `instanceof Error`; assert `cause` shape with `toMatchObject({ message: expect.any(String) })`.
- Budget-originated errors (WorkItem: `budgetError`) render in the BudgetSection banner (inside a `<section>`); page errors in the top banner (outside any section). Stub BudgetSection must render its `inlineError` prop to assert placement.
- Source-of-truth for what to run: sweep every client test file referencing ApiClientError (75 files) after changing the class — ~22 broke on deleted/changed copy.
