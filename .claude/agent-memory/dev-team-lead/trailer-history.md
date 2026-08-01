# Trailer History — why the diff-derived trailer set is mandatory

Historically, commits landed on `beta` with only the `dev-team-lead` trailer despite `server/`/`client/` files clearly having been changed by an implementing agent. Issue #1820 found that 7 of 11 non-infra commits in one batch alone were missing the implementing agent's trailer.

This is why `[MODE: commit]` derives the required trailer set from the staged file diff (classified against CLAUDE.md's Delegation Enforcement rules 2-6) and unions it with the orchestrator's contributing-agents list, rather than trusting the passed-in list alone. The file diff is ground truth — the orchestrator's memory of which agents it launched is not. Never silently omit a trailer the diff requires; if the diff names an agent the orchestrator didn't list, add the trailer and flag the discrepancy in the response.
