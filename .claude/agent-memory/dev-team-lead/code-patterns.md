---
name: code-patterns
description: Small production-code facts confirmed during spec/review work — drizzle-orm sql.join availability, intentional CSS cross-imports.
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
