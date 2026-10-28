---
name: story-2244-company-page-tests
description: Story #2244 company page test traps - dead defensive branches, ToastProvider/ToastView needs, ConfirmDialog 409, jest run from repo root
metadata:
  type: project
---

Story #2244 (Company page) tests, Phases A/B/C.

- Run jest ALWAYS from the repo root (`cd` to the worktree root first); inside `client/` babel cannot parse `import type` and every suite "fails to run".
- RelatedList needs `ToastProvider`; Undo assertions need a local `ToastView` rendering `toast-undo` (copy from RelatedList.test.tsx), ToastProvider alone shows nothing.
- Partial `HouseNameContext` mocks break ObjectForm/useUserText (`useHouseName` missing): do not mock it when a dialog renders.
- ObjectForm testids are `${testId}-save` / `-cancel` (not `object-form-save`); SectionCard with `testId` prop uses `${testId}-edit|save|cancel|form`.
- ConfirmDialog with `blocked` (409) removes the confirm button entirely; a non-409 error keeps it.
- Trade EntityPicker needs `tradesApi.fetchTrades` mocked (plus useTrades); with a prefilled trade the input is a chip, click "Clear selection" first.
- Dead defensive branches (no test can reach them, report instead): `?.count ?? 0` on COUNT(*) rows in vendorService (lines ~149/155/205/464/472), `onSite?.` in toVendorDetail, `contactCount ?? 0`; `if (!request.user)` guards in routes/vendors.ts (global auth hook); household-item orphan parent and id-equality in vendorRelationsService; parseMeta defensive branches in historyService; `if (isDeleting) return` in closeDelete of VendorDetailPage and CompanyPaymentsPanel (ConfirmDialog already ignores cancel while busy).
- Money fixture semantics: offer `remainingOnOffer` = amount - paid - pending progress payments.
