---
name: story-2246-purchases-companies-milestones
description: #2246 Purchases/Companies/Milestones on ObjectList - shared ObjectListControl POM, what changed in old specs, static-only verification, assumptions to check first.
metadata:
  type: project
---

`e2e/pages/components/ObjectListControl.ts` is the shared ObjectList POM (prefix, `.visible()` row parts, chips/More menu, Group/Sort `chooseMenuOption`, Filters surface, columnHeader). `HouseholdItemsPage`, `VendorsPage`, `MilestonesPage` compose it as `.olist`. Old `search()` of HouseholdItemsPage still navigates (`?q=`); `typeSearch()` types.

Facts: headings carry a count ("Purchases (3)") so exact-name heading locators break (use `/^Name( \(\d+\))?$/`); Card surface has NO secondary line (category, grant chips, description) and no Offers/Last on site/Holds up; Companies list mounts after trades load; trade chips = top 4 by vendorCount + selected one (a trade with 0 companies has no chip unless selected via `?tradeId=`); the template empty state has no action button (header primary stays); Purchases Delivered group collapsed by default.
Companies O3 rewrites the `/api/trades` answer (route.fetch + vendorCount) so chips are deterministic under parallel workers.
datatable-ux-fixes retargeted to Users settings page; date-range spec deleted.
