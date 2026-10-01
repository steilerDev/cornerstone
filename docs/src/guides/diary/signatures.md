---
sidebar_position: 5
title: Signatures
---

# Digital Signatures

The diary supports digital signature capture for accountability and record-keeping. Signatures are particularly useful for issue entries where you need acknowledgment from a contractor or vendor.

## Adding Signatures

Signatures work on daily log, site visit, and issue entries. To add a signature while editing an entry:

1. Open the entry's edit page (a new entry opens there directly)
2. Click **+ Add Signature**
3. Choose the signer type:
   - **Self** -- Your display name is recorded. If your display name is blank, your email address is used instead
   - **Vendor** -- Pick an existing vendor or enter a new one, then enter the signatory name
4. Draw the signature on the canvas
5. Click **Accept Signature** to finalize it

You can use **Clear** to redraw or **Remove Signature** to discard the current signature. You can add multiple signatures to a single entry -- for example, both a homeowner and a contractor acknowledging an issue. Each entry supports up to 10 signatures, and signer names are limited to 300 characters.

:::caution Unfinished signatures are blocked
An unfinished signature (no signer selected or no drawing yet) cannot be saved to the entry. Save is blocked client-side with a clear message next to the field, and autosave continues working in the background. To discard an incomplete signature, click **Remove Signature** to clear it, then save the entry. Server errors appear translated to your configured language.
:::

## Immutability

Signatures lock an entry only when it is **saved**. While an entry is a draft, you can still:

- Edit every field (title, body, weather, etc.)
- Add, remove, or replace signatures
- Add, delete, annotate, re-caption, or reorder photos
- Leave the page and return to continue editing

Once a signed entry is saved, it becomes immutable:

- The **Edit** button is hidden -- the entry can no longer be modified
- Signatures cannot be added, removed, or changed
- Photos cannot be added, deleted, annotated, re-captioned, or reordered
- The whole entry can still be deleted

This ensures that signed entries serve as reliable records that cannot be altered after being finalized.

:::caution
Attach all photos and finalize the entry content before saving a signed entry. Once signed and saved, the entry is locked.
:::

## Signed Badge

Entries with signatures display a **"Signed"** badge, making it easy to identify which entries have been formally acknowledged.

## Issue Acknowledgment

Issue entries are the most common use case for signatures. When you flag a problem with an issue entry, you can have the responsible party sign the entry to acknowledge:

- They are aware of the issue
- They have reviewed the documented details
- The record is accurate as written

This creates an auditable trail of issue communication on your project.
