---
name: story-2240-convert-page-tests
description: Story #2240 Convert page client tests - barrel import ripple, spread-actual API mocks, card stub fixture, focus/getClientRects stub, App.tsx baseline gap
metadata:
  type: project
---

Convert page (InvoiceConvertPage + ConvertOfferForm + 3 cards + useConvertOffer/useConvertDocument + ConvertLinesTable).

- (Fixed in #2240: `convertLines.ts` now imports from costLineRows.js.) `ConvertOfferForm` still imports the CostLineTable barrel, so its API mocks must spread the real module exports (`const actual = await import(...)`, then `{...actual, fn: mock}`). Hook tests need no extra stubs.
- Card tests use `client/src/test/convertFixtures.ts` `makeConvert(over)` (a plain UseConvertOffer with inert jest.fn callbacks); a tiny stateful Harness is needed only where the shortfall must change after a save.
- jsdom has no layout: `ConvertLinesTable` focus handles filter by `getClientRects().length`; stub `HTMLElement.prototype.getClientRects` (card surface = `closest('[class*="cardSurface"]')`) and restore in afterEach. Both surfaces always mount, so ids need `-mobile-`.
- `useInvoiceRecord`/`useInvoiceCostLines` can fetch twice at mount (t identity changes): use `mockRejectedValue`, not `...Once`, for error-state tests.
- `SectionCard` adds a sr-only `role=status`: use `getAllByRole('status')`.
- Jest only runs from the repo root here (running from `client/` fails Babel on `import type`); filter noise with `grep -v "Jest: importing JSON"`.
- App.tsx whole-file coverage is 82.8% statements on baseline: 16 lazy page loaders of unrelated routes are never visited by App.test. Not caused by a story; the diff itself is 100%.
- Equivalent/unkillable: "status arrives after unmount" (React 19 drops the setState silently) and `selectRef.current?.focus()` optional chain in ConvertDocumentCard (button always mounted).
