import { useEffect, useId } from 'react';
import { isReservedShortcutKey, useShortcutRegistry } from './shortcutRegistry.js';
import type { ShortcutGroup } from './shortcutRegistry.js';

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
  /** Where the help overlay lists the shortcuts. Default `'page'`; the shell uses `'global'`. */
  group?: ShortcutGroup;
}

/** True when no shortcut may fire: modifier held, a modal open, or focus in a text field. */
export function isShortcutSuppressed(event: KeyboardEvent): boolean {
  // Ignore shortcuts when modifier keys are held
  if (event.ctrlKey || event.altKey || event.metaKey) return true;

  // Page shortcuts are off while a modal is open
  if (document.querySelector('[aria-modal="true"]')) return true;

  // Ignore shortcuts when focus is on input elements
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
}

/**
 * A single-key (character) shortcut: every space-separated part of the registry key is one
 * character (`/`, `n`, `?`, `g s`). Named keys (`Delete`, `Escape`) and chords (`Mod+k`) are not.
 * These are the shortcuts the "Single-key shortcuts" switch turns off (WCAG 2.1.4).
 */
export function isSingleKeyShortcut(key: string): boolean {
  return key.split(' ').every((part) => [...part].length === 1);
}

/**
 * Attaches keyboard shortcuts to the document.
 * Shortcuts are ignored when focus is on input, textarea, select, or contenteditable elements.
 *
 * Shortcuts are also ignored while any modal (`aria-modal="true"`) is open, and character keys
 * are ignored while the user turned single-key shortcuts off.
 *
 * Page shortcuts may not use `g`, `?` or `/`: the registry drops them with a `console.error`.
 *
 * @param shortcuts Array of keyboard shortcut definitions
 * @param options `fallback`: yield to a non-fallback owner of the same key; `group`: help group
 * @returns The same array of shortcuts (for the help overlay)
 */
export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  options?: KeyboardShortcutsOptions,
): KeyboardShortcut[] {
  const registry = useShortcutRegistry();
  const id = useId();
  const fallback = options?.fallback === true;
  const group = options?.group;
  const pageGroup = group === undefined || group === 'page';
  useEffect(
    () => registry?.register(id, shortcuts, { fallback, ...(group ? { group } : {}) }),
    [registry, id, shortcuts, fallback, group],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isShortcutSuppressed(event)) return;

      // Find matching shortcut
      const shortcut = shortcuts.find(
        (s) => s.key === event.key && !(pageGroup && isReservedShortcutKey(s.key)),
      );
      if (shortcut) {
        if (fallback && registry?.hasNonFallbackOwner(shortcut.key, id)) return;
        // Off switch: the key reaches the page untouched.
        if (isSingleKeyShortcut(shortcut.key) && registry?.singleKeyEnabled() === false) return;
        event.preventDefault();
        shortcut.handler();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts, fallback, pageGroup, registry, id]);

  return shortcuts;
}
