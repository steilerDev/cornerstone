import { useId, useState } from 'react';
import { FilterChipGroup } from '../FilterChipGroup/FilterChipGroup.js';
import type { FilterChipOption } from '../FilterChipGroup/FilterChipGroup.js';
import styles from './TimeChips.module.css';

export interface TimeChipsProps {
  /** HH:mm or null */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Up to 3 HH:mm values, newest first (host dedups). */
  recent: readonly string[];
  /** Returns the current HH:mm. */
  now: () => string;
  labels: { group: string; now: string; other: string; input: string };
  /** Host passes useFormatters().formatClockTime. */
  formatTime: (hhmm: string) => string;
  invalid?: boolean;
  /** Id of the FormError under the row. */
  describedBy?: string;
  testIdPrefix?: string;
}

const NOW_VALUE = '__now__';

/** Recent times · Now · Other time chips with an inline native time input. */
export function TimeChips({
  value,
  onChange,
  recent,
  now,
  labels,
  formatTime,
  invalid = false,
  describedBy,
  testIdPrefix = 'time-chips',
}: TimeChipsProps) {
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const rowId = `${baseId}-row`;
  const [open, setOpen] = useState(false);

  const recents = recent.slice(0, 3);
  const extra = value && !recents.includes(value) ? [value] : [];

  const options: FilterChipOption[] = [
    ...[...recents, ...extra].map((v) => ({ value: v, label: formatTime(v) })),
    { value: NOW_VALUE, label: labels.now },
    {
      value: 'other',
      label: labels.other,
      action: true,
      ariaExpanded: open,
      ariaControls: rowId,
      onSelect: () => setOpen((o) => !o),
    },
  ];

  // "Now" is a one-shot action that stores the current time as a normal value, so it is
  // never pressed itself.
  return (
    <div className={styles.root} data-testid={testIdPrefix}>
      <span id={labelId} className={styles.label}>
        {labels.group}
      </span>
      <FilterChipGroup
        options={options}
        value={value ?? ''}
        onChange={(v) => onChange(v === NOW_VALUE ? now() : v === '' ? null : v)}
        labelledBy={labelId}
        layout="wrap"
        deselectable
        testIdPrefix={testIdPrefix}
      />
      <div id={rowId} className={styles.row} hidden={!open}>
        <input
          type="time"
          className={styles.input}
          value={value ?? ''}
          aria-label={labels.input}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          data-testid={`${testIdPrefix}-input`}
          onChange={(e) => onChange(e.target.value || null)}
        />
      </div>
    </div>
  );
}
