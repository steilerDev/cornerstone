---
sidebar_position: 1
title: Manual Entries
---

# Manual Diary Entries

Manual diary entries let you document daily activities, site visits, deliveries, issues, and general notes throughout your construction project.

## Entry Types

Choose the type that best fits what you are recording:

- **Daily Log** -- A summary of the day's work progress, conditions, and observations
- **Site Visit** -- Notes from a visit to the construction site, useful for recording who was present and what was discussed
- **Delivery** -- Track a materials or items delivery; uses an "Items" field instead of a free-text description
- **Issue** -- Flag a problem that needs attention; issue entries support acknowledgment [signatures](/guides/diary/signatures)
- **General Note** -- Anything that does not fit the categories above

## Creating an Entry

1. Navigate to the diary page at `/diary`
2. Click **New Entry**
3. Pick an entry type card (Daily Log, Site Visit, Delivery, Issue, or General Note). The moment you click a card, Cornerstone creates a **draft entry** and opens the edit page -- no extra "create" step needed.
4. Fill in the entry form:

| Field | Description |
|-------|-------------|
| **Date** | The date of the entry (defaults to today) |
| **Weather** | Temperature and conditions (sunny, cloudy, rainy, snowy, windy, foggy) -- optional |
| **Title** | A short summary of the entry |
| **Body** | Detailed description (or "Items" for delivery entries) |

5. Optionally attach photos (see below)
6. Click **Save** to promote the draft to a full entry, or **Discard Draft** to remove it entirely

## Daily Log: vendor and work hours

Daily Log entries carry a few extra optional fields for recording who was on site and how long they worked. All three are optional -- fill in as many or as few as you like.

| Field | Description |
|-------|-------------|
| **Vendor** | The vendor or trade who did the work that day. Start typing to search your existing [vendors](/guides/budget/vendors-and-invoices); the placeholder reads *Search vendors…*. |
| **Work start** | The time work began that day (a time picker). |
| **Work end** | The time work finished that day. |
| **Total work duration** | Computed automatically from **Work start** and **Work end** -- you do not type it. It updates as you change the start or end time. |

On the entry detail page these appear in the **Entry Information** summary as **Vendor**, **Start**, and **End**, giving you an at-a-glance record of who worked and for how long on any given day.

:::tip
These fields make a Daily Log double as a simple labour log. Recording the vendor and hours per day builds a running history you can cross-reference against invoices when you reconcile costs later.
:::

## Drafts and Auto-Save

While you are editing an entry, Cornerstone auto-saves changes in the background and shows a small status indicator (`Saving...`, `Saved`, or "save failed — will retry on next change") so you always know whether your work is persisted.

Entries created from the **New Entry** flow start in **draft** state. Drafts:

- Are tagged with a **Draft** badge wherever they appear
- Are **hidden by default** from the diary list -- toggle the **Drafts** filter chip to surface them
- Can be discarded with the **Discard Draft** button -- this permanently removes the draft and any photos you have uploaded to it
- Are promoted to a regular entry when you click **Save**

If you start a draft and abandon it without saving or discarding, the server cleans it up automatically after `DIARY_DRAFT_RETENTION_DAYS` days of inactivity (default: 30). Set the environment variable to `0` to disable the cleanup, or to another integer to shorten or extend retention. See [Configuration](/getting-started/configuration#diary) for details.

## Weather Tracking

Each entry can record the weather conditions at the time. This is useful for tracking how weather affects construction progress and for documenting conditions during deliveries or site visits.

- **Temperature** -- Numeric value in degrees
- **Conditions** -- One of: sunny, cloudy, rainy, snowy, windy, foggy

## Photo Attachments

You can attach photos directly when editing a diary entry. Cornerstone's photo flow is mobile-first: snap a photo with your phone camera on site, tag it with a caption, [area](/guides/work-items/areas-and-trades), and compass [orientation](photo-capture#orientations) in the photo-details modal, and it uploads straight to the entry. Photos upload as soon as you pick them -- the upload queue shows progress for each file and lets you retry failed uploads without re-selecting them. There is no separate "attach" or "submit" step; uploaded photos are immediately part of the entry.

See [Capturing Photos](photo-capture) for the full capture-and-tag flow. Each photo can be opened in a viewer where you can:

- View the original or, if it has been edited, the annotated copy
- Edit metadata (description, area assignment)
- [Annotate the photo](photo-annotation) with rectangles, arrows, text, measurements, and other markup
- Delete the photo (only when the entry is not signed)

:::caution
Once an entry is signed, the photo section is hidden when no photos are attached, and no new photos can be added. Existing photos remain visible but cannot be deleted or annotated. Attach and annotate photos before collecting signatures.
:::

## Editing Entries

To edit an existing entry, navigate to its detail page and click the **Edit** button. You can update any field including the title, body, weather, and photos.

:::caution
Signed entries cannot be edited. The edit button is hidden on entries that have signatures. See [Signatures](/guides/diary/signatures) for details on immutability.
:::

## Delivery Entries

Delivery entries work slightly differently from other types:

- The description field is replaced with an **Items** field to list what was delivered
- There is no "Delivery Confirmed" checkbox -- confirmation is tracked through the delivery status of [household items](/guides/household-items/delivery-and-dependencies) instead
