---
sidebar_position: 1
title: Manual Entries
---

# Manual Diary Entries

Manual diary entries let you document daily activities, site visits, deliveries, issues, and general notes throughout your construction project.

## Entry Types

Choose the type that best fits what you are recording:

- **Daily Log** -- A summary of the day's work progress, conditions, and observations. You can also record the company on site and the work hours
- **Site Visit** -- Notes from a visit to the construction site, useful for recording who was present and what was discussed
- **Delivery** -- Track a materials or items delivery with a **Materials** list and a **Delivered as expected** tick box
- **Issue** -- Flag a problem that needs attention; issue entries support acknowledgment [signatures](/guides/diary/signatures) and a severity
- **General Note** -- Anything that does not fit the categories above

## Creating an Entry

1. Open the **Site diary** and select **Log today**. You can also choose **Diary entry** from the **New** menu
2. The capture screen opens with the entry type at the top: **Daily Log**, **Site Visit**, and **Delivery** as chips, and **More** for the others (Issue and General Note)
3. Fill in the entry. Nothing is saved until you add the first photo or type the first character. From then on, the entry is saved as a draft while you work
4. The main fields are:

| Field | Description |
|-------|-------------|
| **Date** | The date of the entry. Choose **Today**, **Yesterday**, or **Pick** a date. Defaults to today |
| **Title** | An optional short summary of the entry. You can also type a title in place of text |
| **Text** | An optional description of what happened |
| **Site details** | The details for the entry type, such as company, workers, start and end times, weather, and temperature. See the sections below |

5. Optionally attach photos (see below)
6. Select **Save entry** to make it a saved entry. The button is disabled until the entry has a photo, a title, or some text

## Daily Log: company and work hours

Daily Log entries carry a few extra optional fields for recording who was on site and how long they worked. All of them are optional -- fill in as many or as few as you like.

| Field | Description |
|-------|-------------|
| **Company** | The company that did the work that day. Choose one of your companies, or pick **Other company…** and type a name |
| **Workers** | The number of people who worked on site |
| **Start** and **End** | The times work began and finished. Choose **Now** or **Other time** for each |
| **Duration** | Computed automatically from **Start** and **End** -- you do not type it. It updates as you change the times |

On the entry page these appear under **Site details** as **Company**, **Start**, **End**, and **Duration**, giving you an at-a-glance record of who worked and for how long on any given day.

:::tip
These fields make a Daily Log double as a simple labour log. Recording the company and hours per day builds a running history you can cross-reference against invoices when you reconcile costs later.
:::

## Drafts and Saving

Entries you start are **drafts** until you save them. While a draft is open, Cornerstone saves your changes in the background and shows a small status line (**Saving…**, then **Saved** with the time). If a save fails, it retries automatically on the next change.

Once an entry is saved, it no longer saves in the background. Make your changes and select **Save changes**.

Drafts work as follows:

- Drafts are **not** part of the week list. They are listed in the **Unfinished** row at the top of the Site diary, with **Continue** and **Discard** buttons. Select **Show all** to list only your drafts
- **Continue** opens the draft in the capture screen so you can finish it
- To discard a draft, select **Discard** in the Unfinished row, or open the **⋯** menu on the capture screen and choose **Discard entry**. A confirmation asks you to **Keep entry** or **Discard**. Discarding permanently removes the entry and every photo attached to it, including photos that are still uploading
- Selecting **Save entry** turns the draft into a regular entry in the week list

If you start a draft and abandon it without saving or discarding, the server cleans it up automatically after `DIARY_DRAFT_RETENTION_DAYS` days of inactivity (default: 30). Set the environment variable to `0` to disable the cleanup, or to another integer to shorten or extend retention. See [Configuration](/getting-started/configuration#diary) for details.

## Weather Tracking

Each entry can record the weather conditions at the time. This is useful for tracking how weather affects construction progress and for documenting conditions during deliveries or site visits.

- **Weather** -- One of: Sunny, Cloudy, Rainy, Snowy, Stormy, or Other
- **Temperature** -- Numeric value in degrees Celsius

## Photo Attachments

You can attach photos directly while you are creating or editing a diary entry. Cornerstone's photo flow is mobile-first: snap a photo with your phone camera on site, tag it with a caption, [area](/guides/work-items/areas-and-trades), and [orientation](photo-capture#orientations), and it uploads straight to the entry. Photos upload as soon as you pick them -- the upload queue shows progress for each file and lets you retry failed uploads without re-selecting them. There is no separate "attach" or "submit" step; uploaded photos are immediately part of the entry.

See [Capturing Photos](photo-capture) for the full capture-and-tag flow.

On the entry page, the photos come first. Select a photo to open the photo viewer, where you can:

- Move between the photos with **Previous** and **Next**
- Switch between **View original** and **View annotated** when the photo has been annotated, and use **Clear annotations** to remove the markup
- Edit the photo's caption, area, and orientation with **Edit tags** in the photo details (beside the photo on wide screens, or under **Details** on phones), then select **Save tags**
- [Annotate the photo](photo-annotation) with rectangles, arrows, text, measurements, and other markup
- Select **Delete photo** to remove it. This is only offered while the entry can still be changed

:::caution
Once an entry is saved with signatures, you cannot add photos: the **Add photos** link is hidden. Existing photos remain visible but cannot be deleted or annotated. A signed draft stays editable until saved -- see [Immutability](/guides/diary/signatures#immutability) for details. Attach and annotate photos before saving a signed entry.
:::

## Editing Entries

To edit an existing entry, open it from the Site diary and select **Edit**. The capture screen opens with the entry's current values, where you can update any field including the title, text, site details, and photos. Select **Save changes** when you are done.

On the entry page, **Add photos** opens the same capture screen, so you can add photos without changing anything else.

:::caution
Entries saved with signatures cannot be edited. **Edit** and **Add photos** are hidden on these entries. **Delete** stays available in the **⋯** menu (**More actions for this entry**), and it asks for confirmation first. A signed draft stays editable until saved -- see [Immutability](/guides/diary/signatures#immutability) for details.
:::

## Delivery Entries

Delivery entries work slightly differently from other types:

- The text field is replaced with a **Materials** list. Type an item and select **Add a material** to add it to the list. Select the remove button next to an item to take it off
- A **Delivered as expected** tick box records whether the items arrived as ordered
- The status of [household items](/guides/household-items/delivery-and-dependencies) is tracked separately from this tick box
