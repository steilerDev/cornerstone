/** Keyboard map of the cost line grid: pure, so the rules are testable without a DOM. */

export type GridCellKind =
  /** Single-line text input (Description, Quantity, Unit, Unit price). */
  | 'text'
  /** A picker or select: Enter and the arrows keep their native action. */
  | 'native'
  /** A toggle or button: Enter activates it. */
  | 'button';

export type GridKeyIntent =
  'nextRow' | 'prevRow' | 'up' | 'down' | 'duplicate' | 'removeRow' | 'save' | 'escape';

export interface GridKeyEvent {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

/**
 * What a key press in the grid means. Enter moves within the column (Shift+Enter back), the
 * vertical arrows only in single-line inputs, the horizontal arrows never (the caret keeps them),
 * Ctrl/⌘+D duplicates, Ctrl/⌘+Backspace removes an empty row, Ctrl/⌘+S and Ctrl/⌘+Enter save.
 */
export function gridKeyIntent(
  event: GridKeyEvent,
  cellKind: GridCellKind,
  rowIsEmpty: boolean,
): GridKeyIntent | null {
  const command = event.ctrlKey || event.metaKey;
  if (command && !event.altKey) {
    const key = event.key.toLowerCase();
    if (key === 'd') return 'duplicate';
    if (key === 's' || key === 'enter') return 'save';
    if (key === 'backspace') return rowIsEmpty ? 'removeRow' : null;
    return null;
  }
  if (event.altKey) return null;
  if (event.key === 'Escape') return 'escape';
  if (cellKind !== 'text') return null;
  if (event.key === 'Enter') return event.shiftKey ? 'prevRow' : 'nextRow';
  if (event.shiftKey) return null;
  if (event.key === 'ArrowUp') return 'up';
  if (event.key === 'ArrowDown') return 'down';
  return null;
}
