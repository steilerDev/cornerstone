---
name: infinite-scroll-consumer-hazards
description: Hazards to pre-empt when a spec adopts useInfiniteScroll/InfiniteScrollFooter in a new consumer, or hides/unmounts a focused control (modals, client-side filters, focus drops) — #2101, #2064, #2067
metadata:
  type: project
---

When a new consumer adopts `useInfiniteScroll` + `InfiniteScrollFooter` (Diary was the first, #2060), check these before writing the spec.

**Why:** each is invisible in Jest (jsdom has no layout, no IntersectionObserver, no focus-fixup) and was not exercised by the Diary precedent, which scrolls the window and has no client-side filter.

**How to apply:**

1. **The scroll container is per-consumer, not "Modal .content".** The UX spec for #2101 named `Modal .content`, but `LinkedDocumentsSection` uses its own modal whose scroller is `.pickerBody`, and `InvoicePaperlessPickerModal` scrolls an inner `.modalBody` (60vh). A viewport-root observer clips at the scroller, so the lookahead `rootMargin` is lost. Discover the nearest scrollable ancestor at mount instead of hardcoding one.
2. **An IntersectionObserver fires only on threshold _crossings_.** If an appended batch leaves the sentinel inside the lookahead, nothing re-fires and the list stalls. The fix is to `unobserve`+`observe` after each applied batch, which forces a fresh initial callback. Do not trust a cached `isIntersecting` ref: the post-commit effect runs before the observer delivers the "moved out" entry.
3. **A client-side filter can hide a whole batch.** "Hide already linked" can make a fetched batch render empty while `hasMore` is true. The consumer needs its own "zero visible and idle, so loadMore" effect, and must not put the client filter in `resetKey`, because that refetches and loses loaded rows.
4. **Setting `disabled` on a focused button drops focus to `<body>`.** HTML focus fixup does this, and so does unmounting the button on `done`. Use `aria-disabled` while loading and hand focus to a `tabIndex=-1` end-of-list element. Only a Playwright `toBeFocused()` proves it.
5. **A fix that makes something *really* hide can create a new focus drop.** When #2067 added the `.currentParentRow[hidden]` guard, the focused "Change" button sat inside the row that now truly hid. The picker's Cancel had the same problem inside its body. Before speccing any hide/unmount fix, ask where focus is at that moment. Then spec a pending-focus ref, set in the handler and consumed in an effect keyed on the toggle state. The same applies to a first-batch retry that returns an empty list and unmounts the footer (#2064: focus the empty-state CTA).
6. **jsdom lacks IntersectionObserver.** Any test that renders a real consumer crashes unless the hook guards `typeof IntersectionObserver === 'undefined'`.

Related: [[shared-component-extension-specs]], [[review-round-discipline]]
