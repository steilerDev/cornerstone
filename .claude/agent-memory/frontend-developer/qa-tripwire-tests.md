---
name: qa-tripwire-tests
description: QA encodes known production defects as `it.failing` tripwires; a shared helper that hard-codes the broken model can swallow the flip signal, so verify the fix independently
metadata:
  type: project
---

QA (`qa-integration-tester`) encodes a known-but-unfixed production defect as `it.failing` with a
passing control test alongside. The suite stays green while the defect is open; when production is
fixed the test starts passing and Jest errors with "Failing test passed even though it was supposed
to fail" — that error is the intended confirmation signal, and the fixing agent is expected to flip
`it.failing` → `it` (the one sanctioned developer edit to a test file).

**Why:** it keeps the defect encoded in executable code rather than only in a report, so a fix can't
land without someone noticing the guard.

**How to apply:** the flip signal is NOT reliable on its own. If the tripwire calls a shared render
helper that asserts the _broken_ model (e.g. `expect(body).toHaveLength(1 + usageChunkCount + 1)`,
which bakes in "meta never adds rows"), a correct fix makes the helper throw first — the tripwire
then still "passes" as a failing test and no signal appears. Seen on #1959 (`realRender.test.ts`
cell-scope block): the fix was verified, the tripwire never flipped.

So: (1) always verify the fix independently with your own scratch render/measurement harness before
trusting or distrusting the tripwire; (2) if the flip leaves the test failing inside a shared helper
rather than at its own assertions, revert to `it.failing`, leave QA's file byte-identical, and report
the exact helper line QA must update — do not "fix" the helper to make the flip work;
(3) expect sibling tests in the same block to fail too, for the same reason (they assert the broken
model at content-tree level, which is why they passed while the rendered PDF lost content).

**Outcome on #1959 (closing the loop):** reporting the exact blocking helper line was the right call
— QA re-derived the row count from the production packer itself, then converted the tripwire to a
normal guard. Reporting "cannot flip, here is the line" got it resolved in one round; editing the
helper myself would have put a developer edit in a QA-owned file for no gain.

Related: [[../MEMORY.md]] "Refinement Workflow — QA Test Coordination", [[i18n-invisible-chars]].
