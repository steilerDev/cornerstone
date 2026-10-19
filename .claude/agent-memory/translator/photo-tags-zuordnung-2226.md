---
name: photo-tags-zuordnung-2226
description: German term for the photo "tags" concept (Area + Orientation, plus Caption in the details editor) is "Zuordnung"; used across photos.json for #2226
metadata:
  type: project
---

"Tags" is not a glossary term. In `de/photos.json` (#2226) the photo area/orientation assignment is "Zuordnung" everywhere: `select.setTags` "Zuordnung festlegen", `bulk.title_*` "Zuordnung für N Fotos festlegen", `viewer.editTags` "Zuordnung bearbeiten", `viewer.saveTags` / `tagsSaved` / `tagsError`.

**Why:** the spec asked for one plain German phrase consistent across the bulk dialog and the details editor; "Tags" has no glossary entry, so no glossary change was made.

**How to apply:** reuse "Zuordnung" for any new tag-assignment label. Use "Bereich und Ausrichtung" only where the label names the two fields explicitly.

Open point: `spots.areaLinkSuffix` is ", in Bereiche öffnen", using the shipped `common:navigation.areas` word "Bereiche" as the spec required. A native reviewer may prefer a different phrasing.
