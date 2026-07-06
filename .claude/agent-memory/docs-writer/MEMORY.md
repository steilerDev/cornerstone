# docs-writer Agent Memory

## Docs Site Structure

- Content lives in `docs/src/` (Docusaurus `docs.path: 'src'`)
- Config files are `.js` (not `.ts`) to avoid jiti babel.js corruption in sandbox
- Sidebar config: `docs/sidebars.js`
- Site config: `docs/docusaurus.config.js`
- Site URL: `https://cornerstone.steiler.dev/` with baseUrl `/`
- `routeBasePath: '/'` -- docs served at root
- `onBrokenLinks: 'throw'`, `onBrokenMarkdownLinks: 'throw'`, `onBrokenAnchors: 'throw'`
- `markdown.hooks.onBrokenMarkdownImages: 'warn'` -- screenshots don't exist until stable release
- Note: `onBrokenMarkdownImages` is NOT a top-level config key in Docusaurus 3.9.2; it must go under `markdown.hooks`
- React 18.3.1 pinned in docs workspace (Docusaurus 3.9.2 incompatible with React 19.x)
- `blog: false`

## Sandbox Build Issues

- `npm run docs:build` may fail in worktrees due to node_modules corruption (jiti/babel.js, regenerate.js)
- Workaround: try building from the base project directory instead of the worktree
- Clean `npm install` in worktree may not fix it -- sandbox filesystem corruption persists
- Broken screenshot image refs exist across many guide pages (16+ refs) -- all resolve when screenshots are captured during stable release
- Fixed via `markdown.hooks.onBrokenMarkdownImages: 'warn'` in docusaurus.config.js

## Existing Pages (as of EPIC-13)

- `intro.md` -- Landing page (slug: /)
- `roadmap.md` -- Feature roadmap checklist
- `getting-started/` -- index, docker-setup, first-login, configuration
- `guides/work-items/` -- index, creating-work-items, tags, notes-and-subtasks, dependencies, keyboard-shortcuts
- `guides/users/` -- index, oidc-setup, admin-panel
- `guides/budget/` -- index, categories, financing-sources, work-item-budgets, vendors-and-invoices, subsidies, budget-overview
- `guides/timeline/` -- index, gantt-chart, milestones, calendar-view
- `guides/documents/` -- index, setup, browsing-documents, linking-documents
- `guides/household-items/` -- index, creating-editing-items, budget-and-invoices, work-item-linking, delivery-and-dependencies
- `guides/diary/` -- index, manual-entries, automatic-events, signatures
- `guides/dashboard/` -- index
- `guides/feeds/` -- index, subscribing
- `guides/backup/` -- index (BACKUP_DIR/CADENCE/RETENTION env vars, manual + scheduled backups, restore flow, off-site guidance) -- EPIC-19
- `guides/appearance/` -- dark-mode
- `development/` -- index, tech-stack, agentic/overview, agentic/agent-team, agentic/workflow, agentic/setup

## Conventions

- Frontmatter must include `title:` at minimum, `sidebar_position:` for ordering
- Use `:::info Screenshot needed` admonitions for pages needing screenshots (NOT broken image refs)
- Use `:::caution` for destructive actions
- Internal doc links: relative paths within same directory (e.g., `(gantt-chart)`)
- Cross-section links: absolute paths from root (e.g., `/guides/work-items/dependencies`)
- Anchor links for same-page sections: `gantt-chart#touch-devices`
- Double dashes `--` used instead of em dashes in all existing content
- Footer links in `docusaurus.config.js` should be updated when major features are added

## Roadmap State (post EPIC-13)

Completed: EPIC-02, EPIC-11(#12), EPIC-01, EPIC-03, EPIC-12(#115), EPIC-05, EPIC-06, EPIC-08, EPIC-04, EPIC-07, EPIC-10, EPIC-11(#444 tags), EPIC-12(#445 refinement), EPIC-14(#495), EPIC-15(#602), EPIC-09(#9), EPIC-13(#446)
Planned: (none)

Note: EPIC-11 and EPIC-12 each have two issues -- original (#12/#115) and new (#444/#445). Both pairs are completed.

## EPIC-15 Invoice-Budget-Line Rework

Key docs changes: vendors-and-invoices.md was substantially rewritten to document the many-to-many model, two-step picker, invoice groups, and bidirectional linking. Subsidy page updated with cost basis section. Budget overview updated to reference itemized amounts. No new pages added -- no sidebar changes needed.

## v2.7.0 Release (Auto-itemize + Photo Annotator + inline budget editing)

Docs site already had `guides/budget/auto-itemize.md` and `guides/diary/photo-annotation.md` from prior PRs (#1547/#1552, photo-annotator epic). Both needed accuracy fixes for the final shipped state. No NEW pages added; no sidebar changes.

Key shipped-state corrections made (watch for these drifting again):

- **Auto-itemize is a DEDICATED PAGE, not a modal.** Route: `/budget/invoices/:id/auto-itemize/:documentId` (`client/src/pages/AutoItemizePage`). Triggered from the **Auto-itemize action on each linked-document card** in the invoice Documents section (`LinkedDocumentsSection.tsx`, gated on `config.autoItemizeEnabled`), NOT a button next to "+ Add Itemization". Two-column layout: form left, PDF iframe preview right. Per-row category + funding-source pickers + Assign button (two-step picker: item then budget line, or create-new). Editable invoice metadata with LLM suggestion badges. The old "Auto-itemize Preview modal" + "Unassigned pills added after Apply" flow is GONE.
- **The "Auto-itemized" badge on Budget Overview was REMOVED** (#1655/#1615 - product feedback, no user value). Do not document it. `origin` field still exists in DB/backend but is not exposed in UI.
- **Invoice-linked budget lines can now be EDITED and MOVED to a different parent item** (#1607/#1554) via shared `EditBudgetLineModal` (`onMove` prop). The old "assignment is one-shot / locked in" rule is GONE. Available from work item Budget tab, household item Budget tab, and invoice detail. Documented in `work-item-budgets.md#editing-invoice-linked-budget-lines` (anchor used as cross-ref target from auto-itemize.md and vendors-and-invoices.md).
- **Photo annotator: 9 tools, NO "callout" tool.** Select, Rectangle, Highlight, Arrow, Line, Ellipse, Text, Measurement, Freehand. Saves as **WebP quality 0.92** (NOT PNG). `client/src/components/photos/PhotoAnnotator/`. The annotator dir is under `components/photos/` not `components/diary/`.
- **Document hide-linked toggle is SYSTEM-WIDE** (#1559): uses `useAllLinkedDocumentIds()`, hides docs linked to ANY entity. Lives in the `DocumentBrowser` picker (linking flow), documented in `guides/documents/linking-documents.md` -- NOT the standalone `browsing-documents.md` Documents page.

Task briefs may mislabel features: the brief called the photo annotator "EPIC-16" but **EPIC-16 (#752) is actually "Floor Plans & Utility Tracking (2.5D)" and is still OPEN/planned**. The photo annotator was tracked under issue #1472 (CLOSED). Do not relabel the floor-plans roadmap entry. README roadmap: added "Photo Annotation Editor" as a standalone completed item; kept EPIC-16 unchecked.

`.env.example` was already fully in sync with `server/src/plugins/config.ts` (all 6 LLM vars present, OIDC/Paperless/LLM/Backup commented out with placeholders). config.ts env-var extraction: `grep -oE "[A-Z][A-Z_]+"` picks up `EUR` (a default value) as a false positive -- ignore it.

## v2.11.0 Release (Paperless metadata forwarding + queued create-line + perf)

Three commits promoted (#1768, #1764, #1763). Docs touched: `auto-itemize.md` + `vendors-and-invoices.md`. No new pages, no sidebar changes. README NOT changed (top-level feature lines already cover dedicated review page + Paperless-doc invoice creation; these were refinements). `.env.example` was in sync -- no drift. No new env vars -> no CLAUDE.md table change.

Shipped-state facts (verified in source, watch for drift):

- **#1768 LLM metadata forwarding.** `buildPaperlessMetadata(doc)` in `server/src/services/invoiceAutoItemizeService.ts` forwards 6 human-authored Paperless fields: title, correspondent, documentType, tags (`doc.tags.map(t=>t.name)`), created (ISO date), originalFileName. SYSTEM_PROMPT rule 13 (`server/src/services/budgetExtraction/prompts.ts`) tells model to treat them as authoritative over OCR; specifically: correspondent->vendor name, documentType->context, tags->category hints, document date->cross-check invoiceDate. Applies to BOTH `autoItemize()` (dry-run) and `previewAutoItemize()` (via `runExtractionCore()`). So "What data leaves your server" in auto-itemize.md now lists OCR text + the 6 metadata fields + vendor/total/date hints (+locale, +available vendors list). Updated that section.
- **#1764 queued-on-save create-line on Paperless invoice review page.** `client/src/pages/PaperlessInvoiceReviewPage/`. "Create Budget Line" now matches AutoItemizePage queued pattern: closes picker, queues draft on row, shows amber **"Creating New"** badge + inline form + **Discard** button; line materialized on Save. Exact i18n (budget.json): `createLine`="Create Budget Line", `creatingNewBadge`="Creating New", `discardInlineDraft`="Discard", `inlineFormLabel`="New budget line details". UX: confidence auto-applied from Paperless documentType (Invoice->firm, Quotation->estimate) and hidden once set; category/funding pickers hidden while inline draft active (`!line.inlineCreatedBudgetLineDraft`); VAT toggle hidden when `assignedItemType === 'work_item'`. Documented in auto-itemize.md step 6 + cross-ref'd from vendors-and-invoices.md "Creating an Invoice from a Paperless document".
- **#1763 perf** (GET /api/document-links bulk getDocuments, tags fetched once): internal, no user-facing doc. Noted in RELEASE_SUMMARY "Behind the Scenes" only.

Anchor used as cross-ref target: `auto-itemize#6-assign-each-line-and-set-its-category-and-funding-source` (Docusaurus strips the "6." period). Verified resolves.

## Release: Cost Basis filter + Merge lines + Diary Manual-default

Three user-facing changes documented (no new pages, no sidebar changes):

- **#1786 Cost Basis filter** on Budget Overview Cost Breakdown -- new dropdown (All / Paid / Outstanding), SEPARATE control from the min/avg/max perspective. Deposit-aware: for instalment-paid invoices, Paid counts settled deposits, Outstanding counts the rest; Paid+Outstanding reconciles to whole. Paid ignores perspective (pure actuals); Outstanding uses perspective for the uninvoiced portion. URL-persisted `?paymentStatus=paid|outstanding` (default "All" = no param). Logic lives client-side in `client/src/components/CostBreakdownTable/CostBreakdownTable.tsx` (`resolveBudgetLineCost`/`resolveAggregateCost`); server adds `actualCostPaid`/`actualCostPending` via deposit-aware aggregation in `budgetBreakdownService.ts`. Documented in `budget-overview.md` new "### Cost Basis" section after Cost Perspectives.
- **#1797 Merge lines** in auto-itemize (BOTH AutoItemizePage and PaperlessInvoiceReviewPage). Select 2+ UNASSIGNED lines -> SelectionActionBar -> Merge. Numerics summed CLIENT-SIDE (never sent to LLM); only descriptions + category vocab sent to a small stateless LLM call for combined description+category. Lowest confidence kept; uniform-unit quantities summed else per-unit fields dropped. Loading placeholder ("Merging N items…"), error -> Merge failed badge + Retry + "Restore original lines" undo (non-destructive until save). Assigned lines locked out of selection. Documented in `auto-itemize.md` new "### Merge related lines into one" subsection between step 5 and 6, plus a paragraph in "What data leaves your server".
- **#1782 Diary default filter** now 'manual' not 'all' (`DiaryPage.tsx`). Updated `diary/index.md` Filtering section + Overview bullet.

`.env.example` was in sync (no drift); no new env vars -> no CLAUDE.md change. #1780 (harmonize auto-itemize flows) is internal, no user-facing doc.

Pre-existing lint baseline in worktree: ~8 eslint ERRORS in production/test .ts across client/server/e2e (photoService OrientationSummary unused, usePaperless import() type, etc.) -- NOT introduced by docs changes (docs edits are markdown-only; eslint doesn't lint .md). Likely a local `npm install --ignore-scripts` artifact since beta CI requires lint green. Do NOT touch those files as docs-writer.

## Build Note (still true)

`npm run docs:build` fails in worktrees with webpack `ProgressPlugin` ValidationError (node_modules corruption, NOT content). Build reaches the webpack bundling stage, so MDX/content/link loading succeeded. Validate internal links/anchors statically with grep instead; CI does the real build.
