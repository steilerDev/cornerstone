import { createContext, use, useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useShortcutRegistry } from '../../hooks/shortcutRegistry.js';
import type { RegisteredShortcut } from '../../hooks/shortcutRegistry.js';
import { useGoToShortcuts } from '../../hooks/useGoToShortcuts.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import type { KeyboardShortcut } from '../../hooks/useKeyboardShortcuts.js';
import type { NavContext } from '../../navigation/navConfig.js';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp.js';

export interface ShortcutsHelpApi {
  /** Opens the overlay; on close focus goes to `returnFocusRef` when given (menu openers). */
  open(returnFocusRef?: RefObject<HTMLElement | null>): void;
  readonly singleKeyEnabled: boolean;
}

const NOOP_API: ShortcutsHelpApi = { open: () => {}, singleKeyEnabled: true };

const ShortcutsHelpContext = createContext<ShortcutsHelpApi>(NOOP_API);

interface HelpRequest {
  readonly shortcuts: RegisteredShortcut[];
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

function noop() {}

/**
 * Shell host of the one keyboard-shortcut help dialog: owns the global `?` entry, the
 * documentation-only rows (command search, Esc, undo), the `g` go-to sequences and the overlay.
 */
export function ShortcutsHelpProvider({
  navContext,
  children,
}: {
  readonly navContext: NavContext;
  readonly children: ReactNode;
}) {
  const { t } = useTranslation('common');
  const registry = useShortcutRegistry();
  const docId = useId();
  const [enabled, setEnabled] = useState(() => registry?.singleKeyEnabled() ?? true);
  const [request, setRequest] = useState<HelpRequest | null>(null);

  const open = useCallback(
    (returnFocusRef?: RefObject<HTMLElement | null>) =>
      setRequest({
        shortcuts: registry?.snapshot() ?? [],
        ...(returnFocusRef ? { returnFocusRef } : {}),
      }),
    [registry],
  );

  const helpShortcuts = useMemo<KeyboardShortcut[]>(
    () => [{ key: '?', handler: () => open(), description: t('keyboardShortcuts.showHelp') }],
    [open, t],
  );
  useKeyboardShortcuts(helpShortcuts, { group: 'global' });

  // Documentation rows: never matched by a listener (command search, undo and Esc own their keys).
  const docRows = useMemo<KeyboardShortcut[]>(
    () => [
      { key: 'Mod+k', description: t('commandSearch.shortcutHelp'), handler: noop },
      { key: 'Escape', description: t('keyboardShortcuts.closeOpen'), handler: noop },
      { key: 'Mod+z', description: t('undoToast.shortcutHelp'), handler: noop },
    ],
    [t],
  );
  useEffect(
    () => registry?.register(docId, docRows, { group: 'global' }),
    [registry, docId, docRows],
  );

  useGoToShortcuts(navContext);

  const onChange = useCallback(
    (value: boolean) => {
      registry?.setSingleKeyEnabled(value);
      setEnabled(value);
    },
    [registry],
  );

  const onClose = () => {
    const ref = request?.returnFocusRef;
    setRequest(null);
    ref?.current?.focus();
  };

  const api = useMemo<ShortcutsHelpApi>(
    () => ({ open, singleKeyEnabled: enabled }),
    [open, enabled],
  );

  return (
    <ShortcutsHelpContext value={api}>
      {children}
      {request && (
        <KeyboardShortcutsHelp
          shortcuts={request.shortcuts}
          singleKeyEnabled={enabled}
          onSingleKeyEnabledChange={onChange}
          onClose={onClose}
        />
      )}
    </ShortcutsHelpContext>
  );
}

/** Outside a provider: open() does nothing, singleKeyEnabled is true. */
export function useShortcutsHelp(): ShortcutsHelpApi {
  return use(ShortcutsHelpContext);
}
