---
name: story-2213-companies-trades
description: #2213 Companies list / Trades sheet / company pickers E2E — POMs, helpers, production defects found by the live run, and the patched-image technique for verifying test logic behind a defect
metadata:
  type: project
---

**Files:** `tests/companies/{companies-list,companies-trades-sheet,company-create,companies-redirects}.spec.ts`;
POMs `pages/VendorsPage.ts` (kept name; `CompaniesPage` alias; `row/nameLink/callLink/rowActions/tradeChip`,
`createDialog` = ObjectFormDialog('New company'), `tradesSheet`), `pages/TradesSheet.ts` (`panelBox()`, `chooseAction`,
`mergeDialog/deleteDialog` = ConfirmDialogControl prefixes `trades-manager-merge-dialog` / `-delete-dialog`),
`pages/components/CompanyPickerControl.ts` (input id + create row + `form` testid `company-create-form`),
`fixtures/localeUser.ts` (`openAsLocaleUser`: dedicated member + `locale` pref in its own context; plain function, not a
fixture, so no shard reshuffle). Old vendor testids/`VENDORS_ROUTE` kept as aliases.

**Facts that cost time:**

- Name links carry `data-company-name-link`; table AND card are mounted, so every row locator needs `.filter({visible:true})`.
- Header actions column renders a visually hidden "Actions" th: assert the header list ends with `/^Actions$/`.
- Playwright treats `aria-disabled` as not actionable: assert an aria-disabled action ignores clicks with `click({force:true})`.
- Tablet/mobile projects only run `@responsive`-tagged tests; tablet (iPad 810) is a coarse pointer, desktop 1920 fine (Call 32px).
- ObjectForm child step swaps the SAME dialog's title (purchase -> "New company"): use `ObjectFormDialog(page,'New company')`
  while the child is open, `Back` = `object-form-back`.
- SearchPicker ignores ArrowDown while its 300ms debounced search loads, and shows stale unfiltered results meanwhile:
  `arrowToCreateOption` waits for the create row to stand alone (count 1) and retries the key (`toPass`). Re-typing the same
  text fires no input event: clear first.
- ConfirmDialog opened from an OverflowMenu item: on Cancel/Escape focus lands on the page h1 (opener gone), not the ⋯ trigger.
- German UI: chips group is "Gewerk", search field "Elemente suchen" (use `getByRole('searchbox')`), sheet dialog "Gewerke".
- Renaming a built-in trade clears its translation key for good (shared DB). T6 uses `trade-excavation`, desktop only,
  restores the English name and tolerates an already-cleared key (retry / second run).
- `/companies/new` Save replaces history with the company page (h1 focused); Back returns to the page before the dialog.
- Two `page.goto` in a row on WebKit can fail "Frame load interrupted": wait for `main` between them.

**Production defects the live run found (guard tests kept failing, not weakened):**

1. TradesManager Modal is 448px, not min(32rem,100vw-2rem): shared `.modalContent{max-width:28rem}` wins over `.dialog`.
2. OverflowMenu portaled menu (`--z-overlay` 50) renders BEHIND the Trades dialog/sheet (`--z-modal` 1000 / sheet 51): Rename,
   Merge, Delete in the Trades sheet cannot be clicked on any viewport.
3. Trades sheet "Add" button is 40px high at <=1023px (spec: >=44px).
4. Phone (<768px): the New company form is a Sheet (z 50/51) and opens BEHIND the invoice create/edit Modal (z 1000); its
   Cancel is unreachable (P1/P2 on mobile).
5. Paperless review picker: with an unmatched extracted name the create row (`show:'always'`) is also offered for a typed
   name that already exists (AC5 says no create row).
6. (Observation) delete ConfirmDialog from a ⋯ menu returns focus to the h1, not the trigger.

**Verification technique:** when a production defect blocks the rest of a flow, build a throwaway image from a COPY of the
worktree with the CSS patched (never the worktree), `docker tag` it as `cornerstone:e2e`, run the specs to prove the test
logic, then re-tag the unpatched image for the real per-viewport totals. Rebuild the real image whenever the translator or
frontend edit files after the build started (a stale image showed English in the German UI).

**Re-verification after the frontend fixes (all 6 reported ones fixed except:)** the invoice EDIT modal on phone still
stacks the New company sheet at z 51 under the modal at 1000 (P2 mobile; the create modal P1 is fixed), and focus lands on
`<body>` in ~25% of runs after deleting a trade in the Trades sheet (T7). The VendorsPage `search()` must match the response
to its own `q` (an in-flight unfiltered list response otherwise satisfies it).
