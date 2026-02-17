import { useEffect } from 'react';

export interface KeyboardShortcut {
  key: string;
  handler: () => void;
  description: string;
}

/**
 * Attaches keyboard shortcuts to the document.
 * Shortcuts are ignored when focus is on input, textarea, select, or contenteditable elements.
 *
 * @param shortcuts Array of keyboard shortcut definitions
 * @returns The same array of shortcuts (for the help overlay)
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]): KeyboardShortcut[] {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Ignore shortcuts when focus is on input elements
      const target = event.target as HTMLElement;
      const isInputField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      if (isInputField) {
        return;
      }

      // Find matching shortcut
      const shortcut = shortcuts.find((s) => s.key === event.key);
      if (shortcut) {
        event.preventDefault();
        shortcut.handler();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts]);

  return shortcuts;
}
