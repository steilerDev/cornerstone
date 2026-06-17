---
name: Standalone photo/lightbox stories (no active parent epic)
description: Index of standalone photo-capture/lightbox/picker Todo items. The natural parents (EPIC-13 Construction Diary #446, photo-annotation epic #1472) are CLOSED; no open photo epic exists.
metadata:
  type: project
---

Photo work after EPIC-13 (#446) and the photo-annotation epic (#1472) closed lands as standalone issues. There is no open photo/diary epic, so these are filed without a parent (accept ungrouped rather than re-open a closed epic).

**Why:** natural parents are closed; #1674 (the mobile photo capture story) was itself filed standalone for the same reason.

**How to apply:** if photo-domain standalone items grow to >=4, propose a new photo epic at the next planning cycle. Until then, file standalone with `user-story` label, add to board #4, set Todo, no `addSubIssue`.

## Terminology mapping (verified vs origin/beta code)

- User's "direction picker" = **OrientationPicker** (`client/src/components/OrientationPicker/OrientationPicker.tsx`) — compass orientation, user-configurable, already shows description as secondary line.
- User's "area picker" and "location picker" are the SAME = **AreaPicker** (`client/src/components/AreaPicker/AreaPicker.tsx`) — areas are a floor->room parent/child hierarchy; uses em-dash depth indentation.
- Lightbox `PhotoMetadataSidepanel.tsx` historically used a raw inline `SearchPicker<AreaResponse>` (flat, no indentation/ancestors) instead of the shared AreaPicker — the "inconsistent across uses" complaint.
- Both area + orientation backend search match name only (`LOWER(name) LIKE`). `AreaResponse` has `parentId` + `description` but no `ancestors` array (derive client-side via `areaTreeUtils.ts`).

## Items

- **#1674** — Mobile photo capture flow + metadata modal + Orientation entity (CLOSED/released on beta 2026-06-15 via PR #1676). Standalone.
- **#1723** — Photo lightbox pickers: hierarchy-aware AreaPicker (indentation + ancestor secondary line) and description-aware OrientationPicker search (Todo, 2026-06-16). Follow-up to #1674/#1676, direct user report, deliver as ONE combined PR. 18 ACs across 5 sections. Architect decision flagged: client-side vs server-side hierarchy-aware area search; orientation description-match likely needs backend search change.
