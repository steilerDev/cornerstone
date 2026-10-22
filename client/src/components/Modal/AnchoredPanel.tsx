import { useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  size,
  useFloating,
} from '@floating-ui/react';
import { useClickOutside } from '../../hooks/useClickOutside.js';
import { useDialogLevel } from './dialogLayer.js';
import { markEscapeHandled, useFocusTrap } from './useFocusTrap.js';
import styles from './AnchoredPanel.module.css';

export type AnchoredPanelDismissReason = 'escape' | 'outside' | 'route';

export interface AnchoredPanelProps {
  readonly open: boolean;
  readonly anchorRef: RefObject<HTMLElement | null>;
  /** `dialog` for the date step; omit for plain content (the menu inside carries its own role). */
  readonly role?: 'dialog';
  readonly id: string;
  readonly ariaLabel?: string;
  readonly ariaDescribedBy?: string;
  readonly onDismiss: (reason: AnchoredPanelDismissReason) => void;
  /** true for dialog-like content (date step): Tab wraps inside the panel. */
  readonly trapFocus?: boolean;
  /** Pass `location.key`: a change while open dismisses with reason `route`. */
  readonly closeSignal?: unknown;
  readonly testId?: string;
  /** Side of the anchor the panel aligns to (default `bottom-start`). */
  readonly placement?: 'bottom-start' | 'bottom-end';
  /**
   * `popover` (default) sits above every dialog. `dialog` takes a place in the dialog stack
   * instead, so a dialog opened from inside the panel renders above it.
   */
  readonly layer?: 'popover' | 'dialog';
  readonly children: ReactNode;
}

/** Presses that are not "outside" the panel. */
const OUTSIDE_PRESS_EXCLUSIONS =
  '[data-search-picker-dropdown], [data-anchored-panel], [aria-modal="true"], [data-toast-container]';

/**
 * Non-modal popover anchored to an element (Floating UI, ADR-033). Mounted only while open and
 * portaled to `body`. Dismisses on Escape, an outside press (the anchor excluded) and a route
 * change; the host decides where focus goes afterwards.
 */
export function AnchoredPanel({
  open,
  anchorRef,
  role,
  id,
  ariaLabel,
  ariaDescribedBy,
  onDismiss,
  trapFocus = false,
  closeSignal,
  testId,
  placement = 'bottom-start',
  layer = 'popover',
  children,
}: AnchoredPanelProps) {
  // Dialogs opened later (a row's ConfirmDialog) stack above a `dialog`-layer panel.
  const level = useDialogLevel(open && layer === 'dialog');
  const { refs, floatingStyles, isPositioned } = useFloating({
    open,
    strategy: 'fixed',
    placement,
    middleware: [
      offset(4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(availableHeight, 0)}px`;
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const panelRef = useRef<HTMLDivElement | null>(null);
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    refs.setReference(anchorRef.current);
  }, [refs, anchorRef, open]);

  // A SearchPicker dropdown is portaled to <body>, so a press inside it is not "outside" this
  // panel (otherwise picking an option would close the panel before the selection lands).
  useClickOutside(
    [anchorRef, panelRef],
    (event) => {
      const target = event.target as Element;
      // Not "outside": a SearchPicker dropdown, a nested panel (a row's menu), a stacked dialog
      // and the toast region (Undo).
      // A container that holds the anchor is the panel's own host (its dialog or parent panel):
      // a press elsewhere inside it is still outside this panel.
      const hit = target.closest(OUTSIDE_PRESS_EXCLUSIONS);
      if (hit && !hit.contains(anchorRef.current)) return;
      onDismissRef.current('outside');
    },
    open,
  );

  // Escape: the trap handles it for dialog-like content; menus listen here.
  useFocusTrap(panelRef, {
    active: open && trapFocus,
    onEscape: () => onDismissRef.current('escape'),
  });
  useEffect(() => {
    if (!open || trapFocus) return;
    // Capture phase: a nested menu inside a trapping panel dismisses first and marks the Escape
    // handled, so the outer trap skips it.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      markEscapeHandled(e);
      onDismissRef.current('escape');
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, trapFocus]);

  // A route change while open closes the panel (the signal at open time is the baseline).
  const baselineSignalRef = useRef(closeSignal);
  useEffect(() => {
    if (!open) baselineSignalRef.current = closeSignal;
    else if (!Object.is(baselineSignalRef.current, closeSignal)) onDismissRef.current('route');
  }, [open, closeSignal]);

  if (!open) return null;

  return (
    <FloatingPortal>
      <div
        id={id}
        ref={(node) => {
          panelRef.current = node;
          refs.setFloating(node);
        }}
        style={{
          ...(isPositioned ? floatingStyles : { ...floatingStyles, opacity: 0 }),
          ...(layer === 'dialog' ? { zIndex: `calc(var(--z-modal) + ${level * 2})` } : {}),
        }}
        className={styles.panel}
        data-anchored-panel=""
        role={role}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        data-testid={testId}
      >
        {children}
      </div>
    </FloatingPortal>
  );
}
