# Story #360 — Document Integration Responsive & A11y Polish (2026-03-02)

## What was done

Updated 3 test files to cover accessibility improvements from Story #360:

- `client/src/components/documents/DocumentCard.test.tsx` — 2 new tests for date-appended aria-label
- `client/src/components/documents/DocumentBrowser.test.tsx` — 5 new tests for ARIA grid attributes
- `client/src/components/documents/LinkedDocumentsSection.test.tsx` — 2 new tests for focus management

## Key Learnings

### DocumentCard aria-label Now Includes Date

`DocumentCard.tsx` changed `aria-label` from `"Document: {title}"` to `"Document: {title}, {formattedDate}"`
when `document.created` is set. Formatted with `toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' })`.

- Existing regex tests like `/Document: Test Invoice 2025/i` still work (substring match).
- Added explicit test for full label format: `/Document: Test Invoice 2025, Mar 15, 2025/i`.
- Added test for null date: `toHaveAttribute('aria-label', 'Document: Test Invoice 2025')`.

### DocumentBrowser Grid ARIA Attributes

Changes in Story #360:

- Grid `<div>` → `role="list"`, `id="document-grid"`, `aria-label="Documents"`, `aria-busy={true/false}`
- Each `DocumentCard` wrapped in `<div role="listitem">`
- Search `<input>` → `aria-controls="document-grid"`

Test pattern for `aria-busy`:

```typescript
// When isLoading=true:
expect(screen.getByRole('list', { name: 'Documents' })).toHaveAttribute('aria-busy', 'true');
// When documents shown (aria-busy={false} in JSX):
expect(screen.getByRole('list', { name: 'Documents' })).toHaveAttribute('aria-busy', 'false');
```

Note: `aria-busy={false}` in JSX renders as `aria-busy="false"` string in HTML — use `'false'` not `false`.

### LinkedDocumentsSection Focus Management

Two new focus patterns added in Story #360:

1. Picker modal `<div role="dialog">` has `tabIndex={-1}` for programmatic focus via `pickerModalRef`.
2. Cancel button in unlink dialog receives focus via `setTimeout(..., 0)` + `cancelButtonRef`.

For `tabIndex` test: use `toHaveAttribute('tabindex', '-1')` (lowercase `tabindex` in HTML).
For focus test: must use `await waitFor(...)` because focus happens in `setTimeout(..., 0)`.

```typescript
// tabIndex test
const dialog = screen.getByRole('dialog', { name: /Add Document/i });
expect(dialog).toHaveAttribute('tabindex', '-1');

// Cancel button focus test
await waitFor(() => expect(screen.getByRole('button', { name: /Cancel/i })).toHaveFocus());
```

### ARM64 ESM Mock Issue — DocumentBrowser & LinkedDocumentsSection

`DocumentBrowser.test.tsx` and `LinkedDocumentsSection.test.tsx` fail locally on ARM64 due to
ESM module mock isolation issues. ALL tests except those that happen to match the initial
module state fail. This is a platform-specific issue that passes correctly in CI (Linux x86_64).

Baseline (before Story #360 changes):

- `DocumentBrowser.test.tsx`: 3 pass, 29 fail on ARM64
- `LinkedDocumentsSection.test.tsx`: 3 pass, 27 fail on ARM64

After Story #360 changes (my additions):

- `DocumentBrowser.test.tsx`: 3 pass, 34 fail (5 new tests added, all fail for same ARM64 reason)
- `LinkedDocumentsSection.test.tsx`: 3 pass, 29 fail (2 new tests added, same ARM64 reason)
- `DocumentCard.test.tsx`: 16 pass (no ESM isolation issues here)

**Rule**: Don't try to fix ARM64 ESM isolation issues in worktree. Validate via CI push.

### Stash Pop Can Merge Test Files Incorrectly

When doing `git stash` + `git stash pop` across a file with staged modifications, git
auto-merge may combine old and new versions incorrectly. Check key invariants:

1. `import type * as Module` must appear AFTER all `jest.unstable_mockModule` calls
2. Default status object must include all required fields (e.g., `paperlessUrl: null`)

If `git stash pop` auto-merges incorrectly: `git checkout HEAD -- <file>` to restore
committed version, then re-apply changes manually.
