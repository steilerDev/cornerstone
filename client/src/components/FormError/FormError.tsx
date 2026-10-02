export interface FormErrorProps {
  /** Error message to display */
  message?: string | null;
  /** Whether this is a field-level error (smaller) or banner error (full width) */
  variant?: 'banner' | 'field';
  /** Additional CSS class */
  className?: string;
  /** Optional element id (e.g. for aria-describedby) */
  id?: string;
}

import styles from './FormError.module.css';

export function FormError({ message, variant = 'banner', className, id }: FormErrorProps) {
  if (!message) return null;

  return (
    <div
      id={id}
      className={[styles[variant], className].filter(Boolean).join(' ')}
      role={variant === 'banner' ? 'alert' : undefined}
    >
      {message}
    </div>
  );
}
