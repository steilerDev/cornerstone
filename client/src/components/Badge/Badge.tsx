import type { ReactNode } from 'react';
import styles from './Badge.module.css';

export interface BadgeVariant {
  label: string;
  className?: string;
  /** Decorative leading icon; must be aria-hidden. */
  icon?: ReactNode;
  /** Tooltip for this variant; the Badge `title` prop overrides it. */
  title?: string;
}

export type BadgeVariantMap = Record<string, BadgeVariant>;

interface BadgeProps {
  variants: BadgeVariantMap;
  value: string;
  ariaLabel?: string;
  title?: string;
  testId?: string;
  className?: string;
}

export function Badge({ variants, value, ariaLabel, title, testId, className }: BadgeProps) {
  const variant = variants[value];
  const combinedClass = [styles.badge, variant?.className, className].filter(Boolean).join(' ');

  return (
    <span
      className={combinedClass}
      aria-label={ariaLabel}
      title={title ?? variant?.title}
      data-testid={testId}
    >
      {variant?.icon}
      {variant?.label ?? value}
    </span>
  );
}
