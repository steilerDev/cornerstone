import { useState } from 'react';
import styles from './ColorField.module.css';

/** The colour a "No color" box starts from once unchecked: the browser's own default. */
const BROWSER_DEFAULT_COLOR = '#000000';

export interface ColorFieldProps {
  /** DOM id of the colour input (the host label points at it). */
  readonly id: string;
  /** `#rrggbb`, or `null` for "No color". */
  readonly value: string | null;
  readonly onChange: (value: string | null) => void;
  readonly disabled?: boolean;
  /** Already translated label of the "No color" checkbox. */
  readonly noColorLabel: string;
  /** Test ids become `${prefix}-color` and `${prefix}-no-color`. */
  readonly testIdPrefix?: string;
  readonly describedBy?: string;
}

/**
 * Colour input plus a "No color" checkbox. Unticking the box restores the last picked colour
 * (the browser default until one was picked).
 */
export function ColorField({
  id,
  value,
  onChange,
  disabled,
  noColorLabel,
  testIdPrefix,
  describedBy,
}: ColorFieldProps) {
  const [lastColor, setLastColor] = useState(value ?? BROWSER_DEFAULT_COLOR);
  const noColor = value === null;
  const shown = noColor ? lastColor : value;

  return (
    <div className={styles.colorRow}>
      <input
        id={id}
        type="color"
        className={styles.colorInput}
        value={shown}
        disabled={noColor || disabled}
        aria-describedby={describedBy}
        onChange={(event) => {
          setLastColor(event.target.value);
          onChange(event.target.value);
        }}
        data-testid={testIdPrefix ? `${testIdPrefix}-color` : undefined}
      />
      <label className={styles.checkLabel}>
        <input
          type="checkbox"
          checked={noColor}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked ? null : lastColor)}
          data-testid={testIdPrefix ? `${testIdPrefix}-no-color` : undefined}
        />
        {noColorLabel}
      </label>
    </div>
  );
}
