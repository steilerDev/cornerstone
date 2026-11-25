---
name: accessibility-pass-specs
description: Hazards when speccing app-wide a11y work (#2261) — translucent focus tokens, invalid drop-shadow spread, output's implicit status role, accessible-name churn, fragment skip links, control-border vs border-strong
metadata:
  type: feedback
---

Found while speccing #2261 (P6.2, WCAG 2.1 AA pass).

1. **Grep focus _variants_, not just `--shadow-focus`.** `-subtle`/`-danger` halos (10–15% alpha) were the only indicator on many buttons. A scan "outline:none without a solid ring in the same or a sibling :focus rule" found about 25 real offenders. Spec a static guard with a frozen allowlist for tabIndex=-1 targets.
2. **`drop-shadow()` takes no spread.** `drop-shadow(0 0 0 3px …)` discards the whole `filter`, so Gantt focus was invisible. SVG focus needs `outline`, because box-shadow does not apply to SVG.
3. **`<output>` is an implicit `role=status` live region.** The "labelable output" fix for a picker's selected state would have collided with 53 unit and 27 E2E `role=status` queries. A read-only `<input>` would collide with "textbox gone after select" tests. Use role=group + aria-labelledby resolved from `label[for=id]`.
4. **Changing an accessible name costs about 100 RTL edits.** RTL name matching is exact by default, while Playwright is substring by default. Count the `exact` and RTL hits before you accept a UX name change, and put the edits in the QA spec.
5. **A skip link must not navigate to `#id` in this SPA.** A fragment push breaks history-idx smart Back. Use onClick: preventDefault, add tabindex=-1 lazily, then focus. A permanent tabIndex on main makes every text click focus main.
6. **1.4.11 control borders:** `--color-border-strong` (gray-300) measures 1.47:1. Add a control-only token instead of darkening 108 decorative borders. Measure on bg-tertiary in dark (the binding pair). `--color-slate-250` is a banned (removed) token name.

7. **Review: token deletions leave husks.** Deleting a token group left empty `/* --- Focus ring --- */` headers and a doubled comment above the rewritten block in tokens.css. Lint and the contrast guard do not catch it; grep the diff context around deleted token lines.
8. **Review: uncommitted wiki edits.** The architect edited `wiki/*.md` but did not commit inside the submodule (`git status` shows ` m wiki`, not ` M wiki`). Check `git -C wiki status` before commit mode.
9. **Review: a rename sweep over-loosens selectors for other components.** When SearchPicker's clear button became "Clear selection: {title}", E2E also turned exact `/^Clear selection$/` POM locators for selection _bars_ (budget/diary namespaces) into prefix regexes. Those now also match picker chips, and a `.first()` call can click the wrong button. In the spec, list which POM locators target the renamed component, and say that the old exact form stays for the others (the rename makes them unique).
10. **Review: "wait until no animation runs" hangs on infinite animations.** A focus-sweep helper waited on `getAnimations().every(a => a.playState !== 'running')`. A spinner, a skeleton pulse or a live dot runs forever, so the wait only ends at the test timeout. Reuse `settleTransitions` from `e2e/fixtures/darkMode.ts`, which skips infinite animations.
11. **CI: a full axe sweep surfaces pre-existing shell defects on every page.** A badge inside a link with an `aria-label` fails `label-content-name-mismatch`: axe takes visible text including `aria-hidden` content in DOM order ("3 Home"), and the name tokens must contain it contiguously. Put the label before the badge in the DOM (CSS `order` for the visual), and grep the shell (BottomBar, Sidebar, TopBar) for `aria-label` + visible text before the E2E run. Same sweep caught `role=feed` without `article` children and an inline link with colour-only distinction (`link-in-text-block`: underline by default).

**Why:** each of these would have surfaced as a fix loop or broken suites late in CI.

Related: [[ux-visual-spec-verification]], [[restructure-baseline-hazards]], [[nav-shell-specs]]
