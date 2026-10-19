# Dev Team Lead Memory

## THREE-MODE PROTOCOL

You operate in three modes: `[MODE: spec]`, `[MODE: review]`, `[MODE: commit]`. You never launch agents or modify production files. You return structured specs that the orchestrator routes to implementation agents.

- **spec**: Read wiki/codebase, decompose work, return structured implementation spec document
- **review**: Read modified files, compare against spec/contract/standards, return VERDICT
- **commit**: Stage, commit with trailers, push, create PR, watch CI. If CI fails, return fix spec (don't fix directly)

## Effective Spec Patterns

- **Small fix**: "In file X line Y, change A to B because Z"
- **Reference-based**: "Follow the pattern in file X to create file Y with these differences: ..."
- **Full feature**: Files to create, types, signatures, reference files, contract excerpts, verification checklist

## Index

- [Sandbox & worktree environment quirks](sandbox-environment.md) — borrowed node_modules → stale @cornerstone/*, node_modules fixes, /tmp npm-ci workaround on mounted FS, no pre-commit hook, actionlint via docker, wiki submodule quirks
- [Testing patterns (Jest/TS/React)](testing-patterns.md) — ThemeProvider over mocking ThemeContext, JSX.Element typing workaround, dynamic-import timing, matcher misuse, overly-broad absence regexes, locale-matrix literal expectations, pdfmake post-render geometry
- [Code patterns confirmed during review](code-patterns.md) — drizzle `sql.join`, CSS cross-imports, silent drops: strict LLM json_schema keys, Modal initial focus, hyphenated aria props, portaled listbox off Tab order, stacked JSDoc on tuple conversions
- [Meta-skill reconciliation (issue #1819)](meta-skill-reconciliation.md) — gh project item-add pattern, CLAUDE.md drifts fast, orchestrator has no trailer, worktree cleanup sequence, count-every-occurrence self-check gap
- [Trailer history (issue #1820)](trailer-history.md) — why [MODE: commit] derives trailers from the staged diff instead of trusting the orchestrator's list; 7 of 11 non-infra commits once shipped missing implementer trailers
- [Shared-component extension specs](shared-component-extension-specs.md) — the 3 host-infrastructure hazards to pre-empt when a page-mode extends DataTable (useTableState filter sweep, column-pref wipe, API param whitelist) + 2 found late
- [Infinite-scroll consumer hazards](infinite-scroll-consumer-hazards.md) — scroll root, IO re-observe, client-filter empty batches, focus loss on disable/hide/unmount (incl. hide-guard fixes), jsdom IO
- [Form prefill hazards](form-prefill-hazards.md) — seeded-from-entity fields are protected from AI overwrite; initial-state/cross-field errors must be visible when submit is disabled
- [Review-round discipline](review-round-discipline.md) — re-derive "accepted deviation" severity; green Jest ≠ rendering; tsc test files (--pretty false); scripted i18n key resolution; read code beside the diff
- [CI gate design hazards](ci-gate-design.md) — repo-wide checks behind path filters let drift land; skipped!=passed; validate YAML via actionlint + truth table
- [Dependency override pitfalls](dependency-overrides-pitfalls.md) — stale pins, silent workspace overrides, bundled deps, hoisting anchors, mixed Babel, `npm update` after bound moves, scanner-only fixes
- [Account provisioning hazards](account-provisioning-hazards.md) — setup lockout, case-variant email dup, untestable in-process collision path, AppConfig fixture breakage
- [Parallel frontend split](parallel-frontend-split.md) — en-namespace ownership per FE group, final-step lint rule, 5 error-message leak classes to inventory
- [Global aggregate page specs](global-aggregate-page-specs.md) — shared E2E DB scoping, drafts, disabled-at-end focus drop (useLayoutEffect), scoped document keydown, h1 in every state
- [Crash-recovery swap specs](crash-recovery-specs.md) — per-loop marker phases, atomic marker, basenames, marker-last, no data-deleting sweep, rw SQLite staging validation
- [Unmodified-tests constraint](unmodified-tests-constraint.md) — optional props/fields, dynamic import past partial ESM mocks, new test files
- [Governance story specs](governance-story-specs.md) — owners for plan/.claude/.github/CLAUDE.md, residual policy text in pr-review.js, privacy scanner w/o leaking denylist
- [Restructure i18n specs](restructure-i18n-specs.md) — new en money-word values fail plan:check baseline; canonical statusVocabulary sets; transition rule; §2.0 supersedes
- [Invariant removal specs](invariant-removal-specs.md) — grep every guard under the error code incl. inverse paths; lock-step ERROR_CODES/en/de; advisory client mirrors; docs
- [Status vocabulary switch specs](status-vocabulary-switch-specs.md) — hidden parallel colour maps/literal label maps, partial canonical sets, PDF getFixedT ns, banned-word test scope
- [UX visual spec verification](ux-visual-spec-verification.md) — named tokens exist, money labels vs baseline, token-remap pair scan + ratchet, "already done" premises
- [Restructure baseline hazards](restructure-baseline-hazards.md) — closure-wide counts: `<a>`→`<Link>` in a shared component raises destinations; use useHref+useLinkClickHandler
- [Empty-state replacement & calendar segments](empty-state-replacement-specs.md) — unmocked E2E break when EmptyState replaces a grid; unfiltered emptiness; segments in gridcells; count every stacked kind
- [Read-time projection specs](read-time-projection-specs.md) — stale updated_at ETags, partial module mocks, stored-vs-two-run fallback, E2E timeline mocks, client second sources
- [Route-map staging specs](route-map-staging-specs.md) — stage/interim for unbuilt targets, E2E has no shared/dist, plan tools transpile TS, fs tests in client, unmocked gates
- [URL-state & search specs](url-state-specs.md) — history.state survives reload (test goto), waitForURL globs vs new ?params, RR7 transition drops keystrokes, scanner phones
- [Nav shell specs](nav-shell-specs.md) — orphaned pages, interim views, NavLink double-highlight, sticky trap, ARIA selectors in E2E, hidden-dialog role, baseline in shell chrome, shim limits, per-project E2E inventory, smart Back keyed by history idx, unserved rows
- [Grammar component specs](grammar-component-specs.md) — closure-counted primaries in shared comps, persistent alert region vs E2E, portal CSS vars, a11y suffix vs textContent, dry-run delete counts, W3 ledger
- [Page identity specs](page-identity-specs.md) — title effect ordering (layout fallback + passive page hook), views never show Back, validate origin state, smoke title, capmap vs UX, stale auth post-login, `/\` redirect, tab-effect pushes, static-page origin labels
- [Dialog route specs](dialog-route-specs.md) — background location w/o useBlocker, host outside Routes (real URL + shell baseline), title re-assert, shortcuts under modals, n fallback, menu-row opener
- [Command search specs](command-search-specs.md) — apiClient wraps AbortError/no 401, stopPropagation vs document keys (capture), trap counts tabindex=-1, opener-first restore
- [Object home move specs](object-home-move-specs.md) — ObjectForm raises page primaries (App-root provider), field names = API keys, stacked Modals, rename clears i18n key, label-in-name
- [Settings page re-layout specs](settings-page-relayout-specs.md) — atomic status around buttons, t()-keyed refetch, ConfirmDialog tone vs closure, `formerly` headings, rate-limited E2E, rAF hash focus
- [Project setup specs](project-setup-specs.md) — suppressed in-use details, page-served query maps = interim 'page', routeUrl on planned ids, `to` in arrays, glossary-noun templates
- [Search service specs](search-service-specs.md) — fold fn on every connection, fold-then-escape, Paperless timeout helper, no UI words from server, planned-route interim mapper, phone literals vs scan
- [Server-search picker specs](server-search-picker-specs.md) — capped-list → SearchPicker: focus-to-body on select, entity filter vs portaled listbox, enum vs eq, baseline sim
- [Integrations page specs](integrations-page-specs.md) — statusVocabulary leaves = glossary terms, new components/ dir = baseline rise, NavAnchor uncounted, admin-only fields on member screens, userinfo in URLs
- [Auth gate specs](auth-gate-specs.md) — /auth/me never 401s; only 401 or user:null signs out; no catch-alls; refresh keeps user; fail-closed; abort E2E recipe
- [Users unlock specs](users-unlock-specs.md) — GET /api/users is member-visible, union-key ns closed list, portaled menu vs row POMs, dead sortKey, closure≠per-page primary
- [Areas index specs](areas-index-specs.md) — sharedComponents counts only X/X.tsx, dialog-file exports leak primaries, routemap.json has no stage, delete Undo is a contract change, contract 19 has no blockers
- [Diary rules specs](diary-rules-specs.md) — first-content rule is client-only, undo snapshot vs type change, falsy-body merges, planned-contract status drift, photo dates
- [Entry point specs](entry-point-specs.md) — carries = shared/ (backend), POM prefix selectors, consume/apply split, same-URL remount, getUserMedia needs no gesture
- [System event specs](system-event-specs.md) — placeholder-stripped money labels, json_valid guards, collapse subject keys + tie-break, member vs admin hidden param, UX params ADR lacks
- [History page specs](history-page-specs.md) — page-base query maps can't be live, planned item shape vs shipped renderer, derived filters vs UX, snapshot fields for links, pre-measure baseline
- [Diary list specs](diary-list-specs.md) — AnchoredPanel vs portaled picker, infinite-scroll reset clears items, role=article in ul, test-only folders, list-side draft discard
- [Photos spots specs](photos-spots-specs.md) — measure closures first, Link in shared panels leaks, restore-kind Undo is generic, unmount shell bars, redefined URLs
- [Capture screen specs](capture-screen-specs.md) — planned allowedAdditions names, no in-app leave blocker, WebKit no fake camera, existing shell/formatter helpers, insecure context, draft URL remount, plan tap budgets miss the sheet tap, post-unmount navigate
