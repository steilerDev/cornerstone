---
sidebar_position: 8
title: Calendar & Contact Feeds
---

# Calendar & Contact Feeds

Cornerstone exposes your project data as standard calendar and contact feeds that you can subscribe to from any compatible app. This lets you see your construction schedule in your everyday calendar and keep vendor contact details in your phone -- without logging into Cornerstone.

## Overview

Two feed endpoints are available:

- **Calendar Feed** (`/feeds/cal.ics`) -- An iCalendar feed containing work item schedules, milestones, and household item deliveries
- **Contacts Feed** (`/feeds/contacts.vcf`) -- A vCard feed containing all your vendor contact information

Both feeds are read-only and update automatically. When your calendar or contacts app re-fetches the feed, it gets the latest data from Cornerstone.

## How It Works

```
Calendar App  -->  GET /feeds/cal.ics    -->  Cornerstone
Contacts App  -->  GET /feeds/contacts.vcf  -->  Cornerstone
```

Your calendar or contacts app periodically polls the feed URL. Cornerstone supports **ETags** for efficient caching -- if nothing has changed since the last fetch, the server responds with `304 Not Modified` instead of re-sending all the data.

:::caution
The feed endpoints do not require authentication. Anyone with access to your Cornerstone instance URL can read the feeds. If your instance is exposed to the internet, consider placing it behind a reverse proxy with access controls.
:::

## What's Included

### Calendar Feed

The calendar feed includes three types of events:

| Event Type | Source | Date Handling |
|------------|--------|---------------|
| **Work Items** | All work items with dates | Uses actual dates where available, falls back to planned dates |
| **Milestones** | All milestones with target dates | Single-day events on the target date |
| **Household Item Deliveries** | Household items with delivery dates | Single-day events on the delivery date |

### Contacts Feed

The contacts feed exports all vendors as contact cards. Each card includes the fields you have filled in:

- Name
- Email
- Phone number
- Address
- Specialty
- Notes

## Next Steps

- [Subscribing to Feeds](subscribing) -- Step-by-step instructions for adding feeds to popular apps
