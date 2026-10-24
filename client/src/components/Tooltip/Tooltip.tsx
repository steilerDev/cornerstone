import { useId, useRef, useState } from 'react';
import styles from './Tooltip.module.css';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  id?: string;
  /** Click or tap on the wrapper toggles the tooltip (touch has no hover or focus). */
  toggleOnClick?: boolean;
  /** `end` right-aligns the bubble to the trigger (triggers at a right edge, e.g. amounts). */
  align?: 'center' | 'end';
}

export function Tooltip({
  content,
  children,
  id,
  toggleOnClick = false,
  align = 'center',
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const autoId = useId();
  const tooltipId = id ?? `tooltip-${autoId}`;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinnedRef = useRef(false);

  function show() {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setIsVisible(true);
  }

  function hide() {
    // Small delay so moving along the trigger edge doesn't flicker
    hideTimerRef.current = setTimeout(() => {
      pinnedRef.current = false;
      setIsVisible(false);
    }, 50);
  }

  // A click on a trigger that hover or focus already opened pins it open; the next click closes.
  function handleClick() {
    if (isVisible && pinnedRef.current) {
      hideNow();
      return;
    }
    pinnedRef.current = true;
    show();
  }

  function hideNow() {
    pinnedRef.current = false;
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setIsVisible(false);
  }

  return (
    <span
      className={styles.wrapper}
      onClick={toggleOnClick ? handleClick : undefined}
      onKeyDown={(event) => {
        // WCAG 1.4.13: dismissable without moving pointer or focus.
        if (event.key === 'Escape' && isVisible) hideNow();
      }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {/* Wrap children in a span that forwards aria-describedby */}
      <span aria-describedby={tooltipId} style={{ display: 'contents' }}>
        {children}
      </span>
      <span
        id={tooltipId}
        role="tooltip"
        className={`${styles.tooltip} ${align === 'end' ? styles.alignEnd : ''} ${isVisible ? styles.visible : ''}`}
      >
        {content}
      </span>
    </span>
  );
}
