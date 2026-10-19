---
sidebar_position: 3
title: Capturing Photos
---

# Capturing Photos

Photos are attached to [diary entries](manual-entries) and document progress, deliveries, issues, and site conditions. Cornerstone's photo flow is built mobile-first: you can snap a photo with your phone camera on site, tag it with where it was taken and which way it faces, and have it uploaded to the entry in a couple of taps.

## Taking photos with the in-app camera

On the capture screen of a diary entry, select **Take photos**. The in-app camera opens full screen over a live viewfinder. You can also reach it from **＋ › Log now › Photo**, which opens the camera straight away.

The camera is built for quick walks around the site:

- **Area** and **Orientation** chips sit over the viewfinder. Choose them once and every shot you take after that is tagged with them, until you change them. For example, pick *Ground floor · Kitchen* and *North side*, take five shots, then switch to *Upstairs · Bathroom* for the next ones.
- Each shot is saved on your phone the moment you take it, and uploads to the entry in the background. Uploads keep going if you reload the page or come back later.
- **n photos waiting to upload** shows in the viewfinder while any photo of the entry has not reached the server yet. Photos stay on the phone until they have uploaded.
- **Remove last photo** deletes the shot you just took.
- The exit button reads **Review (n)** when you have taken n photos. Select it to go back to the entry and check them. With no photos taken, it reads **Close**.

:::caution
While a shot is still being saved, the browser warns you before you reload or close the tab. Review and Close wait for any shot still being saved, and show *Saving photos…* while they do.
:::

### Allowing camera access

The first time you open the camera, your browser asks for permission to use the camera. Choose **Allow**. The in-app camera needs a secure connection, such as HTTPS. On a plain `http://` address on your home network, the browser does not offer the in-app camera.

If you refuse access, or the browser cannot provide a camera, the viewfinder is not shown and Cornerstone opens your phone's camera app instead. You can turn camera access back on in your browser's site settings.

### Using the camera app for full-size photos

Select **Use camera app** to open your phone's own camera. Its photos are full size and are kept in your phone's photo library as well as in the diary entry. Use it when you need the sharpest photos, for example for a close-up of a defect.

The in-app camera can produce smaller photos than your phone's camera. When the preview is lower quality than your phone's camera, a hint appears: *This preview is lower quality than your phone's camera. For full-size photos, use the camera app.* Select **Not now** to hide the hint for the rest of this browser session. The hint never stops you from taking photos.

### Adding existing photos

Photos you already have on the phone can be added with **Choose from library**. They upload in the same way as photos taken in the camera.

## Orientations

An **orientation** is a label that records the direction or viewpoint a photo shows, as your household names it -- for example "North side" or "From the street". Tagging photos with an orientation makes it easy to group shots of the same elevation of the house over time.

Orientations are a managed list, just like [areas and trades](/guides/work-items/areas-and-trades). If none are configured yet, the orientation picker shows the hint *No orientations configured. Add them in Settings › Project setup › Photo orientations.*

### Managing orientations

Navigate to **Manage** in the sidebar and open the **Orientations** tab. Under **Create orientation**, provide:

- **Name** -- A short label, required (up to 100 characters). For example `North side` or `From the street`.
- **Description** -- Optional context, e.g. *Side facing the garden* (up to 500 characters).
- **Sort Order** -- A number that controls where the orientation appears in pickers; lower values sort first.

Click **Create orientation** to add it. The list below shows every orientation with its sort-order label; each row has **Edit** and **Delete** actions. Deleting an orientation asks for confirmation first.

Once you have created orientations they appear in the **Orientation** chips over the camera and in the **Orientation** picker when you tag a photo. The picker searches as you type, matching your query against both the orientation **name** and its **description** -- so typing *street* finds *From the street* even when "street" only appears in the description.

## Working with photos after upload

Click any photo thumbnail on an entry to open the **photo viewer**, where you can:

- View the original or, if it has been edited, the annotated copy
- Edit the photo's caption, area, and orientation with **Edit tags**
- [Annotate the photo](photo-annotation) with arrows, rectangles, text, measurements, and other markup
- Delete the photo (only when the entry is not a saved, signed entry)

:::caution
Photos lock once a [signed](signatures) entry is **saved**. On a draft they can still be added, deleted, and annotated. Once saved, no new photos can be added and existing photos cannot be deleted or annotated.
:::
