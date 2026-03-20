## What's New

This release introduces Areas & Trades -- a structured replacement for the flat tag system that lets you organize your project by physical location and professional specialty. It also ships budget enhancements including quotation tracking, subsidy caps, and improved filtering, alongside numerous UX refinements across the Gantt chart, dashboard, and overview pages.

### Highlights

- **Hierarchical Areas** -- Organize work items and household items by location (rooms, floors, zones) with parent-child nesting. Filtering by a parent area automatically includes all children.
- **Trades** -- Define professional specialties (Electrical, Plumbing, Carpentry, etc.) and link vendors to their trade for easy identification.
- **Quotation Invoice Status** -- Track vendor quotes alongside actual invoices. Quotation amounts use a +/- 5% margin in budget projections.
- **Subsidy Caps** -- Set a maximum payout amount on percentage-based subsidies to prevent uncapped growth. The budget overview flags capped subsidies.
- **Budget Filtering** -- Filter work items and household items by budget status ("no budget lines") and see budget line counts directly in list views.
- **Action Button Dropdowns** -- Dashboard, Budget Overview, and Timeline pages now include quick-action dropdown menus for creating new entities without navigating away.
- **Gantt Improvements** -- Ahead-of-schedule milestone display, bidirectional scroll sync between sidebar and chart, and responsive sidebar widths.
- **Line Break Preservation** -- Descriptions and notes now preserve line breaks as entered.

### Breaking Changes

- The **tag system has been replaced** by areas and trades. Existing tags are migrated to areas automatically. Vendors previously associated with tags are now linked via trades. The tag management page has been replaced by the Manage page with separate Areas and Trades sections.
