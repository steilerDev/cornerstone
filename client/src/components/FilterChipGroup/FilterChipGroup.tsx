import styles from './FilterChipGroup.module.css';

export interface FilterChipOption {
  value: string;
  label: string;
}

export interface FilterChipGroupProps {
  options: FilterChipOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  testIdPrefix?: string;
}

/** Pick-one chip group; each chip is a toggle button exposing `aria-pressed`. */
export function FilterChipGroup({
  options,
  value,
  onChange,
  ariaLabel,
  testIdPrefix = 'filter-chip',
}: FilterChipGroupProps) {
  return (
    <div className={styles.group} role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={styles.chip}
          aria-pressed={opt.value === value}
          data-testid={`${testIdPrefix}-${opt.value}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
