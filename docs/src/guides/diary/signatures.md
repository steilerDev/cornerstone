---
sidebar_position: 5
title: Signatures
---

# Digital Signatures

The diary supports digital signature capture for accountability and record-keeping. Signatures are particularly useful for issue entries where you need acknowledgment from a contractor or vendor.

## Adding Signatures

Diary entries support multiple signers. To add a signature:

1. Open the diary entry detail page
2. Click the signature section
3. Select the signer type:
   - **User** -- Select an existing Cornerstone user
   - **Vendor** -- Enter a signatory name (for people who do not have a Cornerstone account)
4. Draw the signature on the canvas
5. Finish the signature by clicking **Save** to finalize it

You can add multiple signatures to a single entry -- for example, both a homeowner and a contractor acknowledging an issue.

When selecting a user as the signer, their display name is recorded. If a user's display name is blank, their email address is used as the signer name instead.

:::caution Unfinished signatures are blocked
An unfinished signature (no signer selected or no drawing yet) cannot be saved to the entry. Save is blocked client-side with a clear message next to the field, and autosave continues working in the background. To discard an incomplete signature, click **Remove** to clear it, then save the entry. Server errors appear translated to your configured language.
:::

## Immutability

Once an entry has at least one signature, it becomes **immutable**:

- The **Edit** button is hidden -- the entry can no longer be modified
- The **photo section** is hidden when there are no existing photos -- no new photos can be added
- Existing photos remain visible but cannot be removed

This ensures that signed entries serve as reliable records that cannot be altered after the fact.

:::caution
Attach all photos and finalize the entry content before collecting signatures. Once signed, the entry is locked.
:::

## Signed Badge

Entries with signatures display a **"Signed"** badge, making it easy to identify which entries have been formally acknowledged.

## Issue Acknowledgment

Issue entries are the most common use case for signatures. When you flag a problem with an issue entry, you can have the responsible party sign the entry to acknowledge:

- They are aware of the issue
- They have reviewed the documented details
- The record is accurate as written

This creates an auditable trail of issue communication on your project.
