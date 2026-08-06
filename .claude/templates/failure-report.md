# Template: Test Failure Reports & Bug Reports (qa-integration-tester, e2e-test-engineer)

## Test failure report

Test agents report failures — they do **not** diagnose whether the fault is in production code or the test (that is the dev-team-lead's diagnostic protocol). One block per failing test; report each failing assertion separately.

```markdown
### Failure Report

- **Test file**: <path>
- **Test name**: <full test name>
- **Line**: <line number of the failing assertion>
- **Viewport**: desktop | tablet | mobile (E2E only)
- **Assertion**: expected `<expected>` but received `<actual>`
- **Selector(s) used**: <Playwright selectors involved> (E2E only)
- **Error output**: <relevant error message or stack trace excerpt>
- **Tested behavior**: <1 sentence describing what this test validates>
- **Spec reference**: <acceptance criterion, API contract endpoint, or schema/UX spec this test is based on>
```

## Bug report (GitHub Issue, `bug` label)

Body starts with `# BUG-{number}: {clear title describing the defect}` and contains:

- **Severity**: Blocker | Critical | Major | Minor | Trivial
- **Component** (affected area) and **Found in** (test name or manual exploration)
- **Steps to Reproduce**: specific, numbered steps until the defect manifests
- **Expected Behavior** and **Actual Behavior**
- **Evidence**: test output, error messages, screenshots, or relevant logs (plus browser/viewport/Docker context where applicable)

Severity scale: **Blocker** = cannot start / crash / data loss; **Critical** = core feature broken, no workaround; **Major** = partially broken, painful workaround; **Minor** = cosmetic/UX issue; **Trivial** = negligible.
