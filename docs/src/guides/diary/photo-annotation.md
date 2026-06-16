---
sidebar_position: 4
title: Photo Annotation
---

# Photo Annotation

Diary photos can be annotated directly in the browser so you can call out details on a delivery photo, mark a defect, or label a measurement on a site shot. Annotations are saved as a new copy of the photo alongside the original -- you can always switch back to the unedited image, and you can reset and re-annotate as often as you like until the entry is signed.

## Opening the Annotator

Annotations are launched from the **photo viewer**, which opens when you click any photo thumbnail attached to a diary entry. The viewer has two ways into the annotator:

- **Annotate** -- in the viewer toolbar, opens the photo on a drawing canvas with the tool palette
- **Edit** -- a quick-action button on the photo grid that opens the viewer already in annotation mode, so you skip the intermediate step

If a photo has already been annotated, the viewer shows toggles for **View original** and **View annotated** so you can compare them. Clicking **Annotate** on an annotated photo opens the annotator with your previous shapes in place -- you can continue editing where you left off.

:::caution Signed entries cannot be annotated
Once a diary entry has been [signed](signatures), the **Annotate** button is disabled. Finalize your annotations before collecting signatures.
:::

## The Tool Palette

The toolbar groups tools by purpose. The active tool is highlighted; tap it again or pick a different tool to switch.

### Drawing Tools

| Tool | Use it for |
|------|-----------|
| **Select** | Pick an existing shape to move, resize, recolour, or delete |
| **Rectangle** | Outline a defect, area, or zone of interest |
| **Highlight** | Translucent fill -- shade a region of the photo without hiding what is underneath |
| **Arrow** | Point from a label to a specific feature |
| **Line** | Plain segment without arrowhead -- useful for axes or alignment marks |
| **Ellipse** | Circle or oval outline |
| **Text** | Type a label anywhere on the photo |
| **Measurement** | Draw a dimension line with end ticks and a movable label (e.g., "1.20 m") |
| **Freehand** | Trace an irregular shape -- the path is smoothed automatically |

### Style Controls

After choosing a tool, the next group of controls sets its style:

- **Color swatches** -- Red, Yellow, Green, Blue, Black, White. Picking a swatch while a shape is selected re-colours that shape, including the stroke of non-text shapes.
- **Stroke width** dropdown (`Extra thin` / `Thin` / `Medium` / `Thick`) -- shown for every tool except plain text. Stroke widths scale to the photo's resolution so a thick line on a high-megapixel photo still looks thick when the image is opened on a smaller screen.
- **Font size** dropdown (`Extra small` / `Small` / `Medium` / `Large` / `Extra large`) -- shown for text and measurement tools. Pick the size before placing the shape; you can resize an existing shape later by selecting it and changing the dropdown.

:::tip Sizing happens via the dropdown, not by dragging
Text and measurement labels are sized exclusively through the **Font size** dropdown. There are no drag handles for resizing text -- this keeps annotations crisp and consistent across photos.
:::

### Undo, Redo, and History

The right edge of the toolbar has **Undo** and **Redo** buttons that step through your annotation history. Every shape you add, move, recolour, resize, or delete is a step on the stack, and live edits (such as recolouring a selected shape) are also tracked -- if you change your mind, undo will take you back accurately.

## Working with Shapes

### Placing a Shape

For rectangles, highlights, arrows, lines, ellipses, measurements, and freehand: pick the tool, then drag from one corner / endpoint to the other on the photo. Release to commit. Text and measurement labels open an inline input where you type the content and press **Enter** or click outside the input to commit.

The measurement tool uses two endpoint handles -- you can drag either endpoint after placement to extend or rotate the dimension line. Lines and arrows behave the same way.

### Selecting and Editing

Switch to the **Select** tool and click any shape to select it. A selection halo highlights the shape and exposes:

- **Drag handles** at corners (rectangles, ellipses, highlights) or endpoints (lines, arrows, measurements) to resize or reshape
- **Body drag** -- click anywhere inside the shape and drag to reposition it
- **Color, stroke width, and font size** controls in the toolbar update the selected shape live

Click a measurement label or text shape directly to re-open the inline editor and change the text.

To delete a selected shape, press `Delete` or `Backspace`.

### Inline Text Input

When you place text or measurement labels, an inline editor appears anchored to the rendered shape position. The text in the editor matches what will be rendered (same font, size, and colour) so you can see your label in context as you type.

## Saving and Resetting

The annotator has two save flows:

- **Save annotations** writes the annotated photo as a separate copy (encoded as WebP at quality 0.92 to keep file sizes small) and links it to the original. The original photo is preserved -- you can view it any time from the photo viewer.
- **Cancel** discards your current session and returns to the viewer without writing changes.

If you have already annotated a photo and want to start over, click **Reset to original** in the annotator. This discards the current draft and re-opens the annotator on the original photo. Your previously saved annotated copy stays available until you save over it.

When you save, the photo thumbnail in the diary entry updates to show the annotated version. You can still switch to **View original** in the viewer afterwards if you want to compare.

## Tips and Limitations

- Annotations are stored per-photo, not per-diary-entry -- if you attach the same photo to two entries (uncommon but possible), they share the annotated copy.
- The annotator is fully touch-enabled and works one-handed on a phone or tablet: the canvas scales to fit your screen, and you can draw, move, and resize shapes by touch (or with an Apple Pencil / stylus). Precision drawing is still easier with a mouse or trackpad on larger shapes. Tap-and-hold a handle to start a drag.
- On portrait photos, the canvas waits for the layout to settle before placing your first stroke so coordinates stay aligned with the rendered image -- there is a brief moment after opening when the canvas readies itself.
- EXIF orientation is honoured: a photo rotated by your camera is annotated in its display orientation, not the underlying file orientation.

## Next Steps

- [Manual Entries](manual-entries) -- attaching and managing photos on diary entries
- [Signatures](signatures) -- signing entries locks photos and disables annotation
