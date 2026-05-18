---
name: radio-query-scoping-collision
description: In ToolPalette, "Medium" and "Large" are used as accessible names in both the stroke-width and font-size radiogroups — always scope radio queries with within() to avoid getByRole finding multiple elements
metadata:
  type: feedback
---

In `ToolPalette.tsx`, stroke width keys produce labels `strokeMedium` → "Medium" and the font-size
key `fontSizeMedium` also → "Medium". Same collision for "Large" (strokeThick vs fontSizeLarge).

**Why:** Both radiogroups render buttons with `role="radio"` and labels derived from i18n keys that
happen to map to identical English strings for some size names.

**How to apply:**
```typescript
function getFontSizeGroup() {
  const groups = screen.getAllByRole('radiogroup');
  const fsGroup = groups.find(
    (el) =>
      el.getAttribute('aria-label') === 'Font size' ||
      el.getAttribute('aria-label') === 'fontSize',
  );
  if (!fsGroup) throw new Error('Font-size radiogroup not found');
  return fsGroup;
}

// Scope to font-size group before querying individual radios
const mediumBtn = within(getFontSizeGroup()).getByRole('radio', { name: /Medium/i });
```

Also: use `{ name: 'Large' }` (exact string, not `/Large/i`) because "Extra large" contains "Large"
as a substring and `/Large/i` will match both buttons within the font-size group.
