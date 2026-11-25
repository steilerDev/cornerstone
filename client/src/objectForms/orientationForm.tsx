import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type {
  ObjectFormErrors,
  ObjectFormSchema,
  ObjectFormValues,
} from '../components/ObjectForm/types.js';
import type { ReferenceListItem } from '../components/ReferenceList/ReferenceList.js';
import { useEntriesLanguage } from '../contexts/HouseNameContext.js';
import { createOrientation, updateOrientation } from '../lib/orientationApi.js';
import { readReferenceValues, referenceChanges, referenceFormPrefill } from './referenceForm.js';
import type { ReferenceExtraField, ReferenceFormOptions } from './referenceForm.js';

export const ORIENTATION_NAME_MAX_LENGTH = 200;
export const ORIENTATION_DESCRIPTION_MAX_LENGTH = 2000;

const EXTRAS: readonly ReferenceExtraField[] = ['description'];

/** Start values of an edit; undefined for a new orientation. */
export function orientationFormPrefill(item?: ReferenceListItem): ObjectFormValues | undefined {
  return referenceFormPrefill(item, EXTRAS);
}

/**
 * The New / Edit orientation form, shared by Project setup and the photo tag picker's inline
 * create. Field names are the API body keys, so server `details.fields[].path` maps onto them.
 */
export function useOrientationFormSchema(options: ReferenceFormOptions = {}): ObjectFormSchema {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const entriesLanguage = useEntriesLanguage() ?? undefined;
  const mode = options.mode ?? 'new';
  const { item } = options;

  return {
    id: mode === 'edit' ? 'orientation-edit' : 'orientation',
    title:
      mode === 'edit'
        ? t('projectSetup.orientations.editItem', { item: t('projectSetup.orientations.item') })
        : t('manage.orientations.form.titleNew'),
    initialValues: { name: '', description: '' },
    fields: [
      {
        name: 'name',
        label: t('manage.orientations.form.name'),
        kind: 'text',
        essential: true,
        required: true,
        autoComplete: 'off',
        lang: entriesLanguage,
        maxLength: ORIENTATION_NAME_MAX_LENGTH,
        ...(mode === 'edit' && item?.translated
          ? { hint: tCommon('referenceList.translatedHint') }
          : {}),
        testId: 'orientation-name-input',
      },
      {
        name: 'description',
        label: t('manage.orientations.form.description'),
        kind: 'textarea',
        lang: entriesLanguage,
        maxLength: ORIENTATION_DESCRIPTION_MAX_LENGTH,
        testId: 'orientation-description-input',
      },
    ],
    validate: (values): ObjectFormErrors => {
      const errors: Record<string, string> = {};
      if (!readReferenceValues(values, EXTRAS).name) {
        errors.name = t('manage.orientations.form.nameRequired');
      }
      return errors;
    },
    mapError: (code) =>
      code === 'CONFLICT' ? { name: t('manage.orientations.form.duplicate') } : null,
    submit: async (values) => {
      const next = readReferenceValues(values, EXTRAS);
      if (mode === 'edit' && item) {
        const changes = referenceChanges(item, next, EXTRAS);
        if (Object.keys(changes).length > 0) {
          await (options.update ?? defaultUpdate)(item.id, changes);
        }
        return { id: item.id, href: routeUrl('settingsManage'), label: next.name };
      }
      const created = await (options.create ?? defaultCreate)(next);
      return { id: created.id, href: routeUrl('settingsManage'), label: next.name };
    },
  };
}

const defaultCreate: NonNullable<ReferenceFormOptions['create']> = (values) =>
  createOrientation({ name: values.name, description: values.description ?? null });

const defaultUpdate: NonNullable<ReferenceFormOptions['update']> = (id, changes) =>
  updateOrientation(id, {
    ...(changes.name !== undefined ? { name: changes.name } : {}),
    ...(changes.description !== undefined ? { description: changes.description } : {}),
  });
