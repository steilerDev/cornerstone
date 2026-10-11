---
name: story-2212-new-menu-objectform
description: #2212 New menu + ObjectForm dialog E2E — POMs, selectors, migrated suites, and the production defects the live run found (deep-link tab title race, New panel width, focus after Save/Discard/`n`)
metadata:
  type: project
---

**POMs:** `pages/components/ObjectFormDialog.ts` (role=dialog named by title works for Modal AND the
full-screen Sheet; `form` testid `object-form`, `-save/-cancel/-more/-add-another/-added/-back`;
discard confirm = ConfirmDialogControl prefix `object-form-discard`; `settled()` waits finite
animations only — never `subtree`, Skeletons animate forever), `pages/components/CreateMenu.ts`
(`top-bar-new`/`create-menu-<id>` from 1024px, `bottom-bar-new`/`create-sheet-<id>` below; `choose(id)`).
The three create POMs keep their file/class names but target the dialog (`dialog`, `form`, field errors
via `fieldError(name)` = `#<name>-error`; non-essential fields need `expandMoreDetails()`).

**Facts:** Modal wrapper is the role=dialog (full viewport) — measure its 2nd child; Sheet panel has
testid `object-form-sheet` and is the dialog. Tablet (810px) gets the Modal; only the mobile project gets
the sheet. `POST /api/work-items` returns the item at top level (`body.id`), not `{workItem}`.
`waitForURL('**/x/**')` resolves instantly on `/x/new` — use a UUID/digit regex. Shell `n` is a fallback
shortcut, so Home's help dialog now lists "Open the New menu" (user-menu spec updated).
Members share the `member-access` isolated-user option value (new-menu-member.spec.ts) — no extra user.

**Live-run defects reported (guard tests kept, not weakened):**

1. Deep-link tab title race: the lazy list page's title effect runs after the eagerly imported dialog host,
   so the tab reads `Tasks · House` instead of `New task · Tasks · House` (page-identity E1 + sweep,
   intermittent).
2. New panel `min-width:14rem` loses to OverflowMenu `.menu` 160px (CSS order).
3. Focus after Save is `<body>` (destination h1 not rendered when the restore chain runs).
4. Discard leaves focus on the list h1, not the opener.
5. `n` with nothing focused, then Escape, leaves focus on `<body>`.
   Re-check these before treating a red run as a test problem.
