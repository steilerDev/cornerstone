# Audit Incident History — why the full-coverage audit protocol is mandatory

Incidents behind the normative rules in the agent definition's "Full Coverage Audit" section:

- **Skipped step 2 (code → dictionary scan) missed 13 keys.** A prior naive audit relied on parity checks only and missed 13 keys that were referenced in code but present in **neither** locale — including a user-visible bug on the Area UI (raw translation keys shown in the English locale). A parity check alone can never catch keys missing from both locales; only the code → dictionary scan (protocol step 2) finds them.
- **Loose substring greps flagged 52 false positives.** A prior audit grepped for loose substrings like `'success'` and `'q'`, which matched `showToast('success', ...)`, URL query params (`searchParams.get('q')`), and other non-translation strings — 52 false positives in one run.

Lessons: run all four protocol steps in order, never weaken the protocol to save time, and back every claim with a concrete `file:line` reference.
