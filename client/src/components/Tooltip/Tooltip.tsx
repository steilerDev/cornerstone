import { useId, useRef, useState } from 'react';
import styles from './Tooltip.module.css';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}

export function Tooltip({ content, children, id }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const autoId = useId();
  const tooltipId = id ?? `tooltip-${autoId}`;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setIsVisible(true);
  }

  function hide() {
    // Small delay so moving along the trigger edge doesn't flicker
    hideTimerRef.current = setTimeout(() => setIsVisible(false), 50);
  }

  return (
    <span
      className={styles.wrapper}
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
        className={`${styles.tooltip} ${isVisible ? styles.visible : ''}`}
      >
        {content}
      </span>
    </span>
  );
}
