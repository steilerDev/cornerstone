---
name: command-search-specs
description: Hazards when speccing a global search/palette or app-wide shortcut (EPIC-21 #2211) — apiClient wraps AbortError and has no 401 handling, React stopPropagation hides keys from document listeners, focus trap counts tabindex=-1 anchors, opener-first focus restore, baseline component counting by basename
metadata:
  type: feedback
---

Found while speccing #2211 (P1.5, CommandSearch). Each one is a UX or code premise that looked true and was not.

1. **`apiClient.request` wraps every fetch rejection, `AbortError` included, in `NetworkError`.** Detect a cancelled request with `controller.signal.aborted`, never with `err.name === 'AbortError'`.
2. **`apiClient` has no 401 handling.** The UX premise "the session expiry is handled by apiClient" was false. Spec `refreshAuth()` on `statusCode === 401`; `AuthGuard` then redirects.
3. **React `stopPropagation()` in an input's `onKeyDown` stops the native event at the React root.** A document listener in the bubble phase never sees the key (`DiaryFilterBar`). A global shortcut that must work inside text fields (⌘K) needs `window.addEventListener('keydown', h, { capture: true })`.
4. **`getFocusableElements` (`useFocusTrap`) matches `[href]` even with `tabindex="-1"`.** Listbox anchors then become the trap's "last" element, and Tab escapes the dialog. Exclude `tabindex="-1"` before speccing non-tabbable anchors inside a Modal or Sheet.
5. **`useFocusRestore` tries the opener first.** "Return focus to the list field" when the opener is a sibling row button needs `skipOpenerRef` set from the start, plus a `returnFocusRef`.
6. **`build-baseline.mjs` counts a shared component only when the basename equals its directory (or for a domain folder).** Extra files inside an existing component directory are free. Don't force them into one file "so the baseline sees one addition".
7. **Verify "pages X, Y use DataTable" lists.** Budget sources and Subsidy programs don't. `DocumentBrowser`'s search field lives only inside modals. Grep `<DataTable` and the `searchFields` contributors before you spec a per-list prop.
8. **Stories that land in between make UX open questions stale.** The New menu (`n` fallback) shipped one story earlier. Re-check every "depends on story N" premise against HEAD.

**How to apply:** any story that adds a global dialog, a shell shortcut, a listbox inside a Modal or Sheet, or a request lifecycle with abort.

Related: [[dialog-route-specs]], [[search-service-specs]], [[nav-shell-specs]], [[grammar-component-specs]]
