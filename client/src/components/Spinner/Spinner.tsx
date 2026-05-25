export interface SpinnerProps {
  /** Size of the spinner: 'sm' (32px), 'md' (48px), or 'lg' (80px) */
  size?: 'sm' | 'md' | 'lg';
  /** Color variant: 'primary' or 'muted' */
  color?: 'primary' | 'muted';
  /** Aria label for accessibility */
  label?: string;
}

const SIZE_MAP: Record<NonNullable<SpinnerProps['size']>, { diameter: string; stroke: number }> = {
  sm: { diameter: 'var(--spacing-4)', stroke: 2 },
  md: { diameter: 'var(--spacing-6)', stroke: 2 },
  lg: { diameter: 'var(--spacing-10)', stroke: 3 },
};

const COLOR_MAP: Record<NonNullable<SpinnerProps['color']>, string> = {
  primary: 'var(--color-primary)',
  muted: 'var(--color-text-muted)',
};

import styles from './Spinner.module.css';

export function Spinner({
  size = 'md',
  color = 'primary',
  label = 'Loading',
}: SpinnerProps) {
  const { diameter, stroke } = SIZE_MAP[size];
  const strokeColor = COLOR_MAP[color];

  return (
    <svg
      className={styles.spinner}
      style={{ width: diameter, height: diameter }}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label={label}
    >
      {/* Background track */}
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth={stroke}
        opacity={0.2}
        style={{ color: strokeColor }}
      />
      {/* Animated arc */}
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray="31.4 62.8"
        style={{ color: strokeColor }}
        className={styles.arc}
      />
    </svg>
  );
}

export default Spinner;
