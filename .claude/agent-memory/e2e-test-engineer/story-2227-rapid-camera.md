---
name: story-2227-rapid-camera
description: #2227 rapid camera E2E: tap budgets 12/15/20/13, POM camera API, Chromium fake device works on arm64 with image 1.64.1, shutter-before-first-frame trap
metadata:
  type: project
---

- Measured taps (all asserted exact): B1 one spot camera 12, B2 median camera 15, B3 median library 20 (best order: majority tags first, then re-tag selections), B4 second trade same day 13 (+1 company chip). Native picker counts files+1. Shared flow in `e2e/fixtures/captureMedian.ts` (also used by the Chromium K2 walk).
- Camera POM: `camera.exit` (`rapid-camera-review`, "Close" / "Review (n)" / "Saving photos…"), `waiting`, `lowResHint/UseApp/Dismiss`, `allowHint`, `errorClose`, `topBar`, `waitForLive()`, `startFromPlus('photo'|'diaryEntry')` (counted). `shoot()`/`shotCount()` match `(n)` only, so German "Prüfen (n)" works. `camera.dialog` is found by containing the stage (German "Kamera").
- Production now keeps the shutter aria-disabled until the first frame (stub path: 1500 ms fallback), so `waitForLive()` just waits for it to be enabled. C8 proves the disabled window with `installFakeCamera(page, { startDelayMs: 1500 })` (a deterministic window; the plain stub is too fast to observe). The WebKit stub canvas stream rarely (~1%) never delivers a frame under parallel load: the stub now also redraws on a `setInterval`, and `shoot()` has a 20 s cap whose error prints the video state.
- Title chips are the 6 newest saved entries of the SHARED db: seed title entries with `titleSeedDate()` (far future), not yesterday, or parallel tests evict them.
- Several specs hit WebKit "page.goto interrupted by another navigation" right after an SPA navigation (save -> entry page, `?start=` removal, edit URL): wait for the end state (`expectStartConsumed`, entry page loaded, `capture-screen`) before `goto`.
- Trap: after Save the app navigates again once uploads finish; `page.goto` right after save fails "interrupted by another navigation" — poll photos first.
- `photosTaggedInOrder` sorts by `originalFilename` (API sortOrder is 0 for all capture photos; createdAt can reorder concurrent uploads).
- Stub frame is 640x480 so the low-res hint shows after the first shot in every stub test; C6 delays `toBlob` of 640x480 canvases to make "Saving photos…" observable.
- Chromium fake device (`capture-camera-chromium.spec.ts`) PASSED on arm64 with playwright:v1.64.1-noble (temporarily lifting the `process.arch` skip) — the arm64 crash note in story-2221 is stale for that image; skip left in place.
- Remove last photo is an aria-disabled no-op while a shot is being written and a click does not wait: use `removeLastShot()` (waits for enabled).
- PhotoAnnotator inline input is focused one `requestAnimationFrame` AFTER it is visible, and that rAF also resets its value: an Escape sent earlier goes to BODY and the viewer dialog's focus trap closes the whole viewer (CI failure "Measurement tool — Escape commits"); a `fill()` earlier is wiped (Text tool flake). Always `expect(inlineInput).toBeFocused()` before typing/pressing Escape (POM + specs do now).
