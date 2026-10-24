import type { CreatePrefill } from '../../navigation/createQuery.js';
import type {
  ObjectFormErrors,
  ObjectFormField,
  ObjectFormSchema,
  ObjectFormValues,
} from './types.js';

/** True when a value counts as filled in (arrays and strings must be non-empty). */
export function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** Field-by-field comparison of two value maps (custom values may be arrays). */
export function isDirty(values: ObjectFormValues, initial: ObjectFormValues): boolean {
  const names = new Set([...Object.keys(values), ...Object.keys(initial)]);
  for (const name of names) {
    if (JSON.stringify(values[name]) !== JSON.stringify(initial[name])) return true;
  }
  return false;
}

/** Maps the URL pre-fill keys (areaId, companyId, date) to field names through `schema.prefill`. */
export function mapPrefill(schema: ObjectFormSchema, prefill: CreatePrefill): ObjectFormValues {
  const mapped: Record<string, unknown> = {};
  for (const [key, fieldName] of Object.entries(schema.prefill ?? {})) {
    const value = prefill[key as keyof CreatePrefill];
    if (value !== undefined && fieldName) mapped[fieldName] = value;
  }
  return mapped;
}

/** The values a fresh form starts from: the schema defaults plus the pre-fill. */
export function startValues(
  schema: ObjectFormSchema,
  prefill: ObjectFormValues | undefined,
): ObjectFormValues {
  return { ...schema.initialValues, ...prefill };
}

/** The values after "Add another": defaults plus pre-fill, with `keep` fields carried over. */
export function resetValues(
  schema: ObjectFormSchema,
  prefill: ObjectFormValues | undefined,
  current: ObjectFormValues,
): ObjectFormValues {
  const next: Record<string, unknown> = { ...startValues(schema, prefill) };
  for (const field of schema.fields) {
    if (field.keep) next[field.name] = current[field.name];
  }
  return next;
}

/** A field without `visibleWhen` is always visible. */
export function isFieldVisible(field: ObjectFormField, values: ObjectFormValues): boolean {
  return field.visibleWhen ? field.visibleWhen(values) : true;
}

/** The fields shown for the given values, in schema order. */
export function visibleFields(
  fields: readonly ObjectFormField[],
  values: ObjectFormValues,
): readonly ObjectFormField[] {
  return fields.filter((field) => isFieldVisible(field, values));
}

/** A non-essential field is hidden behind "More details". */
export function isMoreField(field: ObjectFormField): boolean {
  return field.essential !== true;
}

/** "More details" starts open when a pre-filled value lands in a hidden field. */
export function startsExpanded(
  schema: ObjectFormSchema,
  prefill: ObjectFormValues | undefined,
): boolean {
  if (!prefill) return false;
  return visibleFields(schema.fields, startValues(schema, prefill)).some(
    (field) => isMoreField(field) && hasValue(prefill[field.name]),
  );
}

/** "More details" holds no value at all. */
export function moreIsEmpty(schema: ObjectFormSchema, values: ObjectFormValues): boolean {
  return !visibleFields(schema.fields, values).some(
    (field) => isMoreField(field) && hasValue(values[field.name]),
  );
}

/** First field in schema order that has an error. */
export function firstErrorField(
  fields: readonly ObjectFormField[],
  errors: ObjectFormErrors,
): ObjectFormField | undefined {
  return fields.find((field) => errors[field.name] !== undefined);
}

/** Initial focus: the first empty required visible field, else the first visible field. */
export function initialFocusName(
  fields: readonly ObjectFormField[],
  values: ObjectFormValues,
  moreExpanded: boolean,
): string | undefined {
  const visible = visibleFields(fields, values).filter(
    (field) => moreExpanded || !isMoreField(field),
  );
  const emptyRequired = visible.find((field) => field.required && !hasValue(values[field.name]));
  return (emptyRequired ?? visible[0])?.name;
}

/**
 * Drops the error of `name` once validation no longer reports it. Errors are never added on
 * change, only cleared.
 */
export function clearResolvedError(
  errors: ObjectFormErrors,
  name: string,
  validated: ObjectFormErrors,
): ObjectFormErrors {
  if (errors[name] === undefined || validated[name] !== undefined) return errors;
  const { [name]: _cleared, ...rest } = errors;
  return rest;
}

/**
 * Fields with `options` (any kind) whose options have loaded: an unknown pre-filled id is cleared and
 * `defaultFromOptions: 'first'` picks the first option with a value, both only while the field is untouched.
 * Returns the same objects when nothing changes.
 */
export function adjustForOptions(
  fields: readonly ObjectFormField[],
  values: ObjectFormValues,
  initial: ObjectFormValues,
): { values: ObjectFormValues; initial: ObjectFormValues } {
  let changed: { values: Record<string, unknown>; initial: Record<string, unknown> } | null = null;
  for (const field of fields) {
    if (!field.options || field.optionsLoading) continue;
    const current = values[field.name];
    const untouched = JSON.stringify(current) === JSON.stringify(initial[field.name]);
    if (!untouched) continue;
    const known = field.options.some((option) => option.value === current);
    let replacement: string | undefined;
    if (hasValue(current) && !known) {
      replacement = '';
    } else if (field.defaultFromOptions === 'first' && !hasValue(current)) {
      replacement = field.options.find((option) => option.value !== '')?.value;
    }
    if (replacement === undefined || replacement === current) continue;
    changed ??= { values: { ...values }, initial: { ...initial } };
    changed.values[field.name] = replacement;
    changed.initial[field.name] = replacement;
  }
  return changed ?? { values, initial };
}

export interface ServerFieldErrors {
  /** Field names (of the step) the server reported, in report order. */
  readonly fields: readonly string[];
  /** True when some reported path matches no field: show the banner too. */
  readonly unmapped: boolean;
}

/** Reads `details.fields[].path` ('/title' → 'title') of a VALIDATION_ERROR. Never reads messages. */
export function serverFieldErrors(
  details: Record<string, unknown> | undefined,
  fieldNames: readonly string[],
): ServerFieldErrors {
  const raw = details?.fields;
  if (!Array.isArray(raw)) return { fields: [], unmapped: true };
  const fields: string[] = [];
  let unmapped = false;
  for (const entry of raw) {
    const path =
      typeof entry === 'object' && entry !== null ? (entry as { path?: unknown }).path : null;
    const name = typeof path === 'string' ? path.replace(/^\//, '').split('/')[0] : undefined;
    if (name && fieldNames.includes(name)) {
      if (!fields.includes(name)) fields.push(name);
    } else {
      unmapped = true;
    }
  }
  return { fields, unmapped: unmapped || fields.length === 0 };
}
