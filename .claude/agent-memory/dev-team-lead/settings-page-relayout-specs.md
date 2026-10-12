---
name: settings-page-relayout-specs
description: Hazards when speccing a settings/preferences page re-layout (EPIC-21 #2214 Account) — atomic live regions wrapping buttons, hooks refetching on t() identity, ConfirmDialog tone vs closure baseline, glossary `formerly` words as headings, rate-limited E2E endpoints, rAF vs focusPageHeadingWhenReady
metadata:
  type: feedback
---

Found while speccing #2214 (P1.8, Settings › Account).

1. **An `aria-atomic` status region must not contain buttons whose label changes.** In the UX layout, the one-time secret and its "Copy → Copied" button shared one `role="status" aria-atomic="true"` box. Each label swap would re-announce the secret. Wrap only the text in the region, and put a separate always-mounted sr-only status beside it for the confirmation.
2. **Hooks with `[t, tErrors]` effect deps refetch on every language switch.** react-i18next's `t` changes identity per language. A load effect keyed on it re-shows the skeleton and remounts dependent UI. The worst case is on a page that hosts the language picker itself. Load once on mount, store error descriptors (kind + code), and translate them at render.
3. **`ConfirmDialog` has only `tone?: 'danger'`.** UX specs keep asking for `tone="primary"`. Adding it puts a primary-class `className` into ConfirmDialog, which raises `primaryButtons` on every screen whose closure includes it (about 40). Use danger for "invalidates something" confirmations.
4. **Glossary `formerly` words used as new headings.** "Profile" is a former name of Account, yet the AC, the capmap and the owner's decision all named the section "Profile". Check `formerly` (not just `doNotUse`) for every new heading, and escalate rather than silently deciding.
5. **Rate-limited endpoints in E2E.** The DAV token POST allows 10 per hour, and the suite already uses several per viewport. New focus scenarios should mock the POST and the status GET with synthetic values.
6. **Hash deep-link focus must run in a rAF.** `focusPageHeadingWhenReady()` (CommandSearch, ObjectForm close) focuses the new h1 on its first frame. A plain `useEffect` focus loses to it. Read the hash from `useLocation()` (the display location), so opening a dialog route over the page does not refire the effect.
7. **The `aria-disabled` "nothing changed" Save keeps its primary background** (opacity only). E2E colour checks that used a button turned secondary can be retargeted to it.

**How to apply:** any story that re-lays out a form or settings page, shows a one-time secret, or adds a hash anchor.

Related: [[grammar-component-specs]], [[restructure-baseline-hazards]], [[page-identity-specs]], [[form-prefill-hazards]]
