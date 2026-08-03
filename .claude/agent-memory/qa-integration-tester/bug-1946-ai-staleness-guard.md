---
name: bug-1946-ai-staleness-guard
description: #1946 in-flight AI generation staleness guard tests — patterns and gotchas
metadata:
  type: project
---

## PR/Story: Bug #1946 — in-flight AI staleness guard (2026-08-03)

**File modified**: `client/src/pages/ReportWizardPage/ReportWizardPage.aiGeneration.test.tsx`

Added `describe('in-flight staleness guard (#1946)')` with 10 tests (36 total in file after H1 added).

### Key patterns

**Controlled promise for race tests** (AC2, AC3, AC4):

```ts
let resolveAiGeneration!: (value: GenerateReportContentResponse) => void;
const controlledPromise = new Promise<GenerateReportContentResponse>((res) => {
  resolveAiGeneration = res;
});
mockGenerateReportContent.mockReturnValueOnce(controlledPromise);
// ... test body ...
await act(async () => {
  resolveAiGeneration(defaultAiResult());
});
```

Use `await act(async () => { resolve(...); })` to flush the microtask chain and React state updates together. Plain `act(() => {...})` (sync) does NOT flush the async continuation.

**Never-resolving promise** (AC1, AC5a, AC6): use `mockReturnValueOnce(new Promise(() => {}))` not `mockReturnValue` to keep test isolation clean.

**Step-4 checkbox as the guarded trigger**: the "Attach invoice PDFs" checkbox (`getByLabelText('Attach invoice PDFs')`) on step 4 calls `guardedUpdate`. It's always enabled (unlike "Include cover letter" which is disabled when source has no contactAddress/reference). One Back click from step 5 reaches step 4. This is cleaner than step-3 invoice toggle (which would disable the Next button when all invoices are excluded).

**Navigation pattern for modal trigger**:

```
goToStep5 → user.click(Back) [5→4] → user.click(getByLabelText('Attach invoice PDFs')) → modal
```

**After confirm + navigate back to step 5**: use `clickNext(user)` from step 4 (one click). Token is already incremented, so the resolved promise bails silently.

**AC9 / AC10 re-navigation**: after a use-case or source change resets state, re-navigate forward through the wizard the same way `goToStep5` would — click source radio, wait for Next enabled, clickNext ×3.

**skippedDocuments via Preview PDF** (AC10): `user.click(button 'Preview PDF')` → wait for `getByText('PDF Preview')` (modal title) → `user.keyboard('{Escape}')` → wait for modal gone → skipped docs visible in step-5 body.

**Discard modal title and body distinction**:

- `isGeneratingAi && overrides empty && aiContent null` → title `discardConfirmTitleGenerating` ("Cancel AI generation?"), body `discardConfirmBodyGenerating` ("An AI generation is in progress...")
- any other dirty state → title `discardConfirmTitle` ("Discard your edits?"), body `discardConfirmBody` ("Changing this will regenerate...")

Tests AC1, AC2, AC3, AC6 (in-flight only) assert `'Cancel AI generation?'` as the title.
Tests AC4, AC5b, AC10's guardedUpdate check, and the step-3 invoice toggle test assert `'Discard your edits?'` (overrides or aiContent present).

**Why:** `jest.clearAllMocks()` clears call records but NOT implementations. Use `mockReturnValueOnce` (not `mockReturnValue`) for one-shot responses to prevent leaking never-resolving promise default to later tests.
