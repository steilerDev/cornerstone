import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { useWideDialog } from '../../hooks/useWideDialog.js';
import { focusPageHeading } from '../../lib/focusPageHeading.js';
import { Sheet } from './Sheet.js';
import { isEscapeHandled } from './useFocusTrap.js';
import styles from './SidePanel.module.css';

/** At this width and wider the panel docks beside the page instead of overlaying it. */
export const SIDE_PANEL_DOCKED_QUERY = '(min-width: 1440px)';

export interface SidePanelProps {
  readonly id: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  /** Before the title (e.g. a Back button). */
  readonly headerStart?: ReactNode;
  readonly children: ReactNode;
  /** Pinned below the body. */
  readonly footer?: ReactNode;
  /** Focus target when the panel closes (the opener). */
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly testId: string;
  /** The heading takes focus when the panel opens or this changes. */
  readonly focusKey?: unknown;
}

/**
 * A panel that docks beside the page at 1440 px and wider (non-modal `<aside>`, no focus trap,
 * no backdrop) and is a Sheet below that: a side sheet from 768 px, a bottom sheet under it.
 */
export function SidePanel({
  id,
  open,
  onClose,
  title,
  headerStart,
  children,
  footer,
  returnFocusRef,
  testId,
  focusKey,
}: SidePanelProps) {
  const { t } = useTranslation('common');
  const docked = useMediaQuery(SIDE_PANEL_DOCKED_QUERY);
  const wide = useWideDialog();
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dockedOpen = docked && open;

  // Docked: move focus to the title when the panel opens or `focusKey` changes.
  useEffect(() => {
    if (dockedOpen) titleRef.current!.focus();
  }, [dockedOpen, focusKey]);

  if (!docked) {
    return (
      <Sheet
        id={id}
        open={open}
        onClose={onClose}
        title={title}
        variant={wide ? 'side' : 'bottom'}
        headerStart={headerStart}
        footer={footer}
        focusTitleOnOpen
        returnFocusRef={returnFocusRef}
        testId={testId}
      >
        {children}
      </Sheet>
    );
  }

  if (!open) return null;

  const dismiss = () => {
    onClose();
    const opener = returnFocusRef.current;
    if (opener?.isConnected) opener.focus();
    else focusPageHeading();
  };

  const handleKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Escape' || isEscapeHandled(e.nativeEvent)) return;
    e.stopPropagation();
    dismiss();
  };

  return (
    <aside
      id={id}
      className={styles.docked}
      aria-labelledby={titleId}
      data-testid={testId}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.header}>
        {headerStart}
        <h2 id={titleId} ref={titleRef} tabIndex={-1} className={styles.title}>
          {title}
        </h2>
        <button
          type="button"
          className={styles.close}
          aria-label={t('button.close')}
          onClick={dismiss}
          data-testid={`${testId}-close`}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </div>
      <div className={styles.body}>{children}</div>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </aside>
  );
}
