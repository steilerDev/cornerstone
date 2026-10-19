import { useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { FilterChipGroup } from '../FilterChipGroup/FilterChipGroup.js';
import type { FilterChipOption } from '../FilterChipGroup/FilterChipGroup.js';
import styles from './DateChips.module.css';

export interface DateChipsProps {
  /** YYYY-MM-DD */
  value: string;
  onChange: (value: string) => void;
  /** YYYY-MM-DD (host computes with todayLocalIsoDate) */
  today: string;
  /** Native date input max (host passes today). */
  max?: string;
  labels: {
    group: string;
    today: string;
    yesterday: string;
    pick: string;
    /** "Pick · 12 Oct": host builds the text from a formatted date. */
    pickWithDate: (formatted: string) => string;
    input: string;
  };
  /** Host passes useFormatters().formatDayMonth. */
  formatPicked: (isoDate: string) => string;
  hint?: ReactNode;
  disabled?: boolean;
  testIdPrefix?: string;
}

/** `today` minus one day, computed with UTC date math (no local-timezone parsing). */
export function previousIsoDate(isoDate: string): string {
  const [y = 1970, m = 1, d = 1] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - 1));
  return date.toISOString().slice(0, 10);
}

/** Today · Yesterday · Pick date chips with an inline native date input. */
export function DateChips({
  value,
  onChange,
  today,
  max,
  labels,
  formatPicked,
  hint,
  disabled = false,
  testIdPrefix = 'date-chips',
}: DateChipsProps) {
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const rowId = `${baseId}-row`;
  const groupRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const yesterday = previousIsoDate(today);
  const isCustom = value !== today && value !== yesterday;

  function focusPressedChip() {
    // Wait for the pressed state to render, then return focus to the now-pressed chip.
    requestAnimationFrame(() => {
      const pressed = groupRef.current?.querySelector<HTMLElement>('button[aria-pressed="true"]');
      pressed?.focus();
    });
  }

  const options: FilterChipOption[] = [
    { value: 'today', label: labels.today },
    { value: 'yesterday', label: labels.yesterday },
    {
      value: 'pick',
      label: isCustom ? labels.pickWithDate(formatPicked(value)) : labels.pick,
      action: true,
      actionPressed: isCustom,
      ariaExpanded: open,
      ariaControls: rowId,
      onSelect: () => setOpen((o) => !o),
    },
  ];

  const selected = value === today ? 'today' : value === yesterday ? 'yesterday' : '';

  return (
    <div className={styles.root} data-testid={testIdPrefix}>
      <span id={labelId} className={styles.label}>
        {labels.group}
      </span>
      <fieldset className={styles.fieldset} disabled={disabled}>
        <FilterChipGroup
          options={options}
          value={selected}
          onChange={(v) => {
            onChange(v === 'today' ? today : yesterday);
            setOpen(false);
          }}
          labelledBy={labelId}
          layout="wrap"
          groupRef={groupRef}
          testIdPrefix={testIdPrefix}
        />
      </fieldset>
      <div id={rowId} className={styles.row} hidden={!open}>
        <input
          type="date"
          className={styles.input}
          value={value}
          max={max}
          disabled={disabled}
          aria-label={labels.input}
          data-testid={`${testIdPrefix}-input`}
          onChange={(e) => {
            if (!e.target.value) return;
            onChange(e.target.value);
            setOpen(false);
            focusPressedChip();
          }}
        />
      </div>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );
}
