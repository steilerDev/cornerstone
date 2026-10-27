import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FormError } from '../FormError/FormError.js';
import { Skeleton } from '../Skeleton/Skeleton.js';
import { ColorField } from './ColorField.js';
import styles from './ObjectForm.module.css';
import type { ObjectFormChild, ObjectFormField as FieldDef, ObjectFormValues } from './types.js';

export interface ObjectFormFieldProps {
  readonly field: FieldDef;
  readonly value: unknown;
  /** All values of the step, passed to custom renderers. */
  readonly values?: ObjectFormValues;
  readonly error: string | undefined;
  readonly busy: boolean;
  readonly onChange: (value: unknown) => void;
  readonly onSetValues: (values: ObjectFormValues, announcement?: string) => void;
  readonly createChild: (child: ObjectFormChild) => void;
}

const NO_VALUES: ObjectFormValues = {};

function cx(...parts: readonly (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** One labelled field of an ObjectForm: label, control, hint and field-level error. */
export function ObjectFormField({
  field,
  value,
  values = NO_VALUES,
  error,
  busy,
  onChange,
  onSetValues,
  createChild,
}: ObjectFormFieldProps) {
  const { t } = useTranslation('common');
  const { name, label, kind, required } = field;
  const hint = typeof field.hint === 'function' ? field.hint(values) : field.hint;
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  const noticeId = field.notice ? `${name}-notice` : undefined;
  const describedBy = [hintId, noticeId, errorId].filter(Boolean).join(' ') || undefined;
  const invalid = error !== undefined;
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';

  const common = {
    id: name,
    name,
    'aria-required': required || undefined,
    'aria-invalid': invalid || undefined,
    'aria-describedby': describedBy,
    'data-testid': field.testId,
  } as const;

  let control: ReactNode;
  if (field.optionsLoading) {
    control = <Skeleton lines={1} />;
  } else if (kind === 'custom') {
    control = field.render?.({
      id: name,
      value,
      setValue: (next) => {
        if (!busy) onChange(next);
      },
      busy,
      invalid,
      describedBy,
      createChild,
      values,
      setValues: (next, announcement) => {
        if (!busy) onSetValues(next, announcement);
      },
    });
  } else if (kind === 'color') {
    control = (
      <ColorField
        id={name}
        value={typeof value === 'string' && value !== '' ? value : null}
        onChange={(next) => onChange(next)}
        disabled={busy}
        noColorLabel={t('referenceList.noColor')}
        testIdPrefix={field.testId}
        describedBy={describedBy}
      />
    );
  } else if (kind === 'select') {
    control = (
      <select
        {...common}
        className={cx(styles.select, invalid && styles.inputError)}
        value={text}
        onChange={(event) => {
          if (!busy) onChange(event.target.value);
        }}
        aria-disabled={busy || undefined}
      >
        {(field.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  } else if (kind === 'textarea') {
    control = (
      <textarea
        {...common}
        className={cx(styles.textarea, invalid && styles.inputError)}
        rows={3}
        value={text}
        maxLength={field.maxLength}
        placeholder={field.placeholder}
        readOnly={busy}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  } else {
    control = (
      <input
        {...common}
        type={kind}
        className={cx(styles.input, invalid && styles.inputError)}
        value={text}
        min={kind === 'number' ? field.min : undefined}
        step={kind === 'number' ? field.step : undefined}
        inputMode={kind === 'number' ? field.inputMode : undefined}
        maxLength={field.maxLength}
        placeholder={field.placeholder}
        readOnly={busy}
        onChange={(event) => onChange(event.target.value)}
        onWheel={kind === 'number' ? (event) => event.currentTarget.blur() : undefined}
      />
    );
  }

  const labelContent = (
    <>
      {label}
      {required && <span className={styles.required}> {t('objectForm.required')}</span>}
    </>
  );
  const asGroup = kind === 'custom' && field.group === true;
  const Wrapper = asGroup ? 'fieldset' : 'div';

  return (
    <Wrapper
      className={cx(
        styles.field,
        asGroup && styles.group,
        field.width === 'half' && styles.fieldHalf,
      )}
      aria-describedby={asGroup ? describedBy : undefined}
      data-field={name}
    >
      {asGroup ? (
        <legend className={styles.label}>{labelContent}</legend>
      ) : (
        <label htmlFor={name} className={styles.label}>
          {labelContent}
        </label>
      )}
      {control}
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      <FormError variant="field" id={noticeId} message={field.notice} />
      <FormError variant="field" id={errorId} message={error} />
    </Wrapper>
  );
}
