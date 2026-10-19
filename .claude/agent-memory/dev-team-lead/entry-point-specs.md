---
name: entry-point-specs
description: Hazards found speccing EPIC-21 #2222 (New sheet Log now tiles, ?start= consumed once, Log today) — "client only" stories that touch routeMap.ts, E2E POM testid prefixes, list-count tests, consume/apply effect ordering, same-URL re-entry remount, getUserMedia vs input.click gesture rules
metadata:
  type: feedback
---

Found while speccing #2222 (P2.3).

1. **A `carries` change means `shared/src/routes/routeMap.ts` changes.** That file is backend-developer territory and needs its trailer. A "client only" story that adds a query param is not client-only. Put routeMap.ts and `routemap.json` together in a tiny backend step that runs first.
2. **New links inside an existing surface can match old POM prefix selectors.** `CreateMenu.rows()` uses `a[data-testid^="create-sheet-"]`, and unit tests count `getAllByRole('list')`. Give the new links a different testid prefix and wrap the group in a non-list element.
3. **A one-shot "apply on arrival, then strip the param with replace" effect breaks easily.** The replace changes `location`, so an effect with `location` in its deps re-runs, and its cleanup cancels a pending rAF focus. Split it in two:
   - consume (ref-guarded, no cleanup);
   - apply (set the done-ref inside the frame, so StrictMode or a dependency change reschedules it).
     Capture the arrival search and state with `useState` at mount.
4. **Same-route re-entry does not remount.** `/diary/new` → `/diary/new?start=x` keeps the page's key. Bump the key on a non-null new param, but never on the consume (to null).
5. **Gesture rules.** `getUserMedia` plus a muted `playsInline` video needs no user activation (Safari iOS 14.3+). A programmatic `input[capture].click()` does, and the activation is gone after a lazy-chunk navigation. Auto-open the live viewfinder; fall back to focusing the button.
6. **Async device detection.** "Camera available" on a fine pointer waits for `enumerateDevices`. Expose a known/pending flag before auto-acting on it.
7. **An opener read on open must be computed during render** (the adjust-state pattern), not in an effect. Sheet's open effect focuses the first focusable, so the order must already be in the DOM.

**How to apply:** any story that adds entry links to the New menu or sheet, a query param that triggers an action on arrival, or auto-opening a camera or dialog.

Related: [[capture-screen-specs]], [[url-state-specs]], [[restructure-baseline-hazards]], [[nav-shell-specs]]
