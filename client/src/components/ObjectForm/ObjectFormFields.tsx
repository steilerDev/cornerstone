import { ObjectFormField } from './ObjectFormField.js';
import styles from './ObjectForm.module.css';
import type {
  ObjectFormChild,
  ObjectFormErrors,
  ObjectFormField as ObjectFormFieldDef,
  ObjectFormValues,
} from './types.js';

export interface ObjectFormFieldsProps {
  /** The schema's fields (already scoped by the schema hook). */
  readonly fields: readonly ObjectFormFieldDef[];
  /** Which fields to render, in this order; names not in `fields` (out of scope) are skipped. */
  readonly names: readonly string[];
  readonly values: ObjectFormValues;
  readonly errors: ObjectFormErrors;
  readonly onChange: (name: string, value: unknown) => void;
  readonly busy?: boolean;
  /** DOM ids are `${idPrefix}${name}` (a card passes its useId()-based prefix). Default ''. */
  readonly idPrefix?: string;
  /** Per-field DOM id overrides (e.g. the milestone target date id the page focuses). */
  readonly ids?: Readonly<Partial<Record<string, string>>>;
  /** Per-field test id overrides (existing card test ids stay stable). */
  readonly testIds?: Readonly<Partial<Record<string, string>>>;
}

/** Edit-scope schemas never offer create-from-picker, so a child step is a no-op. */
const NO_CHILD = (_child: ObjectFormChild): void => {};

/**
 * Schema fields outside the dialog (a SectionCard's edit mode): the same `ObjectFormField` markup
 * (label, control, hint, error, aria-*) inside ObjectForm's `.fields` grid. No "More details":
 * every listed, visible field shows.
 */
export function ObjectFormFields({
  fields,
  names,
  values,
  errors,
  onChange,
  busy = false,
  idPrefix = '',
  ids,
  testIds,
}: ObjectFormFieldsProps) {
  return (
    <div className={styles.fields}>
      {names.map((name) => {
        const field = fields.find((candidate) => candidate.name === name);
        if (!field || field.visibleWhen?.(values) === false) return null;
        const from = field.errorFrom;
        const linkedErrorId =
          from && errors[from] ? `${ids?.[from] ?? `${idPrefix}${from}`}-error` : undefined;
        return (
          <ObjectFormField
            key={name}
            field={field}
            value={values[name]}
            values={values}
            error={errors[name]}
            linkedErrorId={linkedErrorId}
            busy={busy}
            onChange={(next) => onChange(name, next)}
            onSetValues={(next) => {
              for (const [key, value] of Object.entries(next)) onChange(key, value);
            }}
            createChild={NO_CHILD}
            id={ids?.[name] ?? `${idPrefix}${name}`}
            testId={testIds?.[name]}
          />
        );
      })}
    </div>
  );
}
