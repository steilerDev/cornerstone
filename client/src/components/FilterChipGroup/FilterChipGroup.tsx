import type { ReactNode, Ref } from 'react';
import { NavAnchor } from '../../navigation/NavAnchor.js';
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

/** A chip that navigates (a real anchor, no `aria-pressed`). */
export interface FilterChipLinkOption {
  value: string;
  label: string;
  /** In-app path from `routeUrl()` / `quickLogHref()`. */
  to: string;
  state?: unknown;
  /** Full text when the label is ellipsised. */
  title?: string;
  /** Overrides `${testIdPrefix}-${value}`. */
  testId?: string;
}

export interface FilterChipNavigateProps {
  variant: 'navigate';
  options: FilterChipLinkOption[];
  /** One of `ariaLabel` / `labelledBy` should be given. */
  ariaLabel?: string;
  labelledBy?: string;
  testIdPrefix?: string;
  layout?: 'scroll' | 'wrap';
  groupRef?: Ref<HTMLDivElement>;
}

export interface FilterChipToggleProps {
  /** Default. */
  variant?: 'toggle';
  options: FilterChipOption[];
  value: string;
  /** Multi-select: pressed = selectedValues.includes(value); a click calls onChange(value) and the host toggles. */
  selectedValues?: readonly string[];
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

export type FilterChipGroupProps = FilterChipToggleProps | FilterChipNavigateProps;

/**
 * Pick-one chip group; each chip is a toggle button exposing `aria-pressed`. With
 * `variant="navigate"` each chip is a link instead (no pressed state).
 */
export function FilterChipGroup(props: FilterChipGroupProps) {
  if (props.variant === 'navigate') return <NavigateChipGroup {...props} />;
  return <ToggleChipGroup {...props} />;
}

function NavigateChipGroup({
  options,
  ariaLabel,
  labelledBy,
  testIdPrefix = 'filter-chip',
  layout = 'scroll',
  groupRef,
}: FilterChipNavigateProps) {
  return (
    <div
      ref={groupRef}
      className={styles.group}
      role="group"
      aria-label={labelledBy ? undefined : ariaLabel}
      aria-labelledby={labelledBy}
      data-layout={layout}
      data-tone="default"
    >
      {options.map((opt) => (
        <NavAnchor
          key={opt.value}
          to={opt.to}
          state={opt.state}
          className={`${styles.chip} ${styles.chipNavigate}`}
          title={opt.title}
          data-chip-value={opt.value}
          data-testid={opt.testId ?? `${testIdPrefix}-${opt.value}`}
        >
          {opt.label}
        </NavAnchor>
      ))}
    </div>
  );
}

function ToggleChipGroup({
  options,
  value,
  selectedValues,
  onChange,
  ariaLabel,
  labelledBy,
  testIdPrefix = 'filter-chip',
  layout = 'scroll',
  deselectable = false,
  tone = 'default',
  groupRef,
}: FilterChipToggleProps) {
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
        const pressed = selectedValues ? selectedValues.includes(opt.value) : opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            className={styles.chip}
            data-chip-value={opt.value}
            data-testid={testId}
            aria-label={opt.ariaLabel}
            aria-pressed={pressed}
            onClick={() => onChange(deselectable && pressed && !selectedValues ? '' : opt.value)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
