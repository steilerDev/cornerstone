---
name: glossary-proposals-pending-approval
description: How to propose glossary terms before product-owner approval, given the deSource enum and strict term keys
metadata:
  type: feedback
---

glossary.test.ts requires every term deSource to be "approved" or "shipped" (never "proposed"), and parseTerm rejects unknown term-level keys. **Why:** #2214 proposals (Calendar & contacts sync, Sign-in method, Single sign-on) had to ship with deSource "shipped" plus a English de.note "Proposed in #2214; pending product-owner approval...". **How to apply:** when proposing, use that pattern and leave _meta.approval untouched until the PO approves; then flip deSource to "approved" and add the approval record. Also: glossary.json is not a JSON.stringify roundtrip (prettier-style inline arrays), so edit it with Edit, never a python dump. Each new formerly alias needs QA to add it to PERMANENT_ALIASES.
