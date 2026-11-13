---
name: story-2249-purchase-page
description: '#2249 Purchase page: HouseholdItemDetailPage POM API, edit-URL redirect, lazy tab panels, scheduler-dependent facts, static-only caveats.'
metadata:
  type: project
---

POM `HouseholdItemDetailPage`: `goto(id,{tab,query,hash})`, `header`/`summary`/`tabs`, `orderedPrimary`/`deliveredPrimary` (StatusMenuControl, `actionToday`/`actionPickedDate`), `logPrimary`, `detailsCard` + `detail(field)`, `deliveryCard` + `delivery(field)` + `editDelivery`, `waitsFor` (row ids `work_item:<id>`/`milestone:<id>`), `grants`, `costLines` (Cost tab only), `selectedCompany`/`companyPicker` (inside Details form), `openDeleteModal()` via the ⋯ menu (no deleteButton). Documents trigger is `summary-fact-documents` now.

Facts: edit URLs (`/project/household-items/:id/edit`, legacy `/household-items/:id/edit`, `?edit=overview`) are LIVE redirects (31 frozen in legacy-url-walk); `householdItemEdit` is no longer a served page (no sweep/phase1 row). Delivery fact wording (Window vs Target) is NOT deterministic: any item's PATCH/dependency reschedules every purchase, so assert `/Target|Window/`. Late needs a PATCH of a delivery date/status (create never reschedules); earliest-only past date gives the generic reason (target is anchored to today). Specs: `purchase-page.spec.ts` P1-P13 + updated detail/dep-breadcrumb/create specs. Verified statically only (tsc, eslint, prettier, --list).
