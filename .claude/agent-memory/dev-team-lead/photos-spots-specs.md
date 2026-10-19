---
name: photos-spots-specs
description: Hazards found speccing EPIC-21 #2226 (Photos No area group, bulk tags with Undo, spot viewer D-31, details panel, phone immersive shell) — measure closures before speccing, Link in a shared panel leaks destinations, restore-kind Undo needs no undoService change, unmount shell bars, URL whose meaning changes
metadata:
  type: feedback
---

Found while speccing #2226 (P2.7).

1. **Measure the baseline closures before writing the spec.** Import `analyzeFile`/`resolveImport` from `plan/restructure/scripts/build-baseline.mjs`, walk each page's imports, and print per-file destinations and primaries (a small node script outside the repo). It showed the load-error "Try again" buttons are the pages' only primaries, so any new primary (Set tags, Save tags, a dialog Save) is a rise. Fixes used: make the retry secondary, and route dialogs that carry primaries (PhotoAnnotator, the bulk dialog) through an App-root provider (TagCreateProvider pattern).
2. **A shared component reused by another screen carries its `Link`s there.** The details panel replaces a sidepanel inside the entry page's viewer (destinations 0). A react-router `Link` for "Open diary entry" would raise that screen. Use `NavAnchor` for every new link in shared pieces.
3. **Counted shared components** include files directly in a lowercase domain dir (`components/photos/X.tsx`). Helpers in PascalCase dirs (`photos/PhotoStrip/X.tsx`, `SpotThumbnail/SpotSelectGrid.tsx`) are not. Approve new counted basenames in the spec (`allowedAdditions`).
4. **The restore-kind Undo token takes any `restore(tx)` callback**, so a new undoable mutation (bulk tags) needs no `undoService` change and no new subject type. A planned contract that echoes `previous` values back to the client contradicts contract 11 ("the client never sends values back"). Rewrite it.
5. **Hiding the phone shell bars means unmounting them.** CSS hiding leaves `html[data-shell-bar='shown']` and `--shell-bottom-height`, so padding and toasts stay offset. `--topbar-height` lives on `.appShell` and needs an override too.
6. **Redefining a URL's meaning** (`/photos/spot/none/none`: spot → whole group) breaks the count match of the matrix cells that link to it. Pick one uniform linking rule for the whole row and state it as a decision.
7. **Retiring a panel removes visible fields too** (upload date, caption editing). Map each field to a capability or a decision before deleting it.

Review round 1 found four more:

8. **An inline editor that replaces its own opener button** drops focus to `<body>`. Spec the editor's initial focus and require a test for it.
9. **App-root dialog providers outlive navigation.** Browser Back leaves the dialog over another page. Close it and resolve `null` when the real location key changes.
10. **Coverage-driven `?.` → `!` rewrites** are only safe in synchronous paths. After an `await` or inside a rAF, the page may have unmounted, so keep `?.` there.
11. **A shared-primitive behaviour change** (useFocusTrap now calls `preventDefault` on Escape) is a cross-team convention. It needs the wiki Architecture bullet and the CLAUDE.md line in the same PR.

**How to apply:** any story that adds buttons or links to existing baseline screens, a new Undo, a full-screen phone page, or changes what an existing URL lists.

Related: [[capture-screen-specs]], [[restructure-baseline-hazards]], [[areas-index-specs]], [[diary-list-specs]]
