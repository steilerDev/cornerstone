# Dev Team Lead Memory

## DELEGATION IS MANDATORY — ZERO EXCEPTIONS

Every production file change MUST go through a Haiku agent (backend-developer or frontend-developer) via the Agent tool.
The orchestrator audits commit trailers after every session. Missing Haiku co-author trailers = work rejected and reset.

Past sessions have violated this rule by:

- Writing "quick fixes" directly (lint, imports, one-liners)
- Fixing CI failures in source code directly
- Applying post-review suggestions directly

Correct behavior for ALL of these: write a spec, launch Haiku agent.

## Effective Spec Patterns

- **Small fix**: "In file X line Y, change A to B because Z"
- **Reference-based**: "Follow the pattern in file X to create file Y with these differences: ..."
- **Full feature**: Files to create, types, signatures, reference files, contract excerpts, verification checklist
