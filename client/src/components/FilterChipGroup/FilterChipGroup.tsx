import type { ReactNode, Ref } from 'react';
import styles from './FilterChipGroup.module.css';

export interface FilterChipOption {
  value: string;
  label: string;
  /** Action chip: calls onSelect, never onChange; no aria-pressed by default; dashed border. */
  action?: boolean;
  onSelect?: () => void;
  /** Action chips only: expose `aria-pressed="true"` (e.g. a chip showing a picked value). */
  actionPressed?: boolean;
  /** Accessible name when it must differ from the visible label (must start with the label). */
  ariaLabel?: string;
  ariaExpanded?: boolean;
  ariaControls?: string;
  ariaHasPopup?: 'menu';
  /** Rendered after the label, aria-hidden (e.g. a chevron). */
  trailing?: ReactNode;
  /** Overrides `${testIdPrefix}-${value}`. */
  testId?: string;
}

export interface FilterChipGroupProps {
  options: FilterChipOption[];
  value: string;
  onChange: (value: string) => void;
  /** One of `ariaLabel` / `labelledBy` should be given. */
  ariaLabel?: string;
  labelledBy?: string;
  testIdPrefix?: string;
  layout?: 'scroll' | 'wrap';
  /** Tapping the pressed chip calls `onChange('')`. */
  deselectable?: boolean;
  /** `onPhoto` = off-theme camera chrome. */
  tone?: 'default' | 'onPhoto';
  groupRef?: Ref<HTMLDivElement>;
}

/** Pick-one chip group; each chip is a toggle button exposing `aria-pressed`. */
export function FilterChipGroup({
  options,
  value,
  onChange,
  ariaLabel,
  labelledBy,
  testIdPrefix = 'filter-chip',
  layout = 'scroll',
  deselectable = false,
  tone = 'default',
  groupRef,
}: FilterChipGroupProps) {
  return (
    <div
      ref={groupRef}
      className={styles.group}
      role="group"
      aria-label={labelledBy ? undefined : ariaLabel}
      aria-labelledby={labelledBy}
      data-layout={layout}
      data-tone={tone}
    >
      {options.map((opt) => {
        const testId = opt.testId ?? `${testIdPrefix}-${opt.value}`;
        const content = (
          <>
            {opt.label}
            {opt.trailing ? <span aria-hidden="true">{opt.trailing}</span> : null}
          </>
        );
        if (opt.action) {
          return (
            <button
              key={opt.value}
              type="button"
              className={`${styles.chip} ${styles.chipAction}`}
              data-chip-value={opt.value}
              data-testid={testId}
              aria-label={opt.ariaLabel}
              aria-pressed={opt.actionPressed ? true : undefined}
              aria-expanded={opt.ariaExpanded}
              aria-controls={opt.ariaControls}
              aria-haspopup={opt.ariaHasPopup}
              onClick={() => opt.onSelect?.()}
            >
              {content}
            </button>
          );
        }
        const pressed = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            className={styles.chip}
            data-chip-value={opt.value}
            data-testid={testId}
            aria-label={opt.ariaLabel}
            aria-pressed={pressed}
            onClick={() => onChange(deselectable && pressed ? '' : opt.value)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
