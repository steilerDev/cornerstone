---
name: capture-screen-specs
description: Hazards found speccing EPIC-21 #2221 (diary capture screen, rapid camera, IndexedDB uploads) — planned allowedAdditions names, no in-app leave blocker, WebKit has no fake camera, existing shell/formatter helpers UX re-invents, insecure-context APIs, closure primaries, remount on draft URL replace
metadata:
  type: feedback
---

Found while speccing #2221 (P2.2). Each was a UX or orchestrator premise that the code contradicted.

1. **New shared components must use the planned names in `baseline.json` `allowedAdditions`.** `compareBaseline` flags a component whose basename is not allowed; the plan reserved `CaptureScreen`, `TagChips`, `RapidCamera` for capture, while the UX invented `CameraCapture` etc. Map UX names onto planned ones and move story-specific pieces into helper files inside a counted folder (only `X/X.tsx` counts).
2. **No in-app leave confirm exists (BrowserRouter, no `useBlocker`).** UX "Leave with n photos waiting?" / "Discard changes?" on navigation cannot be built. Make data survive leaving (app-wide provider), keep `beforeunload`, and guard only the page's own Cancel.
3. **The iPhone/iPad E2E projects are WebKit:** `--use-fake-device-for-media-stream` is Chromium-only. Stub `navigator.mediaDevices` with an init script (canvas `captureStream`) for WebKit; use the flags only in a Chromium file.
4. **UX re-invents existing helpers:** `--shell-bottom-height` (not a new `--bottombar-height`) and `formatTime` already existed. Grep `styles/index.css`, `AppShell.module.css` and `lib/formatters.ts` before accepting "add X".
5. **Self-hosted plain-http LAN = insecure context:** no `crypto.randomUUID`, no `navigator.mediaDevices`. Use `nanoid` and a native-input fallback.
6. **Closure primaries:** `PhotoAnnotator`, `SignatureCapture` and `ObjectForm` each carry a `.btnPrimary`; a page reusing them is never "primaryButtons 1". Route ObjectForm through an App-root provider; state the true count in the spec.
7. **Creating a draft and `navigate(replace)` to its edit URL** must not remount the page (focus is in the field being typed). Same element type + `key` on both routes, and a single-mount unit test.
8. **"Save enabled when a photo exists"** fails when photos are still queued client-side — the server counts stored photos only.
9. **Money words hide in UI sentences:** "The camera isn't available" (4 words, `available`) is a baseline rise.

10. **`plan:build` refuses a new screen with more than 1 primary.** The only path is to seed the new screen's row by hand and then run `plan:build`. In #2221 the hand seed left the retired screens' rows in place (and zeroed one), and `plan:check` only noted "baseline is behind". In review, always run `plan:build` after a hand seed and diff the result.
11. **`position: sticky` cannot pin to the viewport in this shell.** The main column is an overflow scroller that never scrolls. `StickyActionBar` became `position: fixed` with an in-flow spacer. Don't spec "sticky" bars again.

**How to apply:** any capture/photo/upload story, any story adding shared components, any UX spec with leave dialogs or camera E2E.

Related: [[restructure-baseline-hazards]], [[dialog-route-specs]], [[ux-visual-spec-verification]], [[diary-rules-specs]], [[object-home-move-specs]]
