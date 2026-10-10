---
name: status-vocabulary-switch-specs
description: Hazards when a spec switches status chips/labels to canonical common:statusVocabulary sets — hidden parallel colour maps, partial canonical sets, report getFixedT namespaces, scoping a banned-word test
metadata:
  type: feedback
---

When a story switches status labels or chips to the canonical sets, the deprecated union key sets are only a fraction of the work. In #2195, deleting 7 sets also meant replacing about 8 parallel colour implementations: local `.status_*` / `.statusPending` / `.pending` classes in InvoiceDetailPage, VendorDetailPage, InvoiceGroup, InvoiceDepositsSection (composed by ConvertQuotationModal), ReportInvoiceList, WorkItemDetailPage and the global `badge-*` strings. It also meant replacing literal-key label maps (`create.fields.statusOptions`, `detail.statusOptions`, `gantt.tooltip.status`) and hard-coded English variant constants (`HI_STATUS_VARIANTS`).

**Why:** grepping `I18N_UNION_KEYS.<set>` finds only the template-free consumers. Literal-key maps and CSS class maps never show up there.

**How to apply:**

- Grep three ways: the set names; the literal key prefixes (`statusLabels\.`, `statusOptions\.`, `status\.`); and class patterns (``styles\[`status_``, `badge-\$\{`, `statusPending`, `composes: status`). Also grep `.replace(/_/g, ' ')`, which renders raw enum values.
- Check that each canonical set covers the whole union. `statusVocabularyDiaryType` is manual types only, so automatic types need their own set plus a picker helper.
- Plan defect line refs can be stale. css-loader keeps class names as-is (`namedExport:false`), so `styles[\`status_x\`]` works wherever the class exists. Verify which classes are actually missing.
- Bank PDF uses `i18n.getFixedT(lang, 'budget')`. A canonical `common` key needs `{ ns }`, and resources are bundled statically, so this works.
- Scope a banned-word test by **meaning**. Rename stray non-status hits (for example, milestone "Pending" → "Upcoming") rather than allow-list them. Exclude only words a later story owns (#2194 kept "Outstanding" for story 4.12), and derive the de exclusion from the en value.
- Every rewritten short label must pass the money-label baseline. See [[restructure-i18n-specs]] and [[ux-visual-spec-verification]].
