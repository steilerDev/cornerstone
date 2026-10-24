---
name: release-history
description: Condensed per-release docs changes (EPIC-15 through PR 2041, #2235) with the facts that are still true. Superseded card-flow details are removed on purpose.
metadata:
  type: project
---

Use this for "what did the last release change in the docs". For current behaviour, read the code and [cost-lines-grid](cost-lines-grid.md).

- **EPIC-15 invoice-budget-line rework**: `vendors-and-invoices.md` rewritten for the many-to-many model, two-step picker, invoice groups and bidirectional linking. Subsidy page got a cost basis section. No new pages.
- **v2.7.0 (auto-itemize, photo annotator, inline budget editing)**: photo annotator has 9 tools (Select, Rectangle, Highlight, Arrow, Line, Ellipse, Text, Measurement, Freehand), no callout, saves WebP at quality 0.92. The "Auto-itemized" Budget Overview badge was removed (#1655/#1615); do not document it. The document hide-linked toggle is system-wide (#1559) and lives in the linking picker, not the Documents page. Invoice-linked budget lines became editable and movable (#1607/#1554); that flow is now the cost line edit form.
- **v2.11.0 (Paperless metadata forwarding, perf)**: auto-itemize forwards six Paperless fields to the LLM (title, correspondent, documentType, tags, created, originalFileName); rule 13 of the extraction prompt treats them as authoritative. The queued create-line on the review page (#1764) is retired with the card flow. Perf work (#1763) is internal, release summary only.
- **Cost Basis filter (#1786)**: Budget Overview Cost Breakdown has All / Paid / Outstanding, separate from the min/avg/max perspective, URL `?paymentStatus=paid|outstanding`. Deposit-aware. Documented in `budget-overview.md`.
- **Merge lines (#1797)**: documented in `auto-itemize.md` as a subsection before step 6. Still true.
- **Diary default filter (#1782)**: default is Manual, not All (`diary/index.md`).
- **PR #2041**: new `guides/budget/bank-reports.md` closed a total gap for the Bank Report Wizard. Subsidies page got multi-category, "No Category" and the five-status enum. `.env.example` gained AUTH_RATE_LIMIT_MAX, AUTH_RATE_LIMIT_WINDOW and VAT_RATE (all commented out).
- **#2235 (P4.3 cost lines)**: move rule, grid columns and invoice status words corrected to the rendered English. See [invoice-status-words](invoice-status-words.md).

Lessons:

- Task briefs can mislabel features (the photo annotator was once called EPIC-16; EPIC-16 is floor plans and is still planned). Check the issue state before writing "shipped".
- The docs build is the only check on anchors for docs-only PRs. Run `npm run build -w docs` yourself.
