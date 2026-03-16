import type { ReactNode } from 'react';
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
}

export function EmptyState({ icon, message, description, action, className }: EmptyStateProps) {
  if (action?.href) {
    return (
      <div className={`${styles.emptyState} ${className || ''}`}>
        {icon && (
          <div className={styles.icon} aria-hidden="true">
            {icon}
          </div>
        )}

        <p className={styles.message}>{message}</p>

        {description && <p className={styles.description}>{description}</p>}

        {action && (
          <a href={action.href} className={styles.action}>
            {action.label}
          </a>
        )}
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

      <p className={styles.message}>{message}</p>

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
