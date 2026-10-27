import { useEffect, useId, useRef } from 'react';
import sharedStyles from '../../styles/shared.module.css';
import { EntityPicker } from './EntityPicker.js';
import styles from './EntityPicker.module.css';
import type { EntityOption, EntityPickerProps } from './types.js';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export interface EntityMultiPickerProps {
  readonly value: readonly EntityOption[];
  readonly onChange: (next: readonly EntityOption[]) => void;
  /** The single picker's props; value, onChange, clearOnSelect and excludeIds are owned here. */
  readonly picker: DistributiveOmit<
    EntityPickerProps,
    'value' | 'onChange' | 'clearOnSelect' | 'excludeIds' | 'id' | 'inputAriaProps'
  >;
  /** Option ids that cannot be picked either (e.g. already linked). */
  readonly excludeIds?: readonly string[];
  /** "Remove ‹label›". */
  readonly removeLabel: (option: EntityOption) => string;
  /** Announced through the picker's own status region ("3 selected"). */
  readonly countLabel: (count: number) => string;
  readonly id?: string;
  readonly invalid?: boolean;
  readonly describedBy?: string;
  readonly testId: string;
}

const NO_EXCLUDED: readonly string[] = [];

/**
 * Pick several entities: an `EntityPicker` in add mode (it clears and keeps focus after a pick)
 * plus a list of removable chips. Chosen options leave the picker's results. A special option
 * (for example "No category") becomes a chip of its own, named by the special option's label.
 */
export function EntityMultiPicker({
  value,
  onChange,
  picker,
  excludeIds = NO_EXCLUDED,
  removeLabel,
  countLabel,
  id,
  invalid,
  describedBy,
  testId,
}: EntityMultiPickerProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const listRef = useRef<HTMLUListElement>(null);
  // After a removal: the index the focus moves to once the list has re-rendered.
  const focusIndexRef = useRef<number | null>(null);

  useEffect(() => {
    const index = focusIndexRef.current;
    if (index === null) return;
    focusIndexRef.current = null;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [];
    const target = buttons[Math.min(index, buttons.length - 1)];
    (target ?? document.getElementById(inputId))?.focus();
  }, [value, inputId]);

  const chosenIds = value.map((option) => option.id);
  const special = picker.specialOptions?.filter((option) => !chosenIds.includes(option.id));

  return (
    <div className={styles.multi} data-testid={testId}>
      <EntityPicker
        {...(picker as EntityPickerProps)}
        specialOptions={special}
        id={inputId}
        value=""
        clearOnSelect
        excludeIds={[...excludeIds, ...chosenIds]}
        inputAriaProps={{
          'aria-invalid': invalid || undefined,
          'aria-describedby': describedBy,
        }}
        onChange={(next, option) => {
          if (next === '' || chosenIds.includes(next)) return;
          const chosen =
            option ??
            (() => {
              const row = picker.specialOptions?.find((entry) => entry.id === next);
              return row ? { id: row.id, label: row.label } : null;
            })();
          if (chosen) onChange([...value, chosen]);
        }}
      />
      <p role="status" className={sharedStyles.srOnly} data-testid={`${testId}-status`}>
        {value.length > 0 ? countLabel(value.length) : ''}
      </p>
      {value.length > 0 && (
        <ul ref={listRef} className={styles.multiChips} data-testid={`${testId}-chips`}>
          {value.map((option, index) => (
            <li
              key={option.id}
              className={styles.multiChip}
              data-testid={`${testId}-chip-${option.id}`}
            >
              <span className={styles.multiChipText}>
                {option.kindWord && <span className={styles.multiChipKind}>{option.kindWord}</span>}
                <span className={styles.multiChipLabel}>{option.label}</span>
              </span>
              <button
                type="button"
                className={styles.multiChipRemove}
                aria-label={removeLabel(option)}
                data-testid={`${testId}-remove-${option.id}`}
                onClick={() => {
                  focusIndexRef.current = index;
                  onChange(value.filter((entry) => entry.id !== option.id));
                }}
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default EntityMultiPicker;
