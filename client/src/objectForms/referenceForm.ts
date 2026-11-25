import type { ObjectFormValues } from '../components/ObjectForm/types.js';
import type {
  ReferenceListItem,
  ReferenceListValues,
} from '../components/ReferenceList/ReferenceList.js';

/** Optional fields a reference object has besides its name. */
export type ReferenceExtraField = 'description' | 'color';

export interface ReferenceFormOptions {
  /** Default 'new'. */
  readonly mode?: 'new' | 'edit';
  /** The row being edited (`mode === 'edit'`); `name` is the displayed (possibly translated) name. */
  readonly item?: ReferenceListItem;
  /** Persists a new object; default: the API client. Project setup passes the list's create. */
  readonly create?: (values: ReferenceListValues) => Promise<{ id: string }>;
  /** Persists changed fields only; default: the API client. */
  readonly update?: (id: string, changes: Partial<ReferenceListValues>) => Promise<unknown>;
}

/** Start values of an edit (undefined for a new object). */
export function referenceFormPrefill(
  item: ReferenceListItem | undefined,
  extras: readonly ReferenceExtraField[],
): ObjectFormValues | undefined {
  if (!item) return undefined;
  return {
    name: item.name,
    ...(extras.includes('description') ? { description: item.description ?? '' } : {}),
    ...(extras.includes('color') ? { color: item.color ?? null } : {}),
  };
}

/** Normalised values: trimmed name, empty description to null, '' / non-string color to null. */
export function readReferenceValues(
  values: ObjectFormValues,
  extras: readonly ReferenceExtraField[],
): ReferenceListValues {
  const name = typeof values.name === 'string' ? values.name.trim() : '';
  const description =
    typeof values.description === 'string' ? values.description.trim() || null : null;
  const color = typeof values.color === 'string' && values.color !== '' ? values.color : null;
  return {
    name,
    ...(extras.includes('description') ? { description } : {}),
    ...(extras.includes('color') ? { color } : {}),
  };
}

/**
 * The changed fields of an edit. The name is compared with the displayed name, so saving an
 * unchanged translated built-in sends nothing and keeps its translation key (PLT-101).
 */
export function referenceChanges(
  item: ReferenceListItem,
  next: ReferenceListValues,
  extras: readonly ReferenceExtraField[],
): Partial<ReferenceListValues> {
  const changes: { name?: string; description?: string | null; color?: string | null } = {};
  if (next.name !== item.name) changes.name = next.name;
  if (extras.includes('description') && (next.description ?? null) !== (item.description ?? null)) {
    changes.description = next.description ?? null;
  }
  if (extras.includes('color') && (next.color ?? null) !== (item.color ?? null)) {
    changes.color = next.color ?? null;
  }
  return changes;
}
