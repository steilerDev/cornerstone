import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import type { KeyboardShortcut } from '../../hooks/useKeyboardShortcuts.js';
import { getPaperlessStatus } from '../../lib/paperlessApi.js';
import { useCreateMenu } from '../CreateMenu/CreateMenuContext.js';

export interface CommandSearchOpenOptions {
  /** Prefilled query; it searches at once. */
  readonly query?: string;
  /** Where focus returns on close; wins over the opener. */
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

export interface CommandSearchApi {
  /** False outside a provider. */
  readonly available: boolean;
  readonly isOpen: boolean;
  /** Does nothing while another modal dialog is open. */
  readonly open: (options?: CommandSearchOpenOptions) => void;
  readonly close: () => void;
  readonly toggle: () => void;
}

const NO_OP = () => {};

const DETACHED: CommandSearchApi = {
  available: false,
  isOpen: false,
  open: NO_OP,
  close: NO_OP,
  toggle: NO_OP,
};

const CommandSearchContext = createContext<CommandSearchApi | null>(null);
const PaperlessBaseUrlContext = createContext<(() => Promise<string | null>) | null>(null);

function isModalOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}

function isCommandSearchKey(event: KeyboardEvent): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'k' &&
    !event.repeat &&
    !event.isComposing
  );
}

export interface CommandSearchProviderProps {
  readonly isOpen: boolean;
  readonly onOpen: (options: CommandSearchOpenOptions) => void;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/** Owns the open path of the command search: the API, Ctrl/Cmd K and the shell `/`. */
export function CommandSearchProvider({
  isOpen,
  onOpen,
  onClose,
  children,
}: CommandSearchProviderProps) {
  const { t } = useTranslation('common');
  const createMenu = useCreateMenu();
  const closeCreateMenu = createMenu.close;

  const open = useCallback(
    (options: CommandSearchOpenOptions = {}) => {
      if (isModalOpen()) return;
      closeCreateMenu();
      onOpen(options);
    },
    [closeCreateMenu, onOpen],
  );

  const toggle = useCallback(() => {
    if (isOpen) onClose();
    else open();
  }, [isOpen, onClose, open]);

  // Capture phase on window: DiaryFilterBar's input stops keydown propagation at the React root,
  // so a bubbling document listener would never see Ctrl/Cmd K typed there.
  const latestRef = useRef({ isOpen, open, onClose });
  latestRef.current = { isOpen, open, onClose };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!isCommandSearchKey(event)) return;
      // Always: the browser's own Ctrl/Cmd K must never run while the app is focused.
      event.preventDefault();
      const latest = latestRef.current;
      if (latest.isOpen) latest.onClose();
      else latest.open();
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, []);

  // The shell `/`: focus the page's own list search field, else open the palette. The hook
  // already ignores inputs, modifier keys and open modals.
  const shortcuts = useMemo<KeyboardShortcut[]>(
    () => [
      {
        key: '/',
        handler: () => {
          const field = document.querySelector<HTMLInputElement>('[data-page-search]');
          const visible =
            field !== null && (field.checkVisibility?.() ?? field.getClientRects().length > 0);
          if (field && visible) {
            field.focus();
            field.select();
          } else {
            latestRef.current.open();
          }
        },
        description: t('commandSearch.shortcutSlash'),
      },
    ],
    [t],
  );
  useKeyboardShortcuts(shortcuts, { fallback: true });

  const baseUrlRef = useRef<Promise<string | null> | null>(null);
  const getBaseUrl = useCallback(() => {
    baseUrlRef.current ??= getPaperlessStatus()
      .then((status) => (status.configured ? (status.paperlessUrl ?? null) : null))
      .catch(() => null);
    return baseUrlRef.current;
  }, []);

  const value = useMemo<CommandSearchApi>(
    () => ({ available: true, isOpen, open, close: onClose, toggle }),
    [isOpen, open, onClose, toggle],
  );

  return (
    <PaperlessBaseUrlContext value={getBaseUrl}>
      <CommandSearchContext value={value}>{children}</CommandSearchContext>
    </PaperlessBaseUrlContext>
  );
}

/** The command search handle. Outside a provider every call does nothing. */
export function useCommandSearch(): CommandSearchApi {
  return use(CommandSearchContext) ?? DETACHED;
}

const NO_BASE_URL = () => Promise.resolve<string | null>(null);

/** Memoised Paperless link base (browser-facing URL), fetched lazily once; errors give null. */
export function usePaperlessBaseUrl(): () => Promise<string | null> {
  return use(PaperlessBaseUrlContext) ?? NO_BASE_URL;
}
