# v2.6.0 Release Summary

A feature-packed release that brings **in-browser photo annotation**, **staged-payment deposits** for invoices, and a much smoother **diary draft flow**. Migration 0032 (invoice deposits) runs automatically on first start -- no manual steps required.

## What's New

### Photo Annotation

Mark up diary photos directly in the browser. Open any diary photo in the viewer, click **Annotate**, and you get a full drawing canvas with nine tools:

- **Select**, **Rectangle**, **Highlight**, **Arrow**, **Line**, **Ellipse**, **Text**, **Measurement** (dimension line with end ticks and a movable label), and **Freehand**
- Six colours, four stroke widths, five font sizes -- pick before you draw, or change them on a selected shape to update it live
- Drag to move, endpoint handles to reshape, undo/redo for everything including live edits
- Annotated copies are saved as separate WebP files (quality 0.92); the original is preserved, and you can switch between **View original** and **View annotated** at any time
- A **Reset to original** button discards your current annotations and starts over
- Photo grids and viewers expose a quick-action **Edit** button that opens the viewer directly in annotation mode

Signed diary entries cannot be annotated -- finish your markup before collecting signatures.

See the [Photo Annotation guide](https://steilerDev.github.io/cornerstone/guides/diary/photo-annotation) for the full walkthrough.

### Invoice Deposits (Staged Payments)

Track invoices that are paid in stages -- a deposit on signing, a milestone payment, and a final balance.

- Add any number of deposits to an invoice from the **Deposits** section on the invoice detail page
- Each deposit has its own amount, due date, status (Pending / Paid / Claimed), paid/claimed dates, and optional description
- The form refuses to save if deposits would exceed the invoice total
- Quick actions to **mark paid** and **mark claimed** -- with revert support to fix mistakes
- Budget rollups across every linked work item and household item are now **deposit-aware**: `actualCostPaid` and `actualCostClaimed` reflect deposit-level status, so paid and claimed amounts show real cash flow rather than waiting for the full invoice to settle
- Deposits cascade-delete with the parent invoice

See the [Invoice Deposits guide](https://steilerDev.github.io/cornerstone/guides/budget/invoice-deposits).

### Diary Drafts Overhaul

Creating a diary entry no longer needs a separate "create" step.

- Click a type card (Daily Log, Site Visit, Delivery, Issue, General Note) and Cornerstone immediately creates a **draft entry** and opens the edit page -- you start typing right away
- Photos uploaded to a draft persist immediately, so you don't have to remember to "save" before attaching them
- Auto-save runs continuously with a live status indicator (`Saving...`, `Saved`, or "save failed -- will retry")
- Drafts are tagged with a **Draft** badge and **hidden from the diary list by default**; a dedicated **Drafts** filter chip toggles their visibility
- Click **Save** to promote the draft to a full entry, or **Discard Draft** to delete it (and its photos) permanently
- Abandoned drafts are cleaned up automatically after `DIARY_DRAFT_RETENTION_DAYS` days (default: 30; set to `0` to disable)

### Photo Viewer Improvements

- New **photo metadata sidepanel** with upload date, description, and area assignment
- **Edit** quick-action button on the photo grid that opens the viewer directly in annotation mode
- **Delete photo** action from the lightbox for entries that aren't signed
- Thumbnail cache busting -- annotated thumbnails update immediately
- Mobile-friendly: the metadata sidepanel collapses on small screens

## Configuration

New environment variable:

| Variable                     | Default | Description                                                                   |
| ---------------------------- | ------- | ----------------------------------------------------------------------------- |
| `DIARY_DRAFT_RETENTION_DAYS` | `30`    | Days an untouched draft sits before automatic cleanup. Set to `0` to disable. |

No other configuration changes are required. Migration 0032 adds the `invoice_deposits` table and runs automatically on container start.

## What to Update

```bash
docker pull steilerdev/cornerstone:latest
```

Restart your container. Schema migrations run on first boot.
