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
3. Fill in the entry form:

| Field | Description |
|-------|-------------|
| **Type** | Select the entry type (daily log, site visit, delivery, issue, or general note) |
| **Date** | The date of the entry (defaults to today) |
| **Weather** | Temperature and conditions (sunny, cloudy, rainy, snowy, windy, foggy) -- optional |
| **Title** | A short summary of the entry |
| **Body** | Detailed description (or "Items" for delivery entries) |

4. Optionally attach photos (see below)
5. Click **Save**

## Weather Tracking

Each entry can record the weather conditions at the time. This is useful for tracking how weather affects construction progress and for documenting conditions during deliveries or site visits.

- **Temperature** -- Numeric value in degrees
- **Conditions** -- One of: sunny, cloudy, rainy, snowy, windy, foggy

## Photo Attachments

You can attach photos directly when creating or editing a diary entry. Photos are added inline during the creation flow -- there is no separate upload step.

Photos provide visual documentation of progress, deliveries, issues, or site conditions.

:::caution
Once an entry is signed, the photo section is hidden when no photos are attached, and no new photos can be added. Attach photos before collecting signatures.
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
