import type { ReactNode } from 'react';
import { useHref, useLinkClickHandler } from 'react-router-dom';
import styles from './EmptyState.module.css';

export interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface EmptyStateProps {
  /** Icon to display (emoji string or React node) */
  icon?: ReactNode;
  /** Main message text */
  message: string;
  /** Optional secondary description */
  description?: string;
  /** Optional action button/link */
  action?: EmptyStateAction;
  /** Additional CSS class */
  className?: string;
  /** Element for the message: 'p' (default) or 'h1' when the empty state is the whole page. */
  messageAs?: 'p' | 'h1';
}

/** Real anchor (middle-click works) that navigates in-app on a plain click. */
function EmptyStateLink({ href, label }: { href: string; label: string }) {
  const resolvedHref = useHref(href);
  const handleClick = useLinkClickHandler<HTMLAnchorElement>(href);
  return (
    <a href={resolvedHref} onClick={handleClick} className={styles.action}>
      {label}
    </a>
  );
}

export function EmptyState({
  icon,
  message,
  description,
  action,
  className,
  messageAs,
}: EmptyStateProps) {
  const Message = messageAs === 'h1' ? 'h1' : 'p';
  const messageClass =
    messageAs === 'h1' ? `${styles.message} ${styles.messageHeading}` : styles.message;
  if (action?.href) {
    return (
      <div className={`${styles.emptyState} ${className || ''}`}>
        {icon && (
          <div className={styles.icon} aria-hidden="true">
            {icon}
          </div>
        )}

        <Message className={messageClass}>{message}</Message>

        {description && <p className={styles.description}>{description}</p>}

        <EmptyStateLink href={action.href} label={action.label} />
      </div>
    );
  }

  return (
    <div className={`${styles.emptyState} ${className || ''}`}>
      {icon && (
        <div className={styles.icon} aria-hidden="true">
          {icon}
        </div>
      )}

      <Message className={messageClass}>{message}</Message>

      {description && <p className={styles.description}>{description}</p>}

      {action && (
        <button type="button" className={styles.action} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

export default EmptyState;
