import { useEffect, useId } from 'react';
import { useShortcutRegistry } from './shortcutRegistry.js';

export interface KeyboardShortcut {
  key: string;
  handler: () => void;
  description: string;
}

export interface KeyboardShortcutsOptions {
  /**
   * The shortcuts yield to any other owner that registered the same key without `fallback`
   * (e.g. the shell's `n` yields to a page's own `n`).
   */
  fallback?: boolean;
}

/**
 * Attaches keyboard shortcuts to the document.
 * Shortcuts are ignored when focus is on input, textarea, select, or contenteditable elements.
 *
 * Shortcuts are also ignored while any modal (`aria-modal="true"`) is open.
 *
 * @param shortcuts Array of keyboard shortcut definitions
 * @param options `fallback`: yield to a non-fallback owner of the same key
 * @returns The same array of shortcuts (for the help overlay)
 */
export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  options?: KeyboardShortcutsOptions,
): KeyboardShortcut[] {
  const registry = useShortcutRegistry();
  const id = useId();
  const fallback = options?.fallback === true;
  useEffect(
    () => registry?.register(id, shortcuts, { fallback }),
    [registry, id, shortcuts, fallback],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Ignore shortcuts when modifier keys are held
      if (event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      // Page shortcuts are off while a modal is open
      if (document.querySelector('[aria-modal="true"]')) {
        return;
      }

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
        if (fallback && registry?.hasNonFallbackOwner(shortcut.key, id)) return;
        event.preventDefault();
        shortcut.handler();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts, fallback, registry, id]);

  return shortcuts;
}
