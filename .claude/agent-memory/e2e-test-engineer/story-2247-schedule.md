---
name: story-2247-schedule
description: #2247 Schedule (panel, reschedule, agenda, view prefs) - POM API, isolated-user rule, mock scenario, static-only verification, assumptions to check first.
metadata:
  type: project
---

POM `TimelinePage`: toolbar (`toggleShow(key)`, `openShowMenu()`, `setGroup`, `chooseArea(fullPath)`), `surface()` ('agenda'|'chart'), `showChart()`, `panel*`/`reschedule*` locators, `rowFor/openRowPanel/openTaskPanel/openTaskPage`, `scrollPosition()` (header label under canvas left edge), `resetViewPreference()`/`storedView()`. Mock scenario `buildScheduleScenario()` + `SCHEDULE_IDS` in `fixtures/timelineMocks.ts`.

Rules learned: `schedule.view` is a per-user preference written by zoom/Show/Group/legend AND the phone Agenda/Chart toggle - every spec that clicks them (timeline-gantt, schedule-panel, schedule-scroll, timeline-responsive, timeline-milestones) runs `isolatedUserPerWorker` + `resetViewPreference()`; never switch to the chart on the shared admin. Phone default is Agenda (chart tests call `showChart()`); the panel Sheet element is always mounted (visibility:hidden when closed), the docked panel is an `<aside>` removed when closed. Group-by-area and the area chip need REAL areas (mock area ids are dropped as unknown); area option accessible name is the path ("Parent, Child"), match exact.
Verified statically only (tsc, eslint, prettier, --list); no live run.
