---
name: restructure-gotchas
description: EPIC-21 restructure PR traps for new client components (pattern baseline counting, cost line grid layout)
metadata:
  type: project
---

- `plan:check` counts a shared component for every `components/<lowercaseDomain>/<File>.tsx` and every `components/<Dir>/<Dir>.tsx`; anything else (e.g. `components/CostLineForm/AutoItemizeLines.tsx`) is a helper. A new counted component fails with "not in allowedAdditions" unless it is listed in `plan/restructure/baseline.json`. **How to apply:** put new shared helpers inside an already-allowed component folder instead of adding a new folder or a lowercase domain file.
- Cost line family lives in `components/CostLineForm/` (form, grid, grid dialog, `AutoItemizeLines` for both Split with AI pages). The grid is one DOM (native table + roles, container query turns rows into cards), controlled rows with one blank trailing row.
- `ObjectFormField.visibleWhen`, `group` and `ctx.values` exist (#2235); hidden fields take no part in focus, errors or "More details".
- Worktree-isolated Bash refuses heredocs containing `${…}`/backticks and `git rm`: write the script with the Write tool and run it, use plain `rm`.
