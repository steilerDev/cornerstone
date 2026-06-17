---
sidebar_position: 3
title: Capturing Photos
---

# Capturing Photos

Photos are attached to [diary entries](manual-entries) and document progress, deliveries, issues, and site conditions. Cornerstone's photo flow is built mobile-first: you can snap a photo with your phone camera on site, tag it with where it was taken and which way it faces, and have it uploaded to the entry in a couple of taps.

## Adding photos

Open a diary entry for editing and use the **Add Photos** control. On a phone or tablet this offers your device camera as well as the photo library; on a desktop you can pick files or drag and drop them onto the upload area.

You can add one photo or several at once. Each file uploads as soon as it is queued -- there is no separate "submit" step -- and the upload queue shows progress per file with the option to retry any that fail.

## The photo details modal

When you pick a photo, Cornerstone opens a **photo details** modal before the upload completes so you can tag the shot while the context is fresh. A **preview of the selected photo** appears at the top of the modal so you can confirm you picked the right shot before filling in the details below:

| Field | Description |
|-------|-------------|
| **Description** | An optional caption (up to 500 characters). The placeholder reads *Add a description… (optional)*. |
| **Area** | The [area](/guides/work-items/areas-and-trades) the photo was taken in -- pick from your area hierarchy. Optional. |
| **Orientation** | The compass direction the photo faces, chosen from your managed list of [orientations](#orientations). Optional. |

### Picking the area

The area picker is hierarchy-aware. Each option is indented to show its depth in your area tree, and the **full ancestor path** (e.g. *Ground Floor › Kitchen*) appears beneath the area name. This makes it easy to tell apart rooms that share the same name on different floors -- for example a "Bathroom" on the ground floor and another upstairs. Once you select an area, the picker collapses to show just the concise area name.

Tap **Save & upload** to store the photo with its metadata, or **Cancel** to skip the file. You can always edit a photo's description and area later from the photo viewer.

:::tip
On a phone the modal is full-width with large touch targets so you can fill it in one-handed on site. Tagging the **area** and **orientation** as you go means your photos are already organized by the time you are back at a desk.
:::

## Orientations

An **orientation** records which way a photo (or the part of the building it shows) faces -- "North", "South – Street-facing", and so on. Tagging photos with an orientation makes it easy to group shots of the same elevation of the house over time.

Orientations are a managed list, just like [areas and trades](/guides/work-items/areas-and-trades). If none are configured yet, the orientation picker shows the hint *No orientations configured. Add them in Settings → Orientations.*

### Managing orientations

Navigate to **Manage** in the sidebar and open the **Orientations** tab (🧭). Under **Create orientation**, provide:

- **Name** -- A short label, required (up to 100 characters). For example `South` or `South – Street`.
- **Description** -- Optional context, e.g. *Street-facing side of house* (up to 500 characters).
- **Sort Order** -- A number that controls where the orientation appears in pickers; lower values sort first.

Click **Create orientation** to add it. The list below shows every orientation with its sort-order label; each row has **Edit** and **Delete** actions. Deleting an orientation asks for confirmation first.

Once you have created orientations they appear in the **Orientation** picker in the photo details modal. The picker searches as you type, matching your query against both the orientation **name** and its **description** -- so typing *street* finds *South – Street-facing* even when "street" only appears in the description.

## Working with photos after upload

Click any photo thumbnail on an entry to open the **photo viewer**, where you can:

- View the original or, if it has been edited, the annotated copy
- Edit the photo's description and area
- [Annotate the photo](photo-annotation) with arrows, rectangles, text, measurements, and other markup
- Delete the photo (only when the entry is not signed)

:::caution
Once an entry is [signed](signatures), no new photos can be added and existing photos cannot be deleted or annotated. Capture, tag, and annotate your photos before collecting signatures.
:::
