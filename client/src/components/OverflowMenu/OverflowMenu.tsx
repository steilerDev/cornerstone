import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useId,
  useLayoutEffect,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useClickOutside } from '../../hooks/useClickOutside.js';
import { markEscapeHandled } from '../Modal/useFocusTrap.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './OverflowMenu.module.css';

export const SCROLL_CLOSE_THRESHOLD_PX = 8;

const NAVIGABLE_SELECTOR =
  '[role="menuitem"]:not(:disabled), [role="menuitemradio"]:not(:disabled)';

export interface OverflowMenuItem {
  kind?: 'action';
  /** Stable, unique within the menu; used as the React key. */
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'destructive';
  icon?: ReactNode;
  testId?: string;
  /** Keep the menu open after activation (pending actions). Default false. */
  keepOpen?: boolean;
  /** Unavailable but still focusable (aria-disabled="true"); activation is a no-op. */
  ariaDisabled?: boolean;
}

export interface OverflowMenuLinkItem {
  kind: 'link';
  id: string;
  label: string;
  /** Named `href`, not `to`: the entry renders a plain anchor. */
  href: string;
  onClick?: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
  /** Opens in a new tab: target="_blank", rel="noopener noreferrer", trailing arrow. */
  newTab?: boolean;
  /** Screen-reader-only suffix, e.g. "(opens in a new tab)". */
  srSuffix?: string;
  testId?: string;
  /** The current page: aria-current="page", highlighted, with a leading checkmark. */
  current?: boolean;
}

export interface OverflowMenuSeparator {
  kind: 'separator';
  id: string;
}

export interface OverflowMenuChoiceOption {
  value: string;
  label: string;
  lang?: string;
  testId?: string;
  /** Unavailable but still focusable (aria-disabled); activation is a no-op and the menu stays open. */
  ariaDisabled?: boolean;
  /** Why it is unavailable; the option's accessible description. Used with `ariaDisabled`. */
  description?: string;
}

export interface OverflowMenuChoiceGroup {
  kind: 'choice';
  id: string;
  label: string;
  options: readonly OverflowMenuChoiceOption[];
  value: string | null;
  onChange: (value: string) => void;
}

export interface OverflowMenuGroup {
  kind: 'group';
  id: string;
  label: string;
  /** Right-aligned text on the label line (e.g. the version). */
  meta?: ReactNode;
  items: readonly (OverflowMenuItem | OverflowMenuLinkItem)[];
}

export type OverflowMenuEntry =
  | OverflowMenuItem
  | OverflowMenuLinkItem
  | OverflowMenuSeparator
  | OverflowMenuChoiceGroup
  | OverflowMenuGroup;

/** Props a custom trigger (`renderTrigger`) must spread onto its `<button>`. */
export interface OverflowMenuTriggerProps {
  readonly ref: RefObject<HTMLButtonElement | null>;
  readonly id: string;
  readonly type: 'button';
  readonly 'aria-haspopup': 'menu';
  readonly 'aria-expanded': boolean;
  readonly 'aria-controls': string | undefined;
  readonly 'aria-label': string;
  readonly 'data-testid': string | undefined;
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly onKeyDown: (event: ReactKeyboardEvent) => void;
}

type OverflowMenuPlacement = 'bottom-end' | 'top-end' | 'bottom-start';

function menuPlacementClass(placement: OverflowMenuPlacement): string | undefined {
  if (placement === 'top-end') return styles.menuTop;
  return placement === 'bottom-start' ? styles.menuBottomStart : styles.menuBottom;
}

/** Imperative handle for opening the menu from outside (the `n` shortcut). */
export interface OverflowMenuControl {
  /** Opens with focus on the first or last row; Escape/Tab then return focus to `returnTo` (default the trigger). */
  open(focus: 'first' | 'last', returnTo?: HTMLElement | null): void;
  close(): void;
  readonly isOpen: () => boolean;
}

export interface OverflowMenuProps {
  items: readonly OverflowMenuEntry[];
  triggerAriaLabel: string;
  triggerIcon?: ReactNode;
  /** Replaces the default `.trigger` class (e.g. the avatar). */
  triggerClassName?: string;
  /** Extra class on the panel (size constraints). */
  menuClassName?: string;
  /** Non-item content above the menu list; linked to it with aria-describedby. */
  header?: ReactNode;
  /** The menu closes whenever this value changes (pass location.key for route changes). */
  closeSignal?: unknown;
  /** Caller-owned trigger ref (to restore focus after a dialog the menu opened). */
  triggerRef?: RefObject<HTMLButtonElement | null>;
  /**
   * 'bottom-start' is a non-portal, left-aligned panel below the trigger; with `usePortal`
   * it falls back to 'bottom-end' positioning.
   */
  placement?: OverflowMenuPlacement;
  /** Replaces the built-in trigger `<button>` inside the wrapper. */
  renderTrigger?: (props: OverflowMenuTriggerProps) => ReactNode;
  /** Appended to the wrapper's class. */
  wrapperClassName?: string;
  disabled?: boolean;
  usePortal?: boolean;
  'data-testid'?: string;
  /** Test id of the panel. */
  menuTestId?: string;
  /** Receives an imperative open/close handle. */
  controlRef?: RefObject<OverflowMenuControl | null>;
}

export function OverflowMenu({
  items,
  triggerAriaLabel,
  triggerIcon = '⋮',
  triggerClassName,
  menuClassName,
  header,
  closeSignal,
  triggerRef: externalTriggerRef,
  placement = 'bottom-end',
  renderTrigger,
  wrapperClassName,
  disabled = false,
  usePortal = false,
  'data-testid': dataTestId,
  menuTestId,
  controlRef,
}: OverflowMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState<unknown>(undefined);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);
  const [effectivePlacement, setEffectivePlacement] = useState<'bottom-end' | 'top-end'>(
    'bottom-end',
  );
  const wrapperRef = useRef<HTMLDivElement>(null);
  const internalTriggerRef = useRef<HTMLButtonElement>(null);
  const triggerRef = externalTriggerRef ?? internalTriggerRef;
  const menuRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef<'first' | 'last' | null>(null);
  const returnToRef = useRef<HTMLElement | null>(null);
  const openRef = useRef(false);
  const triggerId = useId();
  const menuId = useId();
  const headerId = useId();

  // The menu closes when `closeSignal` changes after it was opened.
  const open = isOpen && Object.is(openedAt, closeSignal);

  const close = () => setIsOpen(false);
  openRef.current = open;

  // Escape and Tab return focus here: a caller-supplied element, else the trigger.
  const focusReturnTarget = useCallback(() => {
    const target = returnToRef.current;
    returnToRef.current = null;
    if (target?.isConnected) target.focus();
    else triggerRef.current?.focus();
  }, [triggerRef]);

  // Close menu on outside click
  useClickOutside([wrapperRef, menuRef], close, open);

  // Close menu on scroll and resize when using portal
  useEffect(() => {
    if (!open || !usePortal) return;

    const initialScrollX = window.scrollX;
    const initialScrollY = window.scrollY;

    const handleScroll = () => {
      const deltaX = Math.abs(window.scrollX - initialScrollX);
      const deltaY = Math.abs(window.scrollY - initialScrollY);
      if (deltaX > SCROLL_CLOSE_THRESHOLD_PX || deltaY > SCROLL_CLOSE_THRESHOLD_PX) {
        setIsOpen(false);
      }
    };
    const handleResize = () => setIsOpen(false);

    document.addEventListener('scroll', handleScroll, { capture: true });
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('scroll', handleScroll, { capture: true });
      window.removeEventListener('resize', handleResize);
    };
  }, [open, usePortal]);

  // Close menu on Escape key at document level
  useEffect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      // Skip if the menu element itself already handled this event
      if (menuRef.current?.contains(e.target as Node)) {
        return;
      }

      if (e.key === 'Escape') {
        // Consumed here: a dialog around the menu must not also close (the capture phase runs
        // before the dialog's focus-trap listener).
        markEscapeHandled(e);
        e.preventDefault();
        setIsOpen(false);
        focusReturnTarget();
      }
    };

    document.addEventListener('keydown', handleEscape, true);
    return () => document.removeEventListener('keydown', handleEscape, true);
  }, [open, focusReturnTarget]);

  // Move focus into the menu after a keyboard open
  useLayoutEffect(() => {
    if (!open) return;
    const target = pendingFocusRef.current;
    pendingFocusRef.current = null;
    if (!target) return;
    const navigable = menuRef.current?.querySelectorAll<HTMLElement>(NAVIGABLE_SELECTOR);
    if (!navigable || navigable.length === 0) return;
    navigable[target === 'first' ? 0 : navigable.length - 1]?.focus();
  }, [open]);

  const openMenu = (focus: 'first' | 'last' | null) => {
    pendingFocusRef.current = focus;
    returnToRef.current = null;
    if (usePortal) {
      const rect = triggerRef.current!.getBoundingClientRect();
      setTriggerRect(rect);
      const portalPlacement = placement === 'top-end' ? 'top-end' : 'bottom-end';
      setEffectivePlacement(portalPlacement);
      setMenuPos({
        top: portalPlacement === 'top-end' ? rect.top - 4 : rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setOpenedAt(closeSignal);
    setIsOpen(true);
  };

  useLayoutEffect(() => {
    if (!controlRef) return;
    controlRef.current = {
      open: (focus, returnTo) => {
        openMenu(focus);
        returnToRef.current = returnTo ?? null;
      },
      close: () => {
        returnToRef.current = null;
        setIsOpen(false);
      },
      isOpen: () => openRef.current,
    };
    return () => {
      controlRef.current = null;
    };
  });

  const handleTriggerKeyDown = (e: ReactKeyboardEvent) => {
    if (open) return;
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openMenu('first');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      openMenu('last');
    }
  };

  const handleMenuKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Tab') {
      // Close and return to the trigger; the browser then moves on from there.
      setIsOpen(false);
      focusReturnTarget();
      return;
    }
    if (e.key === 'Escape') {
      markEscapeHandled(e.nativeEvent);
      e.preventDefault();
      setIsOpen(false);
      focusReturnTarget();
      return;
    }
    if (e.key === ' ' && e.target instanceof HTMLAnchorElement) {
      e.preventDefault();
      e.target.click();
      return;
    }

    const menuItems = menuRef.current?.querySelectorAll<HTMLElement>(NAVIGABLE_SELECTOR);
    if (!menuItems || menuItems.length === 0) return;

    const currentIndex = Array.from(menuItems).findIndex((item) => item === document.activeElement);

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const nextIndex = currentIndex === menuItems.length - 1 ? 0 : currentIndex + 1;
        menuItems[nextIndex]?.focus();
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prevIndex = currentIndex <= 0 ? menuItems.length - 1 : currentIndex - 1;
        menuItems[prevIndex]?.focus();
        break;
      }
      case 'Home': {
        e.preventDefault();
        menuItems[0]?.focus();
        break;
      }
      case 'End': {
        e.preventDefault();
        menuItems[menuItems.length - 1]?.focus();
        break;
      }
    }
  };

  // Flip menu above trigger if it doesn't fit below (portal mode only)
  useLayoutEffect(() => {
    if (!usePortal || !open || !triggerRect || !menuRef.current) return;

    const menuRect = menuRef.current.getBoundingClientRect();
    const menuHeight = menuRect.height;
    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;
    const MIN_MARGIN = 4;

    // For 'bottom-end' placement: check if menu fits below
    if (effectivePlacement === 'bottom-end') {
      if (spaceBelow < menuHeight + MIN_MARGIN && spaceAbove >= menuHeight + MIN_MARGIN) {
        // Flip to top
        setMenuPos({
          top: triggerRect.top - MIN_MARGIN,
          right: window.innerWidth - triggerRect.right,
        });
        setEffectivePlacement('top-end');
      }
    }
    // For 'top-end' placement: check if menu fits above
    else if (effectivePlacement === 'top-end') {
      if (spaceAbove < menuHeight + MIN_MARGIN && spaceBelow >= menuHeight + MIN_MARGIN) {
        // Flip to bottom
        setMenuPos({
          top: triggerRect.bottom + MIN_MARGIN,
          right: window.innerWidth - triggerRect.right,
        });
        setEffectivePlacement('bottom-end');
      }
    }
  }, [open, usePortal, triggerRect, effectivePlacement]);

  const handleItemClick = (item: OverflowMenuItem) => {
    if (item.ariaDisabled) return;
    if (item.keepOpen) {
      item.onClick();
      return;
    }
    setIsOpen(false);
    item.onClick();
  };

  const handleLinkClick = (item: OverflowMenuLinkItem, e: ReactMouseEvent<HTMLAnchorElement>) => {
    item.onClick?.(e);
    setIsOpen(false);
  };

  // Keyboard opens are handled on keydown; a click opens without moving focus.
  const handleTriggerClick = () => {
    if (open) {
      setIsOpen(false);
      return;
    }
    openMenu(null);
  };

  const renderItem = (item: OverflowMenuItem | OverflowMenuLinkItem): ReactNode => {
    if (item.kind === 'link') {
      return (
        <a
          key={item.id}
          role="menuitem"
          tabIndex={-1}
          href={item.href}
          className={`${styles.item} ${item.current ? styles.itemCurrent : ''}`}
          aria-current={item.current ? 'page' : undefined}
          data-testid={item.testId}
          onClick={(e) => handleLinkClick(item, e)}
          {...(item.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {item.current && (
            <span aria-hidden="true" className={styles.checkmark}>
              ✓
            </span>
          )}
          {item.label}
          {item.newTab && (
            <>
              <span aria-hidden="true" className={styles.external}>
                ↗
              </span>
              {item.srSuffix && <span className={sharedStyles.srOnly}>{item.srSuffix}</span>}
            </>
          )}
        </a>
      );
    }
    return (
      <button
        key={item.id}
        type="button"
        role="menuitem"
        tabIndex={-1}
        className={`${styles.item} ${item.variant === 'destructive' ? styles.itemDanger : ''}`}
        onClick={() => handleItemClick(item)}
        disabled={item.disabled}
        aria-disabled={item.ariaDisabled ? 'true' : undefined}
        data-testid={item.testId}
      >
        {item.icon && (
          <span className={styles.itemIcon} aria-hidden="true">
            {item.icon}
          </span>
        )}
        {item.label}
      </button>
    );
  };

  const renderEntry = (entry: OverflowMenuEntry): ReactNode => {
    switch (entry.kind) {
      case 'separator':
        return <div key={entry.id} role="separator" className={styles.separator} />;
      case 'choice': {
        const labelId = `${menuId}-${entry.id}`;
        return (
          <div key={entry.id} role="group" aria-labelledby={labelId}>
            <div id={labelId} className={styles.groupLabel}>
              {entry.label}
            </div>
            <div className={styles.options}>
              {entry.options.map((option) => {
                const selected = option.value === entry.value;
                const descriptionId = option.description
                  ? `${menuId}-${entry.id}-${option.value}-desc`
                  : undefined;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    tabIndex={-1}
                    lang={option.lang}
                    className={`${styles.option} ${selected ? styles.optionSelected : ''} ${option.ariaDisabled ? styles.optionDisabled : ''}`}
                    aria-disabled={option.ariaDisabled ? 'true' : undefined}
                    aria-describedby={descriptionId}
                    data-testid={option.testId}
                    onClick={() => {
                      if (option.ariaDisabled) return;
                      entry.onChange(option.value);
                    }}
                  >
                    {selected && <span aria-hidden="true">✓ </span>}
                    {option.label}
                    {descriptionId && (
                      <span id={descriptionId} className={sharedStyles.srOnly}>
                        {option.description}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      }
      case 'group': {
        const labelId = `${menuId}-${entry.id}`;
        return (
          <div key={entry.id} role="group" aria-labelledby={labelId}>
            <div className={styles.groupLabel}>
              <span id={labelId}>{entry.label}</span>
              {entry.meta !== undefined && <span className={styles.groupMeta}>{entry.meta}</span>}
            </div>
            {entry.items.map(renderItem)}
          </div>
        );
      }
      default:
        return renderItem(entry);
    }
  };

  const menuElement = (
    <div
      ref={menuRef}
      className={[
        styles.menu,
        usePortal && styles.menuFixed,
        !usePortal && menuPlacementClass(placement),
        menuClassName,
      ]
        .filter(Boolean)
        .join(' ')}
      onKeyDown={handleMenuKeyDown}
      data-testid={menuTestId}
      style={
        usePortal && menuPos
          ? {
              position: 'fixed',
              top: `${menuPos.top}px`,
              right: `${menuPos.right}px`,
              ...(effectivePlacement === 'top-end' ? { transform: 'translateY(-100%)' } : {}),
            }
          : undefined
      }
    >
      {header && (
        <div id={headerId} className={styles.header}>
          {header}
        </div>
      )}
      <div
        role="menu"
        id={menuId}
        aria-labelledby={triggerId}
        aria-describedby={header ? headerId : undefined}
        className={styles.list}
      >
        {items.map(renderEntry)}
      </div>
    </div>
  );

  const triggerProps: OverflowMenuTriggerProps = {
    ref: triggerRef,
    id: triggerId,
    type: 'button',
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    'aria-label': triggerAriaLabel,
    'data-testid': dataTestId,
    disabled,
    onClick: handleTriggerClick,
    onKeyDown: handleTriggerKeyDown,
  };

  return (
    <div
      ref={wrapperRef}
      className={wrapperClassName ? `${styles.wrapper} ${wrapperClassName}` : styles.wrapper}
    >
      {renderTrigger ? (
        renderTrigger(triggerProps)
      ) : (
        <button {...triggerProps} className={triggerClassName ?? styles.trigger}>
          {triggerIcon}
        </button>
      )}
      {open && usePortal ? createPortal(menuElement, document.body) : open && menuElement}
    </div>
  );
}
