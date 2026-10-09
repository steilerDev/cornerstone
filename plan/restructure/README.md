# UX restructure governance (EPIC-21)

This directory holds the data and tooling that keep the EPIC-21 restructure honest: every capability
keeps a place, every URL keeps working, and the UI never grows more patterns than it has today. CI runs
the checks on every pull request (`Static Analysis` job).

Rules live in [ADR-038](https://github.com/steilerDev/cornerstone/wiki/ADR-038-Information-Architecture-v2)
(reachability rule section 4, click-counting rule section 5) and the wiki
[Route Map](https://github.com/steilerDev/cornerstone/wiki/Route-Map).

## Commands

| Command              | What it does                                                                           |
| -------------------- | -------------------------------------------------------------------------------------- |
| `npm run plan:check` | Runs every check, changes nothing. Exit 1 when any part fails. This is what CI runs.   |
| `npm run plan:build` | Regenerates the generated files below. Refuses to write while the baseline would rise. |
| `npm run test:plan`  | Runs the builder unit tests (`node --test`).                                           |

Each builder also runs alone: `node plan/restructure/scripts/<script>.mjs [--check|--write]`.
Exit codes: 0 ok, 1 findings, 2 usage or IO error.

## Files

| File                 | Kind                    | Purpose                                                                                                                                                                                                                                |
| -------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capabilities.json`  | curated                 | Capability inventory: id, domain, frequency, where it lives today.                                                                                                                                                                     |
| `capmap.json`        | curated                 | Where each capability goes: `to`, `change`, `gate`, `clicks`, `clickPath`.                                                                                                                                                             |
| `routemap.json`      | curated                 | Every URL the router serves or will serve, and where it lands.                                                                                                                                                                         |
| `router-routes.json` | generated, never edited | Routes extracted from `client/src/App.tsx`. Drift fails CI.                                                                                                                                                                            |
| `summary.json`       | generated, never edited | Counts derived from the capability map and route map.                                                                                                                                                                                  |
| `baseline.json`      | generated + audited     | Measured UI pattern counts (`measured`), planned additions (`allowedAdditions`) and hand-audited inventories (`audited`). `plan:build` rewrites `measured` and moves consumed names out of `allowedAdditions`; `audited` is untouched. |
| `scripts/*.mjs`      | tooling                 | Builders and checks. Pure functions are exported for the tests.                                                                                                                                                                        |

Generated files change only through `npm run plan:build`. If `plan:check` reports one as stale, run
the build and commit the result.

## Capability map rules

- A capability may be moved, merged or tucked away, but never removed. Every inventory id needs a
  placement in `capmap.json`: a non-empty `to` and a `change` of `same`, `demoted`, `promoted`,
  `consolidated-entry-points`, `merged` or `moved`. A missing entry or `removed` fails the check.
- `gate` is one of `none`, `paperless`, `paperless+ai`, `ai`, `oidc`.
- A demoted capability must carry `clicks` (an integer, at most 2) and a `clickPath`. The click path
  marks each step with its number, for example `Page > Menu (1) > Item (2)`. Alternatives are separated
  by `;`. The highest marker of each alternative counts, and `clicks` must equal the lowest alternative.
- Count clicks with the rule in ADR-038 section 5: start from the object's page already loaded; each
  click or tap that opens a page, tab, menu, dialog, sheet or collapsed section, or triggers a control,
  counts; typing, choosing inside an already open field, scrolling, dismissing a toast and keyboard
  shortcuts do not; a path that needs hover is not reachable.
- Every app path written in parentheses in `to` must exist in the route map.

## Route map rules

- Every route the router serves has an entry whose `from` (before any `?query`, `#anchor` or
  ` (condition)`) equals the router path. Adding a route in `App.tsx` without a route-map entry fails.
- Every entry other than `new`, `repair`, `query-map` and `conditional` must be served by the router
  today.
- Fields: `kind` (`page` or `redirect`), `change` (one of the eleven values in the wiki legend), `guard`
  (`public`, `member`, `admin`), `gate` (`none`, `paperless`, `paperless+ai`), `permanent` (boolean),
  `carries` (list of strings), `section` and `note` (non-empty). No duplicate `from`.
- Permanent URLs are written outside the app and are never removed.

## Pattern baseline: counting rules

`build-baseline.mjs` measures `client/src` and fails when a number rises. The rules, verbatim:

- **Screen** = each directory `client/src/pages/<Dir>/` (excluding `pages/shared`) plus `shell` =
  `client/src/components/AppShell/AppShell.tsx`. The closure of a screen is its non-test `.tsx`/`.ts`
  files plus every module reached transitively through relative static or dynamic imports inside
  `client/src/` (`.js` maps to `.tsx` or `.ts`, `/index.js` to `index.tsx` or `index.ts`; `*.test.*` is
  skipped). A screen's count is the sum of per-file counts over the distinct files of its closure (a
  static upper bound that includes dialogs).
- **destinations**: JSX `Link` or `NavLink` imported from `react-router-dom`, plus object literals in
  array literals that have a `to` property.
- **primaryButtons**: JSX whose `className` expression contains `X.Y`, where `X` is a default import
  from a `*.module.css` and `Y` is primary in that file. `Y` is primary when a rule whose selector list
  contains `.Y` as a plain class declares `background` or `background-color` exactly
  `var(--color-primary)`, or has `composes: Z [from '<file>']` where `Z` is primary (recursively).
- **searchFields**: an intrinsic `<input>` with `type="search"` or `role="searchbox"`, or whose
  `placeholder` or `aria-label` is `t('...')` with a key containing `search` (case-insensitive).
  `components/SearchPicker/` and `*Picker*.tsx` are excluded.
- **sharedComponents**: names (path relative to `components/`, without extension) of non-test
  PascalCase `.tsx` files under `client/src/components/**` that (a) sit in a same-basename directory
  (`Foo/Foo.tsx`) or (b) sit directly in a lowercase domain directory (`budget/`, `diary/`). Helpers in
  PascalCase directories do not count.
- **moneyLabels**: distinct normalised `en` values across `client/src/i18n/en/*.json` (flattened;
  `{{...}}` removed; trailing `:`, `...` and whitespace trimmed; spaces collapsed; lowercased) of at most
  four words that contain, as whole words, one of: remaining, budget(ed), cost(s), paid, unpaid,
  outstanding, amount, total, spent, spend, (un|over)allocated, allocated, claimable, claimed, payback,
  headroom, overflow, net, committed, utilised/utilized, available, balance, price, estimate(d),
  funding, grant(s), subsidy/subsidies, left to spend, to pay, deposit(s), refund(s), (un)invoiced,
  payable, expected cost, actual cost, planned cost.
- **windowConfirm**: `window.confirm(` calls in non-test client files.
- **handRolledDialogs**: intrinsic JSX with `role="dialog"` or `aria-modal`, outside
  `components/Modal/`.

Comparison: a rise is any measured number above the baseline, any new money label, or any new shared
component that is not listed in `allowedAdditions.sharedComponents` (matched by basename). A screen
missing from the baseline only counts as a rise when it has more than one primary button or more than
one search field.

### Changing the baseline

- Any pull request that triggers the "baseline is behind" notice (a drop, a new screen, or a consumed
  addition) commits the output of `npm run plan:build`.
- `plan:build` refuses to write while an unallowed rise exists. A shared component outside the seeded
  list enters `allowedAdditions` only with dev-team-lead approval in that PR; `plan:build` moves a name
  out of the list once the component exists.
- A change to a counting rule (for example when stories 0.10 and 0.12 move navigation into the shared
  NavConfig) is made in the same PR that changes the mechanics, with dev-team-lead approval, and must
  not hide a real rise.
- `audited` holds hand-audited inventories (create, save and confirmation patterns). `plan:build` never
  rewrites it; change it by hand in the PR that changes the patterns.

## Privacy (Q18)

Real household data never enters this repository, its issues, pull requests or wiki. Everything under
this directory uses synthetic data only: no real names, street addresses, phone numbers, email
addresses, bank details, vendor names or money amounts.

`scripts/scan-privacy.mjs` enforces it. Profile `full` (used on this directory) flags emails, phone
numbers, IBANs, street addresses, postcode and city pairs, and any digit next to a currency marker.
Profile `contact` (used on pull request titles and bodies) skips money. Allowed email addresses are
those on `example.com`, `.org` and `.net`, `*.example`, `*.test`, `*.invalid`, GitHub's no-reply domain
and the Claude attribution address.

For a stronger local check, point the scanner at a private database copy:

```
node plan/restructure/scripts/scan-privacy.mjs --denylist-db <path-to-private.db> plan/restructure
```

The scanner reads the database read-only, builds a list of real names, contacts, addresses, invoice
numbers and amounts in memory, and never writes it to disk. Findings are printed masked (first
character, then asterisks). CI cannot run this check because the database is private; run it locally
before pushing.
