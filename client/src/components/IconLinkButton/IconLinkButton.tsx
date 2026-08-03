import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Tooltip } from '../Tooltip/Tooltip.js';
import styles from './IconLinkButton.module.css';

export interface IconLinkButtonProps {
  /** Internal route path (react-router `Link` `to`). */
  to: string;
  /** Required — must identify what this opens, never a bare "open". */
  ariaLabel: string;
  /** Inline SVG icon element. Give it explicit width/height attributes (this file's convention), not CSS sizing. */
  icon: ReactNode;
  /** Optional hover/focus tooltip text, rendered via the shared Tooltip component. */
  tooltip?: string;
  /** When true, renders target="_blank" and bakes in rel="noopener noreferrer". Default false. */
  newTab?: boolean;
  className?: string;
}

export function IconLinkButton({
  to,
  ariaLabel,
  icon,
  tooltip,
  newTab = false,
  className,
}: IconLinkButtonProps) {
  const link = (
    <Link
      to={to}
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noopener noreferrer' : undefined}
      aria-label={ariaLabel}
      className={`${styles.link} ${className || ''}`}
    >
      {icon}
    </Link>
  );

  return tooltip ? <Tooltip content={tooltip}>{link}</Tooltip> : link;
}
