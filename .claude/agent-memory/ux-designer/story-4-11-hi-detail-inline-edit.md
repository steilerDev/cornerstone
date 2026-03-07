# Story 4.11 — HI Detail Inline Date & Dependency Editing (Issue #467)

## Spec Posted

Comment: https://github.com/steilerDev/cornerstone/issues/467#issuecomment-4004291302

## Section Restructure

- Old layout: Details card + Dates & Delivery card + Schedule section + Constraints section
- New layout: Details (.section) → Dates & Delivery (.section) → Dependencies (.section)
- All three sections use the border-variant `.section` token map (NOT the shadow `.card`)
- "Schedule" section and "Constraints > Delivery Window" merge INTO "Dates & Delivery"
- "Constraints > Dependencies" becomes its own standalone "Dependencies" section

## Strikethrough Target Date Pattern

When actualDeliveryDate is set:

- Actual date: `font-size: var(--font-size-sm)`, `font-weight: var(--font-weight-semibold)`, `color: var(--color-text-primary)`
- Target date (struck-through): `font-size: var(--font-size-xs)`, `color: var(--color-text-muted)`, `text-decoration: line-through`
- CRITICAL: struck-through span needs `aria-label="Target date: [date]"` — screen readers don't convey text-decoration
- New CSS classes: `.scheduleActualDate` and `.scheduleTargetStrikethrough`

## Autosave Pattern (mirrors WorkItemDetailPage)

- `AutosaveIndicator` component at `client/src/components/AutosaveIndicator/AutosaveIndicator.tsx`
- States: idle (hidden) → saving (ellipsis, muted) → success (✓ green, 2s auto-reset) → error (✗ red, persists)
- Pattern source: `WorkItemDetailPage.tsx` lines 220–244, 708–780
- `inlineFieldWrapper` + `propertyInput` + `clearDateButton` CSS from `WorkItemDetailPage.module.css` lines 326–391
- AutosaveIndicator CSS classes must be LOCAL COPY in `HouseholdItemDetailPage.module.css` (not imported cross-module)

## Re-fetch Required After Save

- `actualDeliveryDate`: re-fetch (targetDeliveryDate may change)
- `earliestDeliveryDate`: re-fetch (scheduling engine recalculates targetDeliveryDate)
- `latestDeliveryDate`: no re-fetch needed
- `orderDate`: no re-fetch needed

## Edit Page Scope Reduction (AC 9)

`HouseholdItemEditPage` removes: orderDate, earliestDeliveryDate, latestDeliveryDate, actualDeliveryDate, status.
Remaining: name, description, category, vendor, URL, room, quantity, tags.

## New CSS Classes

- `.inlineFieldWrapper` — flex row containing input + clear button + indicator
- `.clearDateButton` — the × clear button
- `.autosaveIndicator`, `.autosaveSaving`, `.autosaveSuccess`, `.autosaveError` — autosave badge
- `.scheduleActualDate`, `.scheduleTargetStrikethrough` — schedule row display states
- Extend `prefers-reduced-motion` block to cover `.autosaveIndicator` and `.clearDateButton`
