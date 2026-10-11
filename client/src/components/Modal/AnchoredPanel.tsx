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
import { useFocusTrap } from './useFocusTrap.js';
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
  readonly children: ReactNode;
}

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
  children,
}: AnchoredPanelProps) {
  const { refs, floatingStyles, isPositioned } = useFloating({
    open,
    strategy: 'fixed',
    placement: 'bottom-start',
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

  useClickOutside([anchorRef, panelRef], () => onDismissRef.current('outside'), open);

  // Escape: the trap handles it for dialog-like content; menus listen here.
  useFocusTrap(panelRef, {
    active: open && trapFocus,
    onEscape: () => onDismissRef.current('escape'),
  });
  useEffect(() => {
    if (!open || trapFocus) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismissRef.current('escape');
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
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
        style={isPositioned ? floatingStyles : { ...floatingStyles, opacity: 0 }}
        className={styles.panel}
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
