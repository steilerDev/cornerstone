# Template: Full Implementation Spec (dev-team-lead, M/L stories)

Include only the sections relevant to the affected layers (omit Frontend Spec for backend-only work, omit Translator Spec when no new i18n keys are added).

```markdown
# Implementation Spec

## Metadata

- **Issue(s)**: #42
- **Size**: M | L
- **Execution Order**: parallel | sequential
- **Shared Types Changes**: yes | no
- **Layers**: backend, frontend | backend-only | frontend-only

## Backend Spec

### Context

<API contract excerpts, schema excerpts, relevant patterns>

### Files to Create/Modify

| File Path | Action | Description |
| --------- | ------ | ----------- |

### Reference Files

<existing files to read for patterns>

### Step-by-Step Instructions

<numbered implementation steps>

### Type Definitions

<TypeScript interfaces/types to create or modify>

### Verification

<checklist for the agent to verify their work>

### Compliance Checklist

<check each applicable item from `.claude/checklists/implementation-checklist.md` and confirm it is addressed in the spec — list only the items relevant to this spec's scope>

---

## Frontend Spec

### Context

<API contract excerpts, design token references, component patterns>

### Files to Create/Modify

| File Path | Action | Description |
| --------- | ------ | ----------- |

### Reference Files

<existing files to read for patterns>

### Step-by-Step Instructions

<numbered implementation steps — name the shared components to use (CLAUDE.md > Component Reuse Policy)>

### Type Definitions

<TypeScript interfaces/types to use>

### i18n Requirements

<translation namespace(s), new English keys for `client/src/i18n/en/<namespace>.json` (English only), strings needing `t()` wrapping>

### Verification

<checklist for the agent to verify their work>

### Compliance Checklist

<check each applicable item from `.claude/checklists/implementation-checklist.md` and confirm it is addressed in the spec — list only the items relevant to this spec's scope>

---

## QA Spec

### Test Files to Create

| File Path | Description |
| --------- | ----------- |

### Coverage Targets

<95%+ coverage requirement, specific areas to cover>
<list every new production file and its required test file path — test file parity is enforced during review>

### Test Scenarios

<numbered test scenarios with expected behavior>

### Reference Files

<existing test files to follow as patterns>

---

## E2E Spec

### Test Files to Create

| File Path | Description |
| --------- | ----------- |

### Coverage Targets (100% happy path, reasonable error scenarios)

<happy path flows to cover, error scenarios to test>

### E2E Test Scenarios

<numbered E2E test scenarios with expected browser behavior>

### Page Object Models (new/modified)

<POM files to create or update>

### Dependent System Requirements (containers needed)

<any new testcontainer definitions needed for dependent systems>

### Reference Files

<existing E2E test files and POMs to follow as patterns>

---

## Translator Spec

### Affected Namespaces

<list of i18n namespaces with new or modified keys>

### New English Keys

<list of new translation keys added to en/ locale files>

### Glossary Reference

Refer to `client/src/i18n/glossary.json` for approved domain term translations.

### Notes

<any context about new domain terms that may need glossary additions>
```
