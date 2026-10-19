---
name: story-2223-system-events
description: #2223 system events E2E: FeedRow test ids, v1 mock builders, History filter, hidden/repeat mocks, payment-link spec, German-on-mobile trap
metadata:
  type: project
---

Specs `e2e/tests/diary/diary-system-events.spec.ts`, `e2e/tests/invoices/invoice-payment-target.spec.ts`; mock builders `e2e/fixtures/systemEventMocks.ts` (`mockSystemEvent`, `mockDiaryList` with `hiddenCount`). POM: `DiaryPage.systemEventRow/systemEventLink/showHiddenToggle/hiddenNote`; `DiaryEntryDetailPage.loaded` is typeBadgeContainer OR a system-event row (automatic entries have no badge container).

- Automatic list rows are `system-event-<id>` (+ `-type`, `-link`, `-removed`), not `diary-card-<id>`; the detail page's nested source section / area breadcrumb is gone for events.
- Mocks with `changeSummary` metadata render as legacy (muted stored text); use v1 `{v:1,event:'status_changed',from,to,subjectLabel}`.
- Other tests add events concurrently: find rows by id and `scrollToLoadMore` inside `toPass` until visible.
- Phone: the filter panel is collapsed, so `mode-filter-automatic` is hidden (`toHaveText` still works, `waitFor visible` does not).
- Payment link: `?payment=` is stripped by replace right after the scroll/focus; target is `[data-payment-id=<id>]:visible` (row and card both mounted); highlight class `paymentTarget` lasts 3 s.
- A to B to A: PATCH back inside 30 s by the same user retracts the event; so does `POST /api/undo/<token>` (token from the PATCH response).
