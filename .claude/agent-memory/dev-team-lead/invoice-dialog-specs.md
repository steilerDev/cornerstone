---
name: invoice-dialog-specs
description: Hazards from #2241 (New invoice/offer ObjectForm via App-root provider, document EntityPicker kind, edit fold) — async ctx writes land on the top step, Number(null) is finite, route-map `to` query wipes carried params, false UX premises
metadata:
  type: feedback
---

Found speccing and reviewing #2241 (P4.9).

1. **ObjectForm ctx writes target the TOP step.** `setValue`/`setValues` go through `updateTop`. An async write from a root field (document fetch, then company match) that resolves while a child step (New company) is open would land in the child form. Root fields unmount while a child step shows, so an unmount-bumped session guard stops it. But a path that starts a _new_ session after the await (pending `?documentId=` fetch, then `apply()`) bypasses the guard. **How to apply:** capture the session before the first await, on every async entry path.
2. **`Number(details?.x)` with `null` is 0, so it is finite.** Use `typeof x === 'number' && Number.isFinite(x)` before formatting server figures.
3. **A route-map redirect `to` with `?key=` (empty) overrides the carried param.** `resolveRedirect` calls `query.set` from the target. `/budget/invoices?create=1&documentId=` would wipe the incoming `documentId`. Check a planned rule's `to` before flipping it to done.
4. **UX premises to verify:** a "409 duplicate number" (no uniqueness rule existed), and an AI-on "link row" to a page that needs `?documentId` (dead end). Grep the server and the target page before accepting them.
5. **The App-root provider pattern scales:** in-place create from any page, with no page closure importing ObjectForm, gave baseline drops only (InvoicesPage 3→2 primaries, VendorDetail 7→5, InvoiceDetail 8→7, handRolled 3→2).

Related: [[object-home-move-specs]], [[form-prefill-hazards]], [[convert-page-specs]]
