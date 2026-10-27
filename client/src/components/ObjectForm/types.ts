import type { ReactNode } from 'react';
import type { CreatePrefillKey } from '../../navigation/createQuery.js';

export type ObjectFormValues = Readonly<Record<string, unknown>>;
export type ObjectFormErrors = Readonly<Record<string, string | undefined>>;

export interface ObjectFormOption {
  readonly value: string;
  readonly label: string;
}

export interface ObjectFormResult {
  readonly id: string;
  /** In-app URL of the created object (from routeUrl). */
  readonly href: string;
  /** Display name, used by the Add-another confirmation. */
  readonly label: string;
}

export interface ObjectFormChild {
  readonly schema: ObjectFormSchema;
  readonly prefill?: ObjectFormValues;
  /** Called with the child's result after its Save; the field sets its own value. */
  readonly onCreated: (result: ObjectFormResult) => void;
}

export interface ObjectFormRenderContext {
  /** DOM id (= field name). */
  readonly id: string;
  readonly value: unknown;
  readonly setValue: (value: unknown) => void;
  readonly busy: boolean;
  readonly invalid: boolean;
  /** Hint and error ids for aria-describedby. */
  readonly describedBy: string | undefined;
  /** Opens a child form (create from a picker); the parent's values stay in memory. */
  readonly createChild: (child: ObjectFormChild) => void;
  /** The current values of the whole step, read-only (fields that depend on other fields). */
  readonly values: ObjectFormValues;
  /** Merges several values at once (e.g. a picked document pre-fills fields), optionally announcing it. */
  readonly setValues: (values: ObjectFormValues, announcement?: string) => void;
}

export interface ObjectFormField {
  readonly name: string;
  /** Already translated. */
  readonly label: string;
  readonly kind: 'text' | 'textarea' | 'number' | 'date' | 'url' | 'select' | 'color' | 'custom';
  /** Shown before "More details". */
  readonly essential?: boolean;
  readonly required?: boolean;
  readonly width?: 'half' | 'full';
  /** A text, or a function of the step's values (resolved per render). */
  readonly hint?: string | ((values: ObjectFormValues) => string | undefined);
  /** A field-level problem not caused by the value (e.g. its options failed to load). */
  readonly notice?: string;
  readonly placeholder?: string;
  /** Select options. */
  readonly options?: readonly ObjectFormOption[];
  /** A Skeleton replaces the control while options load. */
  readonly optionsLoading?: boolean;
  /** When options arrive and the value is untouched: 'first' picks the first option. */
  readonly defaultFromOptions?: 'first';
  /** Kept by "Add another". */
  readonly keep?: boolean;
  /** Unused: a schema omits a gated field instead (e.g. the invoice form without Paperless). */
  readonly gate?: 'paperless';
  readonly min?: number;
  /** Number inputs only. */
  readonly step?: number;
  /** Number inputs only. */
  readonly inputMode?: 'decimal' | 'numeric';
  readonly maxLength?: number;
  readonly testId?: string;
  /** The field is rendered only while this returns true; hidden fields take no part in focus, "More details" or errors. */
  readonly visibleWhen?: (values: ObjectFormValues) => boolean;
  /** Custom fields only: render a `fieldset` with a `legend` instead of a `label` (radio groups). */
  readonly group?: boolean;
  /** For kind 'custom'. */
  readonly render?: (ctx: ObjectFormRenderContext) => ReactNode;
}

export interface ObjectFormSchema {
  /** 'task' | 'purchase' | 'milestone' | test ids. */
  readonly id: string;
  /** Translated, e.g. "New task". */
  readonly title: string;
  readonly fields: readonly ObjectFormField[];
  readonly initialValues: ObjectFormValues;
  readonly addAnother?: boolean;
  /** Pre-fill key to field name (D12). */
  readonly prefill?: Partial<Record<CreatePrefillKey, string>>;
  /** Cross-field validation; errors are keyed to a field name and already translated. */
  readonly validate: (values: ObjectFormValues) => ObjectFormErrors;
  readonly submit: (values: ObjectFormValues) => Promise<ObjectFormResult>;
  /**
   * Maps a failed request to field errors (already translated) before the generic handling,
   * e.g. a 409 CONFLICT to a duplicate-name error on a field. Return `null` (or an empty map)
   * to fall through; a non-empty result shows no banner.
   */
  readonly mapError?: (
    code: string,
    values: ObjectFormValues,
    /** The API error's `details`, when it carries any (e.g. a figure for the message). */
    details?: Record<string, unknown>,
  ) => ObjectFormErrors | null;
  /** Text of the Add-another confirmation, e.g. "Task ‘X’ added." */
  readonly addedMessage?: (result: ObjectFormResult) => string;
}
