import styles from './Badge.module.css';

export interface BadgeVariant {
  label: string;
  className: string;
}

export type BadgeVariantMap = Record<string, BadgeVariant>;

interface BadgeProps {
  variants: BadgeVariantMap;
  value: string;
  ariaLabel?: string;
  testId?: string;
  className?: string;
}

export function Badge({ variants, value, ariaLabel, testId, className }: BadgeProps) {
  const variant = variants[value];
  const combinedClass = [styles.badge, variant?.className, className].filter(Boolean).join(' ');

  return (
    <span className={combinedClass} aria-label={ariaLabel} data-testid={testId}>
      {variant?.label ?? value}
    </span>
  );
}
