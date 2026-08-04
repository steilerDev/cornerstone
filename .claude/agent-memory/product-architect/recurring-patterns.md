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

## Positive membership on a *shared fixture* row is not a filtering assertion (#1971, PR #1985)

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
failures for rows that matched by email.

## E2E user "cleanup" never frees the email — DELETE /api/users is a soft delete

`server/src/routes/users.ts` DELETE sets `deactivatedAt`; `userService.listUsers` returns deactivated rows
and the user-management page applies no default status filter. So `deleteUserViaApi` leaves the row visible
for the rest of the run, and `POST /api/users` still 409s on that email (`findByEmail` does not exclude
deactivated users). Consequences for review:

- A `finally`-block "delete" comment claiming the DB is left clean is wrong — say *deactivated*.
- Deterministic seed emails (`${testPrefix}@…`) are one-shot per DB. Currently masked because Playwright
  gives a retried test a fresh `workerIndex` (so `testPrefix` differs), but `--repeat-each` or a switch to
  `parallelIndex` would make `createLocalUserViaApi`'s `expect(response.ok())` fail and mask the real
  failure. Require `${testPrefix}-${Date.now()}@e2e-test.local` (precedent: `i18n-categories.spec.ts`).
- `deleteUserViaApi` ignores the response status, so cleanup failures in this family are always silent.
