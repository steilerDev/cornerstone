---
name: unmodified-tests-constraint
description: How to spec a feature when the AC says existing tests must stay green unmodified — partial ESM mocks, required props/fields and ts-jest diagnostics all break untouched test files
metadata:
  type: feedback
---

When an AC says "existing tests stay green unmodified" (#2161 report PDF split), three things in this repo break untouched test files, and the spec has to route around each one.

**Why:** ts-jest runs with diagnostics, so a type error in a test fixture fails the test. Page tests also mock barrels partially with `jest.unstable_mockModule`. For example, `ReportWizardPage.test.tsx` mocks `lib/reportPdf/index.js` with 4 names and `lib/paperlessApi.js` with only `getPaperlessStatus`.

**How to apply:**

- **New required props or fields break fixtures.** Make new component props optional, and render the new UI only when the new callback is passed. Add new data to `ReportContent` as an optional, opt-in field, never as a required `labels` entry.
- **A new static import of a partially mocked module breaks the page test at link time.** Load the new pipeline with `await import()` from inside the code path that only runs when the feature is active. Import pure helpers from direct file paths (not the mocked barrel).
- **Put new tests in new files** (`X.feature.test.ts`). Do not edit existing files' assertions.

Related: [[shared-component-extension-specs]], [[review-round-discipline]]
