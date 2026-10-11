---
name: story-2210-client-search-tests
description: Client search slice tests (#2210): gate via unstable_mockModule, AC4 data all resolves, never-guards return raw value
metadata:
  type: project
---

Run client jest as `node --experimental-vm-modules node_modules/.bin/jest <files>` and filter the "Jest: importing JSON" noise; bare `npx jest` breaks on the shared TS target.
No served route is Paperless-gated: test the gate in a separate `*.gate.test.ts` patching getRouteEntry (see navConfig.gate.test.ts).
All AC4 words resolve from the real glossary and TERM_EXTRAS; no data gap. `Specialty` (Trade) and `Bereiche` (Area, planned) intentionally have no served destination.
`return unreachable` (never) guards return the raw input, not null: pin via `.kind` undefined.
Interim pins: `getRouteEntry(area|documents).stage === 'planned'` fails when the flipping story lands, by design.
