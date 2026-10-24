---
name: story-2235-cost-lines-tests
description: Story #2235 cost lines (CostLineForm/grid/Split with AI) test notes - fixtures, mock-export ripple, pinned focus defect, D-20 location
metadata:
  type: project
---

- Shared synthetic fixtures: `client/src/test/costLineFixtures.ts` (`makeCostLineRow`, `makeLinkedRow`); prefer real `rowFromBudgetLine` when gross must derive from net+VAT.
- Phase-0 defect D-20 (link prefills gross, not net) now lives in `CostLineForm/LinkInvoiceForm.test.tsx`, test `D-20: prefills the itemized amount with the line gross, not net`.
- Hosts embedding `CostLineGrid` need `ToastProvider` (grid calls `useToast`) and fuller mock factories (vendorsApi.createVendor, invoicesApi.fetchAllInvoices, paperlessApi.listPaperlessCorrespondents, budgetSources/Categories). See [[issue-1912-esm-mock-blast-radius]].
- Tests touching CostLineTable imports must stub delete fns in workItemBudgetsApi/householdItemBudgetsApi/invoiceBudgetLinesApi; a mock factory that dynamically imports its own module recurses to heap exhaustion.
- Grid focus defect (Enter/arrows to existing rows) is FIXED; the two former `it.failing` pins are plain `it`. Grid reaches 100%/100%.
- Per-file coverage trap: /tmp/cov.sh-style runs need `--coverageDirectory` unique to you (QA agents shared /tmp/cov2). ObjectForm leftovers are unreachable: `step.onCreated?.` (type requires onCreated), `mappedErrors?.[name]` (inside filter over its own keys), TS `__rest` helper branch at objectFormState `const { [name]: _cleared, ...rest }`.
- Bash tool refuses compound commands that `cd` to computed paths or pass `$VAR` file lists to npx; use literal globs and the Write tool for big test files.
