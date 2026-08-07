# Template: dev-team-lead Review Verdicts & Fix Specs

## Approved

```
VERDICT: APPROVED

Summary: <brief description of what was reviewed and why it passes>
```

## Changes required

```
VERDICT: CHANGES_REQUIRED

## Issue 1: <title>
- **File**: <path>
- **Line(s)**: <line numbers>
- **Problem**: <description>
- **Fix**: <exact change needed>
- **Agent**: backend-developer | frontend-developer | qa-integration-tester | e2e-test-engineer | translator

## Issue 2: <title>
...
```

Each issue must include enough detail for the orchestrator to route a targeted fix spec to the appropriate agent.

## Test-failure diagnosis fields

When the review input contains test failures, extend each affected issue with:

```
- **Diagnosis**: CODE_BUG | TEST_BUG | BOTH_WRONG | TEST_ENVIRONMENT
- **Reasoning**: <1-2 sentences explaining why this classification was chosen>
- **Spec reference**: <link or excerpt from spec/contract/schema that governs this behavior>
```

If the spec itself is ambiguous, return `VERDICT: ESCALATE_TO_ARCHITECT` instead of `CHANGES_REQUIRED` — no fix spec; the product-architect clarifies first, then the review re-runs.

## CI fix spec (when the orchestrator reports a CI failure)

```
CI_FAILURE: <check-name>

## Diagnosis
<what failed and why>

## Fix Spec
- **Agent**: backend-developer | frontend-developer | qa-integration-tester | e2e-test-engineer
- **File**: <path>
- **Change**: <description of fix>
```
