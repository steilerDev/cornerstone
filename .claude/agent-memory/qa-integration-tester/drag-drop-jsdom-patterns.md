---
name: drag-drop-jsdom-patterns
description: Patterns and anti-patterns for testing drag-and-drop logic in React components under jsdom
type: feedback
---

## getBoundingClientRect in Drag-Over Handlers

**Rule**: In jsdom, `getBoundingClientRect()` always returns all zeros. Mocking `Element.prototype.getBoundingClientRect` or `HTMLElement.prototype.getBoundingClientRect` does NOT intercept calls made through React's delegated event system (React 19 uses event delegation from the root, and `e.currentTarget` in the handler does not resolve through the normal prototype chain lookup — it bypasses both `Element.prototype` and `HTMLElement.prototype` mocks).

**Why**: The call in `(e.currentTarget as HTMLElement).getBoundingClientRect()` during a React 19 synthetic event handler always returns zeros regardless of prototype mocks. Neither `jest.spyOn(element, 'getBoundingClientRect')` (instance mock) nor `Element.prototype.getBoundingClientRect = ...` (prototype mock) are intercepted.

**How to apply**:
- Do NOT write tests that assert "above vs below" drop position based on `clientY` relative to `getBoundingClientRect()` output — they will always resolve to "below" (since `clientY > 0 >= 0 + 0/2`).
- Instead, assert that SOME drop indicator class is applied (use `.toMatch(/columnCheckboxItemDrop(Above|Below)/)`).
- For the "below" direction specifically: any `clientY > 0` will always produce "below" — this IS testable.
- For the "above" direction: not testable in jsdom unit tests. Cover via E2E tests instead.
- For dragLeave clearing: test that both `Above` and `Below` classes are absent after `fireEvent.dragLeave(element)` — this IS reliable.

## Auto-focus with setTimeout in jsdom

**Rule**: `jest.useFakeTimers()` + `act(() => { jest.runAllTimers(); })` works for testing `setTimeout(() => element.focus(), 0)` in React event handlers.

**How to apply**:
- Use synchronous `act(() => { jest.runAllTimers(); })` (not async) — `runAllTimers` inside a synchronous `act` correctly flushes the timer and React state updates.
- Always restore real timers with `jest.useRealTimers()` in cleanup (or in the test body after assertions).
- `document.activeElement` correctly reflects `element.focus()` called inside a flushed `setTimeout`.
