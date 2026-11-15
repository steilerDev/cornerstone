---
name: story-2252-documents-page-tests
description: Story #2252 Documents page test traps - last planned route gone, waitFor-with-render OOM, hasMore needs >100 rows, SidePanel/Sheet test quirks, shell refuses multi-command heredocs
metadata:
  type: project
---

- **No planned route id is left** after #2252: `entry.stage === 'planned'` comparisons no longer typecheck (TS2367) - drop them or cast to `{ stage: string }`. Planned-id behaviour is tested against a mocked route map in `shared/src/routes/routeUrl.planned.test.ts` / `match.planned.test.ts` (`jest.unstable_mockModule('./routeMap.js')`). A "gated route that is not served" case cannot exist with the real map (ESM exports cannot be spied).
- **Never render inside a `waitFor` callback** (it mutates the DOM, MutationObserver re-fires it, Jest worker OOMs). Wait for state first, then render once (`settle()` = act + `setTimeout(0)`).
- `useObjectList` `hasMore = page*100 < totalItems`: a second batch (dedupe test) needs `totalItems > 100` in the mock.
- ObjectList `FormError variant="field"` has no `role="alert"`; assert the translated text instead. Server `PAPERLESS_UNREACHABLE` reads "The document management system could not be reached."
- SidePanel: below 1440px it is a `Sheet` (close button name "Close dialog"), docked from 1440px (`<aside>`, testid `${testId}-close`); focus return needs `getClientRects` stubbed (`findRowTitle`). `installMatchMedia({'(min-width: 1440px)': true})`.
- Paperless-off redirect rule `carries ['*']`: `/documents?q=roof` lands on `/?q=roof` (query kept by design).
- Any test importing EntityPicker (via DocumentLinkedToList) needs `paperlessApi` and `documentLinksApi` module mocks to export every name EntityPicker imports (`listPaperlessDocuments`, `listAllLinkedDocumentIds`).
- Shell: a single Bash call with several heredocs or `$(...)`-ish constructs is refused in a worktree session; write python/shell helpers with the Write tool and run `python3 /path/script.py`; brace globs in `--collectCoverageFrom` are refused too (one flag per file in a script).
- Server `document_links` ordering tie: links created in one millisecond tie on `created_at` (then uuid id): pin `createdAt` in the test before asserting order.
