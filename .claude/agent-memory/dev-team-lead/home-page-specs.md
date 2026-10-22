---
name: home-page-specs
description: Hazards found speccing EPIC-21 #2230 (Home on the attention + money services) — defects.json pins deleted tests, actions need ids rows lack, union sets can't hold plurals, FeedGroup always wraps a ul, last interim alias, capmap acceptance vs UX
metadata:
  type: feedback
---

Found while speccing #2230 (P3.3). None of these showed in the AC or the UX visual spec.

1. **`plan/restructure/defects.json` lists test files by path** (D-01..D-05 pointed at the card tests and `dashboard.spec.ts`). Retiring components deletes them, and `plan:check` fails. In the spec, name which new test file must contain each `D-xx` token, and give the architect the retarget. Keep the defect entry; change only its paths.
2. **A row action can need an id the row does not carry.** `changeInvoiceStatus(vendorId, …)` needs the company id, but attention N4–N6 had only `companyName`. Walk every inline action's API signature against the row params before speccing the UI. Fix it additively on the server.
3. **`I18N_UNION_KEYS` sets need string leaves**, so plural (`_one`/`_other`) keys cannot be union-built. Choose a rule-dependent plural sentence with an exhaustive `switch` over literal keys plus `assertNever`. Keep union sets for the non-plural labels (tiers, actions, kinds).
4. **`FeedGroup` wrapped children in `<ul>`.** Section frames with strips, grids or EmptyState need a `list={false}` mode. Check a reused "frame" component's DOM before mapping UX sections onto it.
5. **Flipping the last interim alias** (`home` → done) leaves alias-loop tests (`pageIdentity.interimAlias.test.ts`) with no real fixture. Tell QA to mock the route entry and keep the production path.
6. **UX count strings hit the money baseline**: "n invoices to pay" ("to pay") and "Add a funding source" (4 words, "funding"). Reword them in the spec and say so.
7. **Capmap acceptance can contradict the UX spec** (PLT-049: Needs attention cannot be hidden; UX: hideable). Follow the capmap, list it as an owner decision, and amend acceptance text only with PO sign-off.
8. **"Every figure equals the page it links to" can fail because the target page is a later story** (the Money overview headline is 4.5). Surface it as an owner decision with a default, rather than silently pulling the later story in.

**How to apply:** any story that retires components, renders another service's rows with actions, or adds a page over aggregate endpoints. Related: [[attention-service-specs]], [[money-service-specs]], [[restructure-i18n-specs]], [[areas-index-specs]], [[diary-list-specs]]
