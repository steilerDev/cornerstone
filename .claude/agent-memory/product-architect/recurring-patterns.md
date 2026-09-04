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

### Forked _test harness_ — `realRender.test.ts` re-implements merge.ts's docDefinition

`renderOverviewPdfContent` (`client/src/lib/reportPdf/realRender.test.ts` ~L136-159) hand-copies
production's pdfmake `header:`/`footer:` callbacks while its own docstring claims parity with merge.ts
("never hand-copied — #1929 AC11"). It imports `pageMargins`/`styles` but forks the callbacks. PR #1982
changed `merge.ts`'s header string and left the harness on the old expression, so every multi-page
real-render test (incl. the 3-page long-`sourceName` clipping test) measures a string production no
longer emits. **Whenever `merge.ts`'s docDefinition changes, grep this helper.** Fix direction: pass
`content` and build the same string, rather than re-deriving it.

### Proxy bound looser than the production threshold it guards

PR #1982's AC7 tests bound DE header labels at `floor(width / 5.19pt)` (an _average_ glyph advance) —
8/9 chars — while production's own break trigger is `safeTokenChars(width, HEADER_WORST_CASE_CHAR_WIDTH_PT
= 10.4pt)` = 4 chars. An 8-char wide-glyph label passes the test and still breaks in the PDF. When a test
re-derives a width/size bound instead of importing the production constant, check which direction the
error runs: a bound _looser_ than production's greenlights the regression it exists to catch. The real
guard there is the renderer-level `positions.length === 1` assertion.

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

1. Grep both suites for the endpoint. If the client test mocks the API client, it is _not_ contract coverage.
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
bullet describing the two-tier divergence as _deliberate design_ — worse than a stale number, because it
invites reintroduction.

**Sweep checklist for any "one definition" story:**

1. Runtime consumers (the obvious ones).
2. The **LLM structured-output schema** (`providerProfiles.ts`) and the **Fastify route schema** — both are
   plausible hiding places for a duplicated `maxLength`. Both were clean here; check anyway.
3. `wiki/API-Contract.md` response tables **and** Notes bullets. Fix in the same PR — the submodule ref must
   be committed on the feature branch.
4. Tests that assert bare literals rather than interpolating the constant (right only by coincidence).
5. Agent-memory prose in other agents' files (flag to the owner; don't edit).

**Preferred wiki fix shape:** state the numbers once, then describe the _guarantee_ and point at the source
file ("both derive from `REPORT_CONTENT_LIMITS` in …"), so the page stops being an independent restatement.

**Trap:** `API-Contract.md` L3806's `truncated (500/300 chars)` is _prompt-input_ truncation from
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
"never invent or alter amounts or dates" had none (the only `/invent/`assertion in the file targeted`MERGE_SYSTEM_PROMPT`) — the one instruction protecting the single number the model still emits.

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
  the _wrong report purpose_, not merely the wrong source.

**Fix shape:** `const reqRef = useRef(0)` — increment + capture at the top of every handler that starts a
fetch, bail in `.then`/`.catch` if `reqRef.current !== captured`.

**Root cause, and the thing to actually push on:** 38 `useState`/`useRef` hooks in a 1,156-line component,
with "what a transition invalidates" hand-maintained across two handlers that must stay in sync. #1943 was
that failure mode; its `deepLinkAppliedRef` second-order effect was the failure mode of patching it with a
boolean ref. Recommend `useReducer` with `SELECT_USE_CASE` / `SELECT_SOURCE` / `REPORT_LOADED(requestId)`
so the KEEP list and the staleness guard become structural instead of a code comment.

**Reviewer heuristic, generalizable:** when a fix's remedy is "clear state X", always enumerate _every write
path into X_ — effects re-armed by the cleared value (the deep-link `!report` case), and pending promises
that will write X later. The first is usually caught; the second usually isn't.

## One-shot effect guards: prefer `useRef<string | null>` over `useRef<boolean>`

`deepLinkAppliedRef` (#1943 AC8) is a bare boolean, safe only because `?sourceId=` has exactly one producer
(`BudgetSourcesPage.tsx:1318`, a `navigate()` from a _different_ route, so always a remount) and
`ReportWizardPage` never calls `setSearchParams`. That fact lives nowhere but a code comment. Storing the
_applied value_ instead of a boolean costs nothing and survives a second same-route producer being added.

Unremarked side benefit worth knowing: the ref also closed a latent pre-existing hazard — when a deep-link
fetch _failed_, `report` stayed `null`, so any later `overrides`/`aiContent` change re-identified
`guardedUpdate` -> `handleSourceChange` -> the effect's deps and silently re-fired the fetch.

## Cross-reference rot in "documented bound" comments (#1939 / PR #1948)

`client/src/lib/reportPdf/` encodes safety bounds nobody can re-derive from the code, so the _comments are
the interface_. Three failure modes seen repeatedly there — check all three whenever a review touches a
commented constant:

1. **A comment that cites another comment.** `WORST_CASE_CHAR_ADVANCE_EM` said the height ceilings were
   "pinned ... using the true widest character (see those constants' comments)"; those comments said the
   measurement used `№` and carried different percentages on a different denominator (char count, not page
   height). Always follow the pointer and read the target.
2. **Superseding a measurement basis without sweeping the callers.** Naming a new widest glyph (`Ѹ` U+0478)
   silently falsified `MAX_SAFE_USAGE_CHUNK_CHARS`'s "'№' ... the widest character found in the scan".
   `grep` for the old basis before accepting the new one.
3. **A cost figure that describes a change already made.** "Raising this would push the 7-col threshold from
   19 to 16" — 19 was its value at the _previous_ em (0.89); 16 is current. Recompute every quantitative
   justification from the constant's present value, don't trust the prose.

**Reviewer move that catches all three cheaply:** recompute the thresholds in `node` across a range of the
constant, and diff against the test's asserted values (`overviewPdf.test.ts` asserts usage7=16, usage6=22,
vendor=5, small7=14, small6=19 at em=1.04). Also verify glyph/codepoint pairs programmatically — `Ҭ` was
labelled U+046C when it is U+04AC.

**My own figures are not exempt.** Both HIGH findings in PR #1948 traced to numbers I supplied in the #1929
round-4 review and the PO transcribed faithfully into ACs. When a later PR exists only to make my
recommendations true, re-derive them from scratch rather than checking transcription fidelity.

## E2E: the report wizard's cover letter auto-enables only for sources with contact/reference (#1932 / PR #1951)

`ReportWizardPage.tsx` sets `setIncludeCoverLetter(Boolean(r.source.contactAddress || r.source.reference))`
on report fetch, and `reachStep5()` in `e2e/tests/budget/reportWizardEditableContent.spec.ts` never clicks
`includeCoverLetterCheckbox`. `createBudgetSourceViaApi` defaults **only** `sourceType`/`status`.

So a scenario seeding `{name, totalAmount}` alone gets `content.coverLetter === null`, no
`[class*="coverLetterCard"]`, and every `wizard.letterField(...)` locator resolves to **zero elements**.
The failure is asymmetric and easy to miss in review:

- `await expect(resetButtonFor(field)).not.toBeVisible()` **passes vacuously** on 0 elements;
- `editField(field, v)` (→ `field.fill()`) then times out.

**Reviewer move:** for any E2E scenario touching `letterField`/`coverLetterCard`, grep its
`createBudgetSourceViaApi` seed for `contactAddress`/`reference` before anything else. All pre-existing
letter scenarios seed both. Same class as the "vacuously-passing negative assertion" smell already listed
above — a `.not.toBeVisible()` that can pass because the element never existed proves nothing.

## pdfmake: `.positions` is the post-render line count; `._inlines` drains to `[]` (#1932)

For "did this text node really render N visual lines" assertions in `realRender.test.ts`:

- `LayoutBuilder.js` L1183 `node.positions.push(this.writer.addLine(line))` runs **once per rendered line**
  inside `processLine`'s loop, with `node` bound to the text node; `decorateNode()` L1279 inits
  `node.positions = []`. So `positions.length` === visual line count, and `positions[i].top` gives spacing.
- `._inlines` looks like the natural source (DocMeasure sets it) but LayoutBuilder consumes it as a queue
  (see the `unshift` on the reflow path, L1174) — it is `[]` by the time `getBlob()` resolves.
- An **empty** text node reserves a full line height (~18pt at 11pt/1.4) — it is not collapsed. This is why
  the cover letter's signature block can be emitted unconditionally with no NBSP workaround, and also why
  the `{ text: '', pageBreak: 'after' }` sentinel costs a real line.

Caveat when reviewing such a proof: line-count + uniform-gap catches collapse/doubling/per-token reflow,
but **not** content rewrites that preserve line count. Insist on `expect(node['text']).toBe(input)`
alongside the count.

## usePreferences has no shared store — and several fixes silently depend on that (#1955, PR #1960)

`usePreferences()` (`client/src/hooks/usePreferences.ts:20`) holds `preferences` in a **private
`useState` per call site** — no context, no shared cache. Every consumer issues its own
`GET /api/users/me/preferences` on mount, and `upsert`'s optimistic `setPreferences` (`:67`/`:71`)
allocates a **fresh array** each time, which re-triggers any effect with `[preferences]` in its deps.
That echo is the mechanism behind #1955.

Current writers, all disjoint — verify before trusting any "no other writer" claim:

| key                       | writer                        | path                                             |
| ------------------------- | ----------------------------- | ------------------------------------------------ |
| `table.<pageKey>.columns` | `useColumnPreferences.ts:115` | via `usePreferences.upsert`                      |
| `theme`                   | `ThemeContext.tsx:101,133`    | **direct** `upsertPreference`, bypasses the hook |
| `locale`                  | `LocaleContext.tsx:105,137`   | **direct** `upsertPreference`, bypasses the hook |
| `dashboard.hiddenCards`   | `DashboardPage.tsx:404,418`   | its own separate `usePreferences()` instance     |

`remove`/`refresh` are exposed but consumed by **no** component; `deletePreference` is only wrapped at
`preferencesApi.ts:28`. So there is no "reset all preferences" path either.

**The trap:** PR #1960's `localAuthorityKeyRef` guard (ignore all store echoes for a key after the first
local edit) is only safe _because_ the store is per-instance. Introducing a `PreferencesContext` — an
attractive refactor, since it would drop the duplicate GETs — would make external writes and `refresh()`
silently invisible to `useColumnPreferences`, **with no test failing**. If you ever design that store,
revisit the guard first. Same shape as the forked-function drift entry above: correctness resting on an
architectural accident nobody wrote down.

Also relevant when reviewing this hook: all six `pageKey`s are string literals used exactly once
(`vendors`/`users`/`householdItems`/`invoices`/`workItems`/`milestones`), so `preferenceKey` is constant
per mounted instance and two instances can never contend on one key. That collapses most key-switch and
cross-instance edge cases — but it is a fact about the six call sites, not an enforced invariant.

## Reviewing a client-side serialized write queue (PR #1960)

The invariant to check in an `isSaving` flag + `while (pending)` drain loop is **where the suspension
points are**, not the flag logic. If (a) `await` resumption → `while` re-check and (b) loop exit →
`finally { flag = false }` are each synchronous with no intervening `await`, then there is no window
where the flag is set but newly-queued work goes unobserved, and none where it is clear while a write is
in flight. That is the whole proof. Two corollaries worth asserting in review:

- **Debounce + queue does not storm.** The timer still needs a quiet period before any drain fires, and
  a _replace_-semantics pending slot coalesces bursts, so the ceiling is one write per round-trip. Under
  a slow network such a queue sends strictly **fewer** requests than independent per-timer sends.
- **`void asyncFn()` where `asyncFn` catches internally removes an unhandled-rejection path** that a bare
  `void promise` had. Ask for a `process.on('unhandledRejection')` assertion rather than reasoning about it.

Ordering claims: a client queue genuinely fixes server-side out-of-order application only if the next
write is not _dispatched_ until the previous response is back (i.e. `await` wraps the HTTP call, not just
the local state update). Check that, or the fix only narrows the window.

## Capability retained in code, disabled at the producer, documented by comment (PR #1959)

Three instances in one PR, all the same shape — **a type permits a state the producer can never emit, and the
constraint is enforced by a comment instead of by the type**:

- `ReportContent.footnotes` is now unconditionally `[]`, yet 4 consumers still branch on / copy it. The E2E
  page object had to add a prose warning ("never assert a positive count on these").
- `applyOverrides` still honours `row.<id>.attachmentsNote` with **no producer left** (editor field removed;
  overrides are ephemeral wizard state — no server persistence, nothing in migrations 0001-0044; and
  `applyAiContent` only writes `usageText` + cover-letter fields).
- Column-visibility toggles labelled `Show/hide columns` that affect the preview but **not** the exported PDF.

Rule: **delete rather than comment.** A write path with no reader and no producer is how the #1929
round-3/round-4 confusion started — the code said one thing and the comment said another. When triaging a
"keep it as a capability?" question, check for a _producer_ first: no producer => dead, remove it.

## Reinstating a removed producer breaks the negative guards left behind (#1965 / PR #1979)

The exact inverse of the pattern above, and it bites one story later. #1959 removed the `content.footnotes`
producer and left **negative-only guards plus a prose directive**: `ReportWizardPage.ts` said "NOTHING
populates `content.footnotes` … Never assert a positive count on these", and Scenario 18 asserted
`footnotesBlock/footnoteItems` count 0 + the sentence absent from `main`. #1965 restored the producer with a
3-line push in `buildReportContent.ts` — and silently turned a green 3-viewport E2E scenario red.

**Review rule for any "reinstate / re-enable X" PR:** `grep` the whole repo (especially `e2e/pages/*` and
spec-file header docstrings) for assertions and _directives_ that pin X's absence. A PR that adds a producer
without inverting those is incomplete, and because `E2E Gates` is `main`-only it merges green into `beta` and
surfaces only at promotion (see [[merge-gate-vs-done-gate]] / the beta-merges-past-red-E2E trap).

Corollary: a stale POM docstring is worse than a stale code comment — it is an instruction later agents obey.
Inverting the E2E assertion usually also discharges the story's "count occurrences in the rendered DOM" AC, so
it is the same edit, not extra work.

## Staleness tokens: the `finally` block is the hole (#1946 / PR #1977)

A monotonic-token guard (`if (ref.current !== token) return;` in `.then`/`.catch`) does **not** protect a
`finally` block — `return` inside `try` still runs `finally`. So `finally { setIsLoading(false) }` lets an
_abandoned_ request clear a flag that a _newer_ request now owns.

PR #1977 shipped exactly this in `runAiGeneration`: discard-confirm bumps the token and clears
`isGeneratingAi`; the user starts a second generation; the first one resolves ~seconds later, bails at the
token check, and its `finally` stops the second one's spinner, re-enables the trigger button, **and drops
`isGeneratingAi` out of `guardedUpdate`'s dirty predicate — reintroducing the very bug the PR fixed**, one
discard later. Note the `finally` was safe _before_ the token existed (the button gated concurrency), so this
is a defect introduced by widening the lifecycle without widening the flag's ownership check.

**Review rules for any staleness-token PR:**

1. Read the whole `try/catch/finally`, not just the two guard lines. Every side effect in `finally` needs the
   same `ref.current === token` condition.
2. Ask "can a _second_ request now overlap the first?" A token bump usually re-enables a trigger that
   concurrency was previously gated on. Demand a test that starts request B while A is still pending and
   asserts A's arrival changes **nothing** — the new-describe blocks in these PRs test only A-alone.
3. Anything derived from the flag (elapsed-seconds timers, disabled states, and especially **dirty
   predicates**) inherits the bug. Enumerate the flag's readers: `grep -n <flag>` and check each.
4. `reportRequestRef` in the same file is the clean template precisely because it has no `finally`.

Related: the conditional `if (isGeneratingAi)` inside a `pendingChangeRef` closure reads the value captured
at guard time, not at confirm time. Idempotent invalidation (always bump, always clear) removes the
stale-closure reasoning for free — prefer it.

**Resolved in round 2** (`83afc72f`): `finally { if (aiGenerationTokenRef.current === token) setIsGeneratingAi(false) }`,
plus a two-controlled-promise test (start A, discard, start B, resolve A → assert still-disabled, resolve B →
assert content). Rule 2's "demand a test that starts B while A is pending" is what produced that test — keep asking.

## Discard/confirm dialogs: conditionalize the title, not just the body

Same PR: the body got an accurate in-flight variant, the title stayed `"Discard your edits?"` in the case
where no edits exist — and the AC5 test asserted that title, pinning the inaccuracy. When an AC says "copy
must not claim edits exist that do not", the title is copy and it is the most prominent line. Check every
string in the modal, and check the test isn't locking in the wrong one.

Round-2 fix pattern worth reusing: select the title with the **byte-identical predicate expression** already
used for the body, not a re-derived equivalent — a copied-and-tweaked predicate is exactly how the two drift
apart again.

### A conditional modal title breaks E2E page-object dialog locators

Playwright POMs address dialogs by accessible name (`page.getByRole('dialog', { name: 'Discard your edits?' })`,
`e2e/pages/ReportWizardPage.ts`), so making a title conditional silently narrows that locator to one branch.
In PR #1977 nothing broke — the only E2E usage opens the modal _after_ generation resolved, so the old title
still renders — but the POM docstring now documents the title as unconditional, and the next test that opens
the modal mid-generation will fail to find the dialog. **Whenever a PR conditionalizes any modal/heading string,
grep `e2e/pages/` for the literal** and flag the locator + docstring as an e2e-test-engineer follow-up. Same
family as the cross-reference-rot entry: a POM docstring is a contract surface, not a comment.

## Verify the AC record when a PR reverses a recently-shipped story (PR #1959)

#1959 reversed #1923's AC1.1/1.2/2.3/2.4 **one day** after #1923 shipped (2.13.0-beta.38, 2026-08-02), while
#1923 stayed CLOSED with those ACs marked delivered — so the record asserted two contradictory behaviours were
both correct on `beta`, and the pending promotion PR would have summarized reversed ACs as delivered.

Tell: the reversing issue had **zero comments**, no `**[product-owner]**` header, no numbered ACs (its body was
a PR-style summary), and no ux-designer visual spec — whereas the story it reversed had all four. **A
requirements reversal authored as a polish issue is the signature.** Cheap fix: PO supersession comment on the
old issue + PO ratification on the new one. Check this whenever a PR deletes user-visible report/document
content — and check whether the replacement text preserves _meaning_ (`(abzgl. Abschlag)` lost the footnote's
"claimed separately", which is compliance-relevant in a bank-facing document).

## Enumerated multi-site doc fixes come back half-done (PR #1979 r2)

When a review finding names N sites for the same stale claim, expect the fix commit to update the _nearest_
ones and miss the rest. #1979's HIGH 2 named four sites for "nothing populates `content.footnotes`"; the fix
updated the field-declaration comment and the spec header (both adjacent to the changed assertions) and left
the two class-docstring paragraphs — which contained the strongest form ("they can never be populated by the
current code path, and any test asserting a footnote `<li>` is asserting a superseded design").

Two habits that follow:

- **Re-grep the literal on re-review**, never trust the fix commit's diff to cover the enumeration. One
  `grep -n -i footnote e2e/pages/ReportWizardPage.ts` found both misses instantly.
- **Check the test _name_, not just the body.** #1979 inverted Scenario 18's assertions to `toHaveCount(1)`
  but left the Playwright title reading "and no footnote list anywhere on the page". A title that states the
  inverse of its body is worse than a stale comment: it renders that way in every CI report and is the first
  artifact a future reader uses to conclude the _body_ drifted. Same for the `// Scenario NN:` block header.

Why this is worth blocking on (I did, r2): the POM class docstring is the contract the spec header points at
("See `ReportWizardPage.ts`'s class docstring for the full locator reference"), so a directive there plus a
lying test title is a complete instruction set for deleting the coverage the PR exists to add — and with
`E2E Gates` main-only, that deletion lands on `beta` silently. It is the same mechanism that produced #1965:
#1959 removed a producer and left comments asserting the removal was permanent.

## Amount-threshold booleans silently narrow status-existence booleans (PR #1984, #1897)

When a deposit-blind SQL helper is collapsed into the shared deposit-aware path, the _money_ fields
(`actualCost`, `actualCostPaid`) port cleanly but any **boolean** flag does not. #1984 re-derived
`hasClaimedInvoice` from `actualCostClaimed > 0` where the old SQL used
`COUNT(CASE WHEN i.status = 'claimed' ...) > 0`. Those are different predicates:

- **Gains** the intended case (pending invoice + claimed deposit → `true`).
- **Loses** a claimed invoice whose deposits fully cover it with non-claimed status: `residualFraction`
  is 0 in `splitByDeposits`, so the claimed residual contributes nothing and the flag flips to `false`.
- **Loses** a refund-neutralised claim (refunds carry a negative fraction, netting the bucket to 0).

Fix shape: derive booleans from statuses on the raw rows, never from a post-split amount —
`rows.some((r) => r.invoice_status === 'claimed' || r.deposit_status === 'claimed')`. Strict superset of
the old predicate, threshold-free, so rounding and refunds cannot flip it.

**Why this is worth blocking on**: the flag's only consumer was `MassMoveModal`'s `claimedCount`, which
gates the "I understand" confirmation before mass-moving bank-claimed lines. A display-parity bug fix
quietly disabled a safety confirmation. Generalise: before accepting a boolean's re-derivation, find its
consumers — if any is a guard rail rather than a label, demand predicate equivalence, not "the tests pass".

**Companion test smell**: every pre-existing claimed-invoice test used an invoice with **no deposits**, so
`residualFraction === 1` and the two predicates coincide. A whole suite can agree with a wrong predicate
because no case exercises the branch where they differ. Ask "which fixture makes the old and new
definitions disagree?" and require exactly that fixture.

## Prettier is not CI-gated — the local gate is the only gate

`static-analysis` in `.github/workflows/ci.yml` runs `npm audit signatures`, `npm run typecheck`, and
Stylelint. No `format:check`, no ESLint. So `npx prettier --check <changed files>` on review is worth the
ten seconds: #1984 shipped two violations (a 101-char inline return type, and a rider edit left
artificially wrapped after the expression shortened) that nothing downstream would have caught.

## Positive membership on a _shared fixture_ row is not a filtering assertion (#1971, PR #1985)

The stock "fix" for `expect(rows.length).toBeGreaterThan(0)` is to add
`expect(await getUserRow(TEST_ADMIN.email)).not.toBeNull()`. That closes nothing: the shared admin/fixture
row is present in the **unfiltered** list too, so the assertion passes verbatim when the filter is a no-op.
A filtering assertion needs one of:

- a **universal negative** — loop every rendered row and assert it contains the query, or
- a **seeded non-matching row** asserted absent (the shape the `filters by email` rewrite in #1985 got right).

Watch for the comment that ships alongside it claiming the new positive check "makes the `> 0` guard
meaningful" — a documented-but-false guarantee is worse than the bare `> 0`, because the next maintainer
stops looking. Block on the comment/code conflict even if the assertion itself is a mild improvement.

Detail that bites when writing the universal-negative loop: `UserManagementPage.tsx` filters on
`displayName || email`, so assert on `` `${cells[0]} ${cells[1]}` `` — a name-cell-only check produces false
failures for rows that matched by email. Join the cells with a **space**: a query with no space in it cannot
then be matched by bridging two adjacent cells, so no false positives.

Ranking the two remedies (settled on PR #1985 round 2, APPROVED): the universal-negative loop is only
discriminating when the table happens to contain a non-matching row. `e2e/playwright.config.ts` sets
`fullyParallel: true` across 16 shards and `e2e/fixtures/seed.ts` seeds only the setup admin, so a test can
land in a shard whose user table is nearly empty and a broken filter still passes vacuously. Treat the loop
as sufficient-to-approve (it can no longer pass while wrong rows render) but the **seeded non-matching row**
as the airtight form; ask for it as a follow-up, not a block.

Positional cell indices (`cells[0]`/`cells[1]`) are coupled to `useColumnPreferences(pageKey, columns)`,
which persists both visibility **and** order. No E2E test toggles columns on `/settings/users` today and the
POM's `getUserRow` already assumes `td` nth(1) === email, so it is currently consistent — but a future
column toggle silently repoints those loops at role/date text. Prefer POM accessors resolved from header
text when this comes up again.

E2E-only PRs: `Detect Changes` skips Static Analysis, unit shards, and Trailer Check, and `Quality Gates`
runs smoke only — so the changed spec's real result lives in the 16 `E2E Tests (Shard n/16)` runs, which are
non-gating on beta. Always tell the orchestrator to confirm the relevant shard is green on **that PR** before
merging (see MEMORY.md's "Beta merges past red E2E").

## E2E user "cleanup" never frees the email — DELETE /api/users is a soft delete

`server/src/routes/users.ts` DELETE sets `deactivatedAt`; `userService.listUsers` returns deactivated rows
and the user-management page applies no default status filter. So `deleteUserViaApi` leaves the row visible
for the rest of the run, and `POST /api/users` still 409s on that email (`findByEmail` does not exclude
deactivated users). Consequences for review:

- A `finally`-block "delete" comment claiming the DB is left clean is wrong — say _deactivated_.
- Deterministic seed emails (`${testPrefix}@…`) are one-shot per DB. Currently masked because Playwright
  gives a retried test a fresh `workerIndex` (so `testPrefix` differs), but `--repeat-each` or a switch to
  `parallelIndex` would make `createLocalUserViaApi`'s `expect(response.ok())` fail and mask the real
  failure. Require `${testPrefix}-${Date.now()}@e2e-test.local` (precedent: `i18n-categories.spec.ts`).
- `deleteUserViaApi` ignores the response status, so cleanup failures in this family are always silent.

## `page.route()` matcher traps in e2e specs (PR #1986)

Two independent ways a route-interception assertion becomes vacuous, both invisible to CI:

1. **`API` is an object map**, not a string (`e2e/fixtures/testData.ts:39`). ``page.route(`${API}/users/me/preferences`)`` interpolates to the glob `[object Object]/users/me/preferences`, which matches nothing — so `expect(captured).toHaveLength(0)` passes forever. The repo convention is `` `**${API.<key>}` `` (property access + `**` prefix); `reportWizardEditableContent.spec.ts:969,998` do it right. ESLint's `restrict-template-expressions` would flag it but **CI runs no ESLint** (`static-analysis` = `npm audit signatures` + `typecheck` + `Stylelint` only).
2. Any **negative** route assertion (`toHaveLength(0)`, `not.toHaveBeenCalled`) is indistinguishable from a broken matcher. Always require the author to prove the matcher fires once (assert `1` against a deliberate request, then invert) before accepting the guard.

## "Runs at all three viewports" is false unless the test is `@responsive`-tagged

`e2e/playwright.config.ts`: `tablet` (iPad gen 7, 810px, webkit) and `mobile` (iPhone 13, 390px, webkit)
projects both set `grep: /@responsive/`. An untagged test runs **desktop only** — reject any AC/docstring
claiming multi-viewport coverage without `{ tag: '@responsive' }`.

Adding the tag is not a free fix when the component has a **dual layout in the DOM**: `ReportContentEditor`
renders both a `<table>` and a `.mobileCardList`, CSS-gated at `@media (max-width: 767px)`. `display: none`
drops the table from the a11y tree, so `getByRole('columnheader')` is 0 at mobile _regardless of state_ —
`toHaveCount(0)` passes vacuously and `toHaveCount(1)` fails. Layout-dependent assertions must branch on
viewport (assert `.mobileCardRow` captions at mobile). Scenario 1b in that spec is the precedent guard.

Related smell from the same PR: a test **title** naming behavior the body never asserts ("reset on remount",
"`<td>` cells" when only `<th>` is checked) — a coverage illusion; trim the title or add the assertions.

### Accessible-name locators: what they are and are not immune to (#1966 round 3)

`getByRole(..., { name })` computes the name from **DOM text**, so it is immune to CSS `text-transform` —
the opposite of `innerText`/`toHaveText` assertions, which fail on transformed labels. Prefer the role+name
form when a component may style its casing.

Two follow-on facts worth reusing:

- An embedded control inside a name-from-content traversal contributes its **value**, not its `aria-label`.
  So an `EditableField` whose `ariaLabel` interpolates a neighbouring column's text cannot inflate the
  containing cell's accessible name (and `exact: true` guards even if it could).
- `role=cell` / `role=columnheader` exposure depends on the table keeping table semantics — a `display: block`
  or `display: flex` on the `<table>` strips them in Chromium and silently zeroes such locators. Before
  trusting a new `cell` assertion, confirm a sibling `columnheader` assertion already passes in CI; both rest
  on the same exposure.

Absence assertions need a **positive baseline in the same test** (`toHaveCount(1)` before, `toHaveCount(0)`
after). Without it, a typo'd or mis-scoped locator makes the absence check pass on nothing. With it, every
mis-scoping fails loudly instead — that property is the review bar, not the assertion count.

### Single-occurrence guard tests prove nothing about delimiter pairing (#1952, PR #1987)

A "false-positive guard" test that feeds the sanitizer **one** unpaired delimiter cannot detect that the
regex pairs up **two** unpaired ones. `stripMarkup`'s guards were `'value_field without close'` (one `_`)
and `'Price: 5 EUR* (VAT incl.)'` (one `*`) — both green while `budget_line_id` -> `budgetlineid`,
`RE_2024_117` -> `RE2024117`, and `'5 EUR* … 10%* …'` -> both stripped. When reviewing any
strip/sanitize/unescape regex, the question is not "is there a guard test?" but **"is there a guard test with
two or more of the delimiter on one line?"**

The fix is CommonMark's flanking rules, and they are the right reference for any markdown-ish stripper:
opening delimiter must be followed by non-space, closing preceded by non-space, and `_` must additionally
not be intraword (CommonMark disables intraword `_` emphasis precisely because of snake_case and e-mails):
`/(?<![A-Za-z0-9])_(?=\S)([^_\n]*[^\s_]|\S)_(?![A-Za-z0-9])/g`.

### German-locale ordinals collide with markdown numbered-list markers (#1952)

`^(?:\d+[.)]) ` at a line start cannot distinguish a `1. ` list marker from a German ordinal or date —
German writes both with a trailing period. `'15. Mai 2026 wurde die Rechnung gestellt.'` loses the **day**;
`'2. Rate in Höhe von …'` loses the instalment number. This is a **locale-specific** trap that English-only
test fixtures never surface, and it is live for anything parsing LLM prose in this product (the reports are
bank-facing German letters).

Conservative resolution: strip a numbered marker only inside a **run of >=2 consecutive numbered lines**
(a lone marker is an ordinal, not a list). Bullet markers (`- `/`* `/`+ `) stay unconditional — a leading
`- ` is not idiomatic prose. Document the asymmetry in the JSDoc so a later reader does not "harmonize" it.

### Two ACs in direct tension, silently resolved (#1952 AC 1.2 vs AC 2.5)

AC 1.2 mandated stripping `1. `/`1) `; AC 2.5 mandated compliant plain prose pass through **byte-identical**.
These cannot both hold for German prose. The implementation picked 1.2 without recording the trade-off.
When an issue states a preference ordering in prose ("conservative stripping matters more than exhaustive
stripping… when in doubt, leave the text alone"), that prose **is** the tie-breaker — read the issue's
narrative sections, not just the checkbox list, before accepting an AC-satisfying implementation.

### Validate a proposed regex fix before writing it into the review

For any non-trivial regex fix spec, transcribe the current + proposed implementation into a throwaway
`/tmp/*.mjs`, and assert the proposed version against (a) every existing test case, (b) the new false
positives, and (c) the issue's Verification scenarios. PR #1987's spec was validated 45/45 this way, which
turns "here is a suggestion" into "here is a drop-in that breaks no existing test" — the difference between
one fix round and three.

### Strip-order tests need a `toBe`, not just a `toHaveLength`

To pin "strip runs before truncate", the boundary fixture `'**' + 'X'.repeat(limit) + '**'` yields a
`limit`-length string under **both** orderings (`'X'.repeat(limit)` vs `'**XXX…'`). Only the `toBe` assertion
discriminates. Good pattern to reuse; also a reminder that a length assertion alone is often vacuous.

### A bumped submodule ref is not a pushed wiki commit (PR #1987)

PR #1987 had the parent ref bumped to a wiki commit that was **never pushed** — the wiki remote was two
commits behind. `git -C wiki log --oneline` shows the commit as HEAD, so the wiki _looks_ published, and
`git ls-tree HEAD wiki` matches it, so the ref _looks_ correct. Anyone cloning the branch and running
`git submodule update` would fail on an unresolvable ref.

Verify with `git -C wiki ls-remote origin master` compared against `git ls-tree HEAD wiki` — those are the
only two facts that matter. **Do not** trust `git -C wiki fetch origin master` here: without an explicit
refspec it only writes `FETCH_HEAD` and leaves `refs/remotes/origin/master` stale, which initially made the
remote look already-current. Use `git -C wiki fetch origin master:refs/remotes/origin/master`, or `ls-remote`.

Add this to every PR review touching `wiki/`. "The ref is bumped on the branch" is a weaker claim than it
sounds — I asserted AC 4.1 satisfied on that basis before catching it.

### Shared worktrees: never `git add -A` (PR #1987)

`fix-1913-1952-server-tests` had ~48 dirty files from concurrent agents plus the known repo-wide prettier
union-type drift (`shared/src/types/{dependency,diary,document,subsidyProgram}.ts` — the same four every
time). Stage explicit paths only: for a wiki/ADR change that is `git add wiki .claude/agent-memory/<self>`
and nothing else. A scoped ref-bump commit does not disturb an implementer mid-edit in the same tree.

### Shell heredocs: a bare `cat >> file` with no redirect hangs the tool

`cat >> a.md 2>/dev/null || true` followed by a second `cat >> b.md <<'EOF'` — the heredoc binds to the
_second_ cat, so the first reads stdin and blocks until the 120s timeout. Prefer the Edit/Write tools for
appending to memory files; if you must use bash, one heredoc per command and never a redirect-less `cat`.

### `Pick<State, 'a'|'b'>` is not a forcing function (#1947 action-set review)

A reducer "tier factory" typed `function freshTier(): Pick<State, 'a'|'b'|'c'>` claims to make
"what does this transition clear" a compile-time decision. It does not: adding a field to `State`
produces **no error** — the key union just doesn't mention it, the spread leaves it untouched, and it
silently defaults to _kept_. The key union is a second hand-maintained list, i.e. the very thing being
replaced. The working version is a **named tier type** (`interface ReportTier {...}`) whose factory has an
**explicit return-type annotation** and returns a total object literal — missing property = compile error.
The annotation is load-bearing: an inferred return type re-derives the shape from the literal and the
error vanishes. Partition state as a flat intersection of tiers, not nested objects (nesting churns every
read site). Generalises to any "exhaustive mapping" claim made with `Pick`/`Omit`/`Record<keyof …>`.

### Caller-supplied monotonic seq in an action payload reintroduces the ref it replaces (#1947)

`dispatch({type:'SELECT_SOURCE', payload:{ newReportSeq }})` asks the caller to produce a value that must
stay **in sync with reducer-owned state** — only achievable with an out-of-reducer counter ref, so the
"staleness is enforced in the reducer" claim is false. Fix: **opaque nullable token** (`requestId: string |
null`) used as identity, never ordering — caller generates via a module-level `nextRequestId()`, echoes it
back in the completion action, reducer no-ops on mismatch. `null` then means "nothing in flight, discard
every outstanding response", so a reset invalidates in-flight work with no bump arithmetic. Monotonicity is
never needed when nothing compares generations for order. Corollary: an in-flight **boolean flag**
(`isGeneratingAi`) alongside such a token must be **derived** (`token !== null`), never stored — the two
disagreeing is exactly the bug class the token exists to kill.

### A refactor's cascade table smuggles behaviour changes (#1947)

Diff every row of a proposed reset/cascade table against the actual handler line-by-line. Two of three rows
in #1947's table cleared `aiError` where the code does not: one handler never clears it, and the other
clears it only inside `if (isGeneratingAi)`. Both were reachable, user-visible, and would have landed inside
a PR whose stated AC was "no user-visible change". Also watch for **generic setter actions**
(`SET_MAX_STEP`) — a setter wearing an action's clothes preserves the ad-hoc call it was meant to replace
and names nothing about what it invalidates. And check whether the _unfixed_ instances of the same race
exist elsewhere in the file (#1947 had a third, unguarded, in the Step-2 fan-out fetch).

### The neutralised trigger left in the code (#1947 `deepLinkAppliedRef`)

When a defect's trigger condition is _neutralised by a new guard_ rather than removed, the guarantee lives
in a comment. `if (… && !report && !appliedRef.current)` — `!report` was the AC8 trigger, kept alive behind
a ref and a nine-line comment. Removing the redundant condition also removes `report` from the effect's
dep array, making "clearing report cannot re-fire this" structural. Look for this shape in any fix that
_added_ a guard without deleting what it guards against.

### A total-object tier factory only forces a decision in the cases that spread it (PR #1988 review)

Follow-up to the `Pick<>` entry above: getting the factory right is necessary but not sufficient. A named
tier type + annotated total-literal factory produces the compile error, but **any reducer case that
hand-lists that tier's fields instead of spreading the factory keeps the hole** — the new field silently
defaults to _kept_ there. PR #1988 had `freshContentTier()` correct and then bypassed it in `SELECT_SOURCE`
and `DISCARD_EDITS`, the two cases that clear content state, because each needed one field _preserved_
(`aiError`). Reviewing a tier-factory design: grep every case for the tier's field names appearing as
literal keys; each hit is an unenforced case. The fix is always the same shape — spread the factory, then
name the exception on the next line (`...freshContentTier(), aiError: state.aiError`), which is
behaviour-identical and makes the KEEP the thing that is written down rather than the CLEAR.

## Hand-rolled regex mirroring a third-party grammar accepts values the library rejects (PR #1989, #1970)

Validating an env var with a regex that _approximates_ a library's parser produces configs that pass
startup validation and then blow up at request time. Concrete case: `AUTH_RATE_LIMIT_WINDOW` validated
by a bespoke duration regex, while `@fastify/rate-limit` v11 parses `timeWindow` strings with
**`@lukeed/ms`** (not the classic `ms` package).

Two divergences found, both reaching the same failure:

- **Zero magnitudes.** `@lukeed/ms` guards with `if (arr != null && (num = parseFloat(arr[1])))`, so
  `'0s'`, `'0 minutes'`, `'0ms'`, `'0.0h'` all `parse()` to `undefined`.
- **Whitespace class.** `@lukeed/ms` uses ` *` between number and unit; `\s*` additionally accepts
  `'15\tminutes'` / `'15\nminutes'`, which `parse()` rejects.

Why it's fatal, not a fallback: `mergeParams()` in `@fastify/rate-limit/index.js:163-169` is an
`if / else if` chain — a _string_ takes branch 2, gets `undefined`, and never reaches the
`defaultTimeWindow` branch. At request time `await params.timeWindow(req, key)` throws, so **every**
request to the route returns `500 {"message":"params.timeWindow is not a function"}`. Verified:
`timeWindow: '0s'` on a route → 500. A zero window is the obvious way an operator tries to disable a
rate limit, so this defeats a "no value may disable the control" acceptance criterion.

**Rule:** when a config value is handed verbatim to a third-party parser, validate it _with that
parser_ (declare the dep) rather than re-deriving its grammar. If a regex is unavoidable, also assert
the parsed result is defined and `> 0`, and check the library's actual source for which package it
uses — `@fastify/*` deps are not always the popular one.

**Resolved in `47ee190` (APPROVED)** with regex + guard rather than delegating to the parser, and that
was accepted. Two transferable lessons:

- **Direction of divergence is what matters, not divergence itself.** A hand-rolled regex that is
  strictly _narrower_ than the library is fail-closed and fine: config rejects `1y`, `1wk`, `100msec`,
  `.5s`, `-5m` at startup with an actionable message. Only the _wider_ direction (config accepts what
  the parser chokes on) is a blocker. Don't demand exact grammar parity in review — demand that the
  accept-set be a subset, then sanity-check that the excluded values are ones nobody wants.
- **Verify a grammar claim by brute force, not by reading.** Cross-checking "does anything pass my gate
  that the library can't parse?" over all units × magnitudes × separator widths took one throwaway
  script and turned an inspection argument into `config-accepts-but-lukeed-fails: NONE`. Import the
  library's built file by relative path (`./node_modules/<pkg>/dist/index.mjs`) from a script placed in
  the repo root — a script in `/tmp` cannot resolve the bare package name.
- Ordering detail worth preserving: the positive-magnitude guard must be an `else if` _after_ the
  pattern test, so `parseFloat` only sees strings already known to start with `\d+`. Reversing them
  reintroduces a `NaN` path.

## `parseInt` config validation accepts trailing garbage repo-wide

`loadConfig()` uses `parseInt(str, 10)` + `isNaN` for every numeric env var (`PORT`,
`SESSION_DURATION`, `PHOTO_MAX_FILE_SIZE_MB`, `LLM_MAX_TOKENS`, `BACKUP_RETENTION`,
`AUTH_RATE_LIMIT_MAX`). So `20abc` → `20`, `20.9` → `20`, `1e3` → `1`, despite error messages that say
"must be a positive integer". Any AC demanding "non-numeric value fails startup" is only partly met.
Don't request a one-variable fix in review — it creates local inconsistency; either accept the pattern
or propose a uniform `/^\d+$/` guard across `loadConfig()` as its own item.

## Env vars are documented in four places, not one

Adding an env var means: `CLAUDE.md` table, `wiki/Architecture.md` (topic-grouped tables — e.g.
"Authentication & Sessions" ~L393), `wiki/API-Contract.md` ("Environment Variables (Auth)" ~L107), and
`docs/src/getting-started/configuration.md` (**docs-writer-owned** — file a request, don't edit).
The first three belong in the implementing PR with the submodule ref bumped on the branch. PR #1989
updated only `CLAUDE.md` at first review; `47ee190` added both wiki pages, leaving the docs-writer one
as a release-staging follow-up — that is the correct end state, so treat "3 of 4 + a flagged follow-up"
as the passing bar, not 4 of 4.

Cheap way to find every location when adding a var: grep an _existing_ comparable var repo-wide
(`grep -rln SESSION_DURATION --include='*.md' --include='*.yml' .`) instead of guessing which files
need touching. It also surfaces the ADR pages that pin a default.

## A guard deleted because it looked like the bug (#1303 -> #1995, PR #1998)

CVE-2026-15144 was caused by a custom `keyGenerator` in `rateLimitPlugin.ts` bypassing
`@fastify/rate-limit` 11.2.0's IPv6 /64 normalization. The fix deleted the option — correct
direction, but the deleted block had been added deliberately by 69d90882 (#1303) as a nullish-IP
guard, with **zero test coverage**, which is exactly why deleting it looked free. Before approving
any deletion framed as "this override was a mistake", run `git log -S` on the removed lines and read
the commit that introduced them. `git show <sha> --stat` touching no test file is the tell that the
behaviour is unguarded and its removal will pass CI.

Two library facts worth keeping:

- **`@fastify/rate-limit` gates normalization on an _identity_ check**, `index.js:249`:
  `params.keyGenerator === defaultKeyGenerator ? defaultKeyGenerator(req, subnet) : keyGenerator(req)`.
  So even a custom generator written as literally `(req) => req.ip` bypasses /64 normalization. A
  custom generator is only safe if it calls the library's exported `normalizeIP` itself
  (typed export, `types/index.d.ts:164`; works as an ESM named import).
- **`normalizeIP(undefined)` throws** (`ip.toLowerCase()` on line 1), and Fastify's `request.ip` is
  typed `string` but nullable at runtime in **both** getters (`fastify/lib/request.js:231`
  non-trustProxy — `undefined` socket or destroyed-socket `remoteAddress`; `:110` trustProxy —
  empty `proxyAddr.all()`). 11.1.0's default returned `undefined` (shared bucket, mild); 11.2.0
  turned the same input into a throw -> 500 on every rate-limited route. Another types-lie:
  `tsc` cannot see it, so a nullability regression is invisible in the diff.

Generalisation: when a minor version replaces a "return the raw value" default with a "transform the
value" default, any guard written against the old milder failure mode may now be load-bearing against
a throw. Check the version-bump PR's semantics, not just the option's name.

## A CVE fix's shared-bucket test needs a negative control

"These two IPv6 addresses share a bucket" passes identically if the key collapsed to a constant for
_all_ clients — which is a self-inflicted DoS (one attacker locks out every user), i.e. the opposite
defect. Upstream's own `test/ip-normalization.test.js` asserts the third case: a _different_ /64 gets
a fresh bucket. Same family as "assertions that pass on nothing", but subtler — the test does catch
the regression it was written for, and only fails to catch the over-correction.

## Prettier config resolution is path-based — "was it clean before?" checks must run inside the repo

Copying a file to `/tmp` and running `npx prettier --check` on it silently uses prettier **defaults**
(printWidth 80), not the repo's `.prettierrc` (100). During the #1998 wiki pass this made a dirty file
look clean and a clean file look dirty — the opposite of the truth, in both directions at once.
Verify baselines with `git show HEAD:<file> > <repo>/_chk_<file>` **inside the working tree**, then delete.

Related: `wiki/` is **not** in `.prettierignore` and `npm run format` globs `**/*.md`, so a repo-wide
format touches wiki pages — including `Security-Audit.md` (security-engineer-owned) and ADR pages.
Before committing a wiki edit, run `git -C wiki status --short` and revert any page you did not
intend to touch; scope your own formatting to the files you edited.

## Documented "absence of code" is falsified by the next commit — document the invariant instead

PR #1998 fixed CVE-2026-15144 by **deleting** a `keyGenerator` override, so the natural wiki sentence
is "`rateLimitPlugin` deliberately sets no `keyGenerator`". That documents an absence: it goes stale the
moment anyone adds a _correct_ override, and it gives a reviewer no rule to check the new code against.
Found live during this pass — an uncommitted working-tree change already reintroduced
`keyGenerator: (request) => normalizeIP(request.ip ?? 'unknown')`, which is safe (normalizeIP defaults
`ipv6Subnet = 64`) yet contradicted the sentence.

Rule: state the **invariant** ("the key must always be `normalizeIP`-normalized, forwarding the
configured `ipv6Subnet`"), then note the current mechanism as the preferred way of satisfying it, then
enumerate the specific forbidden shapes. Applies to any fix whose diff is a deletion.

**Confirmed within the same PR (#1999).** The absence-sentence was falsified before the PR even merged,
including the "Cornerstone does not override `ipv6Subnet`" clause and both Deviation Log rows that cited
"the deliberate absence of a `keyGenerator`" as rationale — a self-contradicting PR caught only at
review. A Deviation Log row is not append-only history while its PR is still open: amend the Resolution
cell (framed as "the first pass said X; PR #N invalidated that, because …") rather than stacking a
second row about an unmerged one. Also: an override can be _mandatory_ rather than stylistic — here two
library facts force it, so "prefer the library default" was wrong advice, not merely stale.

## Verify library internals against the pinned tarball, not `node_modules`

The base checkout's `node_modules/@fastify/rate-limit` was **11.1.0** while the lockfile and
`server/package.json` pin **11.2.0** — and 11.2.0 is the version that introduced `normalizeIP` and the
generator-identity gate. Grepping the installed copy showed _no_ `normalizeIP` at all, which reads as
"the claim in the code comment is false" instead of "the install is stale". Worktrees have no
`node_modules` of their own, so this is the default situation, not an edge case.

Rule: before documenting or refuting a claim about a dependency's internals, check the installed version
against the lockfile pin. If they differ, `cd /tmp && npm pack <pkg>@<pinned> && tar xzf …` and read that
source. Cheap, exact, and it produced the file/line citations (`index.js:14` `defaultIPv6Subnet = 64`,
`:249-251` identity gate, `:33-34` `ip.toLowerCase()` null deref) that the wiki text now rests on.

## A config option consumed only inside a bypassed branch is inert, not redundant-but-harmless

`rateLimitPlugin` passes `ipv6Subnet: IPV6_SUBNET` to `@fastify/rate-limit`, but 11.2.0 reads
`params.ipv6Subnet` **only** inside the identity gate (`index.js:250`, the `keyGenerator ===
defaultKeyGenerator` arm). With a custom generator set, that option can never influence a key. Keeping
it is still correct — it becomes load-bearing the moment the override is deleted — but it is a _latch
for a future state_, not the mechanism doing the work today.

Rule: when reviewing "the constant is shared so the two cannot drift" rationales, check whether the
second consumer is actually reachable. If it isn't, say so in the code comment ("intentionally redundant
while the override exists"), otherwise the next reader sees the same value configured twice, believes the
option delivers the behaviour, and deletes the explicit call as duplicated config — reintroducing the
very bug. Related: a single constant referenced twice cannot "drift" at all, so that phrasing in wiki
prose overstates the guarantee it buys.

## The revert test: a fix that relaxes an invariant and adds no assertion is unobserved

PR #2002 (#1968) routed the report-PDF usage-cell grey meta suffix through `buildUsageTextRuns` so
per-token `wordBreak: 'break-all'` applies. To let the resulting multiple grey runs through, it relaxed
both `splitUsageCell` test helpers from "exactly one grey run" to "grey runs contiguous at the tail" —
and in doing so made the helpers **synthesize** the meta run (`{ text: <joined>, color: GREY }`),
discarding the per-run `wordBreak` flag. Net effect: reverting the production hunk left all 95 + 73
tests green. The PR body's "all existing tests pass unchanged" was true and was the problem.

Shape to watch for: **a fix whose enabling step is a loosened assertion.** The loosened assertion is
by construction the one that used to observe the structure being changed; if nothing new observes the
new structure, coverage went _down_ while the diff looked like it went up.

Rule: for any bug fix, ask "if I reverted just the production hunk, which test goes red?" If the answer
is none, the fix has no regression guard regardless of suite size. Two specific tells: (a) the diff
touches only test _helpers_, never test _cases_; (b) the helper reconstructs a synthetic object from the
real one, silently dropping exactly the property the fix adds.

Corollary: relaxing an invariant is fine and often correct (contiguous-at-tail still catches interleaved
or mis-coloured runs — it is weaker only in the dimension the fix deliberately changed). What is not fine
is relaxing it _and_ leaving the new dimension unassertable.

**Round-2 outcome (2026-08-04) — run the revert test yourself; don't grade the description of it.** #2002
came back claiming H1 fixed. It genuinely was, but I only know that because I re-ran the revert: reverting
the hunk to `runs.push({ text, color: DEPOSIT_NOTE_TEXT_COLOR })` failed all three new tests (`greyRuns.length`
1 not >1; `wordBreak` assertions false), and restoring passed 171/171. The fix was to stop synthesizing —
the helper now returns the **raw** run objects (`greyIndexes.map((i) => runs[i]!)`) so no pdfmake property is
dropped, plus a second test that bypasses the helper entirely and reads the run array off the rendered doc.
Generalizable: when the round-1 finding was "the test cannot observe the fix", the round-2 evidence is a
**demonstrated red**, and that is cheap to produce (one edit, one `-t` jest run) — a prose summary of which
assertions were added is not a substitute, because the whole failure mode was an assertion that looked right.
Two good repair shapes to accept: return the raw object instead of a reconstruction, and add one test that
skips the helper layer under suspicion.

**Also check the fix's _other_ axis.** `break-all` converts horizontal overflow into extra wrapped lines,
which in this table meets the `dontBreakRows` silent-drop hazard — so an overflow fix can create a height
bug. Here it cannot: `packUsageCellRows` budgets by _character_ count derived from a per-line char count, so
the pre-fix unbroken token used _fewer_ lines than already budgeted and the fix only moves actual behaviour
toward the budget's assumption. Worth asking every time a wrap/break flag is introduced.

## Broad-scope attribute + partial counter-tagging (PR #2004, #1910)

An inherited HTML attribute (`lang`, `dir`, `aria-hidden`, `role`) applied to a **container** is a claim about
every descendant. The tempting shape is "tag the container, then counter-tag the exceptions" — and it
ships correct only if the counter-tag list is exhaustive. #1910's AC named three exception classes
("editable-field labels, buttons, headings"); the implementation put `lang={reportLanguage}` on
`ReportContentEditor`'s root and counter-tagged `<h3>` + one hint `<p>`, leaving six `EditableField`
`<label>`s, every reset button's `aria-label`/`title`, the `srOnly` edited hint, two `.readOnlyLabel`
spans, and a `role="group"` `aria-label` announced in the wrong language. Note the direction: those
strings were **correct before** the change (they inherited the document locale), so a partial
counter-tag is a net regression on exactly the axis the story exists to fix.

Review heuristic: when a diff adds an inherited attribute to a container, enumerate the container's
`t()` call sites and check each one against the counter-tag list — do not read the counter-tags as the
spec. Prefer the reviewer's alternative of **positive tagging**: put the attribute only on elements whose
own text carries the property (inputs' values, the table, footnotes), which needs no exception list and
kills the coupled `lang`/`uiLang` prop pair (an invariant enforced by JSDoc prose, and the caller
evaluated the same ternary twice — same class as "`Pick<>` is not a forcing function").

## Vacuous negative via an _earlier_ early return (PR #2004, #1888)

Related to "assertions that pass on nothing", but the giveaway is different: the fixture is legitimate
and the assertion is well-formed — it just never reaches the new guard. `makeReport([])` gives 0
allocated **and** 0 unallocated, tripping a pre-existing `EmptyState` early return, so the test proves
nothing about the new `allocatedInvoices.length > 0` guard and duplicates an existing EmptyState test.
The discriminating fixture is the one that satisfies the early return's escape but not the guard
(`makeReport([], [oneUnallocated])`). Check: **which branch does the fixture actually land in**, not
just whether the expectation is `not.toBeInTheDocument()`. Same revert test as always — delete the
guard, does it go red?

## Comment refreshed, assertion left behind (PR #2004 round 2, #1910)

When a fix inverts a contract, the tests that encoded the OLD contract get their **explanatory comments
rewritten to describe the new design while the `expect` line is left untouched**. In #2004 the H1 fix
moved `lang` off the container onto sections; E2E Scenario 25's comment was rewritten to say "under
Option A the tagging is on `.tableWrapper`" and the very next line still read
`expect(await container.getAttribute('lang')).toBe('de')`. It went red in CI (Shard 2/16, both attempts).

Why it survives review: a diff that shows a rewritten comment block _looks_ like the test was updated,
and the unchanged assertion line is not in the diff hunk at all if the comment is long enough.
How to apply: on any contract-inverting fix, grep the test suites for the **old** attribute/selector/value
(`getAttribute('lang')` here) and read every hit's assertion, not its comment. Also diff the shard
results against the previous commit of the same PR — "shard N was green before this commit" is the
cleanest way to separate a real regression from the standing flakes (diary shard 3, dashboard #1735
shard 8). Remember `E2E Gates` is `main`-only, so a red E2E test merges to `beta` silently.

## Inverting a contract can make an existing negative test unconditional (PR #2004, #1910)

Distinct from the two vacuity patterns above: the test was genuinely falsifiable **before** the fix.
Scenario 27 asserted "container has no `lang` when report language matches the UI locale" — meaningful
while the container was the tagging site. After Option A the container never carries `lang` for any
input, so the assertion can no longer distinguish the two branches of the conditional it guards;
deleting the `lang={…}` prop from the caller entirely leaves it green.
How to apply: when a fix narrows _where_ a property is applied, re-run the revert test on the
**pre-existing** negative tests too, not only on the ones the fix touched. Retarget them to whatever
element now varies with the condition.

## Surgical tagging misses read-only value nodes (PR #2004, #1910)

Positive/surgical tagging (the fix I recommended in round 1) has its own failure mode: it is an
enumeration, so it misses sites. #2004 tagged five sections plus every `EditableField`, and missed the
two `.readOnlyValue` spans (`coverLetter.dateLine`, `coverLetter.closing`) — read-only report-language
text that no editable-field prop threads through. Check: enumerate the render sites of the
_data-derived_ strings (`content.*`), not the elements the diff touched. Sibling `.readOnlyLabel` spans
are `t()` UI chrome and must stay untagged — the label/value pair splits across the boundary.

## Removing a wrapper tag on an over-tagging objection loses the coverage it provided (PR #2004 r3)

Round 2 flagged `lang` on `.tableWrapper`/`.mobileCardList` as over-tagging (they contain UI-chrome
reset buttons and sr-only hints). Round 3 **deleted** the wrapper tags and re-added `lang` to
`<thead>` only — so the desktop `<tbody>` (statusText, splitNote, depositReducedNote, refundNote,
deposit badge) and the _entire_ mobile card tree lost coverage. Net worse than round 2: it traded a
minor over-tag (English chrome read with German rules) for a larger under-tag (German data read with
English rules), and below the 767px breakpoint `.table { display: none }` means zero coverage.
**Why:** an "over-tagging" finding asks you to _relocate or except_ the tag, never to drop it. The
HTML idiom for a nested language exception is **counter-tagging** the inner chrome (`lang={uiLang}`
on the reset button + sr-only hint), not removing the outer boundary.
**How to apply:** when a review round removes an attribute/wrapper, diff the set of leaf nodes that
_were_ covered against those that _are_ covered and demand the delta be re-covered. Two specific
traps here: (a) responsive CSS-only duplicate trees — a fix applied to the desktop table silently
leaves the mobile card list uncovered, and mobile/tablet Playwright projects only run
`@responsive`-tagged tests so E2E won't catch it; (b) a blanket rule like "EditableField labels are
UI chrome" holds only where labels come from `t()` — the mobile usage field's label is
`content.labels.usage`, i.e. report-language, so the rule inverts inside the table region.
Also: the code fix for a round-N finding landing **without an assertion** (the `.readOnlyValue`
`lang` spans) means it can be reverted with every suite green — always ask "what test would fail?"
for each item the author claims to have addressed.

**Round-3 addendum (#1910, PR #2004) — "the prop landed" is not "the prop is wired".** The fix for a
review finding can introduce a _new_ optional prop, unit-test the prop on the leaf component, thread
it through N call sites, and still have zero coverage of the threading: the leaf tests pass the prop
in themselves. Revert test applied at the call-site level (not the component level) is the only thing
that catches it — delete the `foo={foo}` lines, not the `foo` implementation, and see what goes red.
Optional props make this silent because removing them from JSX is type-legal.

Companion trap: **a redundant tag that a test asserts.** After restoring an ancestor tag, the
descendant tag it duplicates becomes redundant, and if a test asserts _both_ the redundancy is
locked in. The danger is not the duplication, it is that a later cleanup reads the pair as an error
and removes the ancestor — reintroducing the original finding. Ask for a comment naming the
duplication as deliberate.

Third: **an `aria-label` cannot be language-tagged.** When an element's accessible name comes from
`aria-label` but its content is in another language, no `lang` placement fixes both — the name is
computed on the element that carries the `lang`. The only exact fix is a visually-hidden span with
its own `lang` plus `aria-labelledby`. Worth naming as a known limit rather than looping on it.

**Round-4 addendum (#1910, PR #2004) — a positive anchor only pins the call sites the fixture
actually renders.** The round-3 fix for "all 8 `uiLang={uiLang}` props could be deleted with every
suite green" was a test asserting `button[lang="en"]` count `>= 1` plus an all-must-match loop. It
does close the _stated_ gap (deleting all 8 fails), and the handoff claimed "removing **any** prop
fails" — but per-site mutation testing showed **1 of 8** pinned. The fixture put exactly one field
(`coverLetter.sender`) into edited state, so exactly one reset button ever rendered, so the anchor
could only ever cover that one site; the other 7 still delete silently.

Generalises well beyond `lang`: **`count >= 1` + "all matches satisfy P" is a per-instance assertion
masquerading as a coverage assertion.** It pins the instances the fixture happens to produce, and the
count floor hides how few that is. When N call sites thread a prop, the discriminating shape is
`expect(matches.length).toBe(N)` with a fixture that forces all N to render — an exact count is the
only version that fails when a site disappears. Two review habits that follow:

- Never accept "removing any X fails" on the strength of an all-at-once revert. Revert each site
  **individually** — the all-at-once test passing tells you nothing about per-site coverage.
- When a fix is partial, say which fraction is pinned. "M1 resolved" and "1 of 8 sites pinned" get
  recorded very differently, and the second is what stops the gap being re-found in three months.

Related smell confirmed the same round: a **near-vacuous negative guard** (`button[lang="de"] === 0`
when no button can ever receive `lang={lang}`) is still worth keeping if it pins a _contract_ on
another component ("chrome is always `uiLang`") rather than restating the positive assertion.

## Untyped E2E route fixtures drift silently from shared contracts (#2005, PR #2006)

E2E shard 8/16 went red because `mockInvoicesFullSummary()` in `e2e/tests/navigation/dashboard.spec.ts`
returned a `summary` missing two **required** members of `InvoiceStatusBreakdown` (`claimable`,
`quotationCoveredByDeposits`) and used `pagination.total` where `PaginationMeta` says `totalItems`.

The failure mode is worth remembering because it is maximally indirect. `InvoicesPage` initialises
`summary` to a _complete_ default, so first paint is clean; `setSummary(response.summary)` then swaps
in the incomplete mock and the next render throws on `summary.claimable.count`. React unmounts the
tree, the `loadIntegrationStatus` cleanup sets `cancelled = true`, `integrationStatus.paperless` stays
`null`, and the `?create=1` effect's readiness gate never opens. **Reported symptom: "the New Invoice
shortcut opens no modal."** Nothing in that symptom points at a fixture field name. When an E2E
failure looks like a missing feature or a race, check the mock against the shared response type before
theorising about timing.

Three durable rules:

- **Annotate route fixtures with the shared response type** (`function mockX(): InvoiceListPaginatedResponse`).
  `e2e/` already imports from `@cornerstone/shared`, so both defects here were compile-time detectable.
  An untyped literal handed straight to `JSON.stringify` has _zero_ coupling to the contract it mimics —
  adding a required field to a shared type will never break it, which is exactly backwards.
- **A consumer's early return can mask an incomplete fixture indefinitely.** `mockInvoices()` in the
  same file also omits `quotation`/`overdue`/`claimable`, and `InvoicePipelineCard` dereferences
  `summary.quotation.totalAmount` — it survives only because the card early-returns its empty state
  when `invoices: []`. The first person to add one invoice to that fixture reproduces the same
  TypeError. "It's been green for months" is not evidence a fixture is complete.
- **Fix the fixture, not the dereference.** The tempting patch is optional chaining in the page. But
  `claimable` is _required_ by the contract, so the page is entitled to dereference it unconditionally;
  adding `?.` relaxes a correct invariant to accommodate a wrong test. Source-of-truth ordering holds.

Also load-bearing and undocumented in that file: scenarios 13c–13f register **two** `**/api/invoices*`
handlers (`interceptDashboardApis` then `interceptInvoicesPageApis`), and correctness depends on
Playwright's reverse-registration precedence letting the later full-summary handler win. Swapping the
two `intercept*` call lines silently reintroduces the identical failure. When reviewing Playwright
specs, treat duplicate route globs as an ordering dependency that must be commented.

Review-craft note from the same PR: verifying "would this test still fail if the feature were removed?"
was cheap here because all three scenarios guard with **positive** `toBeVisible()` assertions. The one
negative (`not.toContain('create=1')`) is only non-vacuous because the preceding positive assertion
can't pass unless `create=1` was present — negatives anchored to a positive in the same test are fine;
negatives standing alone are the ones to challenge.

## Widen-then-`as`-narrow round trip defeats union exhaustiveness (#2001, PR #2007)

A field typed as a proper string-literal union gets widened to `string` by an _intermediate_ container
(`SkippedDocument.reason: 'a'|'b'` → `new Map<string, string[]>()` in `merge.ts`), then re-narrowed at
the consumer with `reason as 'a'|'b'` plus a `?? reason` fallback. Every symptom of type safety, none of
the enforcement:

- Adding a third union member produces **zero** compile errors — not at the `as`, not at the hand-written
  label literal in `buildReportContent.ts`, not at the interface declaration.
- The `?? reason` fallback is dead code today (indexed access into a fully-keyed object type is
  non-optional `string`), so it reads as a guard while guarding nothing — and it is exactly what would
  _mask_ the future regression instead of surfacing it. Here it would print a raw i18n identifier into a
  bank-facing PDF.

Fix shape: name the union (`export type ReportSkipReason = …`), type the intermediate container with it,
and declare the lookup table as `Record<TheUnion, string>`. Then adding a member is a compile error at
the single population site. Type the container, don't assert at the consumer.

**Review heuristic:** any `as '<literal>' | '<literal>'` in new code is a claim that some _upstream_
type was needlessly widened. Trace where the widening happened — that's the real fix site. Doubly so
when the PR's stated purpose is "compiler-enforced, not convention-enforced": a cast is convention
re-entering through the back door.

## A refactor that changes an invariant falsifies the ADR that states it (#2001, PR #2007)

Removing a hazard _upgrades_ the enforcement level, which means the ADR passages describing the old
weaker level are now actively harmful — they instruct the next contributor to reintroduce what was
removed. ADR-034 had four: a signature quote naming the removed `t` param, a "nothing in the type system
distinguishes X from Y, so the only defences are contract/review/tests" sentence (false once the channel
is gone), a grep guard that cannot see the new violation shape (a _parameter type_ — `useTranslation|
/i18n/` greps miss it), and a list of "sites still doing it independently" that is now empty.

**Checklist when reviewing any hardening/refactor PR:** grep the governing ADR for (a) quoted
signatures, (b) "the only defence is…" / "nothing enforces…" sentences, (c) enumerated
remaining-violation lists, (d) grep guards — all four go stale from a fix, and none is caught by CI.
Also: the strongest guard is usually the story's own AC grep — promote it into the ADR as a numbered
invariant rather than leaving it in the closed issue.

Corollary on routing: when the wiki delta is ADR _prose_, request that the orchestrator route it back to
`product-architect`, not to the implementing dev agent.

## Key-echo test fixtures make same-layer assertions non-discriminating (#2001, PR #2007)

`reportPdf` test fixtures follow a convention where label values _equal the i18n key strings_
(`makeLabels()` → `pageLabel: 'sourceReports.table.pageLabel'`), matching the mock `t`'s echo behaviour.
Consequence: an assertion expecting `'… — sourceReports.table.footnoteFetchFailed'` passes identically
whether the production code reads `labels.x` or calls `t('sourceReports.table.x')`. Six such assertions
existed in `overviewPdf.test.ts`; all six contribute zero coverage for the injection contract.

Only fixtures with a **unique sentinel** (`FETCH-SENTINEL`) discriminate. When a PR adds an AC-driven
sentinel block alongside pre-existing key-echo assertions, say in the review that the sentinel block is
the load-bearing one and must not later be "harmonised" into the surrounding style.

## A revert test can prove a _different_ proposition than the one it licenses (#2003, PR #2008)

PR #2008 added a genuine revert test (synthetic `widths: [600, 50]` table → `maxHorizontalRatio > 1`)
and then used it to justify three `<= 1` assertions on production fixtures that target a **different
failure mode** (over-wide token inside a fixed-width column) which the helper is provably blind to. The
revert test passes, the assertions pass, and nothing is enforced. Seven extra real pdfmake renders for
zero signal.

**The check:** a revert test only licenses assertions whose failure mode it actually reproduces. Ask
"is the thing I broke in the revert fixture the _same mechanism_ as the thing the production assertions
guard?" — not merely "does the helper return a different number for _some_ input?" A synthetic fixture
shaped unlike production content is the tell.

Corollary: when a helper's own doc comment documents a limitation ("overflow is only detectable
when..."), treat that paragraph as a **finding about the assertions**, not as a caveat to be noted and
moved past. #2008's comment stated the limitation accurately and the tests below it ignored it.

## Implementing a documented rule for the first time is when you learn the rule is wrong

ADR-034 rule #1 has now been wrong twice (`_minWidth` table-form → corrected 2026-08-04 →
`horizontalRatio`, falsified 2026-08-05 during PR #2008). Both times the wrongness surfaced only when
someone tried to _enforce_ it. An unenforced documented bar is not merely unenforced — it is
**unvalidated**, and citing it as authority ("verified against `DocumentContext.js:490`") verifies the
field exists, not that the assertion means what the prose claims.

**How to apply:** when a PR lands the first implementation of a documented rule, review the _rule_ as
well as the code, and never let the PR add an "Implementing test:" pointer without checking that the
test enforces the property the prose states. A pointer linking a bar to a non-enforcing test is worse
than no pointer — it retires the debt on paper.

## Forked tree-walk helpers: three copies of `collectAllStrings`

`realRender.test.ts` had two describe-scoped copies (`:837`, `:1094`) before PR #2008 added a third,
each with a comment justifying the fork ("so this block is self-contained"). Self-containment is not a
reason to fork a pure recursive tree walk — hoist to module scope. Watch for this whenever a new
top-level describe block is appended to a long test file.

## Mutation-test the fix, don't read it (PR #2008 round 2, 2026-08-05)

Round 1's finding was "this assertion cannot fail". The round-2 fix _looked_ right on inspection. The
only thing that settled it was reverting the production line the rule governs
(`wordBreak: 'break-all'`, `overviewPdf.ts:385`) and confirming 8-of-9 tests flip red while the
revert-test stays green. Cost: two jest runs. **Whenever a round-1 finding was "vacuous assertion",
round 2's verification is a mutation, not a re-read** — you already know reading cannot distinguish the
two states. Restore with a `cp` backup and confirm `git status --porcelain -- <files>` is empty after.

Corollary worth the extra run: also capture the _pass-side_ numbers (add a temporary `console.log`,
then `git checkout` the test file). That is what exposed M1 below — the assertion was correct but every
figure documenting it was wrong, which reading alone would never have surfaced.

## Corrected prose re-imports the very figures the correction reclassified

ADR-034's 3rd rule-#1 correction (PR #2008) explicitly reclassified `_minWidth` 33.54pt/266.16pt as
**table-level sums** and diagnostics (ADR line 162) — and then quoted those same two numbers, plus a
stale 69.28pt Usage width, as the _measured evidence_ for the new **per-cell** check. Real values:
`_calcWidth` 186.78/138.28pt (= exported `USAGE_WIDTH_6COL`/`_7COL`, `overviewPdf.ts:57-58`),
`_minWidth` 7.098pt with `break-all`, 212.93pt without.

**Why it happens:** a correction rewrites the _claim_ by editing around the existing sentence, and the
numbers ride along because they were never the thing under dispute. The rule's semantics get fixed
three times while its arithmetic is never re-measured.

**How to apply:** when reviewing a corrected documented bound, verify the _numbers_ separately from the
_semantics_ — a stale figure elsewhere on the page (69.28pt also survives at ADR lines 105 and 138) is
the tell that it predates a geometry change. Prefer citing exported constants by name over literals so
the doc cannot drift from the code.

Same class, conceptual variant: the ADR's no-false-positive argument read "plain prose yields 33.54pt".
Prose `_minWidth` is its widest **word**, which can be large — that is the entire reason over-long
tokens need flagging. A no-false-positive claim must be stated as a _condition_ ("prose whose words all
fit under `safeTokenChars`"), never as a constant.

## "For every cell" in the rule, one column in the test

ADR-034 rule #1 states the bar as "for every cell of the overview table"; #2003's implementing test
reads only `body[i][usageColIndex]`. The **uncovered** cells are the tighter ones: Vendor body at 45pt
/ `VENDOR_SAFE_TOKEN_CHARS` = 5 (`overviewPdf.ts:620`) and every header cell via `buildHeaderCell`,
where DE is the documented binding locale (#1937). Usage at 138-187pt is the _widest_ text column.

**How to apply:** when a test lands against a universally-quantified documented rule, check the
quantifier. Picking the column the issue happened to mention is not the same as picking the binding
one — and when the render already happened, iterating all cells is nearly free.

## A wiki page can state a PROHIBITION that the PR under review deletes

**Why:** #1973/PR #2010 generalised `overviewPdf.ts` to 96 column subsets. ADR-034's "Geometry
constraint that blocks a feature" said the PDF column count is fixed at 6 or 7 and that wiring the
wizard's toggles through "is a re-measurement story, not a UI change." The PR touched no wiki file,
so the merged state would have documented the shipped feature as impossible — actively steering the
next agent away from it. Same page, same round: a quoted constant reference (`MAX_SAFE_USAGE_CHUNK_CHARS`
→ per-subset `usageChunkChars`) and a "this function **hangs** on `maxChars <= 0`" claim that a prior
fix had already turned into a throw.

**How to apply:** on any PR that _removes_ a limitation, grep the wiki for the limitation's own
statement — not just for the API/schema surface the diff touches. Constraint prose lives in ADR
Consequences and "sharp edge" sections that no schema/contract diff would ever point you at. Bonus
tell: if the issue body cites a wiki constraint as its motivation, that exact paragraph is the one
the PR must rewrite.

## Exhaustiveness audit for a keyed engine: list which links are compile-enforced and which are not

**Why:** #1973's geometry engine keys everything off a `ReportColumnKey` union. Three links force a
new key at compile time (`Record<FixedColumnKey, number>`, `Record<ReportColumnKey, string>`, a
`default`-less switch with a declared return type). Four do not — the base-set arrays in `columns.ts`,
`LEADING_COLUMNS`, `RIGHT_ALIGNED_COLUMNS`, and the absorber-priority ternary — and the tests that
look like they'd catch it pin literal counts (`toHaveLength(7)`) derived from the test's own hand-typed
array, so they can't.

**How to apply:** when reviewing a union-keyed engine, enumerate every site that consumes the union and
classify each as forcing or non-forcing; report the non-forcing ones even when they are correct today.
The cheap fix is almost always to derive the hand-typed list from an exhaustive `Record<Key, …>` and
filter, which converts a silent omission into a compile error.

---

## A documented env var the code never reads, and how to sweep for more (#1992, wiki `e14bcbe`)

Both auth env-var tables documented `OIDC_REDIRECT_URI`; `server/src/plugins/config.ts` never reads it.
The gate is three vars (`config.ts:142`), and the redirect URI is built per request at
`server/src/routes/oidc.ts:45` as `externalUrl || \`${request.protocol}://${request.host}\``+`/api/auth/oidc/callback`. Fixed wiki-only.

**The cheap sweep** (run it whenever you touch an env-var table, it is two commands):
`grep -oE "getValue\('[A-Z0-9_]+'\)" server/src/plugins/config.ts` gives the authoritative read-set;
`grep -oE '^\| \`[A-Z][A-Z0-9_]+\`' wiki/<page>.md`gives the documented set;`comm -23`the sorted
pair. Then`grep -n "enabled when\|If unset\|If either is missing"` — **any sentence that states a
variable count or an enablement gate is a second, independent drift surface** that the name-level diff
cannot see. That is how the "all four OIDC variables" sentence survived.

**Findings from that sweep — both FILED, do not re-file:**

- **#2023** — `Architecture.md` "Backup & Restore": `BACKUP_DIR` is documented as default `(none)` with
  "Backup functionality is enabled when `BACKUP_DIR` is set. If unset, all `/api/backups/*` endpoints
  return 503." Both halves are wrong — `config.ts:259` is `getValue('BACKUP_DIR') ?? '/backups'`, so
  `backupEnabled = !!backupDir` (line 288) is **unconditionally true** and the 503 path is dead.
  CLAUDE.md already documents the `/backups` default, so the wiki is the outlier.
- **#2024** — `npm run format` reformats `wiki/*.md`: `.prettierignore` excludes `docs/` but **not**
  `wiki/`, while `format`/`format:check` glob `**/*.{...,md}`. Surfaced via `API-Contract.md`
  lines ~3681-3720 (the `invoices[].splitKind` table from #1911/PR #2015), whose type cell overflows
  the table's padded width — the only prettier-dirty region of that file, and a latent format-check
  failure sitting on `beta`.
- **Ruled a CODE defect and handed to the coordinator to file** (issue number unknown at write time —
  search issues for `oidc.ts:106` / `redirect_uri` before filing anything) — the two OIDC legs derive the
  callback URL differently: `oidc.ts:45` uses `externalUrl || request-origin`, `oidc.ts:106` uses the
  request origin unconditionally. openid-client sends the **token-request** `redirect_uri` derived
  from the URL you hand `authorizationCodeGrant` (`index.js:974`, `redirectUri = stripParams(currentUrl)`),
  so with `EXTERNAL_URL` set and `TRUST_PROXY` unset the two legs send _different_ `redirect_uri`
  values and the provider rejects the exchange with `invalid_grant` (RFC 6749 §4.1.3 requires them to
  be identical). **Backend fix, not a wiki fix** — the wiki paragraph deliberately documents only the
  login leg, because documenting leg 2's derivation as intended behaviour would enshrine the bug.

**Wiki table mechanics (bit me, cost two rounds):** these tables are prettier-padded so every row is
the _same character width_ (auth tables 131; API-Contract Deviation Log 2153 = cells 10/74/780/1276).
Measure with python `len()`, **never `awk length()`** — awk counts bytes here, and the em-dashes that
are everywhere in this wiki make a correctly-padded row read 2 bytes long per dash, which looks like a
padding bug and isn't. Editing a Deviation Log cell means re-padding the cell to its exact column
width, not just swapping the sentence.

## Operator-facing docs make behavioural claims a validator must actually back (#1990, PR #2027)

Reviewed a docs-site-only PR for technical accuracy (no architecture surface). Everything structural
checked out — defaults, the startup-failure chain, the setup route's hardcoded 5/15min. The defects
were all in the gap between _what the prose promises_ and _what the code validates_:

- **Hyperlinking a third-party library while enforcing a strict subset of it.** Copy said
  "`AUTH_RATE_LIMIT_WINDOW` in [`ms`](vercel/ms) duration format". `config.ts:364` is a hand-rolled
  regex that rejects `1y`, bare `900000`, `.5h`, `1 msec` — all valid `ms` input shown in that README.
  Paired with a caution box promising a hard startup failure, the link _invites_ the crash it warns
  about (and the library is named `ms`, so "ms format" reads as "milliseconds" to many). This is the
  reader-facing twin of the #1970 "regex mirroring a third-party grammar" trap: **when docs link the
  upstream spec, the regex's subset becomes a documentation bug, not just a code smell.** Same loose
  phrasing exists in CLAUDE.md + both wiki pages — the hyperlink is what made it actionable.
- **A caution box can be falsified by `parseInt` leniency.** "A typo is caught immediately rather than
  producing an unexpectedly loose or strict limit" is false while `parseInt('2e3',10) === 2` and
  `parseInt('20abc',10) === 20`. Open issue #1991 would make the copy true — **don't let prose depend
  on an unlanded fix**; soften now or sequence the docs behind the fix.
- **`trustProxy: 1` is a hop count, not "trust all proxies".** `app.ts:75`
  (`TRUST_PROXY === 'true' ? 1 : false`); `proxy-addr` compiles a number `n` to `(addr,i) => i < n`.
  Correct for one reverse-proxy hop, but with CDN → nginx → app the list is
  `[nginx(socket), cfEdge, client]`, index 1 is untrusted, and `request.ip` = the CDN edge — so
  `TRUST_PROXY=true` does **not** always deliver "each client's real IP", and buckets still collapse.
- **The rate-limit key is per-/64 for IPv6**, not per-address (`rateLimitPlugin.ts` `IPV6_SUBNET = 64`),
  so "keys on the client's IP" is imprecise and shared-bucket guidance isn't NAT-only.

**Method that worked:** execute the validator's regex against every example the prose gives _and_
against examples the linked upstream spec gives — the second set is where the mismatch lives. Verify a
"fails at startup" claim by walking to the entrypoint (`server.ts` had no try/catch around
`buildApp()`; the only `try` wrapped `app.listen`) and confirming intermediate `catch` blocks _push
onto_ the error array rather than swallow.

## A guard applied to 1 of N sites of the same hazard — check the finding's own file first (#1912, PR #2028, 2026-08-06)

My M3 finding said `getAttachmentNote` interpolates `attachmentType` into a template-literal i18n
key, so a 4th `AttachmentType` member prints a raw key onto a bank-facing PDF. Fix landed as
`ATTACHMENT_TYPE_KEYS: Record<AttachmentType, string>` in `buildReportContent.ts`. Real guard (missing
property on the object literal; indexed access is total). **But `buildReportContent.ts` has five
union-into-`reportT()`-key sites and the fix covers one** — lines 143 `table.title.${useCase}`,
146 `sourceType.${source.sourceType}` (5-member `BudgetSourceType`), 204 `invoiceStatus.${status}`,
274 `coverLetter.subject.${useCase}` all still interpolate, all render into the same PDF. Line 204
even launders through `invoice.status as InvoiceStatus` — the exact widening-plus-cast shape the fix
removed two functions above. Same `AttachmentType` union is also interpolated at
`LinkedDocumentsSection.tsx:276`, plus ~a dozen status-union sites app-wide.

- **When a finding names one call site, grep the finding's own file before reviewing the fix.**
  The finding text is a sample, not a boundary — it names whatever the review chain happened to read.
- **Detection:** `grep -rEn 't\(`[^`]*\$\{' client/src` misses `reportT(` / `fixedT(` aliases. Grep the
  actual alias too. `_${count === 1 ? 'one' : 'other'}` plural suffixes are a closed boolean — not
  part of this class, filter them out.
- **Internal asymmetry is the tell:** the same PR argued (correctly, for the `toBcp47Locale` item)
  that "a fix covering two of six would not achieve the finding's stated purpose", then shipped 1 of 2
  for the key-map item. When one item in a batch widens scope on that reasoning, apply the reasoning
  to the _other_ items before approving.
- **Don't ask for 15 hand-written `Record` maps.** The generalisation is one small generic
  (`unionKeyMap<T extends string>(prefix, Record<T, true>)`); leave the shape to the follow-up.
- **Residual gap the `Record` does NOT close:** union↔map parity is enforced, map↔locale-JSON parity
  is not. A 4th member with a map entry and no `budget.json` key still prints a raw key. The map was
  module-private so no test could iterate it — ask for the export.
- Verify "live bug or latent drift" before setting severity: I loaded both `budget.json` files with
  python and diffed key sets against each union. All complete → medium, not high, approve.

**Required-parameter hardening is ADR-034's own principle, not merely "better than a runtime throw".**
Making `reportFormatters` required on `buildReportContent` (deleting six dead silent fallbacks) is
line 230's "when a hazard is enforced only by convention, remove the channel, not the individual
call", applied to the formatters channel exactly as #2001 applied it to `TFunction`. A runtime throw
would be worse than _both_ alternatives — it converts a silently-degraded bank PDF into an
export-time crash with no compile-time signal either way. **ADR-034 line 248 already documented the
6-arg signature with no optionality marker, so the change moved code toward the ADR — no Deviation
Log row.** The ADR now _under-claims_ (invariant 1 at line 206 describes injection as convention where
it is now compiler-enforced at the `buildReportContent` boundary). Under-claiming is the benign
direction: note it for the next ADR-034 pass, don't request changes.

**`toBcp47Locale` placement (the "is `formatters.ts` a grab-bag?" question).** Kept it there: all six
consumers feed the tag straight into `Intl`-backed calls (`getMonthName`/`getDayName`/
`formatDateForAria` in `calendarUtils`, `formatWeekdayMonthDay`, `createFormatters`), so it _is_ the
boundary `formatters.ts` owns. `GanttHeader`/`CalendarView` already imported it; only `MonthGrid`/
`WeekGrid` are new importers. The file is mildly grab-baggy already (`computeActualDuration`/
`computeWorkDuration` are arithmetic, not formatting) and the long-term shape is
`client/src/lib/locale.ts` owning `ResolvedLocale` + `toBcp47Locale`, with both `LocaleContext` and
`formatters` importing it — that also inverts the odd current direction of a pure module importing a
React context file for a type. **Trigger for doing it: a third locale-derivation helper.** ADR-034
invariant 4 (locale chosen once at the page boundary) is unaffected — `ReportWizardPage` is still the
only mapper.

**Checks worth repeating on refactor-only PRs:** `ReturnType<typeof X>` grep before approving a named
return interface (proves nothing depended on the structural-only relation); `composes:` must be the
first declaration in the rule and the composed class must not share properties with the composer
(source order decides, both being single-class selectors); grep the _old_ CSS-module class name across
`e2e/` — a POM `[class*="step4Body"]` locator survives a rename as a zero-match locator with Jest green.

## Fuzz the verbatim ports when a doc comment carries a proof (#1940, PR #2032)

When an AC's whole correctness rests on an induction argument written in a doc comment, a hand-trace
(mine, plus the dev-team-lead's) is two reads of the same reasoning, not two independent checks.
Copy the functions verbatim into a throwaway `.mjs` and fuzz the _stated postconditions_ across a
parameter space that includes the degenerate guards — 400k cases took under a minute and covered
the cascade, the mid-list runt, the hard-split path, and the meta-segment boundary at once.

**Why:** a hand-trace confirms the argument the author wrote; it does not search for the case the
author did not consider. Only randomized inputs do that.
**How to apply:** any PR whose doc comment says "and this bound holds at any depth / for all N".
Write the ports, assert the postconditions, `rm` the file before committing. Note that the harness
must be created with `Write` (the Bash tool refuses heredoc redirects inside a worktree session).

## A safety argument phrased as a _ratio_ is falsified by any clamp in the chain (#1940)

The #1940 ux spec argued the merge stays safe across all 96 subsets because "the threshold-to-ceiling
ratio stays roughly constant." False: `usageChunkCharsForWidth`'s **one-sided clamp** pins the
numerator's ceiling at 650 for every subset while `usageSafeTokenCharsForWidth` scales linearly with
width — the ratio runs ~3% to ~9.5%. The implementation was safe anyway (its bound is algebraic and
subset-independent), so this never became a defect — but the ratio sentence was on its way into a
code comment and the ADR.

**Why:** proportional-scaling arguments are the first thing a clamp, a floor, or a `Math.max` breaks,
and they are exactly the arguments that read as obviously true.
**How to apply:** whenever a spec or comment justifies safety by "both sides scale off the same
basis", grep the chain for `Math.min`/`Math.max`/`Math.floor` before letting the sentence land.

## Flex `gap` and a child's `margin` are ADDITIVE, not collapsing (#1941, PR #2033)

`EditableField.module.css`'s `.container` is `display: flex; flex-direction: column; gap: var(--spacing-2)`.
A new `.metaRow` child was given `margin-top: var(--spacing-1)`; the two **stack**, so the reset button's
spacing went 8px -> 12px on ordinary edits — a 50% regression to chrome nobody meant to touch (#1932's
already-approved sizing). Caught in review, fixed by dropping `margin-top` entirely. The ux-designer then
found the **same bug in their own spec** for the counter-showing case.

**Why:** people carry the block-layout intuition that adjacent margins collapse. Flex/grid `gap` does not
participate in margin collapsing at all — the child margin is added on top of the gap. It bit twice in one
PR, in the code and in the spec reviewing the code, which is the signature of a wrong mental model rather
than a slip.
**How to apply:** whenever a container owns its spacing via `gap`, no child may set `margin` in the gap
axis. Check this on any PR that introduces a new wrapper element inside an existing flex/grid container —
the symptom is only "looks slightly off", so no test catches it unless a DOM-shape assertion exists.
Recommended to @ux-designer for `Style-Guide.md` as a spacing-model rule (I don't own that page).

## A cohesive prop group modelled as N independent optionals (#1941, PR #2033)

`EditableField` gained four optionals: `maxLength` + three pre-translated hint strings. `hasMaxLength`
alone gates both `srOnly` spans and puts both ids in `aria-describedby`, so `maxLength={200}` with no
hints compiles clean, passes every test, and yields an `aria-describedby` pointing at two empty elements.
Invisible today (one consumer, all 8 call sites pass all four); bites at consumer #2. The fix is one
optional object prop (`lengthLimit?: { max, hint, overHint?, reachedAnnouncement }`) — absent/present
becomes a single discriminant and the compiler enforces the group.

**Why:** same family as "the-prop-landed-is-not-the-prop-is-wired" (#1910/PR #2004), but arriving through
the _type system_ instead of a call site. Optional props that are only correct together are a latent
contract, not a flexible API.
**How to apply:** when a shared component gains >1 optional prop for ONE feature, ask whether any subset is
legal. If not, make it one object. Note this is NOT an argument for the component calling
`useTranslation()` — the injection-only locale convention (same as `reportPdf/*`, ADR-034) is correct and
should be kept; only the grouping is wrong.

## An input cap coupled to a render budget: name the packer, not the arithmetic (#1941, PR #2033)

`USAGE_TEXT_MAX_LENGTH = 500` was documented as "leaving 150 chars for the derived suffix" under
`MAX_SAFE_USAGE_CHUNK_CHARS` (650). Three things wrong with that framing: (1) 650 is **not a cliff** —
`packUsageCellRows` splits the whole cell stream losslessly, so exceeding it costs a continuation row, not
content; (2) the 150 is **unenforceable** — `areaText` is aggregate-unbounded and `attachmentsNote` has no
`maxLength` at all, which is _why_ the bound was moved to the whole cell; (3) since #1973 the budget is
**computed** (`usageChunkCharsForWidth`), pinned at 650 only by a one-sided clamp against the narrowest
subset. #1940's `'… '` marker is orthogonal: it's applied post-packing to rows `i >= 1` only, so a
single-row cell never gets one and it cannot consume headroom.

**Why:** an arithmetic budget-split comment invites a guard test that pins a fiction. The true invariant is
`USAGE_TEXT_MAX_LENGTH < usageChunkCharsForWidth(USAGE_WIDTH_7COL)` — a typed value at the cap must fit one
row on its own — and it is the one that fails loudly if the Usage column ever narrows.
**How to apply:** before writing a guard for a "leaves N for X" comment, check whether X is bounded at all
and whether the consumer clips or paginates. Routed to #1950 (chunk-ceiling drift guard) rather than a
bespoke test; needs `USAGE_TEXT_MAX_LENGTH` exported. Keep the constant in the editor — an input
constraint living in the renderer inverts the dependency.

## A duplicate test with a stronger title, and when a comment beats machinery (#1953, PR #2035)

Two findings from reviewing the split of `LETTER_SUBJECT_FONT_SIZE` out of `SUBHEADER_FONT_SIZE` in
`client/src/lib/reportPdf/pageGeometry.ts`. The split itself was clean (own literal `12`, not an alias;
`headerFootprint()`/`PAGE_TOP_MARGIN` byte-identical; reason-carrying comment; inverted comment removed).

**(a) A new test whose assertions duplicate an existing test, under a title that claims more.**
`pageGeometry.test.ts:98-101` was assertion-for-assertion identical to the pre-existing test at lines
160-167 (`toBe(93)` + `toBe(Math.ceil(headerFootprint() + 15))`, order swapped) but titled _"PAGE_TOP_MARGIN
does not depend on letterSubject.fontSize"_ — a proposition its body never references. Zero added
discrimination; it catches exactly the older test's mutation set.

**Why:** QA's mutation evidence _corroborated_ rather than exposed it — "SUBHEADER 12→11 fails 4 tests"
reads as strong coverage, but two of the four are the duplicated pair. **A mutation count is not evidence
of independent coverage; it counts assertions, not propositions.** Compare each new test's failing-mutation
set against the existing suite's, not against zero. Same family as the PR #2008 "revert test proves a
different proposition than the one it licenses" and the PR #2004 r4 `count >= 1` finding.
**How to apply:** when a new test lands next to an existing one in the same file, diff the assertion bodies
before reading the titles. A title asserting a _negative dependency_ ("X does not depend on Y") whose body
never mentions Y is the tell.

**(b) When a comment is genuinely the right guard — the argument, not the shrug.**
Two adjacent `expect(...).toBe(12)` assertions protected only by a "do NOT deduplicate these" comment is
the right shape here. Not because no machinery exists, but because: (1) what is guarded is a _test's own
discrimination_ — collapsing it loses coverage, it does not regress production, since the production split
and its comment stand regardless; and (2) **any structural guard would have to encode the coupling you just
removed** — "these two `number`s must be permitted to differ" is not expressible in TS, and its closest
approximation is exactly what already exists: two identifiers, two literals. The production split _is_ the
structural guard.

Rejected strengthenings, both costing more than the comment: asserting the constant through its role in
`headerFootprint()` restates production's formula in the test (the very anti-pattern `pageGeometry.ts`'s
own header comment warns against, from #1929); mirroring the `TABLE_SMALL_FONT_SIZE` constant-to-style tie
needs a module-private constant exported purely to be read by a test.
**How to apply:** before proposing machinery for a test-integrity concern, ask what the failure mode
actually costs (coverage loss vs regression) and whether the enforcement would re-express the coupling
under removal. If both answers are "yes", a comment naming the _reason_ is the correct tool — and say so
affirmatively rather than as an absence of alternatives.

## A staleness guard protects only the value it returns — not the side effects on the way there (#2060, PR #2063)

`useInfiniteScroll` added an `epochRef` generation counter to fix a real stale-response race (#2061):
each fetch's completion handler checks `epoch !== epochRef.current` before applying `setItems`/`setStatus`.
Correct, well tested. But the consumer's `fetchPage` implementation (`DiaryPage.fetchDiaryPage`) called
`setTotalItems(...)` and `setError('')` **inside** the injected function, i.e. after the `await` but before
control returned to the guarded handler. So the hook discarded the superseded batch's _items_ while the
page had already committed that batch's _metadata_ — header total reading 100 over a 5-entry filtered list.
The bug the PR fixed, reproduced one layer up, in the same PR.

**Why it generalises:** a callback-injection contract (`fetchPage`, `onLoad`, a `loader` prop) draws its
staleness boundary at the _return value_. Anything the callback does to shared state on its own authority
is outside that boundary by construction, and no amount of guarding in the hook can reach it.

**How to apply:** whenever reviewing a hook/service that guards against superseded async results, do not
stop at "the guard is correct." Read the _injected_ function too and ask which of its statements execute
unconditionally. Two follow-through obligations:

1. The consumer guards its own side effects (capture the key at fetch-start, compare against a live ref).
2. **The contract must say so.** The hook's JSDoc for the injected function has to state that side effects
   inside it are not covered — otherwise consumer #2 repeats the defect and the review that catches it is
   luck. This is the "document the invariant, not the absence of code" rule applied to an injection seam.

Do NOT fix it by widening the page/result type with a metadata passthrough: that grows a shared contract
to carry one consumer's header count.

## A reset effect that clears "the data" but not the counters _describing_ the data (#2060, PR #2063)

Same hook: the `resetKey` effect cleared `items`/`hasMore`/`status` and left `fetchSequence` and
`lastBatchCount` untouched — while `fetchSequence`'s own JSDoc claimed it "distinguishes first batch
(=== 1) from appended batch (> 1)". After any filter change the freshly _replaced_ first batch carried
sequence > 1, so the consumer announced "5 more entries loaded" for a list that had just been discarded,
and the `initialLoadAnnouncement` key (added by its own bug fix, #2062) became unreachable for the rest of
the component's life.

**The tell:** a reset path enumerating state to clear is a _list_, and lists acquire members later than the
reset that consumes them. `fetchSequence` and `lastBatchCount` were added for a11y announcements _after_
the reset effect was written. Diff the `useState` declarations against the reset effect's setters — any
state variable not in both is either deliberately persistent (rare, and should carry a comment) or a bug.

**How to apply:** the documented meaning of the field is the contract; when they disagree, the
implementation is what is wrong. Also worth checking: no test pinned the buggy behaviour here, so the fix
cost nothing — but had one existed, weakening it would have been the wrong move (source-of-truth hierarchy).

## A shared component born inside one feature keeps that feature's namespace and testids (#2060, PR #2063)

`client/src/components/InfiniteScrollFooter/` correctly satisfied the "must be a reusable shared component"
AC by _location_, then read `t('diary:infiniteScroll.*')` and emitted `data-testid="diary-load-more-button"`.
Structurally reusable, practically not: consumer #2 must either duplicate the key block into its own
namespace or be labelled out of the diary namespace.

**The tell is usually inside the file itself** — here the sentinel was already generic
(`infinite-scroll-sentinel`) while its two siblings were `diary-`prefixed. Mixed generality in one
component's own identifiers means the extraction stopped halfway.

**The precedent to cite:** every shared component in `client/src/components/` uses `useTranslation('common')`
— `Modal`, `SearchPicker`, all seven `DataTable*` files — and `DataTable`, the direct analogue (shared list
infrastructure with its own pager), keeps its strings at `common:dataTable.pagination.*`. That makes this a
convention deviation with a named comparator, not an architect's taste.

**How to apply:** on any new component under `client/src/components/`, grep its own `t(` calls and testids
for a feature prefix. Split the keys: generic UI copy → `common.json`, feature-worded copy (a11y
announcements naming "diary entries") stays with the consumer. Cheap before consumer #2 exists, expensive
after. Also check the mirror case — a _required prop the component never reads_ (`hasMore` here, dead in the
interface while every decision derived from `status`): a brand-new shared contract that mandates dead work at
every future call site, and one the component's own tests won't catch because the prop factory supplies it.

**ROUND-2 OUTCOME (2026-09-04, commit `d77524a6`) — the fix chose a _different, better_ route than the one I
prescribed, twice.** Worth recording because "they didn't do what I said" was the wrong reflex both times:

1. On the staleness seam I explicitly wrote "do NOT widen `InfiniteScrollPage<T>` with a metadata
   passthrough." They widened it anyway — to `InfiniteScrollPage<T, M = undefined>` with optional `meta`,
   plus `onPageApplied(meta, page)` / `onPageFailed(err, page)` fired **inside** the epoch check. That is
   strictly better than my consumer-side ref guard: the default type parameter costs metadata-free consumers
   nothing, and the invariant now lives in the hook instead of being re-derived at every call site. **My
   objection had been to the _shape_ (a shared contract carrying one consumer's field) when the real
   requirement was the _location of the guard_.** State the requirement, not the implementation, or you will
   forbid the better fix.
2. On the diary-namespace finding I prescribed relocating keys to `common:infiniteScroll.*`. They instead
   made the component copy-agnostic — seven required label props, no `useTranslation` at all, plus a
   `testIdPrefix` prop (default `'infinite-scroll'`, `DiaryPage` passes `"diary"`). Also better: consumer #2
   controls copy _and_ testids without a shared namespace to collide in. **A shared namespace is only one of
   two ways to de-feature a component; prop injection is the other, and it is the stronger one when the copy
   is genuinely per-consumer.**

**New round-2 finding — hand-rolled `Singular`/`Plural` key suffixes instead of i18next's native
`_one`/`_other`.** `t('infiniteScroll.initialLoadAnnouncement' + suffix, { count })` with
`suffix = count === 1 ? 'Singular' : 'Plural'`. Works today (i18next probes `…Singular_one`, misses, falls
back to the base key) and en/de both have exactly 2 plural forms, so no live bug — which is exactly why it
survives CI and green tests. Three reasons it is still a blocking convention deviation:
`dashboard.json`/`budget.json` already use `_one`/`_other` with the same `{{count}}` (named comparator); a
call-site binary split **cannot express** a >2-category CLDR locale (pl/ru/cs/ar), and CLAUDE.md documents
an explicit add-a-locale path, so the constraint is real and the later fix touches call sites not JSON; and
a dynamically-built `t()` key defeats every static key audit — `i18n.parity.test.ts` compares en/de key
_sets_ and does no usage scan, so nothing in the repo covers it. **The trap:** a local precedent existed in
the same file (`page.entryCountSingular`/`Plural`, pre-existing on beta), which is what made the deviation
feel sanctioned. A precedent inside the file you are editing is weaker evidence than the convention across
the other namespace files — check both before calling something "consistent with the codebase."

**Also: CLAUDE.md's "Component Reuse Policy" shared-component list is a normative registry that nobody
maintains** — it still reads Badge/SearchPicker/Modal/Skeleton/EmptyState/FormError while `Spinner` and the
seven `DataTable*` files exist unlisted. New shared components must be added there (CLAUDE.md's own
Cross-Team Convention says so), but rate it LOW and say the list is already incomplete, or you are enforcing
a standard the repo demonstrably does not uphold.

### Verifying an i18n pluralization fix (#2060, PR #2063 round 3, 2026-09-04 — APPROVED)

Renaming `*Singular`/`*Plural` keys to `_one`/`_other` and deleting the suffix-building code **looks** self-
evidently correct in a diff, but the diff alone proves nothing: the suffix format is a runtime contract with
the i18next version, not a naming style. Three checks make the verification discriminating, and all three are
cheap:

1. **Version + config**: `_one`/`_other` is the v4 JSON format. Confirm the pinned `i18next` major supports
   it (26.3.6 here) **and** that `client/src/i18n/index.ts` sets no `compatibilityJSON` override — a v3
   override would silently reinstate `_plural` and break every renamed key with no type error.
2. **Convention, not invention**: grep `_one"` across `client/src/i18n/en/*.json` — budget.json (10) and
   dashboard.json (5) already use it, so the fix converges on house style rather than adding a third dialect.
3. **The assertion must be rendered text, not a key**: `DiaryPage.test.tsx` asserts `'1 more entry loaded'` /
   `'2 entries loaded'`. If the suffix format were wrong, i18next falls back and these fail. A test that
   asserts the *key name* (or that the key exists in JSON) passes under a broken format and is worthless as a
   guard. `i18n.parity.test.ts` compares en/de key **sets** only — it cannot catch a wrong suffix format
   either, since a consistently-wrong rename stays in parity.

**Recurrence of comment cross-reference rot** (see the #1939 entry above): the assertions were updated but
`DiaryPage.test.tsx:175` and `:564` still named the deleted `initialLoadAnnouncementSingular`/`Plural` in
prose. Renaming a key is a repo-wide grep, not a call-site edit — grep the old identifier in comments too.

**Round-3 discipline**: after two full rounds, a comment-only nit and a pre-existing same-shape anti-pattern
in an adjacent line (`page.entryCountSingular`, confirmed on `origin/beta`) are both explicitly non-blocking.
Say "do not respin for this" out loud in the verdict — otherwise a LOW finding reads as a fourth round, and
naming the pre-existing one without the beta provenance check invites scope creep into someone else's diff.
