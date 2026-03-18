---
sidebar_position: 1
title: Subscribing to Feeds
---

# Subscribing to Feeds

This guide walks you through adding Cornerstone's calendar and contact feeds to popular apps. The process is similar across most apps -- you provide a subscription URL and the app handles the rest.

## Your Feed URLs

Replace `<your-cornerstone-host>` with the address of your Cornerstone instance (e.g., `192.168.1.50:3000` or `cornerstone.example.com`):

| Feed | URL |
|------|-----|
| Calendar | `http://<your-cornerstone-host>/feeds/cal.ics` |
| Contacts | `http://<your-cornerstone-host>/feeds/contacts.vcf` |

:::tip
If your Cornerstone instance uses HTTPS behind a reverse proxy, use `https://` in the URL.
:::

## Calendar Feed

### Apple Calendar (macOS / iOS)

**On macOS:**

1. Open **Calendar**
2. Go to **File > New Calendar Subscription...**
3. Enter your calendar feed URL: `http://<your-cornerstone-host>/feeds/cal.ics`
4. Click **Subscribe**
5. Set a name (e.g., "Cornerstone") and choose a refresh interval -- **Every hour** or **Every day** works well
6. Click **OK**

**On iOS:**

1. Open **Settings > Calendar > Accounts**
2. Tap **Add Account > Other > Add Subscribed Calendar**
3. Enter your calendar feed URL
4. Tap **Next**, adjust the name and refresh interval, then tap **Save**

### Google Calendar

1. Open [Google Calendar](https://calendar.google.com) in a web browser (this cannot be done from the mobile app)
2. In the left sidebar, click the **+** next to **Other calendars**
3. Select **From URL**
4. Paste your calendar feed URL: `http://<your-cornerstone-host>/feeds/cal.ics`
5. Click **Add calendar**

:::note
Google Calendar refreshes subscribed calendars on its own schedule (typically every 12-24 hours). There is no way to force a faster refresh interval.
:::

### Microsoft Outlook

**Outlook Desktop (Windows / macOS):**

1. Go to the **Calendar** view
2. Click **Add Calendar > From Internet** (or **Subscribe from web** in newer versions)
3. Paste your calendar feed URL
4. Click **OK** and give the calendar a name

**Outlook Web (outlook.com / Microsoft 365):**

1. In the calendar view, click **Add calendar** in the left sidebar
2. Select **Subscribe from web**
3. Paste your calendar feed URL
4. Set a name and color, then click **Import**

### Thunderbird

1. In the **Calendar** tab, right-click in the calendar list
2. Select **New Calendar...**
3. Choose **On the Network**, then click **Next**
4. Select **iCalendar (ICS)** as the format
5. Enter your calendar feed URL in the **Location** field
6. Click **Next**, set a name, and click **Finish**

## Contacts Feed

### Apple Contacts (macOS / iOS)

**On macOS:**

1. Open **Contacts**
2. Go to **Contacts > Accounts...** (or **Settings > Accounts** on macOS Ventura and later)
3. Click **+** to add a new account
4. Select **Other Contacts Account...**
5. Choose **CardDAV** and enter your Cornerstone URL in the server field, or use the **Manual** option and enter the full feed URL: `http://<your-cornerstone-host>/feeds/contacts.vcf`

:::note
Apple Contacts expects a CardDAV server for subscribed contacts. Depending on your version, you may need to import the `.vcf` file manually instead of subscribing. Open the feed URL in Safari to download the file, then import it via **File > Import**.
:::

**On iOS:**

1. Open **Settings > Contacts > Accounts**
2. Tap **Add Account > Other > Add CardDAV Account**
3. Enter your Cornerstone host as the server

### Manual Import (Any App)

If your contacts app does not support feed subscriptions, you can import the contacts file manually:

1. Open `http://<your-cornerstone-host>/feeds/contacts.vcf` in your browser -- it will download a `.vcf` file
2. Open the file with your contacts app, or use the app's **Import** function to load it
3. Repeat this process whenever you want to refresh your vendor contacts

:::tip
Bookmark the contacts feed URL in your browser so you can quickly re-download it when vendor information changes.
:::

## Refresh Behavior

Calendar and contacts apps periodically re-fetch subscribed feeds to pick up changes. The refresh interval varies by app:

| App | Typical Refresh |
|-----|-----------------|
| Apple Calendar / Contacts | Configurable: every 5 min, 15 min, 1 hour, or 1 day |
| Google Calendar | Every 12-24 hours (not configurable) |
| Outlook | Every 3 hours (configurable in some versions) |
| Thunderbird | Configurable per calendar |

Cornerstone uses **ETags** for caching -- when your app re-fetches a feed and nothing has changed, the server responds instantly with a `304 Not Modified` status instead of re-sending all the data. This keeps bandwidth usage minimal even with frequent refresh intervals.

## Troubleshooting

### Calendar or contacts are empty

- Verify that your Cornerstone instance has data -- work items with dates for the calendar feed, or vendors for the contacts feed
- Check that the feed URL is correct and accessible from the device where your app is running
- Try opening the feed URL directly in a browser to confirm it returns data

### Calendar app shows an error when subscribing

- Ensure you are using `http://` or `https://` in the URL (not just the hostname)
- If Cornerstone is behind a reverse proxy, make sure the proxy forwards requests to `/feeds/` correctly
- Check that your device can reach the Cornerstone host on the network

### Events show wrong dates

The calendar feed uses **actual dates** where available (actual start, actual end) and falls back to **planned dates** if actual dates are not set. If you see unexpected dates, check the work item's date fields in Cornerstone.

### Changes are not showing up

Calendar apps do not refresh instantly. Wait for the next refresh cycle (see the table above) or manually trigger a refresh in your app. In Apple Calendar, you can pull down to refresh on iOS or press **Cmd+R** on macOS.
