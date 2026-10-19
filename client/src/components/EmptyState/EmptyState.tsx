import type { ReactNode, Ref } from 'react';
import { useHref, useLinkClickHandler } from 'react-router-dom';
import styles from './EmptyState.module.css';

export interface EmptyStateAction {
  label: string;
  href?: string;
  /** Router location state for the in-app navigation of an `href` action. */
  state?: unknown;
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
  /** Element for the message: 'p' (default), 'h1' when the empty state is the whole page, or 'h2'. */
  messageAs?: 'p' | 'h1' | 'h2';
  /** Ref to the message element. When set, the message is programmatically focusable. */
  messageRef?: Ref<HTMLHeadingElement | HTMLParagraphElement>;
}

/** Real anchor (middle-click works) that navigates in-app on a plain click. */
function EmptyStateLink({ href, label, state }: { href: string; label: string; state?: unknown }) {
  const resolvedHref = useHref(href);
  const handleClick = useLinkClickHandler<HTMLAnchorElement>(
    href,
    state === undefined ? {} : { state },
  );
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
  messageRef,
}: EmptyStateProps) {
  const Message = messageAs === 'h1' || messageAs === 'h2' ? messageAs : 'p';
  const messageClass =
    Message === 'p' ? styles.message : `${styles.message} ${styles.messageHeading}`;
  const messageProps = {
    className: messageClass,
    ...(messageRef ? { ref: messageRef as Ref<HTMLHeadingElement>, tabIndex: -1 } : {}),
  };
  if (action?.href) {
    return (
      <div className={`${styles.emptyState} ${className || ''}`}>
        {icon && (
          <div className={styles.icon} aria-hidden="true">
            {icon}
          </div>
        )}

        <Message {...messageProps}>{message}</Message>

        {description && <p className={styles.description}>{description}</p>}

        <EmptyStateLink href={action.href} label={action.label} state={action.state} />
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

      <Message {...messageProps}>{message}</Message>

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
