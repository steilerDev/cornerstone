---
name: recurring-patterns
description: Cross-cutting correctness traps in Cornerstone that have bitten more than once — polymorphic FK cleanup, CONFIDENCE_MARGINS units, SQLite XOR CHECK vs SET NULL, cross-layer contract drift between mocked client tests and route schemas, Fastify/ajv anyOf validation, N+1 sites accepted at current scale
metadata:
  type: project
---

# Recurring Patterns & Traps

## Polymorphic FK cleanup

Polymorphic FKs carry no DB-level constraint, so **every** service that deletes the referenced entity
must clean up manually. Applies to `document_links` and `household_item_deps`. Caught as a defect on
PR #416 (orphaned deps on work-item/milestone delete). Check this on any new polymorphic reference.

## CONFIDENCE_MARGINS are fractions, not percentages

Values are `0.2 / 0.1 / 0.05 / 0`. The frontend must multiply by 100 for display. Shipped as a display
bug once (PR #401).

## SQLite: XOR CHECK is incompatible with ON DELETE SET NULL (bug #611)

SQLite enforces CHECK constraints _during_ the FK SET NULL action. Given
`CHECK((a IS NOT NULL AND b IS NULL) OR (b IS NOT NULL AND a IS NULL))` plus `ON DELETE SET NULL` on `a`,
deleting the referenced row fires SET NULL, which then violates the XOR CHECK and aborts.
**Use ON DELETE CASCADE instead.** This is why `invoice_budget_lines` (ADR-018) cascades.

## Forked-function drift

When a function is forked into an `XExcludingY` / `XWithZ` variant rather than parameterised, diff the
core formula against the original line by line — that divergence is where the bug will be. Seen on
`splitByDepositsExcludingTagged` (PR #1894), where the residual expression was the sole difference and
the sole defect. Prefer an options flag over a fork; when a fork ships anyway, file the collapse follow-up.

## Test smells worth escalating in review

- A combined-path test that places the two interacting entities on **different** parents proves nothing
  about the crossing case. Demand the same-parent fixture.
- An assertion of a surprising number wrapped in a long apologetic comment is usually a bug report in
  disguise (pre-fix #1894 test literally said "1400 … is intentionally MORE than the invoice amount").
- Additive-only diffs (`@@ -N,3 +N,269 @@`, zero deletions) bound blast radius to new code paths but say
  nothing about the new path's correctness. Verify with `git diff origin/beta...HEAD -- <file>`.
- Two green suites asserting **opposite** things about the same contract — see the next section.

## Cross-layer contract smell: mocked client test vs. server schema (PR #1922, #1895)

The highest-value review move on any PR that changes a request shape is to read the client test and the
route test **for the same endpoint, side by side**. Client unit tests mock the API client, so they assert
only what the client _intends_ to send; route tests run the real Fastify/ajv validator. When a request
shape changes, the two can drift into flat contradiction and **both stay green**.

Caught on PR #1922: the wizard deliberately began sending `invoiceIds: []` (deposit-only close-out), and
`ReportWizardPage.test.tsx` asserted `toHaveBeenCalledWith('src-1', [], ['dep-1'])` against a **mocked**
`markInvoicesClaimed` — while `sourceReports.test.ts` simultaneously asserted that `invoiceIds: []` returns
**400** (the route schema still carried `minItems: 1` from the old semantics). Every layer passed CI. The
real flow — single-invoice claim report, user excludes one line — 400'd and silently skipped the deposit
sweep the fix existed to perform.

**Review procedure when a request/response shape changes:**

1. Grep both suites for the endpoint. If the client test mocks the API client, it is *not* contract coverage.
2. Re-derive the request the client can now emit at its **extremes** (empty arrays, all-filtered, single
   item) and check each against the route schema by hand — validators are declarative, so this is cheap.
3. Demand at least one test that crosses the seam: a route test via `app.inject` (real ajv compilation), or
   an E2E that drives the UI and asserts the outcome **out of band via the API**, not via the success banner.
4. Beware E2E that stops at the modal. The scenario covering exactly this case
   (`reportWizardExpansion.spec.ts` Scenario 6) asserted the confirm-modal copy and then called
   `cancelClaimConfirm()` — it never submitted, so the 400 was invisible. An E2E that opens a confirmation
   and cancels covers the copy, not the behavior.

Corollary: when a constraint like "≥1 item" is written on one field but the operation's semantics have
split into two independent sets, the constraint belongs on the **union**, not on either field. Fixed here
with a top-level `anyOf` (see next section).

## Fastify/ajv: `anyOf` for union-style body validation (PR #1922)

"At least one of A or B non-empty" is expressible directly in the route schema — no custom preHandler, no
service-only guard. Keep the field-level `type`/`items` at the top level and add a sibling `anyOf`:

```ts
properties: { invoiceIds: { type: 'array', items: { type: 'string' } },
              depositIds: { type: 'array', items: { type: 'string' } } },
required: ['sourceId', 'invoiceIds', 'depositIds'],
additionalProperties: false,
anyOf: [ { properties: { invoiceIds: { minItems: 1 } } },
         { properties: { depositIds: { minItems: 1 } } } ],
```

Mirror the rule in the service (`if (a.length === 0 && b.length === 0) throw new ValidationError(...)`) so
the invariant holds for direct service callers too, and document it in `API-Contract.md` under a **Request
Validation Rules** heading.

**The caveat.** Fastify defaults ajv to `removeAdditional: true`. ajv's own docs warn that
`removeAdditional` combined with `anyOf`/`oneOf` is a footgun: a property can be stripped by a branch that
ultimately fails. It is safe **only** because the `anyOf` subschemas declare no `additionalProperties` (and
no `properties` beyond narrowing ones already declared at the top level) — `additionalProperties: false`
resolves against the parent's own `properties`, so nothing is removed. If a future subschema introduces its
own `properties`/`additionalProperties`, this breaks silently and shape-dependently.

So: **always pin `anyOf` body validation with route-level tests via `app.inject`**, one per branch plus the
all-fail case (PR #1922 has 400 both-empty / 200 deposit-only / 400 missing-field). Those compile the real
validator; reasoning about ajv semantics in review does not. Minor noise to ignore: `required` repeated
inside `anyOf` branches when the field is already required at top level — harmless, not worth a comment.

Not bugs, but do not let them become the copied pattern:

- `getAllMilestones`: per-row `countLinkedWorkItems` + `getCreatedByUser`
- `sourceReportService.getSourceReport` steps d/j: per-invoice deposit fetch + per-Rail-B-invoice vendor lookup (PR #1894 M1)

## CSS Modules: `:global(.x)` never matches another module's class (PR #1909, B1)

`client/webpack.config.cjs` hashes every module class (`localIdentName: '[local]_[hash:base64:5]'` prod /
`'[name]__[local]--[hash:base64:5]'` dev). So `sharedStyles.input` renders as `input_aB3xY`, and a rule like

```css
.container :global(.input) { ... }   /* DEAD -- matches a literal class "input" that never exists */
```

silently applies to nothing. It also trips stylelint's `selector-pseudo-class-no-unknown`, which is how it
surfaces (as a lint failure, masking the real defect). **The fix is always `composes:`** on a plain local
class — `composes: input from '../../styles/shared.module.css';` — then use the local class in the TSX.
That is a _different_ construct from `composes` used _inside_ a `:global` block, which is the separate,
genuinely-illegal form. `ReportContentEditor.module.css` (`composes: badge from '../Badge/Badge.module.css'`)
is the correct in-repo template.

Review heuristic: any `:global(` in a `*.module.css` referencing a class the component gets from a
`*.module.css` import is dead code. Grep for it. Corollary — CSS is untested under jsdom
(identity-obj-proxy), so a `.editedDot { opacity: 0 }` whose show-rule never matches passes a green suite
that only asserts DOM presence. Visibility assertions belong in E2E.

**The E2E guard shape that actually catches this** (`reportWizardEditableContent.spec.ts` Scenario 13, PR
#1909 round 2): resolve the token through a throwaway probe element in the page, then compare it to the
target's computed value — don't hardcode an rgb string (theme-fragile) and don't just assert "not
transparent" (passes on the page background).

```js
const probe = document.createElement('div');
probe.style.backgroundColor = 'var(--color-bg-tertiary)';
document.body.appendChild(probe);
const resolved = getComputedStyle(probe).backgroundColor; // compare against the real element
```

Ask for this whenever a CSS-Modules composition bug is the thing being fixed — it is falsifiable against a
real webpack build (class hashing included) and is the only test class that fails on dead CSS.

## Stylelint gates CI, and inline `style={{}}` escapes it

`npm run lint` = `eslint . && npm run stylelint`, and the CI `Static Analysis` job runs Stylelint as its own
step — a stylelint error is a hard beta-PR blocker. But `stylelint` only globs `client/src/**/*.css`, so
**inline `style={{ color: 'var(--nonexistent-token)' }}` in TSX is completely unchecked**. PR #1909 shipped
`var(--color-refund-text)`, a token defined nowhere; the declaration is invalid-at-computed-value and the
styling silently does nothing. When reviewing client code, grep every `var(--…)` appearing inside a `.tsx`
against `client/src/styles/tokens.css`, and push the value into a CSS Module class instead.

## Monetary units are major currency units (2 dp) everywhere in this repo — never cents

`allocatedAmount`, `allocatedPortion`, `totalAmount`, `invoiceAmount`, and everything `formatCurrency`
consumes are **euros, rounded to 2 dp**. There is a `toCents()` helper in `sourceReportService.ts` but it is
used only _inside_ a `toCents(x)/100` round-trip — it never escapes into a field.

PR #1916 (#1901) broke this across a new module seam: the service passed `inv.allocatedAmount` (euros) into
`GenerateReportContentLlmInvoice.amount`, and `prompts.ts` rendered `(inv.amount / 100).toFixed(2)` — every
figure in an AI-written bank cover letter came out **100× too small**. Root cause: the interface field had no
unit in its JSDoc. Coverage was 95.94% and green, because line coverage cannot catch a unit error — the only
test that catches it asserts the **rendered string** (`Total Amount: 12345.67 EUR`), and no test called
`buildReportContentUserPrompt` at all.

Same PR, second defect at the same spot: `Math.round(includedTotal)` (commented "round to nearest cent")
rounds to the nearest whole euro. Cent-rounding is `Math.round(x * 100) / 100`.

**Review rules that follow:**

- Any monetary value crossing a module boundary must carry its unit in the type's JSDoc.
- When a server path re-derives a total the client already derives, demand it mirror the client formula
  _shape_, not just its intent — `applyLineExclusions` rounds **per invoice** then `buildReportContent` sums
  the already-rounded values with no final round. A single trailing round is a different number.
- Grep new prompt builders for `/ 100`, `* 100`, and `toFixed(` — that is where unit assumptions hide.
- Better still: push shared derivations into `@cornerstone/shared` so there is one implementation
  (recommended as M2 on #1916; not yet done).
- When a total is exclusion-adjusted, the **per-item** figures handed to the same consumer must be adjusted
  too. #1916 shipped an adjusted total alongside raw per-invoice amounts — an LLM handed parts that do not
  sum to the stated whole. Check both halves whenever you see an exclusion filter.

Fixed in `b70d821b` (round 2 of the #1916 review); the permanent guard is the
`amount formatting (major units — regression guard for the ×100 division bug)` describe block in
`server/src/services/budgetExtraction/prompts.test.ts`, which asserts rendered substrings **and** negative
assertions against the divided form. Copy that shape for any new prompt builder.

---

## "Single source of truth" refactors must sweep the wiki, not just the code (#1931 / PR #1944)

When a story collapses a duplicated constant into one definition, the code-level sweep is the easy half.
The restatement that survives is almost always **prose in `wiki/API-Contract.md`** — and it is the most
consumer-visible one, so it is the one that must be fixed.

#1931 unified the AI report-content caps into `server/src/services/budgetExtraction/contentLimits.ts`
(`letterSubject` 150 / `letterBody` 2000 / `description` 200). The implementer found and collapsed a third
runtime site the spec had not enumerated (the `buildReportContentUserPrompt` trailing reminder). But
`API-Contract.md` still stated the removed 200/3000/300 tier in the response table **and** carried a Notes
bullet describing the two-tier divergence as *deliberate design* — worse than a stale number, because it
invites reintroduction.

**Sweep checklist for any "one definition" story:**

1. Runtime consumers (the obvious ones).
2. The **LLM structured-output schema** (`providerProfiles.ts`) and the **Fastify route schema** — both are
   plausible hiding places for a duplicated `maxLength`. Both were clean here; check anyway.
3. `wiki/API-Contract.md` response tables **and** Notes bullets. Fix in the same PR — the submodule ref must
   be committed on the feature branch.
4. Tests that assert bare literals rather than interpolating the constant (right only by coincidence).
5. Agent-memory prose in other agents' files (flag to the owner; don't edit).

**Preferred wiki fix shape:** state the numbers once, then describe the *guarantee* and point at the source
file ("both derive from `REPORT_CONTENT_LIMITS` in …"), so the page stops being an independent restatement.

**Trap:** `API-Contract.md` L3806's `truncated (500/300 chars)` is *prompt-input* truncation from
`reportContentGenerationService.ts`, numerically colliding with the old output cap and sitting a few lines
from the wrong ones. Do not "fix" it.

## Test smell: whole-prompt substring assertions with `|` alternations are toothless

Guarding an untyped system prompt with `expect(prompt.toLowerCase()).toMatch(/a|b|c/)` reliably passes on
**unrelated pre-existing text elsewhere in the same prompt**, so it does not detect the erosion it exists to
prevent. Two live examples from #1931's new guards:

- `/purpose|role/` passes on rule 4's "the report's purpose (budget overview, claim, …)" even if rule 2's
  purpose instruction is deleted entirely.
- `/vendor|invoice number|date|amount/` passes on rule 7's "vendor names" even if the whole
  "Do NOT restate the vendor name, invoice number, date, or amount" clause is deleted.

**Rule:** assert the distinctive full clause with `toContain`, the way `contentLimits.test.ts` does
(`toContain(\`Maximum ${LIMITS.description} characters per description.\`)`). Composing the prompt from named
constant blocks is over-engineering at ~15 lines — tight assertions buy the same protection far cheaper.
Also check that **every** constraint the AC enumerates has its own guard: #1931's AC 3.5 listed five, and
"never invent or alter amounts or dates" had none (the only `/invent/` assertion in the file targeted
`MERGE_SYSTEM_PROMPT`) — the one instruction protecting the single number the model still emits.

## Async writes survive state resets: `ReportWizardPage` has no request-staleness tokens

Found reviewing PR #1945 (#1943). `ReportWizardPage.tsx` fires `getSourceReport` (in `handleSourceChange`)
and `generateReportContent` (in `runAiGeneration`) with **no abort and no monotonic request token**. Clearing
state in a handler therefore does not stop an already-in-flight fetch from re-populating exactly what was
just cleared.

Two live consequences after #1943's fix:

- **Out-of-order report fetch.** `A = getSourceReport(oldUseCase, src)` in flight -> user changes use case
  (reset clears `report`) -> user re-picks the source -> `B = getSourceReport(newUseCase, src)`. If A settles
  after B, `setReport(A)` wins while `sourceId` is set and `maxReachedStep === 3` — the exact #1943 end state
  (quotation-tier docs in a claim export). Different report types over the same source have different
  server-side filtering, so A finishing last is plausible.
- **In-flight AI generation.** `aiContent` is `null` while generating, so `guardedUpdate`'s dirty predicate is
  false and a use-case change applies with **no discard confirmation**; the result then lands via
  `setAiContent` and `applyAiContent` puts it on the next report. Not symmetric with a source change — the
  request carries `type: useCase` and (post-#1931) a purpose-focused prompt, so the narrative is written for
  the *wrong report purpose*, not merely the wrong source.

**Fix shape:** `const reqRef = useRef(0)` — increment + capture at the top of every handler that starts a
fetch, bail in `.then`/`.catch` if `reqRef.current !== captured`.

**Root cause, and the thing to actually push on:** 38 `useState`/`useRef` hooks in a 1,156-line component,
with "what a transition invalidates" hand-maintained across two handlers that must stay in sync. #1943 was
that failure mode; its `deepLinkAppliedRef` second-order effect was the failure mode of patching it with a
boolean ref. Recommend `useReducer` with `SELECT_USE_CASE` / `SELECT_SOURCE` / `REPORT_LOADED(requestId)`
so the KEEP list and the staleness guard become structural instead of a code comment.

**Reviewer heuristic, generalizable:** when a fix's remedy is "clear state X", always enumerate *every write
path into X* — effects re-armed by the cleared value (the deep-link `!report` case), and pending promises
that will write X later. The first is usually caught; the second usually isn't.

## One-shot effect guards: prefer `useRef<string | null>` over `useRef<boolean>`

`deepLinkAppliedRef` (#1943 AC8) is a bare boolean, safe only because `?sourceId=` has exactly one producer
(`BudgetSourcesPage.tsx:1318`, a `navigate()` from a *different* route, so always a remount) and
`ReportWizardPage` never calls `setSearchParams`. That fact lives nowhere but a code comment. Storing the
*applied value* instead of a boolean costs nothing and survives a second same-route producer being added.

Unremarked side benefit worth knowing: the ref also closed a latent pre-existing hazard — when a deep-link
fetch *failed*, `report` stayed `null`, so any later `overrides`/`aiContent` change re-identified
`guardedUpdate` -> `handleSourceChange` -> the effect's deps and silently re-fired the fetch.

## Cross-reference rot in "documented bound" comments (#1939 / PR #1948)

`client/src/lib/reportPdf/` encodes safety bounds nobody can re-derive from the code, so the *comments are
the interface*. Three failure modes seen repeatedly there — check all three whenever a review touches a
commented constant:

1. **A comment that cites another comment.** `WORST_CASE_CHAR_ADVANCE_EM` said the height ceilings were
   "pinned ... using the true widest character (see those constants' comments)"; those comments said the
   measurement used `№` and carried different percentages on a different denominator (char count, not page
   height). Always follow the pointer and read the target.
2. **Superseding a measurement basis without sweeping the callers.** Naming a new widest glyph (`Ѹ` U+0478)
   silently falsified `MAX_SAFE_USAGE_CHUNK_CHARS`'s "'№' ... the widest character found in the scan".
   `grep` for the old basis before accepting the new one.
3. **A cost figure that describes a change already made.** "Raising this would push the 7-col threshold from
   19 to 16" — 19 was its value at the *previous* em (0.89); 16 is current. Recompute every quantitative
   justification from the constant's present value, don't trust the prose.

**Reviewer move that catches all three cheaply:** recompute the thresholds in `node` across a range of the
constant, and diff against the test's asserted values (`overviewPdf.test.ts` asserts usage7=16, usage6=22,
vendor=5, small7=14, small6=19 at em=1.04). Also verify glyph/codepoint pairs programmatically — `Ҭ` was
labelled U+046C when it is U+04AC.

**My own figures are not exempt.** Both HIGH findings in PR #1948 traced to numbers I supplied in the #1929
round-4 review and the PO transcribed faithfully into ACs. When a later PR exists only to make my
recommendations true, re-derive them from scratch rather than checking transcription fidelity.
