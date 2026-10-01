---
name: code-patterns
description: Small production-code facts confirmed during spec/review work — drizzle sql.join, CSS cross-imports, silent-drop hazards (strict LLM json_schema, Modal initial focus, hyphenated props).
metadata:
  type: reference
---

# Code Patterns Confirmed During Review

## Drizzle-orm sql.join: Available in 0.45.1

`sql.join(items, separator)` is available as a method on the `sql` tagged template function in drizzle-orm 0.45.x (marked as the recommended API in type definitions). Use it for dynamic IN clauses:

```ts
const inList = ids.map((id) => sql`${id}`);
sql`WHERE id IN (${sql.join(inList, sql`, `)})`;
```

## AutosaveIndicator: CSS import from page module

The `AutosaveIndicator` component legitimately imports CSS classes from `WorkItemDetailPage.module.css`. CSS Modules are locally scoped so cross-component class sharing works without leakage. This is intentional — avoid duplicating CSS definitions.

## Silent-drop hazards found while speccing #2148

- **Strict `json_schema` gates what Anthropic can emit.** `EXTRACTED_LINES_SCHEMA` (`providerProfiles.ts`) uses `strict: true` + `additionalProperties: false`, so any LLM output key named in the prompt but missing from the schema can never be returned on the Anthropic profile (OpenAI/Gemini use `json_object` and are unaffected). `chosenVendorName` and line `category` were missing. Any spec adding an LLM output field must add it to the prompt, the schema (in `required`, `['string','null']`), and `validateExtractedLines`.
- **`Modal` focuses its first focusable (the header close button) in a mount effect**, and parent effects run after children's, so a child `autoFocus`/focus effect is overridden. Initial focus on a specific field needs a Modal-level prop (`initialFocusRef`), not `autoFocus`.
- **Portaled listboxes are outside Tab order.** SearchPicker's dropdown is a `FloatingPortal` at the end of `<body>` with no key handling, so options (incl. the #2148 create row) were unreachable by keyboard; my spec missed it and E2E papered over it with `.focus()`. A test calling `.focus()` on an option is a smell → CODE_BUG, not an accepted workaround.
- **TS does not type-check hyphenated props (`aria-*`, `data-*`) on components**, so `aria-invalid`/`aria-describedby` passed to `SearchPicker` compiled but were silently dropped. When a page passes aria props to a shared component, verify the component forwards them.
