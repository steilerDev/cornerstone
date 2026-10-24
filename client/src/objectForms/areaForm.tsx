import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { AreaResponse, UpdateAreaRequest } from '@cornerstone/shared';
import { AreaBreadcrumb } from '../components/AreaBreadcrumb/index.js';
import { EntityPicker } from '../components/EntityPicker/EntityPicker.js';
import type {
  ObjectFormErrors,
  ObjectFormSchema,
  ObjectFormValues,
} from '../components/ObjectForm/types.js';
import { createArea, updateArea } from '../lib/areasApi.js';
import { areaPath, siblingNameTaken, subtreeIds } from '../pages/AreasPage/areaTree.js';
import styles from './objectForms.module.css';

export const AREA_NAME_MAX_LENGTH = 200;
export const AREA_DESCRIPTION_MAX_LENGTH = 2000;

const PATH_SEPARATOR = ' › ';

export interface AreaFormOptions {
  readonly mode: 'new' | 'edit';
  /** The area being edited (`mode === 'edit'`). */
  readonly area?: AreaResponse;
  /** Every area, for the picker, the cycle guard and the sibling-name check. */
  readonly areas: readonly AreaResponse[];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parentOf(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** Start values of the form: the preset parent for a new area, every value for an edit. */
export function areaFormPrefill(
  options: Pick<AreaFormOptions, 'mode' | 'area'>,
  presetParentId?: string | null,
): ObjectFormValues {
  if (options.mode === 'edit' && options.area) {
    return {
      name: options.area.name,
      parentId: options.area.parentId ?? '',
      color: options.area.color,
      description: options.area.description ?? '',
    };
  }
  return presetParentId ? { parentId: presetParentId } : {};
}

/**
 * The New / Edit area form. Field names are the API body keys, so server `details.fields[].path`
 * maps onto them.
 */
export function useAreaFormSchema({ mode, area, areas }: AreaFormOptions): ObjectFormSchema {
  const { t } = useTranslation('areas');

  const excludeIds = useMemo(
    () => (mode === 'edit' && area ? [...subtreeIds(areas, area.id)] : []),
    [mode, area, areas],
  );
  const exceptId = mode === 'edit' ? area?.id : undefined;

  const duplicateMessage = (values: ObjectFormValues): string => {
    const name = text(values.name);
    const parentId = parentOf(values.parentId);
    if (parentId === null) return t('index.form.duplicateTop', { name });
    const parent = areaPath(areas, parentId)
      .map((segment) => segment.name)
      .join(PATH_SEPARATOR);
    return t('index.form.duplicate', { name, parent });
  };

  return {
    id: mode === 'edit' ? 'area-edit' : 'area',
    title: mode === 'edit' ? t('index.form.titleEdit') : t('index.form.titleNew'),
    initialValues: { name: '', parentId: '', color: null, description: '' },
    fields: [
      {
        name: 'name',
        label: t('index.form.name'),
        kind: 'text',
        essential: true,
        required: true,
        maxLength: AREA_NAME_MAX_LENGTH,
        testId: 'area-name-input',
      },
      {
        name: 'parentId',
        label: t('index.form.partOf'),
        kind: 'custom',
        essential: true,
        hint: t('index.form.partOfHint'),
        testId: 'area-parent-input',
        render: (ctx) => {
          const value = typeof ctx.value === 'string' ? ctx.value : '';
          const path = value ? areaPath(areas, value) : [];
          return (
            <>
              <EntityPicker
                kind="area"
                id={ctx.id}
                areas={[...areas]}
                value={value}
                onChange={ctx.setValue}
                disabled={ctx.busy}
                noneLabel={t('index.form.topLevel')}
                excludeIds={excludeIds}
                create="off"
              />
              {path.length > 0 && (
                <div className={styles.areaPreview}>
                  <AreaBreadcrumb variant="path" segments={path} />
                </div>
              )}
            </>
          );
        },
      },
      {
        name: 'color',
        label: t('index.form.color'),
        kind: 'color',
        testId: 'area',
      },
      {
        name: 'description',
        label: t('index.form.description'),
        kind: 'textarea',
        maxLength: AREA_DESCRIPTION_MAX_LENGTH,
        testId: 'area-description-input',
      },
    ],
    validate: (values): ObjectFormErrors => {
      const errors: Record<string, string> = {};
      const name = text(values.name);
      if (!name) errors.name = t('index.form.nameRequired');
      else if (siblingNameTaken(areas, name, parentOf(values.parentId), exceptId)) {
        errors.name = duplicateMessage(values);
      }
      return errors;
    },
    mapError: (code, values) => (code === 'CONFLICT' ? { name: duplicateMessage(values) } : null),
    submit: async (values) => {
      const name = text(values.name);
      const parentId = parentOf(values.parentId);
      const color = typeof values.color === 'string' && values.color !== '' ? values.color : null;
      const description = text(values.description) || null;

      if (mode === 'edit' && area) {
        const changes: UpdateAreaRequest = {};
        if (name !== area.name) changes.name = name;
        if (parentId !== area.parentId) changes.parentId = parentId;
        if (color !== area.color) changes.color = color;
        if (description !== area.description) changes.description = description;
        if (Object.keys(changes).length > 0) await updateArea(area.id, changes);
        return { id: area.id, href: routeUrl('areas'), label: name };
      }

      const created = await createArea({ name, parentId, color, description });
      return { id: created.id, href: routeUrl('areas'), label: created.name };
    },
  };
}
