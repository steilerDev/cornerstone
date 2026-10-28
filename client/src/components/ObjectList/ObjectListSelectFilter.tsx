import { useTranslation } from 'react-i18next';
import { FormError } from '../FormError/FormError.js';
import { fetchFailureMessage } from '../../lib/fetchFailure.js';
import type { FetchFailure } from '../../lib/fetchFailure.js';
import shared from '../../styles/shared.module.css';
import type { ObjectListFilterRenderContext } from './types.js';
import styles from './ObjectListSelectFilter.module.css';

export interface ObjectListSelectFilterProps {
  readonly ctx: ObjectListFilterRenderContext;
  readonly label: string;
  /** Text of the "any" option, which clears the param. */
  readonly emptyLabel: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  /** Why the options could not be loaded; shown below the select. */
  readonly failure: FetchFailure | null;
  /** Message for a failure that has no API error code (already translated). */
  readonly failureFallback: string;
  readonly testId: string;
  /** Value to show as selected when the param holds more than the select can (default: the param). */
  readonly value?: string;
}

/** A native select filter with an "any" option that clears the param, and its load failure below it. */
export function ObjectListSelectFilter({
  ctx,
  label,
  emptyLabel,
  options,
  failure,
  failureFallback,
  testId,
  value,
}: ObjectListSelectFilterProps) {
  const { t: tErrors } = useTranslation('errors');
  return (
    <div className={styles.field}>
      <label htmlFor={ctx.id} className={styles.label}>
        {label}
      </label>
      <select
        id={ctx.id}
        className={`${shared.select} ${styles.select}`}
        value={value ?? ctx.value ?? ''}
        onChange={(e) => ctx.onChange(e.target.value === '' ? null : e.target.value)}
        data-testid={testId}
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {failure ? (
        <FormError
          variant="field"
          message={fetchFailureMessage(failure, tErrors, failureFallback)}
        />
      ) : null}
    </div>
  );
}
