---
name: system-event-specs
description: Hazards found speccing EPIC-21 #2223 (system events, metadata backfill, read-time collapse) — placeholder-stripped money labels, json_* on malformed JSON, window-collapse subject keys, read flags vs admin params, UX parameters the ADR never carried
metadata:
  type: feedback
---

Found while speccing #2223 (P2.4). Each was invisible in the AC text.

1. **Money-label counting strips `{{…}}` before counting words.** "Grant {{name}} went from {{from}} to {{to}}" normalises to "grant went from to": 4 words with a money word, so it counts as a rise. "Untitled grant" and "Refund of {{amount}} for invoice {{n}}" fail the same way. Put the noun in a `{{object}}` placeholder whose value is an exact glossary form ("Grant", "Refund"), or make the string longer than 4 words.
2. **`json_extract` raises on malformed JSON, and SQLite does not promise short-circuit `OR`.** Guard every json_* read in migrations and list queries with `CASE WHEN json_valid(x) THEN … END`.
3. **Read-time collapse (window `LAG` runs) needs a subject key wider than the ADR's.** Add any sub-entity id (deposit id inside an invoice subject) and the hidden flag. Add an `id` tie-break, or paging is not total; that is an ordering change and therefore a contract change.
4. **UX "show hidden" for members ≠ admin diagnostics param.** Do not reuse a planned admin-only name (`includeHidden`) for a different meaning. Return the hidden count from the server; never count on the client.
5. **UX wording can need parameters the ADR never stores** (amounts, offer vs invoice, payment ordinal). Diff every `‹param›` in the UX wording table against the metadata shape. Add optional snapshot fields, or drop what cannot be derived (no deposit ordinal exists).
6. **Removing an AppConfig field breaks typed test literals across ~10 server tests** (tsc, not Jest). Give QA the grep sweep list.
7. **A "remove the variable" AC conflicts with an ADR startup warning**: the literal must survive in config.ts and its test. Say so as a premise correction.

8. **A UX "acknowledged, with conditions" reply can overturn a spec decision.** In #2223 the condition was that row badges must use the chip words. The implementers followed the original spec, so the badges read "Status change" while the chips said "Task status". Diff every condition in the ack against the code at review time.

**How to apply:** for any event, audit-log or history story, and for any spec that adds short en strings containing glossary nouns.

Related: [[restructure-baseline-hazards]], [[read-time-projection-specs]], [[ux-visual-spec-verification]], [[diary-rules-specs]]
