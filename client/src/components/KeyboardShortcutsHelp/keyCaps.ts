import type { TFunction } from 'i18next';
import type { RegisteredShortcut } from '../../hooks/shortcutRegistry.js';

/** Fixed Everywhere order (UX): unknown global keys follow in registration order. */
export const GLOBAL_SHORTCUT_ORDER: readonly string[] = ['Mod+k', '/', 'n', '?', 'Escape', 'Mod+z'];

export interface ShortcutGroups {
  readonly page: readonly RegisteredShortcut[];
  readonly global: readonly RegisteredShortcut[];
  readonly goTo: readonly RegisteredShortcut[];
}

function globalRank(key: string): number {
  const index = GLOBAL_SHORTCUT_ORDER.indexOf(key);
  return index === -1 ? GLOBAL_SHORTCUT_ORDER.length : index;
}

/** Drops rows with an empty description (e.g. the Backspace twin); sorts `global` by order. */
export function groupShortcuts(shortcuts: readonly RegisteredShortcut[]): ShortcutGroups {
  const listed = shortcuts.filter((shortcut) => shortcut.description);
  return {
    page: listed.filter((shortcut) => shortcut.group === 'page'),
    global: listed
      .filter((shortcut) => shortcut.group === 'global')
      .sort((a, b) => globalRank(a.key) - globalRank(b.key)),
    goTo: listed.filter((shortcut) => shortcut.group === 'goTo'),
  };
}

export interface KeyCap {
  readonly text: string;
  /** Screen-reader text when the visible cap is a symbol. */
  readonly spoken?: string;
}

function capFor(part: string, t: TFunction, apple: boolean): KeyCap {
  switch (part) {
    case 'Mod+k':
      return apple
        ? { text: t('topBar.searchShortcutApple'), spoken: t('keyboardShortcuts.keyNameCommandK') }
        : { text: t('topBar.searchShortcutOther') };
    case 'Mod+z':
      return apple
        ? { text: t('undoToast.shortcutKeyApple'), spoken: t('keyboardShortcuts.keyNameCommandZ') }
        : { text: t('undoToast.shortcutKeyOther') };
    case 'Escape':
      return {
        text: t('keyboardShortcuts.keyCapEscape'),
        spoken: t('keyboardShortcuts.keyNameEscape'),
      };
    case 'Delete':
      return { text: t('keyboardShortcuts.keyCapDelete') };
    case '?':
      return { text: '?', spoken: t('keyboardShortcuts.keyNameQuestionMark') };
    case '/':
      return { text: '/', spoken: t('keyboardShortcuts.keyNameSlash') };
    default:
      return { text: part };
  }
}

/** One cap per sequence step. */
export function keyCapsFor(key: string, t: TFunction, apple: boolean): KeyCap[] {
  return key.split(' ').map((part) => capFor(part, t, apple));
}
