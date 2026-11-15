import { useState } from 'react';
import type { ObjectListFilterRenderContext } from './types.js';
import styles from './ObjectListCheckboxFilter.module.css';

export interface ObjectListCheckboxFilterProps {
  readonly ctx: ObjectListFilterRenderContext;
  /**
   * single: one box writing options[0].value or null.
   * multi: the checked values comma-joined in option order, null when none.
   */
  readonly mode: 'single' | 'multi';
  readonly options: readonly { readonly value: string; readonly label: string }[];
  /** Each checkbox's testid is `${testIdPrefix}-${value}`. */
  readonly testIdPrefix: string;
}

function parseChecked(
  value: string | null,
  options: ObjectListCheckboxFilterProps['options'],
): ReadonlySet<string> {
  const known = new Set(options.map((option) => option.value));
  const parts = value === null ? [] : value.split(',');
  return new Set(parts.filter((part) => known.has(part)));
}

/**
 * Checkbox filter for the Filters panel: one box (single) or a group (multi), bound to one URL
 * param. The fieldset legend comes from the filter def's label; values in the URL that are not
 * options are ignored for rendering.
 */
export function ObjectListCheckboxFilter({
  ctx,
  mode,
  options,
  testIdPrefix,
}: ObjectListCheckboxFilterProps) {
  const fromUrl = parseChecked(ctx.value, options);
  // A local draft: a router transition would otherwise revert a URL-bound checkbox mid-click.
  const [checked, setChecked] = useState<ReadonlySet<string>>(fromUrl);
  const urlKey = [...fromUrl].join(',');
  const [prevUrlKey, setPrevUrlKey] = useState(urlKey);
  if (urlKey !== prevUrlKey) {
    setPrevUrlKey(urlKey);
    setChecked(fromUrl);
  }

  const toggle = (value: string, on: boolean) => {
    const next = new Set(checked);
    if (on) next.add(value);
    else next.delete(value);
    setChecked(next);
    if (mode === 'single') {
      ctx.onChange(on ? value : null);
      return;
    }
    const joined = options
      .filter((option) => next.has(option.value))
      .map((option) => option.value)
      .join(',');
    ctx.onChange(joined === '' ? null : joined);
  };

  return (
    <div className={styles.group}>
      {options.map((option, index) => (
        <label key={option.value} className={styles.checkRow}>
          <input
            type="checkbox"
            id={index === 0 ? ctx.id : undefined}
            className={styles.checkbox}
            checked={checked.has(option.value)}
            onChange={(e) => toggle(option.value, e.target.checked)}
            data-testid={`${testIdPrefix}-${option.value}`}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}
