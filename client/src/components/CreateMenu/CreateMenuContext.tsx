import {
  createContext,
  use,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import type { KeyboardShortcut } from '../../hooks/useKeyboardShortcuts.js';
import { sanitizePrefill, type CreatePrefill } from '../../navigation/createQuery.js';
import type { OverflowMenuControl } from '../OverflowMenu/OverflowMenu.js';

export interface CreateMenuApi {
  /**
   * Opens the New menu (desktop panel from 1024px, New sheet below). `opener` is where focus
   * returns on Escape (default: the focused element). Does nothing while a modal is open.
   */
  readonly open: (opener?: HTMLElement | null) => void;
  readonly close: () => void;
  /** True while the compact New sheet is open (the desktop panel owns its own state). */
  readonly isOpen: boolean;
}

/** Everything the shell surfaces (top bar, bottom bar, sheet) share; not a page API. */
export interface CreateMenuShell extends CreateMenuApi {
  readonly prefill: CreatePrefill;
  readonly registerPrefill: (prefill: CreatePrefill) => void;
  readonly sheetOpen: boolean;
  readonly sheetId: string;
  readonly plusButtonRef: RefObject<HTMLButtonElement | null>;
  readonly controlRef: RefObject<OverflowMenuControl | null>;
  readonly moneyPage: boolean;
  readonly toggleSheet: () => void;
}

const EMPTY_PREFILL: CreatePrefill = Object.freeze({});
const NO_OP = () => {};
const DETACHED_REF = { current: null };

const DETACHED: CreateMenuShell = {
  open: NO_OP,
  close: NO_OP,
  isOpen: false,
  prefill: EMPTY_PREFILL,
  registerPrefill: NO_OP,
  sheetOpen: false,
  sheetId: '',
  plusButtonRef: DETACHED_REF,
  controlRef: DETACHED_REF,
  moneyPage: false,
  toggleSheet: NO_OP,
};

const CreateMenuContext = createContext<CreateMenuShell | null>(null);

function isModalOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}

export interface CreateMenuProviderProps {
  /** Money pages list the Funding source and Grant rows. */
  readonly moneyPage: boolean;
  /** From 1024px the desktop panel opens; below it the sheet. */
  readonly wide: boolean;
  /** The compact New sheet is open; AppShell owns the key so it can make the page inert. */
  readonly sheetOpen: boolean;
  readonly onSheetOpenChange: (open: boolean) => void;
  readonly children: ReactNode;
}

/** Owns the New menu: context pre-fill, the open path for `n` and the shell surfaces. */
export function CreateMenuProvider({
  moneyPage,
  wide,
  sheetOpen,
  onSheetOpenChange,
  children,
}: CreateMenuProviderProps) {
  const { t } = useTranslation('common');
  const [prefill, setPrefill] = useState<CreatePrefill>(EMPTY_PREFILL);
  const controlRef = useRef<OverflowMenuControl | null>(null);
  const plusButtonRef = useRef<HTMLButtonElement | null>(null);
  const sheetId = useId();

  const registerPrefill = useCallback((next: CreatePrefill) => {
    setPrefill((prev) =>
      prev.areaId === next.areaId && prev.companyId === next.companyId && prev.date === next.date
        ? prev
        : next,
    );
  }, []);

  const open = useCallback(
    (opener?: HTMLElement | null) => {
      if (isModalOpen()) return;
      if (wide) {
        // Nothing focused (focus on <body>): Escape returns to the New button, the menu default.
        const from = opener ?? (document.activeElement as HTMLElement | null);
        controlRef.current?.open('first', from && from !== document.body ? from : null);
      } else {
        onSheetOpenChange(true);
      }
    },
    [wide, onSheetOpenChange],
  );

  const close = useCallback(() => {
    controlRef.current?.close();
    onSheetOpenChange(false);
  }, [onSheetOpenChange]);

  const toggleSheet = useCallback(
    () => onSheetOpenChange(!sheetOpen),
    [onSheetOpenChange, sheetOpen],
  );

  // The shell's `n`: yields to a page that owns `n` itself (Tasks, Milestones).
  const shortcuts = useMemo<KeyboardShortcut[]>(
    () => [
      {
        key: 'n',
        handler: () => open(document.activeElement as HTMLElement | null),
        description: t('createMenu.shortcut'),
      },
    ],
    [open, t],
  );
  useKeyboardShortcuts(shortcuts, { fallback: true });

  const value = useMemo<CreateMenuShell>(
    () => ({
      open,
      close,
      isOpen: sheetOpen,
      prefill,
      registerPrefill,
      sheetOpen,
      sheetId,
      plusButtonRef,
      controlRef,
      moneyPage,
      toggleSheet,
    }),
    [open, close, sheetOpen, prefill, registerPrefill, sheetId, moneyPage, toggleSheet],
  );

  return <CreateMenuContext value={value}>{children}</CreateMenuContext>;
}

/** The New menu handle. Outside a provider `open`/`close` do nothing. */
export function useCreateMenu(): CreateMenuApi {
  const { open, close, isOpen } = use(CreateMenuContext) ?? DETACHED;
  return useMemo(() => ({ open, close, isOpen }), [open, close, isOpen]);
}

/** Shell-internal access (TopBar, BottomBar, CreateSheet). */
export function useCreateMenuShell(): CreateMenuShell {
  return use(CreateMenuContext) ?? DETACHED;
}

/** The pre-fill registered by the page on screen (empty when none). */
export function useCreatePrefill(): CreatePrefill {
  return (use(CreateMenuContext) ?? DETACHED).prefill;
}

/**
 * A page declares the context it is about (area, company, visible date). Entries that accept a
 * key add it to their URL; invalid values are dropped. Cleared when the page unmounts.
 */
export function useCreateContext(context: {
  readonly areaId?: string;
  readonly companyId?: string;
  readonly date?: string;
}): void {
  const { registerPrefill } = use(CreateMenuContext) ?? DETACHED;
  const { areaId, companyId, date } = context;
  useEffect(() => {
    registerPrefill(sanitizePrefill({ areaId, companyId, date }));
    return () => registerPrefill(EMPTY_PREFILL);
  }, [registerPrefill, areaId, companyId, date]);
}
