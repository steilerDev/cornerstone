---
name: object-home-move-specs
description: Hazards when speccing an object list moving to its own home with inline create, a taxonomy sheet and translated built-ins (EPIC-21 #2213 Companies/Trades) — ObjectForm in page closures, field names vs server paths, stacked Modals, rename clears translation keys, label-in-name, prefs reset
metadata:
  type: feedback
---

Found while speccing #2213 (P1.7, Companies out of Settings, Trades sheet).

1. **Importing `ObjectForm` into a page raises that screen's `primaryButtons`.** `.save` composes `btnPrimary`. A picker's inline create on a non-ObjectForm page therefore goes through an App-root provider (context file + hook with no ObjectForm import; provider imported only by `App.tsx`, like `ObjectFormRoutes`). Inside an ObjectForm, use `ctx.createChild`.
2. **ObjectForm field `name` must equal the API body key.** `serverFieldErrors` maps `details.fields[].path` by name. Keeping old DOM ids (`vendor-name`) for E2E silently breaks server field errors.
3. **`useFocusTrap` listens on `document`.** Two stacked Modals both get Escape and Tab. The lower one needs `dismissible={false}` while the upper is open (ObjectForm's `confirmOpenRef` pattern). Escape inside an input can be kept from the dialog with React `stopPropagation`.
4. **"Rename clears translation_key" needs a client guard.** A rename input prefilled with the _translated_ display name, saved unchanged, would clear a built-in's key. Skip the request when the trimmed value equals the display name, and write a mutation test for that guard.
5. **WCAG 2.5.3 premises in UX specs can be wrong.** "Call ‹number›" is not a prefix of "Call ‹name› on ‹number›". Spec one accessible name per visible variant, starting with the visible text.
6. **New DataTable columns + stored prefs**: changing `pageKey` (e.g. `vendors` → `companies`) resets everyone to the defaults. That is cheaper than `alwaysVisible` when the page is rebuilt anyway.
7. **API client whitelists strike again**: `fetchVendors` dropped `tradeId`, so the shipped Trade filter never reached the server. Grep every param the page builds against the client.
8. **The UX "every X picker" lists may name `<select>`s.** Check which are text pickers before accepting an AC whose premise is "when no X matches my text"; escalate the conversion scope.
9. **A URL-backed sheet on a DataTable page** needs the param reserved in `useTableState`, and the list's load effect keyed by a string of the request, not the `filters` Map identity. Otherwise opening the sheet refetches the list.

**How to apply:** any story that moves an object list to a new home, adds create-from-picker, or manages a translated taxonomy (trades, categories, orientations).

Related: [[dialog-route-specs]], [[restructure-baseline-hazards]], [[shared-component-extension-specs]], [[grammar-component-specs]]
