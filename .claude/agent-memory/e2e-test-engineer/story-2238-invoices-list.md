---
name: story-2238-invoices-list
description: #2238 Invoices list on ObjectList - InvoicesPage POM API, surface-agnostic locator pattern, chip/URL and empty-state rules, footer-vs-server comparison, open phone selection-bar item.
metadata:
  type: project
---

First ObjectList adopter. `e2e/pages/InvoicesPage.ts` was rewritten (ids `invoices-<part>-<id>` table, `invoices-<part>-mobile-<id>` card; both surfaces always mounted, switched by the LIST width (768 px container query), so tablet (iPad 810) can be table or card - never assume by project).

- Every row locator is `.visible()`-filtered (`row/title/company/statusBadge/flagBadge/expandToggle/childStatus/childFlag`); `isTableSurface()` guards table-only parts (columns, `Not yet split`, `Progress payment overdue`, `Progress payments only` badges exist on the table only).
- Chip URL: pressing the default chip (To pay) with no search REMOVES `?status=`; with a search active it writes it explicitly. A `q=` without `status` = "Searching all" (no chip pressed, footer hidden); use `status=pending&q=` to search inside To pay (footer then reads "Still to pay in this list"). `gotoChip('pending')` omits the param.
- Empty states: To pay with nothing = "Nothing to pay right now"; every other chip (and any search/filter) = "No invoices match." + Clear filters (decision: template behaviour kept; "No invoices yet" is not shown).
- Heading is "Invoices (n)" / "(n of m)" - match with `/^Invoices\b/`, never exact text. A company filter makes it "(n of m)" with the GLOBAL m.
- Mark paid command accessible name is "Mark paid, ‹title›, ‹company›" (match `^Mark paid, `).
- Playwright will not click `aria-disabled` buttons: use `click({ force: true })` for the "does nothing" check.
- "Without document" checkbox exists only while Paperless is configured (mock `**/api/paperless/status` with `configured:true,reachable:true`); "Refunds due" only while `summary.refundsDue.count>0` (mock the list response to hide it).
- Footer figure vs server: other workers move the total constantly - compare against the totals the page's own responses carried (`summary.openPayable` vs `listTotals.openPayable` of one unfiltered response are equal by construction), never against a fresh GET.
- `e2e/fixtures/invoiceListMocks.ts` builds a well-formed empty list response (chipCounts + listTotals); a mock without them breaks chips and footer.
- Figure registry: `invoices.toPay` (story 4.6) reads only `stillToPay` from the footer; there is no Paid footer and no Ready to submit card (D-30). Money Overview's Paid fact links to `?status=paid`, Still to pay to the bare list.

Selection bar: `SelectionActionBar` is `position: fixed` above the phone bottom bar with an in-flow spacer (all widths); it slides in (`slideUp`), so measure its box only after `getAnimations()` finished (a mid-animation box once failed the tablet overlap check by 6 px). Tests: fixed bar not under the bottom bar, footer (page end) ends above the bar, undo toast ends above the bar.
